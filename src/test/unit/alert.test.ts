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

describe("GitHub Alert Tests", () => {
  let provider: MarkdownDiffProvider;

  beforeEach(async () => {
    provider = new MarkdownDiffProvider();
    await provider.waitForReady();
  });

  it("should preserve Alert Title exactly when only content changes", () => {
    const oldMd = `> [!NOTE]\n> Old content`;
    const newMd = `> [!NOTE]\n> New content`;

    const { html: diffHtml } = provider.computeDiff(oldMd, newMd);

    // Extract the alert div
    const alertMatch = diffHtml.match(
      /<div class="markdown-alert[^>]*>([\s\S]*?)<\/div>/,
    );
    assert.ok(alertMatch, "Alert div found");

    const alertContent = alertMatch[1];

    // Extract the title
    const titleMatch = alertContent.match(
      /<p class="markdown-alert-title">([\s\S]*?)<\/p>/,
    );
    assert.ok(titleMatch, "Alert title found");

    const titleInner = titleMatch[1];

    // The title should be clean HTML, absolutely no <ins> or <del>
    assert.strictEqual(
      titleInner.includes("<ins"),
      false,
      "Title should not have insertion tags",
    );
    assert.strictEqual(
      titleInner.includes("<del"),
      false,
      "Title should not have deletion tags",
    );

    // Ensure the content part definitely IS diffed
    // The content is after the title.
    const contentPart = alertContent.substring(
      alertContent.indexOf("</p>") + 4,
    );
    assert.ok(
      contentPart.includes("<del") || contentPart.includes("<ins"),
      "Content body SHOULD be diffed",
    );
  });

  it("should not show diff in Alert Title/Icon when only content changes (Regression)", () => {
    const oldMd = `\n> [!NOTE]\n> This is a note alert.\n`;
    const newMd = `\n> [!NOTE]\n> This is a note alert with updated content.\n`;

    const { html: diffHtml } = provider.computeDiff(oldMd, newMd);

    // Extract the alert div
    const alertMatch = diffHtml.match(
      /<div class="markdown-alert[^>]*>([\s\S]*?)<\/div>/,
    );
    assert.ok(alertMatch, "Alert div found");

    const alertContent = alertMatch[1];

    // Check if the title has any <ins> or <del>
    const titleMatch = alertContent.match(
      /<p class="markdown-alert-title">([\s\S]*?)<\/p>/,
    );
    assert.ok(titleMatch, "Alert title should exist");

    const titleContent = titleMatch[1];

    assert.ok(
      !titleContent.includes("<ins"),
      "Alert Title should not contain <ins>",
    );
    assert.ok(
      !titleContent.includes("<del"),
      "Alert Title should not contain <del>",
    );
  });
});
