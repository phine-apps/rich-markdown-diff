/*
 * MIT License
 *
 * Copyright (c) 2026 Rich Markdown Diff Authors
 */

import * as crypto from "crypto";
import * as vscode from "vscode";
import { parseConflictBlocks, reconstructDocument, DocBlock } from "./markdown/conflictParser";
import { MarkdownDiffProvider } from "./markdownDiff";
import { escapeHtml } from "./markdown/sanitizer";

export class ConflictEditorProvider implements vscode.CustomTextEditorProvider {
  public static readonly viewType = "rich-markdown-diff.conflictResolver";

  constructor(private readonly context: vscode.ExtensionContext) {}

  public static register(context: vscode.ExtensionContext): vscode.Disposable {
    const provider = new ConflictEditorProvider(context);
    return vscode.window.registerCustomEditorProvider(
      ConflictEditorProvider.viewType,
      provider,
      {
        webviewOptions: {
          retainContextWhenHidden: true,
        },
        supportsMultipleEditorsPerDocument: false,
      }
    );
  }

  public async resolveCustomTextEditor(
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken
  ): Promise<void> {
    webviewPanel.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.context.extensionUri, "media"),
      ],
    };

    // [SEC-01] Generate a per-session nonce for CSP (same approach as webviewTemplate.ts)
    const nonce = crypto.randomBytes(16).toString("hex");

    // [UX-01] Set the shell HTML only once. Subsequent updates are sent via postMessage
    // to avoid a full Webview reload, which previously caused scroll-position race conditions.
    webviewPanel.webview.html = this.getShellHtml(nonce);

    const sendUpdate = () => {
      const text = document.getText();
      const blocks = parseConflictBlocks(text);
      const content = this.renderBlocksContent(blocks);
      webviewPanel.webview.postMessage({ command: "update", content });
    };

    const changeDocumentSubscription = vscode.workspace.onDidChangeTextDocument((e) => {
      if (e.document.uri.toString() === document.uri.toString()) {
        sendUpdate();
      }
    });

    webviewPanel.onDidDispose(() => {
      changeDocumentSubscription.dispose();
    });

    // [SEC-02] Allowlist for valid conflict resolution choices
    const VALID_CHOICES = ["mine", "theirs", "both"] as const;
    type ValidChoice = typeof VALID_CHOICES[number];

    webviewPanel.webview.onDidReceiveMessage(async (message) => {
      if (message.command === "resolveConflict") {
        const { blockId, choice } = message;

        // Validate choice against allowlist before applying
        if (typeof choice !== "string" || !VALID_CHOICES.includes(choice as ValidChoice)) {
          console.warn(`[ConflictEditorProvider] Rejected invalid choice: ${String(choice)}`);
          return;
        }

        const text = document.getText();
        const blocks = parseConflictBlocks(text);

        const targetBlock = blocks.find(
          (b) => b.type === "conflict" && b.id === blockId
        );
        if (targetBlock && targetBlock.type === "conflict") {
          targetBlock.choice = choice as ValidChoice;
          const newText = reconstructDocument(blocks);

          const edit = new vscode.WorkspaceEdit();
          const fullRange = new vscode.Range(
            document.positionAt(0),
            document.positionAt(text.length)
          );
          edit.replace(document.uri, fullRange, newText);
          await vscode.workspace.applyEdit(edit);
        }
      } else if (message.command === "ready") {
        // [UX-01] Webview signals that it is ready to receive content.
        // Send the initial content only after the Webview JS is fully initialised,
        // so the scroll-restore logic runs AFTER the DOM is populated.
        sendUpdate();
      }
    });

    // Do NOT call sendUpdate() here. The Webview JS fires "ready" once mounted,
    // which triggers sendUpdate() at the correct time.
  }

  /**
   * Returns the static shell HTML: styles + script only, no content.
   * This is set on the webview exactly once and never replaced afterwards.
   */
  private getShellHtml(nonce: string): string {
    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Visual Conflict Resolver</title>
        <style>
          body {
            font-family: var(--vscode-font-family, sans-serif);
            padding: 16px;
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
          }
          .common-block {
            margin-bottom: 16px;
          }
          .conflict-container {
            border: 2px solid var(--vscode-inputValidation-warningBorder, #cca700);
            border-radius: 6px;
            margin: 16px 0;
            overflow: hidden;
            background: var(--vscode-editor-inactiveSelectionBackground, rgba(255, 255, 255, 0.05));
          }
          .conflict-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 8px 12px;
            background: var(--vscode-editorHeader-noFolderBackground, #2d2d2d);
            border-bottom: 1px solid var(--vscode-panel-border, #444);
          }
          .conflict-badge {
            font-weight: bold;
            color: var(--vscode-editorWarning-foreground, #cca700);
          }
          .conflict-actions button {
            margin-left: 8px;
            padding: 4px 10px;
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            border-radius: 3px;
            cursor: pointer;
          }
          .conflict-actions button:hover {
            background: var(--vscode-button-hoverBackground);
          }
          .conflict-diff-preview {
            padding: 8px 12px;
            background: var(--vscode-editor-background);
            border-bottom: 1px dashed var(--vscode-panel-border, #444);
          }
          .diff-preview-title {
            font-size: 0.8em;
            font-weight: bold;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-bottom: 4px;
            opacity: 0.7;
          }
          .conflict-body {
            display: flex;
            gap: 12px;
            padding: 12px;
          }
          .side-pane {
            flex: 1;
            border: 1px solid var(--vscode-widget-border, #333);
            border-radius: 4px;
            padding: 8px;
            background: var(--vscode-editor-background);
          }
          .side-label {
            font-size: 0.85em;
            font-weight: bold;
            margin-bottom: 6px;
            opacity: 0.8;
          }
        </style>
      </head>
      <body>
        <div id="content"></div>
        <script nonce="${nonce}">
          const vscode = acquireVsCodeApi();

          // [UX-01] Persist scroll position across postMessage-based content updates.
          // Unlike full html replacement, innerHTML updates do not reset scroll,
          // but we save/restore explicitly to guard against any edge cases.
          let savedScrollY = 0;

          window.addEventListener('scroll', () => {
            savedScrollY = window.scrollY;
          });

          window.addEventListener('message', event => {
            const message = event.data;
            if (message.command === 'update') {
              // Save scroll before DOM mutation
              const prevScrollY = savedScrollY;
              document.getElementById('content').innerHTML = message.content;
              // Restore scroll after DOM mutation (synchronous, no flash)
              window.scrollTo(0, prevScrollY);
            }
          });

          function resolveConflict(blockId, choice) {
            vscode.postMessage({
              command: 'resolveConflict',
              blockId: blockId,
              choice: choice
            });
          }

          // Signal to the extension host that the Webview is ready to receive content.
          // This ensures the first sendUpdate() runs AFTER this script is initialised,
          // so the 'message' listener is already attached when the data arrives.
          vscode.postMessage({ command: 'ready' });
        </script>
      </body>
      </html>
    `;
  }

  /**
   * Renders blocks to an HTML string for injection into #content via postMessage.
   * Does NOT include <html>/<head>/<body> wrappers.
   */
  private renderBlocksContent(blocks: DocBlock[]): string {
    const diffProvider = new MarkdownDiffProvider();
    let bodyContent = "";

    for (const block of blocks) {
      if (block.type === "common") {
        const { html } = diffProvider.computeDiff(block.text, block.text);
        bodyContent += `<div class="common-block">${html}</div>`;
      } else {
        const safeMineLabel = escapeHtml(block.mineLabel || "Current (Mine)");
        const safeTheirsLabel = escapeHtml(block.theirsLabel || "Incoming (Theirs)");
        const safeBlockId = escapeHtml(block.id);

        // Compute Mine vs Theirs diff to show highlighted changes
        const { html: mineVsTheirsHtml } = diffProvider.computeDiff(block.mine, block.theirs);
        const { html: mineHtml } = diffProvider.computeDiff(block.mine, block.mine);
        const { html: theirsHtml } = diffProvider.computeDiff(block.theirs, block.theirs);

        bodyContent += `
          <div class="conflict-container" data-conflict-id="${safeBlockId}">
            <div class="conflict-header">
              <span class="conflict-badge">Conflict (${safeMineLabel} vs ${safeTheirsLabel})</span>
              <div class="conflict-actions">
                <button onclick="resolveConflict('${safeBlockId}', 'mine')">Accept Mine (${safeMineLabel})</button>
                <button onclick="resolveConflict('${safeBlockId}', 'theirs')">Accept Theirs (${safeTheirsLabel})</button>
                <button onclick="resolveConflict('${safeBlockId}', 'both')">Accept Both</button>
              </div>
            </div>
            <div class="conflict-diff-preview">
              <div class="diff-preview-title">Diff Preview (Mine → Theirs)</div>
              <div class="diff-preview-content">${mineVsTheirsHtml}</div>
            </div>
            <div class="conflict-body">
              <div class="side-pane side-mine">
                <div class="side-label">Mine (${safeMineLabel})</div>
                <div class="pane-content">${mineHtml}</div>
              </div>
              <div class="side-pane side-theirs">
                <div class="side-label">Theirs (${safeTheirsLabel})</div>
                <div class="pane-content">${theirsHtml}</div>
              </div>
            </div>
          </div>
        `;
      }
    }

    return bodyContent;
  }
}
