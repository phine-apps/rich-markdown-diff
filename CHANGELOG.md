# Changelog

All notable changes to **Rich Markdown Diff** will be documented in this file.

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
