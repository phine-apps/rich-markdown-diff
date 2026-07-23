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
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import * as vscode from "vscode";
import {
  __test__,
  getActiveDiffTabUriPair,
  getActiveRevisionComparison,
  getCommandTarget,
  getRevisionComparison,
  refersToSameFile,
} from "../../commandTarget";

describe("Command Target Parsing", () => {
  const fileUri = vscode.Uri.file("/repo/docs/example.md");

  it("should preserve direct file URIs", () => {
    const commandTarget = getCommandTarget(fileUri);

    assert.ok(commandTarget, "Expected a command target");
    assert.strictEqual(commandTarget?.targetUri.toString(), fileUri.toString());
    assert.strictEqual(commandTarget?.comparisonHint, "auto");
  });

  it("should infer working tree comparison from nested SCM command arguments", () => {
    const originalUri = fileUri.with({
      scheme: "git",
      query: JSON.stringify({ path: fileUri.fsPath, ref: "~" }),
    });

    const commandTarget = getCommandTarget({
      resourceUri: fileUri,
      command: {
        title: "Open Changes",
        command: "vscode.diff",
        arguments: [{ leftUri: originalUri, rightUri: fileUri }],
      },
    });

    assert.ok(commandTarget, "Expected a command target");
    assert.strictEqual(commandTarget?.targetUri.toString(), fileUri.toString());
    assert.strictEqual(commandTarget?.comparisonHint, "workingTree");
  });

  it("should resolve SCM resource arrays to the first actionable resource", () => {
    const originalUri = fileUri.with({
      scheme: "git",
      query: JSON.stringify({ path: fileUri.fsPath, ref: "~" }),
    });

    const commandTarget = getCommandTarget([
      {
        resourceUri: fileUri,
        command: {
          title: "Open Changes",
          command: "vscode.diff",
          arguments: [{ leftUri: originalUri, rightUri: fileUri }],
        },
      },
    ]);

    assert.ok(commandTarget, "Expected a command target");
    assert.strictEqual(commandTarget?.targetUri.toString(), fileUri.toString());
    assert.strictEqual(commandTarget?.comparisonHint, "workingTree");
  });

  it("should skip invalid SCM selections when resolving arrays", () => {
    const secondUri = vscode.Uri.file("/repo/docs/second.md");
    const commandTarget = getCommandTarget([
      undefined,
      { resourceUri: secondUri, contextValue: "workingTreeModifiedResource" },
    ]);

    assert.ok(commandTarget, "Expected a command target");
    assert.strictEqual(
      commandTarget?.targetUri.toString(),
      secondUri.toString(),
    );
    assert.strictEqual(commandTarget?.comparisonHint, "workingTree");
  });

  it("should infer staged comparison from command arguments when right side is the index", () => {
    const originalUri = fileUri.with({
      scheme: "git",
      query: JSON.stringify({ path: fileUri.fsPath, ref: "HEAD" }),
    });
    const modifiedUri = fileUri.with({
      scheme: "git",
      query: JSON.stringify({ path: fileUri.fsPath, ref: "" }),
    });

    const commandTarget = getCommandTarget({
      resourceUri: fileUri,
      command: {
        title: "Open Staged Changes",
        command: "vscode.diff",
        arguments: [originalUri, modifiedUri],
      },
    });

    assert.ok(commandTarget, "Expected a command target");
    assert.strictEqual(commandTarget?.targetUri.toString(), fileUri.toString());
    assert.strictEqual(commandTarget?.comparisonHint, "index");
  });

  it("should fall back to context markers when SCM URIs are unavailable", () => {
    const commandTarget = getCommandTarget({
      resourceUri: fileUri,
      contextValue: "indexModifiedResource",
    });

    assert.ok(commandTarget, "Expected a command target");
    assert.strictEqual(commandTarget?.comparisonHint, "index");
  });

  it("should normalize git URIs back to workspace file URIs", () => {
    const gitUri = fileUri.with({
      scheme: "git",
      query: JSON.stringify({ path: fileUri.fsPath, ref: "HEAD" }),
    });

    const normalized = __test__.toFileBackedUri(gitUri);
    assert.strictEqual(normalized.toString(), fileUri.toString());
  });
});

describe("Revision Comparison Detection", () => {
  const fileUri = vscode.Uri.file("/repo/docs/example.md");
  const parentSha = "a1b2c3d4e5f60718293a4b5c6d7e8f9012345678";
  const commitSha = "c02e3e4a1b2c3d4e5f60718293a4b5c6d7e8f901";

  const gitUri = (ref: string) =>
    fileUri.with({
      scheme: "git",
      query: JSON.stringify({ path: fileUri.fsPath, ref }),
    });

  it("should detect a commit-to-commit comparison", () => {
    const comparison = getRevisionComparison(
      gitUri(parentSha),
      gitUri(commitSha),
    );

    assert.ok(comparison, "Expected a revision comparison");
    assert.strictEqual(
      comparison?.originalUri.toString(),
      gitUri(parentSha).toString(),
    );
    assert.strictEqual(
      comparison?.modifiedUri.toString(),
      gitUri(commitSha).toString(),
    );
  });

  it("should detect a comparison between a commit and the working tree", () => {
    const comparison = getRevisionComparison(gitUri(commitSha), fileUri);

    assert.ok(comparison, "Expected a revision comparison");
    assert.strictEqual(comparison?.modifiedUri.toString(), fileUri.toString());
  });

  it("should ignore HEAD-to-working-tree comparisons", () => {
    assert.strictEqual(
      getRevisionComparison(gitUri("HEAD"), fileUri),
      undefined,
    );
  });

  it("should ignore staged comparisons", () => {
    assert.strictEqual(
      getRevisionComparison(gitUri("HEAD"), gitUri("")),
      undefined,
    );
  });

  it("should ignore working-tree comparisons", () => {
    assert.strictEqual(getRevisionComparison(gitUri("~"), fileUri), undefined);
  });

  it("should ignore comparisons between plain files", () => {
    const otherUri = vscode.Uri.file("/repo/docs/other.md");
    assert.strictEqual(getRevisionComparison(fileUri, otherUri), undefined);
  });

  it("should ignore comparisons with a missing side", () => {
    assert.strictEqual(
      getRevisionComparison(gitUri(commitSha), undefined),
      undefined,
    );
    assert.strictEqual(
      getRevisionComparison(undefined, gitUri(commitSha)),
      undefined,
    );
  });
});

