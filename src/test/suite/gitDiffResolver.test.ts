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
import {
  describeComparisonSide,
  getComparisonHintFromUris,
  getGitUriRef,
  GitApi,
  GitChange,
  GitRepository,
  isRevisionRef,
  resolveSingleFileComparison,
  shortenRef,
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

  it("should infer index hint when originalRef is HEAD and modifiedUri is undefined (M-1)", () => {
    const originalUri = fileUri.with({
      scheme: "git",
      query: JSON.stringify({ path: fileUri.fsPath, ref: "HEAD" }),
    });

    assert.strictEqual(
      getComparisonHintFromUris(originalUri, undefined),
      "index",
    );
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

describe("Revision Refs", () => {
  const commitSha = "c02e3e4a1b2c3d4e5f60718293a4b5c6d7e8f901";

  it("should treat a commit SHA as a revision", () => {
    assert.strictEqual(isRevisionRef(commitSha), true);
  });

  it("should treat branch and tag names as revisions", () => {
    assert.strictEqual(isRevisionRef("main"), true);
    assert.strictEqual(isRevisionRef("v1.4.0"), true);
    assert.strictEqual(isRevisionRef("HEAD~3"), true);
  });

  it("should not treat the index ref as a revision", () => {
    assert.strictEqual(isRevisionRef(""), false);
  });

  it("should not treat the working tree ref as a revision", () => {
    assert.strictEqual(isRevisionRef("~"), false);
  });

  it("should not treat HEAD as a revision", () => {
    assert.strictEqual(isRevisionRef("HEAD"), false);
  });

  it("should not treat a missing ref as a revision", () => {
    assert.strictEqual(isRevisionRef(undefined), false);
  });

  it("should shorten a full commit SHA for display", () => {
    assert.strictEqual(shortenRef(commitSha), "c02e3e4");
  });

  it("should leave branch names and short refs unshortened", () => {
    assert.strictEqual(shortenRef("main"), "main");
    assert.strictEqual(shortenRef("v1.4.0"), "v1.4.0");
    assert.strictEqual(shortenRef("c02e3e4"), "c02e3e4");
  });
});

describe("Comparison Side Labels", () => {
  const fileUri = vscode.Uri.file("/repo/docs/example.md");
  const commitSha = "c02e3e4a1b2c3d4e5f60718293a4b5c6d7e8f901";

  const gitUri = (ref: string) =>
    fileUri.with({
      scheme: "git",
      query: JSON.stringify({ path: fileUri.fsPath, ref }),
    });

  it("should label a commit side with its shortened SHA", () => {
    assert.strictEqual(describeComparisonSide(gitUri(commitSha)), "c02e3e4");
  });

  it("should label a branch side with its name", () => {
    assert.strictEqual(describeComparisonSide(gitUri("main")), "main");
  });

  it("should label the HEAD side", () => {
    assert.strictEqual(describeComparisonSide(gitUri("HEAD")), "HEAD");
  });

  it("should label the index side as staged", () => {
    assert.strictEqual(describeComparisonSide(gitUri("")), "Staged");
  });

  it("should label the working tree side", () => {
    assert.strictEqual(describeComparisonSide(gitUri("~")), "Working Tree");
    assert.strictEqual(describeComparisonSide(fileUri), "Working Tree");
  });
});
