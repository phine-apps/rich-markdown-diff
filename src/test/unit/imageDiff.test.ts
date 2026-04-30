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

describe("MarkdownDiffProvider - Image Diff", () => {
  let provider: MarkdownDiffProvider;

  before(async () => {
    provider = new MarkdownDiffProvider();
    await provider.waitForReady();
  });

  it("should wrap added images in <ins> tags", () => {
    const oldMd = "";
    const newMd = "![Icon](icon.png)";
    const { html: diff } = provider.computeDiff(oldMd, newMd);

    assert.ok(diff.includes("<ins"), "Should contain ins tag");
    assert.ok(diff.includes('<img src="icon.png"'), "Should contain image tag");
    // htmldiff-js might wrap the img or the text, let's check if ins contains the img
    // The exact output depends on htmldiff-js but usually it's <ins>...<img ...>...</ins>
    assert.ok(
      /<ins[^>]*>[\s\S]*<img[^>]*>[\s\S]*<\/ins>/.test(diff),
      "Image should be inside ins tag",
    );
  });

  it("should wrap deleted images in <del> tags", () => {
    const oldMd = "![Icon](icon.png)";
    const newMd = "";
    const { html: diff } = provider.computeDiff(oldMd, newMd);

    assert.ok(diff.includes("<del"), "Should contain del tag");
    assert.ok(diff.includes('<img src="icon.png"'), "Should contain image tag");
    assert.ok(
      /<del[^>]*>[\s\S]*<img[^>]*>[\s\S]*<\/del>/.test(diff),
      "Image should be inside del tag",
    );
  });

  it("should consolidated image changes into an .image-diff-block", () => {
    const oldMd = "![Old](old.png)";
    const newMd = "![New](new.png)";
    const { html: diff } = provider.computeDiff(oldMd, newMd);

    assert.ok(diff.includes('class="image-diff-block"'), "Should contain image-diff-block class");
    assert.ok(diff.includes('data-image-diff="true"'), "Should contain data-image-diff attribute");
    assert.ok(diff.includes('div class="diff-image-old"'), "Should contain diff-image-old div");
    assert.ok(diff.includes('div class="diff-image-new"'), "Should contain diff-image-new div");
    assert.ok(diff.includes('src="old.png"'), "Should contain old image src");
    assert.ok(diff.includes('src="new.png"'), "Should contain new image src");
  });

  it("should unwrap parent <p> tags when consolidating image changes", () => {
    const oldMd = "![a](a.png)";
    const newMd = "![b](b.png)";
    const { html: diff } = provider.computeDiff(oldMd, newMd);

    assert.ok(!diff.includes("<p><div"), "Should not have nested div inside p");
    assert.ok(diff.includes('class="image-diff-block"'), "Should contain image-diff-block");
  });

  it("should verify CSS class injection for image diffs", () => {
    // This tests if the getWebviewContent includes our new CSS
    const html = provider.getWebviewContent(
      "<div></div>",
      "katex.css",
      "mermaid.js",
      "light.css",
      "dark.css",
    );
    assert.ok(html.includes(".image-diff-block"), "Should include .image-diff-block CSS styles");
    assert.ok(html.includes(".image-diff-wrapper"), "Should include .image-diff-wrapper CSS styles");
    assert.ok(html.includes("data-mode=\"onion-skin\""), "Should have onion-skin selector in CSS");
    assert.ok(
      html.includes("object-fit: contain;"),
      "Images should use object-fit: contain to maintain alignment",
    );
  });

  it("should use separate resolvers for old and new content", () => {
    const oldMd = "![Old](old.png)";
    const newMd = "![New](new.png)";
    const oldResolver = (src: string) => `https://old/${src}`;
    const newResolver = (src: string) => `https://new/${src}`;

    const { html: diff } = provider.computeDiff(
      oldMd,
      newMd,
      newResolver,
      oldResolver,
    );

    assert.ok(
      diff.includes('src="https://old/old.png"'),
      "Old image should use old resolver",
    );
    assert.ok(
      diff.includes('src="https://new/new.png"'),
      "New image should use new resolver",
    );
  });
});
