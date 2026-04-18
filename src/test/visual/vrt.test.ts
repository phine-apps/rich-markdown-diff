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
    // Standard viewport, using fullPage: true for auto-scaling screenshots
    await page.setViewportSize({ width: 1280, height: 800 });
  });

  const cases = [
    { name: "comprehensive", v1: "comprehensive_v1.md", v2: "comprehensive_v2.md" },
    { name: "marp", v1: "marp_v1.md", v2: "marp_v2.md" },
    { name: "marp-advanced", v1: "marp_v2.md", v2: "marp_v3.md" },
  ];

  for (const c of cases) {
    test(`Visual Diff: ${c.name} - Split Light`, async ({ page }) => {
      const v1 = fs.readFileSync(path.join(FIXTURES_DIR, c.v1), "utf-8");
      const v2 = fs.readFileSync(path.join(FIXTURES_DIR, c.v2), "utf-8");

      const html = await generateVRTHtml(provider, v1, v2, {
        theme: "light",
        inline: false,
      });
      await page.emulateMedia({ colorScheme: "light" });
      await page.setContent(html, { waitUntil: "load" });

      // Wait for KaTeX/fonts
      // @ts-ignore
      await page.evaluate(() =>
        Promise.race([
          document.fonts.ready,
          new Promise((r) => setTimeout(r, 2000)),
        ]),
      );
      const katexCount = await page.locator(".katex").count();
      if (katexCount > 0) {
        await page.waitForSelector(".katex", { state: "visible" });
      }

      if (c.name.includes("marp")) {
        // Remove signal dependency to unblock update-snapshots
        await page.waitForTimeout(2000);
      }

      await expect(page).toHaveScreenshot(`${c.name}-split-light.png`, { 
        maxDiffPixelRatio: 0.1,
        fullPage: true 
      });
    });

    test(`Visual Diff: ${c.name} - Split Dark`, async ({ page }) => {
      const v1 = fs.readFileSync(path.join(FIXTURES_DIR, c.v1), "utf-8");
      const v2 = fs.readFileSync(path.join(FIXTURES_DIR, c.v2), "utf-8");

      const html = await generateVRTHtml(provider, v1, v2, {
        theme: "dark",
        inline: false,
      });
      await page.emulateMedia({ colorScheme: "dark" });
      await page.setContent(html, { waitUntil: "load" });

      // @ts-ignore
      await page.evaluate(() =>
        Promise.race([
          document.fonts.ready,
          new Promise((r) => setTimeout(r, 2000)),
        ]),
      );

      if (c.name.includes("marp")) {
        // Remove signal dependency to unblock update-snapshots
        await page.waitForTimeout(2000);
      }

      await expect(page).toHaveScreenshot(`${c.name}-split-dark.png`, { 
        maxDiffPixelRatio: 0.1,
        fullPage: true 
      });
    });

    test(`Visual Diff: ${c.name} - Inline Light`, async ({ page }) => {
      const v1 = fs.readFileSync(path.join(FIXTURES_DIR, c.v1), "utf-8");
      const v2 = fs.readFileSync(path.join(FIXTURES_DIR, c.v2), "utf-8");

      const html = await generateVRTHtml(provider, v1, v2, {
        theme: "light",
        inline: true,
      });
      await page.emulateMedia({ colorScheme: "light" });
      await page.setContent(html, { waitUntil: "load" });

      // @ts-ignore
      await page.evaluate(() =>
        Promise.race([
          document.fonts.ready,
          new Promise((r) => setTimeout(r, 2000)),
        ]),
      );

      if (c.name.includes("marp")) {
        // Remove signal dependency to unblock update-snapshots
        await page.waitForTimeout(2000);
      }

      await expect(page).toHaveScreenshot(`${c.name}-inline-light.png`, { 
        maxDiffPixelRatio: 0.1,
        fullPage: true 
      });
    });

    test(`Visual Diff: ${c.name} - Inline Dark`, async ({ page }) => {
      const v1 = fs.readFileSync(path.join(FIXTURES_DIR, c.v1), "utf-8");
      const v2 = fs.readFileSync(path.join(FIXTURES_DIR, c.v2), "utf-8");

      const html = await generateVRTHtml(provider, v1, v2, {
        theme: "dark",
        inline: true,
      });
      await page.emulateMedia({ colorScheme: "dark" });
      await page.setContent(html, { waitUntil: "load" });

      // @ts-ignore
      await page.evaluate(() =>
        Promise.race([
          document.fonts.ready,
          new Promise((r) => setTimeout(r, 2000)),
        ]),
      );

      if (c.name.includes("marp")) {
        // Remove signal dependency to unblock update-snapshots
        await page.waitForTimeout(2000);
      }

      await expect(page).toHaveScreenshot(`${c.name}-inline-dark.png`, { 
        maxDiffPixelRatio: 0.1,
        fullPage: true 
      });
    });
  }
});
