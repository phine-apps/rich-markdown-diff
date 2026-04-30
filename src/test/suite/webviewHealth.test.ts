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
import * as path from "path";
import * as fs from "fs";
import * as os from "os";

describe("Webview Health Test", () => {
    let tmpFile: vscode.Uri;

    before(async () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "rich-md-diff-health-"));
        const filePath = path.join(tmpDir, "health.md");
        fs.writeFileSync(filePath, "# Health Test\n\nThis is a test.");
        tmpFile = vscode.Uri.file(filePath);

        const ext = vscode.extensions.getExtension("phine-apps.rich-markdown-diff");
        if (ext) {
            await ext.activate();
        }
    });

    after(() => {
        if (tmpFile && fs.existsSync(tmpFile.fsPath)) {
            try {
                fs.unlinkSync(tmpFile.fsPath);
                fs.rmdirSync(path.dirname(tmpFile.fsPath));
            } catch {
                // Ignore errors during cleanup
            }
        }
    });

    it("Webview should signal 'ready' after successful script initialization", async function() {
        this.timeout(10000); // 10 seconds timeout

        // Open the document and make it dirty so it's considered "actionable" for a diff
        const doc = await vscode.workspace.openTextDocument(tmpFile);
        const editor = await vscode.window.showTextDocument(doc);
        await editor.edit(editBuilder => {
            editBuilder.insert(new vscode.Position(0, 0), " ");
        });

        // Trigger the diff
        await vscode.commands.executeCommand("rich-markdown-diff.showRenderedDiff", tmpFile);

        // Wait up to 5 seconds for the 'ready' signal via a temporary test command
        let ready = false;
        
        console.log("Starting webview health polling...");
        for (let i = 0; i < 20; i++) {
            try {
                const isReady = await vscode.commands.executeCommand("rich-markdown-diff.getTestStatus", "webviewReady") as boolean;
                console.log(`Poll ${i+1}: isReady=${isReady}`);
                if (isReady) {
                    ready = true;
                    break;
                }
            } catch {
                // Command doesn't exist yet, so it's not ready
            }
            await new Promise(resolve => setTimeout(resolve, 500));
        }

        assert.strictEqual(ready, true, "Webview failed to signal 'ready' within 5s. (This failure is EXPECTED in Phase 1)");
    });
});
