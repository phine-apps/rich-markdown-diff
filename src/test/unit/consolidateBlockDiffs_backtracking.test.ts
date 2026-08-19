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
});
