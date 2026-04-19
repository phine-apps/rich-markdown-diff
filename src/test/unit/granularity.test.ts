/*
 * MIT License
 *
 * Copyright (c) 2026 Rich Markdown Diff Authors
 */

import { MarkdownDiffProvider } from "../../markdownDiff";
import * as assert from "assert";

describe("Granularity Tests", () => {
  let provider: MarkdownDiffProvider;

  beforeEach(async () => {
    provider = new MarkdownDiffProvider();
    await provider.waitForReady();
  });

  it("should show granular diff for headings even when line numbers shift", () => {
    // Adding a line at the top shifts the line numbers for the heading
    const oldMd = "# Heading";
    const newMd = "New Line\n\n# Heading (Updated)";
    
    const { html: diffHtml } = provider.computeDiff(oldMd, newMd);

    // With granular diffing, Heading should be common, (Updated) should be ins.
    // AND it should NOT be fully wrapped in a large ins/del block at the h1 level.
    
    // The h1 should definitely exist
    assert.ok(diffHtml.includes("<h1"), "H1 tag should exist");
    
    // It should contain an <ins> only for the "(Updated)" part or the whole text, 
    // but the <h1> tag itself should NOT be inside an <ins> if it matches a deleted <h1>.
    
    // Check that we DON'T have <ins><h1 or <del><h1 (unless it was completely replaced)
    const hasOuterIns = /<ins[^>]*>\s*<h1/i.test(diffHtml);
    const hasOuterDel = /<del[^>]*>\s*<h1/i.test(diffHtml);
    
    assert.strictEqual(hasOuterIns, false, "Heading should not be wrapped in outer <ins>");
    assert.strictEqual(hasOuterDel, false, "Heading should not be wrapped in outer <del>");
    
    // It should have inner diff
    assert.ok(diffHtml.includes("<ins") && diffHtml.includes("(Updated)"), "Should have inner insertion for updated text");
  });

  it("should show granular diff for paragraphs when line numbers shift", () => {
    const oldMd = "This is a paragraph.";
    const newMd = "Added Line\n\nThis is a paragraph (updated).";
    const { html: diffHtml } = provider.computeDiff(oldMd, newMd);

    // The first paragraph "Added Line" should be an insertion
    assert.ok(/<ins[^>]*>\s*<p/i.test(diffHtml), "The new paragraph should be wrapped in <ins>");
    
    // The second paragraph should be refined (granular diff)
    // It should look like: <p ...>This is a paragraph<ins ...>(updated)</ins>.</p>
    const isRefined = /This is a paragraph\s*<ins[^>]*>.*?\(updated\).*?<\/ins>\./i.test(diffHtml);
    assert.ok(isRefined, `Paragraph should be refined with granular diff. HTML was: ${diffHtml}`);
    
    // The second paragraph itself should not be wrapped in an outer <ins> or <del>
    // We check this by ensuring the <p> for the second paragraph is not immediately preceded by <ins> or <del>
    // Or more simply, that there's no <ins><p...This is a paragraph...
    const hasOuterDiff = /<(ins|del)[^>]*>\s*<p[^>]*>This is a paragraph/i.test(diffHtml);
    assert.strictEqual(hasOuterDiff, false, "The refined paragraph should not be wrapped in outer diff tags");


    
    assert.ok(diffHtml.includes("(updated)"), "Should contain the updated text");
  });

  it("should show diff coloring for KaTeX equations", () => {

    const oldMd = "";
    const newMd = "New equation added:\n\n$$E=mc^2$$";
    
    const { html: diffHtml } = provider.computeDiff(oldMd, newMd);

    // The whole content should be inside <ins>
    assert.ok(diffHtml.includes('<ins'), "Should have <ins> tag");
    assert.ok(diffHtml.includes('katex-display'), "Should have katex-display class");
    
    // Check if the text "New equation added:" is wrapped in <ins>
    assert.ok(/<ins[^>]*>[\s\S]*?New equation added:[\s\S]*?<\/ins>/i.test(diffHtml), "Text should be wrapped in <ins>");
  });
});

