import * as assert from "assert";
import { MarkdownDiffProvider } from "../../markdownDiff";
import { areHtmlTagsBalanced } from "../../markdown/domUtils";
import {
  cleanupUnbalancedDiffTags,
  consolidateBlockDiffs,
  extractSharedReparentedLists,
  fixInvalidNesting,
  markGhostListItems,
  splitConsolidatedDiffs,
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

  describe("code block hunk pairing (H-3)", () => {
    it("does not merge or drop unrelated code blocks across unchanged sections", () => {
      const oldMd = [
        "## Section 1",
        "",
        "```js",
        "deletedInSectionOne();",
        "```",
        "",
        "## Section 2",
        "",
        "Unchanged middle paragraph.",
        "",
        "## Section 3",
      ].join("\n");

      const newMd = [
        "## Section 1",
        "",
        "## Section 2",
        "",
        "Unchanged middle paragraph.",
        "",
        "## Section 3",
        "",
        "```js",
        "addedInSectionThree();",
        "```",
      ].join("\n");

      const { html } = provider.computeDiff(oldMd, newMd);
      assert.ok(areHtmlTagsBalanced(html), "Diff HTML must have balanced tags");

      const sec2Idx = html.indexOf("Unchanged middle paragraph.");
      const sec3CodeIdx = html.indexOf("addedInSectionThree");
      const sec1CodeIdx = html.indexOf("deletedInSectionOne");

      assert.ok(sec1CodeIdx !== -1 && sec1CodeIdx < sec2Idx, "Deleted code block must stay before Section 2");
      assert.ok(sec3CodeIdx !== -1 && sec3CodeIdx > sec2Idx, "Added code block in Section 3 must stay after Section 2");
    });

    it("still performs granular diff for code blocks within the same change hunk", () => {
      const oldMd = "## Code\n\n```ts\nconst a = 1;\nconst b = 2;\n```";
      const newMd = "## Code\n\n```ts\nconst a = 1;\nconst b = 99;\n```";

      const { html } = provider.computeDiff(oldMd, newMd);
      assert.ok(areHtmlTagsBalanced(html));
      assert.ok(html.includes("<del") && html.includes("<ins"));
      assert.strictEqual((html.match(/<pre\b/gi) || []).length, 1, "Same-hunk modified code block should diff in-place");
    });
  });

  describe("nested same-name block handling (H-7)", () => {
    it("splitConsolidatedDiffs preserves nested divs without cutting at inner </div>", () => {
      const html = '<del class="diffdel"><div class="outer"><div class="inner">A</div></div><div>B</div></del>';
      const result = splitConsolidatedDiffs(html);
      assert.ok(areHtmlTagsBalanced(result), `Tags must stay balanced: ${result}`);
      assert.ok(result.includes('<del class="diffdel"><div class="outer"><div class="inner">A</div></div></del>'));
      assert.ok(result.includes('<del class="diffdel"><div>B</div></del>'));
    });

    it("consolidateBlockDiffs wraps outer nested containers cleanly without truncating at inner close tag", () => {
      const html = '<div class="outer"><div class="inner"><ins>Added</ins></div></div>';
      const result = consolidateBlockDiffs(html);
      assert.ok(areHtmlTagsBalanced(result), `Tags must stay balanced: ${result}`);
      assert.strictEqual(
        result,
        '<ins class="diffins diff-block"><div class="outer"><div class="inner">Added</div></div></ins>',
      );
    });

    it("markGhostListItems handles nested lists without cutting at inner </ul> or </li>", () => {
      const html = '<ins><ul><li>Parent<ul><li>Child</li></ul></li></ul></ins>';
      const result = markGhostListItems(html);
      assert.ok(areHtmlTagsBalanced(result), `Tags must stay balanced: ${result}`);
      assert.ok(result.includes('<li data-all-inserted="true">Parent'));
      assert.ok(result.includes('<li data-all-inserted="true">Child'));
    });

    it("extractSharedReparentedLists handles nested sublists without splitting at inner </ul>", () => {
      const sharedSublist = '<ul><li>Sub 1<ul><li>Deep 1</li></ul></li></ul>';
      const html = `<del class="diffdel diff-block">${sharedSublist}</del><ins><ul><li>New Parent</li></ul>${sharedSublist}</ins>`;
      const result = extractSharedReparentedLists(html);
      assert.ok(areHtmlTagsBalanced(result), `Tags must stay balanced: ${result}`);
      assert.ok(result.includes("New Parent"));
      assert.ok(result.includes("Deep 1"));
      assert.strictEqual(result.includes("diff-block"), false, "Shared reparented nested list should be extracted");
    });

    it("refineBlockDiffs preserves nested blockquotes and nested HTML tables", () => {
      const oldMd = "> Outer old\n>\n> > Inner old\n\n<table><tr><td><table><tr><td>OldCell</td></tr></table></td></tr></table>";
      const newMd = "> Outer new\n>\n> > Inner new\n\n<table><tr><td><table><tr><td>NewCell</td></tr></table></td></tr></table>";
      const { html } = provider.computeDiff(oldMd, newMd);
      assert.ok(areHtmlTagsBalanced(html), `Tags must stay balanced: ${html}`);
      assert.ok(html.includes("Inner") && html.includes("NewCell"));
    });
  });
});
