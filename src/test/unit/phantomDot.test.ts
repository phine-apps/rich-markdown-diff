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

describe("Phantom Dot Tests", () => {
  const provider = new MarkdownDiffProvider();

  it("should NOT show a phantom dot in v1 when a Tip is added in v2", () => {
    // Scenario 1: v1 is empty, v2 has a Tip
    const v1 = "";
    const v2 = `
> [!TIP]
> This is a new tip alert added in v2.
`;

    const { html: diffHtml } = provider.computeDiff(v1, v2);

    assert.ok(!diffHtml.includes("<del>."), "Should not contain a deleted dot");
    assert.ok(
      !diffHtml.includes("<del>.</del>"),
      "Should not contain an isolated deleted dot",
    );
  });

  it("should NOT show a phantom dot when v1 has text and v2 adds a Tip", () => {
    // Scenario 2: v1 has text, v2 adds a Tip
    const v1 = "Some text.";
    const v2 = `
Some text.

> [!TIP]
> This is a new tip alert added in v2.
`;

    const { html: diffHtml } = provider.computeDiff(v1, v2);

    assert.ok(!diffHtml.includes("<del>."), "Should not contain a deleted dot");
    assert.ok(
      !diffHtml.includes("<del>.</del>"),
      "Should not contain an deleted dot",
    );
  });
});
