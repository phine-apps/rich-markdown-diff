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

import { MarkdownDiffProvider } from "../../markdownDiff";
import * as assert from "assert";

describe("Footnote Tests", () => {
  let provider: MarkdownDiffProvider;

  beforeEach(async () => {
    provider = new MarkdownDiffProvider();
    await provider.waitForReady();
  });

  it("should handle footnotes correctly", () => {
    const oldMd = "Text [^1]\n\n[^1]: Note 1";
    const newMd = "Text [^1]\n\n[^1]: Note 1 modified";
    const { html: diffHtml } = provider.computeDiff(oldMd, newMd);

    assert.ok(
      diffHtml.includes('class="footnotes"'),
      "Footnotes section should exist",
    );
  });

  it("should handle added footnotes and show correct diff structure", () => {
    const oldMd = "Text [^1]\n\n[^1]: Note 1";
    const newMd = "Text [^1] [^2]\n\n[^1]: Note 1\n[^2]: Note 2";
    const { html: diffHtml } = provider.computeDiff(oldMd, newMd);

    assert.ok(
      diffHtml.includes('class="footnotes"'),
      "Footnotes section should exist",
    );
    // Verify that the second footnote list item has insertion indicators
    assert.ok(
      /<ins[^>]*>[\s\S]*<li[^>]*id="fn2"|<li[^>]*id="fn2"[^>]*>[\s\S]*<ins[^>]*>/i.test(
        diffHtml,
      ),
      "New footnote (LI) should have insertion markers either wrapping it or inside it",
    );
  });

  it("should not show ghost footnote number in v1 when v2 has more footnotes (Regression)", () => {
    const oldMarkdown = `
Summary
This is version 1 of the comprehensive test document.

The footnote[^1].

[^1]: This is the footnote content
`;

    const newMarkdown = `
Summary
This is version 2 of the comprehensive test document with modifications.

The footnote[^1].
Another footnote[^2].

[^1]: This is the footnote content [updated].
[^2]: This is a new footnote added in v2.
`;

    const { html: diffHtml } = provider.computeDiff(oldMarkdown, newMarkdown);

    assert.ok(diffHtml.includes('class="footnotes"'));

    // Verify that the second footnote list item has insertion indicators
    assert.ok(
      /<ins[^>]*>[\s\S]*<li[^>]*id="fn2"|<li[^>]*id="fn2"[^>]*>[\s\S]*<ins[^>]*>/i.test(
        diffHtml,
      ),
      "New footnote (LI) should have insertion markers either wrapping it or inside it",
    );
  });

  it("should diff an updated footnote separately from a newly added footnote", () => {
    const oldMd = `## Footnotes

This is a sentence with a footnote[^1].

[^1]: This is the footnote content.`;

    const newMd = `## Footnotes

This is a sentence with a footnote[^1].
And another sentence with a second footnote[^2].

[^1]: This is the footnote content (updated).

[^2]: This is a new footnote added in v2.`;

    const { html: diffHtml } = provider.computeDiff(oldMd, newMd);

    assert.ok(
      /<li[^>]*id="fn1"[^>]*>[\s\S]*diffins[\s\S]*updated/i.test(
        diffHtml,
      ),
      "Existing footnote fn1 should be refined in-place, not replaced wholesale",
    );

    assert.ok(
      !/<ins[^>]*>\s*<li[^>]*id="fn1"[^>]*>/i.test(diffHtml),
      "Updated fn1 should not be wrapped as a wholesale insertion",
    );

    assert.ok(
      /<ins[^>]*>[\s\S]*<li[^>]*id="fn2"[^>]*>/i.test(diffHtml),
      "New footnote fn2 should remain a standalone insertion",
    );
  });
});
