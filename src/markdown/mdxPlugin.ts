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

/**
 * Parses XML/JSX tag attributes, supporting string values, single/double quotes, 
 * and React curly braces e.g. prop={value} or prop="value".
 */
function parseAttributes(attrsText: string): [string, string][] {
  const attrs: [string, string][] = [];
  const attrRegex = /([a-zA-Z0-9-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|{([^}]*)}))?/g;
  let match;
  while ((match = attrRegex.exec(attrsText)) !== null) {
    const name = match[1];
    const val = match[2] || match[3] || match[4] || "";
    attrs.push([name, val]);
  }
  return attrs;
}

/**
 * Custom Markdown-It plugin that adds support for MDX elements (like Tabs, Badges, Cards, Steps)
 * and Docusaurus Admonitions (:::note etc.).
 */
export default function mdxPlugin(md: MarkdownIt) {
  
  // 1. Block Tag Parser (<Tabs>, <Card>, <Steps>, etc.)
  md.block.ruler.before("html_block", "mdx_block", (state, startLine, endLine, silent) => {
    const pos = state.bMarks[startLine] + state.tShift[startLine];
    const max = state.eMarks[startLine];
    const lineText = state.src.slice(pos, max).trim();

    // Match tags starting with < followed by an uppercase letter or specific common documentation components
    const match = lineText.match(/^<([A-Z][a-zA-Z0-9]*|Tabs|TabItem|Steps|Card|Badge)\b([^>]*?)(\/?)>/);
    if (!match) {
      return false;
    }

    if (silent) {
      return true;
    }

    const tagName = match[1];
    const attrsText = match[2];
    const isSelfClosing = !!match[3] || lineText.endsWith("/>");
    const attrs = parseAttributes(attrsText);

    if (isSelfClosing) {
      const token = state.push("mdx_self_closing", "div", 0);
      token.markup = lineText;
      token.map = [startLine, startLine + 1];
      token.meta = { tagName, attrs };
      state.line = startLine + 1;
      return true;
    }

    // Parse block tags containing nested content (requires searching for matching closing tag </Tag>)
    const tokenOpen = state.push("mdx_open", "div", 1);
    tokenOpen.markup = lineText;
    tokenOpen.map = [startLine, startLine + 1];
    tokenOpen.meta = { tagName, attrs };

    let nextLine = startLine + 1;
    let depth = 1;
    const closeTag = `</${tagName}>`;
    const escapedTagName = tagName.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&");
    const openTagRegex = new RegExp(`^<${escapedTagName}(?:[\\s/>]|$)`, "i");
    const closeTagRegex = new RegExp(`^</${escapedTagName}(?:[\\s>]|$)`, "i");

    while (nextLine < endLine) {
      const nextPos = state.bMarks[nextLine] + state.tShift[nextLine];
      const nextMax = state.eMarks[nextLine];
      const nextLineText = state.src.slice(nextPos, nextMax).trim();

      if (closeTagRegex.test(nextLineText)) {
        depth--;
        if (depth === 0) {
          break;
        }
      } else if (openTagRegex.test(nextLineText)) {
        depth++;
      }
      nextLine++;
    }

    // Recursively parse inner lines as Markdown block tokens
    const oldParentType = state.parentType;
    state.parentType = "block" as any;
    state.md.block.tokenize(state, startLine + 1, nextLine);
    state.parentType = oldParentType;

    const tokenClose = state.push("mdx_close", "div", -1);
    tokenClose.markup = closeTag;
    tokenClose.map = [nextLine, nextLine + 1];
    tokenClose.meta = { tagName };

    state.line = nextLine + 1;
    return true;
  });

  // 2. Docusaurus Admonition Parser (:::note, :::danger, etc.)
  md.block.ruler.before("html_block", "mdx_admonition", (state, startLine, endLine, silent) => {
    const pos = state.bMarks[startLine] + state.tShift[startLine];
    const max = state.eMarks[startLine];
    const lineText = state.src.slice(pos, max).trim();

    // Match admonition open trigger: starts with exactly 3 colons :::
    const match = lineText.match(/^:::\s*([a-zA-Z0-9-]+)(?:\s+(.*))?$/);
    if (!match) {
      return false;
    }

    if (silent) {
      return true;
    }

    const type = match[1].toLowerCase();
    const title = match[2] ? match[2].trim() : "";

    let nextLine = startLine + 1;
    while (nextLine < endLine) {
      const nextPos = state.bMarks[nextLine] + state.tShift[nextLine];
      const nextMax = state.eMarks[nextLine];
      const nextLineText = state.src.slice(nextPos, nextMax).trim();

      if (nextLineText === ":::") {
        break;
      }
      nextLine++;
    }

    const tokenOpen = state.push("admonition_open", "div", 1);
    tokenOpen.markup = lineText;
    tokenOpen.map = [startLine, startLine + 1];
    tokenOpen.meta = { type, title };

    // Recursively parse inner content as standard Markdown
    const oldParentType = state.parentType;
    state.parentType = "block" as any;
    state.md.block.tokenize(state, startLine + 1, nextLine);
    state.parentType = oldParentType;

    const tokenClose = state.push("admonition_close", "div", -1);
    tokenClose.markup = ":::";
    tokenClose.map = [nextLine, nextLine + 1];

    state.line = nextLine + 1;
    return true;
  });

  // 3. Inline Tag Parser (<Badge />, <Card /> inside paragraphs)
  md.inline.ruler.before("html_inline", "mdx_inline", (state, silent) => {
    const max = state.posMax;
    const src = state.src;
    if (src.charCodeAt(state.pos) !== 0x3C /* < */) {
      return false;
    }

    const tail = src.slice(state.pos, max);
    // Inline elements are typically self-closing Badge, Card tags, or simple XML wrappers
    const match = tail.match(/^<([A-Z][a-zA-Z0-9]*|Badge|Card)\b([^>]*?)(\/?)>/);
    if (!match) {
      return false;
    }

    if (!silent) {
      const tagName = match[1];
      const attrsText = match[2];
      const isSelfClosing = !!match[3] || tail.startsWith("/>", match[0].length - 2);
      const attrs = parseAttributes(attrsText);

      const token = state.push("mdx_inline", "span", 0);
      token.markup = match[0];
      token.meta = { tagName, attrs, isSelfClosing };
    }

    state.pos += match[0].length;
    return true;
  });

  // 4. Token Renderers (HTML Generator)
  
  // Helper to extract a property value from a key-value attribute array
  const getAttr = (attrs: [string, string][], key: string): string => {
    const pair = attrs.find(([k]) => k.toLowerCase() === key.toLowerCase());
    return pair ? pair[1] : "";
  };

  md.renderer.rules.mdx_open = (tokens, idx) => {
    const token = tokens[idx];
    const { tagName, attrs }: { tagName: string; attrs: [string, string][] } = token.meta;
    const lowerTag = tagName.toLowerCase();

    if (lowerTag === "tabs") {
      return `<div class="mdx-tabs-container">`;
    }

    if (lowerTag === "tabitem") {
      const value = getAttr(attrs, "value");
      const label = getAttr(attrs, "label") || value;
      const isDefault = attrs.some(([k]) => k.toLowerCase() === "default");
      return `<div class="mdx-tab-content" data-value="${escapeHtml(value)}" data-label="${escapeHtml(label)}"${isDefault ? ' data-default="true"' : ""}>`;
    }

    if (lowerTag === "steps") {
      return `<div class="mdx-steps">`;
    }

    if (lowerTag === "card") {
      const title = getAttr(attrs, "title");
      const icon = getAttr(attrs, "icon");
      return `<div class="mdx-card">
        <div class="mdx-card-header">
          ${icon ? `<span class="mdx-card-icon mdx-codicon mdx-icon-${escapeHtml(icon)}"></span>` : ""}
          <span class="mdx-card-title">${escapeHtml(title)}</span>
        </div>
        <div class="mdx-card-body">`;
    }

    // Generic Custom Component Placeholder (Fallback)
    const attrList = attrs.map(([k, v]) => `<li><code>${escapeHtml(k)}</code>: <code>${escapeHtml(v)}</code></li>`).join("");
    return `<div class="mdx-fallback-card">
      <div class="mdx-fallback-header">
        <span class="mdx-fallback-badge">Custom Component: &lt;${escapeHtml(tagName)}&gt;</span>
      </div>
      <div class="mdx-fallback-body">
        ${attrs.length > 0 ? `<ul class="mdx-fallback-props">${attrList}</ul>` : ""}
        <div class="mdx-fallback-content">`;
  };

  md.renderer.rules.mdx_close = (tokens, idx) => {
    const token = tokens[idx];
    const { tagName }: { tagName: string } = token.meta;
    const lowerTag = tagName.toLowerCase();

    if (lowerTag === "tabs" || lowerTag === "tabitem" || lowerTag === "steps") {
      return `</div>`;
    }

    if (lowerTag === "card") {
      return `</div></div>`; // Close mdx-card-body and mdx-card
    }

    return `</div></div></div>`; // Close mdx-fallback-content, mdx-fallback-body, and mdx-fallback-card
  };

  md.renderer.rules.mdx_self_closing = (tokens, idx) => {
    const token = tokens[idx];
    const { tagName, attrs }: { tagName: string; attrs: [string, string][] } = token.meta;
    const lowerTag = tagName.toLowerCase();

    if (lowerTag === "badge") {
      const text = getAttr(attrs, "text");
      const variant = getAttr(attrs, "variant") || "default";
      return `<span class="mdx-badge mdx-badge-${escapeHtml(variant)}">${escapeHtml(text)}</span>`;
    }

    // Generic fallback for self-closing components
    const attrList = attrs.map(([k, v]) => `<li><code>${escapeHtml(k)}</code>: <code>${escapeHtml(v)}</code></li>`).join("");
    return `<div class="mdx-fallback-card mdx-self-closing">
      <div class="mdx-fallback-header">
        <span class="mdx-fallback-badge">Custom Component: &lt;${escapeHtml(tagName)} /&gt;</span>
      </div>
      <div class="mdx-fallback-body">
        ${attrs.length > 0 ? `<ul class="mdx-fallback-props">${attrList}</ul>` : `<p class="mdx-fallback-no-props">No properties specified</p>`}
      </div>
    </div>`;
  };

  md.renderer.rules.mdx_inline = (tokens, idx) => {
    const token = tokens[idx];
    const { tagName, attrs }: { tagName: string; attrs: [string, string][] } = token.meta;
    const lowerTag = tagName.toLowerCase();

    if (lowerTag === "badge") {
      const text = getAttr(attrs, "text");
      const variant = getAttr(attrs, "variant") || "default";
      return `<span class="mdx-badge mdx-badge-${escapeHtml(variant)}">${escapeHtml(text)}</span>`;
    }

    // Generic inline placeholder
    const attrSnippet = attrs.map(([k, v]) => `${escapeHtml(k)}="${escapeHtml(v)}"`).join(" ");
    return `<span class="mdx-inline-fallback">&lt;${escapeHtml(tagName)}${attrSnippet ? " " + attrSnippet : ""} /&gt;</span>`;
  };

  // 5. Admonition Token Renderers
  md.renderer.rules.admonition_open = (tokens, idx) => {
    const token = tokens[idx];
    const { type, title }: { type: string; title: string } = token.meta;
    const displayTitle = title || type.charAt(0).toUpperCase() + type.slice(1);
    
    // Choose appropriate icon representation
    let iconClass = "mdx-icon-info";
    if (type === "warning" || type === "caution") {
      iconClass = "mdx-icon-warning";
    } else if (type === "danger") {
      iconClass = "mdx-icon-danger";
    } else if (type === "tip") {
      iconClass = "mdx-icon-tip";
    }

    return `<div class="mdx-admonition mdx-admonition-${escapeHtml(type)}">
      <div class="mdx-admonition-header">
        <span class="mdx-admonition-icon mdx-codicon ${iconClass}"></span>
        <span class="mdx-admonition-title">${escapeHtml(displayTitle)}</span>
      </div>
      <div class="mdx-admonition-body">`;
  };

  md.renderer.rules.admonition_close = () => {
    return `</div></div>`;
  };
}

/**
 * Escapes special HTML characters to prevent visual markup injections.
 */
function escapeHtml(str: string): string {
  if (!str) {
    return "";
  }
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
