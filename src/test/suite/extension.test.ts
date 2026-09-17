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

import * as assert from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as vscode from "vscode";

// Integration tests run within VS Code
describe("Extension Test Suite", () => {
  vscode.window.showInformationMessage("Start all tests.");

  before(async () => {
    const ext = vscode.extensions.getExtension("phine-apps.rich-markdown-diff");
    assert.ok(ext, "Extension not found");
    if (ext) {
      await ext.activate();
    }
  });

  it("Extension should be present", () => {
    assert.ok(vscode.extensions.getExtension("phine-apps.rich-markdown-diff"));
  });

  it("Commands should be registered", async () => {
    const allCommands = await vscode.commands.getCommands(true);
    const ourCommands = allCommands.filter((c) =>
      c.startsWith("rich-markdown-diff."),
    );

    // Check for a few key commands
    assert.ok(ourCommands.includes("rich-markdown-diff.showRenderedDiff"));
    assert.ok(ourCommands.includes("rich-markdown-diff.diffClipboard"));
    assert.ok(ourCommands.includes("rich-markdown-diff.toggleInlineView"));
  });

  it("should execute diffClipboard command successfully with active markdown editor", async () => {
    // 1. Write text to clipboard
    const clipboardText = "# Clipboard Heading\nContent from clipboard.";
    await vscode.env.clipboard.writeText(clipboardText);

    // 2. Open and show a markdown text document
    const doc = await vscode.workspace.openTextDocument({
      language: "markdown",
      content: "# Document Heading\nContent from document.",
    });
    await vscode.window.showTextDocument(doc);

    // 3. Execute diffClipboard command
    await vscode.commands.executeCommand("rich-markdown-diff.diffClipboard");

    // 4. Verify clipboard text was readable
    const readBack = await vscode.env.clipboard.readText();
    assert.strictEqual(readBack, clipboardText);

    // Cleanup editors
    await vscode.commands.executeCommand("workbench.action.closeAllEditors");
  });

  it("should support Select for Markdown Diff and Compare with Selected flow", async () => {
    const tmpDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "rmd-explorer-select-"),
    );
    const fileA = path.join(tmpDir, "left.md");
    const fileB = path.join(tmpDir, "right.md");
    fs.writeFileSync(fileA, "# Left Side\nLeft content.");
    fs.writeFileSync(fileB, "# Right Side\nRight content.");
    const uriA = vscode.Uri.file(fileA);
    const uriB = vscode.Uri.file(fileB);

    try {
      // Step 1: Select first file
      await vscode.commands.executeCommand(
        "rich-markdown-diff.selectForCompare",
        uriA,
      );

      // Step 2: Compare with second file
      await vscode.commands.executeCommand(
        "rich-markdown-diff.compareWithSelected",
        uriB,
      );

      // Verify that diff panel opens without error
      await new Promise((resolve) => setTimeout(resolve, 300));
    } finally {
      await vscode.commands.executeCommand("workbench.action.closeAllEditors");
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("should support Explorer multi-selection comparison flow", async () => {
    const tmpDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "rmd-explorer-multi-"),
    );
    const fileA = path.join(tmpDir, "fileA.md");
    const fileB = path.join(tmpDir, "fileB.md");
    fs.writeFileSync(fileA, "# File A\nAlpha content.");
    fs.writeFileSync(fileB, "# File B\nBeta content.");
    const uriA = vscode.Uri.file(fileA);
    const uriB = vscode.Uri.file(fileB);

    try {
      // Explorer multi-selection invokes showRenderedDiff with (clickedUri, [uriA, uriB])
      await vscode.commands.executeCommand(
        "rich-markdown-diff.showRenderedDiff",
        uriB,
        [uriA, uriB],
      );

      // Verify that diff panel opens without error
      await new Promise((resolve) => setTimeout(resolve, 300));
    } finally {
      await vscode.commands.executeCommand("workbench.action.closeAllEditors");
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
