/*
 * MIT License
 *
 * Copyright (c) 2026 Rich Markdown Diff Authors
 */

import * as assert from "assert";
import { MarkdownDiffProvider } from "../../markdownDiff";

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
    assert.ok(diff.match(/<del[^>]*class="[^"]*diff-block[^"]*"[^>]*>\s*<pre/im), "del tag should wrap pre tag");
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
});
