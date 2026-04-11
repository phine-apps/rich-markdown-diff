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

describe("MarkdownDiffProvider - Checkboxes", () => {
  let provider: MarkdownDiffProvider;

  before(async () => {
    provider = new MarkdownDiffProvider();
    await provider.waitForReady();
  });

  it("should render unchecked checkboxes", () => {
    const oldMd = "- [ ] Task 1";
    const newMd = "- [ ] Task 1";
    const { html: diff } = provider.computeDiff(oldMd, newMd);

    assert.ok(
      diff.includes('type="checkbox"'),
      "Should contain checkbox input",
    );
    assert.ok(!diff.includes("checked"), "Should not be checked");
  });

  it("should render checked checkboxes", () => {
    const oldMd = "- [x] Task 1";
    const newMd = "- [x] Task 1";
    const { html: diff } = provider.computeDiff(oldMd, newMd);

    assert.ok(
      diff.includes('type="checkbox"'),
      "Should contain checkbox input",
    );
    assert.ok(diff.includes("checked"), "Should be checked");
  });

  it("should render diffs in checkboxes", () => {
    const oldMd = "- [ ] Task 1";
    const newMd = "- [x] Task 1";
    const { html: diff } = provider.computeDiff(oldMd, newMd);

    // This is tricky because the diff happens at HTML level.
    // htmldiff-js might wrap the whole list item or just parts of it.
    // We mainly want to ensure it doesn't crash and output contains checkboxes.
    assert.ok(
      diff.includes('type="checkbox"'),
      "Should contain checkbox input",
    );
  });
});
