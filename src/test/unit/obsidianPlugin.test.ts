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

describe("MarkdownDiffProvider - Obsidian Plugin", () => {
  let provider: MarkdownDiffProvider;

  before(async () => {
    provider = new MarkdownDiffProvider();
    await provider.waitForReady();
  });

  it("should render tags correctly", () => {
    const oldMd = "";
    const newMd = "#project/task-123";
    const { html: diff } = provider.computeDiff(oldMd, newMd);
    if (process.env.DEBUG_TEST) { console.log("DEBUG TAG DIFF HTML:", diff); }

    assert.ok(diff.includes('class="obsidian-tag"'), "Should contain obsidian-tag class");
    assert.ok(diff.includes('data-tag="project/task-123"'), "Should contain tag data attribute");
    assert.ok(diff.includes("#project/task-123"), "Should contain the tag text");
  });

  it("should render transclusions correctly (non-image)", () => {
    const oldMd = "";
    const newMd = "![[My Note]]";
    const { html: diff } = provider.computeDiff(oldMd, newMd);

    assert.ok(diff.includes('class="obsidian-embed"'), "Should contain obsidian-embed class");
    assert.ok(diff.includes('data-page="My Note"'), "Should contain page data attribute");
    assert.ok(diff.includes("My Note"), "Should contain the page name");
  });

  it("should render transclusions correctly (image)", () => {
    const oldMd = "";
    const newMd = "![[photo.png]]";
    const { html: diff } = provider.computeDiff(oldMd, newMd);

    assert.ok(diff.includes('class="obsidian-embedded-image"'), "Should contain obsidian-embedded-image class");
    assert.ok(diff.includes('src="photo.png"'), "Should contain image src");
  });

  it("should render highlights correctly", () => {
    const oldMd = "";
    const newMd = "==highlighted text==";
    const { html: diff } = provider.computeDiff(oldMd, newMd);

    assert.ok(diff.includes("<mark>"), "Should contain <mark> tag");
    assert.ok(diff.includes("highlighted text"), "Should contain the text");
  });

  it("should verify Breadcrumb and Obsidian CSS in Webview", () => {
    const html = provider.getWebviewContent(
      "<div></div>",
      "katex.css",
      "mermaid.js",
      "light.css",
      "dark.css",
    );
    assert.ok(html.includes(".breadcrumbs-bar"), "Should include .breadcrumbs-bar CSS styles");
    assert.ok(html.includes(".obsidian-tag"), "Should include .obsidian-tag CSS styles");
    assert.ok(html.includes("updateBreadcrumbs"), "Should include updateBreadcrumbs JS function");
    assert.ok(html.includes("handleTagClick"), "Should include handleTagClick JS function");
  });
});
