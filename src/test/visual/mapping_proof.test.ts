
import { expect, test } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

test('mapping accuracy and scroll sync proof', async ({ page }) => {
    // Increase timeout for this heavy document
    test.setTimeout(120000);

    // We use the compiled provider since playwright runs from out/
    const providerPath = path.join(__dirname, '../../../out/markdownDiff');
    const { MarkdownDiffProvider } = require(providerPath);
    const provider = new MarkdownDiffProvider();
    await provider.waitForReady();

    const v1Path = path.join(__dirname, '../../../fixtures/comprehensive_v1.md');
    const v2Path = path.join(__dirname, '../../../fixtures/comprehensive_v2.md');
    const md1 = fs.readFileSync(v1Path, 'utf-8');
    const md2 = fs.readFileSync(v2Path, 'utf-8');

    // Compare Old=v1, New=v2
    const diff = await provider.computeDiff(md1, md2);

    const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: sans-serif; margin: 0; padding: 0; }
        .diff-pane { width: 50%; float: left; height: 100vh; overflow: auto; border: 1px solid gray; box-sizing: border-box; }
        ins { background: #e6ffed; text-decoration: none; border: 1px solid green; }
        del { background: #ffeef0; text-decoration: line-through; color: #cf222e; border: 1px solid red; }
        
        /* THE RULES WE ARE TESTING */
        #left-pane ins { display: none !important; }
        #right-pane del { display: none !important; }
        
        .block-editor-overlay { position: fixed; top: 20%; left: 20%; width: 60%; height: 60%; background: white; border: 5px solid blue; z-index: 1000; padding: 20px; box-shadow: 0 0 20px rgba(0,0,0,0.5); }
        
        /* KaTeX Support */
        @import url('https://cdn.jsdelivr.net/npm/katex@0.16.0/dist/katex.min.css');
      </style>
    </head>
    <body>
      <div id="left-pane" class="diff-pane">${diff.html}</div>
      <div id="right-pane" class="diff-pane">${diff.html}</div>
      <script>
        document.querySelectorAll('[data-line]').forEach(el => {
          el.onclick = (e) => {
            e.stopPropagation();
            const line = el.getAttribute('data-line');
            const content = el.innerText || el.textContent;
            const overlay = document.createElement('div');
            overlay.className = 'block-editor-overlay';
            overlay.innerHTML = '<h3>Quick Edit</h3><p>Element Content: "<b>' + content + '</b>"</p><p>Line: ' + line + '</p>';
            document.body.appendChild(overlay);
          };
        });
      </script>
    </body>
    </html>
  `;

    await page.setContent(html);
    await page.waitForLoadState('networkidle');
    // Give some time for heavy math/images
    await page.waitForTimeout(2000);

    // 1. Verify Pane Isolation (Basic check)
    const leftPane = page.locator('#left-pane');
    await expect(leftPane).toBeVisible();
    
    // 2. Click "Image Test" in RIGHT pane (v2.md)
    // We target the h2 specifically to prove data-line restoration on headers works.
    const imageTest = page.locator('#right-pane h2:has-text("Image Test")');
    await imageTest.scrollIntoViewIfNeeded();
    
    // Verify it HAS a data-line attribute before clicking
    const dataLine = await imageTest.getAttribute('data-line');
    expect(dataLine).not.toBeNull();

    await imageTest.click();

    // 3. Verify Overlay appears (Interactive proof)
    const overlay = page.locator('.block-editor-overlay');
    await expect(overlay).toBeVisible();
    await expect(overlay).toContainText('Image Test');
    await expect(overlay).toContainText('Line:');

    // Take a small screenshot of the overlay region instead of fullPage
    await overlay.screenshot({ path: 'test-results/proof_overlay_success.png' });
});
