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

/**
 * Handles Marp-specific rendering, HTML cleaning, and CSS scoping.
 */

/**
 * Dynamically loads the Marp Core library and initializes an instance.
 */
export async function loadMarp() {
  const marpMod = await import("@marp-team/marp-core");
  const MarpClass = (marpMod as any).Marp || marpMod;
  return new MarpClass({
    container: false,
    html: true,
    inlineSVG: false,
    math: "katex",
  });
}

/**
 * Cleans Marp-rendered HTML by removing noisy elements and extracting scripts.
 */
export function cleanMarpHtml(html: string): { cleaned: string; scripts: string[] } {
  const scripts: string[] = [];
  const cleaned = html.replace(
    /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
    (match) => {
      const content = match.replace(/^<script.*?>/i, "").replace(/<\/script>$/i, "");
      if (content.trim()) {
        scripts.push(content);
      }
      return "";
    },
  );

  let fullyCleaned = cleaned.replace(
    /<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi,
    "",
  );

  // Strip data-line from SVGs and Sections to fix Marp slide offsets and Quick Edit targeting
  fullyCleaned = fullyCleaned.replace(/<(svg|section)\b[^>]*\sdata-line="[^"]*"[^>]*>/gi, (match) => {
    return match.replace(/\sdata-line="[^"]*"/gi, "");
  });

  return { cleaned: fullyCleaned, scripts };
}

/**
 * Splits a Marp HTML string into individual slide strings (each containing the <section> tag).
 */
export function splitMarpSlides(html: string): string[] {
  const slides: string[] = [];
  const regex = /<section\b[^>]*>([\s\S]*?)<\/section>/gi;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(html)) !== null) {
    slides.push(m[0]);
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
    if (src && !src.startsWith("data:") && !src.startsWith("http")) {
      const resolved = imageResolver(src);
      return `url('${resolved}')`;
    }
    return match;
  });
}

/**
 * Scopes Marp-generated CSS to a specific selector to prevent cross-pane conflicts.
 */
export function scopeMarpCss(
  css: string,
  scopeSelector: string,
): { charsets: string[]; imports: string[]; scoped: string } {
  const charsets: string[] = [];
  const imports: string[] = [];

  let cleanedCss = css.replace(/@charset\s+[^;]+;/g, (m) => {
    charsets.push(m);
    return "";
  });

  cleanedCss = cleanedCss.replace(/@import\s+[^;]+;/gi, (m) => {
    imports.push(m);
    return "";
  });

  // Basic CSS scoping: prefix every selector with the scopeSelector.
  // This is more robust than nesting, especially for older browsers.
  const scoped = cleanedCss.replace(/([^\s{},][^{]*)\{/g, (match, selector) => {
    // Avoid prefixing @media, @keyframes, etc.
    if (selector.trim().startsWith("@")) {
      return match;
    }
    const scopedSelector = selector
      .split(",")
      .map((s: string) => `${scopeSelector} ${s.trim()}`)
      .join(", ");
    return `${scopedSelector} {`;
  });

  return {
    charsets,
    imports,
    scoped,
  };
}
