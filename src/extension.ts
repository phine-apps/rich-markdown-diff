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
import { MarkdownDiffProvider } from "./markdownDiff";
import {
  GitRepository,
  resolveSingleFileComparison,
  tryGetGitApi,
} from "./gitDiffResolver";
import { resolveBlameInfo } from "./gitBlameResolver";
import { getCommandTarget, getFileUriFromCommandArg, toFileBackedUri } from "./commandTarget";
import * as path from "path";
import * as l10n from "@vscode/l10n";

/**
 * Escapes HTML special characters to prevent XSS in webview content.
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// We need to track active panels to dispatch commands to them
let activePanel: vscode.WebviewPanel | undefined;
let selectedForCompareUri: vscode.Uri | undefined;
let activeEditorRepositorySubscription: vscode.Disposable | undefined;
let contextUpdateGeneration = 0;
let lastCanShowRenderedDiff: boolean | undefined;
let runtimeDiagnosticsChannel: vscode.OutputChannel | undefined;
let isWebviewReadyForTesting = false; // Flag for health tests
const openPanelUpdateHandlers = new Set<(trigger: DiffPanelUpdateTrigger) => void>();

const markdownExtensions = [
  ".md",
  ".markdown",
  ".mdown",
  ".mkdn",
  ".mdwn",
  ".mdtxt",
  ".mdtext",
];

interface DiffPanelState {
  originalUri?: vscode.Uri;
  modifiedUri?: vscode.Uri;
  leftLabel?: string;
  rightLabel?: string;
  watchUris: readonly vscode.Uri[];
  repository?: GitRepository;
  originalImageBaseUri?: vscode.Uri;
  modifiedImageBaseUri?: vscode.Uri;
  fallbackSourceUri: vscode.Uri;
}

interface RuntimeDiagnosticsPayload {
  reason: string;
  reportId?: number;
  metrics?: unknown;
  recentEvents?: unknown;
  extra?: unknown;
}

type DiffPanelUpdateTrigger = "initial" | "document" | "repository";
type ResolveDiffPanelState = (options?: {
  refreshComparisonStatus?: boolean;
  trigger?: DiffPanelUpdateTrigger;
}) => Promise<DiffPanelState>;

function getRuntimeDiagnosticsChannel() {
  runtimeDiagnosticsChannel ??= vscode.window.createOutputChannel(
    "Rich Markdown Diff Diagnostics",
  );
  return runtimeDiagnosticsChannel;
}

function appendRuntimeDiagnostics(
  panel: vscode.WebviewPanel,
  state: DiffPanelState | undefined,
  payload: RuntimeDiagnosticsPayload,
) {
  const channel = getRuntimeDiagnosticsChannel();
  const heading = [
    `[${new Date().toISOString()}] ${panel.title}`,
    state?.leftLabel && state?.rightLabel
      ? `${state.leftLabel} -> ${state.rightLabel}`
      : undefined,
    payload.reportId !== undefined ? `report #${payload.reportId}` : undefined,
    payload.reason,
  ]
    .filter(Boolean)
    .join(" | ");

  channel.appendLine(heading);
  channel.appendLine(
    JSON.stringify(
      {
        reason: payload.reason,
        metrics: payload.metrics,
        recentEvents: payload.recentEvents,
        extra: payload.extra,
      },
      null,
      2,
    ),
  );
  channel.appendLine("");
}

/**
 * Get minimal distinguishable paths for display in diff titles.
 * If filenames are different, returns just the basename.
 * If filenames are the same, includes parent directories to distinguish them.
 */
function getMinimalPathForDisplay(
  path1: string,
  path2: string,
): { left: string; right: string } {
  const base1 = path.basename(path1);
  const base2 = path.basename(path2);

  // If basenames are different, just use basenames
  if (base1 !== base2) {
    return { left: base1, right: base2 };
  }

  // If basenames are the same, include parent directories until they differ
  const parts1 = path1.split(path.sep).filter((p) => p);
  const parts2 = path2.split(path.sep).filter((p) => p);

  // Find the minimum number of segments needed to distinguish the paths
  let segmentsNeeded = 1;
  while (segmentsNeeded < Math.max(parts1.length, parts2.length)) {
    const suffix1 = parts1.slice(-segmentsNeeded).join(path.sep);
    const suffix2 = parts2.slice(-segmentsNeeded).join(path.sep);
    if (suffix1 !== suffix2) {
      return { left: suffix1, right: suffix2 };
    }
    segmentsNeeded++;
  }

  // Fallback: use full paths if we can't distinguish
  return { left: path1, right: path2 };
}

/**
 * Creates a function to resolve relative image paths to webview-compatible URIs.
 *
 * @param fileUri - The URI of the Markdown file being rendered.
 * @param webview - The webview panel where images will be displayed.
 * @returns A function that takes an image source and returns a resolved URI string.
 */
