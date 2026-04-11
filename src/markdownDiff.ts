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

import MarkdownIt = require("markdown-it");
// @ts-ignore
import * as htmldiff from "htmldiff-js";
const wikilinks = require("./wikilinksPlugin");
// @ts-ignore
const katex = require("@iktakahiro/markdown-it-katex");
// @ts-ignore
const taskLists = require("markdown-it-task-lists");
import * as crypto from "crypto";
// @ts-ignore
const matter = require("gray-matter");
const sanitizeHtmlLib = require("sanitize-html");
const hljs = require("highlight.js");

/**
 * Provides functionality to compute and render differences between Markdown documents.
 * It uses `markdown-it` for rendering and `htmldiff-js` for computing HTML-level differences.
 * Supports various Markdown extensions including Mermaid diagrams, KaTeX math, and GitHub alerts.
 */
export class MarkdownDiffProvider {
  private md: MarkdownIt;

  private readyPromise: Promise<void>;

  /**
   * Initializes the Markdown renderer and its plugins.
   */
  constructor() {
    this.md = new MarkdownIt({
      html: true,
      linkify: true,
      typographer: true,
      highlight: function (str, lang) {
        if (lang && hljs.getLanguage(lang)) {
          try {
            return hljs.highlight(str, { language: lang, ignoreIllegals: true })
              .value;
          } catch {
            /* ignore highlight errors and fallback */
          }
        }
        return "";
      },
    });

    // Plugin Configuration
    // Wikilinks: default options
    this.md.use(wikilinks, { uriSuffix: "" });

    // Math: KaTeX
    this.md.use(katex);

    // Task Lists: Checkboxes
    this.md.use(taskLists, { enabled: true });

    // Dynamic Import for ESM Plugins
    this.readyPromise = this.loadPlugins();

    // Mermaid Support: Custom fence renderer
    const defaultFence =
      this.md.renderer.rules.fence ||
      function (tokens, idx, options, env, self) {
        return self.renderToken(tokens, idx, options);
      };

    this.md.renderer.rules.fence = (tokens, idx, options, env, self) => {
      const token = tokens[idx];
      const info = token.info
        ? this.md.utils.unescapeAll(token.info).trim()
        : "";

      if (info === "mermaid") {
        const escapedContent = this.md.utils.escapeHtml(token.content);
        return `<div class="mermaid" data-original-content="${escapedContent}">\n${escapedContent}\n</div>`;
      }

      return defaultFence(tokens, idx, options, env, self);
    };

    // Image Resolver Support
    const defaultImage =
      this.md.renderer.rules.image ||
      function (tokens, idx, options, env, self) {
        return self.renderToken(tokens, idx, options);
      };

    this.md.renderer.rules.image = (tokens, idx, options, env, self) => {
      const token = tokens[idx];
      const src = token.attrGet("src");
      if (src && env && typeof env.imageResolver === "function") {
        const resolved = env.imageResolver(src);
        token.attrSet("src", resolved);
      }
      return defaultImage(tokens, idx, options, env, self);
    };

    // Inject Line Numbers Plugin
    const injectLineNumbers = (md: MarkdownIt) => {
      const rules = [
        "paragraph_open",
        "heading_open",
        "list_item_open",
        "blockquote_open",
        "tr_open",
        "code_block",
        "fence",
        "table_open",
      ];

      rules.forEach((rule) => {
        const original =
          md.renderer.rules[rule] || md.renderer.renderToken.bind(md.renderer);
        md.renderer.rules[rule] = (tokens, idx, options, env, self) => {
          const token = tokens[idx];
          if (token.map) {
            token.attrSet("data-line", String(token.map[0]));
          }
          return original.call(self, tokens, idx, options, env, self);
        };
      });
    };
    injectLineNumbers(this.md);
  }

  /**
   * Waits for all asynchronously loaded plugins to be ready.
   */
  public async waitForReady() {
    await this.readyPromise;
  }

  /**
   * Asynchronously loads Markdown-it plugins that are ESM-only or heavy.
   */
  private async loadPlugins() {
    try {
      const plugins = await Promise.all([
        // @ts-ignore
        import("markdown-it-footnote"),
        // @ts-ignore
        import("markdown-it-mark"),
        // @ts-ignore
        import("markdown-it-sub"),
        // @ts-ignore
        import("markdown-it-sup"),
        // @ts-ignore
        import("markdown-it-emoji"),
        // @ts-ignore
        import("markdown-it-deflist"),
        import("markdown-it-github-alerts"),
      ]);

      const [
        footnoteMod,
        markMod,
        subMod,
        supMod,
        emojiMod,
        deflistMod,
        githubAlertsMod,
      ] = plugins;

      const getPlugin = (mod: any) => mod.default || mod;

      const footnote = getPlugin(footnoteMod);
      const mark = getPlugin(markMod);
      const sub = getPlugin(subMod);
      const sup = getPlugin(supMod);
      const emoji = getPlugin(emojiMod);
      const deflist = getPlugin(deflistMod);
      const githubAlerts = getPlugin(githubAlertsMod);

      if (typeof footnote === "function") {
        this.md.use(footnote);
      }
      if (typeof mark === "function") {
        this.md.use(mark);
      }
      if (typeof sub === "function") {
        this.md.use(sub);
      }
      if (typeof sup === "function") {
        this.md.use(sup);
      }
      // Emoji plugin exports an object with { bare, full, light }
      // Use 'full' for complete emoji shortcode support
      if (emoji && typeof emoji.full === "function") {
        this.md.use(emoji.full);
      } else if (typeof emoji === "function") {
        this.md.use(emoji);
      }
      if (typeof deflist === "function") {
        this.md.use(deflist);
      }
      if (typeof githubAlerts === "function") {
        this.md.use(githubAlerts);
      }
    } catch (e) {
      console.error("Failed to load markdown plugins:", e);
    }
  }

  /**
   * Sanitizes HTML to prevent XSS.
   * Allows specific tags and attributes required for Mermaid, KaTeX, and Checkboxes.
   */
  private sanitizeHtml(html: string): string {
    return sanitizeHtmlLib(html, {
      allowedTags: [
        "h1",
        "h2",
        "h3",
        "h4",
        "h5",
        "h6",
        "blockquote",
        "p",
        "a",
        "ul",
        "ol",
        "nl",
        "li",
        "b",
        "i",
        "strong",
        "em",
        "strike",
        "code",
        "hr",
        "br",
        "div",
        "table",
        "thead",
        "caption",
        "tbody",
        "tr",
        "th",
        "td",
        "pre",
        "span",
        "img",
        "del",
        "ins",
        "mark",
        "s",
        "input",
        "sup",
        "sub",
        "details",
        "summary",
        "figure",
        "figcaption",
        "dl",
        "dt",
        "dd",
        "section",
        "mark",
        // MathML tags (if used by KaTeX or others)
        "math",
        "semantics",
        "annotation",
        "annotation-xml",
        "none",
        "mprescripts",
        "munderover",
        "munder",
        "mover",
        "mmultiscripts",
        "msup",
        "msub",
        "msubsup",
        "mfrac",
        "mroot",
        "msqrt",
        "mtable",
        "mtr",
        "mtd",
        "mlabeledtr",
        "maction",
        "menclose",
        "merror",
        "mfenced",
        "mip",
        "mphantom",
        "mpadded",
        "mpprescripts",
        "mstyle",
        "mtext",
        "mn",
        "mo",
        "mi",
        "ms",
        // SVG tags
        "svg",
        "g",
        "path",
        "rect",
        "circle",
        "line",
        "polyline",
        "polygon",
        "text",
        "tspan",
        "defs",
        "marker",
        "clipPath",
        "mask",
        "pattern",
        "linearGradient",
        "radialGradient",
        "stop",
        "image",
      ],
      allowedAttributes: {
        "*": [
          "href",
          "name",
          "target",
          "src",
          "width",
          "height",
          "class",
          "title",
          "alt",
          "rel",
          "type",
          "checked",
          "disabled",
          "start",
          "align",
          "id",
          "tabindex",
          // Allow data attributes for line numbers and internal logic
          "data-line",
          "data-start",
          "data-end",
          "data-type",
          "data-original-content",
          // MathML attributes
          "mathvariant",
          "encoding",
          "xmlns",
          // SVG attributes
          "viewBox",
          "preserveAspectRatio",
          "d",
          "fill",
          "stroke",
          "stroke-width",
          "stroke-dasharray",
          "stroke-opacity",
          "fill-opacity",
          "transform",
          "x",
          "y",
          "cx",
          "cy",
          "r",
          "rx",
          "ry",
          "x1",
          "y1",
          "x2",
          "y2",
          "points",
          "marker-end",
          "marker-start",
          "marker-mid",
          "clip-path",
          "mask",
          "patternUnits",
          "gradientUnits",
          "offset",
          "stop-color",
          "stop-opacity",
          // KaTeX inline style + accessibility
          "style",
          "aria-hidden",
        ],
      },
      allowedStyles: {
        "*": {
          height: [/.*/],
          width: [/.*/],
          "min-width": [/.*/],
          "max-width": [/.*/],
          "vertical-align": [/.*/],
          "margin-right": [/.*/],
          "margin-left": [/.*/],
          "margin-top": [/.*/],
          "margin-bottom": [/.*/],
          top: [/.*/],
          left: [/.*/],
          "padding-left": [/.*/],
          "padding-right": [/.*/],
          "border-bottom-width": [/.*/],
          position: [/^relative$/, /^absolute$/],
          display: [/^inline-block$/, /^block$/, /^none$/, /^inline$/],
          "text-align": [/.*/],
          color: [/.*/],
          "background-color": [/.*/],
        },
      },
      transformTags: {
        a: (tagName: string, attribs: Record<string, string>) => {
          const nextAttribs = { ...attribs };

          if (nextAttribs.target === "_blank") {
            const relValues = new Set(
              (nextAttribs.rel ?? "")
                .split(/\s+/)
                .map((value) => value.trim())
                .filter(Boolean),
            );

            relValues.add("noopener");
            relValues.add("noreferrer");
            nextAttribs.rel = Array.from(relValues).join(" ");
          }

          return {
            tagName,
            attribs: nextAttribs,
          };
        },
      },
      allowedSchemes: [
        "http",
        "https",
        "ftp",
        "mailto",
        "tel",
        "vscode-webview-resource",
        "vscode-resource",
        "data",
      ],
      allowedIframeHostnames: [],
      allowProtocolRelative: false,
    });
  }

  /**
   * Escapes HTML characters in a string to prevent XSS in attribute or text context.
   */
  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  /**
   * Computes the visual difference between two Markdown strings.
   *
   * @param oldMarkdown - The original Markdown content.
   * @param newMarkdown - The modified Markdown content.
   * @param imageResolver - An optional function to resolve relative image paths.
   * @returns A string containing the HTML representation of the differences.
   */
  public computeDiff(
    oldMarkdown: string,
    newMarkdown: string,
    imageResolver?: (src: string) => string,
  ): string {
    const oldMatter = matter(oldMarkdown);
    const newMatter = matter(newMarkdown);

    // 1. Render Body Diff
    const envOld = { imageResolver };
    let oldHtml = this.md.render(oldMatter.content, envOld);

    const envNew = { imageResolver };
    let newHtml = this.md.render(newMatter.content, envNew);

    // Sanitize Rendered Markdown
    oldHtml = this.sanitizeHtml(oldHtml);
    newHtml = this.sanitizeHtml(newHtml);

    // Strip data-line attributes before diffing to prevent htmldiff from
    // fragmenting identical block elements whose only difference is the
    // source-line number (e.g. headings that moved due to additions above).
    oldHtml = this.stripDataLineAttributes(oldHtml);
    newHtml = this.stripDataLineAttributes(newHtml);

    // Tokenize complex blocks before diffing so htmldiff does not fragment them.
    const { html: oldHtmlTokenized, tokens: tokens1 } =
      this.replaceComplexBlocksWithTokens(oldHtml);
    const { html: newHtmlTokenized, tokens: tokens2 } =
      this.replaceComplexBlocksWithTokens(newHtml);

    // Additional Tokenization for Checkboxes
    const { html: oldHtmlChecked, tokens: tokens1Checked } =
      this.replaceCheckboxesWithTokens(oldHtmlTokenized);
    const { html: newHtmlChecked, tokens: tokens2Checked } =
      this.replaceCheckboxesWithTokens(newHtmlTokenized);

    // Merge tokens
    const allTokens = {
      ...tokens1,
      ...tokens2,
      ...tokens1Checked,
      ...tokens2Checked,
    };

    let bodyDiffHtml = oldHtmlChecked;
    // @ts-ignore
    const execute =
      htmldiff.execute || (htmldiff as any).default?.execute || htmldiff;
    if (typeof execute === "function") {
      bodyDiffHtml = execute(oldHtmlChecked, newHtmlChecked);
      bodyDiffHtml = this.fixInvalidNesting(bodyDiffHtml);
      bodyDiffHtml = this.normalizeListContainerChanges(bodyDiffHtml);
      // Consolidate fragmented diffs for block elements
      bodyDiffHtml = this.consolidateBlockDiffs(bodyDiffHtml);
      // Cleanup artifacts where checkboxes remain outside of deleted blocks (List -> Text diff)
      bodyDiffHtml = this.cleanupCheckboxArtifacts(bodyDiffHtml);
    }

    // Restore Complex Blocks (Mermaid + Math + Checkboxes + Alerts)
    bodyDiffHtml = this.restoreComplexTokens(bodyDiffHtml, allTokens);

    // 5. Post-process to refine Block diffs (Alerts, Footnotes)
    // If we have <del>BLOCK</del><ins>BLOCK</ins>, we want to diff the *inner content*
    // instead of showing a full replacement.
    bodyDiffHtml = this.refineBlockDiffs(bodyDiffHtml);

    // Consolidate Block Diffs (Tables, Lists, Blockquotes, Divs)
    bodyDiffHtml = this.consolidateBlockDiffs(bodyDiffHtml);

    // Split ins/del blocks that span both headings and non-heading content
    bodyDiffHtml = this.splitMixedBlockInsertions(bodyDiffHtml);

    // Wrap leading number prefixes in headings so they don't wrap separately
    bodyDiffHtml = this.wrapHeadingPrefixes(bodyDiffHtml);

    // When a nested list is reparented out of a changed list item but its
    // content stays the same, keep the shared list neutral instead of showing
    // it as deleted on the left and re-inserted on the right.
    bodyDiffHtml = this.extractSharedReparentedLists(bodyDiffHtml);

    // Mark list items whose content is entirely inside <ins> or <del> so CSS
    // can hide the ghost bullet without relying on JS timing.
    bodyDiffHtml = this.markGhostListItems(bodyDiffHtml);

    // Fix Invalid Nesting
    bodyDiffHtml = this.fixInvalidNesting(bodyDiffHtml);
    bodyDiffHtml = this.normalizeListContainerChanges(bodyDiffHtml);

    // 2. Render Frontmatter Diff
    const fmKeys = new Set([
      ...Object.keys(oldMatter.data),
      ...Object.keys(newMatter.data),
    ]);
    let fmDiffRows = "";
    let hasFmChanges = false;

    fmKeys.forEach((key) => {
      const oldVal = JSON.stringify(oldMatter.data[key]);
      const newVal = JSON.stringify(newMatter.data[key]);

      const isChanged = oldVal !== newVal;
      if (isChanged) {
        hasFmChanges = true;
      }

      const safeOldKey = oldMatter.data.hasOwnProperty(key)
        ? oldVal || '""'
        : "(missing)";
      const safeNewKey = newMatter.data.hasOwnProperty(key)
        ? newVal || '""'
        : "(missing)";

      if (isChanged) {
        fmDiffRows += `<tr>
                <td>${key}</td>
                <td class="fm-old fm-changed">${safeOldKey}</td>
                <td class="fm-new fm-changed">${safeNewKey}</td>
            </tr>`;
      } else {
        fmDiffRows += `<tr>
                <td>${key}</td>
                <td class="fm-old">${safeOldKey}</td>
                <td class="fm-new">${safeNewKey}</td>
            </tr>`;
      }
    });

    let fmHtml = "";
    if (hasFmChanges) {
      fmHtml = `
        <div class="frontmatter-diff">
            <h3>Frontmatter Changes</h3>
            <table>
                <tbody>
                    ${fmDiffRows}
                </tbody>
            </table>
        </div>`;
    }

    return fmHtml + bodyDiffHtml;
  }

