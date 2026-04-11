import * as assert from "assert";
import * as vscode from "vscode";
import {
  getComparisonHintFromUris,
  getGitUriRef,
  GitApi,
  GitChange,
  GitRepository,
  resolveSingleFileComparison,
} from "../../gitDiffResolver";

class FakeRepository implements GitRepository {
  public readonly rootUri = vscode.Uri.file("/repo");
  private readonly emitter = new vscode.EventEmitter<void>();

  public readonly state: GitRepository["state"];

  constructor(state: {
    HEAD?: unknown;
    indexChanges?: readonly GitChange[];
    workingTreeChanges?: readonly GitChange[];
    untrackedChanges?: readonly GitChange[];
  }) {
    this.state = {
      HEAD: state.HEAD,
      indexChanges: state.indexChanges ?? [],
      workingTreeChanges: state.workingTreeChanges ?? [],
      untrackedChanges: state.untrackedChanges ?? [],
      onDidChange: this.emitter.event,
    };
  }

  async status(): Promise<void> {
    return Promise.resolve();
  }
}

function createGitApi(repository: GitRepository): GitApi {
  return {
    getRepository: () => repository,
    toGitUri: (uri, ref) =>
      uri.with({
        scheme: "git",
        query: JSON.stringify({ path: uri.fsPath, ref }),
      }),
  };
}

describe("Git Diff Resolver", () => {
  const fileUri = vscode.Uri.file("/repo/docs/example.md");

  it("should infer working tree hint from cascading git URI", () => {
    const originalUri = fileUri.with({
      scheme: "git",
      query: JSON.stringify({ path: fileUri.fsPath, ref: "~" }),
    });

    assert.strictEqual(
      getComparisonHintFromUris(originalUri, fileUri),
      "workingTree",
    );
  });

  it("should resolve mixed staged and unstaged changes to working tree versus index", async () => {
    const repository = new FakeRepository({
      HEAD: { name: "main" },
      indexChanges: [
        {
          uri: fileUri,
          originalUri: fileUri,
          modifiedUri: fileUri,
        },
      ],
      workingTreeChanges: [
        {
          uri: fileUri,
          originalUri: fileUri,
          modifiedUri: fileUri,
        },
      ],
    });

    const comparison = await resolveSingleFileComparison(
      fileUri,
      "auto",
      createGitApi(repository),
    );

    assert.strictEqual(comparison.kind, "workingTreeToIndex");
    assert.strictEqual(getGitUriRef(comparison.originalUri), "~");
    assert.strictEqual(comparison.modifiedUri?.scheme, "file");
    assert.strictEqual(comparison.originalLabel, "Staged");
    assert.strictEqual(comparison.modifiedLabel, "Working Tree");
  });

  it("should resolve staged-only added files to index versus empty", async () => {
    const repository = new FakeRepository({
      indexChanges: [
        {
          uri: fileUri,
          originalUri: undefined,
          modifiedUri: fileUri,
        },
      ],
    });

    const comparison = await resolveSingleFileComparison(
      fileUri,
      "auto",
      createGitApi(repository),
    );

    assert.strictEqual(comparison.kind, "indexOnly");
    assert.strictEqual(comparison.originalUri, undefined);
    assert.strictEqual(getGitUriRef(comparison.modifiedUri), "");
    assert.strictEqual(comparison.originalLabel, "Empty");
    assert.strictEqual(comparison.modifiedLabel, "Staged");
  });

  it("should resolve tracked unstaged changes to working tree versus HEAD", async () => {
    const repository = new FakeRepository({
      HEAD: { name: "main" },
      workingTreeChanges: [
        {
          uri: fileUri,
          originalUri: fileUri,
          modifiedUri: fileUri,
        },
      ],
    });

    const comparison = await resolveSingleFileComparison(
      fileUri,
      "auto",
      createGitApi(repository),
    );

    assert.strictEqual(comparison.kind, "workingTreeToHead");
    assert.strictEqual(getGitUriRef(comparison.originalUri), "HEAD");
    assert.strictEqual(comparison.originalLabel, "HEAD");
    assert.strictEqual(comparison.modifiedLabel, "Working Tree");
  });

  it("should resolve unstaged deletions to HEAD versus working tree", async () => {
    const repository = new FakeRepository({
      HEAD: { name: "main" },
      workingTreeChanges: [
        {
          uri: fileUri,
          originalUri: fileUri,
          modifiedUri: undefined,
        },
      ],
    });

    const comparison = await resolveSingleFileComparison(
      fileUri,
      "auto",
      createGitApi(repository),
    );

    assert.strictEqual(comparison.kind, "workingTreeToHead");
    assert.strictEqual(getGitUriRef(comparison.originalUri), "HEAD");
    assert.strictEqual(comparison.modifiedUri?.toString(), fileUri.toString());
  });

  it("should resolve staged deletions to HEAD versus index", async () => {
    const repository = new FakeRepository({
      HEAD: { name: "main" },
      indexChanges: [
        {
          uri: fileUri,
          originalUri: fileUri,
          modifiedUri: undefined,
        },
      ],
    });

    const comparison = await resolveSingleFileComparison(
      fileUri,
      "index",
      createGitApi(repository),
    );

    assert.strictEqual(comparison.kind, "indexToHead");
    assert.strictEqual(getGitUriRef(comparison.originalUri), "HEAD");
    assert.strictEqual(getGitUriRef(comparison.modifiedUri), "");
  });

  it("should resolve clean tracked files to HEAD versus working tree", async () => {
    const repository = new FakeRepository({
      HEAD: { name: "main" },
    });

    const comparison = await resolveSingleFileComparison(
      fileUri,
      "auto",
      createGitApi(repository),
    );

    assert.strictEqual(comparison.kind, "cleanHeadToWorkingTree");
    assert.strictEqual(getGitUriRef(comparison.originalUri), "HEAD");
    assert.strictEqual(comparison.modifiedUri?.toString(), fileUri.toString());
  });
});
