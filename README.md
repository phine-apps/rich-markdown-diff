# Rich Markdown Diff

A professional VS Code extension for visual Markdown comparison. Compare rendered HTML side-by-side or inline, including Math, Mermaid, and complex slide decks.

![Split View](https://raw.githubusercontent.com/phine-apps/rich-markdown-diff/main/images/split-view.gif)

## Key Features

- **Visual Diff**: Compare rendered HTML side-by-side or inline instead of raw source code.
- **Git Integration**: Compare changes directly from the VS Code Source Control view (Workspace, Staged, or HEAD).
- **Git Blame**: Hover over any line in the diff view to instantly see its commit author and history.
- **Interactive Image Diff**: Compare visual changes in images using "Swipe" and "Onion Skin" comparison modes.
- **Quick Edit**: Modify image paths and frontmatter metadata directly within the preview panels.
- **Clipboard Compare**: Instantly compare any active Markdown file against your clipboard contents.
- 📤 **HTML Export**: Save the entire diff view as a standalone HTML file. It preserves custom styles and client-side interactions, making it perfect for offline sharing and peer reviews in standard web browsers.

## Supported Extensions

| Extension | Support Details |
| --- | --- |
| **MDX / Custom** | Native diffing for MDX, Docusaurus, and Astro Starlight components (Tabs, Steps, Badges, Cards, and Admonitions). |
| **Marp** | Render and diff slide decks with full theme support. |
| **Math** | High-quality KaTeX rendering for formulas. |
| **Mermaid** | Flowcharts, sequence diagrams, and Gantt charts with VS Code theme-aware rendering. |
| **Obsidian** | Native support for Tags (`#tag`) and Transclusions (`![[link]]`). |
| **Alerts** | GitHub-style `[!NOTE]`, `[!WARNING]`, etc. |
| **Structure** | Robust diffing for Tables, Nested Lists, Footnotes, and block-level math/code changes. |
| **Misc** | Wikilinks, Emoji, Sub/Superscript, and Definition Lists. |

## Use Cases

- 🖼️ **Marp Presentations**: Verify slide layout and theme changes visually.
- 📚 **Knowledge Bases**: Review changes in foam/wiki notes with wikilinks and footnotes.
- 🌐 **Modern Tech Docs**: Catch rendering issues in MDX, Docusaurus, and Astro Starlight components.
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

## Recommended Extensions

If you enjoy **Rich Markdown Diff**, you might also like:

- 🔗 **[Markdown Link Assistant](https://marketplace.visualstudio.com/items?itemName=phine-apps.markdown-link-assistant)**: The ultimate link manager for Visual Studio Code. Effortlessly transform raw URLs into beautiful, structured link previews and Notion-like cards with instant previews and AI summaries.

## Configuration

You can customize the extension behavior via the following VS Code settings:

| Setting | Type | Default | Description |
| --- | --- | --- | --- |
| `rich-markdown-diff.defaultViewMode` | `string` | `"side-by-side"` | Default layout view mode when opening a diff panel (`"side-by-side"` or `"inline"`). |
| `rich-markdown-diff.defaultFoldUnchanged` | `boolean` | `false` | Whether to automatically fold unchanged Markdown blocks when opening a diff. |
| `rich-markdown-diff.insertedColor` | `string` | `""` | Custom background color for inserted diff elements (e.g. `#e6ffec` or `rgba(46,160,67,0.15)`). |
| `rich-markdown-diff.deletedColor` | `string` | `""` | Custom background color for deleted diff elements (e.g. `#ffeef0` or `rgba(248,81,73,0.15)`). |
| `rich-markdown-diff.showGutterMarkers` | `boolean` | `true` | Whether to show vertical diff markers in the gutter area. |
| `rich-markdown-diff.showGitBlame` | `boolean` | `true` | Whether to load Git Blame metadata for the compared files. |
| `rich-markdown-diff.lineHoverDelay` | `number` | `500` | The delay in milliseconds before showing Git Blame and Quick Edit indicators on hover. |

## License

Licensed under the [MIT License](LICENSE).
