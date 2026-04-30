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

interface ObsidianOptions {
  uriSuffix?: string;
}

function obsidianPlugin(md: MarkdownIt, _options: ObsidianOptions = {}) {
  
  // 1. Tags support: #tag
  md.inline.ruler.after("text", "obsidian_tag", (state, silent) => {
    const src = state.src;
    const start = state.pos;

    // Check if it starts with #
    if (src.charCodeAt(start) !== 0x23 /* # */) {
      return false;
    }

    // Must be at the start of a line or preceded by whitespace
    if (start > 0 && !/\s/.test(src[start - 1])) {
       return false;
    }

    // Regexp for tag: start with letter, then alphanumeric, slash, or hyphen
    // Simplified Obsidian-like tag regex
    const tagRegex = /^#([a-zA-Z\d][\w\-/]*)/;
    const match = src.slice(start).match(tagRegex);

    if (!match) {
      return false;
    }

    const tagContent = match[1];
    const fullTag = match[0];

    // Ensure it's not a hex color (optional check, but good for stability)
    if (/^[a-fA-F\d]{3,6}$/.test(tagContent) && (src[start + fullTag.length] === ' ' || !src[start + fullTag.length])) {
        // Might be a color, but in Obsidian anything like #abc is a tag unless formatted
        // We'll treat it as a tag for now.
    }

    if (!silent) {
      const token = state.push("obsidian_tag", "span", 0);
      token.attrs = [
          ["class", "obsidian-tag"],
          ["data-tag", tagContent]
      ];
      token.content = fullTag;
    }

    state.pos += fullTag.length;
    return true;
  });

  // 2. Transclusion support: ![[link]]
  md.inline.ruler.before("link", "obsidian_transclusion", (state, silent) => {
    const src = state.src;
    const start = state.pos;

    if (src.charCodeAt(start) !== 0x21 /* ! */ || 
        src.charCodeAt(start + 1) !== 0x5b /* [ */ || 
        src.charCodeAt(start + 2) !== 0x5b /* [ */) {
      return false;
    }

    const closeIndex = src.indexOf("]]", start + 3);
    if (closeIndex === -1) {
      return false;
    }

    const rawContent = src.slice(start + 3, closeIndex).trim();
    if (!rawContent || rawContent.includes("\n")) {
      return false;
    }

    const [pagePart] = rawContent.split("|", 2);
    const pageName = pagePart.trim();

    if (!pageName) {
      return false;
    }

    if (!silent) {
      // Check if it looks like an image
      const isImage = /\.(png|jpg|jpeg|gif|svg|webp)$/i.test(pageName);
      
      if (isImage) {
        const token = state.push("image", "img", 0);
        token.attrs = [
            ["src", pageName],
            ["alt", ""],
            ["class", "obsidian-embedded-image"]
        ];
        token.children = []; // Ensure children exists for image rendering
      } else {
        const token = state.push("obsidian_embed", "div", 0);
        token.attrs = [
            ["class", "obsidian-embed"],
            ["data-page", pageName]
        ];
        token.content = pageName;
      }
    }

    state.pos = closeIndex + 2;
    return true;
  });

  md.renderer.rules.obsidian_tag = (tokens, idx) => {
    const token = tokens[idx];
    const tagContent = token.attrGet("data-tag") || "";
    // We'll make it a clickable span
    return `<span class="obsidian-tag" data-tag="${tagContent}">${token.content}</span>`;
  };

  // Renderer for embed
  md.renderer.rules.obsidian_embed = (tokens, idx) => {
    const token = tokens[idx];
    const pageName = token.attrGet("data-page") || "";
    return `<div class="obsidian-embed" data-page="${pageName}">
        <span class="obsidian-embed-icon">📄</span>
        <span class="obsidian-embed-link">${pageName}</span>
    </div>`;
  };
}

export = obsidianPlugin;
