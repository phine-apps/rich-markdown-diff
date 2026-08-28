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
  const scriptRegex = /<\s*script\b[^>]*>([\s\S]*?)<\/\s*script\s*>/gi;
  let m: RegExpExecArray | null;
  while ((m = scriptRegex.exec(html)) !== null) {
    const content = m[1].trim();
    if (content) {
      scripts.push(content);
    }
  }

  let fullyCleaned = html;
  let prevCleaned: string;
  const scriptRemoveRegex = /<\s*script\b[^>]*>[\s\S]*?<\/\s*script\s*>/gi;
  const styleRemoveRegex = /<\s*style\b[^>]*>[\s\S]*?<\/\s*style\s*>/gi;
  do {
    prevCleaned = fullyCleaned;
    fullyCleaned = fullyCleaned
      .replace(scriptRemoveRegex, "")
      .replace(styleRemoveRegex, "");
  } while (fullyCleaned !== prevCleaned);

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

  // Scopes selectors robustly, avoiding keyframes inner selectors
  let scoped = "";
  let i = 0;
  const stack: string[] = [];
  let buffer = "";

  while (i < cleanedCss.length) {
    const char = cleanedCss[i];
    if (char === "{") {
      const selector = buffer.trim();
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
        scoped += scopedSelector + " {";
      } else {
        scoped += selector + " {";
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
    charsets,
    imports,
    scoped,
  };
}
