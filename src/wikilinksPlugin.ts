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

interface WikilinkOptions {
  uriSuffix?: string;
}

function createHref(pageName: string, uriSuffix: string): string {
  return `${encodeURI(pageName)}${uriSuffix}`;
}

function wikilinksPlugin(md: MarkdownIt, options: WikilinkOptions = {}) {
  const uriSuffix = options.uriSuffix ?? "";

  md.inline.ruler.before("link", "wikilink", (state, silent) => {
    const start = state.pos;
    const src = state.src;

    if (src.charCodeAt(start) !== 0x5b || src.charCodeAt(start + 1) !== 0x5b) {
      return false;
    }

    const closeIndex = src.indexOf("]]", start + 2);
    if (closeIndex === -1) {
      return false;
    }

    const rawContent = src.slice(start + 2, closeIndex).trim();
    if (!rawContent || rawContent.includes("\n")) {
      return false;
    }

    const [pagePart, labelPart] = rawContent.split("|", 2);
    const pageName = pagePart.trim();
    const label = (labelPart ?? pagePart).trim();

    if (!pageName || !label) {
      return false;
    }

    if (!silent) {
      const linkOpen = state.push("link_open", "a", 1);
      linkOpen.attrSet("href", createHref(pageName, uriSuffix));

      const text = state.push("text", "", 0);
      text.content = label;

      state.push("link_close", "a", -1);
    }

    state.pos = closeIndex + 2;
    return true;
  });
}

export = wikilinksPlugin;
