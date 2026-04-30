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
import hljs from "highlight.js";
import { escapeHtml } from "./sanitizer";
import { loadMarp } from "./marpRenderer";

const wikilinks = require("../wikilinksPlugin");
const obsidian = require("./obsidianPlugin");
// @ts-ignore
const katex = require("@iktakahiro/markdown-it-katex");
// @ts-ignore
const taskLists = require("markdown-it-task-lists");

/**
 * Creates and configures a new MarkdownIt instance with all required plugins and rules.
 */
export function createMarkdownRenderer(): MarkdownIt {
  const md = new MarkdownIt({
    html: true,
    linkify: true,
    typographer: true,
    highlight: function (str, lang) {
      if (lang && hljs.getLanguage(lang)) {
        try {
          return hljs.highlight(str, { language: lang, ignoreIllegals: true })
            .value;
        } catch {
          /* ignore highlight errors and fallback */
        }
      }
      return "";
    },
  });

  // Math: KaTeX
  md.use(katex);

  // Wikilinks/Obsidian: default options
  md.use(wikilinks, { uriSuffix: "" });
  md.use(obsidian);

  // Task Lists: Checkboxes
  md.use(taskLists, { enabled: false });

  // Custom Rules
  configureRules(md);

  // Line Numbers
  injectLineNumbers(md);

  return md;
}

/**
 * Configure custom rendering rules for Mermaid diagrams and Image resolution.
 */
function configureRules(md: MarkdownIt) {
  // Mermaid Support: Custom fence renderer
  const defaultFence =
    md.renderer.rules.fence ||
    function (tokens, idx, options, env, self) {
      return self.renderToken(tokens, idx, options);
    };

  md.renderer.rules.fence = (tokens, idx, options, env, self) => {
    const token = tokens[idx];
    const info = token.info ? md.utils.unescapeAll(token.info).trim() : "";

    if (info === "mermaid") {
      const escapedContent = escapeHtml(token.content);
      const attrs = self.renderAttrs(token);
      return `<div class="mermaid"${attrs} data-original-content="${escapedContent}">\n${escapedContent}\n</div>`;
    }

    return defaultFence(tokens, idx, options, env, self);
  };

  // Image Resolver Support
  const defaultImage =
    md.renderer.rules.image ||
    function (tokens, idx, options, env, self) {
      return self.renderToken(tokens, idx, options);
    };

  md.renderer.rules.image = (tokens, idx, options, env, self) => {
    const token = tokens[idx];
    const src = token.attrGet("src");
    if (src && env && typeof env.imageResolver === "function") {
      const resolved = env.imageResolver(src);
      token.attrSet("src", resolved);
    }
    return defaultImage(tokens, idx, options, env, self);
  };
}

/**
 * Injects data-line attributes into major block elements for scroll syncing.
 * Safe to call multiple times; it will not double-wrap existing rules.
 */
export function injectLineNumbers(md: MarkdownIt) {
  const rules = [
    "paragraph_open",
    "heading_open",
    "list_item_open",
    "blockquote_open",
    "tr_open",
    "td_open",
    "th_open",
    "code_block",
    "fence",
    "table_open",
    "math_block",
    "dt_open",
    "dd_open",
    "alert_open",
    "github_alert_open",
  ];

  rules.forEach((rule) => {
    const original =
      md.renderer.rules[rule] || md.renderer.renderToken.bind(md.renderer);

    if ((original as any)._isMapped) {
      return;
    }

    const wrapped = (tokens: any, idx: any, options: any, env: any, self: any) => {
      const token = tokens[idx];
      let startLine = token.map ? token.map[0] : undefined;
      let endLine = token.map ? token.map[1] : undefined;

      // Propagate line numbers from tr to td/th (markdown-it doesn't map cells)
      if ((token.type === "td_open" || token.type === "th_open") && startLine === undefined) {
        for (let i = idx - 1; i >= 0; i--) {
          if (tokens[i].type === "tr_open" && tokens[i].map) {
            startLine = tokens[i].map[0];
            endLine = tokens[i].map[1];
            break;
          }
        }
      }

      // Heuristics for Definition Lists (markdown-it-deflist has inaccurate maps)
      if (
        token.type === "dt_open" &&
        startLine !== undefined &&
        startLine === endLine
      ) {
        // dt often has [i, i] map, making it empty. Force it to be at least 1 line.
        endLine = startLine + 1;
      } else if (token.type === "dd_open" && startLine !== undefined) {
        // dd often starts at the same line as the preceding dt.
        // If it does, and it's followed by content on the same line (tight list)
        // or next lines, we should shift it to at least i + 1.
        for (let i = idx - 1; i >= 0; i--) {
          const prev = tokens[i];
          if (prev.type === "dl_open") {
            break;
          }
          if (prev.type === "dt_open" && prev.map) {
            if (prev.map[0] === startLine) {
              startLine++;
            }
            break;
          }
        }
      }

      const hasMap = startLine !== undefined && endLine !== undefined;

      if (hasMap) {
        token.attrSet("data-line", String(startLine));
        token.attrSet("data-line-end", String(endLine));
      }
      let html = original.call(self, tokens, idx, options, env, self);

      // If the original renderer didn't include the data attributes (common with plugins),
      // try to inject them into the first tag of the output.
      if (hasMap && html && !/data-line="/i.test(html)) {
        html = html.replace(
          /(\/?>)/,
          ` data-line="${startLine}" data-line-end="${endLine}"$1`,
        );
      }
      return html;
    };

    (wrapped as any)._isMapped = true;
    md.renderer.rules[rule] = wrapped;
  });
}

/**
 * Asynchronously loads heavy or ESM-only plugins and applies them to the renderer.
 */
export async function loadMarkdownPlugins(md: MarkdownIt): Promise<any> {
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
      md.use(footnote);
    }
    if (typeof mark === "function") {
      md.use(mark);
    }
    if (typeof sub === "function") {
      md.use(sub);
    }
    if (typeof sup === "function") {
      md.use(sup);
    }
    if (emoji && typeof emoji.full === "function") {
      md.use(emoji.full);
    } else if (typeof emoji === "function") {
      md.use(emoji);
    }
    if (typeof deflist === "function") {
      md.use(deflist);
    }
    if (typeof githubAlerts === "function") {
      md.use(githubAlerts);
    }

    // Capture line numbers for blocks added by plugins (like Alerts)
    injectLineNumbers(md);

    // Also load Marp
    const marp = await loadMarp();
    if (marp && marp.markdown) {
      injectLineNumbers(marp.markdown);
    }
    return marp;
  } catch (e) {
    console.error("Failed to load markdown plugins:", e);
    return null;
  }
}
