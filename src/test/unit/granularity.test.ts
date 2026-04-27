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

    assert.strictEqual(
      hasOuterIns,
      false,
      "Heading should not be wrapped in outer <ins>",
    );
    assert.strictEqual(
      hasOuterDel,
      false,
      "Heading should not be wrapped in outer <del>",
    );

    // It should have inner diff
    assert.ok(
      diffHtml.includes("<ins") && diffHtml.includes("(Updated)"),
      "Should have inner insertion for updated text",
    );
  });

  it("should show granular diff for paragraphs when line numbers shift", () => {
    const oldMd = "This is a paragraph.";
    const newMd = "Added Line\n\nThis is a paragraph (updated).";
    const { html: diffHtml } = provider.computeDiff(oldMd, newMd);

    // The first paragraph "Added Line" should be an insertion
    assert.ok(
      /<ins[^>]*>\s*<p/i.test(diffHtml),
      "The new paragraph should be wrapped in <ins>",
    );

    // The second paragraph should be refined (granular diff)
    // It should look like: <p ...>This is a paragraph<ins ...>(updated)</ins>.</p>
    const isRefined =
      /This is a paragraph\s*<ins[^>]*>.*?\(updated\).*?<\/ins>\./i.test(
        diffHtml,
      );
    assert.ok(
      isRefined,
      `Paragraph should be refined with granular diff. HTML was: ${diffHtml}`,
    );

    // The second paragraph itself should not be wrapped in an outer <ins> or <del>
    // We check this by ensuring the <p> for the second paragraph is not immediately preceded by <ins> or <del>
    // Or more simply, that there's no <ins><p...This is a paragraph...
    const hasOuterDiff = /<(ins|del)[^>]*>\s*<p[^>]*>This is a paragraph/i.test(
      diffHtml,
    );
    assert.strictEqual(
      hasOuterDiff,
      false,
      "The refined paragraph should not be wrapped in outer diff tags",
    );

    assert.ok(
      diffHtml.includes("(updated)"),
      "Should contain the updated text",
    );
  });

  it("should show diff coloring for KaTeX equations", () => {
    const oldMd = "";
    const newMd = "New equation added:\n\n$$E=mc^2$$";

    const { html: diffHtml } = provider.computeDiff(oldMd, newMd);

    // The whole content should be inside <ins>
    assert.ok(diffHtml.includes("<ins"), "Should have <ins> tag");
    assert.ok(
      diffHtml.includes("katex-display"),
      "Should have katex-display class",
    );

    // Check if the text "New equation added:" is wrapped in <ins>
    assert.ok(
      /<ins[^>]*>[\s\S]*?New equation added:[\s\S]*?<\/ins>/i.test(diffHtml),
      "Text should be wrapped in <ins>",
    );
  });

  it("should handle multiple heading splits correctly", () => {
    // Adding a new section between existing sections
    const oldMd = "# Title\n\n## Section 1\n\nText 1\n\n## Section 2\n\nText 2";
    const newMd =
      "# Title\n\n## Section 1\n\nText 1\n\n## New Section\n\nNew Text\n\n## Section 2\n\nText 2";

    const { html: diffHtml } = provider.computeDiff(oldMd, newMd);

    // Both "Section 1" and "Section 2" should exist as stable headings
    assert.ok(diffHtml.includes("Section 1"), "Section 1 should be present");
    assert.ok(diffHtml.includes("Section 2"), "Section 2 should be present");
    assert.ok(
      diffHtml.includes("New Section"),
      "New Section should be present",
    );

    // "Section 2" should NOT be wrapped in an <ins> tag because it existed in the old doc
    const hasOuterInsForS2 = /<ins[^>]*>\s*<h2[^>]*>Section 2/i.test(diffHtml);
    assert.strictEqual(
      hasOuterInsForS2,
      false,
      "Section 2 should be recognized as common, not a full insertion",
    );
  });

  it("should preserve KaTeX block structure during refinement", () => {
    // Modifying text around a math block
    const oldMd = "Before\n\n$$\ne=mc^2\n$$\n\nAfter";
    const newMd = "Before (update)\n\n$$\ne=mc^2\n$$\n\nAfter (update)";

    const { html: diffHtml } = provider.computeDiff(oldMd, newMd);

    // The math block itself should be unchanged and thus have NO diff markers wrapping it
    // (Consolidation might try to group it if we're not careful)
    const mathBlockRegex = /<p[^>]*class="katex-block"[\s\S]*?<\/p>/i;
    const mathMatch = diffHtml.match(mathBlockRegex);
    assert.ok(mathMatch, "Math block should be present");

    const mathContent = mathMatch[0];
    assert.strictEqual(
      mathContent.includes("<ins"),
      false,
      "Math block content should not contain insertions",
    );
    assert.strictEqual(
      mathContent.includes("<del"),
      false,
      "Math block content should not contain deletions",
    );

    // Ensure it's not wrapped in a diff tag
    const wrappedInDiff = /<(ins|del)[^>]*>\s*<p[^>]*class="katex-block"/i.test(
      diffHtml,
    );
    assert.strictEqual(
      wrappedInDiff,
      false,
      "Math block should not be wrapped in outer diff tags when unchanged",
    );
  });

  it("should wrap fully inserted KaTeX blocks as block diffs", () => {
    const oldMd = "```ts\nconst answer = 42;\n```";
    const newMd =
      "```ts\nconst answer = 42;\n```\n\nNew equation added:\n\n$$\n\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}\n$$";

    const { html: diffHtml } = provider.computeDiff(oldMd, newMd);

    assert.ok(
      /<ins[^>]*class="[^"]*diff-block[^"]*"[^>]*>\s*<p[^>]*class="katex-block"/i.test(
        diffHtml,
      ),
      "A fully inserted KaTeX block should be wrapped by a block-level insertion",
    );
    const wrappedMathBlock = diffHtml.match(
      /<ins[^>]*class="[^"]*diff-block[^"]*"[^>]*>\s*(<p[^>]*class="katex-block"[^>]*>[\s\S]*?<\/p>)\s*<\/ins>/i,
    )?.[1];

    assert.ok(
      wrappedMathBlock,
      "The inserted KaTeX block should be captured inside the outer block diff",
    );
    assert.strictEqual(
      /<ins\b/i.test(wrappedMathBlock || ""),
      false,
      "KaTeX block markup should not contain inline diff tags inside the rendered math DOM",
    );
  });
});
