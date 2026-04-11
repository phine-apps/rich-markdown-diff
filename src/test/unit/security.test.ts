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

    const { html: diffHtml } = provider.computeDiff(safeMarkdown, maliciousMarkdown);

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

  it("strips dangerous inline styles but keeps safe KaTeX-related ones", () => {
    const provider = new MarkdownDiffProvider();
    const oldMarkdown = '<p style="position:fixed;inset:0">Hello</p>';
    const newMarkdown = "<p>Hello</p>";

    const { html: diffHtml } = provider.computeDiff(oldMarkdown, newMarkdown);

    assert.strictEqual(
      diffHtml.includes("position:fixed"),
      false,
      "dangerous position:fixed should be removed",
    );
    assert.strictEqual(
      diffHtml.includes("inset"),
      false,
      "non-whitelisted CSS property 'inset' should be removed",
    );
  });

  it("XSS in Filenames (Labels)", () => {
    const provider = new MarkdownDiffProvider();
    const maliciousLabel = '"><script>alert(1)</script>';
    const safeContent = "# Test";

    const { html: diffHtml } = provider.computeDiff(safeContent, safeContent);
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

  it("uses nonce-based styles and strict Mermaid rendering in the webview", () => {
    const provider = new MarkdownDiffProvider();
    const { html: diffHtml } = provider.computeDiff(
      "```mermaid\ngraph TD;\nA-->B;\n```",
      "```mermaid\ngraph TD;\nA-->B;\n```",
    );
    const webviewContent = provider.getWebviewContent(
      diffHtml,
      "katex.css",
      "mermaid.js",
      "hljs-light.css",
      "hljs-dark.css",
    );

    assert.strictEqual(
      /<style nonce="[^"]+">/.test(webviewContent),
      true,
      "inline styles should be protected with a nonce",
    );
    // style-src-elem uses nonce for <style> elements;
    // style-src-attr uses 'unsafe-inline' for KaTeX inline style attributes
    assert.match(
      webviewContent,
      /style-src-elem[^;]*'nonce-[^']+'/,
      "CSP style-src-elem should include a nonce for <style> blocks",
    );
    assert.match(
      webviewContent,
      /style-src-attr\s+'unsafe-inline'/,
      "CSP style-src-attr should allow inline style attributes for KaTeX",
    );
    assert.strictEqual(
      webviewContent.includes("el.innerHTML = original"),
      false,
      "Mermaid source should not be restored via innerHTML",
    );
    assert.strictEqual(
      webviewContent.includes("el.textContent = original"),
      true,
      "Mermaid source should be restored as text",
    );
    assert.strictEqual(
      webviewContent.includes("securityLevel: 'strict'"),
      true,
      "Mermaid should be initialized in strict security mode",
    );
  });
});
