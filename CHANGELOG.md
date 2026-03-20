# Changelog

All notable changes to **Rich Markdown Diff** will be documented in this file.

## [1.1.1] - 2026-03-20

### Fixed

- Fixed an issue where localized placeholders (e.g., `%rich-markdown-diff.displayName%`) were appearing literally on the Marketplace website.

## [1.1.0] - 2026-03-20

### Added

- Added find widget support inside the webview diff view panels allowing search operations.
- Added support for Japanese and Simplified Chinese languages (i18n).

### Fixed

- Improved Frontmatter diff display by showing all metadata fields (including unchanged ones with normal styling) and removing the confusing "Key" header.

### Security

- Security updates for dependency packages.

## [1.0.0] - 2026-02-23

### Added

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
