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

    const { html: diffHtml } = provider.computeDiff(
      safeMarkdown,
      maliciousMarkdown,
    );

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

  it("rejects url() inside CSS variables to prevent CSS exfiltration bypass (ADV-04)", () => {
    const provider = new MarkdownDiffProvider();
    const maliciousHtml = '<div style="--background: url(https://example.invalid/exfil-token-leak); --theme: url(https://example.invalid/exfil-theme); background-image: var(--background);">leak</div>';
    const { html: diffHtml } = provider.computeDiff("", maliciousHtml);

    assert.strictEqual(
      diffHtml.includes("exfil-token-leak"),
      false,
      "url() in --background must be stripped by sanitizeHtml",
    );
    assert.strictEqual(
      diffHtml.includes("exfil-theme"),
      false,
      "url() in --theme must be stripped by sanitizeHtml",
    );
    assert.strictEqual(
      diffHtml.includes("--background:"),
      false,
      "--background property containing url() must be stripped",
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
      /style-src-elem[^;]*'unsafe-inline'/,
      "CSP style-src-elem should allow 'unsafe-inline' for Mermaid's dynamic styles",
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
      webviewContent.includes(
        "const renderMermaidDiagrams = async (container = document) =>",
      ),
      true,
      "Mermaid diagrams should be rendered through the explicit render helper",
    );
    assert.strictEqual(
      webviewContent.includes(
        "mermaid.render('rich-markdown-diff-mermaid-' + Date.now() + '-' + index, original)",
      ),
      true,
      "Mermaid source should be passed to Mermaid's renderer instead of injected directly into the DOM",
    );
    assert.match(
      webviewContent,
      /const mermaidStyleNonce = '[0-9a-f]+';/,
      "The webview should pass its CSP nonce into the Mermaid SVG insertion helper",
    );
    assert.strictEqual(
      webviewContent.includes(
        "styleEl.setAttribute('nonce', mermaidStyleNonce);",
      ),
      true,
      "Mermaid SVG <style> elements should be nonced before insertion so themed rendering survives CSP",
    );
    assert.strictEqual(
      webviewContent.includes("el.innerHTML = result.svg"),
      false,
      "Mermaid SVG markup should not be inserted directly without first applying the CSP nonce to generated styles",
    );
    assert.strictEqual(
      webviewContent.includes("securityLevel: 'strict'"),
      true,
      "Mermaid should be initialized in strict security mode",
    );
  });

  it("XSS in Frontmatter Values", () => {
    const provider = new MarkdownDiffProvider();
    const oldMarkdown = "---\ntitle: <script>alert('old')</script>\n---\nContent";
    const newMarkdown = "---\ntitle: <script>alert('new')</script>\n---\nContent";

    const { html: diffHtml } = provider.computeDiff(oldMarkdown, newMarkdown);

    assert.strictEqual(
      diffHtml.includes("<script>alert('old')</script>"),
      false,
      "Frontmatter old value should be escaped and not contain raw script tag",
    );
    assert.strictEqual(
      diffHtml.includes("<script>alert('new')</script>"),
      false,
      "Frontmatter new value should be escaped and not contain raw script tag",
    );
    assert.ok(
      diffHtml.includes("&lt;script&gt;alert(&#039;old&#039;)&lt;/script&gt;") ||
      diffHtml.includes("&lt;script&gt;alert(&#039;new&#039;)&lt;/script&gt;"),
      "Frontmatter values should be properly escaped",
    );
  });

  it("prevents XSS via user-supplied <script> in Marp documents", async () => {
    const provider = new MarkdownDiffProvider();
    await provider.waitForReady();
    const maliciousMarp = `---
marp: true
---
# Slide 1
<script>alert("XSS_ATTACK")</script>
`;
    const diff = provider.computeDiff(maliciousMarp, maliciousMarp);

    // Verify that marpJs does NOT contain the malicious script
    assert.strictEqual(
      diff.marpJs ? diff.marpJs.includes("XSS_ATTACK") : false,
      false,
      "marpJs must not extract or execute user-supplied script tags",
    );

    const webview = provider.getWebviewContent(
      diff.html,
      "",
      "",
      "",
      "",
      "Orig",
      "Mod",
      "",
      {},
      diff.marpCss,
      diff.marpJs,
    );

    assert.strictEqual(
      webview.includes('<script>alert("XSS_ATTACK")</script>'),
      false,
      "Webview content must not contain raw executable user script tags",
    );
    assert.ok(
      webview.includes("&lt;script&gt;alert(&quot;XSS_ATTACK&quot;)&lt;/script&gt;") ||
      webview.includes('&lt;script&gt;alert("XSS_ATTACK")&lt;/script&gt;'),
      "User script in markdown must be safely escaped as inert text",
    );
  });

  it("prevents frontmatter offset collision with body content", async () => {
    const provider = new MarkdownDiffProvider();
    const docWithCollision = `---
title: Test
desc: TargetBodyWord
---
TargetBodyWord
SecondLine`;

    const { html } = provider.computeDiff(docWithCollision, docWithCollision);
    // The markdown body starts at line index 4 (0: ---, 1: title, 2: desc, 3: ---, 4: TargetBodyWord)
    // data-line should be 4, NOT 2 (where desc: TargetBodyWord appeared)
    assert.ok(
      html.includes('data-line="4"'),
      `Expected data-line="4" for body content, but got HTML: ${html}`,
    );
    assert.strictEqual(
      html.includes('data-line="2"'),
      false,
      "data-line must not collide with line index 2 inside frontmatter",
    );
  });
});
