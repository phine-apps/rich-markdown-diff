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

import * as fs from "fs";
import * as path from "path";
import type { MarkdownDiffProvider as ProviderType } from "../../markdownDiff";


export async function generateVRTHtml(
  provider: ProviderType,
  oldMarkdown: string,
  newMarkdown: string,
  options: { 
    inline?: boolean; 
    theme?: "light" | "dark";
    blameInfo?: any;
    showGutterMarkers?: boolean;
    showGitBlame?: boolean;
  } = {}
): Promise<string> {
  const { html: diffHtml, marpCss, marpJs } = provider.computeDiff(
    oldMarkdown,
    newMarkdown,
    (src) => {
      // Resolve any path that doesn't look like a URL
      if (!src.includes("://") && !src.startsWith("data:")) {
        return "file://" + path.resolve(path.join(__dirname, "../../../fixtures"), src);
      }
      return src;
    }
  );
  
  const mediaDir = path.join(__dirname, "../../../media");
  const katexDir = path.join(mediaDir, "katex");
  let katexCss = fs.readFileSync(path.join(katexDir, "katex.min.css"), "utf8");

  // Fix relative font paths for VRT environment (setContent about:blank needs absolute paths)
  const absoluteFontPath = "file://" + path.join(katexDir, "fonts").replace(/\\/g, "/");
  katexCss = katexCss.replace(/url\(fonts\//g, `url(${absoluteFontPath}/`);

  
  const translations = {
    "Markdown Diff": "Markdown Diff",
    "Original": "Original",
    "Modified": "Modified",
  };

  // Standard VS Code Theme Variables (Mocks)
  const themeVars = options.theme === "dark" ? `
    --vscode-editor-background: #1e1e1e;
    --vscode-editor-foreground: #d4d4d4;
    --vscode-panel-border: #333333;
    --vscode-textBlockQuote-background: #252526;
    --vscode-textBlockQuote-border: #454545;
    --vscode-button-secondaryBackground: #3a3d41;
    --vscode-button-secondaryForeground: #ffffff;
    --vscode-button-secondaryHoverBackground: #45494e;
    --vscode-scrollbarSlider-background: rgba(121, 121, 121, 0.4);
    --vscode-descriptionForeground: #8b949e;
    --vscode-editor-inactiveSelectionBackground: #3a3d41;
    --vscode-font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  ` : `
    --vscode-editor-background: #ffffff;
    --vscode-editor-foreground: #333333;
    --vscode-panel-border: #eeeeee;
    --vscode-textBlockQuote-background: #f3f3f3;
    --vscode-textBlockQuote-border: #cccccc;
    --vscode-button-secondaryBackground: #eeeeee;
    --vscode-button-secondaryForeground: #333333;
    --vscode-button-secondaryHoverBackground: #e5e5e5;
    --vscode-scrollbarSlider-background: rgba(100, 100, 100, 0.4);
    --vscode-descriptionForeground: #707070;
    --vscode-editor-inactiveSelectionBackground: #e5e5e5;
    --vscode-editorWidget-background: #f3f3f3;
    --vscode-textCodeBlock-background: #f3f3f3;
    --vscode-font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  `;

  const hljsLightCss = fs.readFileSync(path.join(mediaDir, "highlight/github.min.css"), "utf8");
  const hljsDarkCss = fs.readFileSync(path.join(mediaDir, "highlight/github-dark.min.css"), "utf8");

  let html = provider.getWebviewContent(
    diffHtml,
    "data:text/css;base64," + Buffer.from(katexCss).toString("base64"),
    "mock-mermaid.min.js", // Used so regex matches to inject local script
    "data:text/css;base64," + Buffer.from(hljsLightCss).toString("base64"),
    "data:text/css;base64," + Buffer.from(hljsDarkCss).toString("base64"),
    "Original",
    "Modified",
    "*",
    translations,
    marpCss,
    marpJs,
    options.blameInfo,
    options.showGutterMarkers ?? true,
    options.showGitBlame ?? true
  );

  // Inject Theme Variables via placeholder
  html = html.replace("/* VRT_THEME_VARS */", themeVars);

  // Overrides for VRT environment
  const vrtStyle = `
      html, body.vrt-layout {
          height: auto !important;
          overflow: visible !important;
          width: 1280px !important;
      }
      body.vrt-layout .container {
          display: grid !important;
          height: auto !important;
          overflow: visible !important;
      }
      body.vrt-layout .pane {
          min-width: 0 !important;
          overflow: visible !important;
          height: auto !important;
          max-height: none !important;
          display: block !important;
          padding: 0 !important;
      }
      body.vrt-layout .pane-content {
          height: auto !important;
          overflow: visible !important;
      }
      body.vrt-layout.split-mode .container {
          grid-template-columns: 640px 640px !important;
      }
      body.vrt-layout.inline-mode .container {
          display: block !important;
      }
      body.vrt-layout.inline-mode .pane {
          width: 100% !important;
          margin-bottom: 2rem !important;
      }
  `;

  // Force layout classes if requested via placeholder in body class
  const layoutClass = (options.inline ? "inline-mode" : "split-mode") + " vrt-layout";
  const extraClasses = marpCss ? " marp-mode" : "";
  html = html.replace("VRT_LAYOUT_CLASS", layoutClass + extraClasses);

  // Remove CSP and nonces for testing environment
  html = html.replace(/<meta http-equiv=["']Content-Security-Policy["'][^>]*>/gi, "");
  html = html.replace(/nonce=["'][^"']*["']/g, "");

  // We don't inject mermaid.min.js in VRT since it's mocked by CSS and executing it can cause hangs.
  html = html.replace(/<script[^>]*src="[^"]*mock-mermaid.min.js"[^>]*><\/script>/, "");

  // Mock Mermaid for VRT. Headless browsers often fail to render Mermaid SVGs securely (sandbox errors),
  // which causes flaky text-only snapshots or timeouts. We replace `.mermaid` with a static visual block.
  html = html.replace("</head>", `
    <style>
      ${vrtStyle}
      .mermaid {
         background: var(--vscode-editor-inactiveSelectionBackground);
         color: transparent !important;
         overflow: hidden;
         border: 1px dashed var(--vscode-panel-border);
         min-height: 100px;
         display: flex !important;
         align-items: center;
         justify-content: center;
      }
      .mermaid::after {
         content: "Mermaid Diagram (Mocked for VRT)";
         color: var(--vscode-descriptionForeground);
         font-family: var(--vscode-font-family);
         font-size: 12px;
      }
      .mermaid svg { display: none !important; }
    </style>
    <script>
      window.VRT_ENVIRONMENT = true;
      // Mock acquireVsCodeApi to prevent ReferenceError in non-VSCode environment
      window.acquireVsCodeApi = () => ({
          postMessage: (msg) => { console.log('VSCode PostMessage:', msg); },
          getState: () => ({}),
          setState: () => {}
      });

      // Mock Mermaid to prevent ReferenceError since we stripped the script
      window.mermaid = {
          initialize: () => {},
          render: (id, text, cb) => { cb(''); }
      };
      
      // Wait for fonts to load to prevent flakiness in VRT
      if (document.fonts) {
        console.log(' - waiting for fonts to load...');
        document.fonts.ready.then(() => {
          console.log(' - fonts loaded');
          document.body.classList.add('fonts-loaded');
        }).catch(err => {
          console.error(' - font load error:', err);
          document.body.classList.add('fonts-loaded');
        });
      } else {
        document.body.classList.add('fonts-loaded');
      }

      // Safety fallback to unblock baseline updates
      setTimeout(() => {
          document.body.setAttribute('data-marp-scaled', 'true');
          document.body.classList.add('fonts-loaded');
      }, 5000);
    </script>
  </head>`);

  return html;
}
