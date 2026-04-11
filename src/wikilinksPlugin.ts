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
