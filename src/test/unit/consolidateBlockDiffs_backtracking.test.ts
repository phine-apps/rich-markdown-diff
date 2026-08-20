import * as assert from "assert";
import { consolidateBlockDiffs } from "../../markdown/structuralDiff";

describe("consolidateBlockDiffs block-run detection", () => {
  it("marks an <ins> wrapping a NESTED block run as a block-level diff", () => {
    // Regression: the inner </ul> must not be mistaken for the end of the outer
    // <blockquote>. Depth tracking is required to see this as one block run.
    const input =
      '<ins class="diffins"><blockquote><ul><li>x</li></ul></blockquote></ins>';
    const result = consolidateBlockDiffs(input);
    assert.ok(
      result.includes('class="diffins diff-block"'),
      "outer <ins> should gain diff-block for a nested block run",
    );
  });

  it("marks a <del> wrapping a deeply nested list as a block-level diff", () => {
    const input =
      '<del class="diffdel"><ul><li>a<ul><li>b</li></ul></li></ul></del>';
    const result = consolidateBlockDiffs(input);
    assert.ok(
      result.includes('class="diffdel diff-block"'),
      "outer <del> should gain diff-block for a nested list",
    );
  });

  it("leaves inline-only ins/del content untouched", () => {
    const input = '<ins class="diffins">just <em>inline</em></ins>';
    assert.strictEqual(consolidateBlockDiffs(input), input);
  });

  it("handles a long block run in O(n) (no catastrophic backtracking)", () => {
    // Previously O(2^n): a run of blocks inside <ins> followed by a non-block
    // tail (so the wrap cannot match) hung the extension host. Must be linear.
    const input = `<ins>${"<div>a</div>".repeat(40)}<b>a</b></ins>`;
    const start = Date.now();
    consolidateBlockDiffs(input);
    const elapsed = Date.now() - start;
    assert.ok(elapsed < 1000, `expected linear time, took ${elapsed}ms`);
  });

  it("marks an <ins> wrapping multiple sibling block elements as a block-level diff", () => {
    const input =
      '<ins class="diffins"><h2>Heading</h2><table><tr><td>Cell</td></tr></table><div>Content</div></ins>';
    const result = consolidateBlockDiffs(input);
    assert.ok(
      result.includes('class="diffins diff-block"'),
      "outer <ins> should gain diff-block for sibling block elements",
    );
  });

  it("marks an <ins> wrapping mixed self-closing hr and block elements as a block-level diff", () => {
    const input = '<ins class="diffins"><hr><div>Block</div><hr/></ins>';
    const result = consolidateBlockDiffs(input);
    assert.ok(
      result.includes('class="diffins diff-block"'),
      "outer <ins> should gain diff-block for hr and block mix",
    );
  });

  it("marks an <ins> wrapping self-closing svg as a block-level diff", () => {
    const input = '<ins class="diffins"><svg width="24" height="24"/></ins>';
    const result = consolidateBlockDiffs(input);
    assert.ok(
      result.includes('class="diffins diff-block"'),
      "outer <ins> should gain diff-block for self-closing svg",
    );
  });

  it("handles <ins> without existing class attribute correctly", () => {
    const input = "<ins><div>Block</div></ins>";
    const result = consolidateBlockDiffs(input);
    assert.strictEqual(result, '<ins class="diff-block"><div>Block</div></ins>');
  });

  it("handles multiple independent <ins> tags in the same document without collision", () => {
    const input =
      '<ins class="diffins"><div>First</div></ins> middle text <ins class="diffins"><div>Second</div></ins>';
    const result = consolidateBlockDiffs(input);
    assert.strictEqual(
      result,
      '<ins class="diffins diff-block"><div>First</div></ins> middle text <ins class="diffins diff-block"><div>Second</div></ins>',
    );
  });

  it("does not duplicate diff-block class if already present", () => {
    const input =
      '<ins class="diffins diff-block"><div>Already marked</div></ins>';
    const result = consolidateBlockDiffs(input);
    assert.strictEqual(result, input);
  });

  it("leaves unclosed block tags unchanged without crashing", () => {
    const input = '<ins class="diffins"><div>Unclosed block</ins>';
    const result = consolidateBlockDiffs(input);
    assert.strictEqual(result, input);
  });
});

