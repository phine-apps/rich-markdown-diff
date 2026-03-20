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
// @ts-ignore
const wikilinks = require("markdown-it-wikilinks");
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
          } catch (__) {
            /* ignore highlight errors and fallback */
          }
        }
        return "";
      },
    });

    // Plugin Configuration
    // Wikilinks: default options
    this.md.use(wikilinks({ uriSuffix: "" }));

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
        return `<div class="mermaid" data-original-content="${escapedContent}">\n${token.content}\n</div>`;
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
          "style",
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
        ],
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

    // Tokenize Mermaid blocks and Checkboxes to prevent internal diffing
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

    // Fix Invalid Nesting
    bodyDiffHtml = this.fixInvalidNesting(bodyDiffHtml);

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

      if (oldVal !== newVal) {
        hasFmChanges = true;
        const safeOldKey = oldMatter.data.hasOwnProperty(key)
          ? oldVal || '""'
          : "(missing)";
        const safeNewKey = newMatter.data.hasOwnProperty(key)
          ? newVal || '""'
          : "(missing)";

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
                <thead>
                    <tr><th class="fm-key">Key</th><th class="fm-old">Original</th><th class="fm-new">Modified</th></tr>
                </thead>
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

    // Refine Footnotes
    const footnoteRegex =
      /(<del[^>]*>\s*(<li[^>]*class=["']footnote-item["'][^>]*>[\s\S]*?<\/li>)\s*<\/del>)\s*(<ins[^>]*>\s*(<li[^>]*class=["']footnote-item["'][^>]*>[\s\S]*?<\/li>)\s*<\/ins>)/gi;

    // console.log("refineBlockDiffs Input:", html.substring(html.indexOf("footnotes-list"), html.indexOf("footnotes-list") + 1000));

    html = html.replace(footnoteRegex, replacer);

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
  private replaceComplexBlocksWithTokens(html: string): {
    html: string;
    tokens: Record<string, string>;
  } {
    const tokens: Record<string, string> = {};
    return this.replaceBalancedTags(html, tokens);
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

  /**
   * Consolidates fragmented diff tags for block elements like tables.
   * If an entire block (e.g., table) consists only of deletions or only of insertions,
   * it wraps the entire block in <del> or <ins> and removes internal diff tags.
   */
  private consolidateBlockDiffs(html: string): string {
    const blocks = ["table", "ul", "ol", "blockquote", "div", "pre"];
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
    katexCssUri: string,
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

    const safeLeft = this.escapeHtml(leftLabel === "Original" ? t("Original") : leftLabel);
    const safeRight = this.escapeHtml(rightLabel === "Modified" ? t("Modified") : rightLabel);

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; img-src ${cspSource} https: data:; font-src ${cspSource};">
    <title>${this.escapeHtml(t("Markdown Diff"))}</title>
    <!-- KaTeX CSS -->
    <link rel="stylesheet" href="${katexCssUri}">
    <!-- Highlight.js CSS -->
    <link rel="stylesheet" href="${hljsLightCssUri}" media="(prefers-color-scheme: light)">
    <link rel="stylesheet" href="${hljsDarkCssUri}" media="(prefers-color-scheme: dark)">
    <!-- Mermaid JS -->
    <script nonce="${nonce}" src="${mermaidJsUri}"></script>
    <style>
        html, body {
            height: 100%;
            overflow: hidden;
            width: 100%;
        }
        body { 
            font-family: var(--vscode-font-family); 
            padding: 0; 
            margin: 0;
            background-color: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
            display: flex;
            flex-direction: column;
        }
        /* Toolbar */
        .toolbar {
            display: flex;
            align-items: center;
            padding: 5px 10px;
            background-color: var(--vscode-editor-background);
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
            display: flex;
            height: 30px;
            flex-shrink: 0;
            border-bottom: 1px solid var(--vscode-panel-border);
            background-color: var(--vscode-editor-background);
        }
        .header-item {
            flex: 1;
            padding: 5px 10px;
            font-weight: bold;
            border-right: 1px solid var(--vscode-panel-border);
            display: flex;
            align-items: center;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .container {
            display: flex;
            flex-direction: row;
            flex: 1;
            flex-basis: 0; /* Important for nested scrolling */
            min-height: 0;
            overflow: hidden;
            width: 100%;
            position: relative;
        }
        .pane {
            flex: 1;
            min-width: 0;
            overflow-y: auto;
            overflow-x: auto;
            padding: 20px;
            border-right: 1px solid var(--vscode-panel-border);
            box-sizing: border-box;
            height: 100%;
            position: relative; /* Ensure offsetTop is relative to pane */
        }
        .pane:last-child {
            border-right: none;
        }
        
        /* Inline Mode Styles */
        body.inline-mode .container {
            flex-direction: column;
        }
        body.inline-mode #left-pane {
            display: none;
        }
        body.inline-mode #right-pane {
            flex: 1;
            width: 100%;
            border-right: none;
        }
        body.inline-mode #right-pane {
            border-right: none;
            width: 100%;
        }
        body.inline-mode .header {
            display: none; /* Hide Original/Modified header in inline */
        }
        
        /* Inline Mode Coloring: Show BOTH del and ins in the right pane */
        body.inline-mode #right-pane del {
            display: inline; /* Make visible */
            background-color: rgba(248, 113, 113, 0.2); 
            text-decoration: line-through; /* Strikethrough for inline del */
            border-bottom: 2px solid #ef4444;
            color: inherit;
            opacity: 0.8;
        }
        /* Explicitly style ins in inline mode to match right-pane ins style */
        body.inline-mode #right-pane ins {
            background-color: rgba(74, 222, 128, 0.2); 
            text-decoration: none; 
            border-bottom: 2px solid #22c55e;
            color: inherit;
        }

        /* Scrollbar Styling */
        ::-webkit-scrollbar { width: 10px; height: 10px; }
        ::-webkit-scrollbar-thumb { background: var(--vscode-scrollbarSlider-background); }
        ::-webkit-scrollbar-thumb:hover { background: var(--vscode-scrollbarSlider-hoverBackground); }
        ::-webkit-scrollbar-thumb:active { background: var(--vscode-scrollbarSlider-activeBackground); }
        
        /* Markdown Styles */
        code { font-family: var(--vscode-editor-font-family); }
        pre { background-color: var(--vscode-textBlockQuote-background); padding: 10px; }
        img { max-width: 100%; }

        /* Split View Coloring Strategy (Default) */
        /* Left Pane (Original): Hide insertions, show deletions in Red */
        body:not(.inline-mode) #left-pane ins { display: none; }
        body:not(.inline-mode) #left-pane del { 
            background-color: rgba(248, 113, 113, 0.2); 
            text-decoration: none; 
            border-bottom: 2px solid #ef4444;
            color: inherit;
        }

        /* Right Pane (Modified): Hide deletions, show insertions in Green */
        body:not(.inline-mode) #right-pane del { display: none; }
        body:not(.inline-mode) #right-pane ins {
            background-color: rgba(74, 222, 128, 0.2); 
            text-decoration: none; 
            border-bottom: 2px solid #22c55e;
            color: inherit;
        }

        /* Full Document Diff Styling (for comparisons with empty files) */
        ins.diffins, del.diffdel {
            text-decoration: none;
            color: inherit;
        }
        ins.diffins {
            background-color: rgba(74, 222, 128, 0.2); 
            border-bottom: 2px solid #22c55e;
        }
        del.diffdel {
            background-color: rgba(248, 113, 113, 0.2); 
            border-bottom: 2px solid #ef4444;
        }

        /* Ensure diff styling is visible for tokenized blocks with their own backgrounds (Alerts) */
        ins.diffins .markdown-alert, del.diffdel .markdown-alert {
            position: relative; /* For pseudo-element overlay */
        }
        ins.diffins .markdown-alert {
            border: 2px solid #22c55e;
        }
        ins.diffins .markdown-alert::after {
            content: "";
            position: absolute;
            top: 0; left: 0; right: 0; bottom: 0;
            background-color: rgba(74, 222, 128, 0.2);
            pointer-events: none;
        }
        del.diffdel .markdown-alert {
            border: 2px solid #ef4444;
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
            border: 4px solid; /* Full border to match Images/Mermaid */
            padding: 10px;
            margin: 1em 0;
            width: fit-content; 
            min-width: 100%;
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

        /* Ghost Element Hiding */
        .ghost-hidden { display: none !important; }

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
            font-size: 13px;
        }
        .frontmatter-diff th, .frontmatter-diff td {
            border: 1px solid var(--vscode-textBlockQuote-border);
            padding: 5px;
            text-align: left;
        }
        .frontmatter-diff th {
            font-weight: bold;
        }
        .frontmatter-diff .fm-old {
            background-color: rgba(248, 113, 113, 0.2);
            color: var(--vscode-editor-foreground);
        }
        .frontmatter-diff .fm-new {
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
            border: 4px solid rgba(255, 165, 0, 0.9) !important;   /* Thick Orange border for focus */
            box-shadow: 0 0 20px rgba(255, 165, 0, 0.6) !important; /* Glow */
            overflow: visible !important;
            display: block; 
        }

        /* Image Focus Style (same as Mermaid) */
        .selected-change img {
            border: 4px solid rgba(255, 165, 0, 0.9) !important;   /* Thick Orange border for focus */
            box-shadow: 0 0 20px rgba(255, 165, 0, 0.6) !important; /* Glow */
        }

        /* Persistent Visibility for UNSELECTED complex changes */
        /* Insertions (Green) */
        ins .mermaid, ins .katex-block, ins svg {
            border: 4px solid rgba(34, 197, 94, 0.6); /* Unified 4px border */
            background-color: rgba(34, 197, 94, 0.1);  /* Unified 0.1 bg alpha */
            display: block;
            margin: 1em 0;
            padding: 10px;
        }
        /* Deletions (Red) */
        del .mermaid, del .katex-block, del svg {
            border: 4px solid rgba(239, 68, 68, 0.6); /* Unified 4px border */
            background-color: rgba(239, 68, 68, 0.1);  /* Unified 0.1 bg alpha */
            display: block;
            margin: 1em 0;
            padding: 10px;
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
            background-color: var(--vscode-textBlockQuote-background);
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
<body>
    <div class="toolbar">
        <!-- Buttons removed, moved to VS Code View Actions -->
        <span id="status-msg" style="margin-left: auto; font-size: 11px; opacity: 0.7;"></span>
    </div>
    <div class="header">
        <div class="header-item" title="${safeLeft}">${safeLeft}</div>
        <div class="header-item" title="${safeRight}">${safeRight}</div>
    </div>
    <div class="container">
        <div class="pane" id="left-pane">
            ${diffHtml}
        </div>
        <div class="pane" id="right-pane">
            ${diffHtml}
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
        const statusMsg = document.getElementById('status-msg');

        let isInline = false;
        let isFolded = false;
        let changeElements = [];
        let currentChangeIndex = -1;
        let isScrolling = false; // Restored missing variable for scroll sync

        const toggleInline = () => {
            isInline = !isInline;
            if (isInline) {
                document.body.classList.add('inline-mode');
                resetGhosts(); // Inline mode shows everything
                // Fix Mermaid diagrams that were hidden
                setTimeout(() => {
                    fixMermaid(rightPane);
                }, 50);
            } else {
                document.body.classList.remove('inline-mode');
                // Defer cleanup to ensure class removal processed? No, sync is fine.
                // Re-calculate ghosts for split mode
                cleanupGhosts();
            }
            // Recalculate changes because visibility changed
            collectChanges(); 
        };
        
        /**
         * Re-initializes Mermaid diagrams that might have rendered improperly 
         * due to being hidden (zero dimensions).
         */
        const fixMermaid = (container) => {
             const mermaids = container.querySelectorAll('.mermaid[data-original-content]');
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
                         el.innerHTML = original; // Restore source
                         mermaid.init(undefined, el);
                     }
                 }
             });
        };
        
        const toggleFold = () => {
             isFolded = !isFolded;
             const c1 = applyFolding(leftPane, isFolded, 'original');
             const c2 = applyFolding(rightPane, isFolded, 'modified');
             
             if (isFolded) {
                 statusMsg.textContent = t("Folded {0} (Original) / {1} (Modified) blocks", c1, c2);
             } else {

                 statusMsg.textContent = '';
             }
             collectChanges(); // Re-collect visible changes
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
                    const changes = rightPane.querySelectorAll('ins, del, .fm-new, .fm-old');
                    all = processNodeList(changes, rightPane);
                } else {
                    // Split Mode
                    const leftDels = leftPane.querySelectorAll('del, .fm-old');
                    const rightIns = rightPane.querySelectorAll('ins, .fm-new');
                    
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

        // --- Layout Stability & ResizeObserver ---
        let resizeTimeout;
        const onResize = () => {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(() => {
                collectChanges();
            }, 200);
        };

        if (window.ResizeObserver) {
            const ro = new ResizeObserver(onResize);
            ro.observe(leftPane);
            ro.observe(rightPane);
            // Also observe body to catch general layout shifts?
            ro.observe(document.body);
        } else {
            window.addEventListener('resize', onResize);
        }
        
        // Retries for image loading
        window.onload = () => {
            setTimeout(collectChanges, 100);
            setTimeout(collectChanges, 500);
            setTimeout(collectChanges, 1500); // Late load safety
        };

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

            if (sourceMax <= 0 || targetMax <= 0) return;

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

             const leftPane = document.getElementById('left-pane');
             const rightPane = document.getElementById('right-pane');

             hideGhostsInPane(leftPane, 'INS');
             hideGhostsInPane(rightPane, 'DEL');
             
             // Extra cleanup for complex blocks
             // Only for Left Pane (Original) to hide empty container shells (Alerts, Pre, etc.)
             hideEmptyContainers(leftPane, 'INS');
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
             // For void elements like HR, check if they should be hidden
             if (el.tagName === 'HR') {
                 // HR has no children, so loop below would return true (empty).
                 // However, we only want to hide it if logic dictates.
                 // In hideEmptyContainers, we are iterating candidates to hide them if they are empty.
                 // For HR, it IS empty (graphically).
                 // So returning true here causes it to be hidden.
                 // This effectively hides ALL non-connected HRs in the cleanup phase.
                 // Since cleanup is usually strict for Left Pane artifacts, this is desired for "orphan" HRs.
                 return true;
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
        mermaid.initialize({ startOnLoad: true });
    </script>
</body>
</html>`;
  }
}
