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

import * as vscode from "vscode";

export type GitComparisonHint = "auto" | "workingTree" | "index";

export type GitComparisonKind =
  | "workingTreeToIndex"
  | "workingTreeToHead"
  | "workingTreeOnly"
  | "indexToHead"
  | "indexOnly"
  | "cleanHeadToWorkingTree"
  | "fileOnly";

export interface GitChange {
  readonly uri: vscode.Uri;
  readonly originalUri?: vscode.Uri;
  readonly modifiedUri?: vscode.Uri;
}

interface GitRepositoryState {
  readonly HEAD?: unknown;
  readonly indexChanges: readonly GitChange[];
  readonly workingTreeChanges: readonly GitChange[];
  readonly untrackedChanges: readonly GitChange[];
  readonly onDidChange: vscode.Event<void>;
}

export interface GitRepository {
  readonly rootUri: vscode.Uri;
  readonly state: GitRepositoryState;
  status(): Promise<void>;
}

export interface GitApi {
  getRepository(uri: vscode.Uri): GitRepository | null;
  toGitUri(uri: vscode.Uri, ref: string): vscode.Uri;
}

interface GitExtension {
  readonly enabled: boolean;
  getAPI(version: 1): GitApi;
}

export interface ResolvedGitComparison {
  readonly targetUri: vscode.Uri;
  readonly originalUri?: vscode.Uri;
  readonly modifiedUri?: vscode.Uri;
  readonly originalLabel: string;
  readonly modifiedLabel: string;
  readonly watchUris: readonly vscode.Uri[];
  readonly repository?: GitRepository;
  readonly kind: GitComparisonKind;
}

export interface ResolveSingleFileComparisonOptions {
  readonly refreshStatus?: boolean;
}

interface ChangePresence {
  readonly indexChange?: GitChange;
  readonly workingChange?: GitChange;
  readonly untrackedChange?: GitChange;
  readonly hasHead: boolean;
}

const EMPTY_LABEL = "Empty";
const HEAD_LABEL = "HEAD";
const INDEX_LABEL = "Staged";
const WORKING_TREE_LABEL = "Working Tree";