function createImageResolver(fileUri: vscode.Uri, webview: vscode.Webview) {
  // Normalize to file-backed URI for resolution
  const baseUri = toFileBackedUri(fileUri);

  return (src: string) => {
    // Check if absolute URL (http, https, data, etc.)
    if (/^[a-z]+:/i.test(src)) {
      return src;
    }

    try {
      // Resolve path relative to the document
      // We use joinPath with '..' to start from the directory of the baseUri
      let resolvedUri: vscode.Uri;
      if (src.startsWith("/")) {
        resolvedUri = vscode.Uri.file(src);
      } else {
        resolvedUri = vscode.Uri.joinPath(baseUri, "..", src);
      }
      return webview.asWebviewUri(resolvedUri).toString();
    } catch (e) {
      console.warn("Failed to resolve image path:", src, e);
      return src;
    }
  };
}

function getWebviewTranslations() {
  return {
    "Markdown Diff": l10n.t("Markdown Diff"),
    Original: l10n.t("Original"),
    Modified: l10n.t("Modified"),
    "Open in Editor": l10n.t("Open in Editor"),
    "Scanning...": l10n.t("Scanning..."),
    "Found {0} groups": l10n.t("Found {0} groups"),
    "No changes found": l10n.t("No changes found"),
    "Error: {0}": l10n.t("Error: {0}"),
    "Change {0} of {1}": l10n.t("Change {0} of {1}"),
    "Folded {0} (Original) / {1} (Modified) blocks": l10n.t(
      "Folded {0} (Original) / {1} (Modified) blocks",
    ),
    "{0} unchanged blocks": l10n.t("{0} unchanged blocks"),
    "Click to expand": l10n.t("Click to expand"),
  };
}

function getL10nBundleUri(context: vscode.ExtensionContext): vscode.Uri {
  const language = vscode.env.language.toLowerCase();

  if (language.startsWith("ja")) {
    return vscode.Uri.joinPath(
      context.extensionUri,
      "l10n",
      "bundle.l10n.ja.json",
    );
  }

  if (language === "zh-cn" || language.startsWith("zh-hans")) {
    return vscode.Uri.joinPath(
      context.extensionUri,
      "l10n",
      "bundle.l10n.zh-cn.json",
    );
  }

  return vscode.Uri.joinPath(context.extensionUri, "l10n", "bundle.l10n.json");
}

function isMarkdownPath(fsPath: string): boolean {
  return markdownExtensions.includes(path.extname(fsPath).toLowerCase());
}

function getDiffPanelOptions(context: vscode.ExtensionContext) {
  return {
    enableScripts: true,
    enableFindWidget: true,
    localResourceRoots: [
      vscode.Uri.joinPath(context.extensionUri, "media"),
      vscode.Uri.joinPath(context.extensionUri, "data"),
      ...(vscode.workspace.workspaceFolders?.map((folder) => folder.uri) ?? []),
    ],
  };
}

function attachPanelTracking(panel: vscode.WebviewPanel) {
  panel.onDidChangeViewState((e) => {
    if (e.webviewPanel.active) {
      activePanel = e.webviewPanel;
      vscode.commands.executeCommand(
        "setContext",
        "rich-markdown-diff.isDiffActive",
        true,
      );
    } else if (activePanel === e.webviewPanel) {
      activePanel = undefined;
      vscode.commands.executeCommand(
        "setContext",
        "rich-markdown-diff.isDiffActive",
        false,
      );
    }
  });

  panel.onDidDispose(() => {
    if (activePanel === panel) {
      activePanel = undefined;
      vscode.commands.executeCommand(
        "setContext",
        "rich-markdown-diff.isDiffActive",
        false,
      );
    }
  });

  if (panel.active) {
    activePanel = panel;
    vscode.commands.executeCommand(
      "setContext",
      "rich-markdown-diff.isDiffActive",
      true,
    );
  }
}

function getWebviewAssetUris(
  panel: vscode.WebviewPanel,
  extensionUri: vscode.Uri,
) {
  return {
    katexCssUri: panel.webview.asWebviewUri(
      vscode.Uri.joinPath(extensionUri, "media", "katex", "katex.min.css"),
    ),
    katexFontBaseUri: panel.webview.asWebviewUri(
      vscode.Uri.joinPath(extensionUri, "media", "katex", "fonts"),
    ),
    mermaidJsUri: panel.webview.asWebviewUri(
      vscode.Uri.joinPath(extensionUri, "media", "mermaid", "mermaid.min.js"),
    ),
    hljsLightCssUri: panel.webview.asWebviewUri(
      vscode.Uri.joinPath(extensionUri, "media", "highlight", "github.min.css"),
    ),
    hljsDarkCssUri: panel.webview.asWebviewUri(
      vscode.Uri.joinPath(
        extensionUri,
        "media",
        "highlight",
        "github-dark.min.css",
      ),
    ),
  };
}

