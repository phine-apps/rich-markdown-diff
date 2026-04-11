# Changelog

All notable changes to **Rich Markdown Diff** will be documented in this file.

## [1.2.0] - 2026-04-09

### Added in 1.2.0

- **Git/SCM Integration Overhaul**: SCM entries now inspect the Git-provided diff payload so unstaged entries compare **Working Tree → Staged** when a staged snapshot exists, otherwise **Working Tree → HEAD**, while staged entries compare **Staged → HEAD**.
- **Editor Title Action**: A new **Show Markdown Diff** button appears in the editor title bar when the active Markdown file has a meaningful Git-backed diff available, staying in sync as the file is staged, unstaged, or cleaned.
- **Compare with Clipboard**: Right-click in a Markdown editor to compare the current document against your clipboard contents.
- **Live SCM State Tracking**: Open diff panels automatically retarget their labels and baseline when the file moves between unstaged and staged states, with coalesced updates to reduce flicker.
- **Wikilinks Plugin**: Added a dedicated `[[wikilink]]` Markdown-it plugin for rendering wiki-style links in diffs.
- **Command Target Resolution**: New `commandTarget.ts` module normalizes Explorer, editor, and SCM command payloads into a consistent comparison target.
- **Git Diff Resolver**: New `gitDiffResolver.ts` module resolves Git-backed comparisons for working tree, staged, untracked, deleted, and HEAD-based Markdown diffs.
- **pnpm Package Manager**: Migrated build tooling to pnpm for faster installs and reliable cross-platform builds.

### Fixed in 1.2.0

- Fixed KaTeX math rendering in the webview: inline `style` attributes required by KaTeX were blocked by CSP; split `style-src` into `style-src-elem` (nonce-protected) and `style-src-attr` (`'unsafe-inline'`) so font metrics render correctly.
- Fixed `sanitize-html` stripping KaTeX `style` and `aria-hidden` attributes; added a scoped `allowedStyles` whitelist for safe CSS properties.
- Fixed ghost empty bullet markers appearing on the opposite pane for purely inserted or deleted list items.
- Fixed false-positive diff highlighting when bold text (`**text**`) is promoted to a heading (`#### text`) or vice versa.
- Fixed reparented nested list items incorrectly showing as deleted when only the parent list structure changed.
- Fixed footnote diffing so that updated footnotes are refined in-place while newly added footnotes remain standalone insertions.

### Improved in 1.2.0

- KaTeX math blocks now render with proper container styling (background, padding, border, border-radius) matching code block quality.
- KaTeX fonts are now bundled and loaded via inline CSS with absolute webview URIs, ensuring reliable math rendering across all platforms.
- Normalized all diff highlight borders to a consistent 1px thickness throughout the extension.
- Split view now maintains a stable 50/50 pane layout after refreshes and SCM transitions.
- Updated README, DEVELOPMENT.md, and PUBLISHING.md with comprehensive documentation for all new features and a Windows smoke test checklist.

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
