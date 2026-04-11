# Publishing Guide

## Prerequisites

1. **VS Code Marketplace (MS)**:

- You need a Personal Access Token (PAT) from Azure DevOps.
- Ensure the publisher `phine-apps` exists and you are a member.
- Login: `vsce login phine-apps`

1. **OpenVSX**:

- You need an Access Token from open-vsx.org.
- Create namespace `phine-apps` if not exists.
- Login: `npx ovsx login phine-apps`

## Commands

### Package

To create a `.vsix` file for testing or manual upload:

```bash
pnpm run package
```

Install the generated package locally from the Extensions view using **Install from VSIX...**, or with the CLI:

```bash
code --install-extension rich-markdown-diff-<version>.vsix
```

### Publish to VS Code Marketplace

```bash
pnpm run publish:vsce
```

_Requires `VSCE_PAT` if not logged in locally._

### Publish to OpenVSX

```bash
pnpm run publish:ovsx
```

_Requires `OVSX_PAT` if not logged in locally._

## CI/CD Service Principals

For GitHub Actions, set the following secrets:

- `VSCE_PAT`: Token for VS Code Marketplace.
- `OVSX_PAT`: Token for OpenVSX.

## Release Checklist

1. Run `pnpm run compile`, `pnpm run test:unit`, and `pnpm test`.
2. Build a local package with `pnpm run package`.
3. Install the `.vsix` locally and smoke-test SCM, clipboard, and two-file diffs.
4. Verify staged-only, unstaged-only, mixed staged/unstaged, untracked, and deleted Markdown SCM entries open the expected comparison level.
5. Verify the editor title action appears only for meaningful Git-backed Markdown diffs and that the panel remains stable while staging and unstaging.
6. Update `package.json` and `CHANGELOG.md` for the release version.
7. Push the release tag so `.github/workflows/release.yml` can publish the package.
