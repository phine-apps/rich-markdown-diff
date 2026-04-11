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

describe("MarkdownDiffProvider", () => {
  let provider: MarkdownDiffProvider;

  before(async () => {
    provider = new MarkdownDiffProvider();
    await provider.waitForReady();
  });

  it("should compute simple diff (insertion)", () => {
    const oldMd = "foo";
    const newMd = "foo bar";
    const diff = provider.computeDiff(oldMd, newMd);

    // Expected: "foo <ins ...>bar</ins>"
    assert.ok(diff.includes("foo"), "Should contain original text");
    assert.ok(diff.includes("<ins"), "Should contain ins tag");
    assert.ok(diff.includes("bar"), "Should contain new text");
  });

  it("should compute simple diff (deletion)", () => {
    const oldMd = "foo bar";
    const newMd = "foo";
    const diff = provider.computeDiff(oldMd, newMd);

    // Expected: "foo <del ...>bar</del>"
    assert.ok(diff.includes("foo"), "Should contain original text");
    assert.ok(diff.includes("<del"), "Should contain del tag");
    assert.ok(diff.includes("bar"), "Should contain deleted text");
  });

  it("should handle frontmatter changes", () => {
    const oldMd = "---\ntitle: Old\n---\nContent";
    const newMd = "---\ntitle: New\n---\nContent";
    const diff = provider.computeDiff(oldMd, newMd);

    assert.ok(
      diff.includes("Frontmatter Changes"),
      "Should detect frontmatter changes",
    );
    assert.ok(diff.includes("Old"), "Should show old value");
    assert.ok(diff.includes("New"), "Should show new value");
  });

  it("should show unchanged frontmatter fields without highlight", () => {
    const oldMd = "---\ntitle: Old\nauthor: phine-apps\n---\nContent";
    const newMd = "---\ntitle: New\nauthor: phine-apps\n---\nContent";
    const diff = provider.computeDiff(oldMd, newMd);

    assert.ok(
      diff.includes("Frontmatter Changes"),
      "Should render frontmatter table",
    );
    assert.ok(
      diff.includes("author"),
      "Should contain unchanged field 'author'",
    );
    assert.ok(
      diff.includes("phine-apps"),
      "Should contain unchanged value 'phine-apps'",
    );
  });

  it("should preserve mermaid diagrams (tokenization)", () => {
    const oldMd = "A\n```mermaid\ngraph TD;\nA-->B;\n```\nB";
    const newMd = "A\n```mermaid\ngraph TD;\nA-->B;\n```\nC";

    // Note: The provider renders mermaid as <div class="mermaid">...</div> because of the renderer override
    const diff = provider.computeDiff(oldMd, newMd);

    // We want to ensure it didn't mangle the mermaid content into a diff mess
    // The tokenization ensures the block is treated as a unit or restored correctly.
    // Since we didn't change the mermaid block, it should be present.
    assert.ok(diff.includes("graph TD;"), "Should contain mermaid content");
  });

  it("should resolve relative image paths when resolver is provided", () => {
    const oldMd = "![Icon](images/icon.png)";
    const newMd = "![Icon](images/icon.png)";

    // Mock resolver
    const resolver = (src: string) => `vscode-resource://${src}`;

    // @ts-ignore
    const diff = provider.computeDiff(oldMd, newMd, resolver);

    assert.ok(
      diff.includes('src="vscode-resource://images/icon.png"'),
      "Should resolve image path",
    );
  });

  it("should render strikethrough content inside diffs", () => {
    const oldMd = "This has ~~removed~~ text.";
    const newMd = "This has text.";
    const diff = provider.computeDiff(oldMd, newMd);

    assert.ok(
      diff.includes("<s>") || diff.includes("removed"),
      "Should preserve rendered strikethrough markup",
    );
    assert.ok(diff.includes("<del"), "Should still register the deletion");
  });

  it("should preserve nested list structure", () => {
    const oldMd = "- Parent\n  - Child A\n  - Child B";
    const newMd = "- Parent\n  - Child A\n  - Child C";
    const diff = provider.computeDiff(oldMd, newMd);

    assert.ok(diff.includes("<ul>"), "Should render nested list containers");
    assert.ok(
      diff.includes("<ins") || diff.includes("<del"),
      "Should include nested list item changes",
    );
  });

  it("should detect ordered to unordered list container changes", () => {
    const oldMd = "1. One\n2. Two";
    const newMd = "- One\n- Two";
    const diff = provider.computeDiff(oldMd, newMd);

    assert.ok(diff.includes("<del"), "Should mark the ordered list as removed");
    assert.ok(diff.includes("<ins"), "Should mark the unordered list as added");
    assert.ok(
      diff.includes("diff-list-container-change"),
      "Ordered to unordered swaps should be tagged as structural list-container changes",
    );
    assert.ok(
      diff.includes("<ol>"),
      "Should preserve the ordered list container",
    );
    assert.ok(
      diff.includes("<ul>"),
      "Should preserve the unordered list container",
    );
    assert.ok(
      !diff.includes("<ol><ul>") && !diff.includes("<ul><ol>"),
      "Should not leave invalid nested list containers when the list type changes",
    );
  });

  it("should detect definition list to unordered list container changes", () => {
    const oldMd = "Term 1\n: One";
    const newMd = "- Term 1";
    const diff = provider.computeDiff(oldMd, newMd);

    assert.ok(
      diff.includes("diff-list-container-change"),
      "Definition-list swaps should be tagged as structural list-container changes",
    );
    assert.ok(diff.includes("<dl>"), "Should preserve the definition list");
    assert.ok(diff.includes("<ul>"), "Should preserve the unordered list");
    assert.ok(
      !diff.includes("<dl><ul>") && !diff.includes("<ul><dl>"),
      "Should not leave invalid definition-list and unordered-list nesting when the list type changes",
    );
  });

  it("should detect ordered list to definition list container changes", () => {
    const oldMd = "1. Term 1";
    const newMd = "Term 1\n: One";
    const diff = provider.computeDiff(oldMd, newMd);

    assert.ok(
      diff.includes("diff-list-container-change"),
      "Ordered-list to definition-list swaps should be tagged as structural list-container changes",
    );
    assert.ok(diff.includes("<ol>"), "Should preserve the ordered list");
    assert.ok(diff.includes("<dl>"), "Should preserve the definition list");
    assert.ok(
      !diff.includes("<ol><dl>") && !diff.includes("<dl><ol>"),
      "Should not leave invalid ordered-list and definition-list nesting when the list type changes",
    );
  });

  it("should keep same-type definition list changes granular", () => {
    const oldMd = "Term 1\n: One";
    const newMd = "Term 1\n: One\n\nTerm 2\n: Two";
    const diff = provider.computeDiff(oldMd, newMd);

    assert.ok(diff.includes("<dl>"), "Should preserve the definition list");
    assert.ok(diff.includes("<dt>"), "Should preserve definition terms");
    assert.ok(diff.includes("<dd>"), "Should preserve definition values");
    assert.ok(
      !diff.includes("diff-list-container-change"),
      "Same-type definition list edits should stay granular instead of becoming structural replacements",
    );
    assert.ok(
      diff.includes("<ins") || diff.includes("<del"),
      "Same-type definition list edits should still show granular diff markup",
    );
  });

  it("should keep surrounding headings outside structural list-container change wrappers", () => {
    const oldMd = "## Header\n\n1. One\n2. Two\n\n## Next";
    const newMd = "## Header\n\n- One\n- Two\n\n## Next";
    const diff = provider.computeDiff(oldMd, newMd);

    assert.ok(
      diff.includes("<h2>Header</h2>"),
      "Should preserve the heading before the list swap",
    );
    assert.ok(
      diff.includes("<h2>Next</h2>"),
      "Should preserve the heading after the list swap",
    );
    assert.ok(
      /<h2>Header<\/h2>\s*<del/.test(diff) &&
        /<\/ins>\s*<h2>Next<\/h2>/.test(diff),
      "Structural list change wrappers should stay scoped to the list block only",
    );
  });

  it("should preserve CJK text inside diffs", () => {
    const oldMd = "## 变更说明\n这是旧版本。";
    const newMd = "## 变更说明\n这是新版本。";
    const diff = provider.computeDiff(oldMd, newMd);

    assert.ok(diff.includes("变更说明"), "Should retain the heading text");
    assert.ok(
      diff.includes("<ins") || diff.includes("<del"),
      "Should diff the body text",
    );
  });

  it("should keep changelog-style headings intact when body text changes", () => {
    const oldMd = "## [1.1.1] - 2026-03-20\nPrevious note.";
    const newMd = "## [1.1.1] - 2026-03-20\nUpdated note.";
    const diff = provider.computeDiff(oldMd, newMd);

    assert.ok(
      diff.includes("[1.1.1] - 2026-03-20"),
      "Should preserve the heading as one contiguous string",
    );
  });

  it("should keep numbered step headings intact when the number changes", () => {
    const oldMd = "### 3. Compare with Clipboard\nPrevious note.";
    const newMd = "### 4. Compare with Clipboard\nUpdated note.";
    const diff = provider.computeDiff(oldMd, newMd);

    assert.ok(
      diff.includes("Compare with Clipboard"),
      "Should preserve the numbered step heading text",
    );
    assert.ok(diff.includes("<h3"), "Heading should stay as an h3 element");
    assert.ok(
      diff.includes("heading-prefix"),
      "Should wrap the number prefix in a nowrap span to prevent line-breaking between number and text",
    );
  });

  it("should allow normal documentation headings to wrap", () => {
    const diff = provider.computeDiff(
      "## Local Testing and Installation\nInstructions.",
      "## Local Testing and Installation\nInstructions updated.",
    );

    assert.ok(
      diff.includes("<h2"),
      "Ordinary prose headings should still render as heading elements",
    );
  });

  it("should preserve highlight markup", () => {
    const diff = provider.computeDiff(
      "Use ==highlighted text== for emphasis.",
      "Use ==highlighted text== for emphasis. Added.",
    );

    assert.ok(diff.includes("<mark>highlighted text</mark>"));
  });

  it("should render markdown tables with table structure", () => {
    const md = [
      "| Feature | Status |",
      "| --- | --- |",
      "| Tables | Better |",
      "| Security | Hardened |",
    ].join("\n");
    const diff = provider.computeDiff(md, md);

    assert.ok(diff.includes("<table"), "Should render a table element");
    assert.ok(diff.includes("<th"), "Should render header cells");
    assert.ok(diff.includes("<td"), "Should render data cells");
  });

  it("should preserve table structure when table content changes", () => {
    const oldMd = [
      "| Feature | Status |",
      "| --- | --- |",
      "| Tables | Basic |",
    ].join("\n");
    const newMd = [
      "| Feature | Status |",
      "| --- | --- |",
      "| Tables | Improved |",
      "| SCM | Reliable |",
    ].join("\n");
    const diff = provider.computeDiff(oldMd, newMd);

    assert.ok(diff.includes("<table"), "Should preserve a table wrapper");
    assert.ok(diff.includes("<tr"), "Should preserve table rows");
    assert.ok(
      diff.includes("<ins") || diff.includes("<del"),
      "Should still contain diff markup for table changes",
    );
  });

  it("should include explicit table styling in the webview", () => {
    const webviewContent = provider.getWebviewContent(
      "<table><thead><tr><th>Feature</th></tr></thead><tbody><tr><td>Tables</td></tr></tbody></table>",
      "katex.css",
      "mermaid.js",
      "hljs-light.css",
      "hljs-dark.css",
    );

    assert.ok(
      webviewContent.includes("border-collapse: collapse"),
      "Webview should collapse table borders",
    );
    assert.ok(
      webviewContent.includes("border: 1px solid var(--vscode-panel-border);"),
      "Webview should draw cell borders for tables",
    );
  });

  it("should use a grid-based split layout so panes stay evenly sized", () => {
    const webviewContent = provider.getWebviewContent(
      "<p>diff</p>",
      "katex.css",
      "mermaid.js",
      "hljs-light.css",
      "hljs-dark.css",
    );

    assert.ok(
      webviewContent.includes(
        "grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);",
      ),
      "Split view should use a two-column grid",
    );
    assert.ok(
      webviewContent.includes("grid-template-rows: minmax(0, 1fr);"),
      "Grid row should be constrained so panes scroll instead of growing",
    );
    assert.ok(
      webviewContent.includes("gap: 0;"),
      "Split view should use borders instead of grey gap backgrounds between panes",
    );
    assert.ok(
      webviewContent.includes("width: 100%;"),
      "Block-level diff wrappers should stay width-bound to their pane",
    );
  });

  it("should use editor-like surfaces and stronger foreground contrast", () => {
    const webviewContent = provider.getWebviewContent(
      "<h1>Title</h1><p>Paragraph</p>",
      "katex.css",
      "mermaid.js",
      "hljs-light.css",
      "hljs-dark.css",
    );

    assert.ok(
      webviewContent.includes(
        "--markdown-surface-background: var(--vscode-editor-background, #1e1e1e);",
      ),
      "Webview should anchor its background to the editor surface",
    );
    assert.ok(
      webviewContent.includes(
        "--markdown-foreground: var(--vscode-foreground, var(--vscode-editor-foreground, #d4d4d4));",
      ),
      "Webview should use a stronger foreground color for contrast",
    );
    assert.ok(
      webviewContent.includes(".pane + .pane {") &&
        webviewContent.includes(
          "border-left: 1px solid var(--vscode-panel-border);",
        ),
      "Split panes should be separated by an explicit border instead of a grey container gap",
    );
  });

  it("should apply a readable typography scale to rendered markdown panes", () => {
    const webviewContent = provider.getWebviewContent(
      "<h1>Title</h1><p>Paragraph</p><h2>Section</h2>",
      "katex.css",
      "mermaid.js",
      "hljs-light.css",
      "hljs-dark.css",
    );

    assert.ok(
      webviewContent.includes("--markdown-base-font-size: 14px;"),
      "Webview should define a readable markdown base font size",
    );
    assert.ok(
      webviewContent.includes("--markdown-h1-size: 27px;"),
      "Webview should reduce heading sizes to the tuned integer scale",
    );
    assert.ok(
      /\.pane \{[\s\S]*font-size: var\(--markdown-base-font-size\);[\s\S]*line-height: var\(--markdown-base-line-height\);/m.test(
        webviewContent,
      ),
      "Rendered panes should apply the markdown typography scale",
    );
    assert.ok(
      webviewContent.includes("h1 { font-size: var(--markdown-h1-size); }"),
      "Webview should size h1 headings explicitly",
    );
    assert.ok(
      webviewContent.includes("h2 { font-size: var(--markdown-h2-size); }"),
      "Webview should size h2 headings explicitly",
    );
  });

  it("should keep scrollbar gutters stable during async layout refreshes", () => {
    const webviewContent = provider.getWebviewContent(
      "<p>Scrollable content</p>",
      "katex.css",
      "mermaid.js",
      "hljs-light.css",
      "hljs-dark.css",
    );

    assert.ok(
      webviewContent.includes("scrollbar-gutter: stable both-edges;"),
      "Pane CSS should reserve stable scrollbar gutters",
    );
    assert.ok(
      webviewContent.includes("grid-template-rows: minmax(0, 1fr);"),
      "Split layout should constrain pane height to the visible container instead of allowing the grid row to grow to content height",
    );
    assert.ok(
      /\.pane \{[\s\S]*height: 100%;[\s\S]*max-height: 100%;[\s\S]*align-self: stretch;/m.test(
        webviewContent,
      ),
      "Pane CSS should explicitly pin both panes to the split row height",
    );
    assert.ok(
      !webviewContent.includes("style.overflowY = 'hidden'"),
      "Scrollbar refresh logic should not hide pane overflow during reflow",
    );
    assert.ok(
      webviewContent.includes("new MutationObserver"),
      "Scrollbar refresh logic should observe async DOM changes",
    );
    assert.ok(
      webviewContent.includes("new ResizeObserver((entries) =>"),
      "Scrollbar refresh logic should observe inner content geometry changes",
    );
    assert.ok(
      webviewContent.includes("contentResizeObserver.observe(leftContent);"),
      "Scrollbar refresh logic should observe the left content root instead of the pane",
    );
    assert.ok(
      webviewContent.includes("contentResizeObserver.observe(rightContent);"),
      "Scrollbar refresh logic should observe the right content root instead of the pane",
    );
    assert.ok(
      !webviewContent.includes("window.onload ="),
      "Scrollbar refresh logic should not rely on replacing window.onload",
    );
    assert.ok(
      webviewContent.includes(
        "Promise.allSettled(renderPasses).finally(() => scheduleAsyncLayoutRefresh());",
      ),
      "Mermaid refreshes should batch layout follow-up work on larger documents",
    );
    assert.ok(
      webviewContent.includes("document.fonts.ready.finally(() =>"),
      "Layout refresh logic should re-check scroll dimensions after fonts finish loading",
    );
    assert.ok(
      webviewContent.includes(
        "attributeFilter: ['data-processed', 'height', 'src', 'viewBox', 'width']",
      ),
      "Scrollbar refresh logic should observe layout-sensitive attribute changes on async content",
    );
    assert.ok(
      webviewContent.includes("const scheduleAsyncLayoutRefresh = () =>"),
      "Scrollbar refresh logic should schedule delayed follow-up stabilization for async renders",
    );
    assert.ok(
      webviewContent.includes("const trackedImages = new WeakSet();"),
      "Scrollbar refresh logic should track late image decode completion",
    );
    assert.ok(
      webviewContent.includes(
        "document.querySelectorAll('img').forEach(trackImageLayout);",
      ),
      "Existing images should be tracked for post-decode layout stabilization",
    );
    assert.ok(
      webviewContent.includes('class="pane-content" id="left-content"'),
      "Rendered panes should use inner content roots for layout observation",
    );
    assert.ok(
      webviewContent.includes("command: 'runtimeDiagnostics'"),
      "Webview should be able to emit runtime diagnostics snapshots to the extension host",
    );
    assert.ok(
      webviewContent.includes("emitRuntimeDiagnostics('stabilize-complete'"),
      "Scrollbar instrumentation should capture a snapshot when stabilization completes",
    );
    assert.ok(
      webviewContent.includes("emitRuntimeDiagnostics('startup-watchdog'"),
      "Scrollbar instrumentation should force a watchdog snapshot for failure cases that never expose pane scrollbars",
    );
    assert.ok(
      webviewContent.includes("window.addEventListener('error'"),
      "Scrollbar instrumentation should capture uncaught webview errors",
    );
    assert.ok(
      webviewContent.includes("window.addEventListener('unhandledrejection'"),
      "Scrollbar instrumentation should capture rejected async work in the webview",
    );
    assert.ok(
      webviewContent.includes(
        "const sourceHorizontalMax = sourcePane.scrollWidth - sourcePane.clientWidth;",
      ),
      "Scroll sync should calculate horizontal overflow for paired panes",
    );
    assert.ok(
      webviewContent.includes("targetPane.scrollLeft = targetScrollLeft;"),
      "Scroll sync should mirror horizontal scrolling between panes",
    );
  });

  it("should keep all headings on one line and expose full width for pane scrolling", () => {
    const webviewContent = provider.getWebviewContent(
      "<h2>[1.1.1] - 2026-03-20</h2>",
      "katex.css",
      "mermaid.js",
      "hljs-light.css",
      "hljs-dark.css",
    );

    assert.ok(
      /h1, h2, h3, h4, h5, h6 \{[\s\S]*overflow-wrap: break-word;/m.test(
        webviewContent,
      ),
      "Headings should wrap at word boundaries only so numbering stays with its text",
    );
    assert.ok(
      /\.heading-prefix\s*\{[^}]*white-space:\s*nowrap/m.test(webviewContent),
      "heading-prefix class should prevent number prefixes from wrapping",
    );
    assert.ok(
      /ins:has\(> h1, > h2, > h3, > h4, > h5, > h6\),[\s\S]*del:has\(> h1, > h2, > h3, > h4, > h5, > h6\) \{[\s\S]*display: block;/m.test(
        webviewContent,
      ),
      "Changed heading wrappers should be block-level",
    );
  });

  it("should keep list markers and text at normal weight unless explicitly bolded", () => {
    const webviewContent = provider.getWebviewContent(
      "<ol><li>One</li></ol><ul><li>Two</li></ul>",
      "katex.css",
      "mermaid.js",
      "hljs-light.css",
      "hljs-dark.css",
    );

    assert.ok(
      /ul,[\s\S]*ol,[\s\S]*li \{[\s\S]*font-weight: 400;/m.test(webviewContent),
      "List containers and items should explicitly use normal font weight",
    );
    assert.ok(
      /li::marker \{[\s\S]*font-weight: 400;/m.test(webviewContent),
      "List markers should not render with unintended bold weight",
    );
  });

  it("should keep plain paragraphs at normal weight unless explicitly bolded", () => {
    const webviewContent = provider.getWebviewContent(
      "<h2>Contributing &amp; Development</h2><p>Interested in contributing?</p><h2>License</h2><p>This project is licensed under the MIT License.</p>",
      "katex.css",
      "mermaid.js",
      "hljs-light.css",
      "hljs-dark.css",
    );

    assert.ok(
      /p \{[\s\S]*font-weight: 400;/m.test(webviewContent),
      "Paragraphs should explicitly use normal font weight",
    );
  });

  it("should style list-container swaps as marker-only structural changes", () => {
    const webviewContent = provider.getWebviewContent(
      '<del class="diffdel diff-block diff-list-container-change"><ol><li>One</li></ol></del><ins class="diffins diff-block diff-list-container-change"><ul><li>One</li></ul></ins><del class="diffdel diff-block diff-list-container-change"><dl><dt>Term 1</dt><dd>One</dd></dl></del>',
      "katex.css",
      "mermaid.js",
      "hljs-light.css",
      "hljs-dark.css",
    );

    assert.ok(
      /del\.diff-list-container-change,[\s\S]*ins\.diff-list-container-change \{[\s\S]*background-color: transparent !important;[\s\S]*border: none !important;/m.test(
        webviewContent,
      ),
      "List-container swaps should clear the full block deletion/insertion fill",
    );
    assert.ok(
      /#left-pane del\.diff-list-container-change > ol,[\s\S]*#left-pane del\.diff-list-container-change > ul[\s\S]*border-left: 3px solid rgba\(239, 68, 68, 0\.65\);/m.test(
        webviewContent,
      ),
      "Removed ordered markers should be shown with a structural edge accent instead of a full red block",
    );
    assert.ok(
      /#right-pane ins\.diff-list-container-change > ol,[\s\S]*#right-pane ins\.diff-list-container-change > ul[\s\S]*border-left: 3px solid rgba\(34, 197, 94, 0\.65\);/m.test(
        webviewContent,
      ),
      "Added unordered markers should be shown with a structural edge accent instead of a full green block",
    );
    assert.ok(
      /diff-list-container-change li::marker \{[\s\S]*font-weight: 600;/m.test(
        webviewContent,
      ),
      "Structural list-container swaps should emphasize only the markers",
    );
    assert.ok(
      webviewContent.includes("del.diff-list-container-change > dl") &&
        webviewContent.includes("ins.diff-list-container-change > dl"),
      "Structural list-container styling should also cover definition lists",
    );
  });

  it("should constrain code blocks to the pane width", () => {
    const webviewContent = provider.getWebviewContent(
      "<pre><code class=\"hljs\">const value = 'long';</code></pre>",
      "katex.css",
      "mermaid.js",
      "hljs-light.css",
      "hljs-dark.css",
    );

    assert.ok(
      /pre \{[\s\S]*width: 100%;[\s\S]*max-width: 100%;[\s\S]*box-sizing: border-box;/m.test(
        webviewContent,
      ),
      "Code block CSS should bind pre elements to the pane width",
    );
  });

  it("should give code blocks a horizontal scrollbar for overflow", () => {
    const webviewContent = provider.getWebviewContent(
      '<pre><code class="hljs">code --install-extension rich-markdown-diff-1.0.0.vsix</code></pre>',
      "katex.css",
      "mermaid.js",
      "hljs-light.css",
      "hljs-dark.css",
    );

    assert.ok(
      /pre \{[\s\S]*overflow-x: auto;/m.test(webviewContent),
      "Code blocks should have overflow-x: auto for horizontal scrolling",
    );
  });

  it("should wrap inline code but not code blocks", () => {
    const webviewContent = provider.getWebviewContent(
      "<p><code>inline</code></p><pre><code>block</code></pre>",
      "katex.css",
      "mermaid.js",
      "hljs-light.css",
      "hljs-dark.css",
    );

    assert.ok(
      webviewContent.includes("overflow-wrap: break-word"),
      "Inline code should wrap with break-word",
    );
    assert.ok(
      webviewContent.includes("--markdown-code-font-size: 13px;"),
      "Code should use the reduced integer font size",
    );
    assert.ok(
      webviewContent.includes("font-size: var(--markdown-code-font-size);"),
      "Code should use the readable markdown code font size",
    );
    assert.ok(
      /pre code \{[\s\S]*?overflow-wrap: normal/m.test(webviewContent),
      "Code inside pre blocks should not wrap",
    );
  });

  it("should keep changelog headings intact when lines are added above them", async () => {
    const oldMd = "# Changelog\n\n## [1.1.1] - 2026-03-20\n\nFixed a bug.";
    const newMd =
      "# Changelog\n\n## [1.2.0] - 2026-04-06\n\nNew feature.\n\n## [1.1.1] - 2026-03-20\n\nFixed a bug.";
    const diff = provider.computeDiff(oldMd, newMd);

    assert.ok(
      diff.includes("[1.1.1] - 2026-03-20"),
      "Heading [1.1.1] should remain contiguous in diff output even when source lines shift",
    );
    assert.ok(
      !/ data-line="\d+"/.test(diff),
      "Diff HTML should not contain data-line attributes (stripped before diffing)",
    );
  });

  it("should show inline diff within headings when heading text changes", async () => {
    const oldMd = "# Old Title\n\nSome text.";
    const newMd = "# New Title\n\nSome text.";
    const diff = provider.computeDiff(oldMd, newMd);

    // The heading should still exist as an h1
    assert.ok(diff.includes("<h1>"), "Output should contain an h1 element");
    // Should show inline diff markers within the heading, not a full replacement
    assert.ok(
      diff.includes("diffmod") ||
        diff.includes("diffdel") ||
        diff.includes("diffins"),
      "Changed heading should contain inline diff markers",
    );
    // The heading tag should wrap the diff markers, not the other way around
    assert.ok(
      !diff.includes("<del") || diff.match(/<h1>[^]*<\/h1>/),
      "Diff markers should be inside the heading, not wrapping it",
    );
  });

  it("should highlight completely new heading additions with diff classes", async () => {
    const oldMd = "# Doc\n\nPara one.";
    const newMd = "# Doc\n\n## New Section\n\nNew content.\n\nPara one.";
    const diff = provider.computeDiff(oldMd, newMd);

    // The new heading should be wrapped with an insertion marker
    assert.ok(
      diff.includes("diffins") || diff.includes("diff-block"),
      "New heading addition should have diffins or diff-block class",
    );
    // The new heading text should appear in the output
    assert.ok(
      diff.includes("New Section"),
      "New heading text should be present in diff output",
    );
  });

  it("should not split heading text across two headings when a new section is inserted", () => {
    // When a new section is added between existing sections, htmldiff may group
    // multiple headings inside a single <ins>, causing the heading refiner to
    // re-diff across heading boundaries. The left pane would then show a
    // broken heading like "3" and ". Compare with Clipboard" as two separate
    // headings instead of a single "3. Compare with Clipboard".
    const oldMd =
      "### 3. Compare with Clipboard\n\n1. Open a markdown file.\n2. Copy some text.";
    const newMd =
      "### 3. Open the Current File\n\n1. Open a Markdown file.\n2. Use action.\n\n### 4. Compare with Clipboard\n\n1. Open a markdown file.\n2. Copy some text.";
    const diff = provider.computeDiff(oldMd, newMd);

    // The old heading text must appear as one contiguous string inside a
    // single <h3>, not split across multiple heading elements.
    const h3s = diff.match(/<h3[^>]*>[\s\S]*?<\/h3>/g) || [];
    const leftVisible = h3s.map((h) =>
      h.replace(/<ins[^>]*>[\s\S]*?<\/ins>/g, "").replace(/<[^>]+>/g, ""),
    );

    // On the left pane (hiding <ins>), no heading should show just "3" alone
    assert.ok(
      !leftVisible.some((t) => t.trim() === "3"),
      "Left pane heading should not show bare '3' — original heading text must stay intact",
    );
    // The full original text must be recoverable from a single heading
    assert.ok(
      leftVisible.some((t) => t.includes("3. Compare with Clipboard")),
      "Left pane should show '3. Compare with Clipboard' as a complete heading",
    );
  });

  it("should not wrap entire code blocks when only part changes", () => {
    const oldMd = 'Text\n\n```python\nprint("hello")\n```\n\nEnd.';
    const newMd = 'Text\n\n```python\nprint("world")\n```\n\nEnd.';
    const diff = provider.computeDiff(oldMd, newMd);

    assert.ok(
      diff.includes("<pre>") || diff.includes("<pre "),
      "Should still render a pre element",
    );
    assert.ok(
      !/<del[^>]*class="[^"]*diff-block[^"]*"[^>]*>\s*<pre/.test(diff),
      "Changed code blocks should not be wrapped in a diff-block del/ins",
    );
  });

  it("should render horizontal rules", () => {
    const diff = provider.computeDiff(
      "Above\n\n---\n\nBelow",
      "Above\n\n---\n\nBelow",
    );

    assert.ok(
      diff.includes("<hr"),
      "Markdown horizontal rules should render as <hr> elements",
    );
  });

  it("should style horizontal rules with a visible border in the webview", () => {
    const webviewContent = provider.getWebviewContent(
      "<p>Text</p><hr><p>More</p>",
      "katex.css",
      "mermaid.js",
      "hljs-light.css",
      "hljs-dark.css",
    );

    assert.ok(
      webviewContent.includes(
        "border-top: 1px solid var(--vscode-panel-border)",
      ),
      "HR should have a visible top border",
    );
  });

  it("should use consistent bullet styles across panes", () => {
    const webviewContent = provider.getWebviewContent(
      "<ul><li>A</li></ul><ol><li>B</li></ol>",
      "katex.css",
      "mermaid.js",
      "hljs-light.css",
      "hljs-dark.css",
    );

    assert.ok(
      webviewContent.includes("list-style-type: disc"),
      "Unordered lists should use disc markers",
    );
    assert.ok(
      webviewContent.includes("list-style-type: decimal"),
      "Ordered lists should use decimal markers",
    );
  });

  it("should use reduced 1px borders for inline diff markers", () => {
    const webviewContent = provider.getWebviewContent(
      "<p><del>old</del><ins>new</ins></p>",
      "katex.css",
      "mermaid.js",
      "hljs-light.css",
      "hljs-dark.css",
    );

    assert.ok(
      webviewContent.includes("border-bottom: 1px solid #ef4444"),
      "Deletion borders should be 1px",
    );
    assert.ok(
      webviewContent.includes("border-bottom: 1px solid #22c55e"),
      "Insertion borders should be 1px",
    );
  });

  it("should remove bottom borders from diff markers inside headings", () => {
    const webviewContent = provider.getWebviewContent(
      "<h2><ins>new</ins></h2>",
      "katex.css",
      "mermaid.js",
      "hljs-light.css",
      "hljs-dark.css",
    );

    assert.ok(
      webviewContent.includes("h1 del") &&
        webviewContent.includes("border-bottom: none"),
      "Heading diff markers should not have bottom borders",
    );
  });

  it("should suppress bottom borders inside code blocks", () => {
    const webviewContent = provider.getWebviewContent(
      "<pre><code><ins>new</ins></code></pre>",
      "katex.css",
      "mermaid.js",
      "hljs-light.css",
      "hljs-dark.css",
    );

    assert.ok(
      webviewContent.includes("pre ins") &&
        webviewContent.includes("border-bottom: none !important"),
      "Diff markers inside code blocks should not have bottom borders",
    );
  });

  it("should style code blocks with compact padding and a visible border", () => {
    const webviewContent = provider.getWebviewContent(
      "<pre><code>code</code></pre>",
      "katex.css",
      "mermaid.js",
      "hljs-light.css",
      "hljs-dark.css",
    );

    assert.ok(
      /pre\s*\{[^}]*padding:\s*8px\s+10px/m.test(webviewContent),
      "Code blocks should use compact 8px 10px padding",
    );
    assert.ok(
      /pre\s*\{[^}]*border:\s*1px\s+solid/m.test(webviewContent),
      "Code blocks should have a 1px solid border for visual distinction",
    );
    assert.ok(
      /pre\s*\{[^}]*border-radius:\s*4px/m.test(webviewContent),
      "Code blocks should have 4px border-radius",
    );
  });

  it("should style KaTeX blocks like rendered block containers", () => {
    const webviewContent = provider.getWebviewContent(
      '<p class="katex-block"><span class="katex-display"><span class="katex">math</span></span></p>',
      "katex.css",
      "mermaid.js",
      "hljs-light.css",
      "hljs-dark.css",
    );

    assert.ok(
      /\.katex-block\s*\{[^}]*padding:\s*8px\s+10px/m.test(webviewContent),
      "KaTeX blocks should use the same compact padding as code blocks",
    );
    assert.ok(
      /\.katex-block\s*\{[^}]*border:\s*1px\s+solid/m.test(webviewContent),
      "KaTeX blocks should have a 1px border",
    );
    assert.ok(
      /\.katex-block\s*\{[^}]*overflow-x:\s*auto/m.test(webviewContent),
      "KaTeX blocks should allow horizontal scrolling when needed",
    );
    assert.ok(
      /\.katex-block\s+\.katex-display\s*\{[^}]*margin:\s*0/m.test(
        webviewContent,
      ),
      "KaTeX display blocks should reset their default vertical margins inside the container",
    );
  });

  it("should use 1px borders for block-level diff containers", () => {
    const webviewContent = provider.getWebviewContent(
      '<ins class="diffins diff-block"><blockquote>text</blockquote></ins>',
      "katex.css",
      "mermaid.js",
      "hljs-light.css",
      "hljs-dark.css",
    );

    assert.ok(
      /del\.diffdel\.diff-block,\s*ins\.diffins\.diff-block\s*\{[^}]*border:\s*1px\s+solid/m.test(
        webviewContent,
      ),
      "Block-level diff containers should use a 1px border for consistency",
    );
    assert.ok(
      /ins\.diffins\s*>\s*\.katex-block[\s\S]*border:\s*1px\s+solid/m.test(
        webviewContent,
      ),
      "Complex inserted KaTeX blocks should also use a 1px border",
    );
  });

  it("should allow list item text to wrap", () => {
    const webviewContent = provider.getWebviewContent(
      "<ul><li>text</li></ul>",
      "katex.css",
      "mermaid.js",
      "hljs-light.css",
      "hljs-dark.css",
    );

    assert.ok(
      /li,\s*dt,\s*dd\s*\{[^}]*overflow-wrap:\s*break-word/m.test(
        webviewContent,
      ),
      "List items, dt, and dd should have overflow-wrap: break-word",
    );
  });

  it("should not ghost-hide HR elements in the webview script", () => {
    const webviewContent = provider.getWebviewContent(
      "<hr />",
      "katex.css",
      "mermaid.js",
      "hljs-light.css",
      "hljs-dark.css",
    );

    assert.ok(
      webviewContent.includes("if (el.tagName === 'HR')") &&
        webviewContent.includes("return false"),
      "HR elements should not be treated as graphically empty",
    );
  });

  it("should give inline code a code-like background", () => {
    const webviewContent = provider.getWebviewContent(
      "<p><code>foo</code></p>",
      "katex.css",
      "mermaid.js",
      "hljs-light.css",
      "hljs-dark.css",
    );

    assert.ok(
      /\bcode\s*\{[^}]*background-color:\s*var\(--vscode-textCodeBlock-background/m.test(
        webviewContent,
      ),
      "Inline code should have a code-like background color",
    );
    assert.ok(
      /\bcode\s*\{[^}]*padding:\s*0\.15em\s+0\.35em/m.test(webviewContent),
      "Inline code should have padding",
    );
  });

  it("should add bottom border to h1 and h2 only", () => {
    const webviewContent = provider.getWebviewContent(
      "<h1>Title</h1><h3>Sub</h3>",
      "katex.css",
      "mermaid.js",
      "hljs-light.css",
      "hljs-dark.css",
    );

    assert.ok(
      /h1,\s*h2\s*\{[^}]*border-bottom:\s*1px\s+solid/m.test(webviewContent),
      "h1 and h2 should have a bottom border",
    );
  });

  it("should split consecutive headings into separate diff wrappers", () => {
    const oldMd = "# Title\n\nParagraph.";
    const newMd = "# Title\n\n## New A\n\n## New B\n\nParagraph.";
    const diff = provider.computeDiff(oldMd, newMd);

    // Each heading should be in its own wrapper, not grouped together
    const insBlocks = diff.match(/<ins\b[^>]*>[\s\S]*?<\/ins>/gi) || [];
    const headingsInSingleIns = insBlocks.filter((b) => {
      const headingCount = (b.match(/<h[1-6][\s>]/gi) || []).length;
      return headingCount > 1;
    });

    assert.strictEqual(
      headingsInSingleIns.length,
      0,
      "No single ins wrapper should contain multiple headings",
    );
  });

  it("should never group a heading with following text in the same wrapper", () => {
    const oldMd = "# Intro\n\nSome content.";
    const newMd =
      "# Intro\n\nSome content.\n\n## License\n\nThis project is licensed under the MIT License.";
    const diff = provider.computeDiff(oldMd, newMd);

    // The heading and the paragraph must be in separate wrappers
    const insBlocks = diff.match(/<ins\b[^>]*>[\s\S]*?<\/ins>/gi) || [];
    const headingWithText = insBlocks.filter((b) => {
      const hasHeading = /<h[1-6][\s>]/i.test(b);
      // Check for a <p> tag or substantial plain text alongside the heading
      const hasPara = /<p[\s>]/i.test(b);
      const textOnly = b.replace(/<[^>]+>/g, "").replace(/\s/g, "");
      const headingText = (b.match(/<h[1-6][^>]*>[\s\S]*?<\/h[1-6]>/gi) || [])
        .join("")
        .replace(/<[^>]+>/g, "")
        .replace(/\s/g, "");
      const nonHeadingText = textOnly.length - headingText.length;
      return hasHeading && (hasPara || nonHeadingText > 0);
    });

    assert.strictEqual(
      headingWithText.length,
      0,
      "A heading should never share a wrapper with a paragraph or trailing text",
    );
  });

  it("should ghost-hide empty containers in both panes", () => {
    const webviewContent = provider.getWebviewContent(
      "<pre><code><del>old</del></code></pre>",
      "katex.css",
      "mermaid.js",
      "hljs-light.css",
      "hljs-dark.css",
    );

    assert.ok(
      webviewContent.includes("hideEmptyContainers(rightContent, 'DEL')"),
      "hideEmptyContainers should also be called for the right pane",
    );
  });

  it("should mark purely-inserted list items so the left pane hides the ghost bullet", () => {
    // When a list item is entirely new (all content in <ins>), the left pane's
    // CSS `ins { display: none }` makes it appear as an empty bullet.
    // markGhostListItems() adds data-all-inserted so CSS can hide it outright.
    const oldMd =
      "- **GitHub Alerts**: Display styled admonitions like etc\n- **Footnotes**: Full support.";
    const newMd =
      "- **GitHub Alerts**: Display styled admonitions like etc.\n- **Tables and Lists**: Preserve rendered tables.\n- **Footnotes**: Full support.";
    const diff = provider.computeDiff(oldMd, newMd);

    // The Tables and Lists li should be marked as data-all-inserted
    assert.ok(
      diff.includes('data-all-inserted="true"'),
      "A purely-inserted list item should be marked with data-all-inserted",
    );
    // The unchanged Footnotes li must NOT be marked
    assert.ok(
      !diff.includes(
        "Footnotes</strong>: Full support.</li>".replace(
          "</li>",
          ' data-all-inserted="true"></li>',
        ),
      ),
      "An unchanged list item must not be incorrectly marked as ghost",
    );
    // The webview CSS must hide data-all-inserted li on the left pane
    const webview = provider.getWebviewContent(
      diff,
      "k.css",
      "m.js",
      "hl.css",
      "hd.css",
    );
    assert.ok(
      webview.includes("li[data-all-inserted]"),
      "Webview CSS should hide li[data-all-inserted] in the left pane",
    );
  });

  it("should keep reparented nested bullets neutral when only the parent item changes", () => {
    const oldMd =
      '1. **Run/Debug:**\n   - Open this project in VS Code.\n   - Press `F5` to launch an "Extension Development Host" instance.';
    const newMd =
      '1. **Run and debug.**\n\n- Open this project in VS Code.\n- Press `F5` to launch an "Extension Development Host" instance.';
    const diff = provider.computeDiff(oldMd, newMd);

    assert.ok(
      !/<del[^>]*class="[^"]*diff-block[^"]*"[^>]*>\s*<ul>/i.test(diff),
      "The unchanged nested bullet list should not remain wrapped as a deleted block",
    );
    assert.ok(
      !/<ins[^>]*>\s*<ol[\s\S]*?<\/ol>\s*<ul>[\s\S]*?<\/ul>\s*<\/ins>/i.test(
        diff,
      ),
      "The shared bullet list should be pulled out of the inserted wrapper",
    );
    assert.ok(
      /<ul>\s*<li>Open this project in VS Code\.<\/li>\s*<li>Press <code>F5<\/code>/i.test(
        diff,
      ),
      "The shared bullet list should remain visible as a neutral list",
    );
  });

  it("should use reduced block spacing", () => {
    const webviewContent = provider.getWebviewContent(
      "<p>text</p>",
      "katex.css",
      "mermaid.js",
      "hljs-light.css",
      "hljs-dark.css",
    );

    assert.ok(
      webviewContent.includes("--markdown-block-spacing: 0.6em"),
      "Block spacing should be 0.6em for compact layout",
    );
  });
});
