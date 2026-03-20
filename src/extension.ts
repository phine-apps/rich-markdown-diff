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

import * as vscode from "vscode";
import { MarkdownDiffProvider } from "./markdownDiff";
import * as path from "path";
import * as l10n from "@vscode/l10n";

/**
 * Escapes HTML special characters to prevent XSS in webview content.
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// We need to track active panels to dispatch commands to them
let activePanel: vscode.WebviewPanel | undefined;
let selectedForCompareUri: vscode.Uri | undefined;

/**
 * Get minimal distinguishable paths for display in diff titles.
 * If filenames are different, returns just the basename.
 * If filenames are the same, includes parent directories to distinguish them.
 */
function getMinimalPathForDisplay(
  path1: string,
  path2: string,
): { left: string; right: string } {
  const base1 = path.basename(path1);
  const base2 = path.basename(path2);

  // If basenames are different, just use basenames
  if (base1 !== base2) {
    return { left: base1, right: base2 };
  }

  // If basenames are the same, include parent directories until they differ
  const parts1 = path1.split(path.sep).filter((p) => p);
  const parts2 = path2.split(path.sep).filter((p) => p);

  // Find the minimum number of segments needed to distinguish the paths
  let segmentsNeeded = 1;
  while (segmentsNeeded < Math.max(parts1.length, parts2.length)) {
    const suffix1 = parts1.slice(-segmentsNeeded).join(path.sep);
    const suffix2 = parts2.slice(-segmentsNeeded).join(path.sep);
    if (suffix1 !== suffix2) {
      return { left: suffix1, right: suffix2 };
    }
    segmentsNeeded++;
  }

  // Fallback: use full paths if we can't distinguish
  return { left: path1, right: path2 };
}

/**
 * Creates a function to resolve relative image paths to webview-compatible URIs.
 *
 * @param fileUri - The URI of the Markdown file being rendered.
 * @param webview - The webview panel where images will be displayed.
 * @returns A function that takes an image source and returns a resolved URI string.
 */
function createImageResolver(fileUri: vscode.Uri, webview: vscode.Webview) {
  return (src: string) => {
    // Check if absolute URL (http, https, data, etc.)
    if (/^[a-z]+:/i.test(src)) {
      return src;
    }

    try {
      // Resolve path relative to the document
      // We use joinPath with '..' to start from the directory of the fileUri
      let resolvedUri: vscode.Uri;
      if (src.startsWith("/")) {
        resolvedUri = vscode.Uri.file(src);
      } else {
        resolvedUri = vscode.Uri.joinPath(fileUri, "..", src);
      }
      return webview.asWebviewUri(resolvedUri).toString();
    } catch (e) {
      console.warn("Failed to resolve image path:", src, e);
      return src;
    }
  };
}

function getWebviewTranslations() {
  return {
    "Markdown Diff": l10n.t("Markdown Diff"),
    Original: l10n.t("Original"),
    Modified: l10n.t("Modified"),
    "Scanning...": l10n.t("Scanning..."),
    "Found {0} groups": l10n.t("Found {0} groups"),
    "No changes found": l10n.t("No changes found"),
    "Error: {0}": l10n.t("Error: {0}"),
    "Change {0} of {1}": l10n.t("Change {0} of {1}"),
    "Folded {0} (Original) / {1} (Modified) blocks": l10n.t(
      "Folded {0} (Original) / {1} (Modified) blocks",
    ),
    "{0} unchanged blocks": l10n.t("{0} unchanged blocks"),
    "Click to expand": l10n.t("Click to expand"),
  };
}

/**
 * Activates the extension.
 * Sets up commands, custom editors, and context keys.
 *
 * @param context - The extension context provided by VS Code.
 */