describe("Active Diff Tab Detection", () => {
  const createdDirs: string[] = [];

  async function createMarkdownFile(
    dir: string,
    name: string,
    contents: string,
  ): Promise<vscode.Uri> {
    const filePath = path.join(dir, name);
    await fs.writeFile(filePath, contents, "utf8");
    return vscode.Uri.file(filePath);
  }

  async function createTempDir(): Promise<string> {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "rmd-diff-tab-"));
    createdDirs.push(dir);
    return dir;
  }

  afterEach(async () => {
    await vscode.commands.executeCommand("workbench.action.closeAllEditors");

    // Windows can still hold a handle on a just-closed editor, so removing the
    // scratch directory is best effort - it lives under the OS temp directory.
    await Promise.all(
      createdDirs.splice(0).map(async (dir) => {
        try {
          await fs.rm(dir, { recursive: true, force: true });
        } catch {
          // Leave the directory for the OS to reclaim.
        }
      }),
    );
  });

  it("should read both sides of the active diff editor", async () => {
    const dir = await createTempDir();
    const originalUri = await createMarkdownFile(dir, "left.md", "# One\n");
    const modifiedUri = await createMarkdownFile(dir, "right.md", "# Two\n");

    await vscode.commands.executeCommand(
      "vscode.diff",
      originalUri,
      modifiedUri,
      "Rich Markdown Diff Test",
    );

    const pair = getActiveDiffTabUriPair();

    assert.ok(pair, "Expected the active diff tab to be detected");
    assert.strictEqual(pair?.originalUri.toString(), originalUri.toString());
    assert.strictEqual(pair?.modifiedUri.toString(), modifiedUri.toString());
  });

  it("should ignore a plain text editor", async () => {
    const dir = await createTempDir();
    const fileUri = await createMarkdownFile(dir, "single.md", "# Only\n");

    const document = await vscode.workspace.openTextDocument(fileUri);
    await vscode.window.showTextDocument(document);

    assert.strictEqual(getActiveDiffTabUriPair(), undefined);
  });
});

describe("Same File Detection", () => {
  const fileUri = vscode.Uri.file("/repo/docs/example.md");
  const commitSha = "c02e3e4a1b2c3d4e5f60718293a4b5c6d7e8f901";

  const gitUri = (uri: vscode.Uri, ref: string) =>
    uri.with({
      scheme: "git",
      query: JSON.stringify({ path: uri.fsPath, ref }),
    });

  it("should match a git revision URI against its working tree file", () => {
    assert.strictEqual(refersToSameFile(gitUri(fileUri, commitSha), fileUri), true);
  });

  it("should match two revisions of the same file", () => {
    assert.strictEqual(
      refersToSameFile(gitUri(fileUri, commitSha), gitUri(fileUri, "HEAD")),
      true,
    );
  });

  it("should not match different files", () => {
    const otherUri = vscode.Uri.file("/repo/docs/other.md");
    assert.strictEqual(
      refersToSameFile(gitUri(otherUri, commitSha), fileUri),
      false,
    );
  });
});

describe("Active Revision Comparison", () => {
  const fileUri = vscode.Uri.file(
    path.join(os.tmpdir(), "rmd-active-rev", "doc.md"),
  );
  const parentSha = "a1b2c3d4e5f60718293a4b5c6d7e8f9012345678";
  const commitSha = "c02e3e4a1b2c3d4e5f60718293a4b5c6d7e8f901";

  const gitUri = (ref: string) =>
    fileUri.with({
      scheme: "git",
      query: JSON.stringify({ path: fileUri.fsPath, ref }),
    });

  afterEach(async () => {
    await vscode.commands.executeCommand("workbench.action.closeAllEditors");
  });

  it("detects a commit-to-commit diff tab", async () => {
    await vscode.commands.executeCommand(
      "vscode.diff",
      gitUri(parentSha),
      gitUri(commitSha),
      "doc.md (commit)",
    );

    const revision = getActiveRevisionComparison();

    assert.ok(revision, "Expected a revision comparison");
    assert.strictEqual(
      revision?.modifiedUri.toString(),
      gitUri(commitSha).toString(),
    );
  });

  it("ignores a HEAD-to-working-tree diff tab", async () => {
    await vscode.commands.executeCommand(
      "vscode.diff",
      gitUri("HEAD"),
      fileUri,
      "doc.md (changes)",
    );

    assert.strictEqual(getActiveRevisionComparison(), undefined);
  });

  it("ignores a plain markdown editor", async () => {
    const document = await vscode.workspace.openTextDocument({
      language: "markdown",
      content: "# Heading\n",
    });
    await vscode.window.showTextDocument(document);

    assert.strictEqual(getActiveRevisionComparison(), undefined);
  });
});
