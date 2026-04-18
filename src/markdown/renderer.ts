import MarkdownIt = require("markdown-it");
import hljs from "highlight.js";
import { escapeHtml } from "./sanitizer";
import { loadMarp } from "./marpRenderer";

const wikilinks = require("../wikilinksPlugin");
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

  // Wikilinks: default options
  md.use(wikilinks, { uriSuffix: "" });

  // Math: KaTeX
  md.use(katex);

  // Task Lists: Checkboxes
  md.use(taskLists, { enabled: true });

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
    const info = token.info
      ? md.utils.unescapeAll(token.info).trim()
      : "";

    if (info === "mermaid") {
      const escapedContent = escapeHtml(token.content);
      return `<div class="mermaid" data-original-content="${escapedContent}">\n${escapedContent}\n</div>`;
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
 */
function injectLineNumbers(md: MarkdownIt) {
  const rules = [
    "paragraph_open",
    "heading_open",
    "list_item_open",
    "blockquote_open",
    "tr_open",
    "code_block",
    "fence",
    "table_open",
  ];

  rules.forEach((rule) => {
    const original =
      md.renderer.rules[rule] || md.renderer.renderToken.bind(md.renderer);
    md.renderer.rules[rule] = (tokens, idx, options, env, self) => {
      const token = tokens[idx];
      if (token.map) {
        token.attrSet("data-line", String(token.map[0]));
      }
      return original.call(self, tokens, idx, options, env, self);
    };
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

    // Also load Marp
    return await loadMarp();
  } catch (e) {
    console.error("Failed to load markdown plugins:", e);
    return null;
  }
}