export function activate(context: vscode.ExtensionContext) {
  l10n.config({
    uri: vscode.Uri.joinPath(context.extensionUri, "l10n").toString(),
  });

  // Initialize Context Key
  vscode.commands.executeCommand(
    "setContext",
    "rich-markdown-diff.hasSelectedForCompare",
    false,
  );
  vscode.commands.executeCommand(
    "setContext",
    "rich-markdown-diff.isDiffActive",
    false,
  );

  // Register Commands

  // Register Navigation Commands
  context.subscriptions.push(
    vscode.commands.registerCommand("rich-markdown-diff.nextChange", () => {
      activePanel?.webview.postMessage({ command: "nextChange" });
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("rich-markdown-diff.prevChange", () => {
      activePanel?.webview.postMessage({ command: "prevChange" });
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "rich-markdown-diff.toggleInlineView",
      () => {
        if (activePanel) {
          activePanel.webview.postMessage({ command: "toggleInline" });
        } else {
          vscode.window.showWarningMessage(l10n.t("No active diff panel found."));
        }
      },
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "rich-markdown-diff.toggleFoldUnchanged",
      () => {
        activePanel?.webview.postMessage({ command: "toggleFold" });
      },
    ),
  );

  const disposableDiff = vscode.commands.registerCommand(
    "rich-markdown-diff.diffClipboard",
    async (uri?: vscode.Uri) => {
      let document: vscode.TextDocument | undefined;

      // 1. Try URI argument (e.g. from context menu)
      if (uri) {
        try {
          document = await vscode.workspace.openTextDocument(uri);
        } catch (e) {
          console.error("Failed to open document from URI:", e);
        }
      }

      // 2. Try Active Tab (Handles generic Markdown Preview)
      if (!document) {
        const activeTab = vscode.window.tabGroups.activeTabGroup.activeTab;
        if (activeTab) {
          if (
            activeTab.input instanceof vscode.TabInputCustom &&
            activeTab.input.viewType === "vscode.markdown.preview.editor"
          ) {
            try {
              document = await vscode.workspace.openTextDocument(
                activeTab.input.uri,
              );
            } catch (e) {
              console.error("Failed to open document from Preview Tab:", e);
            }
          } else if (activeTab.input instanceof vscode.TabInputText) {
            try {
              document = await vscode.workspace.openTextDocument(
                activeTab.input.uri,
              );
            } catch (e) {
              console.error("Failed to open document from Text Tab:", e);
            }
          }
        }
      }

      // 3. Fallback: Active Text Editor
      if (!document && vscode.window.activeTextEditor) {
        document = vscode.window.activeTextEditor.document;
      }

      // 4. Fallback: Visible Text Editors (Last Resort)
      if (!document) {
        const visibleMarkdown = vscode.window.visibleTextEditors.find(
          (editor) => editor.document.languageId === "markdown",
        );
        if (visibleMarkdown) {
          document = visibleMarkdown.document;
        }
      }

      if (!document) {
        vscode.window.showErrorMessage(
          l10n.t(
            "Could not determine the active Markdown file. Please open or focus a Markdown file.",
          ),
        );
        return;
      }

      if (document.languageId !== "markdown") {
        vscode.window.showErrorMessage(
          l10n.t(
            "Compare with Clipboard is only available for Markdown files.",
          ),
        );
        return;
      }

      let docText = document.getText();
      const editor = vscode.window.activeTextEditor;
      if (editor && editor.document === document && !editor.selection.isEmpty) {
        docText = document.getText(editor.selection);
      }
      const clipboardText = await vscode.env.clipboard.readText();

      const diffProvider = new MarkdownDiffProvider();
      await diffProvider.waitForReady();

      const panel = vscode.window.createWebviewPanel(
        "markdownDiff",
        "Markdown Diff",
        vscode.ViewColumn.Active,
        {
          enableScripts: true,
          enableFindWidget: true,
          localResourceRoots: [
            vscode.Uri.joinPath(context.extensionUri, "media"),
            vscode.Uri.joinPath(context.extensionUri, "node_modules"),
            ...(vscode.workspace.workspaceFolders?.map((f) => f.uri) ?? []),
          ],
        },
      );

      const resolver = createImageResolver(document.uri, panel.webview);
      const diffHtml = diffProvider.computeDiff(
        clipboardText,
        docText,
        resolver,
      );
      const katexCssUri = panel.webview.asWebviewUri(
        vscode.Uri.joinPath(
          context.extensionUri,
          "media",
          "katex",
          "katex.min.css",
        ),
      );
      const mermaidJsUri = panel.webview.asWebviewUri(
        vscode.Uri.joinPath(
          context.extensionUri,
          "media",
          "mermaid",
          "mermaid.min.js",
        ),
      );
      const hljsLightCssUri = panel.webview.asWebviewUri(
        vscode.Uri.joinPath(
          context.extensionUri,
          "media",
          "highlight",
          "github.min.css",
        ),
      );
      const hljsDarkCssUri = panel.webview.asWebviewUri(
        vscode.Uri.joinPath(
          context.extensionUri,
          "media",
          "highlight",
          "github-dark.min.css",
        ),
      );

      const webviewContent = diffProvider.getWebviewContent(
        diffHtml,
        katexCssUri.toString(),
        mermaidJsUri.toString(),
        hljsLightCssUri.toString(),
        hljsDarkCssUri.toString(),
        "Clipboard",
        path.basename(document.fileName),
        panel.webview.cspSource,
        getWebviewTranslations(),
      );

      // Helper to track active panel for shortcuts
      panel.onDidChangeViewState((e) => {
        if (e.webviewPanel.active) {
          activePanel = e.webviewPanel;
          vscode.commands.executeCommand(
            "setContext",
            "rich-markdown-diff.isDiffActive",
            true,
          );
        } else {
          if (activePanel === e.webviewPanel) {
            activePanel = undefined;
            vscode.commands.executeCommand(
              "setContext",
              "rich-markdown-diff.isDiffActive",
              false,
            );
          }
        }
      });

      panel.onDidDispose(() => {
        if (activePanel === panel) {
          activePanel = undefined;
          vscode.commands.executeCommand(
            "setContext",
            "rich-markdown-diff.isDiffActive",
            false,
          );
        }
      });

      if (panel.active) {
        activePanel = panel;
        vscode.commands.executeCommand(
          "setContext",
          "rich-markdown-diff.isDiffActive",
          true,
        );
      }

      panel.webview.html = webviewContent;

      // Handle Double Click
      panel.webview.onDidReceiveMessage((message) => {
        if (message.command === "openSource") {
          const side = message.side;
          const line = message.line;
          if (side === "original") {
            vscode.window.showInformationMessage(
              l10n.t(
                "Original source is the clipboard content and cannot be opened as a file.",
              ),
            );
            return;
          }

          if (editor) {
            vscode.window
              .showTextDocument(editor.document, vscode.ViewColumn.One)
              .then((e) => {
                if (line) {
                  const range = new vscode.Range(line, 0, line, 0);
                  e.revealRange(range, vscode.TextEditorRevealType.InCenter);
                }
              });
          }
        }
      });
    },
  );

  context.subscriptions.push(disposableDiff);

  // Custom Editor Provider
  const provider = new DiffEditorProvider(context);
  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(
      DiffEditorProvider.viewType,
      provider,
      {
        webviewOptions: {
          enableFindWidget: true,
        },
      }
    ),
  );

  const showDiff = async (...args: any[]) => {
    // 1. Check for 2-file selection from Explorer (Compare Selected)
    if (
      args &&
      args.length === 2 &&
      Array.isArray(args[1]) &&
      args[1].length === 2
    ) {
      const selectedUris = args[1] as vscode.Uri[];
      const clickedUri = args[0] as vscode.Uri;
      const modifiedUri = clickedUri;
      const originalUri =
        selectedUris.find((u) => u.toString() !== clickedUri.toString()) ||
        selectedUris[0];

      if (originalUri && modifiedUri) {
        showTwoFilesDiff(originalUri, modifiedUri, context);
        return;
      }
    }

    // 2. Resolve single target URI
    let targetUri: vscode.Uri | undefined;
    if (args && args.length > 0) {
      if (args[0] instanceof vscode.Uri) {
        targetUri = args[0];
      } else if (args[0].resourceUri) {
        targetUri = args[0].resourceUri;
      }
    }

    if (!targetUri) {
      const activeEditor = vscode.window.activeTextEditor;
      if (activeEditor) {
        targetUri = activeEditor.document.uri;
      }
    }

    if (!targetUri) {
      vscode.window.showErrorMessage(
        l10n.t("No file selected for Markdown Diff."),
      );
      return;
    }

    // --- Graceful Validation ---
    const ext = path.extname(targetUri.fsPath).toLowerCase();
    const markdownExtensions = [
      ".md",
      ".markdown",
      ".mdown",
      ".mkdn",
      ".mdwn",
      ".mdtxt",
      ".mdtext",
    ];
    if (!markdownExtensions.includes(ext)) {
      vscode.window.showInformationMessage(
        l10n.t("Markdown Diff only works for Markdown files (found '{0}').", ext),
      );
      return;
    }
    // ---------------------------

    // Open with our custom editor (Git Diff mode)
    await vscode.commands.executeCommand(
      "vscode.openWith",
      targetUri,
      DiffEditorProvider.viewType,
    );
  };

  const disposableGitDiff = vscode.commands.registerCommand(
    "rich-markdown-diff.showRenderedDiff",
    showDiff,
  );

  context.subscriptions.push(disposableGitDiff);

  // Select for Compare
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "rich-markdown-diff.selectForCompare",
      (uri: vscode.Uri | undefined) => {
        if (!uri && vscode.window.activeTextEditor) {
          uri = vscode.window.activeTextEditor.document.uri;
        }
        if (!uri) {
          vscode.window.showErrorMessage(
            l10n.t("No file selected for comparison."),
          );
          return;
        }
        selectedForCompareUri = uri;
        vscode.commands.executeCommand(
          "setContext",
          "rich-markdown-diff.hasSelectedForCompare",
          true,
        );

        vscode.window.setStatusBarMessage(
          l10n.t("Selected '{0}' for Markdown diff.", path.basename(uri.fsPath)),
          5000,
        );
      },
    ),
  );

  // Compare with Selected
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "rich-markdown-diff.compareWithSelected",
      (uri: vscode.Uri | undefined) => {
        if (!uri && vscode.window.activeTextEditor) {
          uri = vscode.window.activeTextEditor.document.uri;
        }
        if (!uri) {
          vscode.window.showErrorMessage(
            l10n.t("No file selected for comparison."),
          );
          return;
        }

        if (!selectedForCompareUri) {
          vscode.window.showErrorMessage(
            l10n.t(
              "Please first select a file using 'Select for Markdown Diff'.",
            ),
          );
          return;
        }

        if (selectedForCompareUri.toString() === uri.toString()) {
          vscode.window.showInformationMessage(
            l10n.t("You are comparing the same file."),
          );
        }

        showTwoFilesDiff(selectedForCompareUri, uri, context);

        // Reset state
        selectedForCompareUri = undefined;
        vscode.commands.executeCommand(
          "setContext",
          "rich-markdown-diff.hasSelectedForCompare",
          false,
        );
      },
    ),
  );
}

