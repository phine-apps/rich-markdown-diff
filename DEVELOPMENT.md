# Development Guide - Rich Markdown Diff

This document is for developers who want to contribute to the extension or understand its internals.

## Technical Architecture

- `src/extension.ts`: Main entry point. Registers commands and the Custom Editor Provider.
- `src/commandTarget.ts`: Normalizes Explorer, editor, and SCM command payloads into a consistent comparison target and hint.
- `src/gitDiffResolver.ts`: Resolves Git-backed comparisons for working tree, staged, untracked, deleted, and `HEAD`-based Markdown diffs.
- `src/markdownDiff.ts`: Core logic for Markdown parsing (using `markdown-it`) and diffing (using `htmldiff-js`).
- `images/`: Brand assets and screenshots.

## Getting Started

1.  **Clone the repository.**
2.  **Install dependencies:**
    ```bash
    pnpm install
    ```
3.  **Compile the code:**
    ```bash
    pnpm run compile
    ```
4.  **Run/Debug:**
    - Open this project in VS Code.
    - Press `F5` to launch an "Extension Development Host" instance.

## Testing

- **Unit Tests**: `pnpm run test:unit` (Tests the diff logic in isolation).
- **Integration Tests**: `pnpm test` (Runs tests within a VS Code instance).
- **Visual Regression Tests (VRT)**:
    - `pnpm run test:visual:docker`: Run VRT inside a Docker container (recommended for environment consistency).
    - `pnpm run test:visual:update`: Update baseline screenshots (run this inside Docker).
    - `pnpm run test:visual`: Run VRT locally (may have anti-aliasing differences compared to CI).


> [!IMPORTANT]
> To ensure consistency between local development and CI, always use the Docker-based commands for generating and verifying baseline screenshots.

## Local VSIX Smoke Test

1. Build a package with `pnpm run package`.
2. Install the generated `.vsix` into a normal VS Code window.
3. Validate Source Control diffs for unstaged-only, staged-only, mixed staged/unstaged, untracked, and deleted Markdown changes.
4. Validate that the editor title action only appears when the active Markdown file has a meaningful Git-backed diff.
5. Validate that an already-open SCM diff retargets its labels and baseline correctly when the same file moves between unstaged and staged states.
6. Validate rendered diffs for tables, Mermaid, KaTeX, alerts, clipboard comparison, and split/inline view toggling.
7. Validate that KaTeX inline and block math renders with correct font metrics (not just raw symbols).
8. Validate that the panel remains stable while staging, unstaging, and editing the same Markdown file.
9. Validate that split view keeps both panes evenly sized during refreshes.

## Quality Control

- **Linting**: `pnpm run lint` (Checks for style and common errors using ESLint 9).
- **Auto-fix**: `pnpm exec eslint src --fix`.
- **Release baseline**: `pnpm run compile`, `pnpm run test:unit`, `pnpm test`, then `pnpm run package`.

## License

This project is licensed under the MIT License.
