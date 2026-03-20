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

describe("MarkdownDiffProvider", () => {
  let provider: MarkdownDiffProvider;

  before(async () => {
    provider = new MarkdownDiffProvider();
    await provider.waitForReady();
  });

  it("should compute simple diff (insertion)", () => {
    const oldMd = "foo";
    const newMd = "foo bar";
    const diff = provider.computeDiff(oldMd, newMd);

    // Expected: "foo <ins ...>bar</ins>"
    assert.ok(diff.includes("foo"), "Should contain original text");
    assert.ok(diff.includes("<ins"), "Should contain ins tag");
    assert.ok(diff.includes("bar"), "Should contain new text");
  });

  it("should compute simple diff (deletion)", () => {
    const oldMd = "foo bar";
    const newMd = "foo";
    const diff = provider.computeDiff(oldMd, newMd);

    // Expected: "foo <del ...>bar</del>"
    assert.ok(diff.includes("foo"), "Should contain original text");
    assert.ok(diff.includes("<del"), "Should contain del tag");
    assert.ok(diff.includes("bar"), "Should contain deleted text");
  });

  it("should handle frontmatter changes", () => {
    const oldMd = "---\ntitle: Old\n---\nContent";
    const newMd = "---\ntitle: New\n---\nContent";
    const diff = provider.computeDiff(oldMd, newMd);

    assert.ok(
      diff.includes("Frontmatter Changes"),
      "Should detect frontmatter changes",
    );
    assert.ok(diff.includes("Old"), "Should show old value");
    assert.ok(diff.includes("New"), "Should show new value");
  });

  it("should show unchanged frontmatter fields without highlight", () => {
    const oldMd = "---\ntitle: Old\nauthor: phine-apps\n---\nContent";
    const newMd = "---\ntitle: New\nauthor: phine-apps\n---\nContent";
    const diff = provider.computeDiff(oldMd, newMd);

    assert.ok(
      diff.includes("Frontmatter Changes"),
      "Should render frontmatter table",
    );
    assert.ok(diff.includes("author"), "Should contain unchanged field 'author'");
    assert.ok(
      diff.includes("phine-apps"),
      "Should contain unchanged value 'phine-apps'",
    );
  });

  it("should preserve mermaid diagrams (tokenization)", () => {
    const oldMd = "A\n```mermaid\ngraph TD;\nA-->B;\n```\nB";
    const newMd = "A\n```mermaid\ngraph TD;\nA-->B;\n```\nC";

    // Note: The provider renders mermaid as <div class="mermaid">...</div> because of the renderer override
    const diff = provider.computeDiff(oldMd, newMd);

    // We want to ensure it didn't mangle the mermaid content into a diff mess
    // The tokenization ensures the block is treated as a unit or restored correctly.
    // Since we didn't change the mermaid block, it should be present.
    assert.ok(diff.includes("graph TD;"), "Should contain mermaid content");
  });

  it("should resolve relative image paths when resolver is provided", () => {
    const oldMd = "![Icon](images/icon.png)";
    const newMd = "![Icon](images/icon.png)";

    // Mock resolver
    const resolver = (src: string) => `vscode-resource://${src}`;

    // @ts-ignore
    const diff = provider.computeDiff(oldMd, newMd, resolver);

    assert.ok(
      diff.includes('src="vscode-resource://images/icon.png"'),
      "Should resolve image path",
    );
  });
});
