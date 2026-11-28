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

import { findClosing } from "./domUtils";

/**
 * Handles Marp-specific rendering, HTML cleaning, and CSS scoping.
 */

/**
 * Exact set of trusted internal scripts emitted by `@marp-team/marp-core`
 * (captured from rendering an empty document with zero user input).
 * Prevents user-supplied `<script>` tags from spoofing Marp internal scripts.
 */
const trustedMarpScripts = new Set<string>();

/**
 * Neutralizes any `</style` sequence inside CSS so it cannot break out of a
 * `<style>` element in either the VS Code Webview or standalone exported HTML.
 */
export function sanitizeCssForStyleTag(css: string): string {
  return css.replace(/<\s*\/\s*style/gi, "\\3c /style");
}

/**
 * Dynamically loads the Marp Core library and initializes an instance.
 */
export async function loadMarp() {
  const marpMod = await import("@marp-team/marp-core");
  const MarpClass = (marpMod as any).Marp || marpMod;
  const instance = new MarpClass({
    container: false,
    html: MarpClass.html || true,
    inlineSVG: false,
    math: "katex",
  });

  // Capture the exact internal browser script(s) emitted by Marp Core on empty input
  try {
    const baseline = instance.render("");
    const baselineHtml = typeof baseline?.html === "string" ? baseline.html : "";
    const scriptRegex = /<\s*script\b(?:[^>"']|"[^"]*"|'[^']*')*>([\s\S]*?)<\/\s*script\b[^>]*>/gi;
    let m: RegExpExecArray | null;
    while ((m = scriptRegex.exec(baselineHtml)) !== null) {
      const content = m[1].trim();
      if (content) {
        trustedMarpScripts.add(content);
      }
    }
  } catch {
    // Ignore baseline capture errors; no scripts will be trusted if capture fails
  }

  return instance;
}

/**
 * Cleans Marp-rendered HTML by removing noisy elements and extracting scripts.
 */
export function cleanMarpHtml(html: string): { cleaned: string; scripts: string[] } {
  const scripts: string[] = [];
  const scriptRegex = /<\s*script\b(?:[^>"']|"[^"]*"|'[^']*')*>([\s\S]*?)<\/\s*script\b[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = scriptRegex.exec(html)) !== null) {
    const content = m[1].trim();
    // Only allow scripts that exactly match Marp Core's baseline internal script(s).
    // Substring checks are bypassable by user-supplied <script> tags containing comments.
    if (content && trustedMarpScripts.has(content)) {
      scripts.push(content);
    }
  }

  let fullyCleaned = html;
  let prevCleaned: string;
  const tagRemoveRegex =
    /<\s*(script|style)\b(?:[^>"']|"[^"]*"|'[^']*')*>[\s\S]*?<\/\s*\1\b[^>]*>/gi;
  do {
    prevCleaned = fullyCleaned;
    fullyCleaned = fullyCleaned.replace(tagRemoveRegex, "");
  } while (fullyCleaned !== prevCleaned);

  // Strip data-line from SVGs and Sections to fix Marp slide offsets and Quick Edit targeting
  // Uses a quote-aware pattern (?:[^>"']|"[^"]*"|'[^']*')* to safely skip over
  // attribute values that contain '>' characters (e.g. data-foo=">").
  fullyCleaned = fullyCleaned.replace(/<(svg|section)\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi, (match) => {
    return match.replace(/\sdata-line(?:-end)?=(?:"[^"]*"|'[^']*')/gi, "");
  });

  return { cleaned: fullyCleaned, scripts };
}

/**
 * Splits a Marp HTML string into individual slide strings (each containing the <section> tag).
 * Uses depth-tracking `findClosing` so nested `<section>` elements inside slides are not truncated.
 */
export function splitMarpSlides(html: string): string[] {
  const slides: string[] = [];
  const openRegex = /<section\b/gi;
  let m: RegExpExecArray | null;
  while ((m = openRegex.exec(html)) !== null) {
    const start = m.index;
    const end = findClosing(html, start, "section");
    if (end === -1) {
      break;
    }
    slides.push(html.slice(start, end));
    openRegex.lastIndex = end;
  }
  return slides;
}

/**
 * Wraps slide contents in the required Marp container structure.
 */
export function wrapMarpContainer(content: string): string {
  return `<div class="marp"><div class="marpit">${content}</div></div>`;
}


/**
 * Resolves relative URLs in CSS using the provided imageResolver.
 */
export function resolveCssUrls(
  css: string,
  imageResolver?: (src: string) => string,
): string {
  if (!imageResolver) {
    return css;
  }

  return css.replace(/url\(['"]?(.*?)['"]?\)/gi, (match, src) => {
    const trimmed = typeof src === "string" ? src.trim() : "";
    if (trimmed && !/^(?:data:|https?:|\/\/|#)/i.test(trimmed)) {
      const resolved = imageResolver(trimmed);
      return `url('${resolved}')`;
    }
    return match;
  });
}

function scanQuotedCssString(css: string, start: number): number {
  const quote = css[start];
  let i = start + 1;
  while (i < css.length) {
    if (css[i] === "\\") {
      i += 2;
      continue;
    }
    if (css[i] === quote) {
      return i + 1;
    }
    i++;
  }
  return css.length;
}

function scanCssComment(css: string, start: number): number {
  const end = css.indexOf("*/", start + 2);
  return end === -1 ? css.length : end + 2;
}

function extractCssAtRules(css: string): {
  charsets: string[];
  imports: string[];
  cleanedCss: string;
} {
  const charsets: string[] = [];
  const imports: string[] = [];
  let cleanedCss = "";
  let i = 0;

  while (i < css.length) {
    if (css[i] === "/" && css[i + 1] === "*") {
      const end = scanCssComment(css, i);
      cleanedCss += css.slice(i, end);
      i = end;
      continue;
    }
    if (css[i] === '"' || css[i] === "'") {
      const end = scanQuotedCssString(css, i);
      cleanedCss += css.slice(i, end);
      i = end;
      continue;
    }
    if (css[i] === "@") {
      const rest = css.slice(i);
      const match = rest.match(/^@(charset|import)(?=\s|["'])/i);
      if (match) {
        const keyword = match[1].toLowerCase();
        let j = i + match[0].length;
        while (j < css.length && css[j] !== ";") {
          if (css[j] === "/" && css[j + 1] === "*") {
            j = scanCssComment(css, j);
          } else if (css[j] === '"' || css[j] === "'") {
            j = scanQuotedCssString(css, j);
          } else if (css[j] === "{" || css[j] === "}") {
            break;
          } else {
            j++;
          }
        }
        if (j < css.length && css[j] === ";") {
          const rule = css.slice(i, j + 1);
          if (keyword === "charset") {
            charsets.push(rule);
          } else {
            imports.push(rule);
          }
          i = j + 1;
          continue;
        }
      }
    }
    cleanedCss += css[i];
    i++;
  }

  return { charsets, imports, cleanedCss };
}

/**
 * Scopes Marp-generated CSS to a specific selector to prevent cross-pane conflicts.
 */
export function scopeMarpCss(
  css: string,
  scopeSelector: string,
): { charsets: string[]; imports: string[]; scoped: string } {
  const { charsets, imports, cleanedCss } = extractCssAtRules(css);

  // Scopes selectors robustly, skipping comments and quoted strings so '{'/'}' inside them
  // cannot corrupt brace depth or selector scoping.
  let scoped = "";
  let i = 0;
  const stack: string[] = [];
  let buffer = "";

  while (i < cleanedCss.length) {
    const char = cleanedCss[i];
    if (char === "/" && cleanedCss[i + 1] === "*") {
      const end = scanCssComment(cleanedCss, i);
      buffer += cleanedCss.slice(i, end);
      i = end;
      continue;
    }
    if (char === '"' || char === "'") {
      const end = scanQuotedCssString(cleanedCss, i);
      buffer += cleanedCss.slice(i, end);
      i = end;
      continue;
    }
    if (char === "{") {
      const leadingCommentsMatch = buffer.match(/^(?:\s|\/\*[\s\S]*?\*\/)*/);
      const leadingPrefix = leadingCommentsMatch ? leadingCommentsMatch[0] : "";
      const selector = buffer.slice(leadingPrefix.length).trim();
      let isKeyframes = false;
      let isOtherAtRule = false;

      if (selector.startsWith("@")) {
        isOtherAtRule = true;
        if (/@keyframes\b/i.test(selector) || /@-webkit-keyframes\b/i.test(selector)) {
          isKeyframes = true;
        }
      }

      const inKeyframes = stack.includes("keyframes");

      if (selector && !isOtherAtRule && !inKeyframes) {
        const scopedSelector = selector
          .split(",")
          .map((s: string) => {
            const trimmed = s.trim();
            if (trimmed.startsWith("div.marpit")) {
              return trimmed.replace(/^div\.marpit/, scopeSelector);
            }
            if (trimmed.startsWith(".marpit")) {
              return trimmed.replace(/^\.marpit/, scopeSelector);
            }
            return `${scopeSelector} ${trimmed}`;
          })
          .join(", ");
        scoped += leadingPrefix + scopedSelector + " {";
      } else {
        scoped += leadingPrefix + selector + " {";
      }

      if (isKeyframes) {
        stack.push("keyframes");
      } else if (isOtherAtRule) {
        stack.push("at-rule");
      } else {
        stack.push("normal");
      }
      buffer = "";
    } else if (char === "}") {
      scoped += buffer + "}";
      stack.pop();
      buffer = "";
    } else {
      buffer += char;
    }
    i++;
  }
  scoped += buffer;

  return {
    charsets: charsets.map(sanitizeCssForStyleTag),
    imports: imports.map(sanitizeCssForStyleTag),
    scoped: sanitizeCssForStyleTag(scoped),
  };
}
