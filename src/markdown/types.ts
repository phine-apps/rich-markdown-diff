/*
 * MIT License
 *
 * Copyright (c) 2026 Rich Markdown Diff Authors
 */

export interface DiffResult {
  html: string;
  marpCss?: string;
  marpJs?: string;
}

export type ImageResolver = (src: string) => string;

export interface WebviewOptions {
  katexCssInline: string;
  mermaidJsUri: string;
  hljsLightCssUri: string;
  hljsDarkCssUri: string;
  leftLabel?: string;
  rightLabel?: string;
  cspSource?: string;
  translations?: Record<string, string>;
  marpCss?: string;
  marpJs?: string;
}
