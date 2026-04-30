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
  blameInfo?: {
    original?: any;
    modified?: any;
  },
  showGutterMarkers: boolean = true,
  showGitBlame: boolean = true,
  lineHoverDelay: number = 500,
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
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; base-uri 'none'; connect-src 'none'; form-action 'none'; style-src-elem ${cspSource} 'unsafe-inline'; style-src-attr 'unsafe-inline'; script-src 'nonce-${nonce}'; img-src ${cspSource} https: data:; font-src ${cspSource};">
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
            position: relative;
            z-index: 3000;
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
            padding: 0; /* Removed padding to fix sticky breadcrumbs */
            box-sizing: border-box;
            position: relative; /* Ensure offsetTop is relative to pane */
            background-color: var(--markdown-surface-background);
            color: var(--markdown-foreground);
            font-weight: normal;
            font-size: var(--markdown-base-font-size);
            line-height: var(--markdown-base-line-height);
        }

        .pane-content {
            padding: 20px 30px 20px 20px; /* Moved padding here */
            box-sizing: border-box;
            min-height: 100%;
        }
        .pane + .pane {
          border-left: 1px solid var(--vscode-panel-border);
        }
        .pane-content {
          position: relative;
          color: inherit;
          padding: 10px 20px;
          box-sizing: border-box;
          min-height: 100%;
        }
        body.show-gutter-markers .pane-content {
          padding-left: 24px; /* Room for markers only when enabled */
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

        /* Ensure block elements inside diff tags don't hide the diff background */
        body.inline-mode #right-pane :is(ins, del) :is(table, tr, th, td, h1, h2, h3, h4, h5, h6, section) {
            background-color: transparent !important;
        }

        body.show-gutter-markers .pane-content > :is(ins, del, *:has(ins), *:has(del)):not(.marp),
        /* Support Marp slides even when only inner content changed */
        body.show-gutter-markers.marp-mode .marp-slide-wrapper:has(ins, del, .fm-changed),
        /* Marp-mode gutter markers: Attached to wrappers */
        body.show-gutter-markers.marp-mode :is(ins:has(> .marp-slide-wrapper), del:has(> .marp-slide-wrapper)) {
            position: relative;
        }
        body.show-gutter-markers .pane-content > :is(ins, del, *:has(ins), *:has(del)):not(.marp)::after,
        /* Support Marp slides */
        body.show-gutter-markers.marp-mode .marp-slide-wrapper:has(ins, del, .fm-changed)::after,
        body.show-gutter-markers.marp-mode :is(ins:has(> .marp-slide-wrapper), del:has(> .marp-slide-wrapper))::after {
            content: "";
            position: absolute;
            left: -16px !important; /* Position in the gutter padding */
            top: 0;
            bottom: 0;
            width: 3px !important;
            border-radius: 0 2px 2px 0;
            z-index: 1000 !important;
            display: none; /* Hidden by default, enabled per-pane */
        }

        /* Pane Isolation: Strictly enforce one color per pane */
        
        /* 1. Left Pane: RED ONLY. Hide anything that doesn't have a deletion. */
        body.show-gutter-markers:not(.inline-mode) #left-pane .pane-content > ::after {
            display: none !important; /* Hide all markers in left pane by default */
        }
        body.show-gutter-markers:not(.inline-mode) #left-pane .pane-content > :is(del, *:has(del)):not(.marp)::after,
        body.show-gutter-markers:not(.inline-mode).marp-mode #left-pane .marp-slide-wrapper:has(del)::after,
        body.show-gutter-markers:not(.inline-mode).marp-mode #left-pane del:has(> .marp-slide-wrapper)::after {
            display: block !important;
            background-color: #ef4444 !important; /* Strictly Red */
        }

        /* 2. Right Pane: GREEN ONLY. Hide anything that doesn't have an insertion. */
        body.show-gutter-markers:not(.inline-mode) #right-pane .pane-content > ::after {
            display: none !important; /* Hide all markers in right pane by default */
        }
        body.show-gutter-markers:not(.inline-mode) #right-pane .pane-content > :is(ins, *:has(ins)):not(.marp)::after,
        body.show-gutter-markers:not(.inline-mode).marp-mode #right-pane .marp-slide-wrapper:has(ins, .fm-changed)::after,
        body.show-gutter-markers:not(.inline-mode).marp-mode #right-pane ins:has(> .marp-slide-wrapper)::after {
            display: block !important;
            background-color: #22c55e !important; /* Strictly Green */
        }

        /* 3. Inline Mode: Standard logic */
        body.show-gutter-markers.inline-mode .pane-content > :is(ins, *:has(ins):not(:has(del))):not(.marp)::after,
        body.show-gutter-markers.inline-mode.marp-mode :is(ins, .marp-slide-wrapper):has(ins):not(:has(del))::after {
            display: block !important;
            background-color: #22c55e !important;
        }
        body.show-gutter-markers.inline-mode .pane-content > :is(del, *:has(del):not(:has(ins))):not(.marp)::after,
        body.show-gutter-markers.inline-mode.marp-mode :is(del, .marp-slide-wrapper):has(del):not(:has(ins))::after {
            display: block !important;
            background-color: #ef4444 !important;
        }
        body.show-gutter-markers.inline-mode .pane-content > *:not(.marp):has(ins):has(del)::after,
        body.show-gutter-markers.inline-mode.marp-mode :is(ins, .marp-slide-wrapper):has(ins):has(del)::after {
            display: block !important;
            background-color: #3794ff !important;
        }
        
        /* Overview Ruler */
        .overview-ruler {
            position: fixed;
            right: 0;
            top: 30px; /* Below header */
            bottom: 0;
            width: 14px;
            background: rgba(127, 127, 127, 0.05);
            border-left: 1px solid var(--vscode-panel-border);
            z-index: 100;
            pointer-events: auto;
            cursor: pointer;
        }
        .overview-marker {
            position: absolute;
            left: 2px;
            right: 2px;
            /* height will be set via JS based on change area */
            min-height: 3px;
            z-index: 101;
            pointer-events: none;
        }
        .overview-marker.ins { background-color: rgba(34, 197, 94, 0.8); }
        .overview-marker.del { background-color: rgba(239, 68, 68, 0.8); }
        .overview-marker.ins.del { background-color: rgba(55, 148, 255, 0.8); }
        
        body.inline-mode .overview-ruler {
            top: 30px; /* Toolbar is 40px but header is hidden? Header is 30px. */
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
        blockquote {
            padding: 0 16px;
            margin: 0 0 var(--markdown-block-spacing) 0;
            border-left: 0.25em solid var(--vscode-textBlockQuote-border);
            color: var(--vscode-textBlockQuote-foreground);
            background-color: transparent;
        }

        /* Blame Tooltip */
        .blame-tooltip {
            position: absolute;
            z-index: 1000;
            background-color: var(--vscode-editorWidget-background);
            color: var(--vscode-editorWidget-foreground);
            border: 1px solid var(--vscode-editorWidget-border);
            padding: 8px 12px;
            border-radius: 4px;
            font-size: 11px;
            line-height: 1.4;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
            pointer-events: none;
            max-width: 280px;
            display: none;
            opacity: 0;
            transition: opacity 0.15s ease;
        }
        .blame-tooltip .blame-author { font-weight: 600; color: var(--vscode-textLink-foreground); }
        .blame-tooltip .blame-date { opacity: 0.7; margin-left: 8px; }
        .blame-tooltip .blame-msg { margin-top: 4px; display: block; border-top: 1px solid rgba(127, 127, 127, 0.2); padding-top: 4px; }

        /* Hover feedback for Blame info */
        body.show-git-blame [data-line] {
            transition: background-color 0.1s ease;
        }
        body.show-git-blame [data-line].hover-focused {
            cursor: help;
            background-color: var(--vscode-editor-hoverHighlightBackground, rgba(127, 127, 127, 0.1));
        }

        /* Ensure alerts don't inherit or double-up on blockquote borders */
        .markdown-alert {
            border-left: 0.25em solid;
            padding: 8px 16px;
            margin-bottom: 16px;
            background-color: var(--markdown-raised-background);
        }
        /* Guard against double vertical bars if alerts become nested during diffing */
        .markdown-alert .markdown-alert {
            border-left: none !important;
            padding-left: 0 !important;
            margin-bottom: 0 !important;
            background-color: transparent !important;
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
        /* Breadcrumbs */
        .breadcrumbs-bar {
            position: sticky;
            top: 0;
            z-index: 3000;
            background-color: var(--markdown-surface-background);
            /* Slightly more opaque for readability when sticky */
            border-bottom: 1px solid var(--vscode-panel-border);
            padding: 4px 12px;
            font-size: 11px;
            display: none !important;
            align-items: center;
            gap: 4px;
            color: var(--vscode-breadcrumb-foreground);
            min-height: 22px;
            overflow: hidden;
            white-space: nowrap;
            user-select: none;
        }
        .breadcrumb-item {
            cursor: pointer;
            padding: 2px 4px;
            border-radius: 3px;
            transition: background-color 0.1s;
        }
        .breadcrumb-item:hover {
            background-color: var(--vscode-toolbar-hoverBackground);
            color: var(--vscode-breadcrumb-focusForeground);
        }
        .breadcrumb-separator {
            opacity: 0.5;
            font-weight: normal;
        }

        /* Obsidian Styles */
        .obsidian-tag {
            background-color: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
            padding: 1px 6px;
            border-radius: 10px;
            font-size: 0.85em;
            cursor: pointer;
            display: inline-block;
            margin: 0 2px;
            transition: filter 0.1s;
        }
        .obsidian-tag:hover {
            filter: brightness(1.2);
        }
        
        .obsidian-embed {
            border: 1px solid var(--vscode-panel-border);
            border-radius: 4px;
            padding: 8px 12px;
            margin: 0.5em 0;
            background-color: var(--vscode-textCodeBlock-background);
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 8px;
            transition: border-color 0.1s;
        }
        .obsidian-embed:hover {
            border-color: var(--vscode-focusBorder);
        }
        .obsidian-embed-icon {
            font-size: 1.2em;
        }
        .obsidian-embed-link {
            font-weight: 500;
            color: var(--vscode-textLink-foreground);
        }
        
        mark {
            background-color: rgba(255, 235, 59, 0.4);
            color: inherit;
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
        body:not(.inline-mode) #left-pane ins { display: none !important; }
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
        body:not(.inline-mode) #left-pane h6 del,
        body:not(.inline-mode) #left-pane del.diff-block {
            border-bottom: none;
        }

        /* Right Pane (Modified): Hide deletions, show insertions in Green */
        body:not(.inline-mode) #right-pane del { display: none !important; }
        body:not(.inline-mode) #right-pane ins {
            background-color: rgba(34, 197, 94, 0.25); 
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
            background-color: rgba(34, 197, 94, 0.25); 
            border-bottom: 1px solid #22c55e;
        }

        ins.diffins a, 
        ins.diffins p, 
        ins.diffins li, 
        ins.diffins td,
        ins.diffins th,
        ins.diffins table,
        ins.diffins h1,
        ins.diffins h2,
        ins.diffins h3,
        ins.diffins h4,
        ins.diffins h5,
        ins.diffins h6,
        del.diffdel a,
        del.diffdel p,
        del.diffdel li,
        del.diffdel td,
        del.diffdel th,
        del.diffdel table,
        del.diffdel h1,
        del.diffdel h2,
        del.diffdel h3,
        del.diffdel h4,
        del.diffdel h5,
        del.diffdel h6 {
            background-color: transparent !important;
        }



        del.diffdel {
            background-color: rgba(248, 113, 113, 0.2); 
            border-bottom: 1px solid #ef4444;
        }
        del.diffdel a,
        del.diffdel p,
        del.diffdel li,
        del.diffdel td {
            background-color: transparent !important;
        }



        ins:has(.markdown-alert), del:has(.markdown-alert),
        ins:has(.katex-block), del:has(.katex-block),
        ins:has(.mermaid), del:has(.mermaid),
        ins:has(.footnote-item), del:has(.footnote-item),
        ins:has(li), del:has(li),
        ins:has(pre), del:has(pre),
        ins:has(table), del:has(table),
        ins:has(h1), del:has(h1),
        ins:has(h2), del:has(h2),
        ins:has(h3), del:has(h3),
        ins:has(h4), del:has(h4),
        ins:has(h5), del:has(h5),
        ins:has(h6), del:has(h6) {
            display: block;
            text-decoration: none;
            border: none !important;
            padding: 0 !important;
            margin: 0 !important;
            margin-bottom: var(--markdown-block-spacing);
        }

        /* Optimization for Marp slides: Do not force display: block or add margins, 
           as it breaks the precise SVG/Flexbox positioning of slide content. */
        .marp-mode :is(ins, del) :is(li, p, h1, h2, h3, h4, h5, h6) {
            margin-bottom: 0 !important;
        }
        .marp-mode :is(ins, del) {
            margin: 0 !important;
            padding: 0 !important;
            border-bottom: none !important; /* Marp layout handles highlights better without borders */
        }


        /* Container Borders for Block Diffs (Alerts, Code, Mermaid) */
        :is(.markdown-alert, .mermaid, pre):is(:has(ins), :has(del), :parent(ins), :parent(del), .diffins, .diffdel) {
            position: relative;
        }

        /* Opaque blocks get a full border if they contain or are part of a diff */
        /* NOTE: pre (code blocks) have granular line-level diffs, so we do NOT apply a
           monochrome full border when ins/del are present inside — the inline markers
           already convey the change. A border is only applied when the WHOLE block is
           new/deleted (i.e. the pre itself is wrapped in ins/del, handled elsewhere). */
        :is(.mermaid):is(:has(ins), :has(.diffins), :parent(:is(ins, .diffins))) {
            border: 1px solid rgba(34, 197, 94, 0.6);
        }
        :is(.mermaid):is(:has(del), :has(.diffdel), :parent(:is(del, .diffdel))) {
            border: 1px solid rgba(239, 68, 68, 0.6);
        }

        /* Alerts get their characteristic left bar colored, but NO full border to avoid double lines */
        :is(.markdown-alert):is(:has(ins), :has(.diffins), :parent(:is(ins, .diffins))) {
            /* Keep original semantic colors (Note:Blue, Warning:Yellow, etc.) */
        }
        :is(.markdown-alert):is(:has(del), :has(.diffdel), :parent(:is(del, .diffdel))) {
            /* Keep original semantic colors */
        }


        /* Math Block (KaTeX) Specifics: Keep it clean and transparent by default */
        .katex-block, .katex-display, .katex-display :not(ins, del, ins *, del *) {
            background-color: transparent !important;
        }


        /* EXCEPT for granular diffs inside the math! */
        .katex del.diffmod, .katex del.diffdel {
            background-color: rgba(239, 68, 68, 0.35) !important;
            display: inline-block !important;
        }
        .katex ins.diffmod, .katex ins.diffins {
            background-color: rgba(34, 197, 94, 0.35) !important;
            display: inline-block !important;
        }

        /* Ensure pane isolation for granular math diffs since they use !important */
        body:not(.inline-mode) #left-pane .katex ins.diffmod,
        body:not(.inline-mode) #left-pane .katex ins.diffins,
        body:not(.inline-mode) #left-pane .katex ins {
            display: none !important;
        }

        body:not(.inline-mode) #right-pane .katex del.diffmod,
        body:not(.inline-mode) #right-pane .katex del.diffdel,
        body:not(.inline-mode) #right-pane .katex del {
            display: none !important;
        }

        /* Refactored tints using background gradients to avoid pseudo-element conflicts */
        :is(.mermaid):is(:has(ins), :has(.diffins), :parent(:is(ins, .diffins))),
        :is(.markdown-alert):is(:parent(:is(ins, .diffins))) {
           background-image: linear-gradient(rgba(34, 197, 94, 0.1), rgba(34, 197, 94, 0.1));
           position: relative;
        }

        :is(.mermaid):is(:has(del), :has(.diffdel), :parent(:is(del, .diffdel))),
        :is(.markdown-alert):is(:parent(:is(del, .diffdel))) {
           background-image: linear-gradient(rgba(239, 68, 68, 0.1), rgba(239, 68, 68, 0.1));
           position: relative;
        }

        /* Remove the background overlays (::after) by default, enabled only for diffs */
        .markdown-alert::after, .mermaid::after, pre::after {
            display: none;
        }

        /* Granular line-level diff highlights inside code blocks */
        pre ins {
            background-color: rgba(74, 222, 128, 0.25);
            display: inline;
            text-decoration: none;
        }
        pre del {
            background-color: rgba(248, 113, 113, 0.25);
            display: inline;
            text-decoration: none;
        }

        /* Ensure text inside highlighted blocks is also transparency-friendly (if any parent still has bg) */
        :is(p, h1, h2, h3, h4, h5, h6, li, td):is(ins, .diffins, del, .diffdel) * {
            background-color: transparent !important;
        }





        ins:has(> h1, > h2, > h3, > h4, > h5, > h6, > p, > img, > table, > ul, > ol, > dl, > li, > blockquote, > div, > pre, > hr, > section, > details, > summary, > figure),
        del:has(> h1, > h2, > h3, > h4, > h5, > h6, > p, > img, > table, > ul, > ol, > dl, > li, > blockquote, > div, > pre, > hr, > section, > details, > summary, > figure) {
            display: block;
          width: fit-content;
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
        /* htmldiff uses .diffdel/.diffins for pure adds/removes, and .diffmod for "modified"
           blocks. All three should receive block-level styling when combined with .diff-block. */
        del.diffdel.diff-block, del.diffmod.diff-block,
        ins.diffins.diff-block, ins.diffmod.diff-block {
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
        del.diffdel.diff-block, del.diffmod.diff-block {
            background-color: rgba(248, 113, 113, 0.2); 
            border-color: rgba(239, 68, 68, 0.6);
        }
        ins.diffins.diff-block, ins.diffmod.diff-block {
            background-color: rgba(74, 222, 128, 0.2); 
            border-color: rgba(34, 197, 94, 0.6);
        }

        /* Let the red/green tint of a diff-block container show through table cells.
           table, th, and striped rows have opaque background colors that would otherwise
           completely cover the parent del/ins background. */
        :is(del.diffdel, del.diffmod, ins.diffins, ins.diffmod).diff-block table,
        :is(del.diffdel, del.diffmod, ins.diffins, ins.diffmod).diff-block th,
        :is(del.diffdel, del.diffmod, ins.diffins, ins.diffmod).diff-block tbody tr {
            background-color: transparent !important;
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
        body:not(.inline-mode) #left-pane  li[data-all-inserted],
        body:not(.inline-mode) #right-pane li[data-all-deleted]  { display: none !important; }

        /* Ensure block insertions/deletions in lists have visible background colors */
        li[data-all-inserted] {
            background-color: rgba(34, 197, 94, 0.25) !important;
            width: fit-content;
            max-width: 100%;
        }
        li[data-all-deleted] {
            background-color: rgba(248, 113, 113, 0.2) !important;
            text-decoration: line-through;
            width: fit-content;
            max-width: 100%;
        }

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
            /* Removed overflow: hidden to allow diff markers to be visible in the gutter */
            overflow: visible !important;
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
        
        .marp-mode :is(ins, del).diff-block {
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

        /* Ensure list items and other blocks show full-width highlight when they contain a selected change */
        :is(li, dt, dd, tr):has(.selected-change) {
            background-color: rgba(255, 200, 0, 0.3) !important;
            box-shadow: 0 0 0 3px rgba(255, 200, 0, 0.8);
            border-radius: 2px;
        }
        /* Suppress the inner highlight if the container is already highlighted */
        :is(li, dt, dd, tr):has(.selected-change) .selected-change {
            background-color: transparent !important;
            box-shadow: none !important;
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

        /* Simplified Quick Edit Styles: 
           Exclude content within <del> tags (v1-only) as it's not editable. 
           In Split mode, #right-pane only has v2 anyway, but in Inline mode it has both. */
        #right-pane [data-line]:not(del [data-line]):not(del).hover-focused {
            outline: 2px dashed rgba(255, 165, 0, 0.4);
            outline-offset: 2px;
            cursor: pointer;
            position: relative;
        }

        /* Table-specific Fix: structural tags should not be position:relative 
           as it disrupts table layout in some browsers. Also avoid pseudo-elements 
           on tr/table as they are treated as children and break column alignment. */
        #right-pane :is(table, thead, tbody, tr)[data-line].hover-focused {
            position: static !important;
        }
        #right-pane :is(table, thead, tbody, tr)[data-line].hover-focused::before {
            display: none !important;
        }

        /* Group GitHub Alerts as a single unit for Quick Edit */
        .markdown-alert.hover-focused [data-line] {
            outline: none !important;
        }
        .markdown-alert.hover-focused [data-line]::before {
            display: none !important;
        }

        #right-pane [data-line]:not(del [data-line]):not(del).hover-focused::before {
            content: "✎ Line " attr(data-line);
            position: absolute;
            top: -18px;
            right: 0;
            background-color: rgba(255, 165, 0, 0.8);
            color: white;
            font-size: 10px;
            padding: 0 4px;
            border-radius: 2px;
            pointer-events: none;
            z-index: 100;
        }

        .block-editor-overlay {
            position: absolute;
            z-index: 10000;
            background-color: var(--markdown-surface-background);
            border: 1px solid var(--vscode-focusBorder);
            box-shadow: 0 4px 15px rgba(0, 0, 0, 0.5);
            border-radius: 4px;
            display: flex;
            flex-direction: column;
            padding: 8px;
            gap: 8px;
            animation: fadeIn 0.2s ease-out;
        }
        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(-5px); }
            to { opacity: 1; transform: translateY(0); }
        }
        .block-editor-textarea {
            background-color: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
            font-family: var(--vscode-editor-font-family);
            font-size: var(--vscode-editor-font-size);
            border: 1px solid var(--vscode-panel-border);
            padding: 8px;
            resize: vertical;
            min-height: 80px;
            min-width: 300px;
            outline: none;
        }
        .block-editor-textarea:focus {
            border-color: var(--vscode-focusBorder);
        }
        .block-editor-actions {
            display: flex;
            justify-content: flex-end;
            gap: 8px;
        }
        .block-editor-btn {
            padding: 4px 12px;
            font-size: 12px;
            cursor: pointer;
            border-radius: 2px;
            border: 1px solid transparent;
        }
        .block-editor-save {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
        }
        .block-editor-save:hover {
            background-color: var(--vscode-button-hoverBackground);
        }
        .block-editor-cancel {
            background-color: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
        }
        .block-editor-cancel:hover {
            background-color: var(--vscode-button-secondaryHoverBackground);
        }

        /* Image Comparison Enhancements */
        .image-diff-block {
            margin: 1em 0;
            margin-bottom: var(--markdown-block-spacing);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 4px;
            overflow: hidden;
            background-color: var(--vscode-textCodeBlock-background, var(--markdown-raised-background));
            position: relative;
            z-index: 1500;
            display: flex;
            flex-direction: column;
            width: 100%;
        }
        .image-diff-wrapper {
            position: relative;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100px;
            overflow: hidden;
            padding: 20px;
            background-image: 
                linear-gradient(45deg, rgba(128, 128, 128, 0.1) 25%, transparent 25%),
                linear-gradient(-45deg, rgba(128, 128, 128, 0.1) 25%, transparent 25%),
                linear-gradient(45deg, transparent 75%, rgba(128, 128, 128, 0.1) 75%),
                linear-gradient(-45deg, transparent 75%, rgba(128, 128, 128, 0.1) 75%);
            background-size: 20px 20px;
            background-position: 0 0, 0 10px, 10px -10px, -10px 0px;
        }
        .image-diff-wrapper img {
            max-width: 100%;
            height: auto;
            display: block;
            object-fit: contain;
            box-sizing: border-box;
        }
        
        /* Ensure the diff block itself is centered even if wrapped in ins/del */
        ins:has(.image-diff-block), del:has(.image-diff-block) {
            margin-left: auto !important;
            margin-right: auto !important;
            display: block !important;
            width: 100% !important;
        }
        
        /* Diff Coloring for Interactive Blocks - Applied only in Side-by-Side mode */
        .image-diff-block[data-mode="side-by-side"] .diff-image-old img,
        body:not(.inline-mode) #left-pane .image-diff-block .diff-image-old img {
            border: 4px solid rgba(239, 68, 68, 0.6);
            background-color: rgba(239, 68, 68, 0.1);
            padding: 4px;
        }
        .image-diff-block[data-mode="side-by-side"] .diff-image-new img {
            border: 4px solid rgba(34, 197, 94, 0.6);
            background-color: rgba(34, 197, 94, 0.1);
            padding: 4px;
        }
        
        /* Pane-specific hiding for Side-by-Side Mode in Split View */
        /* Only hide the 'other' image if we are in side-by-side mode (or mode not yet set) */
        body:not(.inline-mode) #left-pane .image-diff-block:not([data-mode="swipe"]):not([data-mode="onion-skin"]) .diff-image-new { display: none !important; }
        body:not(.inline-mode) #right-pane .image-diff-block:not([data-mode="swipe"]):not([data-mode="onion-skin"]) .diff-image-old { display: none !important; }
        
        /* Ensure the current side's image is always visible in its pane */
        body:not(.inline-mode) #right-pane .image-diff-block .diff-image-new { display: flex !important; align-items: center; justify-content: center; }
        body:not(.inline-mode) #left-pane .image-diff-block .diff-image-old { display: flex !important; align-items: center; justify-content: center; }
        
        /* UX Refinement: In Split View, Left Pane always shows v1 and hides controls */
        /* Image controls are hidden by default in left pane (always), 
           and hidden by default in right pane until hover. */
        body:not(.inline-mode) #left-pane .image-diff-controls { display: none !important; }
        #right-pane .image-diff-controls,
        body.inline-mode #right-pane .image-diff-controls {
            opacity: 0.6;
            transition: opacity 0.2s ease;
        }
        #right-pane .image-diff-block:hover .image-diff-controls,
        body.inline-mode #right-pane .image-diff-block:hover .image-diff-controls {
            opacity: 1;
        }


        body:not(.inline-mode) #left-pane .image-diff-block .diff-image-old { 
            display: flex !important; 
            align-items: center !important;
            justify-content: center !important;
            opacity: 1 !important; 
            clip-path: none !important; 
            position: static !important; 
            transform: none !important; 
        }
        body:not(.inline-mode) #left-pane .image-diff-wrapper { 
            height: auto !important; 
            display: flex !important; 
            min-height: 100px !important;
        }
        
        /* Reset and display for image comparison containers */
        .image-diff-block .diff-image-old, 
        .image-diff-block .diff-image-new {
            display: flex !important;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            text-align: center;
            flex: 1;
            min-width: 200px;
            background-color: transparent !important;
            border: none !important;
            padding: 0 !important;
            margin: 0 !important;
            text-decoration: none !important;
        }
        
        .diff-image-old::before, .diff-image-new::before {
            display: none !important;
        }

        /* Mode: Onion Skin / Swipe */
        .image-diff-block[data-mode="onion-skin"] .image-diff-wrapper,
        .image-diff-block[data-mode="swipe"] .image-diff-wrapper {
            display: block;
            height: 400px; /* Fallback height for overlay modes */
        }
        
        .image-diff-block[data-mode="onion-skin"] .diff-image-old,
        .image-diff-block[data-mode="onion-skin"] .diff-image-new,
        .image-diff-block[data-mode="swipe"] .diff-image-old,
        .image-diff-block[data-mode="swipe"] .diff-image-new {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            margin: 0;
        }
        
        .image-diff-block[data-mode="onion-skin"] .diff-image-new {
            z-index: 10;
        }
        .image-diff-block[data-mode="onion-skin"] .diff-image-old {
            z-index: 5;
        }

        .image-diff-block[data-mode="swipe"] .diff-image-new {
            z-index: 10;
            overflow: hidden;
        }
        .image-diff-block[data-mode="swipe"] .diff-image-old {
            z-index: 5;
        }

        /* Controls UI */
        .image-diff-controls {
            display: flex;
            align-items: center;
            gap: 15px;
            padding: 8px 12px;
            background-color: var(--vscode-editorWidget-background);
            border-bottom: 1px solid var(--vscode-panel-border);
            font-size: 11px;
            user-select: none;
            z-index: 100;
            order: -1; /* Appear at the top */
        }
        /* Light mode adjustment for backdrop */
        body.vscode-light .image-diff-controls {
            background-color: var(--vscode-editorWidget-background);
            border-bottom: 1px solid var(--vscode-panel-border);
        }

        .image-diff-tabs {
            display: flex;
            background-color: var(--vscode-editorWidget-background);
            border-radius: 4px;
            padding: 2px;
            border: 1px solid var(--vscode-panel-border);
        }
        .image-diff-tab {
            padding: 3px 8px;
            cursor: pointer;
            border-radius: 3px;
            color: var(--vscode-descriptionForeground);
        }
        .image-diff-tab:hover {
            color: var(--vscode-foreground);
            background-color: var(--vscode-toolbar-hoverBackground);
        }
        .image-diff-tab.active {
            background-color: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
        }
        
        .image-diff-slider-container {
            display: none; /* Shown via JS when active */
            align-items: center;
            gap: 8px;
            flex-grow: 1;
        }
        .image-diff-slider {
            flex-grow: 1;
            margin: 0;
            height: 4px;
        }
        .image-diff-label {
            min-width: 30px;
            text-align: right;
            opacity: 0.8;
            font-variant-numeric: tabular-nums;
        }

        .image-diff-divider {
            position: absolute;
            top: 0;
            bottom: 0;
            width: 2px;
            background-color: var(--vscode-button-background);
            z-index: 100;
            pointer-events: none;
            box-shadow: 0 0 8px rgba(0,0,0,0.5);
        }

         /* Complex block styling consolidated above */

        
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

        /* GitHub Alerts (Admonitions) styling consolidated above */

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

        .jump-highlight {
            animation: jump-highlight-fade 1.5s ease-out;
        }
        @keyframes jump-highlight-fade {
            0% { background-color: var(--vscode-editor-hoverHighlightBackground, rgba(127, 127, 127, 0.3)); }
            100% { background-color: transparent; }
        }
    </style>
