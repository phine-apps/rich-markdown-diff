/*
 * MIT License
 */

import MarkdownIt = require("markdown-it");
import hljs from "highlight.js";
const taskLists = require("markdown-it-task-lists");
const wikilinks = require("../wikilinksPlugin");

import { ImageResolver } from "./types";

/**
 * Handles Markdown and Marp rendering.
 */
export class MarkdownRenderer {
  private md: MarkdownIt;
  private marp: any;
  private readyPromise: Promise<void>;

  constructor() {
    this.md = new MarkdownIt({
      html: true, linkify: true, typographer: true,
      highlight: (s, l) => {
        if (l && hljs.getLanguage(l)) {
          try {
            return hljs.highlight(s, { language: l, ignoreIllegals: true }).value;
          } catch {
            /* ignore highlighting errors */
          }
        }
        return "";
      },
    });
    this.md.use(wikilinks, { uriSuffix: "" });
    this.md.use(taskLists, { enabled: true });
    this.readyPromise = this.loadPlugins();
  }

  public async waitForReady(): Promise<void> { return this.readyPromise; }

  private async loadPlugins(): Promise<void> {
    try {
      const getPlugin = (mod: any) => mod.default || mod;
      const [footnoteMod, katexMod, marpMod, githubAlertsMod, markMod, subMod, supMod, emojiMod, deflistMod] = await Promise.all([
        import("markdown-it-footnote"),
        // @ts-ignore
        import("@iktakahiro/markdown-it-katex"),
        // @ts-ignore
        import("@marp-team/marp-core").catch(() => null),
        import("markdown-it-github-alerts"), import("markdown-it-mark"), import("markdown-it-sub"), import("markdown-it-sup"),
        import("markdown-it-emoji"), import("markdown-it-deflist"),
      ]);

      this.md.use(getPlugin(footnoteMod));
      this.md.use(getPlugin(katexMod));
      const githubAlerts = getPlugin(githubAlertsMod);
      if (typeof githubAlerts === "function") {this.md.use(githubAlerts);}
      this.md.use(getPlugin(markMod));
      this.md.use(getPlugin(subMod));
      this.md.use(getPlugin(supMod));
      const emoji = getPlugin(emojiMod);
      if (emoji && emoji.full) {this.md.use(emoji.full);} else {this.md.use(emoji);}
      this.md.use(getPlugin(deflistMod));

      // Image Resolver (set after all plugins to avoid overwrites)
      const defaultImage = this.md.renderer.rules.image || ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));
      this.md.renderer.rules.image = (tokens, idx, options, env, self) => {
        const token = tokens[idx], src = token.attrGet("src");
        if (src && env && typeof env.imageResolver === "function") {token.attrSet("src", env.imageResolver(src));}
        return defaultImage(tokens, idx, options, env, self);
      };

      const rules = ["paragraph_open", "heading_open", "list_item_open", "blockquote_open", "tr_open", "code_block", "fence", "table_open"];
      rules.forEach((rule) => {
        const original = this.md.renderer.rules[rule] || this.md.renderer.renderToken.bind(this.md.renderer);
        this.md.renderer.rules[rule] = (tokens, idx, options, env, self) => {
          const token = tokens[idx]; if (token.map) {token.attrSet("data-line", String(token.map[0]));}
          return original.call(self, tokens, idx, options, env, self);
        };
      });

      const defaultFence = this.md.renderer.rules.fence || ((tokens: any[], idx: number, options: any, env: any, self: any) => self.renderToken(tokens, idx, options));
      this.md.renderer.rules.fence = (tokens, idx, options, env, self) => {
        const t = tokens[idx], i = t.info ? this.md.utils.unescapeAll(t.info).trim() : "";
        if (i === "mermaid") { const c = this.md.utils.escapeHtml(t.content); return `<div class="mermaid" data-original-content="${c}">\n${c}\n</div>`; }
        return defaultFence(tokens, idx, options, env, self);
      };

      if (marpMod) {
        const MarpClass = marpMod.Marp || marpMod;
        this.marp = new MarpClass({ html: true, container: false, inlineSVG: false });
        this.marp.use(getPlugin(footnoteMod)).use(getPlugin(katexMod)).use(wikilinks, { uriSuffix: "" }).use(taskLists, { enabled: true });
        if (typeof githubAlerts === "function") {this.marp.use(githubAlerts);}
        const marpDefaultFence = this.marp.markdown.renderer.rules.fence || ((tokens: any[], idx: number, options: any, env: any, self: any) => self.renderToken(tokens, idx, options));
        this.marp.markdown.renderer.rules.fence = (tokens: any[], idx: number, options: any, env: any, self: any) => {
            const t = tokens[idx], i = t.info ? this.md.utils.unescapeAll(t.info).trim() : "";
            if (i === "mermaid") { const c = this.md.utils.escapeHtml(t.content); return `<div class="mermaid" data-original-content="${c}">\n${c}\n</div>`; }
            return marpDefaultFence(tokens, idx, options, env, self);
        };
      }
    } catch (e) { console.error("Failed to load markdown plugins", e); }
  }

  public render(markdown: string, imageResolver?: ImageResolver): string { return this.md.render(markdown, { imageResolver }); }

  public renderMarp(markdown: string, imageResolver?: ImageResolver): { html: string; css: string; js: string } {
    if (!this.marp) {return { html: this.render(markdown, imageResolver), css: "", js: "" };}
    const { html, css } = this.marp.render(markdown, { imageResolver });
    const { cleaned, scripts } = this.cleanMarpHtml(html);
    return { html: cleaned, css, js: scripts.join("\n") };
  }

  public cleanMarpHtml(html: string): { cleaned: string; scripts: string[] } {
    const scripts: string[] = [];
    const cleaned = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, (m) => {
      const c = m.replace(/^<script.*?>/i, "").replace(/<\/script>$/i, ""); if (c.trim()) {scripts.push(c);} return "";
    });
    return { cleaned: cleaned.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ""), scripts };
  }

  public scopeMarpCss(css: string, scopeSelector: string): { charsets: string[]; imports: string[]; scoped: string } {
    const charsets: string[] = [], imports: string[] = [];
    let c = css.replace(/@charset\s+[^;]+;/g, (m) => { charsets.push(m); return ""; });
    c = c.replace(/@import\s+[^;]+;/gi, (m) => { imports.push(m); return ""; });
    // Scope all rules to the container
    return { charsets, imports, scoped: `${scopeSelector} { ${c} }` };
  }

  public resolveCssUrls(css: string, resolver: ImageResolver): string {
    return css.replace(/url\(['"]?([^'")]+)['"]?\)/g, (m, u) => {
      if (u.startsWith("data:") || u.startsWith("http:") || u.startsWith("https:") || u.startsWith("vscode-resource:") || u.startsWith("vscode-webview-resource:")) {return m;}
      try {
        return `url("${resolver(u)}")`;
      } catch {
        return m;
      }
    });
  }
}