/**
 * Shows a diff between two specific Markdown files in a webview panel.
 *
 * @param originalUri - The URI of the original (left) file.
 * @param modifiedUri - The URI of the modified (right) file.
 * @param _context - The extension context.
 */
async function showTwoFilesDiff(
  originalUri: vscode.Uri,
  modifiedUri: vscode.Uri,
  _context: vscode.ExtensionContext,
) {
  const minimalPaths = getMinimalPathForDisplay(
    originalUri.fsPath,
    modifiedUri.fsPath,
  );

  const panel = vscode.window.createWebviewPanel(
    "markdownDiff",
    `Diff: ${minimalPaths.left} ↔ ${minimalPaths.right}`,
    vscode.ViewColumn.Active,
    {
      enableScripts: true,
      enableFindWidget: true,
      localResourceRoots: [
        vscode.Uri.joinPath(_context.extensionUri, "media"),
        vscode.Uri.joinPath(_context.extensionUri, "node_modules"),
        ...(vscode.workspace.workspaceFolders?.map((f) => f.uri) ?? []),
      ],
    },
  );

  // Track active panel
  panel.onDidChangeViewState((e) => {
    if (e.webviewPanel.active) {
      activePanel = e.webviewPanel;
      vscode.commands.executeCommand(
        "setContext",
        "rich-markdown-diff.isDiffActive",
        true,
      );
    } else {
      if (activePanel === e.webviewPanel) {
        activePanel = undefined;
        vscode.commands.executeCommand(
          "setContext",
          "rich-markdown-diff.isDiffActive",
          false,
        );
      }
    }
  });

  panel.onDidDispose(() => {
    if (activePanel === panel) {
      activePanel = undefined;
      vscode.commands.executeCommand(
        "setContext",
        "rich-markdown-diff.isDiffActive",
        false,
      );
    }
  });

  if (panel.active) {
    activePanel = panel;
    vscode.commands.executeCommand(
      "setContext",
      "rich-markdown-diff.isDiffActive",
      true,
    );
  }

  const diffProvider = new MarkdownDiffProvider();

  const update = async () => {
    try {
      const doc1 = await vscode.workspace.openTextDocument(originalUri);
      const doc2 = await vscode.workspace.openTextDocument(modifiedUri);
      const content1 = doc1.getText();
      const content2 = doc2.getText();

      await diffProvider.waitForReady();

      const resolver = createImageResolver(modifiedUri, panel.webview);
      const diffHtml = diffProvider.computeDiff(content1, content2, resolver);

      const leftLabel = path.basename(originalUri.fsPath);
      const rightLabel = path.basename(modifiedUri.fsPath);

      const katexCssUri = panel.webview.asWebviewUri(
        vscode.Uri.joinPath(
          _context.extensionUri,
          "media",
          "katex",
          "katex.min.css",
        ),
      );
      const mermaidJsUri = panel.webview.asWebviewUri(
        vscode.Uri.joinPath(
          _context.extensionUri,
          "media",
          "mermaid",
          "mermaid.min.js",
        ),
      );
      const hljsLightCssUri = panel.webview.asWebviewUri(
        vscode.Uri.joinPath(
          _context.extensionUri,
          "media",
          "highlight",
          "github.min.css",
        ),
      );
      const hljsDarkCssUri = panel.webview.asWebviewUri(
        vscode.Uri.joinPath(
          _context.extensionUri,
          "media",
          "highlight",
          "github-dark.min.css",
        ),
      );

      panel.webview.html = diffProvider.getWebviewContent(
        diffHtml,
        katexCssUri.toString(),
        mermaidJsUri.toString(),
        hljsLightCssUri.toString(),
        hljsDarkCssUri.toString(),
        leftLabel,
        rightLabel,
        panel.webview.cspSource,
        getWebviewTranslations(),
      );
    } catch (e) {
      panel.webview.html = `<h1>${escapeHtml(l10n.t("Error reading files"))}</h1><p>${escapeHtml(String(e))}</p>`;
    }
  };

  // Initial render
  await update();

  // Watchers
  const watcher = vscode.workspace.onDidChangeTextDocument((e) => {
    if (
      e.document.uri.toString() === originalUri.toString() ||
      e.document.uri.toString() === modifiedUri.toString()
    ) {
      update();
    }
  });

  panel.onDidDispose(() => {
    watcher.dispose();
  });

  // Handle Double Click (Open Modified)
  panel.webview.onDidReceiveMessage(async (message) => {
    if (message.command === "openSource") {
      const side = message.side;
      const line = message.line;

      let uriToOpen = modifiedUri;
      if (side === "original") {
        uriToOpen = originalUri;
      }

      try {
        const doc = await vscode.workspace.openTextDocument(uriToOpen);
        const editor = await vscode.window.showTextDocument(doc, {
          viewColumn: vscode.ViewColumn.One,
          preserveFocus: false,
        });

        if (line) {
          const range = new vscode.Range(line, 0, line, 0);
          editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
          editor.selection = new vscode.Selection(range.start, range.start);
        }
      } catch (e) {
        vscode.window.showErrorMessage(
          l10n.t("Could not open source file: {0}", String(e)),
        );
      }
    }
  });
}

