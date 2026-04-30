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

import sanitizeHtmlLib = require("sanitize-html");

/**
 * Sanitizes HTML to prevent XSS.
 * Allows specific tags and attributes required for Mermaid, KaTeX, and Checkboxes.
 */
export function sanitizeHtml(html: string): string {
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
      "mrow",
      "mspace",
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
        "data-line-end",
        "data-type",
        "data-tag",
        "data-original-content",
        // Marp attributes
        "data-marpit-pagination",
        "data-marpit-pagination-total",
        "data-theme",
        "data-page",
        // Internal diff masking/barriers
        "data-mask",
        "data-barrier",
        "data-image-diff",
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
        "background-image": [/.*/],
        background: [/.*/],
        // CSS Variables for Marp themes
        "--theme": [/.*/],
        "--color": [/.*/],
        "--background": [/.*/],
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
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
