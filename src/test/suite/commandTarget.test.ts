import * as assert from "assert";
import * as vscode from "vscode";
import { __test__, getCommandTarget } from "../../commandTarget";

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
