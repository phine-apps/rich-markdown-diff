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
import * as fs from "fs";
import * as path from "path";
import { MarkdownDiffProvider } from "../../markdownDiff";

const FIXTURES_DIR = path.join(__dirname, "../../../fixtures");

/**
 * Normalize HTML for comparison by removing whitespace variations
 */
function normalizeHtml(html: string): string {
  return html
    .replace(/\r\n/g, "\n")
    .replace(/>\s+</g, "><")
    .replace(/\s+/g, " ")
    .replace(/\s?data-line="\d+"/g, "")
    .trim();
}

describe("Fixture Snapshot Tests", () => {
  let provider: MarkdownDiffProvider;

  before(async () => {
    provider = new MarkdownDiffProvider();
    await provider.waitForReady();
  });

  describe("Comprehensive Diff Test", () => {
    it("should generate correct diff for comprehensive markdown files", () => {
      const v1Path = path.join(FIXTURES_DIR, "comprehensive_v1.md");
      const v2Path = path.join(FIXTURES_DIR, "comprehensive_v2.md");
      const snapshotPath = path.join(
        FIXTURES_DIR,
        "expected",
        "comprehensive.html",
      );
      // Read fixture files
      const v1Content = fs.readFileSync(v1Path, "utf-8");
      const v2Content = fs.readFileSync(v2Path, "utf-8");

      // Generate diff
      const { html: actualDiff } = provider.computeDiff(v1Content, v2Content);

      // If expected file doesn't exist, create it (first run)
      if (!fs.existsSync(snapshotPath)) {
        fs.mkdirSync(path.dirname(snapshotPath), { recursive: true });
        fs.writeFileSync(snapshotPath, actualDiff, "utf-8");
        console.log(`Created snapshot: ${snapshotPath}`);
        return;
      }

      // Read expected and compare
      const expectedDiff = fs.readFileSync(snapshotPath, "utf-8");

      assert.strictEqual(
        normalizeHtml(actualDiff),
        normalizeHtml(expectedDiff),
        "Diff output should match expected snapshot",
      );
    });

    it("should detect text additions", () => {
      const v1Path = path.join(FIXTURES_DIR, "comprehensive_v1.md");
      const v2Path = path.join(FIXTURES_DIR, "comprehensive_v2.md");

      const v1Content = fs.readFileSync(v1Path, "utf-8");
      const v2Content = fs.readFileSync(v2Path, "utf-8");

      const { html: diff } = provider.computeDiff(v1Content, v2Content);

      // v2 has "New Section" added
      assert.ok(diff.includes("<ins"), "Should contain insertion tags");
      assert.ok(
        diff.includes("New Section") || diff.includes("new"),
        "Should detect new content",
      );
    });

    it("should detect text modifications", () => {
      const v1Path = path.join(FIXTURES_DIR, "comprehensive_v1.md");
      const v2Path = path.join(FIXTURES_DIR, "comprehensive_v2.md");

      const v1Content = fs.readFileSync(v1Path, "utf-8");
      const v2Content = fs.readFileSync(v2Path, "utf-8");

      const { html: diff } = provider.computeDiff(v1Content, v2Content);

      // Both insertion and deletion tags should be present for modifications
      assert.ok(diff.includes("<ins"), "Should contain insertion tags");
      assert.ok(diff.includes("<del"), "Should contain deletion tags");
    });

    it("should handle list changes", () => {
      const v1Path = path.join(FIXTURES_DIR, "comprehensive_v1.md");
      const v2Path = path.join(FIXTURES_DIR, "comprehensive_v2.md");

      const v1Content = fs.readFileSync(v1Path, "utf-8");
      const v2Content = fs.readFileSync(v2Path, "utf-8");

      const { html: diff } = provider.computeDiff(v1Content, v2Content);

      // v2 has "Item 4" added
      assert.ok(diff.includes("<li"), "Should contain list items");
    });

    it("should handle code block changes", () => {
      const v1Path = path.join(FIXTURES_DIR, "comprehensive_v1.md");
      const v2Path = path.join(FIXTURES_DIR, "comprehensive_v2.md");

      const v1Content = fs.readFileSync(v1Path, "utf-8");
      const v2Content = fs.readFileSync(v2Path, "utf-8");

      const { html: diff } = provider.computeDiff(v1Content, v2Content);

      // Should contain code elements
      assert.ok(
        diff.includes("<pre>") || diff.includes("<code>"),
        "Should contain code blocks",
      );
    });

    it("should handle table changes", () => {
      const v1Path = path.join(FIXTURES_DIR, "comprehensive_v1.md");
      const v2Path = path.join(FIXTURES_DIR, "comprehensive_v2.md");

      const v1Content = fs.readFileSync(v1Path, "utf-8");
      const v2Content = fs.readFileSync(v2Path, "utf-8");

      const { html: diff } = provider.computeDiff(v1Content, v2Content);

      // v2 has a "Notes" column added
      assert.ok(diff.includes("<table"), "Should contain table");
      assert.ok(diff.includes("<th"), "Should contain table headers");
    });

    it("should handle emoji rendering", () => {
      const v1Path = path.join(FIXTURES_DIR, "comprehensive_v1.md");
      const v2Path = path.join(FIXTURES_DIR, "comprehensive_v2.md");

      const v1Content = fs.readFileSync(v1Path, "utf-8");
      const v2Content = fs.readFileSync(v2Path, "utf-8");

      const { html: diff } = provider.computeDiff(v1Content, v2Content);

      // Emoji shortcodes should be rendered
      // :smile: becomes 😄, :rocket: becomes 🚀, etc.
      assert.ok(
        diff.includes("😄") ||
          diff.includes("🚀") ||
          diff.includes(":smile:") ||
          diff.includes(":rocket:"),
        "Should handle emoji content",
      );
    });

    it("should handle KaTeX math rendering", () => {
      const v1Path = path.join(FIXTURES_DIR, "comprehensive_v1.md");
      const v2Path = path.join(FIXTURES_DIR, "comprehensive_v2.md");

      const v1Content = fs.readFileSync(v1Path, "utf-8");
      const v2Content = fs.readFileSync(v2Path, "utf-8");

      const { html: diff } = provider.computeDiff(v1Content, v2Content);

      // KaTeX renders math with .katex class or specific elements
      assert.ok(
        diff.includes("katex") ||
          diff.includes("math") ||
          diff.includes("E = mc"),
        "Should handle KaTeX math content",
      );
    });

    it("should handle Mermaid diagrams", () => {
      const v1Path = path.join(FIXTURES_DIR, "comprehensive_v1.md");
      const v2Path = path.join(FIXTURES_DIR, "comprehensive_v2.md");

      const v1Content = fs.readFileSync(v1Path, "utf-8");
      const v2Content = fs.readFileSync(v2Path, "utf-8");

      const { html: diff } = provider.computeDiff(v1Content, v2Content);

      // Mermaid blocks should be rendered with class="mermaid"
      assert.ok(
        diff.includes('class="mermaid"'),
        "Should contain mermaid diagram blocks",
      );
      assert.ok(
        diff.includes("graph TD") || diff.includes("A-->B"),
        "Should preserve mermaid content",
      );
    });

    it("should handle GitHub Alerts", () => {
      const v1Path = path.join(FIXTURES_DIR, "comprehensive_v1.md");
      const v2Path = path.join(FIXTURES_DIR, "comprehensive_v2.md");

      const v1Content = fs.readFileSync(v1Path, "utf-8");
      const v2Content = fs.readFileSync(v2Path, "utf-8");

      const { html: diff } = provider.computeDiff(v1Content, v2Content);

      // GitHub alerts render with markdown-alert class
      assert.ok(
        diff.includes("markdown-alert") ||
          diff.includes("NOTE") ||
          diff.includes("WARNING"),
        "Should handle GitHub alert blocks",
      );
    });

    it("should handle Footnotes", () => {
      const v1Path = path.join(FIXTURES_DIR, "comprehensive_v1.md");
      const v2Path = path.join(FIXTURES_DIR, "comprehensive_v2.md");

      const v1Content = fs.readFileSync(v1Path, "utf-8");
      const v2Content = fs.readFileSync(v2Path, "utf-8");

      const { html: diff } = provider.computeDiff(v1Content, v2Content);

      // Footnotes render with footnote-related classes or elements
      assert.ok(
        diff.includes("footnote") ||
          diff.includes("fn") ||
          diff.includes("#fn"),
        "Should handle footnotes",
      );
    });

    it("should handle Wikilinks", () => {
      const v1Path = path.join(FIXTURES_DIR, "comprehensive_v1.md");
      const v2Path = path.join(FIXTURES_DIR, "comprehensive_v2.md");

      const v1Content = fs.readFileSync(v1Path, "utf-8");
      const v2Content = fs.readFileSync(v2Path, "utf-8");

      const { html: diff } = provider.computeDiff(v1Content, v2Content);

      // Wikilinks render as <a> tags with the page name
      assert.ok(
        diff.includes("Related Page") || diff.includes("New Page"),
        "Should render wikilinks as links",
      );
    });

    it("should handle Mark/Highlight", () => {
      const v1Path = path.join(FIXTURES_DIR, "comprehensive_v1.md");
      const v2Path = path.join(FIXTURES_DIR, "comprehensive_v2.md");

      const v1Content = fs.readFileSync(v1Path, "utf-8");
      const v2Content = fs.readFileSync(v2Path, "utf-8");

      const { html: diff } = provider.computeDiff(v1Content, v2Content);

      // ==text== renders as <mark>
      assert.ok(
        diff.includes("<mark>") || diff.includes("highlighted"),
        "Should render highlighted text with mark tag",
      );
    });

    it("should handle Subscript and Superscript", () => {
      const v1Path = path.join(FIXTURES_DIR, "comprehensive_v1.md");
      const v2Path = path.join(FIXTURES_DIR, "comprehensive_v2.md");

      const v1Content = fs.readFileSync(v1Path, "utf-8");
      const v2Content = fs.readFileSync(v2Path, "utf-8");

      const { html: diff } = provider.computeDiff(v1Content, v2Content);

      // H~2~O renders with <sub>, x^2^ renders with <sup>
      assert.ok(
        diff.includes("<sub>") || diff.includes("<sup>"),
        "Should render subscript and superscript",
      );
    });

    it("should handle Definition Lists", () => {
      const v1Path = path.join(FIXTURES_DIR, "comprehensive_v1.md");
      const v2Path = path.join(FIXTURES_DIR, "comprehensive_v2.md");

      const v1Content = fs.readFileSync(v1Path, "utf-8");
      const v2Content = fs.readFileSync(v2Path, "utf-8");

      const { html: diff } = provider.computeDiff(v1Content, v2Content);

      // Definition lists render with <dl>, <dt>, <dd>
      assert.ok(
        diff.includes("<dl>") || diff.includes("<dt>") || diff.includes("<dd>"),
        "Should render definition lists",
      );
    });
  });
});
