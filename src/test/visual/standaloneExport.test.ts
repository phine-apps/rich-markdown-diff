/*
 * MIT License
 *
 * Copyright (c) 2026 Rich Markdown Diff Authors
 */

import { expect, test } from "@playwright/test";
import { prepareExportHtml } from "../../exportHtml";
import { MarkdownDiffProvider } from "../../markdownDiff";

test.describe("Standalone Export HTML Browser Execution", () => {
  let provider: MarkdownDiffProvider;

  test.beforeAll(async () => {
    provider = new MarkdownDiffProvider();
    await provider.waitForReady();
  });

  test("should render exported standalone HTML without JS runtime errors in browser", async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];

    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });
    page.on("pageerror", (err) => {
      pageErrors.push(err.message);
    });

    const oldMd = `
# Title
\`\`\`javascript
const x = 1;
\`\`\`
Math: $E = mc^2$
| Header 1 | Header 2 |
| -------- | -------- |
| Value A  | Value B  |
`;

    const newMd = `
# Title (Updated)
\`\`\`javascript
const x = 2;
const y = 3;
\`\`\`
Math: $E = mc^2 + \\Delta$
| Header 1 | Header 2 |
| -------- | -------- |
| Value A  | Value C  |
`;

    const { html: diffHtml } = provider.computeDiff(oldMd, newMd);
    const webviewHtml = provider.getWebviewContent(
      diffHtml,
      "https://file+.vscode-resource.vscode-cdn.net/media/katex/katex.min.css",
      "https://file+.vscode-resource.vscode-cdn.net/media/mermaid.min.js",
      "https://file+.vscode-resource.vscode-cdn.net/media/highlight/github.min.css",
      "https://file+.vscode-resource.vscode-cdn.net/media/highlight/github-dark.min.css",
      "Old Version",
      "New Version",
    );

    // Prepare standalone exported HTML
    const exportedHtml = await prepareExportHtml(webviewHtml);

    // Load exported HTML into real Chromium browser
    await page.setContent(exportedHtml, { waitUntil: "domcontentloaded" });

    // Allow time for client-side scripts to run
    await page.waitForTimeout(1000);

    // Verify DOM structure and components
    await expect(page.locator("body")).toBeVisible();
    await expect(page.locator(".container")).toBeVisible();

    // Verify diff tags exist
    const insCount = await page.locator("ins").count();
    expect(insCount).toBeGreaterThan(0);

    // Verify no runtime JS errors occurred
    expect(pageErrors).toEqual([]);
    const fatalErrors = consoleErrors.filter(
      (e) => !e.includes("Failed to load resource") && !e.includes("net::ERR_"),
    );
    expect(fatalErrors).toEqual([]);
  });
});