function normalizeFsPath(fsPath: string): string {
  const normalized = fsPath.replace(/\\/g, "/");
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

function isMatchingUri(
  candidate: vscode.Uri | undefined,
  targetUri: vscode.Uri,
): boolean {
  return (
    !!candidate &&
    normalizeFsPath(candidate.fsPath) === normalizeFsPath(targetUri.fsPath)
  );
}

function findChange(
  changes: readonly GitChange[],
  targetUri: vscode.Uri,
): GitChange | undefined {
  return changes.find(
    (change) =>
      isMatchingUri(change.uri, targetUri) ||
      isMatchingUri(change.originalUri, targetUri) ||
      isMatchingUri(change.modifiedUri, targetUri),
  );
}

function getChangePresence(
  repository: GitRepository,
  targetUri: vscode.Uri,
): ChangePresence {
  const state = repository.state;
  return {
    indexChange: findChange(state.indexChanges, targetUri),
    workingChange: findChange(state.workingTreeChanges, targetUri),
    untrackedChange: findChange(state.untrackedChanges, targetUri),
    hasHead: Boolean(state.HEAD),
  };
}

function getModifiedWorkingTreeUri(
  targetUri: vscode.Uri,
  workingChange?: GitChange,
  untrackedChange?: GitChange,
): vscode.Uri | undefined {
  // For working-tree comparisons the modified side is always the file
  // on disk. If the file was deleted, `readDocumentText` will fail
  // gracefully and return "", which correctly renders as empty content.
  //
  // We do NOT rely on `Change.modifiedUri` because the VS Code Git
  // extension does not reliably populate it on every `Change` instance.
  if (workingChange || untrackedChange) {
    return targetUri;
  }
  return targetUri;
}

function resolveWorkingTreeComparison(
  gitApi: GitApi,
  targetUri: vscode.Uri,
  repository: GitRepository,
  presence: ChangePresence,
): ResolvedGitComparison {
  const modifiedUri = getModifiedWorkingTreeUri(
    targetUri,
    presence.workingChange,
    presence.untrackedChange,
  );

  if (
    presence.untrackedChange ||
    (!presence.hasHead && !presence.indexChange)
  ) {
    return {
      targetUri,
      originalUri: undefined,
      modifiedUri,
      originalLabel: EMPTY_LABEL,
      modifiedLabel: WORKING_TREE_LABEL,
      watchUris: [targetUri],
      repository,
      kind: "workingTreeOnly",
    };
  }

  if (presence.indexChange) {
    return {
      targetUri,
      originalUri: gitApi.toGitUri(targetUri, "~"),
      modifiedUri,
      originalLabel: INDEX_LABEL,
      modifiedLabel: WORKING_TREE_LABEL,
      watchUris: [targetUri],
      repository,
      kind: "workingTreeToIndex",
    };
  }

  if (presence.hasHead) {
    return {
      targetUri,
      originalUri: gitApi.toGitUri(targetUri, HEAD_LABEL),
      modifiedUri,
      originalLabel: HEAD_LABEL,
      modifiedLabel: WORKING_TREE_LABEL,
      watchUris: [targetUri],
      repository,
      kind: "workingTreeToHead",
    };
  }

  return {
    targetUri,
    originalUri: undefined,
    modifiedUri,
    originalLabel: EMPTY_LABEL,
    modifiedLabel: WORKING_TREE_LABEL,
    watchUris: [targetUri],
    repository,
    kind: "workingTreeOnly",
  };
}

function resolveIndexComparison(
  gitApi: GitApi,
  targetUri: vscode.Uri,
  repository: GitRepository,
  presence: ChangePresence,
): ResolvedGitComparison {
  // Always read the staged content from the Git index.
  // The VS Code Git extension's Change objects do not reliably
  // provide `modifiedUri`, so we determine the URI ourselves.
  // For staged deletions (originalUri set, file removed from index)
  // the index URI will fail to read gracefully, yielding "".
  const modifiedUri = presence.indexChange
    ? gitApi.toGitUri(targetUri, "")
    : undefined;

  if (!presence.indexChange) {
    // No staged change exists for this file. Fall back to auto
    // comparison instead of showing stale "HEAD vs Staged" labels.
    return resolveAutoComparison(gitApi, targetUri, repository, presence);
  }

  if (presence.indexChange.originalUri === undefined || !presence.hasHead) {
    return {
      targetUri,
      originalUri: undefined,
      modifiedUri,
      originalLabel: EMPTY_LABEL,
      modifiedLabel: INDEX_LABEL,
      watchUris: [targetUri],
      repository,
      kind: "indexOnly",
    };
  }

  return {
    targetUri,
    originalUri: gitApi.toGitUri(targetUri, HEAD_LABEL),
    modifiedUri,
    originalLabel: HEAD_LABEL,
    modifiedLabel: INDEX_LABEL,
    watchUris: [targetUri],
    repository,
    kind: "indexToHead",
  };
}

function resolveAutoComparison(
  gitApi: GitApi,
  targetUri: vscode.Uri,
  repository: GitRepository,
  presence: ChangePresence,
): ResolvedGitComparison {
  if (presence.untrackedChange) {
    return resolveWorkingTreeComparison(
      gitApi,
      targetUri,
      repository,
      presence,
    );
  }

  if (presence.workingChange) {
    return resolveWorkingTreeComparison(
      gitApi,
      targetUri,
      repository,
      presence,
    );
  }

  if (presence.indexChange) {
    return resolveIndexComparison(gitApi, targetUri, repository, presence);
  }

  if (presence.hasHead) {
    return {
      targetUri,
      originalUri: gitApi.toGitUri(targetUri, HEAD_LABEL),
      modifiedUri: targetUri,
      originalLabel: HEAD_LABEL,
      modifiedLabel: WORKING_TREE_LABEL,
      watchUris: [targetUri],
      repository,
      kind: "cleanHeadToWorkingTree",
    };
  }

  return {
    targetUri,
    originalUri: undefined,
    modifiedUri: targetUri,
    originalLabel: EMPTY_LABEL,
    modifiedLabel: WORKING_TREE_LABEL,
    watchUris: [targetUri],
    repository,
    kind: "fileOnly",
  };
}

function getGitExtension(): GitExtension | undefined {
  return vscode.extensions.getExtension<GitExtension>("vscode.git")?.exports;
}

export async function tryGetGitApi(): Promise<GitApi | undefined> {
  const gitExtension = getGitExtension();
  if (!gitExtension || !gitExtension.enabled) {
    return undefined;
  }

  return gitExtension.getAPI(1);
}

export function getGitUriRef(uri: vscode.Uri | undefined): string | undefined {
  if (!uri || uri.scheme !== "git") {
    return undefined;
  }

  try {
    const parsed = JSON.parse(uri.query) as { ref?: string };
    return parsed.ref;
  } catch {
    return undefined;
  }
}

export function getComparisonHintFromUris(
  originalUri?: vscode.Uri,
  modifiedUri?: vscode.Uri,
): GitComparisonHint {
  const originalRef = getGitUriRef(originalUri);
  const modifiedRef = getGitUriRef(modifiedUri);

  if (modifiedRef === "") {
    return "index";
  }

  if (originalRef === "~" || originalRef === "") {
    return "workingTree";
  }

  if (originalRef === HEAD_LABEL && modifiedUri?.scheme !== "git") {
    return "workingTree";
  }

  if (originalRef === HEAD_LABEL && modifiedUri === undefined) {
    return "index";
  }

  return "auto";
}

export async function resolveSingleFileComparison(
  targetUri: vscode.Uri,
  hint: GitComparisonHint = "auto",
  gitApi?: GitApi,
  options?: ResolveSingleFileComparisonOptions,
): Promise<ResolvedGitComparison> {
  const resolvedGitApi = gitApi ?? (await tryGetGitApi());
  if (!resolvedGitApi) {
    return {
      targetUri,
      originalUri: undefined,
      modifiedUri: targetUri,
      originalLabel: EMPTY_LABEL,
      modifiedLabel: WORKING_TREE_LABEL,
      watchUris: [targetUri],
      kind: "fileOnly",
    };
  }

  const repository = resolvedGitApi.getRepository(targetUri);
  if (!repository) {
    return {
      targetUri,
      originalUri: undefined,
      modifiedUri: targetUri,
      originalLabel: EMPTY_LABEL,
      modifiedLabel: WORKING_TREE_LABEL,
      watchUris: [targetUri],
      kind: "fileOnly",
    };
  }

  if (options?.refreshStatus ?? true) {
    try {
      await repository.status();
    } catch {
      // Best effort only. We still use the last known repository state.
    }
  }

  const presence = getChangePresence(repository, targetUri);

  // If the requested hint no longer matches the actual change state,
  // fall back to auto to avoid showing stale/incorrect headers
  // (e.g. "HEAD vs Staged" when the file has been unstaged).
  let effectiveHint = hint;
  if (hint === "index" && !presence.indexChange) {
    effectiveHint = "auto";
  } else if (
    hint === "workingTree" &&
    !presence.workingChange &&
    !presence.untrackedChange
  ) {
    effectiveHint = "auto";
  }

  switch (effectiveHint) {
    case "workingTree":
      return resolveWorkingTreeComparison(
        resolvedGitApi,
        targetUri,
        repository,
        presence,
      );
    case "index":
      return resolveIndexComparison(
        resolvedGitApi,
        targetUri,
        repository,
        presence,
      );
    default:
      return resolveAutoComparison(
        resolvedGitApi,
        targetUri,
        repository,
        presence,
      );
  }
}