</head>
<body class="VRT_LAYOUT_CLASS ${marpCss ? "marp-mode" : ""} ${showGutterMarkers ? "show-gutter-markers" : ""} ${showGitBlame ? "show-git-blame" : ""}">
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
            <div id="left-breadcrumbs" class="breadcrumbs-bar"></div>
            <div class="pane-content" id="left-content">
                ${diffHtml}
            </div>
        </div>
        <div class="pane ${marpCss ? "marp marpit" : ""}" id="right-pane">
            <div id="right-breadcrumbs" class="breadcrumbs-bar"></div>
            <div class="pane-content" id="right-content">
                ${diffHtml}
            </div>
        </div>
    </div>
    <div class="overview-ruler" id="left-overview-ruler"></div>
    <div class="overview-ruler" id="right-overview-ruler"></div>
    <div id="blame-tooltip" class="blame-tooltip"></div>
    <script nonce="${nonce}">
        window.vscode = acquireVsCodeApi();
    </script>
    <script nonce="${nonce}">
        const vscode = window.vscode;
        const blameInfo = ${JSON.stringify(blameInfo || {})};
        const lineHoverDelay = ${lineHoverDelay};
        const translations = ${JSON.stringify(translations)};
        const t = (key, ...args) => {
            let text = translations[key] || key;
            args.forEach((arg, i) => {
                text = text.replace('{' + i + '}', String(arg));
            });
            return text;
        };

        const leftPane = document.getElementById('left-pane');
        const rightPane = document.getElementById('right-pane');
        const leftContent = document.getElementById('left-content');
        const rightContent = document.getElementById('right-content');
        const leftRuler = document.getElementById('left-overview-ruler');
        const rightRuler = document.getElementById('right-overview-ruler');
        const leftBreadcrumbs = document.getElementById('left-breadcrumbs');
        const rightBreadcrumbs = document.getElementById('right-breadcrumbs');
        const statusMsg = document.getElementById('status-msg');

        // --- Obsidian Handlers ---
        window.handleTagClick = (e, tag) => {
            e.stopPropagation();
            vscode.postMessage({ command: 'searchTag', tag: '#' + tag });
        };
        
        window.handleEmbedClick = (e, page) => {
            e.stopPropagation();
            vscode.postMessage({ 
                command: 'openSource', 
                side: 'modified', // Default to modified side for embeds
                page: page 
            });
        };

        // --- Jump to Element Support ---
        const jumpToElement = (pane, selector, text) => {
             const els = pane.querySelectorAll(selector);
             for (const el of els) {
                 if (el.textContent.trim() === text) {
                     pane.scrollTop = getRelativeTop(el, pane) - 40; // Subtract some buffer for header
                     return;
                 }
             }
        };

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
            updateOverviewRulerVisibility();
            updateBreadcrumbs(leftPane, leftBreadcrumbs);
            updateBreadcrumbs(rightPane, rightBreadcrumbs);
        };

        const updateOverviewRulerVisibility = () => {
            if (isInline) {
                leftRuler.style.display = 'none';
                rightRuler.style.width = '14px';
                rightRuler.style.left = 'auto';
                rightRuler.style.right = '0';
            } else {
                leftRuler.style.display = 'block';
                leftRuler.style.left = 'calc(50% - 14px)';
                leftRuler.style.right = 'auto';
                rightRuler.style.display = 'block';
                rightRuler.style.left = 'auto';
                rightRuler.style.right = '0';
            }
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
                        const text = el.textContent.replace(/[\\s\\u00A0]+/g, '');
                        if (text.length > 0) return true;
                         // Check for images inside change
                        if (el.querySelector('img')) return true;
                         // Check for checkboxes inside change
                        if (el.querySelector('input[type="checkbox"]')) return true;
                    }
                    if (child.tagName === tagName) {
                        const text = child.textContent.replace(/[\\s\\u00A0]+/g, '');
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
                    const isMarpMode = document.body.classList.contains('marp-mode');
                    nodes.forEach(el => {
                        // In Marp mode, elements inside sections might have null offsetParent due to 
                        // scaling or transformations. Check visibility more leniently.
                        if (el.offsetParent === null) {
                            if (!isMarpMode || !el.closest('.marp-slide-wrapper')) return;
                        }
                        
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
                        const prevRect = prev.el.getBoundingClientRect();
                        const prevBottom = prev.top + prevRect.height;
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
            updateOverviewRuler();
        }

        function updateOverviewRuler() {
            const drawRuler = (pane, ruler, groups) => {
                ruler.innerHTML = '';
                const paneHeight = pane.scrollHeight;
                if (paneHeight <= 0) return;

                groups.forEach(group => {
                    let minTop = Infinity;
                    let maxBottom = -Infinity;
                    let hasIns = false;
                    let hasDel = false;

                    group.forEach(item => {
                        const t = item.top;
                        const elRect = item.el.getBoundingClientRect();
                        const b = t + elRect.height;
                        if (t < minTop) minTop = t;
                        if (b > maxBottom) maxBottom = b;
                        
                        const el = item.el;
                        if (el.tagName === 'INS' || el.classList.contains('ins') || el.classList.contains('diffins') || el.classList.contains('fm-new')) {
                            hasIns = true;
                        }
                        if (el.tagName === 'DEL' || el.classList.contains('del') || el.classList.contains('diffdel') || el.classList.contains('fm-old')) {
                            hasDel = true;
                        }
                    });

                    if (minTop === Infinity) return;

                    const height = maxBottom - minTop;
                    const marker = document.createElement('div');
                    marker.className = 'overview-marker';
                    if (hasIns && hasDel) {
                        marker.classList.add('ins', 'del');
                    } else if (hasIns) {
                        marker.classList.add('ins');
                    } else if (hasDel) {
                        marker.classList.add('del');
                    }

                    const topPct = (minTop / paneHeight) * 100;
                    const heightPct = (height / paneHeight) * 100;

                    marker.style.top = topPct + '%';
                    marker.style.height = heightPct + '%';
                    ruler.appendChild(marker);
                });
            };

            if (isInline) {
                drawRuler(rightPane, rightRuler, changeElements);
            } else {
                const leftGroups = changeElements.filter(g => g.length > 0 && g[0].pane === leftPane);
                const rightGroups = changeElements.filter(g => g.length > 0 && g[0].pane === rightPane);
                drawRuler(leftPane, leftRuler, leftGroups);
                drawRuler(rightPane, rightRuler, rightGroups);
            }
        }

        const handleRulerClick = (e, pane) => {
            const ruler = e.currentTarget;
            const rect = ruler.getBoundingClientRect();
            const clickY = e.clientY - rect.top;
            const pct = clickY / rect.height;
            pane.scrollTop = pct * (pane.scrollHeight - pane.clientHeight);
        };

        leftRuler.addEventListener('click', (e) => handleRulerClick(e, leftPane));
        rightRuler.addEventListener('click', (e) => handleRulerClick(e, rightPane));

        // --- Blame Tooltip Logic ---
        const tooltip = document.getElementById('blame-tooltip');
        let tooltipTimeout;
        let hoverTimeout;

        const showBlame = (e) => {
            // Ignore interactive areas
            if (e.target.closest('.image-diff-controls') || e.target.closest('.toolbar') || e.target.closest('.breadcrumbs-bar')) {
                return;
            }

            const el = e.currentTarget;
            const line = el.getAttribute('data-line');
            if (line === null) return;

            clearTimeout(hoverTimeout);
            hoverTimeout = setTimeout(() => {
                // Apply focus class to trigger CSS effects (highlight, edit indicator)
                el.classList.add('hover-focused');
                const alert = el.closest('.markdown-alert');
                if (alert) alert.classList.add('hover-focused');

                // Check if Git Blame is enabled via setting class on body
                if (!document.body.classList.contains('show-git-blame')) {
                    return;
                }

                const pane = el.closest('#left-pane') ? 'original' : 'modified';
                const info = blameInfo[pane]?.lines?.[parseInt(line, 10) + 1]; // porcelain is 1-indexed

                if (info) {
                    clearTimeout(tooltipTimeout);
                    const date = new Date(info.authorTime * 1000).toLocaleDateString();
                    tooltip.innerHTML = \`<span class="blame-author">\${info.author}</span><span class="blame-date">\${date}</span><span class="blame-msg">\${info.summary}</span>\`;
                    tooltip.style.display = 'block';
                    
                    // Position relative to mouse
                    const x = Math.min(window.innerWidth - 300, e.clientX + 15);
                    const y = e.clientY + 15;
                    tooltip.style.left = x + 'px';
                    tooltip.style.top = y + 'px';
                    
                    requestAnimationFrame(() => tooltip.style.opacity = '1');
                }
            }, lineHoverDelay);
        };

        const hideBlame = (e) => {
            clearTimeout(hoverTimeout);
            const el = e.currentTarget;
            el.classList.remove('hover-focused');
            const alert = el.closest('.markdown-alert');
            if (alert) alert.classList.remove('hover-focused');

            tooltip.style.opacity = '0';
            tooltipTimeout = setTimeout(() => {
                tooltip.style.display = 'none';
            }, 150);
        };

        // Attach to all elements with data-line
        const attachBlameEvents = () => {
             document.querySelectorAll('[data-line]').forEach(el => {
                 el.removeEventListener('mouseenter', showBlame);
                 el.addEventListener('mouseenter', showBlame);
                 el.removeEventListener('mouseleave', hideBlame);
                 el.addEventListener('mouseleave', hideBlame);
             });
        };

        // MutationObserver is already looking at content, we can trigger re-attach there or in layout refresh
        const originalCollectChanges = collectChanges;
        collectChanges = () => {
            originalCollectChanges();
            attachBlameEvents();
        };

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

            const elHeight = targetEl.getBoundingClientRect().height || 20; 
            if (targetEl.tagName === 'SECTION') {
                // For Marp sections, ensure we use the visual height
            }
            
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

            // Force immediate breadcrumb update after jump
            updateBreadcrumbs(targetPane, targetPane === leftPane ? leftBreadcrumbs : rightBreadcrumbs);
            if (!isInline) {
                const otherPane = targetPane === leftPane ? rightPane : leftPane;
                updateBreadcrumbs(otherPane, otherPane === leftPane ? leftBreadcrumbs : rightBreadcrumbs);
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
            if (!activePane) activePane = sourcePane; 
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
            const paneRect = sourcePane.getBoundingClientRect();
            
            for (let i = 0; i < sourceSections.length; i++) {
                const rect = sourceSections[i].getBoundingClientRect();
                const relativeTop = rect.top - paneRect.top;
                
                // If the slide center is below the top of the viewport, it's our current slide
                // Or if it's the last slide, we must pick it.
                if (relativeTop + rect.height / 2 > 0 || i === sourceSections.length - 1) {
                    currentSlideIndex = i;
                    break;
                }
            }

            // Sync to the same slide index in target
            if (currentSlideIndex >= 0 && currentSlideIndex < targetSections.length) {
                const sourceSlide = sourceSections[currentSlideIndex];
                const targetSlide = targetSections[currentSlideIndex];
                
                const sourceSlideTop = getRelativeTop(sourceSlide, sourcePane);
                const sourceRelativePosInSlide = sourceScrollTop - sourceSlideTop;
                
                const targetSlideTop = getRelativeTop(targetSlide, targetPane);
                const desiredScrollTop = targetSlideTop + sourceRelativePosInSlide;

                if (Math.abs(targetPane.scrollTop - desiredScrollTop) > 0.5) {
                    targetPane.scrollTop = desiredScrollTop;
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

        const updateBreadcrumbs = (pane, container) => {
            if (document.body.classList.contains('marp-mode')) {
                container.style.display = 'none';
                return;
            }
            container.style.display = 'flex';
            
            const headings = Array.from(pane.querySelectorAll('h1, h2, h3, h4, h5, h6'))
                .filter(el => el.offsetParent !== null);
            
            if (headings.length === 0) {
                container.innerHTML = '<span class="breadcrumb-item">' + t("No headings") + '</span>';
                return;
            }

            let activeHeading = null;
            // Use a larger threshold (1/4 of viewport) so that if we jump to a diff
            // near a heading, it still picks up that heading context.
            const threshold = pane.clientHeight / 4; 
            
            for (let i = headings.length - 1; i >= 0; i--) {
                const el = headings[i];
                const top = getRelativeTop(el, pane);
                if (top - pane.scrollTop <= threshold) {
                    activeHeading = el;
                    break;
                }
            }

            if (!activeHeading) {
                // Before first heading
                container.innerHTML = '<span class="breadcrumb-item" onclick="' + pane.id + '.scrollTop = 0">' + t("Top") + '</span>';
                return;
            }

            // Build path
            const path = [activeHeading];
            const activeLevel = parseInt(activeHeading.tagName[1], 10);
            let currentLevel = activeLevel;

            // Search backwards for parents
            const headIdx = headings.indexOf(activeHeading);
            for (let i = headIdx - 1; i >= 0; i--) {
                const h = headings[i];
                const level = parseInt(h.tagName[1], 10);
                if (level < currentLevel) {
                    path.unshift(h);
                    currentLevel = level;
                }
                if (currentLevel === 1) break;
            }

            container.innerHTML = '';
            path.forEach((h, i) => {
                if (i > 0) {
                    const sep = document.createElement('span');
                    sep.className = 'breadcrumb-separator';
                    sep.textContent = '›';
                    container.appendChild(sep);
                }
                const item = document.createElement('span');
                item.className = 'breadcrumb-item';
                item.textContent = h.innerText.replace(/[\\n\\t]/g, ' ').trim();
                item.onclick = (e) => {
                    e.stopPropagation();
                    const targetTop = getRelativeTop(h, pane);
                    pane.scrollTop = targetTop - 5; 
                };
                container.appendChild(item);
            });
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
             updateBreadcrumbs(leftPane, leftBreadcrumbs);
        });

        rightPane.addEventListener('scroll', () => {
             if (!isInline) syncScroll(rightPane, leftPane);
             updateBreadcrumbs(rightPane, rightBreadcrumbs);
        });

        // Double Click to Open Source (Whole File)
        document.body.addEventListener('dblclick', (e) => {
            // Check if click originated from toolbar or buttons
            if (e.target.closest('.toolbar') || e.target.closest('.block-editor-overlay')) {
                return;
            }

            const target = e.target;
            const pane = target.closest('.pane');
            if (!pane) return;

            let side = pane.id === 'left-pane' ? 'original' : 'modified';

            // Find closest element with data-line
            const lineEl = target.closest('[data-line]');
            if (!lineEl) return;
            
            const lineStart = parseInt(lineEl.getAttribute('data-line'), 10);

            vscode.postMessage({ 
                command: 'openSource',
                side: side,
                line: lineStart
            });
        });

        // Single Click for Quick Edit (Modified Pane only)
        document.body.addEventListener('click', (e) => {
            // Obsidian Tag Click
            const tagEl = e.target.closest('.obsidian-tag');
            if (tagEl) {
                const tag = tagEl.getAttribute('data-tag');
                if (tag) {
                    vscode.postMessage({ command: 'searchTag', tag: tag });
                    return;
                }
            }

            // Obsidian Embed Click
            const embedEl = e.target.closest('.obsidian-embed');
            if (embedEl) {
                const page = embedEl.getAttribute('data-page');
                if (page) {
                    // Reuse openSource logic (modified side usually)
                    vscode.postMessage({ command: 'openSource', side: 'modified', page: page });
                    return;
                }
            }

            // Guard against interactive elements
            if (e.target.closest('.toolbar') || 
                e.target.closest('a') || 
                e.target.closest('button') || 
                e.target.closest('input') ||
                e.target.closest('.block-editor-overlay') ||
                e.target.closest('.image-diff-controls') ||
                e.target.closest('.breadcrumbs-bar')) {
                return;
            }

            const pane = e.target.closest('.pane');
            if (!pane || pane.id !== 'right-pane') {
                return;
            }

            // Quick Edit is only for v2 (Modified) content. 
            // In Inline mode, ignore clicks on deleted (v1-only) content to avoid mismatches.
            if (e.target.closest('del')) {
                return;
            }

            // Pick the alert container if present, otherwise the closest data-line
            const alertEl = e.target.closest('.markdown-alert');
            let lineEl = alertEl || e.target.closest('[data-line]');
            if (!lineEl) return;

            let lineAttr = lineEl.getAttribute('data-line');
            if (!lineAttr && alertEl) {
                // If alert container lacks data-line, try to find it in a child
                const childWithLine = alertEl.querySelector('[data-line]');
                if (childWithLine) {
                    lineAttr = childWithLine.getAttribute('data-line');
                }
            }

            if (!lineAttr) return;

            const lineStart = parseInt(lineAttr, 10);
            const lineEnd = parseInt(lineEl.getAttribute('data-line-end'), 10) || lineStart + 1;

            // Optional: Delay slightly to see if it's a double click
            // For now, let's just open the editor on single click. 
            // If the user double clicks, the jump will happen anyway.
            BlockEditor.start(lineEl, lineStart, lineEnd);
        });

        // --- Footnote Navigation Support ---
        document.body.addEventListener('click', (e) => {
            const anchor = e.target.closest('a');
            if (!anchor || !anchor.getAttribute('href')) return;
            
            const href = anchor.getAttribute('href');
            // Support both default (fn1) and prefixed (fn-old-1) IDs
            if (href.startsWith('#fn')) {
                const targetId = href.substring(1);
                const pane = anchor.closest('.pane');
                if (pane) {
                    // Search for the ID strictly within the same pane to avoid cross-pane jumping
                    const target = pane.querySelector('[id="' + targetId + '"]');
                    if (target) {
                        e.preventDefault();
                        e.stopPropagation();
                        
                        // Center the target in the pane
                        const paneHeight = pane.clientHeight;
                        const elTop = getRelativeTop(target, pane);
                        const elHeight = target.getBoundingClientRect().height || 20;
                        const targetScrollTop = elTop - (paneHeight / 2) + (elHeight / 2);
                        
                        pane.scrollTop = Math.max(0, targetScrollTop);
                        
                        // Highlight target temporarily
                        target.classList.add('jump-highlight');
                        setTimeout(() => target.classList.remove('jump-highlight'), 1500);
                        
                        // Sync other pane if in split mode
                        if (!isInline) {
                            const otherPane = pane === leftPane ? rightPane : leftPane;
                            const sourceMax = pane.scrollHeight - pane.clientHeight;
                            const otherMax = otherPane.scrollHeight - otherPane.clientHeight;
                            if (sourceMax > 0 && otherMax > 0) {
                                const pct = pane.scrollTop / sourceMax;
                                otherPane.scrollTop = pct * otherMax;
                            }
                        }
                    }
                }
            }
        });

        // --- Ghost Element Cleanup ---
        function cleanupGhosts() {
             resetGhosts();
             if (document.body.classList.contains('inline-mode')) return;


             const leftHidden = hideGhostsInPane(leftContent, 'INS');
             const rightHidden = hideGhostsInPane(rightContent, 'DEL');
             
             // Extra cleanup for complex blocks (Alerts, Pre, etc.)
             // Hide containers whose visible content is entirely the opposite diff type.
             const leftComplexHidden = hideEmptyContainers(leftContent, 'INS');
             const rightComplexHidden = hideEmptyContainers(rightContent, 'DEL');

        }

        function resetGhosts() {
            document.querySelectorAll('.ghost-hidden').forEach(el => el.classList.remove('ghost-hidden'));
        }

        function hideGhostsInPane(pane, hiddenTagName) {
            const candidates = pane.querySelectorAll('li, tr');
            let hiddenCount = 0;
            candidates.forEach(el => {
                if (isGraphicallyEmpty(el, hiddenTagName)) {
                    el.classList.add('ghost-hidden');
                    hiddenCount++;
                }
            });

            // Container-level cleanup (ul, ol, table)
            const containers = pane.querySelectorAll('ul, ol, table, thead, tbody');
            containers.forEach(el => {
                 const children = Array.from(el.children);
                 const allHidden = children.every(c => c.classList.contains('ghost-hidden') || c.style.display === 'none');
                 if (children.length > 0 && allHidden) {
                     el.classList.add('ghost-hidden');
                     hiddenCount++;
                 }
            });
            return hiddenCount;
        }

        // Targeted cleanup for complex blocks (Alerts, Code, Quotes)
        // Usually called for Left Pane (Original) to hide blocks that contain ONLY 'new' content (INS).
        function hideEmptyContainers(pane, hiddenTagName) {
             const complexSelectors = '.markdown-alert, pre, blockquote, .katex-block, .mermaid, .image-diff-block, h1, h2, h3, h4, h5, h6, p, dt, dd, hr';
             const candidates = pane.querySelectorAll(complexSelectors);
             
             let hiddenCount = 0;
             candidates.forEach(el => {
                 // Check if graphically empty, respecting hiddenTagName (e.g. INS)
                 if (isGraphicallyEmpty(el, hiddenTagName)) {
                     el.classList.add('ghost-hidden');
                     hiddenCount++;
                 }
             });
             return hiddenCount;
        }

        function isGraphicallyEmpty(el, hiddenTagName) {
             // HR is a void element that always renders a visible line.
             // It should never be considered "empty" — ins/del wrapping
             // is already handled by CSS display:none rules.
             if (el.tagName === 'HR') {
                 return false;
             }

             // Image diff blocks are complex and never "empty" in the traditional sense
             if (el.classList.contains('image-diff-block')) {
                 return false;
             }
             
             for (let i = 0; i < el.childNodes.length; i++) {
                const node = el.childNodes[i];
                if (node.nodeType === 3) {
                     if (node.textContent.trim().length > 0) return false;
                } else if (node.nodeType === 1) {
                     const tag = node.tagName;
                     if (tag === hiddenTagName) continue;
                     // Tags that are never "empty" because they render something even without direct text children
                     if (['IMG', 'BR', 'INPUT', 'IFRAME', 'VIDEO', 'CANVAS', 'SVG', 'MATH', 'HR'].indexOf(tag) !== -1) return false;
                     // Ignore footnote backref links when checking emptiness
                     if (tag === 'A' && node.classList.contains('footnote-backref')) continue;
                     if (node.style.display === 'none' || node.classList.contains('ghost-hidden')) continue;
                     if (!isGraphicallyEmpty(node, hiddenTagName)) return false;
                }
             }
             return true;
        }

        // --- Image Comparison Controls ---
        function initImageDiffs() {
            const blocks = document.querySelectorAll('.image-diff-block:not([data-initialized])');
            
            blocks.forEach(block => {
                block.setAttribute('data-initialized', 'true');
                
                const oldImg = block.querySelector('.diff-image-old img');
                const newImg = block.querySelector('.diff-image-new img');
                const wrapper = block.querySelector('.image-diff-wrapper');
                
                if (!oldImg || !newImg) return;

                // Create Controls
                const controls = document.createElement('div');
                controls.className = 'image-diff-controls';
                
                const tabs = document.createElement('div');
                tabs.className = 'image-diff-tabs';
                
                const modes = [
                    { id: 'side-by-side', label: '${t("Side-by-Side")}' },
                    { id: 'swipe', label: '${t("Swipe")}' },
                    { id: 'onion-skin', label: '${t("Onion Skin")}' }
                ];
                
                const sliderContainer = document.createElement('div');
                sliderContainer.className = 'image-diff-slider-container';
                
                const slider = document.createElement('input');
                slider.type = 'range';
                slider.min = '0';
                slider.max = '100';
                slider.value = '50';
                slider.className = 'image-diff-slider';
                
                const label = document.createElement('span');
                label.className = 'image-diff-label';
                label.textContent = '50%';
                
                sliderContainer.appendChild(slider);
                sliderContainer.appendChild(label);

                modes.forEach(mode => {
                    const tab = document.createElement('div');
                    tab.className = 'image-diff-tab';
                    if (mode.id === 'side-by-side') tab.classList.add('active');
                    tab.textContent = mode.label;
                    tab.onclick = (e) => {
                        e.stopPropagation();
                        tabs.querySelectorAll('.image-diff-tab').forEach(t => t.classList.remove('active'));
                        tab.classList.add('active');
                        setMode(block, mode.id, slider, label);
                    };
                    tabs.appendChild(tab);
                });
                
                controls.appendChild(tabs);
                controls.appendChild(sliderContainer);
                block.appendChild(controls);

                // Update logic
                const update = () => {
                    const mode = block.getAttribute('data-mode') || 'side-by-side';
                    const val = parseInt(slider.value, 10);
                    label.textContent = val + '%';
                    
                    if (mode === 'onion-skin') {
                        newImg.style.opacity = val / 100;
                        oldImg.style.opacity = 1 - (val / 100);
                        newImg.style.clipPath = 'none';
                        oldImg.style.clipPath = 'none';
                        
                        const divider = wrapper.querySelector('.image-diff-divider');
                        if (divider) divider.remove();
                    } else if (mode === 'swipe') {
                        const wrapperRect = wrapper.getBoundingClientRect();
                        const wrapperWidth = wrapperRect.width;
                        const dividerX = (val / 100) * wrapperWidth;
                        
                        // Use the wrapper's rect for consistent relative calculations
                        const newRect = newImg.getBoundingClientRect();
                        const oldRect = oldImg.getBoundingClientRect();
                        
                        const newLeft = newRect.left - wrapperRect.left;
                        const oldLeft = oldRect.left - wrapperRect.left;
                        
                        // New image: reveal from left (0 to dividerX)
                        // This means clipping the part of newImg that is to the RIGHT of dividerX
                        const newClipRight = Math.max(0, Math.min(newRect.width, newRect.width - (dividerX - newLeft)));
                        newImg.style.clipPath = \`inset(0 \${newClipRight}px 0 0)\`;
                        
                        // Old image: reveal from right (dividerX to wrapperWidth)
                        // This means clipping the part of oldImg that is to the LEFT of dividerX
                        const oldClipLeft = Math.max(0, Math.min(oldRect.width, dividerX - oldLeft));
                        oldImg.style.clipPath = \`inset(0 0 0 \${oldClipLeft}px)\`;

                        newImg.style.opacity = '1';
                        oldImg.style.opacity = '1';
                        
                        // Add visual divider line
                        let divider = wrapper.querySelector('.image-diff-divider');
                        if (!divider) {
                            divider = document.createElement('div');
                            divider.className = 'image-diff-divider';
                            wrapper.appendChild(divider);
                        }
                        divider.style.left = dividerX + 'px';
                    } else {
                        newImg.style.opacity = '1';
                        oldImg.style.opacity = '1';
                        newImg.style.clipPath = 'none';
                        oldImg.style.clipPath = 'none';
                        
                        const divider = wrapper.querySelector('.image-diff-divider');
                        if (divider) divider.remove();
                    }
                };

                slider.oninput = update;
                
                // Initial state
                block.setAttribute('data-mode', 'side-by-side');

                // Ensure images are loaded before calculating dimensions for Swipe
                const onImgLoad = () => {
                   if (oldImg.complete && newImg.complete) {
                       update();
                   }
                };
                oldImg.onload = onImgLoad;
                newImg.onload = onImgLoad;
            });
        }

        function setMode(block, mode, slider, label) {
             block.setAttribute('data-mode', mode);
             const sliderContainer = block.querySelector('.image-diff-slider-container');
             const newImg = block.querySelector('.diff-image-new img');
             const oldImg = block.querySelector('.diff-image-old img');
             const wrapper = block.querySelector('.image-diff-wrapper');

             // Reset styles to a clean state before mode-specific updates
             if (newImg) {
                 newImg.style.clipPath = 'none';
                 newImg.style.opacity = '1';
             }
             if (oldImg) {
                 oldImg.style.clipPath = 'none';
                 oldImg.style.opacity = '1';
             }

             if (mode === 'side-by-side') {
                sliderContainer.style.display = 'none';
                wrapper.style.height = 'auto';
            } else {
                sliderContainer.style.display = 'flex';
                
                // Fix height for overlay modes based on the taller image
                if (newImg && oldImg) {
                    const maxHeight = Math.max(newImg.naturalHeight || 0, oldImg.naturalHeight || 0, 100);
                    const maxWidth = Math.max(newImg.naturalWidth || 0, oldImg.naturalWidth || 0, 1);
                    
                    // Constrain by wrapper width
                    const displayWidth = wrapper.clientWidth - 40;
                    const targetHeight = Math.min(maxHeight, (maxHeight / maxWidth) * displayWidth);
                    
                    wrapper.style.height = (targetHeight + 40) + 'px';
                }
                
                if (mode === 'swipe') {
                    slider.value = '50';
                } else if (mode === 'onion-skin') {
                    slider.value = '50';
                }
            }
            
            // Trigger update
            slider.oninput();
        }

        // Initial cleanup
        cleanupGhosts();
        initImageDiffs();

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
                        const leftTarget = ratio * (leftPane.scrollHeight - leftPane.clientHeight);
                        const rightTarget = ratio * (rightPane.scrollHeight - rightPane.clientHeight);
                        leftPane.scrollTop = leftTarget;
                        rightPane.scrollTop = rightTarget;
                        setTimeout(() => isScrolling = false, 50);
                    }
                    break;
                case 'receiveBlockSource':
                    BlockEditor.onSourceReceived(message.content);
                    break;
            }
        });

        // --- Quick Edit: BlockEditor ---
        const BlockEditor = {
            activeOverlay: null,
            activeInfo: null,

            start(el, lineStart, lineEnd) {
                this.close();
                this.activeInfo = { el, lineStart, lineEnd };
                vscode.postMessage({
                    command: 'requestBlockSource',
                    lineStart,
                    lineEnd
                });
                statusMsg.textContent = t("Loading source...");
            },

            onSourceReceived(content) {
                if (!this.activeInfo) return;
                statusMsg.textContent = '';
                this.showOverlay(content);
            },

            showOverlay(content) {
                const { el, lineStart, lineEnd } = this.activeInfo;
                const rect = el.getBoundingClientRect();
                const paneRect = rightPane.getBoundingClientRect();

                const overlay = document.createElement('div');
                overlay.className = 'block-editor-overlay';
                
                // Position overlay over the element but constrained to pane
                overlay.style.top = (rect.top - paneRect.top + rightPane.scrollTop) + 'px';
                overlay.style.left = '10px';
                overlay.style.right = '10px';
                overlay.style.width = 'calc(100% - 40px)';

                const textarea = document.createElement('textarea');
                textarea.className = 'block-editor-textarea';
                textarea.value = content;
                
                // Auto-resize
                const adjustHeight = () => {
                    textarea.style.height = 'auto';
                    textarea.style.height = (textarea.scrollHeight + 5) + 'px';
                };
                textarea.oninput = adjustHeight;

                const openInEditorBtn = document.createElement('button');
                openInEditorBtn.className = 'block-editor-btn block-editor-cancel'; // Use secondary style
                openInEditorBtn.textContent = t("Open in Editor");
                openInEditorBtn.onclick = () => {
                    vscode.postMessage({
                        command: 'openSource',
                        side: 'modified',
                        line: lineStart
                    });
                    this.close();
                };

                const actions = document.createElement('div');
                actions.className = 'block-editor-actions';

                const cancelBtn = document.createElement('button');
                cancelBtn.className = 'block-editor-btn block-editor-cancel';
                cancelBtn.textContent = t("Cancel");
                cancelBtn.onclick = () => this.close();

                const saveBtn = document.createElement('button');
                saveBtn.className = 'block-editor-btn block-editor-save';
                saveBtn.textContent = t("Save");
                saveBtn.onclick = () => {
                    vscode.postMessage({
                        command: 'applyEdit',
                        lineStart,
                        lineEnd,
                        newContent: textarea.value
                    });
                    this.close();
                    statusMsg.textContent = t("Saving...");
                };

                actions.appendChild(openInEditorBtn);
                actions.appendChild(document.createElement('div')).style.flex = "1"; // Spacer
                actions.appendChild(cancelBtn);
                actions.appendChild(saveBtn);
                overlay.appendChild(textarea);
                overlay.appendChild(actions);

                rightContent.appendChild(overlay);
                this.activeOverlay = overlay;

                textarea.focus();
                adjustHeight();

                // Close on Escape
                textarea.onkeydown = (e) => {
                    if (e.key === 'Escape') this.close();
                    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) saveBtn.click();
                };
            },

            close() {
                if (this.activeOverlay) {
                    this.activeOverlay.remove();
                    this.activeOverlay = null;
                }
                this.activeInfo = null;
            }
        };
        if (typeof mermaid !== 'undefined') {
            mermaid.initialize({ 
                startOnLoad: true, 
                securityLevel: 'strict',
                nonce: '${nonce}'
            });
        }

        // Global resize listener to refresh image layouts
        window.addEventListener('resize', () => {
             document.querySelectorAll('.image-diff-block[data-mode="swipe"], .image-diff-block[data-mode="onion-skin"]').forEach(block => {
                 const slider = block.querySelector('.image-diff-slider');
                 if (slider) slider.oninput();
             });
        });

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
              // Also refresh image diffs if any
              initImageDiffs();
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
      window.__init_ok = true;
    </script>
    <script nonce="${nonce}">
      // Initialize ruler visibility and breadcrumbs
      updateOverviewRulerVisibility();
      updateBreadcrumbs(leftPane, leftBreadcrumbs);
      updateBreadcrumbs(rightPane, rightBreadcrumbs);

      // Signal that the script has initialized successfully
      if (window.__init_ok) {
          try {
              window.vscode.postMessage({ command: 'ready' });
          } catch (e) {
              console.error('Failed to send ready signal:', e);
          }
      }
    </script>
    <script nonce="${nonce}">/* VRT_SCRIPT_PLACEHOLDER */</script>
</body>
</html>`;
}
