# Rich Markdown Diff

A professional VS Code extension for visual Markdown comparison. Compare rendered HTML side-by-side or inline, including Math, Mermaid, and complex slide decks.

![Split View](https://raw.githubusercontent.com/phine-apps/rich-markdown-diff/main/images/split-view.gif)

## Key Features

- **Visual Diff**: Compare rendered output instead of raw source code.
- **Marp Support**: Full visual diffing for Marp slide decks (`marp: true`).
- **Git Integration**: Diff directly from Source Control view (Workspace, Staged, or HEAD).
- **Clipboard Compare**: Compare any Markdown file against your clipboard.
- **Polished Rendering**: Theme-aware Mermaid output, block-aware math/code diffs, and locally scrollable wide tables.
- **Rich Extensions**: Support for Math (KaTeX), Mermaid diagrams, GitHub Alerts, and more.

## Supported Extensions

| Extension | Support Details |
| --- | --- |
| **Marp** | Render and diff slide decks with full theme support. |
| **Math** | High-quality KaTeX rendering for formulas. |
| **Mermaid** | Flowcharts, sequence diagrams, and Gantt charts with VS Code theme-aware rendering. |
| **Alerts** | GitHub-style `[!NOTE]`, `[!WARNING]`, etc. |
| **Structure** | Robust diffing for Tables, Nested Lists, Footnotes, and block-level math/code changes. |
| **Misc** | Wikilinks, Emoji, Sub/Superscript, and Definition Lists. |

## Use Cases

- 🖼️ **Marp Presentations**: Verify slide layout and theme changes visually.
- 📚 **Knowledge Bases**: Review changes in foam/wiki notes with wikilinks and footnotes.
- 📖 **Technical Docs**: Catch rendering issues in Mermaid diagrams, math formulas, and wide comparison tables.
- 🔬 **Academic Writing**: Track revisions to LaTeX equations and complex tables.
- 👥 **Peer Review**: Focus on the final rendered output rather than raw Markdown syntax.

## Usage

### 1. Compare Files
Select two `.md` files in the Explorer, right-click, and select **Show Markdown Diff**.

### 2. Git & SCM
Click the **Show Markdown Diff** icon next to any modified Markdown file in the Source Control view.

![SCM Diff](https://raw.githubusercontent.com/phine-apps/rich-markdown-diff/main/images/scm-diff.gif)

### 3. Clipboard Comparison
Right-click in any Markdown editor and choose **Compare with Clipboard**.

## Technical Details

For technical setup or contribution guidelines, please see:
- [DEVELOPMENT.md](DEVELOPMENT.md) - Architecture and local setup.
- [CONTRIBUTING.md](CONTRIBUTING.md) - How to contribute.

## License

Licensed under the [MIT License](LICENSE).