async function buildKatexCssInline(
  extensionUri: vscode.Uri,
  fontBaseUri: vscode.Uri,
): Promise<string> {
  const cssPath = vscode.Uri.joinPath(
    extensionUri,
    "media",
    "katex",
    "katex.min.css",
  );
  const cssBytes = await vscode.workspace.fs.readFile(cssPath);
  const cssText = Buffer.from(cssBytes).toString("utf8");
  return cssText.replace(/url\(fonts\//g, `url(${fontBaseUri.toString()}/`);
}

function isMarkdownDocument(document: vscode.TextDocument): boolean {
  return (
    document.languageId === "markdown" || isMarkdownPath(document.uri.fsPath)
  );
}

async function tryOpenMarkdownDocument(
  uri: vscode.Uri | undefined,
  sourceLabel: string,
): Promise<vscode.TextDocument | undefined> {
  if (!uri) {
    return undefined;
  }

  try {
    return await vscode.workspace.openTextDocument(uri);
  } catch (error) {
    console.error(`Failed to open document from ${sourceLabel}:`, error);
    return undefined;
  }
}

async function resolveMarkdownDocument(
  uri?: vscode.Uri,
): Promise<vscode.TextDocument | undefined> {
  let document = await tryOpenMarkdownDocument(uri, "URI");

  if (!document) {
    const activeTab = vscode.window.tabGroups.activeTabGroup.activeTab;
    if (activeTab) {
      if (
        activeTab.input instanceof vscode.TabInputCustom &&
        activeTab.input.viewType === "vscode.markdown.preview.editor"
      ) {
        document = await tryOpenMarkdownDocument(
          activeTab.input.uri,
          "Preview Tab",
        );
      } else if (activeTab.input instanceof vscode.TabInputText) {
        document = await tryOpenMarkdownDocument(
          activeTab.input.uri,
          "Text Tab",
        );
      }
    }
  }

  if (!document && vscode.window.activeTextEditor) {
    document = vscode.window.activeTextEditor.document;
  }

  if (!document) {
    const visibleMarkdown = vscode.window.visibleTextEditors.find((editor) =>
      isMarkdownDocument(editor.document),
    );
    if (visibleMarkdown) {
      document = visibleMarkdown.document;
    }
  }

  if (!document) {
    document = vscode.workspace.textDocuments.find((openDocument) =>
      isMarkdownDocument(openDocument),
    );
  }

  return document && isMarkdownDocument(document) ? document : undefined;
}

async function readDocumentText(uri?: vscode.Uri): Promise<string> {
  if (!uri) {
    return "";
  }

  try {
    const document = await vscode.workspace.openTextDocument(uri);
    return document.getText();
  } catch (error) {
    console.warn(
      "Failed to read document for Markdown diff:",
      uri.toString(),
      error,
    );
    return "";
  }
}

function toDiffPanelState(
  comparison: Awaited<ReturnType<typeof resolveSingleFileComparison>>,
): DiffPanelState {
  return {
    originalUri: comparison.originalUri,
    modifiedUri: comparison.modifiedUri,
    leftLabel: comparison.originalLabel,
    rightLabel: comparison.modifiedLabel,
    watchUris: comparison.watchUris,
    repository: comparison.repository,
    originalImageBaseUri: comparison.originalUri ?? comparison.targetUri,
    modifiedImageBaseUri: comparison.modifiedUri ?? comparison.targetUri,
    fallbackSourceUri: comparison.targetUri,
  };
}

function isDocumentDirty(uri: vscode.Uri): boolean {
  return vscode.workspace.textDocuments.some(
    (document) =>
      document.uri.toString() === uri.toString() && document.isDirty,
  );
}

function isActionableSingleFileComparison(
  comparison: Awaited<ReturnType<typeof resolveSingleFileComparison>>,
  isDirty = false,
): boolean {
  if (comparison.kind === "fileOnly") {
    return isDirty;
  }

  return comparison.kind !== "cleanHeadToWorkingTree" || isDirty;
}

async function updateRenderedDiffContext(
  editor: vscode.TextEditor | undefined = vscode.window.activeTextEditor,
) {
  const myGen = ++contextUpdateGeneration;

  if (
    !editor ||
    (!isMarkdownPath(editor.document.uri.fsPath) &&
      !isMarkdownDocument(editor.document))
  ) {
    // Keep canShowRenderedDiff true if any visible text editor has a markdown
    // file, so the diff icon stays available when switching between the source
    // editor and its preview panel (e.g. "Open Preview to the Side").
    const hasVisibleMarkdownEditor = vscode.window.visibleTextEditors.some(
      (e) =>
        isMarkdownPath(e.document.uri.fsPath) || isMarkdownDocument(e.document),
    );

    if (myGen !== contextUpdateGeneration) {
      return;
    }

    if (!hasVisibleMarkdownEditor) {
      activeEditorRepositorySubscription?.dispose();
      activeEditorRepositorySubscription = undefined;
      if (lastCanShowRenderedDiff !== false) {
        lastCanShowRenderedDiff = false;
        await vscode.commands.executeCommand(
          "setContext",
          "rich-markdown-diff.canShowRenderedDiff",
          false,
        );
      }
    } else if (!lastCanShowRenderedDiff) {
      // A markdown editor is visible but context was previously disabled or
      // uninitialized — re-evaluate by finding the visible markdown editor.
      const mdEditor = vscode.window.visibleTextEditors.find(
        (e) =>
          isMarkdownPath(e.document.uri.fsPath) ||
          isMarkdownDocument(e.document),
      );
      if (mdEditor) {
        void updateRenderedDiffContext(mdEditor);
      }
    }
    return;
  }

  // Normalize git: / vscode-userdata: URIs to file: URIs so the git API
  // can locate the repository (e.g. when the built-in diff editor is focused).
  const editorUri = editor.document.uri;
  const resolvedUri =
    editorUri.scheme !== "file" && editorUri.fsPath
      ? vscode.Uri.file(editorUri.fsPath)
      : editorUri;

  const comparison = await resolveSingleFileComparison(
    resolvedUri,
    "auto",
    undefined,
    { refreshStatus: false },
  );
  if (myGen !== contextUpdateGeneration) {
    return;
  }

  activeEditorRepositorySubscription?.dispose();
  activeEditorRepositorySubscription = undefined;

  const canShow = isActionableSingleFileComparison(
    comparison,
    editor.document.isDirty,
  );
  if (lastCanShowRenderedDiff !== canShow) {
    lastCanShowRenderedDiff = canShow;
    await vscode.commands.executeCommand(
      "setContext",
      "rich-markdown-diff.canShowRenderedDiff",
      canShow,
    );
  }

  if (myGen !== contextUpdateGeneration) {
    return;
  }

  const gitApi = await tryGetGitApi();
  if (myGen !== contextUpdateGeneration) {
    return;
  }

  const repository = gitApi?.getRepository(resolvedUri);
  if (!repository) {
    return;
  }

  activeEditorRepositorySubscription = repository.state.onDidChange(() => {
    void updateRenderedDiffContext(vscode.window.activeTextEditor);
  });
}

async function renderDiffPanel(
  panel: vscode.WebviewPanel,
  context: vscode.ExtensionContext,
  diffProvider: MarkdownDiffProvider,
  state: DiffPanelState,
  lastContentKey?: string,
): Promise<string> {
  const originalContent = await readDocumentText(state.originalUri);
  const modifiedContent = await readDocumentText(state.modifiedUri);

  const originalBlame = state.originalUri ? await resolveBlameInfo(state.originalUri) : undefined;
  const modifiedBlame = state.modifiedUri ? await resolveBlameInfo(state.modifiedUri) : undefined;

  const contentKey = `${originalContent}\0${modifiedContent}\0${state.leftLabel}\0${state.rightLabel}`;
  if (lastContentKey !== undefined && contentKey === lastContentKey) {
    return contentKey;
  }

  await diffProvider.waitForReady();

  const originalResolver = state.originalImageBaseUri
    ? createImageResolver(state.originalImageBaseUri, panel.webview)
    : undefined;
  const modifiedResolver = state.modifiedImageBaseUri
    ? createImageResolver(state.modifiedImageBaseUri, panel.webview)
    : undefined;

  const config = vscode.workspace.getConfiguration("rich-markdown-diff");
  const showGutterMarkers = config.get<boolean>("showGutterMarkers", true);
  const showGitBlame = config.get<boolean>("showGitBlame", true);
  const lineHoverDelay = config.get<number>("lineHoverDelay", 500);

  const { html: diffHtml, marpCss, marpJs } = diffProvider.computeDiff(
    originalContent,
    modifiedContent,
    modifiedResolver,
    originalResolver,
  );
  const assets = getWebviewAssetUris(panel, context.extensionUri);
  const katexCssInline = await buildKatexCssInline(
    context.extensionUri,
    assets.katexFontBaseUri,
  );

  const html = diffProvider.getWebviewContent(
    diffHtml,
    katexCssInline,
    assets.mermaidJsUri.toString(),
    assets.hljsLightCssUri.toString(),
    assets.hljsDarkCssUri.toString(),
    state.leftLabel,
    state.rightLabel,
    panel.webview.cspSource,
    getWebviewTranslations(),
    marpCss,
    marpJs,
    {
      original: originalBlame,
      modified: modifiedBlame,
    },
    showGutterMarkers,
    showGitBlame,
    lineHoverDelay,
  );
  panel.webview.html = html;

  return contentKey;
}

async function bindDiffPanel(
  panel: vscode.WebviewPanel,
  context: vscode.ExtensionContext,
  resolveState: ResolveDiffPanelState,
) {
  attachPanelTracking(panel);

  const diffProvider = new MarkdownDiffProvider();
  const debounceDelay = 300;
  let timeout: NodeJS.Timeout | undefined;
  let currentState: DiffPanelState | undefined;
  let repositorySubscription: vscode.Disposable | undefined;
  let currentRepository: GitRepository | undefined;
  let isDisposed = false;
  let isUpdating = false;
  let queuedTrigger: DiffPanelUpdateTrigger | undefined;
  let lastContentKey: string | undefined;

  const scheduleUpdate = (trigger: DiffPanelUpdateTrigger) => {
    if (timeout) {
      clearTimeout(timeout);
    }

    timeout = setTimeout(
      () => {
        timeout = undefined;
        void update(trigger);
      },
      trigger === "initial" ? 0 : debounceDelay,
    );
  };

  const queueUpdate = (trigger: DiffPanelUpdateTrigger) => {
    if (!queuedTrigger) {
      queuedTrigger = trigger;
      return;
    }

    if (trigger === "document" || queuedTrigger === "initial") {
      queuedTrigger = trigger;
      return;
    }

    if (trigger === "repository" && queuedTrigger !== "document") {
      queuedTrigger = trigger;
    }
  };

  openPanelUpdateHandlers.add(scheduleUpdate);

  const update = async (trigger: DiffPanelUpdateTrigger) => {
    if (isDisposed) {
      return;
    }

    if (isUpdating) {
      queueUpdate(trigger);
      return;
    }

    isUpdating = true;
    try {
      const nextState = await resolveState({
        refreshComparisonStatus: trigger !== "repository",
        trigger,
      });

      if (isDisposed) {
        return;
      }

      currentState = nextState;

      if (currentRepository !== nextState.repository) {
        repositorySubscription?.dispose();
        currentRepository = nextState.repository;
        repositorySubscription = nextState.repository?.state.onDidChange(() => {
          scheduleUpdate("repository");
        });
      }

      lastContentKey = await renderDiffPanel(
        panel,
        context,
        diffProvider,
        nextState,
        lastContentKey,
      );

      if (isDisposed) {
        return;
      }
    } catch (error) {
      if (!isDisposed) {
        panel.webview.html = `<h1>${escapeHtml(l10n.t("Error reading file: {0}", String(error)))}</h1>`;
      }
    } finally {
      isUpdating = false;

      if (queuedTrigger) {
        const nextTrigger = queuedTrigger;
        queuedTrigger = undefined;
        scheduleUpdate(nextTrigger);
      }
    }
  };

  const configSubscription = vscode.workspace.onDidChangeConfiguration((e) => {
    if (
      e.affectsConfiguration("rich-markdown-diff.showGutterMarkers") ||
      e.affectsConfiguration("rich-markdown-diff.showGitBlame") ||
      e.affectsConfiguration("rich-markdown-diff.lineHoverDelay")
    ) {
      lastContentKey = undefined; // Force re-render
      scheduleUpdate("document");
    }
  });

  const documentSubscription = vscode.workspace.onDidChangeTextDocument((e) => {
    if (!currentState) {
      return;
    }

    const watchedUris = currentState.watchUris.filter(
      (uri) => uri.scheme === "file",
    );
    if (
      watchedUris.some((uri) => uri.toString() === e.document.uri.toString())
    ) {
      scheduleUpdate("document");
    }
  });

  panel.onDidDispose(() => {
    isDisposed = true;
    openPanelUpdateHandlers.delete(scheduleUpdate);
    documentSubscription.dispose();
    configSubscription.dispose();
    repositorySubscription?.dispose();
    if (timeout) {
      clearTimeout(timeout);
    }
  });

  panel.webview.onDidReceiveMessage(async (message) => {
    if (message.command === "ready") {
      isWebviewReadyForTesting = true;
      return;
    }

    if (message.command === "runtimeDiagnostics") {
      appendRuntimeDiagnostics(
        panel,
        currentState,
        message.payload as RuntimeDiagnosticsPayload,
      );
      return;
    }

    if (message.command === "searchTag") {
      vscode.commands.executeCommand("workbench.action.findInFiles", {
        query: message.tag,
        triggerSearch: true,
        isCaseSensitive: false,
        isRegex: false,
      });
      return;
    }

    if (message.command === "requestBlockSource" && currentState) {
      const uri = currentState.modifiedUri ?? currentState.fallbackSourceUri;
      if (uri) {
        try {
          const document = await vscode.workspace.openTextDocument(uri);
          const start = message.lineStart;
          const end = message.lineEnd;
          let content = "";
          for (let i = start; i < end && i < document.lineCount; i++) {
            content += document.lineAt(i).text + (i < end - 1 ? "\n" : "");
          }
          panel.webview.postMessage({ command: "receiveBlockSource", content });
        } catch (e) {
          console.error("Failed to read block source:", e);
        }
      }
      return;
    }

    if (message.command === "applyEdit" && currentState) {
      const uri = currentState.modifiedUri ?? currentState.fallbackSourceUri;
      if (uri) {
        try {
          const document = await vscode.workspace.openTextDocument(uri);
          const edit = new vscode.WorkspaceEdit();
          const start = message.lineStart;
          const end = message.lineEnd;
          
          // Construct range. end is exclusive line in markdown-it, 
          // but in VS Code Range, (start, 0) to (end, 0) means lines [start, end-1].
          // To replace full lines including trailing newline of the last line:
          const range = new vscode.Range(
            new vscode.Position(start, 0),
            document.validatePosition(new vscode.Position(end, 0))
          );
          
          // Ensure newContent ends with newline if we replaced full lines
          let text = message.newContent;
          if (end < document.lineCount && !text.endsWith("\n")) {
            text += "\n";
          }
          
          edit.replace(uri, range, text);
          await vscode.workspace.applyEdit(edit);
        } catch (e) {
          vscode.window.showErrorMessage(l10n.t("Failed to apply edit: {0}", String(e)));
        }
      }
      return;
    }

    if (message.command !== "openSource" || !currentState) {
      return;
    }

    const uriToOpen =
      message.side === "original"
        ? currentState.originalUri
        : (currentState.modifiedUri ?? currentState.fallbackSourceUri);

    if (!uriToOpen) {
      vscode.window.showInformationMessage(
        l10n.t("No source is available for this side of the diff."),
      );
      return;
    }

    try {
      const document = await vscode.workspace.openTextDocument(uriToOpen);
      const editor = await vscode.window.showTextDocument(document, {
        viewColumn: vscode.ViewColumn.One,
        preserveFocus: false,
      });

      if (typeof message.line === "number") {
        const range = new vscode.Range(message.line, 0, message.line, 0);
        editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
        editor.selection = new vscode.Selection(range.start, range.start);
      }
    } catch (error) {
      if (message.side === "original") {
        vscode.window.showWarningMessage(
          l10n.t(
            "Could not open the original version. Opening the current file instead.",
          ),
        );

        const fallbackDocument = await vscode.workspace.openTextDocument(
          currentState.fallbackSourceUri,
        );
        const editor = await vscode.window.showTextDocument(fallbackDocument, {
          viewColumn: vscode.ViewColumn.One,
        });

        if (typeof message.line === "number") {
          const range = new vscode.Range(message.line, 0, message.line, 0);
          editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
          editor.selection = new vscode.Selection(range.start, range.start);
        }
      } else {
        vscode.window.showErrorMessage(
          l10n.t("Could not open file: {0}", String(error)),
        );
      }
    }
  });

  await update("initial");
}

async function createAndBindDiffPanel(
  title: string,
  context: vscode.ExtensionContext,
  resolveState: ResolveDiffPanelState,
) {
  const panel = vscode.window.createWebviewPanel(
    "markdownDiff",
    title,
    vscode.ViewColumn.Active,
    getDiffPanelOptions(context),
  );

  await bindDiffPanel(panel, context, resolveState);
  return panel;
}

/**
 * Activates the extension.
 * Sets up commands, custom editors, and context keys.
 *
 * @param context - The extension context provided by VS Code.
 */
export function activate(context: vscode.ExtensionContext) {
  l10n.config({
    uri: getL10nBundleUri(context).toString(),
  });

  // Initialize Context Key
  vscode.commands.executeCommand(
    "setContext",
    "rich-markdown-diff.hasSelectedForCompare",
    false,
  );
  vscode.commands.executeCommand(
    "setContext",
    "rich-markdown-diff.canShowRenderedDiff",
    false,
  );

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      void updateRenderedDiffContext(editor);
    }),
    vscode.window.onDidChangeVisibleTextEditors(() => {
      void updateRenderedDiffContext();
    }),
    vscode.workspace.onDidChangeTextDocument((event) => {
      if (
        vscode.window.activeTextEditor?.document.uri.toString() ===
        event.document.uri.toString()
      ) {
        void updateRenderedDiffContext(vscode.window.activeTextEditor);
      }
    }),
    new vscode.Disposable(() => {
      activeEditorRepositorySubscription?.dispose();
      activeEditorRepositorySubscription = undefined;
    }),
  );
  void updateRenderedDiffContext();
  vscode.commands.executeCommand(
    "setContext",
    "rich-markdown-diff.isDiffActive",
    false,
  );

  // Register Commands

  // Register Navigation Commands
  context.subscriptions.push(
    vscode.commands.registerCommand("rich-markdown-diff.nextChange", () => {
      activePanel?.webview.postMessage({ command: "nextChange" });
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("rich-markdown-diff.prevChange", () => {
      activePanel?.webview.postMessage({ command: "prevChange" });
    }),
    vscode.commands.registerCommand("rich-markdown-diff.getTestStatus", (key: string) => {
      if (key === "webviewReady") {
        return isWebviewReadyForTesting;
      }
      return false;
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "rich-markdown-diff.toggleInlineView",
      () => {
        if (activePanel) {
          activePanel.webview.postMessage({ command: "toggleInline" });
        } else {
          vscode.window.showWarningMessage(
            l10n.t("No active diff panel found."),
          );
        }
      },
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "rich-markdown-diff.toggleFoldUnchanged",
      () => {
        activePanel?.webview.postMessage({ command: "toggleFold" });
      },
    ),
  );

  const disposableDiff = vscode.commands.registerCommand(
    "rich-markdown-diff.diffClipboard",
    async (uri?: vscode.Uri) => {
      const document = await resolveMarkdownDocument(uri);

      if (!document) {
        vscode.window.showErrorMessage(
          l10n.t(
            "Could not determine the active Markdown file. Please open or focus a Markdown file.",
          ),
        );
        return;
      }

      if (document.languageId !== "markdown") {
        vscode.window.showErrorMessage(
          l10n.t(
            "Compare with Clipboard is only available for Markdown files.",
          ),
        );
        return;
      }

      let docText = document.getText();
      const editor = vscode.window.activeTextEditor;
      if (editor && editor.document === document && !editor.selection.isEmpty) {
        docText = document.getText(editor.selection);
      }
      const clipboardText = await vscode.env.clipboard.readText();

      const diffProvider = new MarkdownDiffProvider();
      await diffProvider.waitForReady();

      const panel = vscode.window.createWebviewPanel(
        "markdownDiff",
        "Markdown Diff",
        vscode.ViewColumn.Active,
        getDiffPanelOptions(context),
      );

      const resolver = createImageResolver(document.uri, panel.webview);
      const { html: diffHtml, marpCss } = diffProvider.computeDiff(
        clipboardText,
        docText,
        resolver,
        undefined,
      );
      const katexFontBaseUri = panel.webview.asWebviewUri(
        vscode.Uri.joinPath(context.extensionUri, "media", "katex", "fonts"),
      );
      const katexCssInline = await buildKatexCssInline(
        context.extensionUri,
        katexFontBaseUri,
      );
      const mermaidJsUri = panel.webview.asWebviewUri(
        vscode.Uri.joinPath(
          context.extensionUri,
          "media",
          "mermaid",
          "mermaid.min.js",
        ),
      );
      const hljsLightCssUri = panel.webview.asWebviewUri(
        vscode.Uri.joinPath(
          context.extensionUri,
          "media",
          "highlight",
          "github.min.css",
        ),
      );
      const hljsDarkCssUri = panel.webview.asWebviewUri(
        vscode.Uri.joinPath(
          context.extensionUri,
          "media",
          "highlight",
          "github-dark.min.css",
        ),
      );

      const webviewContent = diffProvider.getWebviewContent(
        diffHtml,
        katexCssInline,
        mermaidJsUri.toString(),
        hljsLightCssUri.toString(),
        hljsDarkCssUri.toString(),
        "Clipboard",
        path.basename(document.fileName),
        panel.webview.cspSource,
        getWebviewTranslations(),
        marpCss,
      );

      // Helper to track active panel for shortcuts
      panel.onDidChangeViewState((e) => {
        if (e.webviewPanel.active) {
          activePanel = e.webviewPanel;
          vscode.commands.executeCommand(
            "setContext",
            "rich-markdown-diff.isDiffActive",
            true,
          );
        } else {
          if (activePanel === e.webviewPanel) {
            activePanel = undefined;
            vscode.commands.executeCommand(
              "setContext",
              "rich-markdown-diff.isDiffActive",
              false,
            );
          }
        }
      });

      panel.onDidDispose(() => {
        if (activePanel === panel) {
          activePanel = undefined;
          vscode.commands.executeCommand(
            "setContext",
            "rich-markdown-diff.isDiffActive",
            false,
          );
        }
      });

      if (panel.active) {
        activePanel = panel;
        vscode.commands.executeCommand(
          "setContext",
          "rich-markdown-diff.isDiffActive",
          true,
        );
      }

      panel.webview.html = webviewContent;

      // Handle Double Click
      panel.webview.onDidReceiveMessage((message) => {
        if (message.command === "openSource") {
          const side = message.side;
          const line = message.line;
          if (side === "original") {
            vscode.window.showInformationMessage(
              l10n.t(
                "Original source is the clipboard content and cannot be opened as a file.",
              ),
            );
            return;
          }

          if (editor) {
            vscode.window
              .showTextDocument(editor.document, vscode.ViewColumn.One)
              .then((e) => {
                if (typeof line === "number") {
                  const range = new vscode.Range(line, 0, line, 0);
                  e.revealRange(range, vscode.TextEditorRevealType.InCenter);
                }
              });
          }
        }
      });
    },
  );

  context.subscriptions.push(disposableDiff);

  // Custom Editor Provider
  const provider = new DiffEditorProvider(context);
  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(
      DiffEditorProvider.viewType,
      provider,
      {
        webviewOptions: {
          enableFindWidget: true,
        },
      },
    ),
  );

  const showDiff = async (...args: any[]) => {
    // 1. Check for 2-file selection from Explorer (Compare Selected)
    if (
      args &&
      args.length === 2 &&
      Array.isArray(args[1]) &&
      args[1].length === 2
    ) {
      const selectedUris = args[1] as vscode.Uri[];
      const clickedUri = args[0] as vscode.Uri;
      const modifiedUri = clickedUri;
      const originalUri =
        selectedUris.find((u) => u.toString() !== clickedUri.toString()) ||
        selectedUris[0];

      if (originalUri && modifiedUri) {
        showTwoFilesDiff(originalUri, modifiedUri, context);
        return;
      }
    }

    // 2. Resolve single target URI
    const commandTarget =
      args && args.length > 0 ? getCommandTarget(args[0]) : undefined;
    let targetUri = commandTarget?.targetUri;
    const comparisonHint = commandTarget?.comparisonHint ?? "auto";

    if (!targetUri) {
      const targetDocument = await resolveMarkdownDocument();
      targetUri = targetDocument?.uri;
    }

    if (!targetUri) {
      vscode.window.showErrorMessage(
        l10n.t("No file selected for Markdown Diff."),
      );
      return;
    }

    // --- Graceful Validation ---
    const ext = path.extname(targetUri.fsPath).toLowerCase();
    if (!isMarkdownPath(targetUri.fsPath)) {
      vscode.window.showInformationMessage(
        l10n.t(
          "Markdown Diff only works for Markdown files (found '{0}').",
          ext,
        ),
      );
      return;
    }
    // ---------------------------

    const initialComparison = await resolveSingleFileComparison(
      targetUri,
      comparisonHint,
    );
    if (
      !isActionableSingleFileComparison(
        initialComparison,
        isDocumentDirty(targetUri),
      )
    ) {
      vscode.window.showInformationMessage(
        l10n.t("No Markdown changes are available for this file."),
      );
      return;
    }

    let initialStateConsumed = false;
    await createAndBindDiffPanel(
      `${l10n.t("Markdown Diff")}: ${path.basename(targetUri.fsPath)}`,
      context,
      async () => {
        if (!initialStateConsumed) {
          initialStateConsumed = true;
          return toDiffPanelState(initialComparison);
        }

        const comparison = await resolveSingleFileComparison(
          targetUri,
          comparisonHint,
        );
        return toDiffPanelState(comparison);
      },
    );
  };

  const disposableGitDiff = vscode.commands.registerCommand(
    "rich-markdown-diff.showRenderedDiff",
    showDiff,
  );

  context.subscriptions.push(disposableGitDiff);

  // Select for Compare
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "rich-markdown-diff.selectForCompare",
      (uri: unknown) => {
        let targetUri = getFileUriFromCommandArg(uri);
        if (!targetUri && vscode.window.activeTextEditor) {
          targetUri = vscode.window.activeTextEditor.document.uri;
        }
        if (!targetUri) {
          vscode.window.showErrorMessage(
            l10n.t("No file selected for comparison."),
          );
          return;
        }
        selectedForCompareUri = targetUri;
        vscode.commands.executeCommand(
          "setContext",
          "rich-markdown-diff.hasSelectedForCompare",
          true,
        );

        vscode.window.setStatusBarMessage(
          l10n.t(
            "Selected '{0}' for Markdown diff.",
            path.basename(targetUri.fsPath),
          ),
          5000,
        );
      },
    ),
  );

  // Compare with Selected
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "rich-markdown-diff.compareWithSelected",
      (uri: unknown) => {
        let targetUri = getFileUriFromCommandArg(uri);
        if (!targetUri && vscode.window.activeTextEditor) {
          targetUri = vscode.window.activeTextEditor.document.uri;
        }
        if (!targetUri) {
          vscode.window.showErrorMessage(
            l10n.t("No file selected for comparison."),
          );
          return;
        }

        if (!selectedForCompareUri) {
          vscode.window.showErrorMessage(
            l10n.t(
              "Please first select a file using 'Select for Markdown Diff'.",
            ),
          );
          return;
        }

        if (selectedForCompareUri.toString() === targetUri.toString()) {
          vscode.window.showInformationMessage(
            l10n.t("You are comparing the same file."),
          );
        }

        void showTwoFilesDiff(selectedForCompareUri, targetUri, context);

        // Reset state
        selectedForCompareUri = undefined;
        vscode.commands.executeCommand(
          "setContext",
          "rich-markdown-diff.hasSelectedForCompare",
          false,
        );
      },
    ),
  );
}

