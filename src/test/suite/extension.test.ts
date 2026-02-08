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
});
