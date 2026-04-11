import * as vscode from "vscode";
import {
  getComparisonHintFromUris,
  GitComparisonHint,
} from "./gitDiffResolver";

export interface CommandResourceLike {
  resourceUri?: vscode.Uri;
  multiDiffEditorOriginalUri?: vscode.Uri;
  multiFileDiffEditorModifiedUri?: vscode.Uri;
  leftUri?: vscode.Uri;
  rightUri?: vscode.Uri;
  originalUri?: vscode.Uri;
  modifiedUri?: vscode.Uri;
  command?: vscode.Command;
  contextValue?: string;
  resourceGroupType?: string;
  resourceGroup?: {
    contextValue?: string;
    id?: string;
    label?: string;
  };
}

export interface CommandTarget {
  targetUri: vscode.Uri;
  comparisonHint: GitComparisonHint;
  originalUri?: vscode.Uri;
  modifiedUri?: vscode.Uri;
}

const gitRefPathPattern = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;
const indexMarkers = ["index", "staged"];
const workingTreeMarkers = [
  "working",
  "modified",
  "unstaged",
  "changes",
  "untracked",
];

function toFileBackedUri(uri: vscode.Uri): vscode.Uri {
  if (uri.scheme !== "git") {
    return uri;
  }

  try {
    const parsed = JSON.parse(uri.query) as { path?: string };
    if (typeof parsed.path === "string" && parsed.path.length > 0) {
      return vscode.Uri.file(parsed.path);
    }
  } catch {
    // Fall through and return the original URI.
  }

  return uri;
}

function appendUriIfPresent(value: unknown, uris: vscode.Uri[]) {
  if (value instanceof vscode.Uri) {
    uris.push(value);
  }
}

function collectUris(value: unknown, uris: vscode.Uri[], depth = 0) {
  if (depth > 3 || value === undefined || value === null) {
    return;
  }

  if (value instanceof vscode.Uri) {
    uris.push(value);
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item) => collectUris(item, uris, depth + 1));
    return;
  }

  if (typeof value !== "object") {
    return;
  }

  const candidate = value as CommandResourceLike;
  appendUriIfPresent(candidate.multiDiffEditorOriginalUri, uris);
  appendUriIfPresent(candidate.leftUri, uris);
  appendUriIfPresent(candidate.originalUri, uris);
  appendUriIfPresent(candidate.multiFileDiffEditorModifiedUri, uris);
  appendUriIfPresent(candidate.rightUri, uris);
  appendUriIfPresent(candidate.modifiedUri, uris);

  if (candidate.command?.arguments) {
    collectUris(candidate.command.arguments, uris, depth + 1);
  }
}

function dedupeUris(uris: readonly vscode.Uri[]): vscode.Uri[] {
  const seen = new Set<string>();
  return uris.filter((uri) => {
    const key = uri.toString();
    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function extractComparisonUris(resource: CommandResourceLike): {
  originalUri?: vscode.Uri;
  modifiedUri?: vscode.Uri;
} {
  const directOriginal =
    resource.multiDiffEditorOriginalUri ??
    resource.leftUri ??
    resource.originalUri;
  const directModified =
    resource.multiFileDiffEditorModifiedUri ??
    resource.rightUri ??
    resource.modifiedUri;

  if (directOriginal || directModified) {
    return {
      originalUri: directOriginal,
      modifiedUri: directModified,
    };
  }

  const uris: vscode.Uri[] = [];
  collectUris(resource.command?.arguments, uris);
  const uniqueUris = dedupeUris(uris);

  return {
    originalUri: uniqueUris[0],
    modifiedUri: uniqueUris[1],
  };
}

function includesAnyMarker(
  value: string | undefined,
  markers: readonly string[],
) {
  if (!value) {
    return false;
  }

  const normalized = value.toLowerCase();
  return markers.some((marker) => normalized.includes(marker));
}

function inferComparisonHint(
  resource: CommandResourceLike,
  originalUri?: vscode.Uri,
  modifiedUri?: vscode.Uri,
): GitComparisonHint {
  const fromUris = getComparisonHintFromUris(originalUri, modifiedUri);
  if (fromUris !== "auto") {
    return fromUris;
  }

  const contextCandidates = [
    resource.contextValue,
    resource.resourceGroupType,
    resource.resourceGroup?.contextValue,
    resource.resourceGroup?.id,
    resource.resourceGroup?.label,
    resource.command?.title,
  ];

  if (
    contextCandidates.some((value) => includesAnyMarker(value, indexMarkers))
  ) {
    return "index";
  }

  if (
    contextCandidates.some((value) =>
      includesAnyMarker(value, workingTreeMarkers),
    )
  ) {
    return "workingTree";
  }

  return "auto";
}

export function getCommandTarget(arg: unknown): CommandTarget | undefined {
  if (arg instanceof vscode.Uri) {
    return {
      targetUri: toFileBackedUri(arg),
      comparisonHint: "auto",
    };
  }

  if (Array.isArray(arg)) {
    for (const item of arg) {
      const commandTarget = getCommandTarget(item);
      if (commandTarget) {
        return commandTarget;
      }
    }

    return undefined;
  }

  if (!arg || typeof arg !== "object") {
    return undefined;
  }

  const resource = arg as CommandResourceLike;
  const { originalUri, modifiedUri } = extractComparisonUris(resource);
  const targetUri = resource.resourceUri ?? modifiedUri ?? originalUri;

  if (!targetUri) {
    return undefined;
  }

  return {
    targetUri: toFileBackedUri(targetUri),
    comparisonHint: inferComparisonHint(resource, originalUri, modifiedUri),
    originalUri,
    modifiedUri,
  };
}

export function getFileUriFromCommandArg(arg: unknown): vscode.Uri | undefined {
  return getCommandTarget(arg)?.targetUri;
}

export const __test__ = {
  extractComparisonUris,
  inferComparisonHint,
  toFileBackedUri,
  gitRefPathPattern,
};
