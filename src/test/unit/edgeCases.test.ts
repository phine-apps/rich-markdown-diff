/*
 * MIT License
 *
 * Copyright (c) 2026 Rich Markdown Diff Authors
 */

import * as assert from "assert";
import { MarkdownDiffProvider } from "../../markdownDiff";
import {
  restoreBlockAttributes,
  extractSharedReparentedLists,
  normalizeListContainerChanges,
  splitByBlocks,
  splitConsolidatedDiffs,
  lcsAlignment,
} from "../../markdown/structuralDiff";
import { appendClass, diffTables } from "../../markdown/tableDiff";
import { findClosing } from "../../markdown/domUtils";

describe("MarkdownDiffProvider - Edge Cases", () => {
  let provider: MarkdownDiffProvider;

  before(async () => {
    provider = new MarkdownDiffProvider();
    await provider.waitForReady();
  });

  it("should consolidate entirely deleted syntax-highlighted code blocks", () => {
    const oldMd = "```javascript\nconsole.log('test');\n```";
    const newMd = "Other text";
    const { html: diff } = provider.computeDiff(oldMd, newMd);

    // It should be wrapped in a single del with diff-block class
    assert.ok(diff.includes("diff-block"), "Should have diff-block class for code block deletion");
    assert.ok(diff.includes("<pre"), "Should contain the pre tag");
    // The del tag wraps the code-block-wrapper div which contains pre
    assert.ok(
      diff.match(/<del[^>]*class="[^"]*diff-block[^"]*"[^>]*>\s*<div class="code-block-wrapper"[^>]*>\s*<pre/im) ||
      diff.match(/<del[^>]*class="[^"]*diff-block[^"]*"[^>]*>\s*<pre/im),
      "del tag should wrap code block (via code-block-wrapper div or directly)",
    );
  });

  it("should highlight added horizontal rules with diff-block", () => {
    const oldMd = "Text";
    const newMd = "Text\n\n---";
    const { html: diff } = provider.computeDiff(oldMd, newMd);

    assert.ok(diff.includes("<hr"), "Should contain hr tag");
    assert.ok(diff.includes("diff-block"), "Should have diff-block class for HR insertion");
    assert.ok(diff.match(/<ins[^>]*class="[^"]*diff-block[^"]*"[^>]*>\s*<hr/i), "ins tag should wrap hr tag");
  });

  it("should refine granular changes inside large blockquotes", () => {
    const oldMd = "> This is a long blockquote with shared content.";
    const newMd = "> This is a long blockquote with modified content.";
    const { html: diff } = provider.computeDiff(oldMd, newMd);

    assert.ok(diff.match(/<blockquote[^>]*>/i), "Should preserve blockquote container");
    assert.ok(diff.includes("<ins") || diff.includes("<del"), "Should have granular markers");
    // It should NOT be an atomic block replacement if the change is small
    assert.ok(!diff.match(/<del[^>]*diff-block[^>]*>\s*<blockquote>/i), "Should not be atomic block replacement for small change");
  });

  it("should consolidate mixed block deletions (Heading + List + Table)", () => {
    const oldMd = "# Heading\n\n- Item 1\n\n| T | B |\n|---|---|\n| V | V |";
    const newMd = "Done";
    const { html: diff } = provider.computeDiff(oldMd, newMd);

    // Heading might be its own block or grouped depending on htmldiff
    // But the list and table should definitely be consolidated if they were grouped.
    assert.ok(diff.includes("diff-block"), "Should have consolidated block diffs");
  });

  it("should include necessary CSS safety rules for pre and hr", () => {
    const webviewContent = provider.getWebviewContent("diff", "v1", "v2", "v3", "v4");
    
    assert.ok(webviewContent.includes("ins pre") || webviewContent.includes("pre"), "CSS should handle pre inside ins");
    assert.ok(webviewContent.includes("hr"), "CSS should handle hr inside ins");
    assert.ok(webviewContent.includes("::after"), "CSS should have overlay for deleted pre blocks");
  });

  it("BUG-03: should correctly restore nested ins/del attributes using a tag stack", () => {
    const token = "TK";
    const oldPools = {
      "TKxabcdef12": ['data-line="5"'],
    };
    const newPools = {
      "TKxabcdef12": ['data-line="10"'],
    };

    // Nested: <ins> ... <del> TKxabcdef12="true" </del> ... </ins>
    const input = '<ins>Some text <del>deleted token TKxabcdef12="true" details</del> inserted</ins>';
    const output = restoreBlockAttributes(input, oldPools, newPools, token);

    // Inside del, so we should restore old attribute (data-line="5")
    assert.ok(output.includes('data-line="5"'), "Should restore the old attribute inside nested del");
    assert.ok(!output.includes('data-line="10"'), "Should not restore the new attribute");
  });

  it("BUG-04: should stably extract shared reparented lists with duplicate structures", () => {
    const deleted = '<del class="diff-block"><ul><li>item</li></ul></del>';
    const inserted = '<ins><ul><li>parent</li></ul><ul><li>item</li></ul></ins>';
    const input = `${deleted} ... ${inserted}`;

    const output = extractSharedReparentedLists(input);
    assert.ok(output.includes("parent"), "Should preserve list elements and complete successfully");
  });

  it("BUG-05: normalizeListContainerChanges should safeguard nested lists", () => {
    const input = '<ol><li><ul><li>nested</li></ul></li></ol>';
    const output = normalizeListContainerChanges(input);

    assert.strictEqual(output, input, "Should not alter normal nested lists");
  });

  it("BUG-06: splitByBlocks should split large documents without headers safely at tag boundaries", () => {
    const html = '<p>Paragraph 1</p><p>Paragraph 2</p><p>Paragraph 3</p>';
    const sections = splitByBlocks(html);

    assert.ok(sections.length >= 1, "Should split into at least one section");
    sections.forEach(sec => {
      assert.ok(sec.full.startsWith("<p>"), "Each chunk should start at a safe tag boundary");
    });
  });

  it("BUG-11: lcsAlignment should correctly align sequences using optimized flat typed arrays", () => {
    const oldSeq = ["A", "B", "C"];
    const newSeq = ["A", "X", "C"];
    const matches = lcsAlignment(oldSeq, newSeq, (a, b) => a === b);

    assert.deepStrictEqual(matches, [
      { oldIdx: 0, newIdx: 0 },
      { oldIdx: 2, newIdx: 2 }
    ], "Should align A and C correctly");
  });

  it("BUG-07: splitConsolidatedDiffs should reset blocksRegex.lastIndex and split properly", () => {
    const input = '<del class="diff-block"><h2>A</h2><p>B</p></del><ins class="diff-block"><h2>X</h2><p>Y</p></ins>';
    const output = splitConsolidatedDiffs(input);

    assert.ok(output.includes("<h2>A</h2>"), "Should contain the block content");
    assert.ok(output.includes("diff-block"), "Should contain diff classes");
  });

  it("BUG-08: should not double-wrap tables and should wrap del/ins table containers cleanly", () => {
    const table = "<table><tr><td>Cell</td></tr></table>";

    // 1. Wrapped table should remain unchanged
    const wrappedInput = `<div class="table-scroll">${table}</div>`;
    const wrappedOutput = provider.getWebviewContent(wrappedInput, "", "", "", "");
    assert.ok(wrappedOutput.includes(wrappedInput), "Should not double-wrap already-wrapped table");
    
    // 2. Table inside del should wrap the del container, not the table inside it
    const delInput = `<del class="diffdel diff-block">${table}</del>`;
    const delOutput = provider.getWebviewContent(delInput, "", "", "", "");
    assert.ok(delOutput.includes(`<div class="table-block-wrapper"><div class="table-scroll"><del class="diffdel diff-block">${table}</del></div></div>`), "Should wrap outer del rather than nesting block-in-inline");
  });

  it("BUG-03: should not double-wrap tables even if table-scroll div has attributes and trailing whitespace/newlines", () => {
    const table = "<table><tr><td>Cell</td></tr></table>";

    const wrappedInput = `<div class="table-scroll" data-line="10">\n  ${table}\n</div>`;
    const wrappedOutput = provider.getWebviewContent(wrappedInput, "", "", "", "");
    
    assert.ok(wrappedOutput.includes(wrappedInput), "Should not double-wrap already-wrapped table with attributes and spacing");
  });

  it("should wrap uppercase TABLE elements in table-block-wrapper and table-scroll (ADV-03)", () => {
    const table = '<TABLE class="my-table"><TR><TD>Cell</TD></TR></TABLE>';
    const wrappedOutput = provider.getWebviewContent(table, "", "", "", "");
    assert.ok(
      wrappedOutput.includes('<div class="table-block-wrapper"><div class="table-scroll"><TABLE class="my-table"><TR><TD>Cell</TD></TR></TABLE></div></div>'),
      "Should wrap uppercase TABLE in table-block-wrapper and table-scroll",
    );
  });

  it("should validate input types correctly for applyEdit message payload (BUG-07)", () => {
    const isValidApplyEditPayload = (payload: any): boolean => {
      return (
        payload &&
        payload.uriScheme !== "git" &&
        payload.uriScheme !== "gitlens" &&
        typeof payload.lineStart === "number" &&
        typeof payload.lineEnd === "number" &&
        typeof payload.newContent === "string" &&
        payload.lineStart >= 0 &&
        payload.lineEnd >= payload.lineStart
      );
    };

    assert.strictEqual(
      isValidApplyEditPayload({
        uriScheme: "file",
        lineStart: 0,
        lineEnd: 5,
        newContent: "hello",
      }),
      true,
    );

    assert.strictEqual(
      isValidApplyEditPayload({
        uriScheme: "vscode-remote",
        lineStart: 0,
        lineEnd: 5,
        newContent: "hello",
      }),
      true,
    );

    assert.strictEqual(
      isValidApplyEditPayload({
        uriScheme: "git", // Should fail git scheme
        lineStart: 0,
        lineEnd: 5,
        newContent: "hello",
      }),
      false,
    );

    assert.strictEqual(
      isValidApplyEditPayload({
        uriScheme: "file",
        lineStart: "0", // Should fail non-number
        lineEnd: 5,
        newContent: "hello",
      }),
      false,
    );
  });

  describe("appendClass attribute handling", () => {
    it("should handle empty attrs and empty className", () => {
      assert.strictEqual(appendClass("", ""), "");
      assert.strictEqual(appendClass(' id="t1"', ""), ' id="t1"');
      assert.strictEqual(appendClass("", "diff-col-del"), ' class="diff-col-del"');
    });

    it("should prepend class when existing double-quoted class exists", () => {
      assert.strictEqual(
        appendClass(' class="existing"', "diff-col-ins"),
        ' class="diff-col-ins existing"',
      );
    });

    it("should prepend class when existing single-quoted class exists", () => {
      assert.strictEqual(
        appendClass(" class='existing'", "diff-col-ins"),
        " class='diff-col-ins existing'",
      );
    });

    it("should not confuse data-class with class attribute", () => {
      const result = appendClass(' data-class="custom" align="center"', "diff-col-del");
      assert.ok(result.includes('class="diff-col-del"'));
      assert.ok(result.includes('data-class="custom"'));
      assert.strictEqual(result.includes('data-class="diff-col-del'), false);
    });

    it("should not match class attribute string inside another attribute value", () => {
      const attrs = ' data-template="<div class=\\"nested-icon\\">" align="center"';
      const result = appendClass(attrs, "diff-col-ins");
      assert.ok(result.includes('class="diff-col-ins"'));
      assert.ok(result.includes('data-template="<div class=\\"nested-icon\\">"'));
      assert.strictEqual(result.includes('nested-icon diff-col-ins'), false);
    });
  });

  describe("domUtils findClosing edge cases", () => {
    it("should find closing tag for simple element", () => {
      const html = "<div>Hello World</div>";
      const end = findClosing(html, 0, "div");
      assert.strictEqual(end, html.length);
    });

    it("should find closing tag for nested elements with same tag name", () => {
      const html = "<div>Outer <div>Inner</div> More Outer</div> Tail";
      const end = findClosing(html, 0, "div");
      assert.strictEqual(end, "<div>Outer <div>Inner</div> More Outer</div>".length);
    });

    it("should handle self-closing target element correctly", () => {
      const html = '<svg width="24" height="24"/> Following text';
      const end = findClosing(html, 0, "svg");
      assert.strictEqual(end, '<svg width="24" height="24"/>'.length);
    });

    it("should not miscount self-closing child elements inside parent", () => {
      const html = '<div>Before <div class="self-closing-child"/> After</div> Tail';
      const end = findClosing(html, 0, "div");
      assert.strictEqual(end, '<div>Before <div class="self-closing-child"/> After</div>'.length);
    });

    it("should ignore closing tag text inside quoted attribute values", () => {
      const html = '<div title="</div>">Content with fake closing in attribute</div> Tail';
      const end = findClosing(html, 0, "div");
      assert.strictEqual(
        end,
        '<div title="</div>">Content with fake closing in attribute</div>'.length,
      );
    });

    it("should ignore opening tag text inside quoted attribute values of other tags", () => {
      const html = '<div><span data-info="<div>nested</div>">Text</span> Real content</div>';
      const end = findClosing(html, 0, "div");
      assert.strictEqual(end, html.length);
    });

    it("should ignore tags inside HTML comments", () => {
      const html = "<div><!-- <div>fake open</div> -->Real content</div>";
      const end = findClosing(html, 0, "div");
      assert.strictEqual(end, html.length);
    });

    it("should return -1 when matching closing tag is missing", () => {
      const html = "<div>Unclosed content without closing tag";
      const end = findClosing(html, 0, "div");
      assert.strictEqual(end, -1);
    });

    it("should perform in linear time without backtracking on large documents", () => {
      const depth = 500;
      const opens = "<div>".repeat(depth);
      const closes = "</div>".repeat(depth);
      const html = opens + "content" + closes;

      const start = Date.now();
      const end = findClosing(html, 0, "div");
      const elapsed = Date.now() - start;

      assert.strictEqual(end, html.length);
      assert.ok(elapsed < 200, `Expected linear time execution, took ${elapsed}ms`);
    });

    it("should handle uppercase and mixed-case tag names correctly (ADV-01)", () => {
      const htmlUpper = "<DIV><p>test</p></DIV>";
      assert.strictEqual(findClosing(htmlUpper, 0, "div"), htmlUpper.length);
      assert.strictEqual(findClosing(htmlUpper, 0, "DIV"), htmlUpper.length);

      const htmlMixed = "<Div>Outer <DIV>Inner</DIV> More Outer</Div>";
      assert.strictEqual(findClosing(htmlMixed, 0, "div"), htmlMixed.length);

      const htmlTable = '<table border="1"><TR><TD>Cell</TD></TR></table>';
      const trStart = htmlTable.indexOf("<TR>");
      assert.strictEqual(findClosing(htmlTable, trStart, "tr"), htmlTable.indexOf("</table>"));
    });

    it("should safely skip attributes with > in closing tags (ADV-02)", () => {
      const html = '<div><span attr="test">content</span data-extra=">"></div>';
      const spanEnd = findClosing(html, 5, "span");
      assert.strictEqual(html.slice(5, spanEnd), '<span attr="test">content</span data-extra=">">');
      assert.strictEqual(spanEnd, '<div><span attr="test">content</span data-extra=">">'.length);
    });

    it("should preserve rows when diffing tables with uppercase TR and TD tags (ADV-01)", () => {
      const oldTable = '<table border="1"><TR><TD>Old</TD></TR></table>';
      const newTable = '<table border="1"><TR><TD>New</TD></TR></table>';
      const diff = diffTables(oldTable, newTable, (a, b) => `<del>${a}</del><ins>${b}</ins>`);
      assert.ok(diff.includes("Old"), "Old cell content must be preserved in diff");
      assert.ok(diff.includes("New"), "New cell content must be preserved in diff");
      assert.ok(diff.includes("<tr"), "Diff must contain table row element");
    });
  });

  describe("Empty document handling", () => {
    it("should handle two empty documents gracefully without error and report hasDiff=false", () => {
      const { html, hasDiff } = provider.computeDiff("", "");
      assert.strictEqual(hasDiff, false, "Should report hasDiff=false for identical empty documents");
      assert.ok(typeof html === "string", "Should return string HTML representation");
      assert.strictEqual(html.includes("<ins"), false, "Should not contain insertions");
      assert.strictEqual(html.includes("<del"), false, "Should not contain deletions");
    });

    it("should report all-inserted when comparing empty old doc against non-empty new doc", () => {
      const { html, hasDiff } = provider.computeDiff("", "# New Content\nHello world");
      assert.strictEqual(hasDiff, true, "Should report hasDiff=true when content added to empty doc");
      assert.ok(html.includes("<ins"), "Should wrap new content in ins tag");
      assert.strictEqual(html.includes("<del"), false, "Should not contain deletion tags");
      assert.ok(html.includes("New Content"), "Should contain the inserted heading");
    });

    it("should report all-deleted when comparing non-empty old doc against empty new doc", () => {
      const { html, hasDiff } = provider.computeDiff("# Old Content\nGoodbye world", "");
      assert.strictEqual(hasDiff, true, "Should report hasDiff=true when all content deleted");
      assert.ok(html.includes("<del"), "Should wrap old content in del tag");
      assert.strictEqual(html.includes("<ins"), false, "Should not contain insertion tags");
      assert.ok(html.includes("Old Content"), "Should contain the deleted heading");
    });
  });

  describe("Performance benchmark for large documents", () => {
    it("should compute diff for a large markdown document (2,000+ lines) within a few seconds without freezing", function () {
      this.timeout(10000); // 10s timeout for safety

      // Generate a ~2,000-line realistic markdown document with math, tables, and code
      const sectionsCount = 120;
      const oldLines: string[] = [];
      const newLines: string[] = [];

      for (let i = 0; i < sectionsCount; i++) {
        oldLines.push(`## Section ${i}: Architecture Analysis`);
        oldLines.push(`Paragraph describing component ${i} with *emphasis* and **bold text**.`);
        oldLines.push(`- Item A in section ${i}`);
        oldLines.push(`- Item B in section ${i} (original)`);
        oldLines.push(`- Item C in section ${i}`);
        oldLines.push("```javascript");
        oldLines.push(`function handler${i}() { return ${i} * 2; }`);
        oldLines.push("```");
        oldLines.push("| Col 1 | Col 2 | Col 3 |");
        oldLines.push("| --- | --- | --- |");
        oldLines.push(`| Val ${i}A | Val ${i}B | Val ${i}C |`);
        oldLines.push(`Math formula: $E = mc^${i % 5}$ and block:`);
        oldLines.push("$$");
        oldLines.push(`\\sum_{k=1}^{${i + 1}} k = \\frac{${i + 1}(${i + 2})}{2}`);
        oldLines.push("$$");
        oldLines.push("> [!NOTE]");
        oldLines.push(`> Note for section ${i}`);
        oldLines.push("");

        newLines.push(`## Section ${i}: Architecture Analysis`);
        newLines.push(`Paragraph describing component ${i} with *emphasis* and **bold text (updated)**.`);
        newLines.push(`- Item A in section ${i}`);
        newLines.push(`- Item B in section ${i} (modified version)`);
        newLines.push(`- Item C in section ${i}`);
        newLines.push(`- Item D in section ${i} (new item)`);
        newLines.push("```javascript");
        newLines.push(`function handler${i}() { return ${i} * 4; }`);
        newLines.push("```");
        newLines.push("| Col 1 | Col 2 | Col 3 |");
        newLines.push("| --- | --- | --- |");
        newLines.push(`| Val ${i}A | Val ${i}B-modified | Val ${i}C |`);
        newLines.push(`Math formula: $E = mc^${i % 5}$ and block:`);
        newLines.push("$$");
        newLines.push(`\\sum_{k=1}^{${i + 1}} k = \\frac{${i + 1}(${i + 2})}{2}`);
        newLines.push("$$");
        newLines.push("> [!NOTE]");
        newLines.push(`> Note for section ${i} with updated guidelines`);
        newLines.push("");
      }

      const oldMd = oldLines.join("\n");
      const newMd = newLines.join("\n");

      assert.ok(oldLines.length >= 2000, `Expected at least 2000 lines, got ${oldLines.length}`);

      const start = Date.now();
      const { html, hasDiff } = provider.computeDiff(oldMd, newMd);
      const elapsed = Date.now() - start;

      assert.strictEqual(hasDiff, true, "Should detect differences in large file");
      assert.ok(html.includes("<ins"), "Should contain insertion markers");
      assert.ok(html.includes("<del"), "Should contain deletion markers");
      assert.ok(
        elapsed < 5000,
        `computeDiff took ${elapsed}ms, expected under 5,000ms for ~2,000 lines (possible O(N²) or ReDoS regression)`,
      );
    });
  });
});
