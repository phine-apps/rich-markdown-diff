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
import matter from "gray-matter";
import { sanitizeHtml, escapeHtml } from "./markdown/sanitizer";
import { getWebviewContent } from "./markdown/webviewTemplate";
import {
  cleanMarpHtml,
  resolveCssUrls,
  scopeMarpCss,
  splitMarpSlides,
  wrapMarpContainer,
} from "./markdown/marpRenderer";
import {
  createMarkdownRenderer,
  loadMarkdownPlugins,
} from "./markdown/renderer";
import {
  executeWithFullPipeline,
  lcsAlignment,
} from "./markdown/structuralDiff";

/**
 * Provides functionality to compute and render differences between Markdown documents.
 * It uses `markdown-it` for rendering and `htmldiff-js` for computing HTML-level differences.
 * Supports various Markdown extensions including Mermaid diagrams, KaTeX math, and GitHub alerts.
 */
export class MarkdownDiffProvider {
  private md: MarkdownIt;
  private marp: any; // Lazy-loaded Marp instance

  private readyPromise: Promise<void>;

  /**
   * Initializes the Markdown renderer and its plugins.
   */
  constructor() {
    this.md = createMarkdownRenderer();
    this.readyPromise = this.loadPlugins();
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
    this.marp = await loadMarkdownPlugins(this.md);
  }

