# Publishing Guide

## Prerequisites

1.  **VS Code Marketplace (MS)**:
    - You need a Personal Access Token (PAT) from Azure DevOps.
    - Ensure the publisher `phine-apps` exists and you are a member.
    - Login: `vsce login phine-apps`

2.  **OpenVSX**:
    - You need an Access Token from open-vsx.org.
    - Create namespace `phine-apps` if not exists.
    - Login: `npx ovsx login phine-apps`

## Commands

### Package

To create a `.vsix` file for testing or manual upload:

```bash
pnpm run package
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
