# Changelog

All notable changes to **Rich Markdown Diff** will be documented in this file.

## [Unreleased]

### Added

- **Semantic Mermaid Diff**: Element-level diff highlighting for Mermaid flowcharts with dynamic color-coding and ghost outlines for deleted elements.

## [1.5.0] - 2026-08-11

### Added in 1.5.0

- **Visual Conflict Resolver**: Interactive 3-way merge editor for resolving Git merge conflicts (`<<<<<<<`, `=======`, `>>>>>>>`) directly in rendered Markdown.
- **HTML Export**: Export rendered side-by-side or inline diffs to standalone HTML files via the `Export Rendered Diff to HTML` command.
- **Custom Diff Colors & View Preferences**: Added settings for custom insertion/deletion highlight colors and default view/folding modes.
- **Committed Revision Diffs**: Render visual diffs for committed revisions from Git history and the editor context menu.

### Fixed in 1.5.0

- **Stability & Edge Cases**:
  - Fixed frontmatter parser error when metadata keys include `hasOwnProperty`.
  - Fixed MDX `<TabItem>` tag counting inside `<Tabs>` blocks.
  - Resolved table diff `TypeError` on rows with fewer columns than the header.
  - Added support for 64-character SHA-256 commit hashes in Git Blame.
  - Fixed line number data-attribute injection when HTML tags contain `>`.
  - Hardened validation for webview edit message payloads.

## [1.4.0] - 2026-07-19

### Added in 1.4.0

- **MDX & Custom Components**: Native rendering and high-fidelity diffs for MDX, Docusaurus, and Astro Starlight components. Supports interactive `<Tabs>`, inline `<Badge>` elements, timeline `<Steps>`, premium `<Card>` layouts, Docusaurus triple-colon admonitions (`:::note` etc.), and graceful visual fallbacks for custom JSX/TSX tags.
- **Interactive Wikilinks**: Click to open local target files directly from `[[Wiki-Style Links]]` in the diff view.

### Fixed in 1.4.0

- **Quick Edit**: Fixed a bug where the Quick Edit overlay loaded incorrect source text when editing documents that contain frontmatter metadata.
- **Obsidian Tags**: Expanded the tag parser to support Japanese, Chinese, and other multi-byte characters.
- **Marp Support**: Fixed slide transition animations and restored accurate dark/light theme styling in the webview.
- **Stability & Rendering**:
  - Fixed horizontal scroll clipping of line highlights on code blocks and tables.
  - Resolved visual alignment and active highlight issues for embedded code blocks and task list checkboxes.
  - Fixed potential memory leaks in clipboard comparisons and child process hangs in Git Blame.
  - Fixed duplicate containers in GitHub Alerts and incorrect numbering in Starlight `<Steps>`.
  - Added outline and background highlights for active cells in frontmatter diffs.
- **Compare Commands**: Fixed a bug where comparing a file with itself opened a blank diff panel.

## [1.3.1] - 2026-05-24

### Improved in 1.3.1

- **Performance & Accuracy**: Chunk-based structural diffing dramatically improves rendering speed and accuracy for large documents.
- **Table & Footnote Diffing**: Added a tag-aware parser for complex nested tables and a robust multi-pass match for footnotes.
- **UI & Navigation**: Implemented theme-aware Mermaid rendering, dynamic horizontal scrolling for wide tables, smoother scroll sync, and active change navigation state preservation.
- **Security Hardening**: Replaced internal git blame executions with secure, memory-efficient streaming APIs to block command-injection risks.

### Fixed in 1.3.1

- **KaTeX & Block Diffs**: Resolved math display bugs by securing formula structures from incorrect HTML nesting repairs and consolidating block-level equations correctly.
- **CI & Dependency Setup**: Fixed version conflicts in the pnpm release workflow and resolved VS Code workspace compatibility issues.

## [1.3.0] - 2026-04-30

### Added in 1.3.0

- **Git Blame Integration**: View author and commit information by hovering over any line in the diff view.
- **Obsidian Support**: Native rendering for Obsidian-style tags (`#tag`) and internal transclusions (`![[link]]`).
- **Interactive Image Comparison**: New "Swipe" and "Onion Skin" modes for visual image diffing.
- **Quick Edit Interface**: Direct editing of image paths and block content directly from the webview.

### Improved in 1.3.0

- **UX Refinement**: Optimized diff coloring and gutter markers for better readability in split-view.

## [1.2.0] - 2026-04-12

### Added in 1.2.0

- **Marp Support**: Visual diffs for [Marp](https://marp.app/) slide decks (`marp: true`).
- **Smart Git Integration**: Automatically selects the best comparison (Working Tree/Staged/HEAD).
- **Editor Button**: New "Show Markdown Diff" button in the editor toolbar.
- **Compare with Clipboard**: Directly compare files against clipboard content.
- **Wikilinks**: Support for diffing `[[wiki-style]]` internal links.

### Fixed in 1.2.0

- **Clean List Diffs**: Fixed "ghost bullets" and improved stability for nested items.
- **Heading Layout**: Fixed alignment issues and accidental diff highlights.
- **Math Stability**: Resolved KaTeX rendering and font loading issues.
- **Security**: Hardened content security for rendered views.

### Improved in 1.2.0

- **Granular Diffs**: Highlights specific text changes _inside_ GitHub Alerts and Footnotes.
- **Performance**: Faster loading through lazy-loaded rendering components.
- **UI Stability**: Fixed split view proportions and reduced flicker during Git state changes.
- **Math Styling**: Improved background and spacing for mathematical formulas.

## [1.1.1] - 2026-03-20

### Fixed in 1.1.1

- Fixed an issue where localized placeholders (e.g., `%rich-markdown-diff.displayName%`) were appearing literally on the Marketplace website.

## [1.1.0] - 2026-03-20

### Added in 1.1.0

- Added find widget support inside the webview diff view panels allowing search operations.
- Added support for Japanese and Simplified Chinese languages (i18n).

### Fixed in 1.1.0

- Improved Frontmatter diff display by showing all metadata fields (including unchanged ones with normal styling) and removing the confusing "Key" header.

### Security in 1.1.0

- Security updates for dependency packages.

## [1.0.0] - 2026-02-23

### Added in 1.0.0

- Initial release
- Rendered markdown diff view with inline and side-by-side modes
- Git/SCM integration for comparing working changes
- Clipboard comparison support
- Change navigation with keyboard shortcuts (Alt+F5 / Shift+Alt+F5)
- Context folding for unchanged regions
- Markdown extensions support:
  - KaTeX (math formulas)
  - Mermaid diagrams
  - GitHub Alerts
  - Footnotes, Wikilinks, Emoji, and more