/**
 * Custom editor provider for Markdown Diff previews.
 * Handles opening and rendering differences for a given Markdown file compared to its base revision.
 */
class DiffEditorProvider implements vscode.CustomReadonlyEditorProvider {
  public static readonly viewType = "rich-markdown-diff.diffPreview";
  private diffProvider = new MarkdownDiffProvider();

  constructor(private readonly context: vscode.ExtensionContext) {}

  /**
   * Creates a custom document for the given URI.
   *
   * @param uri - The URI of the document to open.
   * @returns A custom document object.
   */
  openCustomDocument(uri: vscode.Uri): vscode.CustomDocument {
    return { uri, dispose: () => {} };
  }

  /**
   * Resolves the custom editor by setting up the webview and its content.
   *
   * @param document - The custom document to resolve.
   * @param webviewPanel - The webview panel to render the editor in.
   * @param _token - A cancellation token.
   */
  async resolveCustomEditor(
    document: vscode.CustomDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken,
  ): Promise<void> {
    webviewPanel.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.context.extensionUri, "media"),
        vscode.Uri.joinPath(this.context.extensionUri, "node_modules"),
        ...(vscode.workspace.workspaceFolders?.map((f) => f.uri) ?? []),
      ],
    };

    // Track active panel
    webviewPanel.onDidChangeViewState((e) => {
      if (e.webviewPanel.active) {
        activePanel = e.webviewPanel;
        vscode.commands.executeCommand(
          "setContext",
          "rich-markdown-diff.isDiffActive",
          true,
        );
      } else {
        if (activePanel === e.webviewPanel) {
          activePanel = undefined;
          vscode.commands.executeCommand(
            "setContext",
            "rich-markdown-diff.isDiffActive",
            false,
          );
        }
      }
    });

    webviewPanel.onDidDispose(() => {
      if (activePanel === webviewPanel) {
        activePanel = undefined;
        vscode.commands.executeCommand(
          "setContext",
          "rich-markdown-diff.isDiffActive",
          false,
        );
      }
    });

    // Always set as active panel when first opened
    activePanel = webviewPanel;
    vscode.commands.executeCommand(
      "setContext",
      "rich-markdown-diff.isDiffActive",
      true,
    );

    const modifiedUri = document.uri;

    // Initial Render
    await this.updateWebview(webviewPanel, modifiedUri);

    // Listen for changes (Auto-refresh with Debounce)
    const debounceDelay = 500; // ms
    let timeout: NodeJS.Timeout;

    const changeDocumentSubscription = vscode.workspace.onDidChangeTextDocument(
      (e) => {
        if (e.document.uri.toString() === modifiedUri.toString()) {
          // Debounce
          clearTimeout(timeout);
          timeout = setTimeout(() => {
            this.updateWebview(webviewPanel, modifiedUri);
          }, debounceDelay);
        }
      },
    );

    // Make sure to dispose the listener when the panel is closed
    webviewPanel.onDidDispose(() => {
      changeDocumentSubscription.dispose();
    });

    // Handle Double Click
    webviewPanel.webview.onDidReceiveMessage(async (message) => {
      if (message.command === "openSource") {
        const side = message.side;
        const line = message.line;

        let uriToOpen = modifiedUri;
        if (side === "original") {
          // Construct git URI same as updateWebview
          const query = JSON.stringify({ path: modifiedUri.fsPath, ref: "~" });
          uriToOpen = modifiedUri.with({ scheme: "git", query });
        }

        try {
          const doc = await vscode.workspace.openTextDocument(uriToOpen);
          const editor = await vscode.window.showTextDocument(doc, {
            viewColumn: vscode.ViewColumn.One,
            preserveFocus: false,
          });

          if (line) {
            const range = new vscode.Range(line, 0, line, 0);
            editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
            editor.selection = new vscode.Selection(range.start, range.start);
          }
        } catch (e) {
          if (side === "original") {
            vscode.window.showWarningMessage(
              l10n.t(
                "Could not open original version (it might be a Git revision). Opening modified version instead.",
              ),
            );
            // Fallback to modified
            const doc = await vscode.workspace.openTextDocument(modifiedUri);
            const editor = await vscode.window.showTextDocument(doc, {
              viewColumn: vscode.ViewColumn.One,
            });
            if (line) {
              const range = new vscode.Range(line, 0, line, 0);
              editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
            }
          } else {
            vscode.window.showErrorMessage(
              l10n.t("Could not open file: {0}", String(e)),
            );
          }
        }
      }
    });
  }

  /**
   * Updates the webview content with the rendered diff.
   *
   * @param panel - The webview panel to update.
   * @param modifiedUri - The URI of the modified file to compare.
   */
  private async updateWebview(
    panel: vscode.WebviewPanel,
    modifiedUri: vscode.Uri,
  ) {
    let originalContent = "";
    let modifiedContent = "";

    try {
      // Get Modified Content
      const modifiedDoc = await vscode.workspace.openTextDocument(modifiedUri);
      modifiedContent = modifiedDoc.getText();

      // Get Original Content (Git)
      // Construct git URI: git:/path/to/file?{"path":"/path/to/file","ref":"~"}
      const query = JSON.stringify({ path: modifiedUri.fsPath, ref: "~" });
      const originalUri = modifiedUri.with({ scheme: "git", query });

      try {
        const originalDoc =
          await vscode.workspace.openTextDocument(originalUri);
        originalContent = originalDoc.getText();
      } catch {
        // If git lookup fails, show modified version only
        originalContent = "";
        vscode.window.showWarningMessage(
          l10n.t(
            "Could not load original version from Git. Showing modified version only.",
          ),
        );
      }

      await this.diffProvider.waitForReady();

      const resolver = createImageResolver(modifiedUri, panel.webview);
      const diffHtml = this.diffProvider.computeDiff(
        originalContent,
        modifiedContent,
        resolver,
      );
      const katexCssUri = panel.webview.asWebviewUri(
        vscode.Uri.joinPath(
          this.context.extensionUri,
          "media",
          "katex",
          "katex.min.css",
        ),
      );
      const mermaidJsUri = panel.webview.asWebviewUri(
        vscode.Uri.joinPath(
          this.context.extensionUri,
          "media",
          "mermaid",
          "mermaid.min.js",
        ),
      );
      const hljsLightCssUri = panel.webview.asWebviewUri(
        vscode.Uri.joinPath(
          this.context.extensionUri,
          "media",
          "highlight",
          "github.min.css",
        ),
      );
      const hljsDarkCssUri = panel.webview.asWebviewUri(
        vscode.Uri.joinPath(
          this.context.extensionUri,
          "media",
          "highlight",
          "github-dark.min.css",
        ),
      );

      panel.webview.html = this.diffProvider.getWebviewContent(
        diffHtml,
        katexCssUri.toString(),
        mermaidJsUri.toString(),
        hljsLightCssUri.toString(),
        hljsDarkCssUri.toString(),
        undefined,
        undefined,
        panel.webview.cspSource,
        getWebviewTranslations(),
      );
    } catch (e) {
      panel.webview.html = `<h1>${escapeHtml(l10n.t("Error reading file: {0}", String(e)))}</h1>`;
    }
  }
}

export function deactivate() {}
