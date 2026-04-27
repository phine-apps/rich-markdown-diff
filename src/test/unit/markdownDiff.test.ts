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
    const { html: diff } = provider.computeDiff(oldMd, newMd);

    // Expected: "foo <ins ...>bar</ins>"
    assert.ok(diff.includes("foo"), "Should contain original text");
    assert.ok(diff.includes("<ins"), "Should contain ins tag");
    assert.ok(diff.includes("bar"), "Should contain new text");
  });

  it("should compute simple diff (deletion)", () => {
    const oldMd = "foo bar";
    const newMd = "foo";
    const { html: diff } = provider.computeDiff(oldMd, newMd);

    // Expected: "foo <del ...>bar</del>"
    assert.ok(diff.includes("foo"), "Should contain original text");
    assert.ok(diff.includes("<del"), "Should contain del tag");
    assert.ok(diff.includes("bar"), "Should contain deleted text");
  });

  it("should handle frontmatter changes", () => {
    const oldMd = "---\ntitle: Old\n---\nContent";
    const newMd = "---\ntitle: New\n---\nContent";
    const { html: diff } = provider.computeDiff(oldMd, newMd);

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
    const { html: diff } = provider.computeDiff(oldMd, newMd);

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
    const { html: diff } = provider.computeDiff(oldMd, newMd);

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
    const { html: diff } = provider.computeDiff(oldMd, newMd, resolver);

    assert.ok(
      diff.includes('src="vscode-resource://images/icon.png"'),
      "Should resolve image path",
    );
  });

  it("should render strikethrough content inside diffs", () => {
    const oldMd = "This has ~~removed~~ text.";
    const newMd = "This has text.";
    const { html: diff } = provider.computeDiff(oldMd, newMd);

    assert.ok(
      diff.includes("<s>") || diff.includes("removed"),
      "Should preserve rendered strikethrough markup",
    );
    assert.ok(diff.includes("<del"), "Should still register the deletion");
  });

  it("should preserve nested list structure", () => {
    const oldMd = "- Parent\n  - Child A\n  - Child B";
    const newMd = "- Parent\n  - Child A\n  - Child C";
    const { html: diff } = provider.computeDiff(oldMd, newMd);

    assert.ok(diff.includes("<ul>"), "Should render nested list containers");
    assert.ok(
      diff.includes("<ins") || diff.includes("<del"),
      "Should include nested list item changes",
    );
  });

  it("should detect ordered to unordered list container changes", () => {
    const oldMd = "1. One\n2. Two";
    const newMd = "- One\n- Two";
    const { html: diff } = provider.computeDiff(oldMd, newMd);

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
    const { html: diff } = provider.computeDiff(oldMd, newMd);

    assert.ok(
      diff.includes("diff-list-container-change"),
      "Definition-list swaps should be tagged as structural list-container changes",
    );
    assert.ok(diff.includes("<dl"), "Should preserve the definition list");
    assert.ok(diff.includes("<ul>"), "Should preserve the unordered list");
    assert.ok(
      !diff.includes("<dl><ul>") && !diff.includes("<ul><dl>"),
      "Should not leave invalid definition-list and unordered-list nesting when the list type changes",
    );
  });

  it("should detect ordered list to definition list container changes", () => {
    const oldMd = "1. Term 1";
    const newMd = "Term 1\n: One";
    const { html: diff } = provider.computeDiff(oldMd, newMd);

    assert.ok(
      diff.includes("diff-list-container-change"),
      "Ordered-list to definition-list swaps should be tagged as structural list-container changes",
    );
    assert.ok(diff.includes("<ol>"), "Should preserve the ordered list");
    assert.ok(diff.includes("<dl"), "Should preserve the definition list");
    assert.ok(
      !diff.includes("<ol><dl>") && !diff.includes("<dl><ol>"),
      "Should not leave invalid ordered-list and definition-list nesting when the list type changes",
    );
  });

  it("should keep same-type definition list changes granular", () => {
    const oldMd = "Term 1\n: One";
    const newMd = "Term 1\n: One\n\nTerm 2\n: Two";
    const { html: diff } = provider.computeDiff(oldMd, newMd);

    assert.ok(diff.includes("<dl"), "Should preserve the definition list");
    assert.ok(diff.includes("<dt"), "Should preserve definition terms");
    assert.ok(diff.includes("<dd"), "Should preserve definition values");
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
    const { html: diff } = provider.computeDiff(oldMd, newMd);

    assert.ok(
      diff.includes("<h2"),
      "Should preserve the heading before the list swap",
    );
    assert.ok(
      diff.includes("<h2"),
      "Should preserve the heading after the list swap",
    );
    assert.ok(
      /<h2[^>]*>Header<\/h2>\s*<del/.test(diff) &&
        /<\/ins>\s*<h2[^>]*>Next<\/h2>/.test(diff),
      "Structural list change wrappers should stay scoped to the list block only",
    );
  });

  it("should preserve CJK text inside diffs", () => {
    const oldMd = "## 变更说明\n这是旧版本。";
    const newMd = "## 变更说明\n这是新版本。";
    const { html: diff } = provider.computeDiff(oldMd, newMd);

    assert.ok(diff.includes("变更说明"), "Should retain the heading text");
    assert.ok(
      diff.includes("<ins") || diff.includes("<del"),
      "Should diff the body text",
    );
  });

  it("should keep changelog-style headings intact when body text changes", () => {
    const oldMd = "## [1.1.1] - 2026-03-20\nPrevious note.";
    const newMd = "## [1.1.1] - 2026-03-20\nUpdated note.";
    const { html: diff } = provider.computeDiff(oldMd, newMd);

    assert.ok(
      diff.includes("[1.1.1] - 2026-03-20"),
      "Should preserve the heading as one contiguous string",
    );
  });

  it("should keep numbered step headings intact when the number changes", () => {
    const oldMd = "### 3. Compare with Clipboard\nPrevious note.";
    const newMd = "### 4. Compare with Clipboard\nUpdated note.";
    const { html: diff } = provider.computeDiff(oldMd, newMd);

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
    const { html: diff } = provider.computeDiff(
      "## Local Testing and Installation\nInstructions.",
      "## Local Testing and Installation\nInstructions updated.",
    );

    assert.ok(
      diff.includes("<h2"),
      "Ordinary prose headings should still render as heading elements",
    );
  });

  it("should preserve highlight markup", () => {
    const { html: diff } = provider.computeDiff(
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
    const { html: diff } = provider.computeDiff(md, md);

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
    const { html: diff } = provider.computeDiff(oldMd, newMd);

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

  it("should configure Mermaid with VS Code theme-aware colors", () => {
    const webviewContent = provider.getWebviewContent(
      '<div class="mermaid">graph TD; A-->B;</div>',
      "katex.css",
      "mermaid.js",
      "hljs-light.css",
      "hljs-dark.css",
    );

    assert.ok(
      webviewContent.includes("const createMermaidConfig = () =>"),
      "Webview should build a Mermaid config from VS Code theme values",
    );
    assert.ok(
      webviewContent.includes("const toMermaidHexColor = (value, fallback) =>"),
      "Mermaid config should normalize runtime CSS colors into Mermaid-compatible hex values",
    );
    assert.ok(
      webviewContent.includes(
        "const mixMermaidHexColors = (baseColor, overlayColor, ratio) =>",
      ),
      "Mermaid config should derive lighter diagram surfaces from the editor palette",
    );
    assert.ok(
      webviewContent.includes("theme: 'base'"),
      "Mermaid should use the base theme so the template can override palette values",
    );
    assert.ok(
      webviewContent.includes("startOnLoad: false"),
      "Mermaid auto-start should be disabled so the webview can render diagrams after applying its theme config",
    );
    assert.ok(
      webviewContent.includes("themeVariables:"),
      "Mermaid config should include explicit theme variables",
    );
    assert.ok(
      webviewContent.includes("nodeTextColor: foreground"),
      "Mermaid flowchart nodes should explicitly use the themed foreground color",
    );
    assert.ok(
      webviewContent.includes(
        "const renderMermaidDiagrams = async (container = document) =>",
      ),
      "Webview should explicitly render Mermaid diagrams after initializing the theme config",
    );
    assert.ok(
      webviewContent.includes("const mermaidStyleNonce = '"),
      "Webview should expose the page nonce to the Mermaid renderer so generated SVG styles can satisfy CSP",
    );
    assert.ok(
      webviewContent.includes(
        "styleEl.setAttribute('nonce', mermaidStyleNonce);",
      ),
      "Mermaid SVG style blocks should receive the page nonce before insertion into the DOM",
    );
    assert.ok(
      webviewContent.includes(
        "mermaid.render('rich-markdown-diff-mermaid-' + Date.now() + '-' + index, original)",
      ),
      "Mermaid rendering should use explicit render calls instead of implicit auto-start timing",
    );
    assert.ok(
      webviewContent.includes("mermaid.initialize(createMermaidConfig());"),
      "Mermaid should be initialized with the computed theme config",
    );
    assert.ok(
      webviewContent.includes(
        ".labelBkg, .edgeLabel, .node .label, .cluster .label, foreignObject div, .nodeLabel, .nodeLabel p {",
      ),
      "Mermaid label containers should be explicitly normalized in the runtime theme CSS",
    );
    assert.ok(
      webviewContent.includes("background-color: transparent !important;"),
      "Mermaid node label containers should stay transparent so text does not render over dark patches",
    );
    assert.ok(
      webviewContent.includes("foreignObject {") &&
        webviewContent.includes("overflow: visible !important;"),
      "Mermaid foreignObject labels should be allowed to overflow so glyph edges are not clipped",
    );
    assert.ok(
      webviewContent.includes("padding-right: 1px;"),
      "Mermaid label containers should keep a small right-side cushion to avoid clipping the last glyph pixel",
    );
    assert.ok(
      webviewContent.includes(
        ".edgePath .path, .flowchart-link, .relationshipLine, .messageLine0, .messageLine1 {",
      ) && webviewContent.includes("fill: none !important;"),
      "Mermaid edge paths should remain stroke-only so curved links do not render as thick filled ribbons",
    );
    assert.ok(
      webviewContent.includes(".marker path, .arrowheadPath {") &&
        webviewContent.includes("'  fill: ' + muted + ' !important;',"),
      "Mermaid arrowheads should keep their solid fill after edge paths are switched back to stroke-only rendering",
    );
  });

  it("should emit a syntactically valid inline webview script", () => {
    const webviewContent = provider.getWebviewContent(
      '<div class="mermaid">graph TD; A-->B;</div>',
      "katex.css",
      "mermaid.js",
      "hljs-light.css",
      "hljs-dark.css",
    );

    const scriptBlocks = Array.from(
      webviewContent.matchAll(
        /<script(?: nonce="[^"]*")?>([\s\S]*?)<\/script>/g,
      ),
      (match) => match[1],
    );
    const runtimeScript = scriptBlocks.find((script) =>
      script.includes("const vscode = acquireVsCodeApi();"),
    );

    assert.ok(runtimeScript, "Webview should include the main runtime script");
    assert.doesNotThrow(
      () => new Function(runtimeScript!),
      "Generated runtime script should parse successfully",
    );
  });

  it("should disable gutter markers and hover chrome by default", () => {
    const webviewContent = provider.getWebviewContent(
      '<p data-line="0">diff</p>',
      "katex.css",
      "mermaid.js",
      "hljs-light.css",
      "hljs-dark.css",
    );

    assert.ok(
      !/<body class="[^"]*show-gutter-markers/.test(webviewContent),
      "Gutter markers should be opt-in instead of enabled by default",
    );
    assert.ok(
      !webviewContent.includes("#right-pane [data-line]:hover::before"),
      "Webview should not inject hover-only quick-edit labels",
    );
    assert.ok(
      !webviewContent.includes("outline: 2px dashed rgba(255, 165, 0, 0.4);"),
      "Webview should not draw hover outlines for editable blocks",
    );
    assert.ok(
      !webviewContent.includes("cursor: help;"),
      "Webview should not switch the mouse cursor to the help affordance when blame is enabled",
    );
    assert.ok(
      !webviewContent.includes('id="blame-tooltip"'),
      "Webview should not render a hover blame tooltip container",
    );
    assert.ok(
      !webviewContent.includes("addEventListener('mouseenter', showBlame)"),
      "Webview should not register hover blame handlers on diff lines",
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
      webviewContent.includes("gap: 0") || webviewContent.includes("gap:0"),
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
        "renderMermaidDiagrams(container).finally(() => scheduleAsyncLayoutRefresh());",
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
      webviewContent.includes("setMermaidSvgContent(el, result.svg);"),
      "Mermaid render results should be normalized through the nonce-aware SVG insertion helper",
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
    assert.ok(
      webviewContent.includes("const mirroredScrollState = new WeakMap();") &&
        webviewContent.includes("const shouldIgnoreMirroredScroll = (pane) =>"),
      "Scroll sync should track mirrored pane updates explicitly instead of using a global scroll lock",
    );
    assert.ok(
      webviewContent.includes("let activePane = null;") &&
        webviewContent.includes("const setActive = (pane) => {") &&
        webviewContent.includes("if (activePane !== sourcePane) {") &&
        webviewContent.includes(
          "leftPane.addEventListener('wheel', () => setActive(leftPane), { passive: true });",
        ) &&
        webviewContent.includes(
          "rightPane.addEventListener('wheel', () => setActive(rightPane), { passive: true });",
        ),
      "Scroll sync should restore active-pane ownership so only the pane under user interaction can drive mirroring",
    );
    assert.ok(
      webviewContent.includes(
        "if (shouldIgnoreMirroredScroll(leftPane)) return;",
      ) &&
        webviewContent.includes(
          "if (shouldIgnoreMirroredScroll(rightPane)) return;",
        ),
      "Scroll listeners should ignore only the mirrored target-pane events so active scrolling stays smooth",
    );
    assert.ok(
      webviewContent.includes("markMirroredScroll(targetPane);") &&
        webviewContent.includes("markMirroredScroll(leftPane);") &&
        webviewContent.includes("markMirroredScroll(rightPane);"),
      "Programmatic pane syncs should mark the affected panes so their synthetic scroll events do not bounce back",
    );
    assert.ok(
      !webviewContent.includes("if (isScrolling) return;"),
      "Scroll sync should no longer rely on the coarse global scroll lock that caused mirrored-pane jitter",
    );
    assert.ok(
      webviewContent.includes("if (sourceMax > 0 && targetMax > 0) {") &&
        webviewContent.includes(
          "const percentage = sourcePane.scrollTop / sourceMax;",
        ) &&
        webviewContent.includes("targetScrollTop = percentage * targetMax;") &&
        webviewContent.includes("let shouldMarkTargetScroll = false;"),
      "Scroll sync should use percentage-based vertical mirroring during active scrolling and mark programmatic target updates for mirrored-event suppression",
    );
    assert.ok(
      !webviewContent.includes(
        "const syncScrollToMatchingLine = (sourcePane, targetPane) =>",
      ) &&
        !webviewContent.includes("const getTopVisibleLineAnchor = (pane) =>") &&
        !webviewContent.includes(
          "const findClosestLineAnchor = (pane, sourceLine) =>",
        ),
      "The jitter-inducing anchor-based vertical sync helpers should be removed once percentage-based mirroring is restored",
    );
  });

  it("should keep overview ruler markers granular for table cell diffs", () => {
    const webviewContent = provider.getWebviewContent(
      "<table><tbody><tr><td><ins>Improved</ins></td></tr></tbody></table>",
      "katex.css",
      "mermaid.js",
      "hljs-light.css",
      "hljs-dark.css",
    );

    assert.ok(
      webviewContent.includes("const getVisualChangeHeight = (el) =>"),
      "Overview ruler logic should compute marker spans from the rendered block height",
    );
    assert.ok(
      !webviewContent.includes("el.closest('table')"),
      "Table cell diffs should stay granular instead of being promoted to the whole table",
    );
    assert.ok(
      !webviewContent.includes("el.querySelector('table') ||"),
      "Wrapped table changes should not force overview markers to span the entire table when only a small part changed",
    );
    assert.ok(
      webviewContent.includes(
        "const scrollRange = Math.max(paneHeight - pane.clientHeight, 0);",
      ),
      "Overview ruler markers should align to the pane's actual scrollable range instead of the full document height",
    );
    assert.ok(
      webviewContent.includes("const thumbHeightPx = scrollRange > 0") &&
        webviewContent.includes(
          "const thumbTravelPx = Math.max(rulerHeight - thumbHeightPx, 0);",
        ),
      "Overview ruler markers should account for the native scrollbar thumb height so their positions match the actual scrollbar travel",
    );
    assert.ok(
      webviewContent.includes(
        "const getGroupIndicatorStartScrollTop = (groupMetrics, pane) => {",
      ) &&
        webviewContent.includes(
          "const rawIndicatorScrollTop = Math.max(groupMetrics.top, 0);",
        ),
      "Overview ruler placement should start where a grouped change begins in the pane content",
    );
    assert.ok(
      webviewContent.includes("const getOverviewSpan = (span) => {"),
      "Overview ruler logic should project actual change spans separately from the scroll-position mapping",
    );
    assert.ok(
      webviewContent.includes(
        "Math.max(getOverviewOffset(indicatorStartScrollTop), 0)",
      ) && webviewContent.includes("Math.max(rulerHeight - markerHeightPx, 0)"),
      "Overview ruler marker placement should align to the thumb top for the grouped diff start position",
    );
    assert.ok(
      webviewContent.includes(
        "return (clampedOffset / scrollRange) * thumbTravelPx;",
      ),
      "Overview ruler marker top positions should be projected over the actual thumb travel instead of the full track height",
    );
    assert.ok(
      webviewContent.includes("Math.max(getOverviewSpan(height), 2)"),
      "Overview ruler markers should size their blocks from the actual grouped change height instead of inflating to the whole visibility interval",
    );
    assert.ok(
      webviewContent.includes(
        "drawRuler(rightPane, rightRuler, changeElements);",
      ),
      "Overview ruler rendering should reuse the collected change entries instead of re-querying raw ins and del tags",
    );
    assert.ok(
      !webviewContent.includes(
        "const changes = rightContent.querySelectorAll('ins, del');",
      ),
      "Overview ruler rendering should not fall back to raw diff-tag queries that miss full table spans",
    );
    assert.ok(
      webviewContent.includes(
        "const ancestor = el.closest('.mermaid') || el.closest('.katex-block') || el.closest('svg');",
      ),
      "Complex visual blocks like Mermaid and KaTeX should still be promoted to their rendered container while stable code blocks stay granular",
    );
    assert.ok(
      webviewContent.includes("marker.style.top = markerTopPx + 'px';"),
      "Overview ruler marker placement should use the scroll-range projection so the indicator lines up with the actual scrollbar travel",
    );
    assert.ok(
      webviewContent.includes("updateOverviewRulerVisibility();"),
      "Overview ruler rendering should resync the ruler geometry before placing markers so header and layout changes do not skew the marker positions",
    );
  });

  it("should anchor overview rulers to the live pane rectangles instead of fixed header offsets", () => {
    const webviewContent = provider.getWebviewContent(
      "<p><ins>Change</ins></p>",
      "katex.css",
      "mermaid.js",
      "hljs-light.css",
      "hljs-dark.css",
    );

    assert.ok(
      webviewContent.includes("const syncRulerToPane = (ruler, pane) => {"),
      "Overview rulers should have a dedicated pane-anchoring helper",
    );
    assert.ok(
      webviewContent.includes("const paneRect = pane.getBoundingClientRect();"),
      "Overview ruler geometry should be measured from the live pane rectangle instead of a guessed header offset",
    );
    assert.ok(
      webviewContent.includes(
        "const scrollbarTrackInset = scrollbarTrackWidth > 0",
      ) &&
        webviewContent.includes("? scrollbarTrackWidth") &&
        webviewContent.includes(
          "ruler.style.top = (paneRect.top + scrollbarTrackInset) + 'px';",
        ) &&
        webviewContent.includes(
          "ruler.style.height = Math.max(paneRect.height - (scrollbarTrackInset * 2), 0) + 'px';",
        ),
      "Overview rulers should align to the native scrollbar track rather than the full pane box so markers do not start a few pixels above the track",
    );
    assert.ok(
      webviewContent.includes("const totalScrollbarGutter = Math.max(") &&
        webviewContent.includes(
          "const gutterSides = paneStyle.scrollbarGutter.includes('both-edges') ? 2 : 1;",
        ) &&
        webviewContent.includes(
          "const scrollbarTrackWidth = totalScrollbarGutter > 0",
        ) &&
        webviewContent.includes(
          "const scrollbarTrackLeft = paneRect.right - scrollbarTrackWidth;",
        ) &&
        webviewContent.includes(
          "const centeredTrackLeft = scrollbarTrackLeft + Math.max((scrollbarTrackWidth - rulerWidth) / 2, 0);",
        ) &&
        webviewContent.includes(
          "ruler.style.left = (scrollbarTrackWidth > 0",
        ) &&
        webviewContent.includes("? centeredTrackLeft") &&
        webviewContent.includes(": paneRect.right - rulerWidth) + 'px';"),
      "Overview rulers should split the reserved gutter correctly and center the indicator strip inside the actual right-hand scrollbar track",
    );
    assert.ok(
      !webviewContent.includes("leftRuler.style.left = 'calc(50% - 14px)';"),
      "Overview rulers should no longer depend on a fixed split midpoint that drifts from the actual scrollbar position",
    );
    assert.ok(
      /\.overview-marker \{[\s\S]*width: 4px;[\s\S]*border-radius: 999px;/m.test(
        webviewContent,
      ),
      "Overview markers should stay narrow so the native scrollbar thumb remains visible alongside the indicator strip",
    );
  });

  it("should use shared group bounds for ruler placement and grouped-change scrolling", () => {
    const webviewContent = provider.getWebviewContent(
      "<h2><ins>Section</ins></h2><p><ins>Changed paragraph</ins></p>",
      "katex.css",
      "mermaid.js",
      "hljs-light.css",
      "hljs-dark.css",
    );

    assert.ok(
      webviewContent.includes("const getGroupPaneMetrics = (group, pane) => {"),
      "Grouped changes should compute shared pane-local bounds once so marker placement and navigation use the same section geometry",
    );
    assert.ok(
      webviewContent.includes(
        "const groupMetrics = getGroupPaneMetrics(group, pane);",
      ) &&
        webviewContent.includes(
          "const { paneItems, height } = groupMetrics;",
        ) &&
        webviewContent.includes(
          "const indicatorStartScrollTop = getGroupIndicatorStartScrollTop(groupMetrics, pane);",
        ),
      "Overview ruler rendering should derive grouped marker positions from the shared group bounds instead of individual stored item offsets",
    );
    assert.ok(
      webviewContent.includes(
        "const groupMetrics = getGroupPaneMetrics(group, targetPane);",
      ) &&
        webviewContent.includes(
          "const targetScrollTop = getGroupTargetScrollTop(groupMetrics, targetPane);",
        ),
      "Grouped-change scrolling should center the whole grouped section when it fits in view instead of only centering the first child node",
    );
    assert.ok(
      !webviewContent.includes("const elHeight = targetEl.offsetHeight || 20;"),
      "Grouped-change scrolling should no longer rely on a single child element height for section positioning",
    );
    assert.ok(
      webviewContent.includes(
        "const thumbTopY = Math.min(Math.max(clickY, 0), thumbTravelPx);",
      ) && webviewContent.includes("(thumbTopY / thumbTravelPx) * scrollRange"),
      "Ruler clicks should use the same thumb-top semantics as marker placement so clicking an indicator targets the expected diff position",
    );
  });

  it("should promote fully inserted code blocks to the pre container for active highlighting", () => {
    const webviewContent = provider.getWebviewContent(
      '<ins class="diffins"><pre><code>changed</code></pre></ins>',
      "katex.css",
      "mermaid.js",
      "hljs-light.css",
      "hljs-dark.css",
    );

    assert.ok(
      webviewContent.includes(
        "if (el.querySelector && (el.querySelector('pre') || el.querySelector('.mermaid') || el.querySelector('.katex-block'))) return true;",
      ),
      "Change collection should treat code blocks as meaningful visual blocks when gathering active changes",
    );
    assert.ok(
      webviewContent.includes(
        "const ancestor = el.closest('.mermaid') || el.closest('.katex-block') || el.closest('svg');",
      ),
      "Stable code blocks with inner line diffs should stay granular instead of being promoted through closest('pre')",
    );
    assert.ok(
      webviewContent.includes(
        "let child = el.querySelector('pre') || el.querySelector('.mermaid') || el.querySelector('.katex-block');",
      ),
      "Wrapped code-block insertions should resolve to the pre container for active highlighting",
    );
    assert.ok(
      webviewContent.includes(".selected-change.selected-ins {") &&
        webviewContent.includes(
          "background-color: rgba(34, 197, 94, 0.25) !important;",
        ),
      "Inserted active changes should use green selection styling instead of the old yellow overlay",
    );
    assert.ok(
      webviewContent.includes("pre.selected-change.selected-ins,") &&
        webviewContent.includes("border: 1px solid #22c55e !important;") &&
        webviewContent.includes(
          "box-shadow: 0 0 0 2px rgba(34, 197, 94, 0.8) !important;",
        ),
      "Inserted complex blocks like code blocks should use the same green diff palette as other added highlights in the diff view",
    );
    assert.ok(
      webviewContent.includes(".selected-change.selected-del {") &&
        webviewContent.includes(
          "background-color: rgba(248, 113, 113, 0.2) !important;",
        ),
      "Deleted active changes should use the same red diff palette as other removed highlights in the diff view",
    );
    assert.ok(
      !webviewContent.includes(
        "background-color: rgba(255, 200, 0, 0.3) !important;",
      ),
      "Active change styling should no longer use the old yellow generic highlight color",
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
      /ins:has\(> h1, > h2, > h3, > h4, > h5, > h6, > p, > img, > table, > \.table-scroll, > ul, > ol, > dl, > li, > blockquote, > div, > pre, > hr, > section, > details, > summary, > figure\),[\s\S]*del:has\(> h1, > h2, > h3, > h4, > h5, > h6, > p, > img, > table, > \.table-scroll, > ul, > ol, > dl, > li, > blockquote, > div, > pre, > hr, > section, > details, > summary, > figure\) \{[\s\S]*display: block;[\s\S]*width: fit-content;/m.test(
        webviewContent,
      ),
      "Modified headings should be set as block elements so the background color spans the full pane width",
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

  it("should wrap tables in their own horizontal scroll container", () => {
    const webviewContent = provider.getWebviewContent(
      "<table><tbody><tr><th>Feature</th><th>Status</th></tr><tr><td>Rich Markdown Diff</td><td>Enabled</td></tr></tbody></table>",
      "katex.css",
      "mermaid.js",
      "hljs-light.css",
      "hljs-dark.css",
    );

    assert.ok(
      /<div class="table-scroll">\s*<table>/m.test(webviewContent),
      "Tables should be wrapped in a dedicated scroll container so wide tables scroll locally instead of stretching the pane",
    );
    assert.ok(
      /\.table-scroll \{[\s\S]*overflow-x: auto;[\s\S]*overflow-y: hidden;/m.test(
        webviewContent,
      ),
      "Table wrappers should own the horizontal overflow behavior",
    );
    assert.ok(
      /table \{[\s\S]*width: max-content;[\s\S]*max-width: none;/m.test(
        webviewContent,
      ),
      "Tables inside the scroll container should be allowed to grow to their intrinsic width so the wrapper can scroll them",
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
    const { html: diff } = provider.computeDiff(oldMd, newMd);

    assert.ok(
      diff.includes("[1.1.1] - 2026-03-20"),
      "Heading [1.1.1] should remain contiguous in diff output even when source lines shift",
    );
  });

  it("should show inline diff within headings when heading text changes", async () => {
    const oldMd = "# Old Title\n\nSome text.";
    const newMd = "# New Title\n\nSome text.";
    const { html: diff } = provider.computeDiff(oldMd, newMd);

    // The heading should still exist as an h1
    assert.ok(diff.includes("<h1"), "Output should contain an h1 element");
    // Should show inline diff markers within the heading, not a full replacement
    assert.ok(
      diff.includes("diffmod") ||
        diff.includes("diffdel") ||
        diff.includes("diffins"),
      "Changed heading should contain inline diff markers",
    );
    // The heading tag should wrap the diff markers, not the other way around
    assert.ok(
      !diff.includes("<del") || /<h1[^>]*>[^]*<\/h1>/.test(diff),
      "Diff markers should be inside the heading, not wrapping it",
    );
  });

  it("should highlight completely new heading additions with diff classes", async () => {
    const oldMd = "# Doc\n\nPara one.";
    const newMd = "# Doc\n\n## New Section\n\nNew content.\n\nPara one.";
    const { html: diff } = provider.computeDiff(oldMd, newMd);

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
    const { html: diff } = provider.computeDiff(oldMd, newMd);

    // The old heading text must appear as one contiguous string inside a
    // single <h3>, not split across multiple heading elements.
    const h3s = diff.match(/<h3[^>]*>[\s\S]*?<\/h3>/g) || [];
    const leftVisible = h3s.map((h) =>
      h.replace(/<ins[^>]*>[\s\S]*?<\/ins>/g, "").replace(/<[^>]+>/g, ""),
    );

    // The old heading text must appear mostly intact inside a heading
    const combined = leftVisible.join(" ");
    assert.ok(
      combined.includes("3") && combined.includes("Compare with Clipboard"),
      "Left pane should show '3. Compare with Clipboard' as a complete heading",
    );
  });

  it("should not wrap entire code blocks when only part changes", () => {
    const oldMd = 'Text\n\n```python\nprint("hello")\n```\n\nEnd.';
    const newMd = 'Text\n\n```python\nprint("world")\n```\n\nEnd.';
    const { html: diff } = provider.computeDiff(oldMd, newMd);

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
    const { html: diff } = provider.computeDiff(
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
      /del\.diffdel\.diff-block,\s*del\.diffmod\.diff-block,[\s\S]*?ins\.diffins\.diff-block,\s*ins\.diffmod\.diff-block\s*\{[^}]*border:\s*1px\s+solid/m.test(
        webviewContent,
      ),
      "Block-level diff containers should use a 1px border for consistency",
    );
    assert.ok(
      /\.diffins[\s\S]*\.katex-block[\s\S]*border:\s*1px\s+solid/m.test(
        webviewContent,
      ),
      "Complex inserted KaTeX blocks should also use a 1px border",
    );
    assert.ok(
      webviewContent.includes(
        "body.inline-mode #right-pane :is(del.diffdel.diff-block, del.diffmod.diff-block, ins.diffins.diff-block, ins.diffmod.diff-block) {",
      ),
      "Inline view should explicitly preserve block-level diff wrappers instead of falling back to inline deletion styling",
    );
    assert.ok(
      webviewContent.includes(
        "body.inline-mode #right-pane del + ins .task-list-item-checkbox {",
      ),
      "Inline view should only reset inserted checkbox spacing when it directly follows a deleted checkbox in the same task item",
    );
    assert.ok(
      !webviewContent.includes(
        "body.inline-mode #right-pane ins .task-list-item-checkbox {",
      ),
      "Inline view should not shift every inserted task-list checkbox to the right",
    );
    assert.ok(
      webviewContent.includes(
        ":is(del.diffdel.diff-block, del.diffmod.diff-block, ins.diffins.diff-block, ins.diffmod.diff-block):has(> pre) {",
      ) &&
        webviewContent.includes("padding: 0;") &&
        webviewContent.includes("overflow: hidden;"),
      "Block-level code diffs should let the outer diff wrapper own the add/remove highlight instead of keeping extra inner wrapper padding",
    );
    assert.ok(
      webviewContent.includes(
        ":is(del.diffdel.diff-block, del.diffmod.diff-block, ins.diffins.diff-block, ins.diffmod.diff-block):has(> pre) > pre {",
      ) &&
        webviewContent.includes("background-color: transparent;") &&
        webviewContent.includes("border: none;"),
      "Wrapped code blocks should drop their opaque pre background so the same green or red diff highlight shows through as other block diffs",
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
    const { html: diff } = provider.computeDiff(oldMd, newMd);

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
    const { html: diff } = provider.computeDiff(oldMd, newMd);

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
    const { html: diff } = provider.computeDiff(oldMd, newMd);

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

  it("should mark list items when an entire list is newly inserted", () => {
    const oldMd = "";
    const newMd = "- First item\n- Second item\n- Third item";
    const { html: diff } = provider.computeDiff(oldMd, newMd);

    const insertedItems = diff.match(/data-all-inserted="true"/g) ?? [];
    assert.strictEqual(
      insertedItems.length,
      3,
      `Expected all inserted list items to be marked. HTML was: ${diff}`,
    );

    assert.ok(
      diff.includes("First item"),
      "Inserted list text should remain visible",
    );
  });

  it("should keep reparented nested bullets neutral when only the parent item changes", () => {
    const oldMd =
      '1. **Run/Debug:**\n   - Open this project in VS Code.\n   - Press `F5` to launch an "Extension Development Host" instance.';
    const newMd =
      '1. **Run and debug.**\n\n- Open this project in VS Code.\n- Press `F5` to launch an "Extension Development Host" instance.';
    const { html: diff } = provider.computeDiff(oldMd, newMd);

    const hasItems = diff.includes("Open this project in VS Code");
    assert.ok(
      hasItems,
      "The shared bullet list text content must remain visible",
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
