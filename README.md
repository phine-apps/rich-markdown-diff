# Rich Markdown Diff

A professional markdown diff extension for VS Code that allows you to visually compare Markdown files or clipboard content with rendered HTML differences.

![Split View](https://raw.githubusercontent.com/phine-apps/rich-markdown-diff/main/images/split-view.gif)

## Features

- **Rendered Markdown Diff**: View the difference between two markdown files as rendered HTML.
- **Git / SCM Integration**: Compare from the level you opened. SCM entries now inspect the Git-provided diff payload so unstaged entries compare **Working Tree -> Staged** when a staged snapshot exists, otherwise **Working Tree -> HEAD**, while staged entries compare **Staged -> HEAD**.
- **Clipboard Comparison**: Compare your current file against the clipboard content.
- **Inline & Split Views**: Toggle between inline difference view and split view, with a stable 50/50 split in side-by-side mode.
- **Syntax Highlighting**: Supports syntax highlighting for code blocks in the diff.
- **Reliable Refreshing**: Diff panels coalesce document and Git state updates so staging, unstaging, and commit transitions stay in sync with less flicker, while labels and actions update to match the file's current SCM state.

## Supported Markdown Extensions

Beyond standard Markdown, this extension supports a rich set of advanced features:

- **Math (KaTeX)**: Render mathematical formulas using `$...$` or `$$...$$` syntax.
- **Mermaid Diagrams**: Visualize flowcharts, sequence diagrams, and more with ` ```mermaid ` code blocks.
- **GitHub Alerts**: Display styled admonitions like `> [!NOTE]`, `> [!WARNING]`, etc.
- **Tables and Lists**: Preserve rendered tables, nested lists, and task lists during diffs.
- **Footnotes**: Full support for `[^1]` style footnotes.
- **Wikilinks**: Internal linking with `[[Page Name]]` syntax.
- **Mark/Highlight**: Use `==highlighted text==` for emphasis.
- **Subscript/Superscript**: `H~2~O` and `x^2^` for scientific notation.
- **Definition Lists**: Structured term/definition pairs.
- **Emoji**: Convert `:smile:` to 😊.

All these features are fully preserved and diffed in the rendered view, making it easy to see changes in complex technical documents.

## Why Rich Markdown Diff?

Standard diff views show you the raw markdown source, which can be difficult to read when complex syntax like tables, math, or mermaid diagrams are involved. **Rich Markdown Diff** renders the final output, highlighting exactly what changed in the final visual document.

## Use Cases

### 📚 Knowledge Management & Personal Wikis

Perfect for **Foam** users and personal wiki maintainers: review changes to interlinked notes with **wikilinks** and footnotes, visualizing how edits affect your knowledge graph's rendered output.

### 📖 Technical Documentation

Compare documentation versions with **math formulas**, **mermaid diagrams**, and **GitHub alerts** to catch rendering issues before merging.

### 🔬 Academic & Scientific Writing

Diff **LaTeX equations** and complex tables visually, tracking revisions to formulas and citations in their rendered form.

### 👥 Collaborative Markdown Projects

Review teammates' changes in the **rendered output** rather than raw source, reducing review time and improving communication.

## Usage

### 1. Compare Two Files

#### Method A: Quick Selection

- Select two `.md` files in the Explorer (hold `Ctrl`/`Cmd` to multi-select).
- Right-click and select **Show Markdown Diff**.

#### Method B: Select and Compare

1. Right-click a markdown file in the Explorer and select **Select for Markdown Diff**.
2. Right-click another markdown file and select **Compare with Selected (Markdown Diff)**.

### 2. Git / Source Control Diff

1. Open the **Source Control** view (`Ctrl+Shift+G`).
2. Hover a modified Markdown file to use the inline **Show Markdown Diff** action, or right-click the file entry.
3. Select **Show Markdown Diff**.
4. If you open the diff from the unstaged list, the panel compares **Working Tree -> Staged** when a staged version exists, otherwise **Working Tree -> HEAD**.
5. If you open the diff from the staged list, the panel compares **Staged -> HEAD**.
6. If the file later moves between SCM groups while the panel is open, the comparison labels and baseline refresh to match the new state.

### 3. Open the Current File's Git Diff

1. Open a Markdown file with Git-backed changes.
2. Use the editor title **Show Markdown Diff** action.
3. The button only appears when the active Markdown file has a meaningful Git-backed diff available, and it stays in sync as the file is staged, unstaged, or cleaned.

### 4. Compare with Clipboard

1. Open a markdown file.
2. Copy some text to your clipboard.
3. Right-click in the editor and select **Compare with Clipboard**, or open the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) and run **Markdown Diff: Compare with Clipboard**.

## Local Testing and Installation

### Run the extension locally

1. Install dependencies with `pnpm install`.
2. Compile the extension with `pnpm run compile`.
3. Press `F5` in VS Code to open an **Extension Development Host**.
4. Use the commands from the Explorer, editor, or Source Control view in the development host.

### Build and install a local `.vsix`

1. Create a package with `pnpm run package`.
2. In VS Code, open the Extensions view, select the `...` menu, then choose **Install from VSIX...**.
3. Pick the generated `.vsix` file from the repository root.
4. Reload VS Code and smoke-test the SCM and clipboard flows before publishing.

### Recommended Windows Smoke Test

1. Verify an unstaged tracked Markdown file opens as **Working Tree -> HEAD**.
2. Verify a mixed staged and unstaged Markdown file opens as **Working Tree -> Staged** from the unstaged SCM entry.
3. Verify the staged SCM entry for the same file opens as **Staged -> HEAD**.
4. Verify untracked files open as **Empty -> Working Tree** and deleted files open with an empty side on the correct pane.
5. Verify the editor title action only appears when the active Markdown file has a meaningful Git-backed diff.
6. Verify an already-open diff updates its headers correctly when the file moves between unstaged and staged states.
7. Verify the diff panel stays stable while staging, unstaging, and editing the same file.
8. Verify split view keeps both panes evenly sized after refreshes and SCM transitions.

## Git / SCM Integration

![SCM Diff](https://raw.githubusercontent.com/phine-apps/rich-markdown-diff/main/images/scm-diff.gif)

## Contributing & Development

Interested in contributing?

- For contribution guidelines, please see the [CONTRIBUTING.md](https://github.com/phine-apps/rich-markdown-diff/blob/main/CONTRIBUTING.md) on GitHub.
- For technical setup and architecture, please see the [DEVELOPMENT.md](https://github.com/phine-apps/rich-markdown-diff/blob/main/DEVELOPMENT.md) on GitHub.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
