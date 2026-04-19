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
import { sanitizeHtml } from "./markdown/sanitizer";
import { getWebviewContent } from "./markdown/webviewTemplate";
import { cleanMarpHtml, resolveCssUrls, scopeMarpCss } from "./markdown/marpRenderer";
import { createMarkdownRenderer, loadMarkdownPlugins } from "./markdown/renderer";
import {
  executeWithFullPipeline,
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
  ): { html: string; marpCss?: string; marpJs?: string } {
    const oldMatter = matter(oldMarkdown);
    const newMatter = matter(newMarkdown);

    const isMarp = !!(oldMatter.data.marp || newMatter.data.marp);

    // 1. Render Body Diff
    const envOld = { imageResolver };
    let oldHtml: string;
    let newHtml: string;
    let marpCss: string | undefined;
    let marpJs: string | undefined;

    if (isMarp && this.marp) {
      const { html: oHtml, css: cssOld } = this.marp.render(oldMarkdown, envOld);
      const { cleaned: cleanedOld, scripts: scriptsOld } = cleanMarpHtml(oHtml);
      oldHtml = cleanedOld;

      const envNew = { imageResolver };
      const { html: nHtml, css: cssNew } = this.marp.render(newMarkdown, envNew);
      const { cleaned: cleanedNew, scripts: scriptsNew } = cleanMarpHtml(nHtml);
      newHtml = cleanedNew;

      // Resolve URLs in CSS
      const resolvedCssOld = resolveCssUrls(cssOld, imageResolver);
      const resolvedCssNew = resolveCssUrls(cssNew, imageResolver);

      // Scope CSS to respective panes to allow different themes without conflict
      const resOld = scopeMarpCss(resolvedCssOld, "#left-pane.marpit");
      const resNew = scopeMarpCss(resolvedCssNew, "#right-pane.marpit");

      marpCss = [
        ...new Set([...resOld.charsets, ...resNew.charsets]),
        ...new Set([...resOld.imports, ...resNew.imports]),
        resOld.scoped,
        resNew.scoped,
      ].join("\n");

      marpJs = [...new Set([...scriptsOld, ...scriptsNew])].join("\n");
    } else {
      oldHtml = this.md.render(oldMatter.content, envOld);
      const envNew = { imageResolver };
      newHtml = this.md.render(newMatter.content, envNew);
    }

    // Sanitize Rendered Markdown
    oldHtml = sanitizeHtml(oldHtml);
    newHtml = sanitizeHtml(newHtml);

    // @ts-ignore
    const execute =
      htmldiff.execute || (htmldiff as any).default?.execute || htmldiff;
    
    let bodyDiffHtml = oldHtml;
    if (typeof execute === "function") {
      const { diff } = executeWithFullPipeline(oldHtml, newHtml, execute, {});
      bodyDiffHtml = diff;
    }

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

    return { html: fmHtml + bodyDiffHtml, marpCss, marpJs };
  }


  /**
   * Generates the full HTML content for the webview.
   *
   * @param diffHtml - The computed HTML difference.
   * @param katexCssUri - The URI for KaTeX CSS.
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
    );
  }
}
