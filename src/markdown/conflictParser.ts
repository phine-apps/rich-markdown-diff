/*
 * MIT License
 *
 * Copyright (c) 2026 Rich Markdown Diff Authors
 */

import { MarkdownDiffProvider } from "../markdownDiff";
import { escapeHtml } from "./sanitizer";

export interface CommonBlock {
  type: "common";
  text: string;
}

export interface ConflictBlock {
  type: "conflict";
  id: string;
  mine: string;
  theirs: string;
  base?: string;
  mineLabel?: string;
  theirsLabel?: string;
  startLine: number;
  endLine: number;
  choice?: "mine" | "theirs" | "both";
}

export type DocBlock = CommonBlock | ConflictBlock;

/**
 * Returns the static shell HTML: styles + script only, no content.
 * This is set on the webview exactly once and never replaced afterwards.
 */
export function getConflictResolverShellHtml(nonce: string): string {
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

        // Event delegation for conflict resolution buttons to comply with CSP
        document.addEventListener('click', event => {
          const target = event.target;
          if (target && target instanceof Element) {
            const btn = target.closest('.btn-resolve');
            if (btn) {
              const blockId = btn.getAttribute('data-block-id');
              const choice = btn.getAttribute('data-choice');
              if (blockId && choice) {
                resolveConflict(blockId, choice);
              }
            }
          }
        });

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
export function renderConflictBlocks(blocks: DocBlock[]): string {
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
              <button type="button" class="btn-resolve" data-block-id="${safeBlockId}" data-choice="mine">Accept Mine (${safeMineLabel})</button>
              <button type="button" class="btn-resolve" data-block-id="${safeBlockId}" data-choice="theirs">Accept Theirs (${safeTheirsLabel})</button>
              <button type="button" class="btn-resolve" data-block-id="${safeBlockId}" data-choice="both">Accept Both</button>
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

/**
 * Parses markdown text containing Git conflict markers (<<<<<<<, |||||||, =======, >>>>>>>)
 * into a sequence of Common and Conflict blocks.
 */
export function parseConflictBlocks(content: string): DocBlock[] {
  const lines = content.split(/\r?\n/);
  const blocks: DocBlock[] = [];

  let currentCommonLines: string[] = [];
  let inConflict = false;

  let conflictIdCounter = 1;
  let conflictMineLines: string[] = [];
  let conflictBaseLines: string[] = [];
  let conflictTheirsLines: string[] = [];
  let mineLabel = "";
  let conflictStartLine = 0;
  let section: "mine" | "base" | "theirs" = "mine";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Git conflict markers start with <<<<<<<, |||||||, =======, >>>>>>>
    if (line.startsWith("<<<<<<<")) {
      if (currentCommonLines.length > 0) {
        blocks.push({
          type: "common",
          text: currentCommonLines.join("\n"),
        });
        currentCommonLines = [];
      }
      inConflict = true;
      section = "mine";
      conflictStartLine = i;
      mineLabel = line.substring(7).trim() || "Current (Mine)";
      conflictMineLines = [];
      conflictBaseLines = [];
      conflictTheirsLines = [];
      continue;
    }

    if (inConflict && line.startsWith("|||||||")) {
      section = "base";
      continue;
    }

    if (inConflict && line.startsWith("=======")) {
      section = "theirs";
      continue;
    }

    if (inConflict && line.startsWith(">>>>>>>")) {
      const theirsLabel = line.substring(7).trim() || "Incoming (Theirs)";
      blocks.push({
        type: "conflict",
        id: `conflict-${conflictIdCounter++}`,
        mine: conflictMineLines.join("\n"),
        theirs: conflictTheirsLines.join("\n"),
        base: conflictBaseLines.length > 0 ? conflictBaseLines.join("\n") : undefined,
        mineLabel,
        theirsLabel,
        startLine: conflictStartLine,
        endLine: i,
      });
      inConflict = false;
      continue;
    }

    if (inConflict) {
      if (section === "base") {
        conflictBaseLines.push(line);
      } else if (section === "theirs") {
        conflictTheirsLines.push(line);
      } else {
        conflictMineLines.push(line);
      }
    } else {
      currentCommonLines.push(line);
    }
  }

  // Safely rescue unclosed conflict marker
  if (inConflict) {
    const unclosedLines: string[] = [
      `<<<<<<< ${mineLabel}`,
      ...conflictMineLines,
    ];
    if (conflictBaseLines.length > 0) {
      unclosedLines.push("|||||||");
      unclosedLines.push(...conflictBaseLines);
    }
    if (section === "theirs") {
      unclosedLines.push("=======");
      unclosedLines.push(...conflictTheirsLines);
    }
    currentCommonLines.push(...unclosedLines);
  }

  if (currentCommonLines.length > 0) {
    blocks.push({
      type: "common",
      text: currentCommonLines.join("\n"),
    });
  }

  return blocks;
}

/**
 * Reconstructs document text based on conflict choices made by the user.
 */
export function reconstructDocument(blocks: DocBlock[]): string {
  const resultLines: string[] = [];

  for (const block of blocks) {
    if (block.type === "common") {
      resultLines.push(block.text);
    } else {
      if (block.choice === "mine") {
        resultLines.push(block.mine);
      } else if (block.choice === "theirs") {
        resultLines.push(block.theirs);
      } else if (block.choice === "both") {
        resultLines.push(block.mine);
        resultLines.push(block.theirs);
      } else {
        // Unresolved: keep conflict markers intact
        resultLines.push(`<<<<<<< ${block.mineLabel || "HEAD"}`);
        resultLines.push(block.mine);
        if (block.base !== undefined) {
          resultLines.push("|||||||");
          resultLines.push(block.base);
        }
        resultLines.push("=======");
        resultLines.push(block.theirs);
        resultLines.push(`>>>>>>> ${block.theirsLabel || "Incoming"}`);
      }
    }
  }

  return resultLines.join("\n");
}
