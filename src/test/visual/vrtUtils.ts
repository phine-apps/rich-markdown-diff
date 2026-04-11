import * as fs from "fs";
import * as path from "path";
import type { MarkdownDiffProvider as ProviderType } from "../../markdownDiff";
const { MarkdownDiffProvider } = require("../../../out/markdownDiff");

export async function generateVRTHtml(
  provider: ProviderType,
  oldMarkdown: string,
  newMarkdown: string,
  options: { inline?: boolean; theme?: "light" | "dark" } = {}
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
  const katexCss = fs.readFileSync(path.join(mediaDir, "katex/katex.min.css"), "utf8");
  const hljsCss = options.theme === "dark" 
    ? fs.readFileSync(path.join(mediaDir, "highlight/github-dark.min.css"), "utf8")
    : fs.readFileSync(path.join(mediaDir, "highlight/github.min.css"), "utf8");
  
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
    marpJs
  );

  // Inject Theme Variables via placeholder
  html = html.replace("/* VRT_THEME_VARS */", themeVars);

  // Force inline mode if requested via placeholder in body class
  const layoutClass = options.inline ? "inline-mode" : "split-mode";
  html = html.replace("VRT_LAYOUT_CLASS", layoutClass);

  // Remove CSP for testing environment
  html = html.replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/, "");

  // We don't inject mermaid.min.js in VRT since it's mocked by CSS and executing it can cause hangs.
  html = html.replace(/<script[^>]*src="[^"]*mock-mermaid.min.js"[^>]*><\/script>/, "");

  // Mock Mermaid for VRT. Headless browsers often fail to render Mermaid SVGs securely (sandbox errors),
  // which causes flaky text-only snapshots or timeouts. We replace `.mermaid` with a static visual block.
  html = html.replace("</head>", `
    <style>
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
  </head>`);

  return html;
}
