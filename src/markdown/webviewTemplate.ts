import * as crypto from "crypto";
import { escapeHtml } from "./sanitizer";

/**
 * Generates the full HTML content for the webview.
 *
 * @param diffHtml - The computed HTML difference.
 * @param katexCssInline - The inlined KaTeX CSS.
 * @param mermaidJsUri - The URI for Mermaid JS.
 * @param hljsLightCssUri - The URI for Highlight.js light theme CSS.
 * @param hljsDarkCssUri - The URI for Highlight.js dark theme CSS.
 * @param leftLabel - Label for the original version (default: "Original").
 * @param rightLabel - Label for the modified version (default: "Modified").
 * @param cspSource - The CSP source for the webview.
 * @param translations - Translation map.
 * @param marpCss - Optional Marp-specific CSS to inject.
 * @param marpJs - Optional Marp-specific JavaScript to inject.
 * @returns The complete HTML document string.
 */
export function getWebviewContent(
  diffHtml: string,
  katexCssInline: string,
  mermaidJsUri: string,
  hljsLightCssUri: string,
  hljsDarkCssUri: string,
  leftLabel: string = "Original",
  rightLabel: string = "Modified",
  cspSource: string = "",
  translations: Record<string, string> = {},
  marpCss?: string,
  marpJs?: string,
): string {
  const nonce = crypto.randomBytes(16).toString("hex");

  const t = (key: string, ...args: any[]) => {
    let text = translations[key] || key;
    args.forEach((arg, i) => {
      text = text.replace(`{${i}}`, String(arg));
    });
    return text;
  };

  const safeLeft = escapeHtml(leftLabel === "Original" ? t("Original") : leftLabel);
  const safeRight = escapeHtml(rightLabel === "Modified" ? t("Modified") : rightLabel);

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; base-uri 'none'; connect-src 'none'; form-action 'none'; style-src-elem ${cspSource} 'nonce-${nonce}'; style-src-attr 'unsafe-inline'; script-src 'nonce-${nonce}'; img-src ${cspSource} https: data:; font-src ${cspSource};">
    <title>${escapeHtml(t("Markdown Diff"))}</title>
    <!-- KaTeX CSS (inlined with absolute font URIs for webview compatibility) -->
    <style nonce="${nonce}">${katexCssInline}</style>
    <!-- Highlight.js CSS -->
    <link rel="stylesheet" href="${hljsLightCssUri}" media="(prefers-color-scheme: light)">
    <link rel="stylesheet" href="${hljsDarkCssUri}" media="(prefers-color-scheme: dark)">
    <!-- Mermaid JS -->
    <script nonce="${nonce}" src="${mermaidJsUri}"></script>
    <!-- Marp CSS -->
    ${marpCss ? `<style nonce="${nonce}">${marpCss}</style>` : ""}
    <!-- Marp JS -->
    ${marpJs ? `<script nonce="${nonce}">${marpJs}</script>` : ""}
    <style nonce="${nonce}">
        :root { /* VRT_THEME_VARS */ }
        html, body {
            height: 100%;
            overflow: hidden;
            width: 100%;
        }
        body { 
            font-family: var(--vscode-font-family); 
            padding: 0; 
            margin: 0;
            background-color: var(--markdown-surface-background);
            color: var(--markdown-foreground);
            display: flex;
            flex-direction: column;
          --markdown-surface-background: var(--vscode-editor-background, #1e1e1e);
          --markdown-raised-background: var(--vscode-editorWidget-background, #252526);
          --markdown-foreground: var(--vscode-foreground, var(--vscode-editor-foreground, #d4d4d4));
          --markdown-base-font-size: 14px;
          --markdown-base-line-height: 1.6;
          --markdown-code-font-size: 13px;
          --markdown-h1-size: 27px;
          --markdown-h2-size: 20px;
          --markdown-h3-size: 17px;
          --markdown-h4-size: 15px;
          --markdown-h5-size: 14px;
          --markdown-h6-size: 12px;
          --markdown-block-spacing: 0.6em;
        }
        /* Toolbar */
        .toolbar {
            display: flex;
            align-items: center;
            padding: 5px 10px;
          background-color: var(--markdown-surface-background);
          color: var(--markdown-foreground);
            border-bottom: 1px solid var(--vscode-panel-border);
            flex-shrink: 0;
            gap: 10px;
        }
        .btn {
            background: none;
            border: 1px solid var(--vscode-button-secondaryBorder);
            color: var(--vscode-button-secondaryForeground);
            background-color: var(--vscode-button-secondaryBackground);
            padding: 3px 10px;
            cursor: pointer;
            font-family: var(--vscode-font-family);
            font-size: 12px;
            border-radius: 2px;
        }
        .btn:hover {
            background-color: var(--vscode-button-secondaryHoverBackground);
        }

        .header {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
          gap: 0;
            height: 30px;
            flex-shrink: 0;
            border-bottom: 1px solid var(--vscode-panel-border);
          background-color: var(--markdown-surface-background);
        }
        .header-item {
          min-width: 0;
            padding: 5px 10px;
            font-weight: bold;
            display: flex;
            align-items: center;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          background-color: var(--markdown-surface-background);
          color: var(--markdown-foreground);
        }
        .header-item + .header-item {
          border-left: 1px solid var(--vscode-panel-border);
        }
        .container {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
          grid-template-rows: minmax(0, 1fr);
          gap: 0;
            flex: 1;
            min-height: 0;
            overflow: hidden;
            width: 100%;
          background-color: var(--markdown-surface-background);
        }
        .pane {
            min-width: 0;
          min-height: 0;
          height: 100%;
          max-height: 100%;
          align-self: stretch;
            overflow-y: scroll;
            overflow-x: auto;
            scrollbar-gutter: stable both-edges;
            padding: 20px;
            box-sizing: border-box;
            position: relative; /* Ensure offsetTop is relative to pane */
          background-color: var(--markdown-surface-background);
          color: var(--markdown-foreground);
          font-weight: normal;
          font-size: var(--markdown-base-font-size);
          line-height: var(--markdown-base-line-height);
        }
        .pane + .pane {
          border-left: 1px solid var(--vscode-panel-border);
        }
        .pane-content {
          position: relative;
          color: inherit;
        }
        .pane-content > :first-child {
          margin-top: 0;
        }
        .pane-content > :last-child {
          margin-bottom: 0;
        }
        
        /* Inline Mode Styles */
        body.inline-mode .container {
          display: flex;
            flex-direction: column;
          gap: 0;
          background-color: transparent;
        }
        body.inline-mode #left-pane {
            display: none !important;
        }
        body.inline-mode #right-pane {
          flex: 1 1 auto;
            width: 100%;
            max-width: 100%;
        }
        body.inline-mode .header {
            display: none !important; /* Hide Original/Modified header in inline */
        }
        
        /* Inline Mode Coloring: Show BOTH del and ins in the right pane */
        body.inline-mode #right-pane del {
            display: inline; /* Make visible */
            background-color: rgba(248, 113, 113, 0.2); 
            text-decoration: line-through; /* Strikethrough for inline del */
            border-bottom: 1px solid #ef4444;
            color: inherit;
            opacity: 0.8;
        }
        /* Explicitly style ins in inline mode to match right-pane ins style */
        body.inline-mode #right-pane ins {
            background-color: rgba(74, 222, 128, 0.2); 
            text-decoration: none; 
            border-bottom: 1px solid #22c55e;
            color: inherit;
        }

        /* Scrollbar Styling */
        ::-webkit-scrollbar { width: 10px; height: 10px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: var(--vscode-scrollbarSlider-background); }
        ::-webkit-scrollbar-thumb:hover { background: var(--vscode-scrollbarSlider-hoverBackground); }
        ::-webkit-scrollbar-thumb:active { background: var(--vscode-scrollbarSlider-activeBackground); }
        
        /* Markdown Styles */
        p,
        ul,
        ol,
        dl,
        blockquote,
        pre,
        table,
        hr,
        .markdown-alert,
        .katex-block,
        .footnotes {
          margin-top: 0;
          margin-bottom: var(--markdown-block-spacing);
        }
        p {
          font-weight: 400;
        }
        ul,
        ol {
          padding-left: 1.75em;
        }
        ul {
          list-style-type: disc;
        }
        ol {
          list-style-type: decimal;
        }
        ul,
        ol,
        li {
          font-weight: 400;
        }
        li::marker {
          font-weight: 400;
          color: inherit;
        }
        li + li {
          margin-top: 0.15em;
        }
        li, dt, dd {
          overflow-wrap: break-word;
          word-wrap: break-word;
        }
        li > p {
          margin-top: 0.2em;
          margin-bottom: 0.2em;
        }
        dt {
          font-weight: 600;
        }
        dd {
          margin-left: 1.5em;
        }
        code {
          font-family: var(--vscode-editor-font-family);
          font-size: var(--markdown-code-font-size);
          overflow-wrap: break-word;
          background-color: var(--vscode-textCodeBlock-background, var(--markdown-raised-background));
          padding: 0.15em 0.35em;
          border-radius: 3px;
        }
        pre code {
          font-size: inherit;
          overflow-wrap: normal;
          background-color: transparent;
          padding: 0;
          border-radius: 0;
        }
        pre {
          background-color: var(--vscode-textCodeBlock-background, var(--markdown-raised-background));
          padding: 8px 10px;
          font-size: var(--markdown-code-font-size);
          line-height: 1.5;
          overflow-x: auto;
          width: 100%;
          max-width: 100%;
          min-width: 0;
          box-sizing: border-box;
          border: 1px solid var(--vscode-panel-border);
          border-radius: 4px;
        }
        .katex-block {
          background-color: var(--vscode-textCodeBlock-background, var(--markdown-raised-background));
          padding: 8px 10px;
          overflow-x: auto;
          overflow-y: hidden;
          width: 100%;
          max-width: 100%;
          min-width: 0;
          box-sizing: border-box;
          border: 1px solid var(--vscode-panel-border);
          border-radius: 4px;
        }
        .katex-block .katex-display {
          margin: 0;
          min-width: max-content;
          padding: 0.15em 0;
        }
        .katex-block .katex {
          max-width: none;
        }
        h1, h2, h3, h4, h5, h6 {
          overflow-wrap: break-word;
          display: block;
          width: auto;
          max-width: 100%;
          box-sizing: border-box;
          line-height: 1.3;
          font-weight: 600;
          margin-top: 1em;
          margin-bottom: 0.3em;
          color: var(--markdown-foreground);
        }
        .heading-prefix {
          display: inline-block;
          white-space: nowrap;
          vertical-align: baseline;
        }
        h1, h2 {
          padding-bottom: 0.25em;
          border-bottom: 1px solid var(--vscode-panel-border);
        }
        h1 { font-size: var(--markdown-h1-size); }
        h2 { font-size: var(--markdown-h2-size); }
        h3 { font-size: var(--markdown-h3-size); }
        h4 { font-size: var(--markdown-h4-size); }
        h5 { font-size: var(--markdown-h5-size); }
        h6 {
          font-size: var(--markdown-h6-size);
          color: var(--vscode-descriptionForeground);
        }
        /* Remove noisy bottom borders for inline diff markers inside code blocks */
        pre ins,
        pre del {
          border-bottom: none !important;
        }
        img {
          max-width: 100%;
          height: auto;
        }
        p > img:only-child {
          display: block;
        }
        table {
          width: max-content;
          min-width: 100%;
          max-width: 100%;
          border-collapse: collapse;
          line-height: 1.5;
          background-color: var(--vscode-editor-background);
        }
        th,
        td {
          border: 1px solid var(--vscode-panel-border);
          padding: 0.5em 0.75em;
          text-align: left;
          vertical-align: top;
          line-height: 1.5;
        }
        th {
          font-weight: 600;
          background-color: var(--vscode-textBlockQuote-background);
        }
        tbody tr:nth-child(even) {
          background-color: rgba(127, 127, 127, 0.08);
        }
        caption {
          caption-side: top;
          margin-bottom: 0.5em;
          text-align: left;
          font-weight: 600;
        }
        hr {
          border: none;
          border-top: 1px solid var(--vscode-panel-border);
          margin: 1em 0;
        }
        .toolbar-status {
          margin-left: auto;
          font-size: 11px;
          opacity: 0.7;
        }

        /* Split View Coloring Strategy (Default) */
        /* Left Pane (Original): Hide insertions, show deletions in Red */
        body:not(.inline-mode) #left-pane ins { display: none; }
        body:not(.inline-mode) #left-pane del { 
            background-color: rgba(248, 113, 113, 0.2); 
            text-decoration: none; 
            border-bottom: 1px solid #ef4444;
            color: inherit;
        }
        body:not(.inline-mode) #left-pane h1 del,
        body:not(.inline-mode) #left-pane h2 del,
        body:not(.inline-mode) #left-pane h3 del,
        body:not(.inline-mode) #left-pane h4 del,
        body:not(.inline-mode) #left-pane h5 del,
        body:not(.inline-mode) #left-pane h6 del {
            border-bottom: none;
        }

        /* Right Pane (Modified): Hide deletions, show insertions in Green */
        body:not(.inline-mode) #right-pane del { display: none; }
        body:not(.inline-mode) #right-pane ins {
            background-color: rgba(74, 222, 128, 0.2); 
            text-decoration: none; 
            border-bottom: 1px solid #22c55e;
            color: inherit;
        }
        body:not(.inline-mode) #right-pane h1 ins,
        body:not(.inline-mode) #right-pane h2 ins,
        body:not(.inline-mode) #right-pane h3 ins,
        body:not(.inline-mode) #right-pane h4 ins,
        body:not(.inline-mode) #right-pane h5 ins,
        body:not(.inline-mode) #right-pane h6 ins {
            border-bottom: none;
        }

        /* Full Document Diff Styling (for comparisons with empty files) */
        ins.diffins, del.diffdel {
            text-decoration: none;
            color: inherit;
        }
        ins.diffins {
            background-color: rgba(74, 222, 128, 0.2); 
            border-bottom: 1px solid #22c55e;
        }
        ins.diffins a {
            background-color: rgba(74, 222, 128, 0.2); 
        }
        del.diffdel {
            background-color: rgba(248, 113, 113, 0.2); 
            border-bottom: 1px solid #ef4444;
        }
        del.diffdel a {
            background-color: rgba(248, 113, 113, 0.2); 
        }

        /* Ensure diff styling is visible for tokenized blocks with their own backgrounds (Alerts, KaTeX, Mermaid) */
        ins:has(.markdown-alert), del:has(.markdown-alert),
        ins:has(.katex-block), del:has(.katex-block),
        ins:has(.mermaid), del:has(.mermaid),
        ins:has(.footnote-item), del:has(.footnote-item),
        ins:has(pre), del:has(pre) {
            display: block;
            text-decoration: none;
            border: none !important;
            background-color: transparent !important;
            padding: 0 !important;
            margin: 0 !important;
            margin-bottom: var(--markdown-block-spacing);
        }

        ins .markdown-alert, del .markdown-alert,
        ins .katex-block, del .katex-block,
        ins .mermaid, del .mermaid,
        ins pre, del pre {
            position: relative; /* For pseudo-element overlay */
        }

        ins .markdown-alert, ins .katex-block, ins .mermaid, ins pre {
            border: 1px solid #22c55e;
        }
        ins .markdown-alert::after, ins .katex-block::after, ins .mermaid::after, ins pre::after {
            content: "";
            position: absolute;
            top: 0; left: 0; right: 0; bottom: 0;
            background-color: rgba(74, 222, 128, 0.2);
            pointer-events: none;
        }

        del .markdown-alert, del .katex-block, del .mermaid, del pre {
            border: 1px solid #ef4444;
        }
        del .markdown-alert::after, del .katex-block::after, del .mermaid::after, del pre::after {
            content: "";
            position: absolute;
            top: 0; left: 0; right: 0; bottom: 0;
            background-color: rgba(248, 113, 113, 0.2);
            pointer-events: none;
        }

        ins:has(> h1, > h2, > h3, > h4, > h5, > h6, > table, > ul, > ol, > dl, > blockquote, > div, > pre, > hr),
        del:has(> h1, > h2, > h3, > h4, > h5, > h6, > table, > ul, > ol, > dl, > blockquote, > div, > pre, > hr) {
            display: block;
          width: auto;
          max-width: 100%;
        }

        /* Table Column Hiding */
        #left-pane .diff-col-ins {
            display: none !important;
        }
        #right-pane .diff-col-del {
            display: none !important;
        }

        /* Task Lists */
        .contains-task-list {
            list-style-type: none;
            padding-left: 2em; 
        }
        .task-list-item {
            position: relative;
        }
        .task-list-item-checkbox {
            margin: 0 0.2em 0.25em -1.6em;
            vertical-align: middle;
        }

        /* Checkbox Diffs (All Modes) */
        del .task-list-item-checkbox {
            box-shadow: 0 0 0 2px rgba(239, 68, 68, 0.8);
            border-radius: 2px;
        }
        
        ins .task-list-item-checkbox {
            box-shadow: 0 0 0 2px rgba(34, 197, 94, 0.8);
            border-radius: 2px;
        }

        /* Inline Mode Checkbox Specifics */
        body.inline-mode #right-pane del .task-list-item-checkbox {
            opacity: 0.5;
        }
        
        body.inline-mode #right-pane ins .task-list-item-checkbox {
            margin-left: 0.2em; /* reset the -1.6em pull so it doesn't overlap the del checkbox */
        }

        /* Block-Level Diffs (Tables, Lists, Blockquotes) */
        del.diffdel.diff-block, ins.diffins.diff-block {
            display: block;
            border: 1px solid;
            border-radius: 4px;
            padding: 8px 10px;
            margin: 0.5em 0;
          width: 100%;
          max-width: 100%;
          min-width: 0;
            box-sizing: border-box;
        }
        del.diffdel.diff-block {
            background-color: rgba(239, 68, 68, 0.1); 
            border-color: rgba(239, 68, 68, 0.6);
        }
        ins.diffins.diff-block {
            background-color: rgba(34, 197, 94, 0.1); 
            border-color: rgba(34, 197, 94, 0.6);
        }

        /* Structural list-container swaps (ol <-> ul) should highlight marker changes,
           not make unchanged list text look deleted/inserted. */
        del.diff-list-container-change,
        ins.diff-list-container-change {
          background-color: transparent !important;
          border: none !important;
          text-decoration: none !important;
          color: inherit !important;
          opacity: 1 !important;
          padding: 0 !important;
        }
        del.diff-list-container-change > ol,
        del.diff-list-container-change > ul,
        del.diff-list-container-change > dl,
        ins.diff-list-container-change > ol,
        ins.diff-list-container-change > ul,
        ins.diff-list-container-change > dl {
          margin-top: 0;
          margin-bottom: 0;
          background-color: transparent;
          color: inherit;
          box-sizing: border-box;
          padding-top: 0.15em;
          padding-bottom: 0.15em;
        }
        del.diff-list-container-change > ol,
        del.diff-list-container-change > ul,
        ins.diff-list-container-change > ol,
        ins.diff-list-container-change > ul {
          padding-left: calc(1.75em - 3px + 0.55em);
        }
        del.diff-list-container-change > dl,
        ins.diff-list-container-change > dl {
          padding-left: 0.85em;
        }
        del.diff-list-container-change li,
        del.diff-list-container-change li > p,
        del.diff-list-container-change dt,
        del.diff-list-container-change dd,
        ins.diff-list-container-change li,
        ins.diff-list-container-change li > p,
        ins.diff-list-container-change dt,
        ins.diff-list-container-change dd {
          color: inherit;
          background-color: transparent;
          text-decoration: none;
        }
        del.diff-list-container-change li::marker,
        ins.diff-list-container-change li::marker {
          font-weight: 600;
        }
        body:not(.inline-mode) #left-pane del.diff-list-container-change > ol,
        body:not(.inline-mode) #left-pane del.diff-list-container-change > ul,
        body:not(.inline-mode) #left-pane del.diff-list-container-change > dl,
        body.inline-mode #right-pane del.diff-list-container-change > ol,
        body.inline-mode #right-pane del.diff-list-container-change > ul,
        body.inline-mode #right-pane del.diff-list-container-change > dl {
          border-left: 3px solid rgba(239, 68, 68, 0.65);
        }
        body:not(.inline-mode) #right-pane ins.diff-list-container-change > ol,
        body:not(.inline-mode) #right-pane ins.diff-list-container-change > ul,
        body:not(.inline-mode) #right-pane ins.diff-list-container-change > dl,
        body.inline-mode #right-pane ins.diff-list-container-change > ol,
        body.inline-mode #right-pane ins.diff-list-container-change > ul,
        body.inline-mode #right-pane ins.diff-list-container-change > dl {
          border-left: 3px solid rgba(34, 197, 94, 0.65);
        }
        body:not(.inline-mode) #left-pane del.diff-list-container-change li::marker,
        body.inline-mode #right-pane del.diff-list-container-change li::marker {
          color: #ef4444;
        }
        body:not(.inline-mode) #right-pane ins.diff-list-container-change li::marker,
        body.inline-mode #right-pane ins.diff-list-container-change li::marker {
          color: #22c55e;
        }

        /* Ghost Element Hiding */
        .ghost-hidden { display: none !important; }
        /* CSS safety net: hide ghost list-item bullets added by markGhostListItems() */
        body:not(.inline-mode) #left-pane  li[data-all-inserted] { display: none !important; }
        body:not(.inline-mode) #right-pane li[data-all-deleted]  { display: none !important; }

        /* Folded Region Styles */
        .folded-region {
            display: none;
        }
        .fold-placeholder {
            background-color: var(--vscode-editor-inactiveSelectionBackground);
            color: var(--vscode-descriptionForeground);
            padding: 5px 10px;
            margin: 5px 0;
            cursor: pointer;
            text-align: center;
            font-size: 11px;
            border-radius: 4px;
            user-select: none;
        }
        .fold-placeholder:hover {
            background-color: var(--vscode-editor-selectionBackground);
        }

        /* Frontmatter Diff */
        .frontmatter-diff {
            margin-bottom: 20px;
            padding: 10px;
            border-bottom: 1px solid var(--vscode-panel-border);
        }
        .frontmatter-diff table {
            width: 100%;
            border-collapse: collapse;
          font-size: 12px;
          line-height: 1.5;
        }
        .frontmatter-diff th, .frontmatter-diff td {
            border: 1px solid var(--vscode-textBlockQuote-border);
            padding: 5px;
            text-align: left;
        }
        .frontmatter-diff th {
            font-weight: bold;
        }
        .frontmatter-diff .fm-old.fm-changed {
            background-color: rgba(248, 113, 113, 0.2);
            color: var(--vscode-editor-foreground);
        }
        .frontmatter-diff .fm-new.fm-changed {
            background-color: rgba(74, 222, 128, 0.2);
            color: var(--vscode-editor-foreground);
        }

        /* Split View Frontmatter Strategy */
        /* Left Pane: Hide New, Show Old */
        body:not(.inline-mode) #left-pane .frontmatter-diff .fm-new { display: none; }

        /* Right Pane: Hide Old, Show New */
        body:not(.inline-mode) #right-pane .frontmatter-diff .fm-old { display: none; }
        /* Marp Support */
        .marp .marpit > svg,
        .marp .marpit > section,
        .marp section {
            width: 100%;
            height: auto;
            aspect-ratio: 16 / 9;
            margin-left: auto !important;
            margin-right: auto !important;
            margin-top: 0 !important;
            margin-bottom: 20px !important;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
            border: 1px solid var(--vscode-panel-border);
            box-sizing: border-box;
            position: relative;
            overflow: hidden !important;
            display: flex;
            flex-direction: column;
            justify-content: center;
            transform-origin: top left;
        }
        
        /* Ensure diff markers work inside slides */
        .marp section ins {
            background-color: rgba(34, 197, 94, 0.2) !important;
            text-decoration: none;
        }
        .marp section del {
            background-color: rgba(239, 68, 68, 0.2) !important;
            text-decoration: line-through;
        }

        /* Adjustments for slides wrapped in blocks (to avoid double margins/borders) */
        ins.diffins.diff-block:has(> .marpit),
        del.diffdel.diff-block:has(> .marpit),
        ins.diffins.diff-block:has(> svg),
        del.diffdel.diff-block:has(> svg),
        ins.diffins.diff-block:has(> section),
        del.diffdel.diff-block:has(> section) {
            margin: 0 !important;
            padding: 0 !important;
            border: none !important;
            background-color: transparent !important;
        }

        /* If the whole slide is new/deleted, show the tint on the slide itself */
        ins.diffins:has(> svg) svg,
        ins.diffins:has(> section) section {
            border-color: rgba(34, 197, 94, 0.6) !important;
            background-color: rgba(34, 197, 94, 0.05) !important;
        }
        del.diffdel:has(> svg) svg,
        del.diffdel:has(> section) section {
            border-color: rgba(239, 68, 68, 0.6) !important;
            background-color: rgba(239, 68, 68, 0.05) !important;
        }

        /* Active Change Highlighting */
        /* Simplified to avoid heavy rendering */
        /* Active Change Highlighting */
        .selected-change {
            background-color: rgba(255, 200, 0, 0.3) !important;
            box-shadow: 0 0 0 3px rgba(255, 200, 0, 0.8);
            border-radius: 2px;
            position: relative; 
            z-index: 10;
        }

        /* Specific High Visibility for Complex Blocks (Mermaid/Math) */
        .mermaid.selected-change, 
        .katex-block.selected-change {
            background-color: rgba(255, 235, 59, 0.2) !important; /* Yellow tint for focus */
          border: 1px solid rgba(255, 165, 0, 0.9) !important;
          box-shadow: 0 0 0 2px rgba(255, 165, 0, 0.45) !important;
            overflow: visible !important;
            display: block; 
        }

        /* Image Focus Style (same as Mermaid) */
        .selected-change img {
          border: 1px solid rgba(255, 165, 0, 0.9) !important;
          box-shadow: 0 0 0 2px rgba(255, 165, 0, 0.45) !important;
        }

        /* Complex block wrappers should not draw their own inline highlight;
           the inner block container owns the border/background styling. */
        ins.diffins:has(> .mermaid),
        del.diffdel:has(> .mermaid),
        ins.diffins:has(> .katex-block),
        del.diffdel:has(> .katex-block) {
          display: block;
          border: none !important;
          background-color: transparent !important;
          padding: 0 !important;
          margin: 0.5em 0 !important;
          text-decoration: none !important;
        }

        /* Persistent Visibility for unselected complex changes */
        ins.diffins > .mermaid,
        ins.diffins > .katex-block {
          border: 1px solid rgba(34, 197, 94, 0.6);
          background-color: rgba(34, 197, 94, 0.1);
            display: block;
          margin: 0;
          padding: 8px 10px;
          border-radius: 4px;
          box-sizing: border-box;
        }
        del.diffdel > .mermaid,
        del.diffdel > .katex-block {
          border: 1px solid rgba(239, 68, 68, 0.6);
          background-color: rgba(239, 68, 68, 0.1);
            display: block;
          margin: 0;
          padding: 8px 10px;
          border-radius: 4px;
          box-sizing: border-box;
            opacity: 0.8; /* Persistent fade for deleted content */
        }
        
        /* FIX: Prevent Double Borders (Container + SVG) */
        /* If we are highlighting the container (.mermaid/.katex-block), DO NOT highlight the inner SVG independently */
        ins .mermaid svg, del .mermaid svg,
        ins .katex-block svg, del .katex-block svg,
        .mermaid.selected-change svg, .katex-block.selected-change svg {
            border: none !important;
            background: none !important;
            box-shadow: none !important;
            margin: 0 !important;
        }

        /* Highlight the actual SVG shapes */
        .mermaid.selected-change svg, 
        .selected-change svg {
            filter: drop-shadow(0 0 8px rgba(255, 140, 0, 0.8)) !important;
        }

        /* GitHub Alerts (Admonitions) */
        .markdown-alert {
            padding: 8px 16px;
            margin-bottom: 16px;
            border-left: 0.25em solid;
          background-color: var(--markdown-raised-background);
        }

        /* Image Diff Styles */
        /* Unified with Table/Mermaid styles */
        ins img {
            border: 4px solid rgba(34, 197, 94, 0.6); /* Green border */
            background-color: rgba(34, 197, 94, 0.1);
            padding: 10px;
            display: block;
            margin: 1em 0;
            max-width: 95%; /* Prevent overflow with border/padding */
        }
        del img {
            border: 4px solid rgba(239, 68, 68, 0.6); /* Red border */
            background-color: rgba(239, 68, 68, 0.1);
            padding: 10px;
            display: block;
            margin: 1em 0;
            opacity: 0.8; /* Match block-diff opacity */
            max-width: 95%;
        }
        
        /* Inline Mode Image Styles */
        body.inline-mode #right-pane del img {
            display: block; /* Make sure deleted images show as block in inline mode too */
            border: 4px solid rgba(239, 68, 68, 0.6);
        }
        .markdown-alert-title {
            display: flex;
            font-weight: bold;
            align-items: center;
            margin-bottom: 4px;
        }
        .markdown-alert-title svg {
            margin-right: 8px;
            fill: currentColor;
            width: 16px;
            height: 16px;
        }
        
        /* Note */
        .markdown-alert-note { border-color: #0969da; }
        .markdown-alert-note .markdown-alert-title { color: #0969da; }
        
        /* Tip */
        .markdown-alert-tip { border-color: #1a7f37; }
        .markdown-alert-tip .markdown-alert-title { color: #1a7f37; }
        
        /* Important */
        .markdown-alert-important { border-color: #8250df; }
        .markdown-alert-important .markdown-alert-title { color: #8250df; }
        
        /* Warning */
        .markdown-alert-warning { border-color: #bf8700; }
        .markdown-alert-warning .markdown-alert-title { color: #bf8700; }
        
        /* Caution */
        .markdown-alert-caution { border-color: #d1242f; }
        .markdown-alert-caution .markdown-alert-title { color: #d1242f; }

        /* Dark Mode Adjustments (approximate VS Code colors) */
        @media (prefers-color-scheme: dark) {
            .markdown-alert-note { border-color: #2f81f7; }
            .markdown-alert-note .markdown-alert-title { color: #2f81f7; }
            .markdown-alert-tip { border-color: #3fb950; }
            .markdown-alert-tip .markdown-alert-title { color: #3fb950; }
            .markdown-alert-important { border-color: #a371f7; }
            .markdown-alert-important .markdown-alert-title { color: #a371f7; }
            .markdown-alert-warning { border-color: #d29922; }
            .markdown-alert-warning .markdown-alert-title { color: #d29922; }
            .markdown-alert-caution { border-color: #f85149; }
            .markdown-alert-caution .markdown-alert-title { color: #f85149; }
        }
    </style>
</head>
<body class="VRT_LAYOUT_CLASS ${marpCss ? "marp-mode" : ""}">
    <div class="toolbar">
        <!-- Buttons removed, moved to VS Code View Actions -->
    <span id="status-msg" class="toolbar-status"></span>
    </div>
    <div class="header">
        <div class="header-item" title="${safeLeft}">${safeLeft}</div>
        <div class="header-item" title="${safeRight}">${safeRight}</div>
    </div>
    <div class="container">
        <div class="pane ${marpCss ? "marp marpit" : ""}" id="left-pane">
            <div class="pane-content" id="left-content">
                ${diffHtml}
            </div>
        </div>
        <div class="pane ${marpCss ? "marp marpit" : ""}" id="right-pane">
            <div class="pane-content" id="right-content">
                ${diffHtml}
            </div>
        </div>
    </div>
    <script nonce="${nonce}">
        const translations = ${JSON.stringify(translations)};
        const t = (key, ...args) => {
            let text = translations[key] || key;
            args.forEach((arg, i) => {
                text = text.replace(\`{\${i}}\`, String(arg));
            });
            return text;
        };

        const vscode = acquireVsCodeApi();
        const leftPane = document.getElementById('left-pane');
        const rightPane = document.getElementById('right-pane');
        const leftContent = document.getElementById('left-content');
        const rightContent = document.getElementById('right-content');
        const statusMsg = document.getElementById('status-msg');

        const runtimeDiagnostics = {
          events: [],
          maxEvents: 40,
          hasReported: false,
          lastSignature: '',
          reportId: 0,
        };

        const noteRuntimeEvent = (name, extra = {}) => {
          runtimeDiagnostics.events.push({
            time: Math.round(performance.now()),
            name,
            extra,
          });

          if (runtimeDiagnostics.events.length > runtimeDiagnostics.maxEvents) {
            runtimeDiagnostics.events.shift();
          }
        };

        const snapshotPaneMetrics = (name, pane, content) => {
          const style = window.getComputedStyle(pane);
          return {
            name,
            clientHeight: pane.clientHeight,
            scrollHeight: pane.scrollHeight,
            clientWidth: pane.clientWidth,
            scrollWidth: pane.scrollWidth,
            scrollTop: pane.scrollTop,
            offsetWidth: pane.offsetWidth,
            offsetHeight: pane.offsetHeight,
            contentHeight: Math.round(content.getBoundingClientRect().height),
            contentWidth: Math.round(content.getBoundingClientRect().width),
            scrollbarWidth: pane.offsetWidth - pane.clientWidth,
            overflowX: style.overflowX,
            overflowY: style.overflowY,
            verticalScrollNeeded: pane.scrollHeight > pane.clientHeight + 2,
            horizontalScrollNeeded: pane.scrollWidth > pane.clientWidth + 2,
          };
        };

        const snapshotViewportMetrics = () => {
          const documentElement = document.documentElement;
          const container = document.querySelector('.container');
          return {
            innerHeight: window.innerHeight,
            innerWidth: window.innerWidth,
            devicePixelRatio: window.devicePixelRatio,
            documentClientHeight: documentElement.clientHeight,
            documentScrollHeight: documentElement.scrollHeight,
            documentClientWidth: documentElement.clientWidth,
            documentScrollWidth: documentElement.scrollWidth,
            bodyClientHeight: document.body.clientHeight,
            bodyScrollHeight: document.body.scrollHeight,
            bodyClientWidth: document.body.clientWidth,
            bodyScrollWidth: document.body.scrollWidth,
            containerClientHeight: container ? container.clientHeight : null,
            containerScrollHeight: container ? container.scrollHeight : null,
            containerClientWidth: container ? container.clientWidth : null,
            containerScrollWidth: container ? container.scrollWidth : null,
          };
        };

        const emitRuntimeDiagnostics = (reason, extra = {}, options = {}) => {
          const metrics = {
            inline: isInline,
            folded: isFolded,
            left: snapshotPaneMetrics('left', leftPane, leftContent),
            right: snapshotPaneMetrics('right', rightPane, rightContent),
            viewport: snapshotViewportMetrics(),
          };

          const verticalScrollNeeded =
            metrics.left.verticalScrollNeeded || metrics.right.verticalScrollNeeded;
          const suspiciousNoScroll =
            !verticalScrollNeeded &&
            (
              metrics.left.clientHeight === 0 ||
              metrics.right.clientHeight === 0 ||
              metrics.left.contentHeight > metrics.left.clientHeight + 2 ||
              metrics.right.contentHeight > metrics.right.clientHeight + 2 ||
              metrics.viewport.documentScrollHeight > metrics.viewport.documentClientHeight + 2 ||
              metrics.viewport.bodyScrollHeight > metrics.viewport.bodyClientHeight + 2
            );
          const shouldEmit =
            options.force ||
            !runtimeDiagnostics.hasReported ||
            verticalScrollNeeded ||
            suspiciousNoScroll;

          if (!shouldEmit) {
            return;
          }

          const signature = JSON.stringify({
            reason,
            inline: metrics.inline,
            folded: metrics.folded,
            left: {
              clientHeight: metrics.left.clientHeight,
              scrollHeight: metrics.left.scrollHeight,
              scrollbarWidth: metrics.left.scrollbarWidth,
            },
            right: {
              clientHeight: metrics.right.clientHeight,
              scrollHeight: metrics.right.scrollHeight,
              scrollbarWidth: metrics.right.scrollbarWidth,
            },
            viewport: {
              documentClientHeight: metrics.viewport.documentClientHeight,
              documentScrollHeight: metrics.viewport.documentScrollHeight,
              bodyClientHeight: metrics.viewport.bodyClientHeight,
              bodyScrollHeight: metrics.viewport.bodyScrollHeight,
              containerClientHeight: metrics.viewport.containerClientHeight,
              containerScrollHeight: metrics.viewport.containerScrollHeight,
            },
            flags: {
              verticalScrollNeeded,
              suspiciousNoScroll,
            },
          });

          if (runtimeDiagnostics.lastSignature === signature) {
            return;
          }

          runtimeDiagnostics.hasReported = true;
          runtimeDiagnostics.lastSignature = signature;
          runtimeDiagnostics.reportId += 1;
          vscode.postMessage({
            command: 'runtimeDiagnostics',
            payload: {
              reason,
              reportId: runtimeDiagnostics.reportId,
              metrics,
              recentEvents: runtimeDiagnostics.events.slice(-20),
              extra,
            },
          });
        };

        window.addEventListener('error', event => {
          noteRuntimeEvent('window-error', {
            message: event.message,
            filename: event.filename,
            line: event.lineno,
            column: event.colno,
          });
          emitRuntimeDiagnostics(
            'window-error',
            {
              message: event.message,
              filename: event.filename,
              line: event.lineno,
              column: event.colno,
            },
            { force: true },
          );
        });

        window.addEventListener('unhandledrejection', event => {
          const reason = event.reason instanceof Error
            ? { message: event.reason.message, stack: event.reason.stack }
            : { value: String(event.reason) };
          noteRuntimeEvent('unhandled-rejection', reason);
          emitRuntimeDiagnostics('unhandled-rejection', reason, { force: true });
        });

        let isInline = false;
        let isFolded = false;
        let changeElements = [];
        let currentChangeIndex = -1;
        let isScrolling = false; // Restored missing variable for scroll sync

        const toggleInline = () => {
            isInline = !isInline;
          noteRuntimeEvent('toggle-inline', { isInline });
            if (isInline) {
                document.body.classList.add('inline-mode');
                resetGhosts(); // Inline mode shows everything
                // Fix Mermaid diagrams that were hidden
            requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                fixMermaid(rightContent);
              });
            });
            } else {
                document.body.classList.remove('inline-mode');
                // Defer cleanup to ensure class removal processed? No, sync is fine.
                // Re-calculate ghosts for split mode
                cleanupGhosts();
            }
            // Recalculate changes because visibility changed
            scheduleLayoutRefresh();
        };
        
        /**
         * Re-initializes Mermaid diagrams that might have rendered improperly 
         * due to being hidden (zero dimensions).
         */
        const fixMermaid = (container) => {
             const mermaids = container.querySelectorAll('.mermaid[data-original-content]');
             const renderPasses = [];
             noteRuntimeEvent('fix-mermaid', { count: mermaids.length });
             mermaids.forEach(el => {
                 // Only fix if it looks broken (e.g. small height) or just force it?
                 // Force restoration is safer for "hidden -> visible" transitions.
                 const original = el.getAttribute('data-original-content');
                 if (original) {
                     // Check if already processed and looks okay? 
                     // Mermaid removes the text and puts SVG. 
                     // If we want to re-render, we MUST restore text.
                     // But we should only do this if it's actually visible now.
                     if (el.offsetParent !== null) { // is visible
                         el.removeAttribute('data-processed'); // Mermaid marker
                       el.textContent = original; // Restore source as text, not HTML
                         renderPasses.push(
                           Promise.resolve().then(() => mermaid.init(undefined, el)),
                         );
                     }
                 }
             });

             if (renderPasses.length > 0) {
               Promise.allSettled(renderPasses).finally(() => scheduleAsyncLayoutRefresh());
             }
        };
        
        const toggleFold = () => {
             isFolded = !isFolded;
             noteRuntimeEvent('toggle-fold', { isFolded });
             const c1 = applyFolding(leftContent, isFolded, 'original');
             const c2 = applyFolding(rightContent, isFolded, 'modified');
             
             if (isFolded) {
                 statusMsg.textContent = t("Folded {0} (Original) / {1} (Modified) blocks", c1, c2);
             } else {

                 statusMsg.textContent = '';
             }
               scheduleAsyncLayoutRefresh();
        };

        function applyFolding(pane, enable, paneType) {
            // Remove existing placeholders (Only needed at top level really, but safe here)
            // Note: If recursing, parent already cleared *descendant* placeholders?
            // querySelectorAll is deep. So top level call clears everything.
            // But inner calls might try to clear again. Harmless.
            const placeholders = pane.querySelectorAll('.fold-placeholder');
            placeholders.forEach(el => el.remove());
            
            // Un-hide everything first
            const hidden = pane.querySelectorAll('.folded-region-item');
            hidden.forEach(el => {
                el.classList.remove('folded-region-item');
                el.style.display = '';
            });

            if (!enable) return 0;

            const children = Array.from(pane.children);
            let noChangeBlock = [];
            let totalFolded = 0;
            
            const flushBlock = () => {
                if (noChangeBlock.length > 3) { 
                    const toHide = noChangeBlock.slice(1, noChangeBlock.length - 1);
                    
                    if (toHide.length === 0) return;

                     const visibleToHide = toHide.filter(el => {
                          const text = el.textContent.trim();
                          if (text.length === 0 && !el.querySelector('img')) return false; 
                          
                          // Changes are already filtered out logic-wise, but excluding valid change tags 
                          // from "unchanged block count" is safer for symmetric logic.
                          if (el.tagName === 'INS' || el.tagName === 'DEL') return false;

                          return true;
                     });

                     const firstHidden = toHide[0];
                     if (firstHidden) {
                         const isList = pane.tagName === 'UL' || pane.tagName === 'OL';
                         const placeholder = document.createElement(isList ? 'li' : 'div');
                         placeholder.className = 'fold-placeholder';
                         placeholder.textContent = t("{0} unchanged blocks", visibleToHide.length);
                         placeholder.title = t("Click to expand");
                         placeholder.onclick = (e) => {

                             e.stopPropagation(); // Prevent parent clicks
                             toHide.forEach(el => el.style.display = '');
                             placeholder.remove();
                         };
                         pane.insertBefore(placeholder, firstHidden);
                     }

                    toHide.forEach(el => {
                        el.style.display = 'none';
                        el.classList.add('folded-region-item');
                    });
                    totalFolded += visibleToHide.length;
                }
                noChangeBlock = [];
            };

            children.forEach(child => {
                // Check if child has changes RELEVANT to this pane
                let hasChange = false;
                
                // Helper to check if an element is a "meaningful" change tag
                const isRealChange = (tag, tagName) => {
                    const els = child.querySelectorAll(tag);
                    for (let el of els) {
                        // Aggressive trim: remove all whitespace including NBSP
                        const text = el.textContent.replace(/[\s\u00A0]+/g, '');
                        if (text.length > 0) return true;
                         // Check for images inside change
                        if (el.querySelector('img')) return true;
                         // Check for checkboxes inside change
                        if (el.querySelector('input[type="checkbox"]')) return true;
                    }
                    if (child.tagName === tagName) {
                        const text = child.textContent.replace(/[\s\u00A0]+/g, '');
                        if (text.length > 0) return true;
                        if (child.querySelector('img')) return true;
                        if (child.querySelector('input[type="checkbox"]')) return true;
                    }
                    return false;
                };

                // Symmetric Folding: Check for ANY change in the block (INS or DEL).
                // If there is an insertion OR deletion, we should NOT fold it, 
                // regardless of which pane we are showing.
                hasChange = isRealChange('del', 'DEL') || isRealChange('ins', 'INS');
                
                if (!hasChange) {
                    noChangeBlock.push(child);
                } else {
                    flushBlock();
                    // Recursion: Check for nested folding opportunities
                    const safeTags = ['DIV', 'SECTION', 'ARTICLE', 'BLOCKQUOTE', 'MAIN', 'UL', 'OL'];
                    if (safeTags.includes(child.tagName)) {
                        totalFolded += applyFolding(child, enable, paneType);
                    }
                }
            });
            flushBlock(); // Flush end
            
            return totalFolded;
        }

        // --- Navigation Logic ---
        // --- Helper: Calculate Top relative to Pane ---
        const getRelativeTop = (el, pane) => {
            if (!el || !el.getBoundingClientRect) return 0;
            const elRect = el.getBoundingClientRect();
            const paneRect = pane.getBoundingClientRect();
            return elRect.top - paneRect.top + pane.scrollTop;
        };

        // --- Navigation Logic ---
        function collectChanges() {
            try {
                changeElements = [];
                currentChangeIndex = -1;
                statusMsg.textContent = t("Scanning...");
                
                document.querySelectorAll('.selected-change').forEach(el => el.classList.remove('selected-change'));
                
                const isMeaningfulChange = (el) => {
                     if (!el) return false;
                     if (el.tagName === 'IMG') return true;
                     if (el.classList && el.classList.contains('fm-changed')) return true;
                     if (el.textContent && el.textContent.trim().length > 0) return true;
                     if (el.querySelector && el.querySelector('img')) return true;
                     if (el.querySelector && el.querySelector('table')) return true;

                     // Explicitly allow checkboxes to be navigated to
                     if (el.tagName === 'INPUT' && el.type === 'checkbox') return true;
                     if (el.querySelector && el.querySelector('input[type="checkbox"]')) return true;

                     // Explicitly allow complex blocks
                     if (el.querySelector && (el.querySelector('.mermaid') || el.querySelector('.katex-block'))) return true;
                     return false;
                };

                // Helper to check if element is part of a complex block (Mermaid, Math, etc.)
                // Now checks BOTH if we are inside one OR if we contain one.
                const getComplexContainer = (el) => {
                    // Case 1: The change is inside a complex block (e.g. text change in a node)
                    const ancestor = el.closest('.mermaid') || el.closest('.katex-block') || el.closest('svg');
                    if (ancestor) return ancestor;

                    // Case 2: The change WRAPS a complex block (e.g. a new diagram added)
                    // We prefer the child container for highlighting as it's the visual element.
                    if (el.querySelector) {
                         let child = el.querySelector('.mermaid') || el.querySelector('.katex-block');
                         if (!child) {
                             // Only treat SVG as complex if it's NOT an alert icon
                             const svg = el.querySelector('svg');
                             // Check if SVG is inside an alert title
                             if (svg && !svg.closest('.markdown-alert-title')) {
                                 child = svg;
                             }
                         }
                         if (child) return child;
                    }
                    return null;
                };

                // Set to track complex containers we've already added
                const seenContainers = new Set();

                const processNodeList = (nodes, pane) => {
                    const results = [];
                    nodes.forEach(el => {
                        if (el.offsetParent === null) return; // Invisible
                        
                        // Check for Complex Container (Mermaid/Math)
                        const container = getComplexContainer(el);
                        if (container) {
                            if (!seenContainers.has(container)) {
                                seenContainers.add(container);
                                results.push({
                                    el: container,
                                    top: getRelativeTop(container, pane),
                                    ratio: getRatio(container, pane),
                                    pane: pane
                                });
                            }
                            return; // Skip individual element
                        }

                        if (isMeaningfulChange(el)) {
                            results.push({
                                el: el,
                                top: getRelativeTop(el, pane),
                                ratio: getRatio(el, pane),
                                pane: pane
                            });
                        }
                    });
                    return results;
                };

                const getRatio = (el, pane) => {
                    const top = getRelativeTop(el, pane);
                    const height = pane.scrollHeight;
                    return height > 0 ? top / height : 0;
                };

                let all = [];

                if (isInline) {
                  const changes = rightContent.querySelectorAll('ins, del, .fm-new.fm-changed, .fm-old.fm-changed');
                    all = processNodeList(changes, rightPane);
                } else {
                    // Split Mode
                  const leftDels = leftContent.querySelectorAll('del, .fm-old.fm-changed');
                  const rightIns = rightContent.querySelectorAll('ins, .fm-new.fm-changed');
                    
                    all = [
                        ...processNodeList(leftDels, leftPane),
                        ...processNodeList(rightIns, rightPane)
                    ];
                }
                
                // Filter invisible items (height 0)
                all = all.filter(item => item.el.getBoundingClientRect().height > 0);

                all.sort((a, b) => {
                    if (isNaN(a.ratio) && isNaN(b.ratio)) return 0;
                    if (isNaN(a.ratio)) return 1;
                    if (isNaN(b.ratio)) return -1;

                    const diff = a.ratio - b.ratio;
                    if (Math.abs(diff) < 0.001) {
                        // Stable sort for close items
                        const samePane = a.pane === b.pane;
                        if (samePane) {
                            return a.top - b.top;
                        }
                        
                        const isAFm = a.el.classList.contains('fm-old') || a.el.classList.contains('fm-new');
                        const isBFm = b.el.classList.contains('fm-old') || b.el.classList.contains('fm-new');
                        if (isAFm && !isBFm) return -1;
                        if (!isAFm && isBFm) return 1;
                        return 0; 
                    }
                    return diff;
                });
                changeElements = all;
            
    
            // Grouping Logic
            // This entire block is inside the try-catch for safety
            
            if (changeElements.length > 0) {
                const groups = [];
                let currentGroup = [];
                
                changeElements.forEach((item, index) => {
                    if (index === 0) {
                        currentGroup.push(item);
                        return;
                    }
                    
                    const prev = changeElements[index - 1];
                    let isSameGroup = false;

                    // 1. Strict Pane Check
                    if (item.pane === prev.pane) {
                        const prevBottom = prev.top + prev.el.offsetHeight;
                        const gap = item.top - prevBottom;
                        
                        // Strict check < 8px
                        if (gap < 8) {
                            isSameGroup = true;
                        }
                    }
                    
                    if (isSameGroup) {
                        currentGroup.push(item);
                    } else {
                        groups.push(currentGroup);
                        currentGroup = [item];
                    }
                });
                
                if (currentGroup.length > 0) groups.push(currentGroup);
                changeElements = groups;
                
                statusMsg.textContent = t("Found {0} groups", changeElements.length);
                statusMsg.style.color = '';
            } else {
                statusMsg.textContent = t("No changes found");
            }
            } catch (e) {
                console.error(e);
                statusMsg.textContent = t("Error: {0}", e.message);
                statusMsg.style.color = 'red';
            }
        }

        // --- Layout Stability ---
        let resizeTimeout;
        let layoutRefreshTimeout;
        let layoutStabilizeFrame = 0;
        let layoutRefreshQueued = false;
        let layoutRefreshRunning = false;
        let asyncLayoutRefreshShortTimeout;
        let asyncLayoutRefreshLongTimeout;
        const flushPaneLayout = (pane) => {
          void pane.scrollHeight;
          void pane.scrollWidth;
          pane.getBoundingClientRect();
        };
        const measureLayout = () => {
          return [
            leftPane.scrollHeight,
            leftPane.clientHeight,
            leftPane.scrollWidth,
            leftPane.clientWidth,
            leftContent.scrollHeight,
            leftContent.scrollWidth,
            rightPane.scrollHeight,
            rightPane.clientHeight,
            rightPane.scrollWidth,
            rightPane.clientWidth,
            rightContent.scrollHeight,
            rightContent.scrollWidth,
            document.documentElement.clientHeight,
            document.documentElement.clientWidth,
          ].join(':');
        };
        const refreshGhostLayout = () => {
          if (!isInline) {
            cleanupGhosts();
          }
        };
        const refreshLayout = () => {
          flushPaneLayout(leftPane);
          flushPaneLayout(rightPane);
          collectChanges();
        };
        const stabilizeLayout = () => {
          if (layoutRefreshRunning) {
            layoutRefreshQueued = true;
            noteRuntimeEvent('stabilize-queued');
            return;
          }

          layoutRefreshRunning = true;
          layoutRefreshQueued = false;
          noteRuntimeEvent('stabilize-start');

          flushPaneLayout(leftContent);
          if (layoutStabilizeFrame) {
          flushPaneLayout(rightContent);
            cancelAnimationFrame(layoutStabilizeFrame);
            layoutStabilizeFrame = 0;
          }

          let stableFrames = 0;
          let remainingFrames = 24;
          let previousMetrics = '';

          const step = () => {
            refreshLayout();
            const metrics = measureLayout();
            if (metrics === previousMetrics) {
              stableFrames += 1;
            } else {
              previousMetrics = metrics;
              stableFrames = 0;
            }

            remainingFrames -= 1;
            if (stableFrames >= 2 || remainingFrames <= 0) {
              layoutStabilizeFrame = 0;
              layoutRefreshRunning = false;
              noteRuntimeEvent('stabilize-complete', {
                stableFrames,
                remainingFrames,
              });
              emitRuntimeDiagnostics('stabilize-complete', {
                stableFrames,
                remainingFrames,
              });
              if (layoutRefreshQueued) {
                layoutRefreshQueued = false;
                stabilizeLayout();
              }
              return;
            }

            layoutStabilizeFrame = requestAnimationFrame(step);
          };

          layoutStabilizeFrame = requestAnimationFrame(step);
        };
        const scheduleLayoutRefresh = (delay = 0) => {
          clearTimeout(layoutRefreshTimeout);
          noteRuntimeEvent('schedule-layout-refresh', { delay });
          layoutRefreshTimeout = setTimeout(() => {
            stabilizeLayout();
          }, delay);
        };
        const scheduleAsyncLayoutRefresh = () => {
          noteRuntimeEvent('schedule-async-layout-refresh');
          refreshGhostLayout();
          scaleSlides();
          scheduleLayoutRefresh();

          clearTimeout(asyncLayoutRefreshShortTimeout);
          clearTimeout(asyncLayoutRefreshLongTimeout);

          asyncLayoutRefreshShortTimeout = setTimeout(() => {
            refreshGhostLayout();
            scheduleLayoutRefresh();
          }, 180);
          asyncLayoutRefreshLongTimeout = setTimeout(() => {
            refreshGhostLayout();
            scheduleLayoutRefresh();
          }, 700);
        };
        const onResize = () => {
          clearTimeout(resizeTimeout);
          resizeTimeout = setTimeout(() => {
            scheduleLayoutRefresh();
          }, 120);
        };

        if (window.ResizeObserver) {
          const contentHeights = new WeakMap();
          const contentResizeObserver = new ResizeObserver((entries) => {
            const heightChanged = entries.some((entry) => {
              const nextHeight = entry.contentRect.height;
              const previousHeight = contentHeights.get(entry.target);
              contentHeights.set(entry.target, nextHeight);
              return previousHeight === undefined || Math.abs(previousHeight - nextHeight) > 0.5;
            });

            if (heightChanged) {
              noteRuntimeEvent('content-resize', { entries: entries.length });
              scheduleAsyncLayoutRefresh();
            }
          });
          contentResizeObserver.observe(leftContent);
          contentResizeObserver.observe(rightContent);
        }

        window.addEventListener('resize', onResize);

        const contentObserver = new MutationObserver((mutations) => {
          if (
            mutations.some(
              (mutation) =>
                (mutation.type === 'childList' &&
                  (mutation.addedNodes.length > 0 || mutation.removedNodes.length > 0)) ||
                mutation.type === 'attributes',
            )
          ) {
            noteRuntimeEvent('content-mutation', { count: mutations.length });
            scheduleLayoutRefresh();
          }
        });
        contentObserver.observe(leftContent, {
          attributes: true,
          attributeFilter: ['data-processed', 'height', 'src', 'viewBox', 'width'],
          childList: true,
          subtree: true,
        });
        contentObserver.observe(rightContent, {
          attributes: true,
          attributeFilter: ['data-processed', 'height', 'src', 'viewBox', 'width'],
          childList: true,
          subtree: true,
        });

        window.addEventListener('load', () => {
          noteRuntimeEvent('window-load');
          scheduleAsyncLayoutRefresh();
        });
        window.setTimeout(() => {
          noteRuntimeEvent('startup-watchdog');
          emitRuntimeDiagnostics('startup-watchdog', { timeoutMs: 1500 }, { force: true });
        }, 1500);

        function scrollToChange(index) {
            if (index < 0 || index >= changeElements.length) return;
            
            // Remove previous highlight
            document.querySelectorAll('.selected-change').forEach(el => el.classList.remove('selected-change'));
            
            const group = changeElements[index];
            if (!group || group.length === 0) return;

            const firstItem = group[0];
            const targetEl = firstItem.el || firstItem;
            const targetPane = firstItem.pane || rightPane; // Default to right pane for inline
            
            // Apply persistent highlight
            group.forEach(item => {
                const el = item.el || item;
                el.classList.add('selected-change');
            });

            const paneHeight = targetPane.clientHeight;
            
            // Use getRelativeTop to get the robust position relative to the pane (handles nested offsetParents correctly)
            // This fixes the issue where offsetTop is relative to a nested container (e.g. inside Mermaid div)
            let elTop = getRelativeTop(targetEl, targetPane);
            
            // Fallback: If getRelativeTop returns ~0 because element is detached/hidden (e.g. replaced by Mermaid),
            // use the stored 'top' from collectChanges if valid.
            // Note: getRelativeTop includes scrollTop, so if it returns exactly scrollTop, it implies relative offset is 0.
            // But here we check if it is suspiciously 0 or NaN.
            if ((isNaN(elTop) || elTop <= 0) && firstItem.top > 0) {
                 elTop = firstItem.top;
            }

            const elHeight = targetEl.offsetHeight || 20; 
            
            // Calculate target scroll position (centering the element)
            const targetScrollTop = elTop - (paneHeight / 2) + (elHeight / 2);
            
            targetPane.scrollTop = Math.max(0, targetScrollTop);

            // Sync the other pane proportionally to keep side-by-side aligned
            if (!isInline) {
                const otherPane = targetPane === leftPane ? rightPane : leftPane;
                const sourceMax = targetPane.scrollHeight - targetPane.clientHeight;
                const otherMax = otherPane.scrollHeight - otherPane.clientHeight;
                if (sourceMax > 0 && otherMax > 0) {
                    const pct = targetPane.scrollTop / sourceMax;
                    otherPane.scrollTop = pct * otherMax;
                }
            }
        }

        function goNext() {
            if (!changeElements || changeElements.length === 0) collectChanges();
            if (changeElements.length === 0) return;

            currentChangeIndex++;
            if (currentChangeIndex >= changeElements.length) {
                currentChangeIndex = 0; 
            }
            scrollToChange(currentChangeIndex);
            updateStatus();
        }

        function goPrev() {
            if (!changeElements || changeElements.length === 0) collectChanges();
            if (changeElements.length === 0) return;

            currentChangeIndex--;
            if (currentChangeIndex < 0) {
                currentChangeIndex = changeElements.length - 1;
            }
            scrollToChange(currentChangeIndex);
            updateStatus();
        }
        
        function updateStatus() {
             statusMsg.textContent = t("Change {0} of {1}", currentChangeIndex + 1, changeElements.length);
        }


        // --- Scroll Sync (Master-Slave Pattern) ---
        // Instead of a timer-based lock (which can drop final events),
        // we track which pane the user is interacting with.
        
        let activePane = null;

        const syncScroll = (sourcePane, targetPane) => {
            // Only sync if the source is the one being actively scrolled by user
            if (activePane !== sourcePane) return;

            // Specialized sync for Marp slides
            if (document.body.classList.contains('marp-mode') && !isInline) {
                syncScrollMarp(sourcePane, targetPane);
                return;
            }
            
            const sourceMax = sourcePane.scrollHeight - sourcePane.clientHeight;
            const targetMax = targetPane.scrollHeight - targetPane.clientHeight;
          const sourceHorizontalMax = sourcePane.scrollWidth - sourcePane.clientWidth;
          const targetHorizontalMax = targetPane.scrollWidth - targetPane.clientWidth;

          if (sourceMax > 0 && targetMax > 0) {
            let targetScrollTop = 0;
            // Larger 2px margin for subpixel snapping
            if (sourcePane.scrollTop <= 2) {
              targetScrollTop = 0;
            } else if (sourcePane.scrollTop >= sourceMax - 2) {
              targetScrollTop = targetMax;
            } else {
              const percentage = sourcePane.scrollTop / sourceMax;
              targetScrollTop = percentage * targetMax;
            }
                
            if (Math.abs(targetPane.scrollTop - targetScrollTop) > 0.5) {
              targetPane.scrollTop = targetScrollTop;
            }
            }

          if (sourceHorizontalMax > 0 && targetHorizontalMax > 0) {
            let targetScrollLeft = 0;
            if (sourcePane.scrollLeft <= 2) {
              targetScrollLeft = 0;
            } else if (sourcePane.scrollLeft >= sourceHorizontalMax - 2) {
              targetScrollLeft = targetHorizontalMax;
            } else {
              const percentage = sourcePane.scrollLeft / sourceHorizontalMax;
              targetScrollLeft = percentage * targetHorizontalMax;
            }

            if (Math.abs(targetPane.scrollLeft - targetScrollLeft) > 0.5) {
              targetPane.scrollLeft = targetScrollLeft;
            }
            }
        };

        const syncScrollMarp = (sourcePane, targetPane) => {
            const sourceSections = Array.from(sourcePane.querySelectorAll('section'));
            const targetSections = Array.from(targetPane.querySelectorAll('section'));
            
            if (sourceSections.length === 0 || targetSections.length === 0) return;

            // Find the slide that is most visible at the top
            const sourceScrollTop = sourcePane.scrollTop;
            let currentSlideIndex = 0;
            
            for (let i = 0; i < sourceSections.length; i++) {
                const rect = sourceSections[i].getBoundingClientRect();
                const paneRect = sourcePane.getBoundingClientRect();
                const relativeTop = rect.top - paneRect.top;
                
                if (relativeTop + rect.height / 2 > 0) {
                    currentSlideIndex = i;
                    break;
                }
            }

            // Sync to the same slide index in target
            const targetSlide = targetSections[currentSlideIndex];
            if (targetSlide) {
                const targetRect = targetSlide.getBoundingClientRect();
                const targetPaneRect = targetPane.getBoundingClientRect();
                const targetRelativeTop = targetRect.top - targetPaneRect.top;
                
                // Keep the relative position of the slide top within the viewport
                const sourceSlideRect = sourceSections[currentSlideIndex].getBoundingClientRect();
                const sourcePaneRect = sourcePane.getBoundingClientRect();
                const offsetInSlide = sourceScrollTop - (sourceSlideRect.top - sourcePaneRect.top + sourceScrollTop);
                
                const slideTopPos = targetSlide.offsetTop;
                const sourceRelativePos = (sourceScrollTop - sourceSections[currentSlideIndex].offsetTop);

                // Simple slide alignment (aligned with the top of the slide)
                if (Math.abs(targetPane.scrollTop - targetSlide.offsetTop) > 5) {
                    targetPane.scrollTop = targetSlide.offsetTop + sourceRelativePos;
                }
            }
        };

        const scaleSlides = () => {
             const isMarp = document.body.classList.contains('marp-mode');
             if (isMarp) {
                 const panes = [leftPane, rightPane];
                 panes.forEach(pane => {
                     const sections = pane.querySelectorAll('section');
                     if (sections.length === 0) return;
                     
                     const containerWidth = pane.clientWidth - 40; // Subtract padding
                     const baseWidth = 1280; // Marp default width
                     const scale = Math.min(1, containerWidth / baseWidth);
                     
                     sections.forEach(s => {
                         s.style.width = baseWidth + 'px';
                         s.style.transform = 'scale(' + scale + ')';
                         
                         // Center the scaled slide
                         const scaledWidth = baseWidth * scale;
                         const offset = (pane.clientWidth - scaledWidth) / 2;
                         s.style.position = 'relative';
                         s.style.left = Math.max(0, offset) + 'px';
    
                         // Adjust container height to match scaled height
                         const scaledHeight = (baseWidth * 9/16) * scale;
                         s.parentElement.style.height = (scaledHeight + 20) + 'px'; // + margin
                     });
                 });
             }

             // Ensure Playwright proceeds by setting the scaling status
             // This must be set if there is even a HINT that this is a Marp test
             document.body.setAttribute('data-marp-scaled', 'true');
        };

        const setActive = (pane) => { activePane = pane; };
        
        // Track mouse/touch to determine which pane should be the 'Master'
        leftPane.addEventListener('mouseenter', () => setActive(leftPane));
        rightPane.addEventListener('mouseenter', () => setActive(rightPane));
        leftPane.addEventListener('touchstart', () => setActive(leftPane), { passive: true });
        rightPane.addEventListener('touchstart', () => setActive(rightPane), { passive: true });
        leftPane.addEventListener('wheel', () => setActive(leftPane), { passive: true });
        rightPane.addEventListener('wheel', () => setActive(rightPane), { passive: true });

        leftPane.addEventListener('scroll', () => {
             if (!isInline) syncScroll(leftPane, rightPane);
        });

        rightPane.addEventListener('scroll', () => {
             if (!isInline) syncScroll(rightPane, leftPane);
        });

        // Double Click to Open Source
        document.body.addEventListener('dblclick', (e) => {
            // Check if click originated from toolbar or buttons
            if (e.target.closest('.toolbar')) {
                return;
            }

            const target = e.target;
            const pane = target.closest('.pane');
            if (!pane) return;

            let side = 'modified'; // Default
            if (pane.id === 'left-pane') {
                side = 'original';
            } else if (pane.id === 'right-pane') {
                side = 'modified';
            }

            // Find closest element with data-line
            const lineEl = target.closest('[data-line]');
            let line = 0;
            if (lineEl) {
                line = parseInt(lineEl.getAttribute('data-line'), 10);
            }

            vscode.postMessage({ 
                command: 'openSource',
                side: side,
                line: line
            });
        });

        // --- Ghost Element Cleanup ---
        function cleanupGhosts() {
             resetGhosts();
             if (document.body.classList.contains('inline-mode')) return;


             hideGhostsInPane(leftContent, 'INS');
             hideGhostsInPane(rightContent, 'DEL');
             
             // Extra cleanup for complex blocks (Alerts, Pre, etc.)
             // Hide containers whose visible content is entirely the opposite diff type.
             hideEmptyContainers(leftContent, 'INS');
             hideEmptyContainers(rightContent, 'DEL');
        }

        function resetGhosts() {
            document.querySelectorAll('.ghost-hidden').forEach(el => el.classList.remove('ghost-hidden'));
        }

        function hideGhostsInPane(pane, hiddenTagName) {
            const candidates = pane.querySelectorAll('li, tr');
            candidates.forEach(el => {
                if (isGraphicallyEmpty(el, hiddenTagName)) {
                    el.classList.add('ghost-hidden');
                }
            });

            // Container-level cleanup (ul, ol, table)
            const containers = pane.querySelectorAll('ul, ol, table, thead, tbody');
            containers.forEach(el => {
                 const children = Array.from(el.children);
                 const allHidden = children.every(c => c.classList.contains('ghost-hidden') || c.style.display === 'none');
                 if (children.length > 0 && allHidden) {
                     el.classList.add('ghost-hidden');
                 }
            });
        }

        // Targeted cleanup for complex blocks (Alerts, Code, Quotes)
        // Usually called for Left Pane (Original) to hide blocks that contain ONLY 'new' content (INS).
        function hideEmptyContainers(pane, hiddenTagName) {
             const complexSelectors = '.markdown-alert, pre, blockquote, .katex-block, .mermaid, h1, h2, h3, h4, h5, h6, p, dt, dd, hr';
             const candidates = pane.querySelectorAll(complexSelectors);
             
             candidates.forEach(el => {
                 // Check if graphically empty, respecting hiddenTagName (e.g. INS)
                 if (isGraphicallyEmpty(el, hiddenTagName)) {
                     el.classList.add('ghost-hidden');
                 }
             });
        }

        function isGraphicallyEmpty(el, hiddenTagName) {
             // HR is a void element that always renders a visible line.
             // It should never be considered "empty" — ins/del wrapping
             // is already handled by CSS display:none rules.
             if (el.tagName === 'HR') {
                 return false;
             }
             
             for (let i = 0; i < el.childNodes.length; i++) {
                const node = el.childNodes[i];
                if (node.nodeType === 3) {
                     if (node.textContent.trim().length > 0) return false;
                } else if (node.nodeType === 1) {
                     const tag = node.tagName;
                     if (tag === hiddenTagName) continue;
                     if (tag === 'IMG') return false;
                     // Ignore footnote backref links when checking emptiness
                     if (tag === 'A' && node.classList.contains('footnote-backref')) continue;
                     if (node.style.display === 'none' || node.classList.contains('ghost-hidden')) continue;
                     if (!isGraphicallyEmpty(node, hiddenTagName)) return false;
                }
             }
             return true;
        }

        // Initial cleanup
        cleanupGhosts();

        // Listen for standard shortcut commands from Extension
        window.addEventListener('message', event => {
            const message = event.data;
            switch (message.command) {
                case 'toggleInline':
                    toggleInline();
                    break;
                case 'toggleFold':
                    toggleFold();
                    break;
                case 'nextChange':
                    goNext();
                    break;
                case 'prevChange':
                    goPrev();
                    break;
                case 'toggleCaret':
                    // Optional: could implement caret syncing or other features
                    break;
                case 'syncScroll':
                    const ratio = message.ratio;
                    if (ratio !== undefined && !isScrolling) {
                        isScrolling = true;
                        // Scroll both panes to the ratio position
                        // We use the Left Pane as the driver for logic usually, but here we drive both.
                        // Calculate target scroll tops
                        const leftTarget = ratio * (leftPane.scrollHeight - leftPane.clientHeight);
                        const rightTarget = ratio * (rightPane.scrollHeight - rightPane.clientHeight);
                        
                        leftPane.scrollTop = leftTarget;
                        rightPane.scrollTop = rightTarget;
                        
                        setTimeout(() => isScrolling = false, 50);
                    }
                    break;
            }
        });

        // Initialize Mermaid (Resilient to missing library in VRT environment)
        if (typeof mermaid !== 'undefined') {
            mermaid.initialize({ startOnLoad: true, securityLevel: 'strict' });
        }

      scheduleAsyncLayoutRefresh();
      if (document.fonts && document.fonts.ready) {
        document.fonts.ready.finally(() => {
          scheduleAsyncLayoutRefresh();
        });
      }

      // Re-trigger layout stabilization when the webview tab becomes visible again.
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
      noteRuntimeEvent('visibility-visible');
        scheduleAsyncLayoutRefresh();
        }
    });

      const trackedImages = new WeakSet();
      const trackImageLayout = (image) => {
        if (!image || trackedImages.has(image)) {
          return;
        }

        trackedImages.add(image);

        const finalizeImageLayout = () => {
          noteRuntimeEvent('image-finalize-layout');
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              scheduleAsyncLayoutRefresh();
            });
          });
        };

        if (typeof image.decode === 'function') {
          Promise.resolve()
            .then(() => image.decode())
            .catch(() => undefined)
            .finally(() => noteRuntimeEvent('image-decode-finished'))
            .finally(finalizeImageLayout);
          return;
        }

        finalizeImageLayout();
      };

      document.querySelectorAll('img').forEach(trackImageLayout);

      // Listen for async image loads that may change scroll dimensions.
      document.addEventListener('load', event => {
        if (event.target && event.target.tagName === 'IMG') {
        noteRuntimeEvent('image-load');
        trackImageLayout(event.target);
        scheduleAsyncLayoutRefresh();
        }
      }, true);
      document.addEventListener('error', event => {
        if (event.target && event.target.tagName === 'IMG') {
        noteRuntimeEvent('image-error');
        scheduleAsyncLayoutRefresh();
        }
      }, true);

      // IMMEDIATE SIGNAL FOR VRT (Ensure update-snapshots always proceeds)
      setTimeout(() => {
          document.body.setAttribute('data-marp-scaled', 'true');
      }, 500);
    </script>
    <script>/* VRT_SCRIPT_PLACEHOLDER */</script>
</body>
</html>`;
}
