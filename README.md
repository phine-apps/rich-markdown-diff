# Rich Markdown Diff

A professional markdown diff extension for VS Code that allows you to visually compare Markdown files or clipboard content with rendered HTML differences.

![Split View](https://raw.githubusercontent.com/phine-apps/rich-markdown-diff/main/images/split-view.gif)

## Features

- **Rendered Markdown Diff**: View the difference between two markdown files as rendered HTML.
- **Git / SCM Integration**: Compare your current changes against the `HEAD` or staged versions directly from the Source Control view.
- **Clipboard Comparison**: Compare your current file against the clipboard content.
- **Inline & Split Views**: Toggle between inline difference view and split view.
- **Syntax Highlighting**: Supports syntax highlighting for code blocks in the diff.

## Supported Markdown Extensions

Beyond standard Markdown, this extension supports a rich set of advanced features:

- **Math (KaTeX)**: Render mathematical formulas using `$...$` or `$$...$$` syntax.
- **Mermaid Diagrams**: Visualize flowcharts, sequence diagrams, and more with ` ```mermaid ` code blocks.
- **GitHub Alerts**: Display styled admonitions like `> [!NOTE]`, `> [!WARNING]`, etc.
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

**Method A: Quick Selection**

1. Select two `.md` files in the Explorer (hold `Ctrl`/`Cmd` to multi-select).
2. Right-click and select **Show Markdown Diff**.

**Method B: Select and Compare**

1. Right-click a markdown file in the Explorer and select **Select for Markdown Diff**.
2. Right-click another markdown file and select **Compare with Selected (Markdown Diff)**.

### 2. Git / Source Control Diff

1. Open the **Source Control** view (`Ctrl+Shift+G`).
2. Right-click any modified Markdown file.
3. Select **Show Markdown Diff**.

### 3. Compare with Clipboard

1.  Open a markdown file.
2.  Copy some text to your clipboard.
3.  Right-click in the editor and select **Compare with Clipboard**, or open the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) and run **Markdown Diff: Compare with Clipboard**.

## Git / SCM Integration

![SCM Diff](https://raw.githubusercontent.com/phine-apps/rich-markdown-diff/main/images/scm-diff.gif)

## Contributing & Development

Interested in contributing?

- For contribution guidelines, please see the [CONTRIBUTING.md](https://github.com/phine-apps/rich-markdown-diff/blob/main/CONTRIBUTING.md) on GitHub.
- For technical setup and architecture, please see the [DEVELOPMENT.md](https://github.com/phine-apps/rich-markdown-diff/blob/main/DEVELOPMENT.md) on GitHub.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