  /**
   * Computes the visual difference between two Markdown strings.
   * @param oldMarkdown - The original Markdown content.
   * @param newMarkdown - The modified Markdown content.
   * @param imageResolver - An optional function to resolve relative image paths.
   * @returns An object containing the HTML representation of the differences and Marp CSS if applicable.
   */
  public computeDiff(
    oldMarkdown: string,
    newMarkdown: string,
    imageResolver?: (src: string) => string,
    oldImageResolver?: (src: string) => string,
    options: { tokenizeListContainers?: boolean } = {},
  ): { html: string; marpCss?: string; marpJs?: string; hasDiff: boolean } {
    const oldMatter = matter(oldMarkdown);
    const newMatter = matter(newMarkdown);

    const isMarp = !!(oldMatter.data.marp || newMatter.data.marp);

    // 1. Render Body Diff
    const envOld = {
      imageResolver: oldImageResolver ?? imageResolver,
      docId: "old",
    };
    let marpCss: string | undefined;
    let marpJs: string | undefined;

    let bodyDiffHtml: string;
    const envNew = { imageResolver, docId: "new" };

    if (isMarp && this.marp) {
      const { html: oHtml, css: cssOld } = this.marp.render(
        oldMarkdown,
        envOld,
      );
      const { cleaned: cleanedOld, scripts: scriptsOld } = cleanMarpHtml(oHtml);

      const { html: nHtml, css: cssNew } = this.marp.render(
        newMarkdown,
        envNew,
      );
      const { cleaned: cleanedNew, scripts: scriptsNew } = cleanMarpHtml(nHtml);

      // Resolve URLs in CSS
      const resolvedCssOld = resolveCssUrls(
        cssOld,
        oldImageResolver ?? imageResolver,
      );
      const resolvedCssNew = resolveCssUrls(cssNew, imageResolver);

      // Scope CSS to respective panes to allow different themes without conflict
      const resOld = scopeMarpCss(resolvedCssOld, "#left-pane .marpit");
      const resNew = scopeMarpCss(resolvedCssNew, "#right-pane .marpit");

      marpCss = [
        ...new Set([...resOld.charsets, ...resNew.charsets]),
        ...new Set([...resOld.imports, ...resNew.imports]),
        resOld.scoped,
        resNew.scoped,
      ].join("\n");

      marpJs = [...new Set([...scriptsOld, ...scriptsNew])].join("\n");

      // @ts-ignore
      const execute =
        htmldiff.execute || (htmldiff as any).default?.execute || htmldiff;

      // Tokenize and Diff Marp Slides
      const oldSlides = splitMarpSlides(cleanedOld);
      const newSlides = splitMarpSlides(cleanedNew);

      // LCS Alignment for slides to handle insertions/deletions robustly
      const matches = lcsAlignment(oldSlides, newSlides, (a, b) => {
        // Heuristic: match by header if present
        const getHeader = (s: string) => {
          const m = s.match(/<(h[1-3])\b[^>]*>([\s\S]*?)<\/\1>/i);
          if (!m) {
            return null;
          }
          // Strip data-line and id attributes as they might shift or be unique
          return m[0].replace(/\s(data-line(?:-end)?|id)="[^"]*"/g, "");
        };
        const hA = getHeader(a);
        const hB = getHeader(b);
        if (hA && hB) {
          // Exact match
          if (hA === hB) {
            return true;
          }

          // Fuzzy match: compare stripped text content
          const textA = hA.replace(/<[^>]*>/g, "").trim();
          const textB = hB.replace(/<[^>]*>/g, "").trim();

          if (textA.length >= 5 && textB.length >= 5) {
            // Match if one contains the other or they share a 10-char prefix
            if (
              textA.includes(textB) ||
              textB.includes(textA) ||
              textA.substring(0, 10) === textB.substring(0, 10)
            ) {
              return true;
            }
          }
        }
        // Fallback: match by identical content (excluding section attributes)
        const stripAttrs = (s: string) =>
          s.replace(/^<section\b[^>]*>/i, "<section>").trim();
        return stripAttrs(a) === stripAttrs(b);
      });

      let diffSlides = "";
      let lastOld = 0;
      let lastNew = 0;

      for (const match of matches) {
        // 1. Handle deleted slides
        for (let i = lastOld; i < match.oldIdx; i++) {
          diffSlides += `<del class="diffdel diff-block marp-slide-wrapper">${oldSlides[i]}</del>`;
        }

        // 2. Handle inserted slides
        for (let j = lastNew; j < match.newIdx; j++) {
          diffSlides += `<ins class="diffins diff-block marp-slide-wrapper">${newSlides[j]}</ins>`;
        }

        // 3. Diff the matched slides
        const oSlide = oldSlides[match.oldIdx];
        const nSlide = newSlides[match.newIdx];

        if (oSlide === nSlide) {
          diffSlides += `<div class="marp-slide-wrapper">${oSlide}</div>`;
        } else {
          // Extract content and attributes
          const sectionMatchRegex =
            /^<section\b([^>]*)>([\s\S]*?)<\/section>$/i;
          const oMatch = oSlide.match(sectionMatchRegex);
          const nMatch = nSlide.match(sectionMatchRegex);

          if (oMatch && nMatch) {
            const oInner = oMatch[2];
            const nAttrs = nMatch[1];
            const nInner = nMatch[2];

            // Diff the inner content
            const { diff: diffInner } = executeWithFullPipeline(
              oInner,
              nInner,
              execute,
              {},
            );

            // Re-wrap in section using NEW attributes, and add a wrapper for diff markers
            diffSlides += `<div class="marp-slide-wrapper"><section${nAttrs}>${diffInner}</section></div>`;
          } else {
            // Fallback if regex fails
            const { diff } = executeWithFullPipeline(
              oSlide,
              nSlide,
              execute,
              {},
            );
            diffSlides += `<div class="marp-slide-wrapper">${diff}</div>`;
          }
        }

        lastOld = match.oldIdx + 1;
        lastNew = match.newIdx + 1;
      }

      // Handle remaining slides
      for (let i = lastOld; i < oldSlides.length; i++) {
        diffSlides += `<del class="diffdel diff-block marp-slide-wrapper">${oldSlides[i]}</del>`;
      }
      for (let j = lastNew; j < newSlides.length; j++) {
        diffSlides += `<ins class="diffins diff-block marp-slide-wrapper">${newSlides[j]}</ins>`;
      }

      bodyDiffHtml = wrapMarpContainer(diffSlides);
    } else {
      // @ts-ignore
      const execute =
        htmldiff.execute || (htmldiff as any).default?.execute || htmldiff;
        
      const renderedOld = sanitizeHtml(this.md.render(oldMatter.content, envOld));
      const renderedNew = sanitizeHtml(this.md.render(newMatter.content, envNew));
      const { diff: diffHtml } = executeWithFullPipeline(
        renderedOld,
        renderedNew,
        execute,
        {},
        {
          tokenizeListContainers: options.tokenizeListContainers,
        },
      );
      bodyDiffHtml = diffHtml;
    }

    // 2. Render Frontmatter Diff
    const oldKeys = Object.keys(oldMatter.data);
    const newKeys = Object.keys(newMatter.data);
    const allKeys = [...new Set([...oldKeys, ...newKeys])];

    let fmDiffRows = "";
    let hasFmChanges = false;

    allKeys.forEach((key) => {
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
                <td>${escapeHtml(key)}</td>
                <td class="fm-old fm-changed">${safeOldKey}</td>
                <td class="fm-new fm-changed">${safeNewKey}</td>
            </tr>`;
      } else {
        fmDiffRows += `<tr>
                <td>${escapeHtml(key)}</td>
                <td class="fm-old">${safeOldKey}</td>
                <td class="fm-new">${safeNewKey}</td>
            </tr>`;
      }
    });

    let fmHtml = "";
    if (hasFmChanges) {
      fmHtml = `<div class="frontmatter-diff">
            <h3>Frontmatter Changes</h3>
            <table>
                <tbody>
                    ${fmDiffRows}
                </tbody>
            </table>
        </div>`;
    }

    const hasBodyChanges = bodyDiffHtml.includes("<ins") || bodyDiffHtml.includes("<del");
    const hasDiff = hasFmChanges || hasBodyChanges;

    return { html: fmHtml + bodyDiffHtml, marpCss, marpJs, hasDiff };
  }

  /**
   * Generates the full HTML content for the webview.
   *
   * @param diffHtml - The computed HTML difference.
   * @param katexCssInline - The URI for KaTeX CSS.
   * @param mermaidJsUri - The URI for Mermaid JS.
   * @param hljsLightCssUri - The URI for Highlight.js light theme CSS.
   * @param hljsDarkCssUri - The URI for Highlight.js dark theme CSS.
   * @param leftLabel - Label for the original version (default: "Original").
   * @param rightLabel - Label for the modified version (default: "Modified").
   * @param cspSource - The CSP source for the webview.
   * @param translations - Translation map.
   * @param marpCss - Optional Marp-specific CSS to inject.
   * @param marpJs - Optional Marp-specific JavaScript to inject.
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
    marpCss?: string,
    marpJs?: string,
    blameInfo?: {
      original?: any;
      modified?: any;
    },
    showGutterMarkers: boolean = true,
    showGitBlame: boolean = true,
    lineHoverDelay: number = 500,
  ): string {
    return getWebviewContent(
      diffHtml,
      katexCssInline,
      mermaidJsUri,
      hljsLightCssUri,
      hljsDarkCssUri,
      leftLabel,
      rightLabel,
      cspSource,
      translations,
      marpCss,
      marpJs,
      blameInfo,
      showGutterMarkers,
      showGitBlame,
      lineHoverDelay,
    );
  }
}
