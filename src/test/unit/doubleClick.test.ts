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

describe("Double Click Navigation", () => {
  let provider: MarkdownDiffProvider;

  before(async () => {
    provider = new MarkdownDiffProvider();
    await provider.waitForReady();
  });

  it("should inject data-line attributes into paragraphs", () => {
    const md = "Line 1\n\nLine 3";
    // We only need to check one side of the diff since computeDiff renders both
    // Actually computeDiff renders old and new separately.
    // Let's check internal usage or just checking the output of computeDiff
    // which returns HTML.

    // Note: computeDiff returns combined HTML for diff.
    // It TOKENIZES and then DIFFS.
    // The `data-line` injection happens at RENDER time.
    // MarkdownIt.render is called in computeDiff.
    // "Line 1" is line 0 (0-indexed) or 1? map is usually 0-indexed line number.

    const diff = provider.computeDiff(md, md);
    // Since content is same, it might just return the html without diff tags?
    // No, htmldiff might wrap it?
    // Actually if they are identical, htmldiff usually returns text.
    // But we are injecting attributes into the HTML tags.
    // `<p data-line="0">Line 1</p>`

    // Let's verify presence of data-line
    assert.ok(diff.includes('data-line="0"'), 'Should contain data-line="0"');
    assert.ok(diff.includes('data-line="2"'), 'Should contain data-line="2"');
  });

  it("should inject data-line attributes into headers", () => {
    const md = "# Header 1";
    const diff = provider.computeDiff(md, md);
    assert.ok(diff.includes('data-line="0"'), "Header should have data-line");
  });

  it("should inject data-line attributes into lists", () => {
    const md = "- Item 1\n- Item 2";
    const diff = provider.computeDiff(md, md);
    assert.ok(
      diff.includes('data-line="0"'),
      "List item 1 should have data-line",
    );
    assert.ok(
      diff.includes('data-line="1"'),
      "List item 2 should have data-line",
    );
  });
});
