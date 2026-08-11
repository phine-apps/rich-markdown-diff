import * as fs from "fs";
import * as path from "path";

/**
 * Maps common file extensions to their corresponding MIME types.
 */
const MIME_TYPES: Record<string, string> = {
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".bmp": "image/bmp",
  ".ico": "image/x-icon",
  ".avif": "image/avif",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".eot": "application/vnd.ms-fontobject",
};

/**
 * Extracts a local filesystem path from a VS Code Webview URI or file URI string.
 *
 * Supported formats:
 * - https://file%2B.vscode-resource.vscode-cdn.net/...
 * - https://file+.vscode-resource.vscode-cdn.net/...
 * - vscode-resource://...
 * - vscode-file://vscode-app/...
 * - file://...
 */
export function extractLocalFsPath(uriStr: string): string | undefined {
  if (!uriStr) {
    return undefined;
  }

  let decoded = uriStr.trim();

  // Strip query and hash if present
  const queryIndex = decoded.search(/[?#]/);
  if (queryIndex !== -1) {
    decoded = decoded.slice(0, queryIndex);
  }

  const vscodeResourceCdnMatch = decoded.match(/^https:\/\/(?:file%2B|file\+)\.vscode-resource\.vscode-cdn\.net\/(.*)$/i);
  if (vscodeResourceCdnMatch) {
    let rawPath = decodeURIComponent(vscodeResourceCdnMatch[1]);
    // If Windows drive letter without leading slash: e.g. "c:/path/to" or "/c:/path/to"
    if (/^\/?[a-zA-Z]:[\\/]/.test(rawPath)) {
      rawPath = rawPath.replace(/^\//, "");
    } else if (!rawPath.startsWith("/")) {
      rawPath = "/" + rawPath;
    }
    return rawPath;
  }

  const vscodeFileMatch = decoded.match(/^vscode-file:\/\/vscode-app\/(.*)$/i);
  if (vscodeFileMatch) {
    let rawPath = decodeURIComponent(vscodeFileMatch[1]);
    if (/^\/?[a-zA-Z]:[\\/]/.test(rawPath)) {
      rawPath = rawPath.replace(/^\//, "");
    } else if (!rawPath.startsWith("/")) {
      rawPath = "/" + rawPath;
    }
    return rawPath;
  }

  const vscodeResourceMatch = decoded.match(/^vscode-resource:(?:\/\/file)?\/(.*)$/i);
  if (vscodeResourceMatch) {
    let rawPath = decodeURIComponent(vscodeResourceMatch[1]);
    if (/^\/?[a-zA-Z]:[\\/]/.test(rawPath)) {
      rawPath = rawPath.replace(/^\//, "");
    } else if (!rawPath.startsWith("/")) {
      rawPath = "/" + rawPath;
    }
    return rawPath;
  }

  const fileMatch = decoded.match(/^file:\/\/(.*)$/i);
  if (fileMatch) {
    let rawPath = decodeURIComponent(fileMatch[1]);
    // file:///c:/... or file:///Users/...
    if (/^\/[a-zA-Z]:[\\/]/.test(rawPath)) {
      rawPath = rawPath.slice(1);
    }
    return rawPath;
  }

  // Already a local absolute path
  if (path.isAbsolute(decoded)) {
    return decoded;
  }

  return undefined;
}

/**
 * Returns MIME type based on file extension.
 */
export function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  return MIME_TYPES[ext] || "application/octet-stream";
}

/**
 * Default file reader using node fs promises.
 */
async function defaultReadFile(fsPath: string): Promise<Uint8Array> {
  return await fs.promises.readFile(fsPath);
}

export interface PrepareExportHtmlOptions {
  readFile?: (fsPath: string) => Promise<Uint8Array>;
  mermaidCdn?: string;
  hljsLightCdn?: string;
  hljsDarkCdn?: string;
  katexFontCdnBase?: string;
}

/**
 * Processes VS Code webview HTML to produce a self-contained, browser-compatible HTML document.
 * Inlines local images as Base64 Data URIs and replaces local scripts/styles with CDN equivalents.
 */
export async function prepareExportHtml(
  rawHtml: string,
  options: PrepareExportHtmlOptions = {},
): Promise<string> {
  const readFile = options.readFile || defaultReadFile;
  const mermaidCdn =
    options.mermaidCdn ||
    "https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js";
  const hljsLightCdn =
    options.hljsLightCdn ||
    "https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.11.1/styles/github.min.css";
  const hljsDarkCdn =
    options.hljsDarkCdn ||
    "https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.11.1/styles/github-dark.min.css";
  const katexFontCdnBase =
    options.katexFontCdnBase ||
    "https://cdn.jsdelivr.net/npm/katex@0.10.2/dist/fonts";

  let html = rawHtml;

  // 1. Replace Highlight.js and Mermaid CDN scripts/styles
  html = html
    .replace(
      /href="[^"]*github\.min\.css[^"]*"/i,
      `href="${hljsLightCdn}"`,
    )
    .replace(
      /href="[^"]*github-dark\.min\.css[^"]*"/i,
      `href="${hljsDarkCdn}"`,
    )
    .replace(
      /src="[^"]*mermaid\.min\.js[^"]*"/i,
      `src="${mermaidCdn}"`,
    );

  // 2. Adjust Content-Security-Policy for standalone browser execution
  // Replace strict webview CSP with a safe standalone CSP allowing CDN and data: URIs
  const standaloneCsp = `<meta http-equiv="Content-Security-Policy" content="default-src 'self' 'unsafe-inline' https: data: blob:; img-src 'self' https: data: blob:; font-src 'self' https: data:; style-src 'self' 'unsafe-inline' https: data:; script-src 'self' 'unsafe-inline' https:;">`;
  html = html.replace(
    /<meta\s+http-equiv="Content-Security-Policy"[^>]*>/i,
    standaloneCsp,
  );

  // 3. Find and replace all local image URLs and asset URLs with Base64 Data URIs
  // Targets:
  // - <img ... src="..." ...>
  // - CSS url(...) inside style tags
  const uriRegex = /(?:src=["']([^"']+)["']|url\((['"]?)([^'")]+)\2\))/gi;
  const matches: string[] = [];
  let m: RegExpExecArray | null;

  while ((m = uriRegex.exec(html)) !== null) {
    const candidateUri = m[1] || m[3];
    if (candidateUri && !candidateUri.startsWith("data:")) {
      matches.push(candidateUri);
    }
  }

  // Deduplicate URIs to process
  const uniqueUris = Array.from(new Set(matches));
  const uriToDataMap = new Map<string, string>();

  for (const uri of uniqueUris) {
    // Check if this is a KaTeX font file that can be replaced by KaTeX CDN or inlined
    if (uri.includes("/media/katex/fonts/")) {
      const fontFilename = path.basename(uri.split("?")[0]);
      if (fontFilename) {
        // Replace with CDN font URL
        uriToDataMap.set(uri, `${katexFontCdnBase}/${fontFilename}`);
        continue;
      }
    }

    const fsPath = extractLocalFsPath(uri);
    if (!fsPath) {
      continue;
    }

    try {
      const fileBytes = await readFile(fsPath);
      const mime = getMimeType(fsPath);
      const base64 = Buffer.from(fileBytes).toString("base64");
      const dataUri = `data:${mime};base64,${base64}`;
      uriToDataMap.set(uri, dataUri);
    } catch (e) {
      console.warn(`[rich-markdown-diff] Failed to inline asset for export: ${fsPath}`, e);
    }
  }

  // Replace URIs in HTML
  for (const [origUri, replacement] of uriToDataMap.entries()) {
    // Escape for literal replace
    html = html.split(origUri).join(replacement);
  }

  return html;
}
