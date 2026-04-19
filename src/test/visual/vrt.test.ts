import { test, expect } from "@playwright/test";
import type { MarkdownDiffProvider as ProviderType } from "../../markdownDiff";
const { MarkdownDiffProvider } = require("../../../out/markdownDiff");
import { generateVRTHtml } from "./vrtUtils";
import * as fs from "fs";
import * as path from "path";

const FIXTURES_DIR = path.join(__dirname, "../../../fixtures");

test.describe("Visual Regression Tests", () => {
  let provider: ProviderType;

  test.beforeAll(async () => {
    provider = new MarkdownDiffProvider();
    await provider.waitForReady();
  });

  test.beforeEach(async ({ page }) => {
    // Standard viewport
    await page.setViewportSize({ width: 1280, height: 800 });
  });

  const cases = [
    {
      name: "comprehensive",
      v1: "comprehensive_v1.md",
      v2: "comprehensive_v2.md",
      configs: [
        { theme: "light", inline: false, suffix: "split-light" },
        { theme: "dark", inline: true, suffix: "inline-dark" },
      ],
    },
    {
      name: "marp",
      v1: "marp_v1.md",
      v2: "marp_v2.md",
      configs: [
        { theme: "dark", inline: false, suffix: "split-dark" },
        { theme: "light", inline: true, suffix: "inline-light" },
      ],
    },
    {
      name: "marp-advanced",
      v1: "marp_v2.md",
      v2: "marp_v3.md",
      configs: [
        { theme: "light", inline: false, suffix: "split-light" },
        { theme: "dark", inline: true, suffix: "inline-dark" },
      ],
    },
  ];

  for (const c of cases) {
    for (const config of c.configs) {
      test(`Visual Diff: ${c.name} - ${config.suffix}`, async ({ page }) => {
        const v1 = fs.readFileSync(path.join(FIXTURES_DIR, c.v1), "utf-8");
        const v2 = fs.readFileSync(path.join(FIXTURES_DIR, c.v2), "utf-8");

        const html = await generateVRTHtml(provider, v1, v2, {
          theme: config.theme as "light" | "dark",
          inline: config.inline,
        });

        await page.emulateMedia({ colorScheme: config.theme as "light" | "dark" });
        await page.setContent(html, { waitUntil: "load" });

        if (c.name.includes("marp")) {
          // Wait for Marp scaling check, but don't fail if it takes a bit
          await page.waitForSelector("body.marp-mode[data-marp-scaled='true']", { timeout: 10000 }).catch(() => {
            console.log("Marp scaling wait timed out (optional)");
          });
        }

        // Final short wait for any transitions/rendering
        await page.waitForTimeout(1000);

        await expect(page).toHaveScreenshot(`${c.name}-${config.suffix}.png`, {
          maxDiffPixelRatio: 0.1,
          fullPage: true,
        });
      });
    }
  }
});
