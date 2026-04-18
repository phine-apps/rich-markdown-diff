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

  // Strip data-line from SVGs to fix Marp slide offsets
  fullyCleaned = fullyCleaned.replace(/<svg\b[^>]*\sdata-line="[^"]*"[^>]*>/gi, (match) => {
    return match.replace(/\sdata-line="[^"]*"/gi, "");
  });

  return { cleaned: fullyCleaned, scripts };
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

  return {
    charsets,
    imports,
    scoped: `${scopeSelector} { ${cleanedCss} }`,
  };
}
