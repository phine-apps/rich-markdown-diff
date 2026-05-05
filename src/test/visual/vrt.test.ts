/*
 * MIT License
 *
 * Copyright (c) 2026 Rich Markdown Diff Authors
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

import { expect, test } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";
import { MarkdownDiffProvider } from "../../markdownDiff";
import { generateVRTHtml } from "./vrtUtils";

test.describe("Visual Regression Tests", () => {
  let provider: MarkdownDiffProvider;

  test.beforeAll(async () => {
    provider = new MarkdownDiffProvider();
    await provider.waitForReady();
  });

  const cases = [
    // Self-diff smoke tests (ensure rendering stability)
    { name: "comprehensive-v1", v1: "comprehensive_v1", v2: "comprehensive_v1", theme: "light", inline: false, suffix: "split-light" },
    { name: "comprehensive-v1", v1: "comprehensive_v1", v2: "comprehensive_v1", theme: "dark", inline: true, suffix: "inline-dark" },
    { name: "marp-v1", v1: "marp_v1", v2: "marp_v1", theme: "dark", inline: false, suffix: "split-dark" },
    { name: "marp-v1", v1: "marp_v1", v2: "marp_v1", theme: "light", inline: true, suffix: "inline-light" },
    { name: "marp-v3", v1: "marp_v3", v2: "marp_v3", theme: "light", inline: false, suffix: "split-light" },
    { name: "marp-v3", v1: "marp_v3", v2: "marp_v3", theme: "dark", inline: true, suffix: "inline-dark" },
    
    // Actual diff tests (ensure diff logic correctness)
    { name: "marp-v1-v2", v1: "marp_v1", v2: "marp_v2", theme: "dark", inline: false, suffix: "split-dark" },
    { name: "comprehensive-v1-v2", v1: "comprehensive_v1", v2: "comprehensive_v2", theme: "light", inline: false, suffix: "split-light" }
  ];

  for (const c of cases) {
    test(`Visual Diff: ${c.name} - ${c.suffix}`, async ({ page }) => {
      const v1Path = path.join(__dirname, "../../../fixtures", `${c.v1}.md`);
      const v2Path = path.join(__dirname, "../../../fixtures", `${c.v2}.md`);
      const md1 = fs.readFileSync(v1Path, "utf-8");
      const md2 = fs.readFileSync(v2Path, "utf-8");
      
      const html = await generateVRTHtml(provider, md1, md2, {
        theme: c.theme as any,
        inline: c.inline,
      });

      await page.setContent(html);
      await page.waitForTimeout(5000);

      // Systemic check: Save the rendered HTML to a file for objective inspection
      const htmlDumpPath = path.join(__dirname, `../../../test-results/${c.name}-${c.suffix}.html`);
      const renderedHtml = await page.content();
      fs.writeFileSync(htmlDumpPath, renderedHtml);

      // Systemic check: Assert that critical content is not missing
      if (c.name === "marp-v1-v2") {
        const textToFind = "Rich Marp Presentation v2 (Updated)";
        const isPresent = await page.evaluate((text) => document.body.innerText.includes(text), textToFind);
        if (!isPresent) {
          throw new Error(`CRITICAL REGRESSION: Content "${textToFind}" is missing from the rendered output!`);
        }
      }

      await expect(page).toHaveScreenshot(`${c.name}-${c.suffix}.png`, {
        maxDiffPixelRatio: 0.1,
        fullPage: true,
        timeout: 30000,
      });

      // Verification of markers for Marp
      if (c.name === "marp-v1-v2") {
        const markerCount = await page.locator('.overview-marker').count();
        // Expect at least 12 markers (Frontmatter table rows + Marp slide changes)
        if (markerCount < 10) {
            throw new Error(`REGRESSION: Expected at least 12 overview markers, but found only ${markerCount}. Marp slide changes might be missing!`);
        }
        
        // Granular check: Ensure changes INSIDE Marp slides are recognized
        const marpChangeCount = await page.evaluate(() => {
            const marpContent = document.querySelector('.marp');
            if (!marpContent) {
                return 0;
            }
            return marpContent.querySelectorAll('ins, del').length;
        });
        
        if (marpChangeCount === 0) {
            throw new Error(`REGRESSION: No diff tags (ins/del) found inside Marp slides!`);
        }
      }
    });
  }
});
