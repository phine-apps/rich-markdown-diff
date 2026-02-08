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

import * as assert from "assert";
import { MarkdownDiffProvider } from "../../markdownDiff";

describe("Security Tests", () => {
  it("XSS in Markdown Content", () => {
    const provider = new MarkdownDiffProvider();
    const maliciousMarkdown = `
# Hello
<img src=x onerror=alert(1)>
[Click me](javascript:alert(1))
    `;
    const safeMarkdown = "# Hello";

    const diffHtml = provider.computeDiff(safeMarkdown, maliciousMarkdown);

    // Verify sanitization
    assert.strictEqual(
      diffHtml.includes("onerror"),
      false,
      "onerror attribute should be removed",
    );
    assert.strictEqual(
      diffHtml.includes('href="javascript:alert'),
      false,
      "javascript: scheme should be removed from href attributes",
    );
  });

  it("XSS in Filenames (Labels)", () => {
    const provider = new MarkdownDiffProvider();
    const maliciousLabel = '"><script>alert(1)</script>';
    const safeContent = "# Test";

    const diffHtml = provider.computeDiff(safeContent, safeContent);
    const webviewContent = provider.getWebviewContent(
      diffHtml,
      "katex.css",
      "mermaid.js",
      "hljs-light.css",
      "hljs-dark.css",
      maliciousLabel,
      "Modified",
    );

    // Verify label escaping
    assert.strictEqual(
      webviewContent.includes("<script>alert(1)</script>"),
      false,
      "Webview content should not contain unescaped script tag from label",
    );
    assert.strictEqual(
      webviewContent.includes("&lt;script&gt;alert(1)&lt;/script&gt;"),
      true,
      "Webview content should contain escaped label",
    );
  });
});
