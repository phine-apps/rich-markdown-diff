/*
 * MIT License
 *
 * Copyright (c) 2026 Rich Markdown Diff Authors
 */

import * as crypto from "crypto";
import * as vscode from "vscode";
import {
  parseConflictBlocks,
  reconstructDocument,
  DocBlock,
  getConflictResolverShellHtml,
  renderConflictBlocks,
} from "./markdown/conflictParser";

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
  public getShellHtml(nonce: string): string {
    return getConflictResolverShellHtml(nonce);
  }

  /**
   * Renders blocks to an HTML string for injection into #content via postMessage.
   * Does NOT include <html>/<head>/<body> wrappers.
   */
  public renderBlocksContent(blocks: DocBlock[]): string {
    return renderConflictBlocks(blocks);
  }
}