/**
 * Shows a diff between two specific Markdown files in a webview panel.
 *
 * @param originalUri - The URI of the original (left) file.
 * @param modifiedUri - The URI of the modified (right) file.
 * @param _context - The extension context.
 */
async function showTwoFilesDiff(
  originalUri: vscode.Uri | undefined,
  modifiedUri: vscode.Uri | undefined,
  _context: vscode.ExtensionContext,
) {
  const imageBaseUri = modifiedUri ?? originalUri;
  if (!imageBaseUri) {
    vscode.window.showErrorMessage(
      l10n.t("No file selected for Markdown Diff."),
    );
    return;
  }

  const minimalPaths =
    originalUri && modifiedUri
      ? getMinimalPathForDisplay(originalUri.fsPath, modifiedUri.fsPath)
      : {
          left: originalUri
            ? path.basename(originalUri.fsPath)
            : l10n.t("Empty"),
          right: modifiedUri
            ? path.basename(modifiedUri.fsPath)
            : l10n.t("Empty"),
        };

  await createAndBindDiffPanel(
    `Diff: ${minimalPaths.left} ↔ ${minimalPaths.right}`,
    _context,
    async () => ({
      originalUri,
      modifiedUri,
      leftLabel: originalUri
        ? path.basename(originalUri.fsPath)
        : l10n.t("Empty"),
      rightLabel: modifiedUri
        ? path.basename(modifiedUri.fsPath)
        : l10n.t("Empty"),
      watchUris: [originalUri, modifiedUri].filter(
        (uri): uri is vscode.Uri => !!uri && uri.scheme === "file",
      ),
      originalImageBaseUri: originalUri,
      modifiedImageBaseUri: modifiedUri,
      fallbackSourceUri: imageBaseUri,
    }),
  );
}

/**
 * Custom editor provider for Markdown Diff previews.
 * Handles opening and rendering differences for a given Markdown file compared to its base revision.
 */
class DiffEditorProvider implements vscode.CustomReadonlyEditorProvider {
  public static readonly viewType = "rich-markdown-diff.diffPreview";

  constructor(private readonly context: vscode.ExtensionContext) {}

  /**
   * Creates a custom document for the given URI.
   *
   * @param uri - The URI of the document to open.
   * @returns A custom document object.
   */
  openCustomDocument(uri: vscode.Uri): vscode.CustomDocument {
    return { uri, dispose: () => {} };
  }

  /**
   * Resolves the custom editor by setting up the webview and its content.
   *
   * @param document - The custom document to resolve.
   * @param webviewPanel - The webview panel to render the editor in.
   * @param _token - A cancellation token.
   */
  async resolveCustomEditor(
    document: vscode.CustomDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken,
  ): Promise<void> {
    webviewPanel.webview.options = getDiffPanelOptions(this.context);

    await bindDiffPanel(webviewPanel, this.context, async () => {
      const comparison = await resolveSingleFileComparison(document.uri);
      return toDiffPanelState(comparison);
    });
  }
}

export function deactivate() {}