  /**
   * Identifies sequences of <del>BLOCK</del><ins>BLOCK</ins> and re-runs diff on their content
   * to provide granular diffs instead of block replacement, effectively "zooming in".
   */
  private refineBlockDiffs(html: string): string {
    const execute =
      htmldiff.execute || (htmldiff as any).default?.execute || htmldiff;
    if (typeof execute !== "function") {
      return html;
    }

    const replacer = (
      match: string,
      delBlock: string,
      oldHtml: string,
      insBlock: string,
      newHtml: string,
    ) => {
      // Safety Check: Ensure 1-to-1 mapping for refinement.
      // If we observe multiple blocks in the replacement (e.g. 1 Alert replaced by 2 Alerts,
      // or 1 Footnote replaced by 2 Footnotes), we must NOT refine.
      // Refine/Granular diffing is only for modifying the CONTENT of a single block.
      // If the structure changes (adding/removing blocks), we must keep the Atomic Block Replacement
      // to ensure the new blocks are correctly wrapped in <ins> (and hidden in v1).

      // Heuristic: Check for multiple occurrences of the block class
      const alertCount = (newHtml.match(/class="markdown-alert/g) || []).length;

      if (alertCount > 1) {
        return match;
      }

      // Footnote Handling: Smart Refinement for Lists
      // If we detect changes in the NUMBER of list items (e.g. 1 -> 2),
      // we should split the diff into per-item diffs instead of a giant Atomic Block.
      const footnoteItemRegex =
        /<li[^>]*class=["']footnote-item["'][^>]*>[\s\S]*?<\/li>/gi;
      const oldFootnotes = oldHtml.match(footnoteItemRegex) || [];
      const newFootnotes = newHtml.match(footnoteItemRegex) || [];

      if (
        oldFootnotes.length !== newFootnotes.length ||
        oldFootnotes.length > 1
      ) {
        // Mismatch in count or multiple items modified. Handle item-by-item.
        let result = "";
        const max = Math.max(oldFootnotes.length, newFootnotes.length);

        for (let i = 0; i < max; i++) {
          const oldItem = oldFootnotes[i];
          const newItem = newFootnotes[i];

          if (oldItem && newItem) {
            // Modified Item: Diff the content
            result += execute(oldItem, newItem);
          } else if (oldItem) {
            // Deleted Item: Wrap in <del>
            result += `<del class="diffdel">${oldItem}</del>`;
          } else if (newItem) {
            // Added Item: Wrap in <ins>
            result += `<ins class="diffins">${newItem}</ins>`;
          }
        }
        return result;
      }

      // Single item modified: Standard execution
      return execute(oldHtml, newHtml);
    };

    // Refine Alerts
    // Group 1: Whole del block
    // Group 2: Inner content (the alert div)
    // Group 3: Whole ins block
    // Group 4: Inner content (the alert div)
    // Refine Alerts
    // Group 1: Whole del block
    // Group 2: Inner content (the alert div block)
    // Group 3: Whole ins block
    // Group 4: Inner content (the alert div block)
    const alertRegex =
      /(<del[^>]*>\s*(<div class="markdown-alert[^>]*>[\s\S]*?<\/div>)\s*<\/del>)\s*(<ins[^>]*>\s*(<div class="markdown-alert[^>]*>[\s\S]*?<\/div>)\s*<\/ins>)/gi;

    html = html.replace(
      alertRegex,
      (match, delBlock, oldInner, insBlock, newInner) => {
        // Safety Check: Ensure 1-to-1 mapping
        // Heuristic: Check for multiple occurrences of the block class
        // We look for <div class="markdown-alert" to avoid matching "markdown-alert-title"
        const alertCount = (
          newInner.match(/<div[^>]*class="markdown-alert/g) || []
        ).length;
        if (alertCount > 1) {
          return match;
        }

        // Attempt to extract Title and Body
        // Title pattern: <p class="markdown-alert-title">...</p>
        const titleRegex = /<p class="markdown-alert-title">([\s\S]*?)<\/p>/;
        const oldTitleMatch = oldInner.match(titleRegex);
        const newTitleMatch = newInner.match(titleRegex);

        if (
          oldTitleMatch &&
          newTitleMatch &&
          oldTitleMatch[0] === newTitleMatch[0]
        ) {
          // Titles are identical. Exclude them from diffing.
          const titleHtml = oldTitleMatch[0];

          // Remove title from inner content for diffing
          const oldBody = oldInner.replace(titleHtml, "").trim();
          const newBody = newInner.replace(titleHtml, "").trim();

          // Diff the bodies
          const diffBody = execute(oldBody, newBody);

          // Reconstruct the Alert with the preserved Title + Diffed Body
          // We need to wrap it back in the Alert DIV structure.
          // We can use the 'newInner' container structure but replace content.
          // Actually, 'execute' usually returns just the inner HTML diff if passed fragments?
          // No, htmldiff usually diffs the strings.
          // But we need to put it back inside <div class="markdown-alert...">

          // Let's get the opening tag of the alert div
          const openTagRegex = /^<div class="markdown-alert[^>]*>/;
          const openTagMatch = newInner.match(openTagRegex);
          const openTag = openTagMatch
            ? openTagMatch[0]
            : '<div class="markdown-alert">';

          return `${openTag}${titleHtml}\n${diffBody}</div>`;
        }

        // Fallback to standard refinement if titles differ or can't be extracted
        return replacer(match, delBlock, oldInner, insBlock, newInner);
      },
    );

    // Refine structural list-container changes. If the list tag changed
    // (for example dl -> ul), keep it as a structural replacement so unchanged
    // text is not churned by invalid nested markup. If the tag stayed the same,
    // diff the list fragment on its own so same-type list edits remain granular.
    const listContainerRegex =
      /<del[^>]*>\s*<(ol|ul|dl)([^>]*)>([\s\S]*?)<\/\1>\s*<\/del>\s*<ins[^>]*>\s*<(ol|ul|dl)([^>]*)>([\s\S]*?)<\/\4>\s*<\/ins>/gi;

    html = html.replace(
      listContainerRegex,
      (match, oldTag, oldAttrs, oldContent, newTag, newAttrs, newContent) => {
        if (oldTag.toLowerCase() !== newTag.toLowerCase()) {
          return this.createStructuralListContainerDiff(
            oldTag,
            oldAttrs,
            oldContent,
            newTag,
            newAttrs,
            newContent,
          );
        }

        return this.diffHtmlFragments(
          `<${oldTag}${oldAttrs}>${oldContent}</${oldTag}>`,
          `<${newTag}${newAttrs}>${newContent}</${newTag}>`,
          execute,
        );
      },
    );

    // Refine Footnotes
    // Same-type footnote lists are refined through listContainerRegex above.
    // That inner list diff can still group an updated footnote item and newly
    // added items inside one <ins>. Pair footnotes by id so the existing item
    // is diffed against its updated version and extra items stay standalone
    // insertions.
    const footnoteBundleRegex =
      /<del[^>]*>\s*((?:<li[^>]*class=["']footnote-item["'][^>]*>[\s\S]*?<\/li>\s*)+)<\/del>\s*<ins[^>]*>\s*((?:<li[^>]*class=["']footnote-item["'][^>]*>[\s\S]*?<\/li>\s*)+)<\/ins>/gi;
    const footnoteItemRegex =
      /<li[^>]*class=["']footnote-item["'][^>]*>[\s\S]*?<\/li>/gi;
    const getFootnoteId = (itemHtml: string) =>
      itemHtml.match(/\bid=["']([^"']+)["']/i)?.[1] ?? null;

    html = html.replace(footnoteBundleRegex, (match, oldBundle, newBundle) => {
      const oldFootnotes = oldBundle.match(footnoteItemRegex) || [];
      const newFootnotes = newBundle.match(footnoteItemRegex) || [];

      if (oldFootnotes.length === 0 || newFootnotes.length === 0) {
        return match;
      }

      const usedNewFootnotes = new Set<number>();
      let result = "";

      oldFootnotes.forEach((oldFootnote: string) => {
        const oldId = getFootnoteId(oldFootnote);
        let matchedIndex = -1;

        if (oldId) {
          matchedIndex = newFootnotes.findIndex(
            (newFootnote: string, index: number) =>
              !usedNewFootnotes.has(index) &&
              getFootnoteId(newFootnote) === oldId,
          );
        }

        if (
          matchedIndex === -1 &&
          oldFootnotes.length === newFootnotes.length
        ) {
          matchedIndex = newFootnotes.findIndex(
            (_newFootnote: string, index: number) =>
              !usedNewFootnotes.has(index),
          );
        }

        if (matchedIndex !== -1) {
          usedNewFootnotes.add(matchedIndex);
          result += execute(oldFootnote, newFootnotes[matchedIndex]);
        } else {
          result += `<del class="diffdel">${oldFootnote}</del>`;
        }
      });

      newFootnotes.forEach((newFootnote: string, index: number) => {
        if (!usedNewFootnotes.has(index)) {
          result += `<ins class="diffins">${newFootnote}</ins>`;
        }
      });

      return result;
    });

    // Refine Headings
    // When headings are tokenized as atomic blocks, changed headings appear as
    // full <del>heading</del><ins>heading</ins> replacements. Re-diff the inner
    // content to show character-level changes within the heading.
    // The <ins> block must contain ONLY a single heading — when htmldiff groups
    // multiple elements in one <ins> (e.g. a new heading + list + another
    // heading), the inner re-diff would cross heading boundaries and break
    // both panes.
    const headingRegex =
      /<del[^>]*>\s*<(h[1-6])([^>]*)>([\s\S]*?)<\/\1>\s*<\/del>\s*<ins[^>]*>\s*<(h[1-6])([^>]*)>([\s\S]*?)<\/\4>\s*<\/ins>/gi;

    html = html.replace(
      headingRegex,
      (match, oldTag, oldAttrs, oldContent, newTag, newAttrs, newContent) => {
        if (oldTag.toLowerCase() !== newTag.toLowerCase()) {
          return match;
        }
        // Guard: if the new content contains another heading tag, the <ins>
        // spans multiple elements and the regex over-captured.  Fall back to
        // the full block replacement so the left pane stays intact.
        if (/<\/?h[1-6][\s>]/i.test(newContent)) {
          return match;
        }
        const innerDiff = execute(oldContent, newContent);
        return `<${newTag}${newAttrs}>${innerDiff}</${newTag}>`;
      },
    );

    // Refine Code Blocks
    // When pre blocks are tokenized as atomic blocks, changed code appears as
    // full <del>pre</del><ins>pre</ins> replacements. Re-diff the inner
    // content to show line-level changes within the code block.
    const preRegex =
      /<del[^>]*>\s*(<pre([^>]*)>[\s\S]*?<\/pre>)\s*<\/del>\s*<ins[^>]*>\s*(<pre([^>]*)>[\s\S]*?<\/pre>)\s*<\/ins>/gi;

    html = html.replace(
      preRegex,
      (_match, oldPre, _oldAttrs, newPre, _newAttrs) => {
        return execute(oldPre, newPre);
      },
    );

    // Refine bold-paragraph ↔ heading structural promotions/demotions.
    // When `**Bold Text**` is promoted to `#### Bold Text` (or demoted), the
    // rendered text is identical — only the structural role changed.  The diff
    // engine sees two different HTML tokens and marks them as a modification,
    // causing both panes to highlight the heading text in red/green even though
    // no wording changed.  Detect this by comparing stripped text content: if
    // text is the same, strip the diff markers and show the heading neutrally.
    //
    // Pattern A (promotion): <p><strong><del>TEXT</del></p><ins><hN>TEXT</hN></ins>
    const boldToHeadingRe =
      /<p[^>]*>\s*<strong[^>]*>\s*<del[^>]*>([\s\S]*?)<\/del>\s*(?:<\/strong>)?\s*<\/p>\s*<ins[^>]*>\s*<(h[1-6])([^>]*)>([\s\S]*?)<\/\2>\s*<\/ins>/gi;

    html = html.replace(
      boldToHeadingRe,
      (match, delInner, newTag, newAttrs, insInner) => {
        const delText = delInner.replace(/<[^>]+>/g, "").trim();
        const insText = insInner.replace(/<[^>]+>/g, "").trim();
        if (delText !== insText) return match;
        return `<${newTag}${newAttrs}>${insInner}</${newTag}>`;
      },
    );

    // Pattern B (demotion): <del><hN>TEXT</hN></del><p><strong><ins>TEXT</ins></strong></p>
    const headingToBoldRe =
      /<del[^>]*>\s*<(h[1-6])([^>]*)>([\s\S]*?)<\/\1>\s*<\/del>\s*<p[^>]*>\s*<strong[^>]*>\s*<ins[^>]*>([\s\S]*?)<\/ins>\s*(?:<\/strong>)?\s*<\/p>/gi;

    html = html.replace(
      headingToBoldRe,
      (match, _oldTag, _oldAttrs, delInner, insInner) => {
        const delText = delInner.replace(/<[^>]+>/g, "").trim();
        const insText = insInner.replace(/<[^>]+>/g, "").trim();
        if (delText !== insText) return match;
        return `<p><strong>${insInner}</strong></p>`;
      },
    );

    return html;
  }

  /**
   * Post-processes the diff HTML to catch "leaked" checkboxes.
   * When diffing a Task List (v1) against a Text Paragraph (v2), htmldiff often leaves the <input>
   * as an unwrapped sibling of the new <p>, causing it to appear in the "New" view.
   * This method wraps such inputs in <del> so they are hidden in the modified view.
   */
  private cleanupCheckboxArtifacts(html: string): string {
    // Matches <input class="task-list-item-checkbox"...> followed immediately by:
    // 1. <p ...> or <div ...> (Logic from Task 1 artifact)
    // 2. <ins ...>[ (Logic from Task 2 artifact where checkbox is replaced by text like [x])
    return html.replace(
      /(<input[^>]+class="task-list-item-checkbox"[^>]*>)(\s*)(?=(?:<p\b|<div\b|<ins[^>]*>\s*\[))/gi,
      '<del class="diffdel">$1</del>$2',
    );
  }

  /**
   * Replaces complex blocks (Mermaid, Math) with unique tokens to prevent them from being corrupted by HTML diffing.
   *
   * @param html - The HTML content to tokenize.
   * @returns An object containing the tokenized HTML and a map of tokens to original content.
   */
  private replaceComplexBlocksWithTokens(
    html: string,
    options: { tokenizeListContainers?: boolean } = {},
  ): {
    html: string;
    tokens: Record<string, string>;
  } {
    const tokens: Record<string, string> = {};
    return this.replaceBalancedTags(html, tokens, options);
  }

  /**
   * Replaces checkbox input elements with unique tokens to prevent them from being corrupted by HTML diffing.
   *
   * @param html - The HTML content to tokenize.
   * @returns An object containing the tokenized HTML and a map of tokens to original content.
   */
  private replaceCheckboxesWithTokens(html: string): {
    html: string;
    tokens: Record<string, string>;
  } {
    const tokens: Record<string, string> = {};
    const regex = /<input[^>]+class="task-list-item-checkbox"[^>]*>/gi;

    const result = html.replace(regex, (match) => {
      const token = this.createToken(match, "CHECKBOX", tokens);
      return token;
    });

    return { html: result, tokens };
  }

  /**
   * Helper to find and replace balanced HTML tags with tokens.
   *
   * @param html - The HTML content.
   * @param tokens - The record to store identified tokens and their content.
   * @returns The HTML with identified tags replaced by tokens.
   */
  private replaceBalancedTags(
    html: string,
    tokens: Record<string, string>,
    options: { tokenizeListContainers?: boolean } = {},
  ): { html: string; tokens: Record<string, string> } {
    let result = "";
    let i = 0;

    while (i < html.length) {
      if (html.startsWith('<div class="mermaid"', i)) {
        const start = i;
        const end = this.findClosing(html, i, "div");
        if (end > -1) {
          const content = html.substring(start, end);
          const token = this.createToken(content, "MERMAID", tokens);
          result += token;
          i = end;
          continue;
        }
      }
      if (html.startsWith('<div class="markdown-alert', i)) {
        const start = i;
        const end = this.findClosing(html, i, "div");
        if (end > -1) {
          const content = html.substring(start, end);
          const token = this.createToken(content, "ALERT", tokens);
          result += token;
          i = end;
          continue;
        }
      }

      // Detect footnote items
      if (html.startsWith("<li", i)) {
        const potentialStart = i;
        const tagEnd = html.indexOf(">", i);
        if (tagEnd > -1) {
          const tag = html.substring(potentialStart, tagEnd + 1);
          if (
            tag.includes('class="footnote-item"') ||
            tag.includes("class='footnote-item'")
          ) {
            const end = this.findClosing(html, i, "li");
            if (end > -1) {
              const content = html.substring(potentialStart, end);
              const token = this.createToken(content, "FOOTNOTE", tokens);
              result += token;
              i = end;
              continue;
            }
          }
        }
      }
      if (
        html.startsWith('<p class="katex-block">', i) ||
        html.startsWith("<p class='katex-block'>", i)
      ) {
        const start = i;
        const end = this.findClosing(html, i, "p");
        if (end > -1) {
          const content = html.substring(start, end);
          const token = this.createToken(content, "MATHBLOCK", tokens);
          result += token;
          i = end;
          continue;
        }
      }
      if (
        html.startsWith('<span class="katex">', i) ||
        html.startsWith("<span class='katex'>", i)
      ) {
        const start = i;
        const end = this.findClosing(html, i, "span");
        if (end > -1) {
          const content = html.substring(start, end);
          const token = this.createToken(content, "MATH", tokens);
          result += token;
          i = end;
          continue;
        }
      }

      if (options.tokenizeListContainers !== false && html[i] === "<") {
        const listMatch = html.substring(i).match(/^<(ol|ul|dl)(\s[^>]*)?>/i);
        if (listMatch) {
          const tagName = listMatch[1].toLowerCase();
          const start = i;
          const end = this.findClosing(html, i, tagName);
          if (end > -1) {
            const content = html.substring(start, end);
            const token = this.createToken(
              content,
              `LIST_${tagName.toUpperCase()}`,
              tokens,
            );
            result += token;
            i = end;
            continue;
          }
        }
      }

      // Detect headings (h1-h6) and tokenize them to prevent htmldiff from
      // fragmenting heading content when headings shift position.
      if (html[i] === "<") {
        const headingMatch = html.substring(i).match(/^<(h[1-6])(\s[^>]*)?>/);
        if (headingMatch) {
          const tagName = headingMatch[1];
          const start = i;
          const end = this.findClosing(html, i, tagName);
          if (end > -1) {
            const content = html.substring(start, end);
            const token = this.createToken(content, "HEADING", tokens);
            result += token;
            i = end;
            continue;
          }
        }
      }

      result += html[i];
      i++;
    }
    return { html: result, tokens };
  }

  /**
   * Finds the closing position of a balanced HTML tag.
   *
   * @param html - The HTML content.
   * @param start - The start position of the opening tag.
   * @param tagName - The name of the tag to find a closing match for.
   * @returns The position after the closing tag, or -1 if not found.
   */
  private findClosing(html: string, start: number, tagName: string): number {
    let depth = 0;
    const openTag = `<${tagName}`;
    const closeTag = `</${tagName}>`;

    for (let i = start; i < html.length; i++) {
      if (html.startsWith(openTag, i)) {
        depth++;
      } else if (html.startsWith(closeTag, i)) {
        depth--;
        if (depth === 0) {
          return i + closeTag.length;
        }
      }
    }
    return -1; // Not found
  }

  /**
   * Creates a unique token for a piece of content and stores it in the tokens map.
   *
   * @param content - The content to tokenize.
   * @param prefix - A prefix for the token name (e.g., 'MERMAID').
   * @param tokens - The map where the token and content will be stored.
   * @returns The generated token string.
   */
  private createToken(
    content: string,
    prefix: string,
    tokens: Record<string, string>,
  ): string {
    // Strip data-line from hash calculation so identical content with different line numbers
    // is treated as the same token.
    const hashContent = content.replace(/\s?data-line="[^"]*"/g, "");
    const hash = crypto
      .createHash("sha256")
      .update(hashContent)
      .digest("hex")
      .substring(0, 12);
    const token = `TOKEN_${prefix}_${hash}`;
    tokens[token] = content;
    return token;
  }

  /**
   * Restores original content for all tokens found in the HTML.
   *
   * @param html - The HTML containing tokens.
   * @param tokens - The map of tokens to original content.
   * @returns The HTML with tokens replaced by their original content.
   */
  private restoreComplexTokens(
    html: string,
    tokens: Record<string, string>,
  ): string {
    let restored = html;
    Object.keys(tokens).forEach((token) => {
      restored = restored.replace(new RegExp(token, "g"), tokens[token]);
    });
    return restored;
  }

  /**
   * Fixes invalid HTML nesting often produced by `htmldiff-js`.
   * Swaps crossing tags like `<ins><em>text</ins></em>` to `<ins><em>text</em></ins>`.
   *
   * @param html - The HTML to check and fix.
   * @returns The fixed HTML.
   */
  private stripDataLineAttributes(html: string): string {
    return html.replace(/ data-line="\d+"/g, "");
  }

  /**
   * Splits ins/del blocks that contain a mix of headings and non-heading content
   * so each heading gets its own insertion/deletion wrapper.
   */
  private splitMixedBlockInsertions(html: string): string {
    const tagTypes: Array<"ins" | "del"> = ["ins", "del"];
    let result = html;

    for (const diffTag of tagTypes) {
      const diffClass = diffTag === "ins" ? "diffins" : "diffdel";
      const regex = new RegExp(
        `<${diffTag}\\b[^>]*>([\\s\\S]*?)<\\/${diffTag}>`,
        "gi",
      );

      result = result.replace(regex, (match, inner: string) => {
        // Headings must never be grouped with anything else.
        // If there is any heading in the wrapper, try to isolate it.
        const headingCount = (inner.match(/<h[1-6][\s>]/gi) || []).length;

        if (headingCount === 0) {
          return match;
        }

        // Split on block-level opening tags AND after closing heading tags,
        // so that trailing text/inline content after a </h2> becomes its own piece.
        const parts = inner.split(
          /(?=<(?:h[1-6]|p|ul|ol|dl|blockquote|pre|table|hr)[\s>/])|(?<=<\/h[1-6]>)\s*(?=\S)/i,
        );

        if (parts.length <= 1) {
          return match;
        }

        return parts
          .map((part) => {
            const trimmed = part.trim();
            if (!trimmed) {
              return "";
            }
            return `<${diffTag} class="${diffClass}">${trimmed}</${diffTag}>`;
          })
          .join("\n");
      });
    }

    return result;
  }

  /**
   * Wraps leading number prefixes in headings (e.g. "3. ", "10.2.3 ", "[1.2.0] ")
   * in a nowrap span so that numbering and the following period/bracket stay
   * together as a single unbreakable unit when the heading text wraps.
   *
   * Only applies to headings that contain diff markers (<ins>/<del>) — those
   * create separate inline boxes that the browser may wrap between.  Plain-text
   * headings don't need the wrapper.
   */
  private wrapHeadingPrefixes(html: string): string {
    return html.replace(
      /(<h[1-6][^>]*>)((?:\s*(?:<(?:del|ins)[^>]*>)?\s*[\d\.\[\]]+\s*(?:<\/(?:del|ins)>)?\s*)+(?:\]\s*)?(?=\S))/gi,
      (match, tag, prefix) => {
        // Only wrap when diff markers are present — without them, the browser
        // keeps the text in a single inline formatting context and wraps fine.
        if (!/<(ins|del)\b/.test(prefix)) {
          return match;
        }
        // Do not wrap if the prefix crosses an unclosed <ins> or <del>
        // boundary — that would produce invalid HTML.
        const openIns = (prefix.match(/<ins\b/g) || []).length;
        const closeIns = (prefix.match(/<\/ins>/g) || []).length;
        const openDel = (prefix.match(/<del\b/g) || []).length;
        const closeDel = (prefix.match(/<\/del>/g) || []).length;
        if (openIns !== closeIns || openDel !== closeDel) {
          return match;
        }
        return tag + '<span class="heading-prefix">' + prefix + "</span>";
      },
    );
  }

  /**
   * Marks list items whose visible content is entirely wrapped in insertion or
   * deletion markers.  On the left pane, such items show only a ghost bullet
   * because the <ins> content is CSS-hidden.  Adding data attributes lets CSS
   * hide the entire <li> element without depending on JS ghost-hiding timing.
   *
   * Adds `data-all-inserted="true"` when stripping all <ins> leaves no visible
   * content, and `data-all-deleted="true"` when stripping all <del> leaves
   * nothing.  Simple (non-nested) list items only — nested items are already
   * handled by the JS cleanupGhosts() function.
   */
  private markGhostListItems(html: string): string {
    return html.replace(
      /<li([^>]*)>([\s\S]*?)<\/li>/gi,
      (match, attrs: string, content: string) => {
        // Skip items that contain nested <li> — the regex would over-capture
        // them and the JS ghost-hiding handles nested structures correctly.
        if (/<li\b/i.test(content)) return match;

        const stripInline = (s: string) =>
          s.replace(/<\/?(strong|em|b|i|s|span|a)\b[^>]*>/gi, "").trim();

        const withoutIns = content.replace(/<ins\b[^>]*>[\s\S]*?<\/ins>/gi, "");
        const withoutDel = content.replace(/<del\b[^>]*>[\s\S]*?<\/del>/gi, "");

        let newAttrs = attrs;
        if (stripInline(withoutIns) === "") {
          newAttrs += ' data-all-inserted="true"';
        }
        if (stripInline(withoutDel) === "") {
          newAttrs += ' data-all-deleted="true"';
        }

        if (newAttrs === attrs) return match;
        return `<li${newAttrs}>${content}</li>`;
      },
    );
  }

  /**
   * Extracts unchanged nested lists that were reparented out of a changed list
   * item. Example: `4. **Run/Debug:**` with nested bullets becomes
   * `1. **Run and debug.**` followed by the same top-level bullets.
   *
   * htmldiff often renders this as:
   * - old nested list inside a deleted parent list item, and
   * - the same list inside an inserted block after the new parent item.
   *
   * That makes the left pane look like the bullet content was removed even when
   * only the parent structure changed. If the nested list HTML matches the new
   * trailing list HTML (ignoring whitespace and `&nbsp;`), pull the shared list
   * out of the diff wrappers so both panes show it neutrally.
   */
  private extractSharedReparentedLists(html: string): string {
    const normalizeListFragment = (fragment: string) =>
      fragment
        .replace(/&nbsp;/gi, " ")
        .replace(/\s+/g, " ")
        .trim();

    const findMatchingDeletedNestedListWrapper = (
      sourceHtml: string,
      beforeIndex: number,
      normalizedSharedList: string,
    ): string | null => {
      const prefix = sourceHtml.slice(0, beforeIndex);
      const deletedNestedListRegex =
        /(?:<del[^>]*>\s*<\/del>\s*)?<del[^>]*class="[^"]*diff-block[^"]*"[^>]*>\s*(<(ul|ol|dl)[^>]*>[\s\S]*?<\/\2>)\s*<\/del>(?:\s*<del[^>]*>\s*<\/del>)?/gi;

      let deletedMatch: RegExpExecArray | null;
      let matchedDeletedWrapper: string | null = null;

      while ((deletedMatch = deletedNestedListRegex.exec(prefix)) !== null) {
        const deletedList = deletedMatch[1];
        if (normalizeListFragment(deletedList) === normalizedSharedList) {
          matchedDeletedWrapper = deletedMatch[0];
        }
      }

      return matchedDeletedWrapper;
    };

    const insertedCompositeRegex =
      /<ins([^>]*)>\s*(<(ol|ul|dl)[^>]*>\s*<li[\s\S]*?<\/li>\s*<\/\3>)\s*(<(ul|ol|dl)[^>]*>[\s\S]*?<\/\5>)\s*<\/ins>/gi;

    let result = html;
    let compositeMatch: RegExpExecArray | null;

    while ((compositeMatch = insertedCompositeRegex.exec(html)) !== null) {
      const fullInsertedBlock = compositeMatch[0];
      const insertedAttrs = compositeMatch[1];
      const newParentList = compositeMatch[2];
      const sharedList = compositeMatch[4];
      const normalizedSharedList = normalizeListFragment(sharedList);

      const insertedBlockIndex = result.indexOf(fullInsertedBlock);
      if (insertedBlockIndex === -1) {
        continue;
      }

      const matchedDeletedWrapper = findMatchingDeletedNestedListWrapper(
        result,
        insertedBlockIndex,
        normalizedSharedList,
      );

      if (!matchedDeletedWrapper) {
        continue;
      }

      result = result.replace(matchedDeletedWrapper, "");
      result = result.replace(
        fullInsertedBlock,
        `<ins${insertedAttrs}>${newParentList}</ins>\n${sharedList}`,
      );
    }

    const insertedListOnlyRegex =
      /<ins([^>]*)>\s*(<(ul|ol|dl)[^>]*>[\s\S]*?<\/\3>)\s*<\/ins>/gi;

    let insertedListOnlyMatch: RegExpExecArray | null;
    while (
      (insertedListOnlyMatch = insertedListOnlyRegex.exec(result)) !== null
    ) {
      const fullInsertedBlock = insertedListOnlyMatch[0];
      const sharedList = insertedListOnlyMatch[2];
      const normalizedSharedList = normalizeListFragment(sharedList);

      const insertedBlockIndex = result.indexOf(fullInsertedBlock);
      if (insertedBlockIndex === -1) {
        continue;
      }

      const matchedDeletedWrapper = findMatchingDeletedNestedListWrapper(
        result,
        insertedBlockIndex,
        normalizedSharedList,
      );

      if (!matchedDeletedWrapper) {
        continue;
      }

      result = result.replace(matchedDeletedWrapper, "");
      result = result.replace(fullInsertedBlock, sharedList);
    }

    return result;
  }

  private fixInvalidNesting(html: string): string {
    // htmldiff-js often produces crossing tags like <ins><em>text</ins></em>
    // We need to swap them to <ins><em>text</em></ins>
    // Targets: em, strong, b, i, code, span
    const tags = ["em", "strong", "b", "i", "code", "span", "a"];
    let fixed = html;

    tags.forEach((tag) => {
      // Fix </ins></tag> -> </tag></ins>
      // Use a loop to handle nested cases or multiple occurrences
      // simple regex for immediate swap
      const reIns = new RegExp(`<\/ins><\/${tag}>`, "g");
      const reDel = new RegExp(`<\/del><\/${tag}>`, "g");

      fixed = fixed.replace(reIns, `</${tag}></ins>`);
      fixed = fixed.replace(reDel, `</${tag}></del>`);
    });
    return fixed;
  }

  private createStructuralListContainerDiff(
    oldTag: string,
    oldAttrs: string,
    oldBody: string,
    newTag: string,
    newAttrs: string,
    newBody: string,
  ): string {
    const oldList = `<${oldTag}${oldAttrs}>${oldBody}</${oldTag}>`;
    const newList = `<${newTag}${newAttrs}>${newBody}</${newTag}>`;
    return `<del class="diffdel diff-block diff-list-container-change diff-list-container-change-old">${oldList}</del><ins class="diffins diff-block diff-list-container-change diff-list-container-change-new">${newList}</ins>`;
  }

  private diffHtmlFragments(
    oldHtml: string,
    newHtml: string,
    execute: (oldHtml: string, newHtml: string) => string,
  ): string {
    const { html: oldHtmlTokenized, tokens: tokens1 } =
      this.replaceComplexBlocksWithTokens(oldHtml, {
        tokenizeListContainers: false,
      });
    const { html: newHtmlTokenized, tokens: tokens2 } =
      this.replaceComplexBlocksWithTokens(newHtml, {
        tokenizeListContainers: false,
      });
    const { html: oldHtmlChecked, tokens: tokens1Checked } =
      this.replaceCheckboxesWithTokens(oldHtmlTokenized);
    const { html: newHtmlChecked, tokens: tokens2Checked } =
      this.replaceCheckboxesWithTokens(newHtmlTokenized);

    const allTokens = {
      ...tokens1,
      ...tokens2,
      ...tokens1Checked,
      ...tokens2Checked,
    };

    let diffHtml = execute(oldHtmlChecked, newHtmlChecked);
    diffHtml = this.fixInvalidNesting(diffHtml);
    diffHtml = this.normalizeListContainerChanges(diffHtml);
    diffHtml = this.restoreComplexTokens(diffHtml, allTokens);
    diffHtml = this.cleanupCheckboxArtifacts(diffHtml);
    return diffHtml;
  }

  private normalizeListContainerChanges(html: string): string {
    return html.replace(
      /<(ol|ul|dl)([^>]*)>\s*<(ol|ul|dl)([^>]*)>([\s\S]*?)<\/\1>\s*<\/\3>/gi,
      (match, oldTag, oldAttrs, newTag, newAttrs, listBody) => {
        if (String(oldTag).toLowerCase() === String(newTag).toLowerCase()) {
          return match;
        }

        return this.createStructuralListContainerDiff(
          oldTag,
          oldAttrs,
          listBody,
          newTag,
          newAttrs,
          listBody,
        );
      },
    );
  }

  /**
   * Consolidates fragmented diff tags for block elements like tables.
   * If an entire block (e.g., table) consists only of deletions or only of insertions,
   * it wraps the entire block in <del> or <ins> and removes internal diff tags.
   */
  private consolidateBlockDiffs(html: string): string {
    const blocks = [
      "table",
      "ul",
      "ol",
      "dl",
      "blockquote",
      "div",
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6",
    ];
    let result = html;

    blocks.forEach((tag) => {
      // Non-greedy match for the block
      const regex = new RegExp(`<${tag}[^>]*>[\\s\\S]*?<\\/${tag}>`, "gi");
      result = result.replace(regex, (match) => {
        if (this.checkIfAllContentIsWrapped(match, "del")) {
          return `<del class="diffdel diff-block">${this.cleanInnerDiffTags(match, "del")}</del>`;
        }
        if (this.checkIfAllContentIsWrapped(match, "ins")) {
          return `<ins class="diffins diff-block">${this.cleanInnerDiffTags(match, "ins")}</ins>`;
        }
        return match;
      });
    });

    return result;
  }

  /**
   * Checks if all meaningful text content in the HTML string is wrapped in the specified diff tag type.
   */
  private checkIfAllContentIsWrapped(
    html: string,
    type: "ins" | "del",
  ): boolean {
    const typeTag = type;
    // Strip all tags to get total text content length
    const totalText = html.replace(/<[^>]+>/g, "").replace(/\s/g, "");

    // Remove all blocks of <type>...</type> from the HTML
    // If the remaining HTML has no text content, then everything was inside <type> tags.
    const stripped = html.replace(
      new RegExp(`<${typeTag}[^>]*?>[\\s\\S]*?<\\/${typeTag}>`, "gi"),
      "",
    );
    const remainingText = stripped.replace(/<[^>]+>/g, "").replace(/\s/g, "");

    return remainingText.length === 0 && totalText.length > 0;
  }

  /**
   * Removes the specified diff tags (open and close) from the HTML string, keeping the content.
   */
  private cleanInnerDiffTags(html: string, type: "ins" | "del"): string {
    const typeTag = type;
    const reOpen = new RegExp(`<${typeTag}[^>]*?>`, "gi");
    const reClose = new RegExp(`<\\/${typeTag}>`, "gi");
    return html.replace(reOpen, "").replace(reClose, "");
  }

  /**
   * Generates the full HTML content for the webview.
   *
   * @param diffHtml - The computed HTML difference.
   * @param katexCssUri - The URI for KaTeX CSS.
   * @param mermaidJsUri - The URI for Mermaid JS.
   * @param leftLabel - Label for the original version (default: "Original").
   * @param rightLabel - Label for the modified version (default: "Modified").
   * @returns The complete HTML document string.
   */
  public getWebviewContent(
    diffHtml: string,
    katexCssInline: string,
    mermaidJsUri: string,
    hljsLightCssUri: string,
    hljsDarkCssUri: string,
    leftLabel: string = "Original",
    rightLabel: string = "Modified",
    cspSource: string = "",
    translations: Record<string, string> = {},
  ): string {
    const nonce = crypto.randomBytes(16).toString("hex");

    const t = (key: string, ...args: any[]) => {
      let text = translations[key] || key;
      args.forEach((arg, i) => {
        text = text.replace(`{${i}}`, String(arg));
      });
      return text;
    };

    const safeLeft = this.escapeHtml(
      leftLabel === "Original" ? t("Original") : leftLabel,
    );
    const safeRight = this.escapeHtml(
      rightLabel === "Modified" ? t("Modified") : rightLabel,
    );

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; base-uri 'none'; connect-src 'none'; form-action 'none'; style-src-elem ${cspSource} 'nonce-${nonce}'; style-src-attr 'unsafe-inline'; script-src 'nonce-${nonce}'; img-src ${cspSource} https: data:; font-src ${cspSource};">
    <title>${this.escapeHtml(t("Markdown Diff"))}</title>
    <!-- KaTeX CSS (inlined with absolute font URIs for webview compatibility) -->
    <style nonce="${nonce}">${katexCssInline}</style>
    <!-- Highlight.js CSS -->
    <link rel="stylesheet" href="${hljsLightCssUri}" media="(prefers-color-scheme: light)">
    <link rel="stylesheet" href="${hljsDarkCssUri}" media="(prefers-color-scheme: dark)">
    <!-- Mermaid JS -->
    <script nonce="${nonce}" src="${mermaidJsUri}"></script>
    <style nonce="${nonce}">
        :root { /* VRT_THEME_VARS */ }
        html, body {
            height: 100%;
            overflow: hidden;
            width: 100%;
        }
        body { 
            font-family: var(--vscode-font-family); 
            padding: 0; 
            margin: 0;
            background-color: var(--markdown-surface-background);
            color: var(--markdown-foreground);
            display: flex;
            flex-direction: column;
          --markdown-surface-background: var(--vscode-editor-background, #1e1e1e);
          --markdown-raised-background: var(--vscode-editorWidget-background, #252526);
          --markdown-foreground: var(--vscode-foreground, var(--vscode-editor-foreground, #d4d4d4));
          --markdown-base-font-size: 14px;
          --markdown-base-line-height: 1.6;
          --markdown-code-font-size: 13px;
          --markdown-h1-size: 27px;
          --markdown-h2-size: 20px;
          --markdown-h3-size: 17px;
          --markdown-h4-size: 15px;
          --markdown-h5-size: 14px;
          --markdown-h6-size: 12px;
          --markdown-block-spacing: 0.6em;
        }
        /* Toolbar */
        .toolbar {
            display: flex;
            align-items: center;
            padding: 5px 10px;
          background-color: var(--markdown-surface-background);
          color: var(--markdown-foreground);
            border-bottom: 1px solid var(--vscode-panel-border);
            flex-shrink: 0;
            gap: 10px;
        }
        .btn {
            background: none;
            border: 1px solid var(--vscode-button-secondaryBorder);
            color: var(--vscode-button-secondaryForeground);
            background-color: var(--vscode-button-secondaryBackground);
            padding: 3px 10px;
            cursor: pointer;
            font-family: var(--vscode-font-family);
            font-size: 12px;
            border-radius: 2px;
        }
        .btn:hover {
            background-color: var(--vscode-button-secondaryHoverBackground);
        }

        .header {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
          gap: 0;
            height: 30px;
            flex-shrink: 0;
            border-bottom: 1px solid var(--vscode-panel-border);
          background-color: var(--markdown-surface-background);
        }
        .header-item {
          min-width: 0;
            padding: 5px 10px;
            font-weight: bold;
            display: flex;
            align-items: center;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          background-color: var(--markdown-surface-background);
          color: var(--markdown-foreground);
        }
        .header-item + .header-item {
          border-left: 1px solid var(--vscode-panel-border);
        }
        .container {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
          grid-template-rows: minmax(0, 1fr);
          gap: 0;
            flex: 1;
            min-height: 0;
            overflow: hidden;
            width: 100%;
          background-color: var(--markdown-surface-background);
        }
        .pane {
            min-width: 0;
          min-height: 0;
          height: 100%;
          max-height: 100%;
          align-self: stretch;
            overflow-y: scroll;
            overflow-x: auto;
            scrollbar-gutter: stable both-edges;
            padding: 20px;
            box-sizing: border-box;
            position: relative; /* Ensure offsetTop is relative to pane */
          background-color: var(--markdown-surface-background);
          color: var(--markdown-foreground);
          font-weight: normal;
          font-size: var(--markdown-base-font-size);
          line-height: var(--markdown-base-line-height);
        }
        .pane + .pane {
          border-left: 1px solid var(--vscode-panel-border);
        }
        .pane-content {
          position: relative;
          color: inherit;
        }
        .pane-content > :first-child {
          margin-top: 0;
        }
        .pane-content > :last-child {
          margin-bottom: 0;
        }
        
        /* Inline Mode Styles */
        body.inline-mode .container {
          display: flex;
            flex-direction: column;
          gap: 0;
          background-color: transparent;
        }
        body.inline-mode #left-pane {
            display: none !important;
        }
        body.inline-mode #right-pane {
          flex: 1 1 auto;
            width: 100%;
            max-width: 100%;
        }
        body.inline-mode .header {
            display: none !important; /* Hide Original/Modified header in inline */
        }
        
        /* Inline Mode Coloring: Show BOTH del and ins in the right pane */
        body.inline-mode #right-pane del {
            display: inline; /* Make visible */
            background-color: rgba(248, 113, 113, 0.2); 
            text-decoration: line-through; /* Strikethrough for inline del */
            border-bottom: 1px solid #ef4444;
            color: inherit;
            opacity: 0.8;
        }
        /* Explicitly style ins in inline mode to match right-pane ins style */
        body.inline-mode #right-pane ins {
            background-color: rgba(74, 222, 128, 0.2); 
            text-decoration: none; 
            border-bottom: 1px solid #22c55e;
            color: inherit;
        }

        /* Scrollbar Styling */
        ::-webkit-scrollbar { width: 10px; height: 10px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: var(--vscode-scrollbarSlider-background); }
        ::-webkit-scrollbar-thumb:hover { background: var(--vscode-scrollbarSlider-hoverBackground); }
        ::-webkit-scrollbar-thumb:active { background: var(--vscode-scrollbarSlider-activeBackground); }
        
        /* Markdown Styles */
        p,
        ul,
        ol,
        dl,
        blockquote,
        pre,
        table,
        hr,
        .markdown-alert,
        .katex-block,
        .footnotes {
          margin-top: 0;
          margin-bottom: var(--markdown-block-spacing);
        }
        p {
          font-weight: 400;
        }
        ul,
        ol {
          padding-left: 1.75em;
        }
        ul {
          list-style-type: disc;
        }
        ol {
          list-style-type: decimal;
        }
        ul,
        ol,
        li {
          font-weight: 400;
        }
        li::marker {
          font-weight: 400;
          color: inherit;
        }
        li + li {
          margin-top: 0.15em;
        }
        li, dt, dd {
          overflow-wrap: break-word;
          word-wrap: break-word;
        }
        li > p {
          margin-top: 0.2em;
          margin-bottom: 0.2em;
        }
        dt {
          font-weight: 600;
        }
        dd {
          margin-left: 1.5em;
        }
        code {
          font-family: var(--vscode-editor-font-family);
          font-size: var(--markdown-code-font-size);
          overflow-wrap: break-word;
          background-color: var(--vscode-textCodeBlock-background, var(--markdown-raised-background));
          padding: 0.15em 0.35em;
          border-radius: 3px;
        }
        pre code {
          font-size: inherit;
          overflow-wrap: normal;
          background-color: transparent;
          padding: 0;
          border-radius: 0;
        }
        pre {
          background-color: var(--vscode-textCodeBlock-background, var(--markdown-raised-background));
          padding: 8px 10px;
          font-size: var(--markdown-code-font-size);
          line-height: 1.5;
          overflow-x: auto;
          width: 100%;
          max-width: 100%;
          min-width: 0;
          box-sizing: border-box;
          border: 1px solid var(--vscode-panel-border);
          border-radius: 4px;
        }
        .katex-block {
          background-color: var(--vscode-textCodeBlock-background, var(--markdown-raised-background));
          padding: 8px 10px;
          overflow-x: auto;
          overflow-y: hidden;
          width: 100%;
          max-width: 100%;
          min-width: 0;
          box-sizing: border-box;
          border: 1px solid var(--vscode-panel-border);
          border-radius: 4px;
        }
        .katex-block .katex-display {
          margin: 0;
          min-width: max-content;
          padding: 0.15em 0;
        }
        .katex-block .katex {
          max-width: none;
        }
        h1, h2, h3, h4, h5, h6 {
          overflow-wrap: break-word;
          display: block;
          width: auto;
          max-width: 100%;
          box-sizing: border-box;
          line-height: 1.3;
          font-weight: 600;
          margin-top: 1em;
          margin-bottom: 0.3em;
          color: var(--markdown-foreground);
        }
        .heading-prefix {
          display: inline-block;
          white-space: nowrap;
          vertical-align: baseline;
        }
        h1, h2 {
          padding-bottom: 0.25em;
          border-bottom: 1px solid var(--vscode-panel-border);
        }
        h1 { font-size: var(--markdown-h1-size); }
        h2 { font-size: var(--markdown-h2-size); }
        h3 { font-size: var(--markdown-h3-size); }
        h4 { font-size: var(--markdown-h4-size); }
        h5 { font-size: var(--markdown-h5-size); }
        h6 {
          font-size: var(--markdown-h6-size);
          color: var(--vscode-descriptionForeground);
        }
        /* Remove noisy bottom borders for inline diff markers inside code blocks */
        pre ins,
        pre del {
          border-bottom: none !important;
        }
        img {
          max-width: 100%;
          height: auto;
        }
        p > img:only-child {
          display: block;
        }
        table {
          width: max-content;
          min-width: 100%;
          max-width: 100%;
          border-collapse: collapse;
          line-height: 1.5;
          background-color: var(--vscode-editor-background);
        }
        th,
        td {
          border: 1px solid var(--vscode-panel-border);
          padding: 0.5em 0.75em;
          text-align: left;
          vertical-align: top;
          line-height: 1.5;
        }
        th {
          font-weight: 600;
          background-color: var(--vscode-textBlockQuote-background);
        }
        tbody tr:nth-child(even) {
          background-color: rgba(127, 127, 127, 0.08);
        }
        caption {
          caption-side: top;
          margin-bottom: 0.5em;
          text-align: left;
          font-weight: 600;
        }
        hr {
          border: none;
          border-top: 1px solid var(--vscode-panel-border);
          margin: 1em 0;
        }
        .toolbar-status {
          margin-left: auto;
          font-size: 11px;
          opacity: 0.7;
        }

        /* Split View Coloring Strategy (Default) */
        /* Left Pane (Original): Hide insertions, show deletions in Red */
        body:not(.inline-mode) #left-pane ins { display: none; }
        body:not(.inline-mode) #left-pane del { 
            background-color: rgba(248, 113, 113, 0.2); 
            text-decoration: none; 
            border-bottom: 1px solid #ef4444;
            color: inherit;
        }
        body:not(.inline-mode) #left-pane h1 del,
        body:not(.inline-mode) #left-pane h2 del,
        body:not(.inline-mode) #left-pane h3 del,
        body:not(.inline-mode) #left-pane h4 del,
        body:not(.inline-mode) #left-pane h5 del,
        body:not(.inline-mode) #left-pane h6 del {
            border-bottom: none;
        }

        /* Right Pane (Modified): Hide deletions, show insertions in Green */
        body:not(.inline-mode) #right-pane del { display: none; }
        body:not(.inline-mode) #right-pane ins {
            background-color: rgba(74, 222, 128, 0.2); 
            text-decoration: none; 
            border-bottom: 1px solid #22c55e;
            color: inherit;
        }
        body:not(.inline-mode) #right-pane h1 ins,
        body:not(.inline-mode) #right-pane h2 ins,
        body:not(.inline-mode) #right-pane h3 ins,
        body:not(.inline-mode) #right-pane h4 ins,
        body:not(.inline-mode) #right-pane h5 ins,
        body:not(.inline-mode) #right-pane h6 ins {
            border-bottom: none;
        }

        /* Full Document Diff Styling (for comparisons with empty files) */
        ins.diffins, del.diffdel {
            text-decoration: none;
            color: inherit;
        }
        ins.diffins {
            background-color: rgba(74, 222, 128, 0.2); 
            border-bottom: 1px solid #22c55e;
        }
        del.diffdel {
            background-color: rgba(248, 113, 113, 0.2); 
            border-bottom: 1px solid #ef4444;
        }

        /* Ensure diff styling is visible for tokenized blocks with their own backgrounds (Alerts) */
        ins.diffins .markdown-alert, del.diffdel .markdown-alert {
            position: relative; /* For pseudo-element overlay */
        }
        ins.diffins .markdown-alert {
            border: 1px solid #22c55e;
        }
        ins.diffins .markdown-alert::after {
            content: "";
            position: absolute;
            top: 0; left: 0; right: 0; bottom: 0;
            background-color: rgba(74, 222, 128, 0.2);
            pointer-events: none;
        }
        del.diffdel .markdown-alert {
            border: 1px solid #ef4444;
        }
        del.diffdel .markdown-alert::after {
            content: "";
            position: absolute;
            top: 0; left: 0; right: 0; bottom: 0;
            background-color: rgba(248, 113, 113, 0.2);
            pointer-events: none;
        }

        /* Force block display and reset styles for ins/del containing valid blocks (Alerts) */
        /* This prevents double borders/backgrounds since the inner alert already has them */
        /* Using !important to ensure override of earlier ins.diffins styles */
        ins.diffins:has(.markdown-alert), del.diffdel:has(.markdown-alert) {
            display: block;
            text-decoration: none;
            border: none !important;
            background-color: transparent !important;
            padding: 0 !important;
            margin: 0 !important;
        }

        /* Fix Footnote Navigation Highlight (ensure "2." marker is inside highlight box) */
        ins.diffins:has(.footnote-item), del.diffdel:has(.footnote-item) {
            display: block;
            margin-left: -2.5em; /* Pull box left to cover marker area */
            padding-left: 2.5em; /* Push content back to alignment */
            /* Ensure the box spans the full width including the negative margin area */
        }

        /* Force block display for ins/del wrapping block-level headings */
        ins:has(> h1, > h2, > h3, > h4, > h5, > h6),
        del:has(> h1, > h2, > h3, > h4, > h5, > h6) {
            display: block;
          width: auto;
          max-width: 100%;
        }

        /* Task Lists */
        .contains-task-list {
            list-style-type: none;
            padding-left: 2em; 
        }
        .task-list-item {
            position: relative;
        }
        .task-list-item-checkbox {
            margin: 0 0.2em 0.25em -1.6em;
            vertical-align: middle;
        }

        /* Checkbox Diffs (All Modes) */
        del .task-list-item-checkbox {
            box-shadow: 0 0 0 2px rgba(239, 68, 68, 0.8);
            border-radius: 2px;
        }
        
        ins .task-list-item-checkbox {
            box-shadow: 0 0 0 2px rgba(34, 197, 94, 0.8);
            border-radius: 2px;
        }

        /* Inline Mode Checkbox Specifics */
        body.inline-mode #right-pane del .task-list-item-checkbox {
            opacity: 0.5;
        }
        
        body.inline-mode #right-pane ins .task-list-item-checkbox {
            margin-left: 0.2em; /* reset the -1.6em pull so it doesn't overlap the del checkbox */
        }

        /* Block-Level Diffs (Tables, Lists, Blockquotes) */
        del.diffdel.diff-block, ins.diffins.diff-block {
            display: block;
            border: 1px solid;
            border-radius: 4px;
            padding: 8px 10px;
            margin: 0.5em 0;
          width: 100%;
          max-width: 100%;
          min-width: 0;
            box-sizing: border-box;
        }
        del.diffdel.diff-block {
            background-color: rgba(239, 68, 68, 0.1); 
            border-color: rgba(239, 68, 68, 0.6);
        }
        ins.diffins.diff-block {
            background-color: rgba(34, 197, 94, 0.1); 
            border-color: rgba(34, 197, 94, 0.6);
        }

        /* Structural list-container swaps (ol <-> ul) should highlight marker changes,
           not make unchanged list text look deleted/inserted. */
        del.diff-list-container-change,
        ins.diff-list-container-change {
          background-color: transparent !important;
          border: none !important;
          text-decoration: none !important;
          color: inherit !important;
          opacity: 1 !important;
          padding: 0 !important;
        }
        del.diff-list-container-change > ol,
        del.diff-list-container-change > ul,
        del.diff-list-container-change > dl,
        ins.diff-list-container-change > ol,
        ins.diff-list-container-change > ul,
        ins.diff-list-container-change > dl {
          margin-top: 0;
          margin-bottom: 0;
          background-color: transparent;
          color: inherit;
          box-sizing: border-box;
          padding-top: 0.15em;
          padding-bottom: 0.15em;
        }
        del.diff-list-container-change > ol,
        del.diff-list-container-change > ul,
        ins.diff-list-container-change > ol,
        ins.diff-list-container-change > ul {
          padding-left: calc(1.75em - 3px + 0.55em);
        }
        del.diff-list-container-change > dl,
        ins.diff-list-container-change > dl {
          padding-left: 0.85em;
        }
        del.diff-list-container-change li,
        del.diff-list-container-change li > p,
        del.diff-list-container-change dt,
        del.diff-list-container-change dd,
        ins.diff-list-container-change li,
        ins.diff-list-container-change li > p,
        ins.diff-list-container-change dt,
        ins.diff-list-container-change dd {
          color: inherit;
          background-color: transparent;
          text-decoration: none;
        }
        del.diff-list-container-change li::marker,
        ins.diff-list-container-change li::marker {
          font-weight: 600;
        }
        body:not(.inline-mode) #left-pane del.diff-list-container-change > ol,
        body:not(.inline-mode) #left-pane del.diff-list-container-change > ul,
        body:not(.inline-mode) #left-pane del.diff-list-container-change > dl,
        body.inline-mode #right-pane del.diff-list-container-change > ol,
        body.inline-mode #right-pane del.diff-list-container-change > ul,
        body.inline-mode #right-pane del.diff-list-container-change > dl {
          border-left: 3px solid rgba(239, 68, 68, 0.65);
        }
        body:not(.inline-mode) #right-pane ins.diff-list-container-change > ol,
        body:not(.inline-mode) #right-pane ins.diff-list-container-change > ul,
        body:not(.inline-mode) #right-pane ins.diff-list-container-change > dl,
        body.inline-mode #right-pane ins.diff-list-container-change > ol,
        body.inline-mode #right-pane ins.diff-list-container-change > ul,
        body.inline-mode #right-pane ins.diff-list-container-change > dl {
          border-left: 3px solid rgba(34, 197, 94, 0.65);
        }
        body:not(.inline-mode) #left-pane del.diff-list-container-change li::marker,
        body.inline-mode #right-pane del.diff-list-container-change li::marker {
          color: #ef4444;
        }
        body:not(.inline-mode) #right-pane ins.diff-list-container-change li::marker,
        body.inline-mode #right-pane ins.diff-list-container-change li::marker {
          color: #22c55e;
        }

        /* Ghost Element Hiding */
        .ghost-hidden { display: none !important; }
        /* CSS safety net: hide ghost list-item bullets added by markGhostListItems() */
        body:not(.inline-mode) #left-pane  li[data-all-inserted] { display: none !important; }
        body:not(.inline-mode) #right-pane li[data-all-deleted]  { display: none !important; }

        /* Folded Region Styles */
        .folded-region {
            display: none;
        }
        .fold-placeholder {
            background-color: var(--vscode-editor-inactiveSelectionBackground);
            color: var(--vscode-descriptionForeground);
            padding: 5px 10px;
            margin: 5px 0;
            cursor: pointer;
            text-align: center;
            font-size: 11px;
            border-radius: 4px;
            user-select: none;
        }
        .fold-placeholder:hover {
            background-color: var(--vscode-editor-selectionBackground);
        }

        /* Frontmatter Diff */
        .frontmatter-diff {
            margin-bottom: 20px;
            padding: 10px;
            border-bottom: 1px solid var(--vscode-panel-border);
        }
        .frontmatter-diff table {
            width: 100%;
            border-collapse: collapse;
          font-size: 12px;
          line-height: 1.5;
        }
        .frontmatter-diff th, .frontmatter-diff td {
            border: 1px solid var(--vscode-textBlockQuote-border);
            padding: 5px;
            text-align: left;
        }
        .frontmatter-diff th {
            font-weight: bold;
        }
        .frontmatter-diff .fm-old.fm-changed {
            background-color: rgba(248, 113, 113, 0.2);
            color: var(--vscode-editor-foreground);
        }
        .frontmatter-diff .fm-new.fm-changed {
            background-color: rgba(74, 222, 128, 0.2);
            color: var(--vscode-editor-foreground);
        }

        /* Split View Frontmatter Strategy */
        /* Left Pane: Hide New, Show Old */
        body:not(.inline-mode) #left-pane .frontmatter-diff .fm-new { display: none; }

        /* Right Pane: Hide Old, Show New */
        body:not(.inline-mode) #right-pane .frontmatter-diff .fm-old { display: none; }
        /* Active Change Highlighting */
        /* Simplified to avoid heavy rendering */
        /* Active Change Highlighting */
        .selected-change {
            background-color: rgba(255, 200, 0, 0.3) !important;
            box-shadow: 0 0 0 3px rgba(255, 200, 0, 0.8);
            border-radius: 2px;
            position: relative; 
            z-index: 10;
        }

        /* Specific High Visibility for Complex Blocks (Mermaid/Math) */
        .mermaid.selected-change, 
        .katex-block.selected-change {
            background-color: rgba(255, 235, 59, 0.2) !important; /* Yellow tint for focus */
          border: 1px solid rgba(255, 165, 0, 0.9) !important;
          box-shadow: 0 0 0 2px rgba(255, 165, 0, 0.45) !important;
            overflow: visible !important;
            display: block; 
        }

        /* Image Focus Style (same as Mermaid) */
        .selected-change img {
          border: 1px solid rgba(255, 165, 0, 0.9) !important;
          box-shadow: 0 0 0 2px rgba(255, 165, 0, 0.45) !important;
        }

        /* Complex block wrappers should not draw their own inline highlight;
           the inner block container owns the border/background styling. */
        ins.diffins:has(> .mermaid),
        del.diffdel:has(> .mermaid),
        ins.diffins:has(> .katex-block),
        del.diffdel:has(> .katex-block) {
          display: block;
          border: none !important;
          background-color: transparent !important;
          padding: 0 !important;
          margin: 0.5em 0 !important;
          text-decoration: none !important;
        }

        /* Persistent Visibility for unselected complex changes */
        ins.diffins > .mermaid,
        ins.diffins > .katex-block {
          border: 1px solid rgba(34, 197, 94, 0.6);
          background-color: rgba(34, 197, 94, 0.1);
            display: block;
          margin: 0;
          padding: 8px 10px;
          border-radius: 4px;
          box-sizing: border-box;
        }
        del.diffdel > .mermaid,
        del.diffdel > .katex-block {
          border: 1px solid rgba(239, 68, 68, 0.6);
          background-color: rgba(239, 68, 68, 0.1);
            display: block;
          margin: 0;
          padding: 8px 10px;
          border-radius: 4px;
          box-sizing: border-box;
            opacity: 0.8; /* Persistent fade for deleted content */
        }
        
        /* FIX: Prevent Double Borders (Container + SVG) */
        /* If we are highlighting the container (.mermaid/.katex-block), DO NOT highlight the inner SVG independently */
        ins .mermaid svg, del .mermaid svg,
        ins .katex-block svg, del .katex-block svg,
        .mermaid.selected-change svg, .katex-block.selected-change svg {
            border: none !important;
            background: none !important;
            box-shadow: none !important;
            margin: 0 !important;
        }

        /* Highlight the actual SVG shapes */
        .mermaid.selected-change svg, 
        .selected-change svg {
            filter: drop-shadow(0 0 8px rgba(255, 140, 0, 0.8)) !important;
        }

        /* GitHub Alerts (Admonitions) */
        .markdown-alert {
            padding: 8px 16px;
            margin-bottom: 16px;
            border-left: 0.25em solid;
          background-color: var(--markdown-raised-background);
        }

        /* Image Diff Styles */
        /* Unified with Table/Mermaid styles */
        ins img {
            border: 4px solid rgba(34, 197, 94, 0.6); /* Green border */
            background-color: rgba(34, 197, 94, 0.1);
            padding: 10px;
            display: block;
            margin: 1em 0;
            max-width: 95%; /* Prevent overflow with border/padding */
        }
        del img {
            border: 4px solid rgba(239, 68, 68, 0.6); /* Red border */
            background-color: rgba(239, 68, 68, 0.1);
            padding: 10px;
            display: block;
            margin: 1em 0;
            opacity: 0.8; /* Match block-diff opacity */
            max-width: 95%;
        }
        
        /* Inline Mode Image Styles */
        body.inline-mode #right-pane del img {
            display: block; /* Make sure deleted images show as block in inline mode too */
            border: 4px solid rgba(239, 68, 68, 0.6);
        }
        .markdown-alert-title {
            display: flex;
            font-weight: bold;
            align-items: center;
            margin-bottom: 4px;
        }
        .markdown-alert-title svg {
            margin-right: 8px;
            fill: currentColor;
            width: 16px;
            height: 16px;
        }
        
        /* Note */
        .markdown-alert-note { border-color: #0969da; }
        .markdown-alert-note .markdown-alert-title { color: #0969da; }
        
        /* Tip */
        .markdown-alert-tip { border-color: #1a7f37; }
        .markdown-alert-tip .markdown-alert-title { color: #1a7f37; }
        
        /* Important */
        .markdown-alert-important { border-color: #8250df; }
        .markdown-alert-important .markdown-alert-title { color: #8250df; }
        
        /* Warning */
        .markdown-alert-warning { border-color: #bf8700; }
        .markdown-alert-warning .markdown-alert-title { color: #bf8700; }
        
        /* Caution */
        .markdown-alert-caution { border-color: #d1242f; }
        .markdown-alert-caution .markdown-alert-title { color: #d1242f; }

        /* Dark Mode Adjustments (approximate VS Code colors) */
        @media (prefers-color-scheme: dark) {
            .markdown-alert-note { border-color: #2f81f7; }
            .markdown-alert-note .markdown-alert-title { color: #2f81f7; }
            .markdown-alert-tip { border-color: #3fb950; }
            .markdown-alert-tip .markdown-alert-title { color: #3fb950; }
            .markdown-alert-important { border-color: #a371f7; }
            .markdown-alert-important .markdown-alert-title { color: #a371f7; }
            .markdown-alert-warning { border-color: #d29922; }
            .markdown-alert-warning .markdown-alert-title { color: #d29922; }
            .markdown-alert-caution { border-color: #f85149; }
            .markdown-alert-caution .markdown-alert-title { color: #f85149; }
        }
    </style>
</head>
<body class="VRT_LAYOUT_CLASS">
    <div class="toolbar">
        <!-- Buttons removed, moved to VS Code View Actions -->
    <span id="status-msg" class="toolbar-status"></span>
    </div>
    <div class="header">
        <div class="header-item" title="${safeLeft}">${safeLeft}</div>
        <div class="header-item" title="${safeRight}">${safeRight}</div>
    </div>
    <div class="container">
        <div class="pane" id="left-pane">
        <div class="pane-content" id="left-content">
          ${diffHtml}
        </div>
        </div>
        <div class="pane" id="right-pane">
        <div class="pane-content" id="right-content">
          ${diffHtml}
        </div>
        </div>
    </div>
    <script nonce="${nonce}">
        const translations = ${JSON.stringify(translations)};
        const t = (key, ...args) => {
            let text = translations[key] || key;
            args.forEach((arg, i) => {
                text = text.replace(\`{\${i}}\`, String(arg));
            });
            return text;
        };

        const vscode = acquireVsCodeApi();
        const leftPane = document.getElementById('left-pane');
        const rightPane = document.getElementById('right-pane');
        const leftContent = document.getElementById('left-content');
        const rightContent = document.getElementById('right-content');
        const statusMsg = document.getElementById('status-msg');

        const runtimeDiagnostics = {
          events: [],
          maxEvents: 40,
          hasReported: false,
          lastSignature: '',
          reportId: 0,
        };

        const noteRuntimeEvent = (name, extra = {}) => {
          runtimeDiagnostics.events.push({
            time: Math.round(performance.now()),
            name,
            extra,
          });

          if (runtimeDiagnostics.events.length > runtimeDiagnostics.maxEvents) {
            runtimeDiagnostics.events.shift();
          }
        };

        const snapshotPaneMetrics = (name, pane, content) => {
          const style = window.getComputedStyle(pane);
          return {
            name,
            clientHeight: pane.clientHeight,
            scrollHeight: pane.scrollHeight,
            clientWidth: pane.clientWidth,
            scrollWidth: pane.scrollWidth,
            scrollTop: pane.scrollTop,
            offsetWidth: pane.offsetWidth,
            offsetHeight: pane.offsetHeight,
            contentHeight: Math.round(content.getBoundingClientRect().height),
            contentWidth: Math.round(content.getBoundingClientRect().width),
            scrollbarWidth: pane.offsetWidth - pane.clientWidth,
            overflowX: style.overflowX,
            overflowY: style.overflowY,
            verticalScrollNeeded: pane.scrollHeight > pane.clientHeight + 2,
            horizontalScrollNeeded: pane.scrollWidth > pane.clientWidth + 2,
          };
        };

        const snapshotViewportMetrics = () => {
          const documentElement = document.documentElement;
          const container = document.querySelector('.container');
          return {
            innerHeight: window.innerHeight,
            innerWidth: window.innerWidth,
            devicePixelRatio: window.devicePixelRatio,
            documentClientHeight: documentElement.clientHeight,
            documentScrollHeight: documentElement.scrollHeight,
            documentClientWidth: documentElement.clientWidth,
            documentScrollWidth: documentElement.scrollWidth,
            bodyClientHeight: document.body.clientHeight,
            bodyScrollHeight: document.body.scrollHeight,
            bodyClientWidth: document.body.clientWidth,
            bodyScrollWidth: document.body.scrollWidth,
            containerClientHeight: container ? container.clientHeight : null,
            containerScrollHeight: container ? container.scrollHeight : null,
            containerClientWidth: container ? container.clientWidth : null,
            containerScrollWidth: container ? container.scrollWidth : null,
          };
        };

        const emitRuntimeDiagnostics = (reason, extra = {}, options = {}) => {
          const metrics = {
            inline: isInline,
            folded: isFolded,
            left: snapshotPaneMetrics('left', leftPane, leftContent),
            right: snapshotPaneMetrics('right', rightPane, rightContent),
            viewport: snapshotViewportMetrics(),
          };

          const verticalScrollNeeded =
            metrics.left.verticalScrollNeeded || metrics.right.verticalScrollNeeded;
          const suspiciousNoScroll =
            !verticalScrollNeeded &&
            (
              metrics.left.clientHeight === 0 ||
              metrics.right.clientHeight === 0 ||
              metrics.left.contentHeight > metrics.left.clientHeight + 2 ||
              metrics.right.contentHeight > metrics.right.clientHeight + 2 ||
              metrics.viewport.documentScrollHeight > metrics.viewport.documentClientHeight + 2 ||
              metrics.viewport.bodyScrollHeight > metrics.viewport.bodyClientHeight + 2
            );
          const shouldEmit =
            options.force ||
            !runtimeDiagnostics.hasReported ||
            verticalScrollNeeded ||
            suspiciousNoScroll;

          if (!shouldEmit) {
            return;
          }

          const signature = JSON.stringify({
            reason,
            inline: metrics.inline,
            folded: metrics.folded,
            left: {
              clientHeight: metrics.left.clientHeight,
              scrollHeight: metrics.left.scrollHeight,
              scrollbarWidth: metrics.left.scrollbarWidth,
            },
            right: {
              clientHeight: metrics.right.clientHeight,
              scrollHeight: metrics.right.scrollHeight,
              scrollbarWidth: metrics.right.scrollbarWidth,
            },
            viewport: {
              documentClientHeight: metrics.viewport.documentClientHeight,
              documentScrollHeight: metrics.viewport.documentScrollHeight,
              bodyClientHeight: metrics.viewport.bodyClientHeight,
              bodyScrollHeight: metrics.viewport.bodyScrollHeight,
              containerClientHeight: metrics.viewport.containerClientHeight,
              containerScrollHeight: metrics.viewport.containerScrollHeight,
            },
            flags: {
              verticalScrollNeeded,
              suspiciousNoScroll,
            },
          });

          if (runtimeDiagnostics.lastSignature === signature) {
            return;
          }

          runtimeDiagnostics.hasReported = true;
          runtimeDiagnostics.lastSignature = signature;
          runtimeDiagnostics.reportId += 1;
          vscode.postMessage({
            command: 'runtimeDiagnostics',
            payload: {
              reason,
              reportId: runtimeDiagnostics.reportId,
              metrics,
              recentEvents: runtimeDiagnostics.events.slice(-20),
              extra,
            },
          });
        };

        window.addEventListener('error', event => {
          noteRuntimeEvent('window-error', {
            message: event.message,
            filename: event.filename,
            line: event.lineno,
            column: event.colno,
          });
          emitRuntimeDiagnostics(
            'window-error',
            {
              message: event.message,
              filename: event.filename,
              line: event.lineno,
              column: event.colno,
            },
            { force: true },
          );
        });

        window.addEventListener('unhandledrejection', event => {
          const reason = event.reason instanceof Error
            ? { message: event.reason.message, stack: event.reason.stack }
            : { value: String(event.reason) };
          noteRuntimeEvent('unhandled-rejection', reason);
          emitRuntimeDiagnostics('unhandled-rejection', reason, { force: true });
        });

        let isInline = false;
        let isFolded = false;
        let changeElements = [];
        let currentChangeIndex = -1;
        let isScrolling = false; // Restored missing variable for scroll sync

        const toggleInline = () => {
            isInline = !isInline;
          noteRuntimeEvent('toggle-inline', { isInline });
            if (isInline) {
                document.body.classList.add('inline-mode');
                resetGhosts(); // Inline mode shows everything
                // Fix Mermaid diagrams that were hidden
            requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                fixMermaid(rightContent);
              });
            });
            } else {
                document.body.classList.remove('inline-mode');
                // Defer cleanup to ensure class removal processed? No, sync is fine.
                // Re-calculate ghosts for split mode
                cleanupGhosts();
            }
            // Recalculate changes because visibility changed
            scheduleLayoutRefresh();
        };
        
        /**
         * Re-initializes Mermaid diagrams that might have rendered improperly 
         * due to being hidden (zero dimensions).
         */
        const fixMermaid = (container) => {
             const mermaids = container.querySelectorAll('.mermaid[data-original-content]');
             const renderPasses = [];
             noteRuntimeEvent('fix-mermaid', { count: mermaids.length });
             mermaids.forEach(el => {
                 // Only fix if it looks broken (e.g. small height) or just force it?
                 // Force restoration is safer for "hidden -> visible" transitions.
                 const original = el.getAttribute('data-original-content');
                 if (original) {
                     // Check if already processed and looks okay? 
                     // Mermaid removes the text and puts SVG. 
                     // If we want to re-render, we MUST restore text.
                     // But we should only do this if it's actually visible now.
                     if (el.offsetParent !== null) { // is visible
                         el.removeAttribute('data-processed'); // Mermaid marker
                       el.textContent = original; // Restore source as text, not HTML
                         renderPasses.push(
                           Promise.resolve().then(() => mermaid.init(undefined, el)),
                         );
                     }
                 }
             });

             if (renderPasses.length > 0) {
               Promise.allSettled(renderPasses).finally(() => scheduleAsyncLayoutRefresh());
             }
        };
        
        const toggleFold = () => {
             isFolded = !isFolded;
             noteRuntimeEvent('toggle-fold', { isFolded });
             const c1 = applyFolding(leftContent, isFolded, 'original');
             const c2 = applyFolding(rightContent, isFolded, 'modified');
             
             if (isFolded) {
                 statusMsg.textContent = t("Folded {0} (Original) / {1} (Modified) blocks", c1, c2);
             } else {

                 statusMsg.textContent = '';
             }
               scheduleAsyncLayoutRefresh();
        };

        function applyFolding(pane, enable, paneType) {
            // Remove existing placeholders (Only needed at top level really, but safe here)
            // Note: If recursing, parent already cleared *descendant* placeholders?
            // querySelectorAll is deep. So top level call clears everything.
            // But inner calls might try to clear again. Harmless.
            const placeholders = pane.querySelectorAll('.fold-placeholder');
            placeholders.forEach(el => el.remove());
            
            // Un-hide everything first
            const hidden = pane.querySelectorAll('.folded-region-item');
            hidden.forEach(el => {
                el.classList.remove('folded-region-item');
                el.style.display = '';
            });

            if (!enable) return 0;

            const children = Array.from(pane.children);
            let noChangeBlock = [];
            let totalFolded = 0;
            
            const flushBlock = () => {
                if (noChangeBlock.length > 3) { 
                    const toHide = noChangeBlock.slice(1, noChangeBlock.length - 1);
                    
                    if (toHide.length === 0) return;

                     const visibleToHide = toHide.filter(el => {
                          const text = el.textContent.trim();
                          if (text.length === 0 && !el.querySelector('img')) return false; 
                          
                          // Changes are already filtered out logic-wise, but excluding valid change tags 
                          // from "unchanged block count" is safer for symmetric logic.
                          if (el.tagName === 'INS' || el.tagName === 'DEL') return false;

                          return true;
                     });

                     const firstHidden = toHide[0];
                     if (firstHidden) {
                         const isList = pane.tagName === 'UL' || pane.tagName === 'OL';
                         const placeholder = document.createElement(isList ? 'li' : 'div');
                         placeholder.className = 'fold-placeholder';
                         placeholder.textContent = t("{0} unchanged blocks", visibleToHide.length);
                         placeholder.title = t("Click to expand");
                         placeholder.onclick = (e) => {

                             e.stopPropagation(); // Prevent parent clicks
                             toHide.forEach(el => el.style.display = '');
                             placeholder.remove();
                         };
                         pane.insertBefore(placeholder, firstHidden);
                     }

                    toHide.forEach(el => {
                        el.style.display = 'none';
                        el.classList.add('folded-region-item');
                    });
                    totalFolded += visibleToHide.length;
                }
                noChangeBlock = [];
            };

            children.forEach(child => {
                // Check if child has changes RELEVANT to this pane
                let hasChange = false;
                
                // Helper to check if an element is a "meaningful" change tag
                const isRealChange = (tag, tagName) => {
                    const els = child.querySelectorAll(tag);
                    for (let el of els) {
                        // Aggressive trim: remove all whitespace including NBSP
                        const text = el.textContent.replace(/[\s\u00A0]+/g, '');
                        if (text.length > 0) return true;
                         // Check for images inside change
                        if (el.querySelector('img')) return true;
                         // Check for checkboxes inside change
                        if (el.querySelector('input[type="checkbox"]')) return true;
                    }
                    if (child.tagName === tagName) {
                        const text = child.textContent.replace(/[\s\u00A0]+/g, '');
                        if (text.length > 0) return true;
                        if (child.querySelector('img')) return true;
                        if (child.querySelector('input[type="checkbox"]')) return true;
                    }
                    return false;
                };

                // Symmetric Folding: Check for ANY change in the block (INS or DEL).
                // If there is an insertion OR deletion, we should NOT fold it, 
                // regardless of which pane we are showing.
                hasChange = isRealChange('del', 'DEL') || isRealChange('ins', 'INS');
                
                if (!hasChange) {
                    noChangeBlock.push(child);
                } else {
                    flushBlock();
                    // Recursion: Check for nested folding opportunities
                    const safeTags = ['DIV', 'SECTION', 'ARTICLE', 'BLOCKQUOTE', 'MAIN', 'UL', 'OL'];
                    if (safeTags.includes(child.tagName)) {
                        totalFolded += applyFolding(child, enable, paneType);
                    }
                }
            });
            flushBlock(); // Flush end
            
            return totalFolded;
        }

        // --- Navigation Logic ---
        // --- Helper: Calculate Top relative to Pane ---
        const getRelativeTop = (el, pane) => {
            if (!el || !el.getBoundingClientRect) return 0;
            const elRect = el.getBoundingClientRect();
            const paneRect = pane.getBoundingClientRect();
            return elRect.top - paneRect.top + pane.scrollTop;
        };

        // --- Navigation Logic ---
        function collectChanges() {
            try {
                changeElements = [];
                currentChangeIndex = -1;
                statusMsg.textContent = t("Scanning...");
                
                document.querySelectorAll('.selected-change').forEach(el => el.classList.remove('selected-change'));
                
                const isMeaningfulChange = (el) => {
                     if (!el) return false;
                     if (el.tagName === 'IMG') return true;
                     if (el.classList && (el.classList.contains('fm-old') || el.classList.contains('fm-new'))) return true;
                     if (el.textContent && el.textContent.trim().length > 0) return true;
                     if (el.querySelector && el.querySelector('img')) return true;
                     if (el.querySelector && el.querySelector('table')) return true;

                     // Explicitly allow checkboxes to be navigated to
                     if (el.tagName === 'INPUT' && el.type === 'checkbox') return true;
                     if (el.querySelector && el.querySelector('input[type="checkbox"]')) return true;

                     // Explicitly allow complex blocks
                     if (el.querySelector && (el.querySelector('.mermaid') || el.querySelector('.katex-block'))) return true;
                     return false;
                };

                // Helper to check if element is part of a complex block (Mermaid, Math, etc.)
                // Now checks BOTH if we are inside one OR if we contain one.
                const getComplexContainer = (el) => {
                    // Case 1: The change is inside a complex block (e.g. text change in a node)
                    const ancestor = el.closest('.mermaid') || el.closest('.katex-block') || el.closest('svg');
                    if (ancestor) return ancestor;

                    // Case 2: The change WRAPS a complex block (e.g. a new diagram added)
                    // We prefer the child container for highlighting as it's the visual element.
                    if (el.querySelector) {
                         let child = el.querySelector('.mermaid') || el.querySelector('.katex-block');
                         if (!child) {
                             // Only treat SVG as complex if it's NOT an alert icon
                             const svg = el.querySelector('svg');
                             // Check if SVG is inside an alert title
                             if (svg && !svg.closest('.markdown-alert-title')) {
                                 child = svg;
                             }
                         }
                         if (child) return child;
                    }
                    return null;
                };

                // Set to track complex containers we've already added
                const seenContainers = new Set();

                const processNodeList = (nodes, pane) => {
                    const results = [];
                    nodes.forEach(el => {
                        if (el.offsetParent === null) return; // Invisible
                        
                        // Check for Complex Container (Mermaid/Math)
                        const container = getComplexContainer(el);
                        if (container) {
                            if (!seenContainers.has(container)) {
                                seenContainers.add(container);
                                results.push({
                                    el: container,
                                    top: getRelativeTop(container, pane),
                                    ratio: getRatio(container, pane),
                                    pane: pane
                                });
                            }
                            return; // Skip individual element
                        }

                        if (isMeaningfulChange(el)) {
                            results.push({
                                el: el,
                                top: getRelativeTop(el, pane),
                                ratio: getRatio(el, pane),
                                pane: pane
                            });
                        }
                    });
                    return results;
                };

                const getRatio = (el, pane) => {
                    const top = getRelativeTop(el, pane);
                    const height = pane.scrollHeight;
                    return height > 0 ? top / height : 0;
                };

                let all = [];

                if (isInline) {
                  const changes = rightContent.querySelectorAll('ins, del, .fm-new, .fm-old');
                    all = processNodeList(changes, rightPane);
                } else {
                    // Split Mode
                  const leftDels = leftContent.querySelectorAll('del, .fm-old');
                  const rightIns = rightContent.querySelectorAll('ins, .fm-new');
                    
                    all = [
                        ...processNodeList(leftDels, leftPane),
                        ...processNodeList(rightIns, rightPane)
                    ];
                }
                
                // Filter invisible items (height 0)
                all = all.filter(item => item.el.getBoundingClientRect().height > 0);

                all.sort((a, b) => {
                    if (isNaN(a.ratio) && isNaN(b.ratio)) return 0;
                    if (isNaN(a.ratio)) return 1;
                    if (isNaN(b.ratio)) return -1;

                    const diff = a.ratio - b.ratio;
                    if (Math.abs(diff) < 0.001) {
                        // Stable sort for close items
                        const samePane = a.pane === b.pane;
                        if (samePane) {
                            return a.top - b.top;
                        }
                        
                        const isAFm = a.el.classList.contains('fm-old') || a.el.classList.contains('fm-new');
                        const isBFm = b.el.classList.contains('fm-old') || b.el.classList.contains('fm-new');
                        if (isAFm && !isBFm) return -1;
                        if (!isAFm && isBFm) return 1;
                        return 0; 
                    }
                    return diff;
                });
                changeElements = all;
            
    
            // Grouping Logic
            // This entire block is inside the try-catch for safety
            
            if (changeElements.length > 0) {
                const groups = [];
                let currentGroup = [];
                
                changeElements.forEach((item, index) => {
                    if (index === 0) {
                        currentGroup.push(item);
                        return;
                    }
                    
                    const prev = changeElements[index - 1];
                    let isSameGroup = false;

                    // 1. Strict Pane Check
                    if (item.pane === prev.pane) {
                        const prevBottom = prev.top + prev.el.offsetHeight;
                        const gap = item.top - prevBottom;
                        
                        // Strict check < 8px
                        if (gap < 8) {
                            isSameGroup = true;
                        }
                    }
                    
                    if (isSameGroup) {
                        currentGroup.push(item);
                    } else {
                        groups.push(currentGroup);
                        currentGroup = [item];
                    }
                });
                
                if (currentGroup.length > 0) groups.push(currentGroup);
                changeElements = groups;
                
                statusMsg.textContent = t("Found {0} groups", changeElements.length);
                statusMsg.style.color = '';
            } else {
                statusMsg.textContent = t("No changes found");
            }
            } catch (e) {
                console.error(e);
                statusMsg.textContent = t("Error: {0}", e.message);
                statusMsg.style.color = 'red';
            }
        }

        // --- Layout Stability ---
        let resizeTimeout;
        let layoutRefreshTimeout;
        let layoutStabilizeFrame = 0;
        let layoutRefreshQueued = false;
        let layoutRefreshRunning = false;
        let asyncLayoutRefreshShortTimeout;
        let asyncLayoutRefreshLongTimeout;
        const flushPaneLayout = (pane) => {
          void pane.scrollHeight;
          void pane.scrollWidth;
          pane.getBoundingClientRect();
        };
        const measureLayout = () => {
          return [
            leftPane.scrollHeight,
            leftPane.clientHeight,
            leftPane.scrollWidth,
            leftPane.clientWidth,
            leftContent.scrollHeight,
            leftContent.scrollWidth,
            rightPane.scrollHeight,
            rightPane.clientHeight,
            rightPane.scrollWidth,
            rightPane.clientWidth,
            rightContent.scrollHeight,
            rightContent.scrollWidth,
            document.documentElement.clientHeight,
            document.documentElement.clientWidth,
          ].join(':');
        };
        const refreshGhostLayout = () => {
          if (!isInline) {
            cleanupGhosts();
          }
        };
        const refreshLayout = () => {
          flushPaneLayout(leftPane);
          flushPaneLayout(rightPane);
          collectChanges();
        };
        const stabilizeLayout = () => {
          if (layoutRefreshRunning) {
            layoutRefreshQueued = true;
            noteRuntimeEvent('stabilize-queued');
            return;
          }

          layoutRefreshRunning = true;
          layoutRefreshQueued = false;
          noteRuntimeEvent('stabilize-start');

          flushPaneLayout(leftContent);
          if (layoutStabilizeFrame) {
          flushPaneLayout(rightContent);
            cancelAnimationFrame(layoutStabilizeFrame);
            layoutStabilizeFrame = 0;
          }

          let stableFrames = 0;
          let remainingFrames = 24;
          let previousMetrics = '';

          const step = () => {
            refreshLayout();
            const metrics = measureLayout();
            if (metrics === previousMetrics) {
              stableFrames += 1;
            } else {
              previousMetrics = metrics;
              stableFrames = 0;
            }

            remainingFrames -= 1;
            if (stableFrames >= 2 || remainingFrames <= 0) {
              layoutStabilizeFrame = 0;
              layoutRefreshRunning = false;
              noteRuntimeEvent('stabilize-complete', {
                stableFrames,
                remainingFrames,
              });
              emitRuntimeDiagnostics('stabilize-complete', {
                stableFrames,
                remainingFrames,
              });
              if (layoutRefreshQueued) {
                layoutRefreshQueued = false;
                stabilizeLayout();
              }
              return;
            }

            layoutStabilizeFrame = requestAnimationFrame(step);
          };

          layoutStabilizeFrame = requestAnimationFrame(step);
        };
        const scheduleLayoutRefresh = (delay = 0) => {
          clearTimeout(layoutRefreshTimeout);
          noteRuntimeEvent('schedule-layout-refresh', { delay });
          layoutRefreshTimeout = setTimeout(() => {
            stabilizeLayout();
          }, delay);
        };
        const scheduleAsyncLayoutRefresh = () => {
          noteRuntimeEvent('schedule-async-layout-refresh');
          refreshGhostLayout();
          scheduleLayoutRefresh();

          clearTimeout(asyncLayoutRefreshShortTimeout);
          clearTimeout(asyncLayoutRefreshLongTimeout);

          asyncLayoutRefreshShortTimeout = setTimeout(() => {
            refreshGhostLayout();
            scheduleLayoutRefresh();
          }, 180);
          asyncLayoutRefreshLongTimeout = setTimeout(() => {
            refreshGhostLayout();
            scheduleLayoutRefresh();
          }, 700);
        };
        const onResize = () => {
          clearTimeout(resizeTimeout);
          resizeTimeout = setTimeout(() => {
            scheduleLayoutRefresh();
          }, 120);
        };

        if (window.ResizeObserver) {
          const contentHeights = new WeakMap();
          const contentResizeObserver = new ResizeObserver((entries) => {
            const heightChanged = entries.some((entry) => {
              const nextHeight = entry.contentRect.height;
              const previousHeight = contentHeights.get(entry.target);
              contentHeights.set(entry.target, nextHeight);
              return previousHeight === undefined || Math.abs(previousHeight - nextHeight) > 0.5;
            });

            if (heightChanged) {
              noteRuntimeEvent('content-resize', { entries: entries.length });
              scheduleAsyncLayoutRefresh();
            }
          });
          contentResizeObserver.observe(leftContent);
          contentResizeObserver.observe(rightContent);
        }

        window.addEventListener('resize', onResize);

        const contentObserver = new MutationObserver((mutations) => {
          if (
            mutations.some(
              (mutation) =>
                (mutation.type === 'childList' &&
                  (mutation.addedNodes.length > 0 || mutation.removedNodes.length > 0)) ||
                mutation.type === 'attributes',
            )
          ) {
            noteRuntimeEvent('content-mutation', { count: mutations.length });
            scheduleLayoutRefresh();
          }
        });
        contentObserver.observe(leftContent, {
          attributes: true,
          attributeFilter: ['data-processed', 'height', 'src', 'viewBox', 'width'],
          childList: true,
          subtree: true,
        });
        contentObserver.observe(rightContent, {
          attributes: true,
          attributeFilter: ['data-processed', 'height', 'src', 'viewBox', 'width'],
          childList: true,
          subtree: true,
        });

        window.addEventListener('load', () => {
          noteRuntimeEvent('window-load');
          scheduleAsyncLayoutRefresh();
        });
        window.setTimeout(() => {
          noteRuntimeEvent('startup-watchdog');
          emitRuntimeDiagnostics('startup-watchdog', { timeoutMs: 1500 }, { force: true });
        }, 1500);

        function scrollToChange(index) {
            if (index < 0 || index >= changeElements.length) return;
            
            // Remove previous highlight
            document.querySelectorAll('.selected-change').forEach(el => el.classList.remove('selected-change'));
            
            const group = changeElements[index];
            if (!group || group.length === 0) return;

            const firstItem = group[0];
            const targetEl = firstItem.el || firstItem;
            const targetPane = firstItem.pane || rightPane; // Default to right pane for inline
            
            // Apply persistent highlight
            group.forEach(item => {
                const el = item.el || item;
                el.classList.add('selected-change');
            });

            const paneHeight = targetPane.clientHeight;
            
            // Use getRelativeTop to get the robust position relative to the pane (handles nested offsetParents correctly)
            // This fixes the issue where offsetTop is relative to a nested container (e.g. inside Mermaid div)
            let elTop = getRelativeTop(targetEl, targetPane);
            
            // Fallback: If getRelativeTop returns ~0 because element is detached/hidden (e.g. replaced by Mermaid),
            // use the stored 'top' from collectChanges if valid.
            // Note: getRelativeTop includes scrollTop, so if it returns exactly scrollTop, it implies relative offset is 0.
            // But here we check if it is suspiciously 0 or NaN.
            if ((isNaN(elTop) || elTop <= 0) && firstItem.top > 0) {
                 elTop = firstItem.top;
            }

            const elHeight = targetEl.offsetHeight || 20; 
            
            // Calculate target scroll position (centering the element)
            const targetScrollTop = elTop - (paneHeight / 2) + (elHeight / 2);
            
            targetPane.scrollTop = Math.max(0, targetScrollTop);

            // Sync the other pane proportionally to keep side-by-side aligned
            if (!isInline) {
                const otherPane = targetPane === leftPane ? rightPane : leftPane;
                const sourceMax = targetPane.scrollHeight - targetPane.clientHeight;
                const otherMax = otherPane.scrollHeight - otherPane.clientHeight;
                if (sourceMax > 0 && otherMax > 0) {
                    const pct = targetPane.scrollTop / sourceMax;
                    otherPane.scrollTop = pct * otherMax;
                }
            }
        }

        function goNext() {
            if (!changeElements || changeElements.length === 0) collectChanges();
            if (changeElements.length === 0) return;

            currentChangeIndex++;
            if (currentChangeIndex >= changeElements.length) {
                currentChangeIndex = 0; 
            }
            scrollToChange(currentChangeIndex);
            updateStatus();
        }

        function goPrev() {
            if (!changeElements || changeElements.length === 0) collectChanges();
            if (changeElements.length === 0) return;

            currentChangeIndex--;
            if (currentChangeIndex < 0) {
                currentChangeIndex = changeElements.length - 1;
            }
            scrollToChange(currentChangeIndex);
            updateStatus();
        }
        
        function updateStatus() {
             statusMsg.textContent = t("Change {0} of {1}", currentChangeIndex + 1, changeElements.length);
        }


        // --- Scroll Sync (Master-Slave Pattern) ---
        // Instead of a timer-based lock (which can drop final events),
        // we track which pane the user is interacting with.
        
        let activePane = null;

        const syncScroll = (sourcePane, targetPane) => {
            // Only sync if the source is the one being actively scrolled by user
            if (activePane !== sourcePane) return;
            
            const sourceMax = sourcePane.scrollHeight - sourcePane.clientHeight;
            const targetMax = targetPane.scrollHeight - targetPane.clientHeight;
          const sourceHorizontalMax = sourcePane.scrollWidth - sourcePane.clientWidth;
          const targetHorizontalMax = targetPane.scrollWidth - targetPane.clientWidth;

          if (sourceMax > 0 && targetMax > 0) {
            let targetScrollTop = 0;
            // Larger 2px margin for subpixel snapping
            if (sourcePane.scrollTop <= 2) {
              targetScrollTop = 0;
            } else if (sourcePane.scrollTop >= sourceMax - 2) {
              targetScrollTop = targetMax;
            } else {
              const percentage = sourcePane.scrollTop / sourceMax;
              targetScrollTop = percentage * targetMax;
            }
                
            if (Math.abs(targetPane.scrollTop - targetScrollTop) > 0.5) {
              targetPane.scrollTop = targetScrollTop;
            }
            }

          if (sourceHorizontalMax > 0 && targetHorizontalMax > 0) {
            let targetScrollLeft = 0;
            if (sourcePane.scrollLeft <= 2) {
              targetScrollLeft = 0;
            } else if (sourcePane.scrollLeft >= sourceHorizontalMax - 2) {
              targetScrollLeft = targetHorizontalMax;
            } else {
              const percentage = sourcePane.scrollLeft / sourceHorizontalMax;
              targetScrollLeft = percentage * targetHorizontalMax;
            }

            if (Math.abs(targetPane.scrollLeft - targetScrollLeft) > 0.5) {
              targetPane.scrollLeft = targetScrollLeft;
            }
            }
        };

        const setActive = (pane) => { activePane = pane; };
        
        // Track mouse/touch to determine which pane should be the 'Master'
        leftPane.addEventListener('mouseenter', () => setActive(leftPane));
        rightPane.addEventListener('mouseenter', () => setActive(rightPane));
        leftPane.addEventListener('touchstart', () => setActive(leftPane), { passive: true });
        rightPane.addEventListener('touchstart', () => setActive(rightPane), { passive: true });
        leftPane.addEventListener('wheel', () => setActive(leftPane), { passive: true });
        rightPane.addEventListener('wheel', () => setActive(rightPane), { passive: true });

        leftPane.addEventListener('scroll', () => {
             if (!isInline) syncScroll(leftPane, rightPane);
        });

        rightPane.addEventListener('scroll', () => {
             if (!isInline) syncScroll(rightPane, leftPane);
        });

        // Double Click to Open Source
        document.body.addEventListener('dblclick', (e) => {
            // Check if click originated from toolbar or buttons
            if (e.target.closest('.toolbar')) {
                return;
            }

            const target = e.target;
            const pane = target.closest('.pane');
            if (!pane) return;

            let side = 'modified'; // Default
            if (pane.id === 'left-pane') {
                side = 'original';
            } else if (pane.id === 'right-pane') {
                side = 'modified';
            }

            // Find closest element with data-line
            const lineEl = target.closest('[data-line]');
            let line = 0;
            if (lineEl) {
                line = parseInt(lineEl.getAttribute('data-line'), 10);
            }

            vscode.postMessage({ 
                command: 'openSource',
                side: side,
                line: line
            });
        });

        // --- Ghost Element Cleanup ---
        function cleanupGhosts() {
             resetGhosts();
             if (document.body.classList.contains('inline-mode')) return;

             const leftContent = document.getElementById('left-content');
             const rightContent = document.getElementById('right-content');

             hideGhostsInPane(leftContent, 'INS');
             hideGhostsInPane(rightContent, 'DEL');
             
             // Extra cleanup for complex blocks (Alerts, Pre, etc.)
             // Hide containers whose visible content is entirely the opposite diff type.
             hideEmptyContainers(leftContent, 'INS');
             hideEmptyContainers(rightContent, 'DEL');
        }

        function resetGhosts() {
            document.querySelectorAll('.ghost-hidden').forEach(el => el.classList.remove('ghost-hidden'));
        }

        function hideGhostsInPane(pane, hiddenTagName) {
            const candidates = pane.querySelectorAll('li, tr');
            candidates.forEach(el => {
                if (isGraphicallyEmpty(el, hiddenTagName)) {
                    el.classList.add('ghost-hidden');
                }
            });

            // Container-level cleanup (ul, ol, table)
            const containers = pane.querySelectorAll('ul, ol, table, thead, tbody');
            containers.forEach(el => {
                 const children = Array.from(el.children);
                 const allHidden = children.every(c => c.classList.contains('ghost-hidden') || c.style.display === 'none');
                 if (children.length > 0 && allHidden) {
                     el.classList.add('ghost-hidden');
                 }
            });
        }

        // Targeted cleanup for complex blocks (Alerts, Code, Quotes)
        // Usually called for Left Pane (Original) to hide blocks that contain ONLY 'new' content (INS).
        function hideEmptyContainers(pane, hiddenTagName) {
             const complexSelectors = '.markdown-alert, pre, blockquote, .katex-block, .mermaid, h1, h2, h3, h4, h5, h6, p, dt, dd, hr';
             const candidates = pane.querySelectorAll(complexSelectors);
             
             candidates.forEach(el => {
                 // Check if graphically empty, respecting hiddenTagName (e.g. INS)
                 if (isGraphicallyEmpty(el, hiddenTagName)) {
                     el.classList.add('ghost-hidden');
                 }
             });
        }

        function isGraphicallyEmpty(el, hiddenTagName) {
             // HR is a void element that always renders a visible line.
             // It should never be considered "empty" — ins/del wrapping
             // is already handled by CSS display:none rules.
             if (el.tagName === 'HR') {
                 return false;
             }
             
             for (let i = 0; i < el.childNodes.length; i++) {
                const node = el.childNodes[i];
                if (node.nodeType === 3) {
                     if (node.textContent.trim().length > 0) return false;
                } else if (node.nodeType === 1) {
                     const tag = node.tagName;
                     if (tag === hiddenTagName) continue;
                     if (tag === 'IMG') return false;
                     // Ignore footnote backref links when checking emptiness
                     if (tag === 'A' && node.classList.contains('footnote-backref')) continue;
                     if (node.style.display === 'none' || node.classList.contains('ghost-hidden')) continue;
                     if (!isGraphicallyEmpty(node, hiddenTagName)) return false;
                }
             }
             return true;
        }

        // Initial cleanup
        cleanupGhosts();

        // Listen for standard shortcut commands from Extension
        window.addEventListener('message', event => {
            const message = event.data;
            switch (message.command) {
                case 'toggleInline':
                    toggleInline();
                    break;
                case 'toggleFold':
                    toggleFold();
                    break;
                case 'nextChange':
                    goNext();
                    break;
                case 'prevChange':
                    goPrev();
                    break;
                case 'toggleCaret':
                    // Optional: could implement caret syncing or other features
                    break;
                case 'syncScroll':
                    const ratio = message.ratio;
                    if (ratio !== undefined && !isScrolling) {
                        isScrolling = true;
                        // Scroll both panes to the ratio position
                        // We use the Left Pane as the driver for logic usually, but here we drive both.
                        // Calculate target scroll tops
                        const leftTarget = ratio * (leftPane.scrollHeight - leftPane.clientHeight);
                        const rightTarget = ratio * (rightPane.scrollHeight - rightPane.clientHeight);
                        
                        leftPane.scrollTop = leftTarget;
                        rightPane.scrollTop = rightTarget;
                        
                        setTimeout(() => isScrolling = false, 50);
                    }
                    break;
            }
        });

        // Initialize Mermaid
    mermaid.initialize({ startOnLoad: true, securityLevel: 'strict' });

      scheduleAsyncLayoutRefresh();
      if (document.fonts && document.fonts.ready) {
        document.fonts.ready.finally(() => {
          scheduleAsyncLayoutRefresh();
        });
      }

      // Re-trigger layout stabilization when the webview tab becomes visible again.
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
      noteRuntimeEvent('visibility-visible');
        scheduleAsyncLayoutRefresh();
        }
    });

      const trackedImages = new WeakSet();
      const trackImageLayout = (image) => {
        if (!image || trackedImages.has(image)) {
          return;
        }

        trackedImages.add(image);

        const finalizeImageLayout = () => {
          noteRuntimeEvent('image-finalize-layout');
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              scheduleAsyncLayoutRefresh();
            });
          });
        };

        if (typeof image.decode === 'function') {
          Promise.resolve()
            .then(() => image.decode())
            .catch(() => undefined)
            .finally(() => noteRuntimeEvent('image-decode-finished'))
            .finally(finalizeImageLayout);
          return;
        }

        finalizeImageLayout();
      };

      document.querySelectorAll('img').forEach(trackImageLayout);

      // Listen for async image loads that may change scroll dimensions.
      document.addEventListener('load', event => {
        if (event.target && event.target.tagName === 'IMG') {
        noteRuntimeEvent('image-load');
        trackImageLayout(event.target);
        scheduleAsyncLayoutRefresh();
        }
      }, true);
      document.addEventListener('error', event => {
        if (event.target && event.target.tagName === 'IMG') {
        noteRuntimeEvent('image-error');
        scheduleAsyncLayoutRefresh();
        }
      }, true);
    </script>
    <script>/* VRT_SCRIPT_PLACEHOLDER */</script>
</body>
</html>`;
  }
}
