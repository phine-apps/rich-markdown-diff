import * as assert from "assert";
import { MarkdownDiffProvider } from "../../markdownDiff";
import { areHtmlTagsBalanced } from "../../markdown/domUtils";
import {
  cleanupUnbalancedDiffTags,
  fixInvalidNesting,
} from "../../markdown/structuralDiff";

describe("Structural Diff HTML Integrity", () => {
  let provider: MarkdownDiffProvider;

  before(async () => {
    provider = new MarkdownDiffProvider();
    await provider.waitForReady();
  });

  describe("fixInvalidNesting", () => {
    it("keeps inline closing tags inside <ins>/<del> when opened inside the diff tag (Step 1)", () => {
      const input = "<ins><code>alpha</code></ins>";
      const result = fixInvalidNesting(input);
      assert.strictEqual(result, "<ins><code>alpha</code></ins>");
      assert.ok(areHtmlTagsBalanced(result));
    });

    it("still moves an inline closing tag outside <ins>/<del> when opened outside (Step 1)", () => {
      const input = "<code><ins>alpha</code> beta</ins>";
      const result = fixInvalidNesting(input);
      assert.ok(areHtmlTagsBalanced(result));
    });

    it("preserves table row refinement when an inserted cell contains inline code", () => {
      const oldMd = "| Col A | Col B |\n| --- | --- |\n| one | two |\n";
      const newMd =
        "| Col A | Col B |\n| --- | --- |\n| one | two |\n| `code` | three |\n";

      const { html } = provider.computeDiff(oldMd, newMd);
      assert.ok(areHtmlTagsBalanced(html), "Output HTML must be balanced");
      assert.ok(
        html.includes("<code>") && html.includes("three"),
        "Inserted row content should be preserved",
      );
      assert.ok(
        !html.includes("<del>one</del>"),
        "Unchanged row should not be marked as deleted",
      );
    });

    it("does not corrupt preceding inline tags when another inline tag is inside <ins> (Step 3)", () => {
      const input = "<p><code>a</code> text <ins><code>b</code></ins></p>";
      const result = fixInvalidNesting(input);
      assert.ok(areHtmlTagsBalanced(result), `Unbalanced HTML: ${result}`);
      assert.strictEqual(
        result,
        "<p><code>a</code> text <ins><code>b</code></ins></p>",
      );
    });

    it("balances crossed inline tags cleanly when the outer tag is genuinely open at <ins>", () => {
      const input = "<p><code>a <ins>b</code> c</ins></p>";
      const result = fixInvalidNesting(input);
      assert.ok(areHtmlTagsBalanced(result), `Unbalanced HTML: ${result}`);
      assert.strictEqual(result, "<p><code>a <ins>b c</ins></code></p>");
    });

    it("handles nested block-like containers without cutting short at inner close tags (Step 4)", () => {
      const input =
        '<div class="outer"><p>unchanged</p><div class="inner"><ins>added</ins></div></div>';
      const result = fixInvalidNesting(input);
      assert.ok(areHtmlTagsBalanced(result), `Unbalanced HTML: ${result}`);
      assert.ok(
        result.includes(
          '<ins class="diffins diff-block"><div class="inner">added</div></ins>',
        ),
        `Expected inner div to be promoted, got: ${result}`,
      );
    });

    it("balances diff tags at block boundaries for non-promoted blocks (Step 4)", () => {
      const input =
        '<ul><li>same <ins class="diffins"></li></ul><table><tr><td>x</td></tr></table></ins>';
      const nestedFixed = fixInvalidNesting(input);
      assert.ok(
        nestedFixed.includes('<li>same <ins class="diffins"></ins></li>'),
        `Expected <ins> to be closed inside <li>, got: ${nestedFixed}`,
      );
      const cleaned = cleanupUnbalancedDiffTags(nestedFixed);
      assert.ok(areHtmlTagsBalanced(cleaned), `Unbalanced HTML: ${cleaned}`);
    });
  });

  describe("cleanupUnbalancedDiffTags", () => {
    it("preserves word-separating whitespace when a space changes to a soft line break", () => {
      const oldMd = "small propulsion unit";
      const newMd = "small\npropulsion unit";
      const { html } = provider.computeDiff(oldMd, newMd);

      assert.ok(areHtmlTagsBalanced(html));
      assert.ok(
        !/smallpropulsion/i.test(html),
        `Words must not merge on soft break: ${html}`,
      );
    });

    it("collapses adjacent opposite-polarity whitespace-only diff tags in running text to a plain space", () => {
      const input =
        '<p>small<del class="diffmod"> </del><ins class="diffmod">\n</ins>propulsion</p>';
      const result = cleanupUnbalancedDiffTags(input);
      assert.strictEqual(result, "<p>small propulsion</p>");
    });

    it("still removes whitespace-only diff tags at block boundaries", () => {
      const input = '<p>first</p><ins class="diffins">\n</ins><p>second</p>';
      const result = cleanupUnbalancedDiffTags(input);
      assert.strictEqual(result, "<p>first</p><p>second</p>");
    });
  });
});
