# Packaging (Windows / NSIS)

## Build with electron-builder

From the repository root:

```bash
npm install
npm run build:win
```

`build:win` runs a Node.js LTS warning check and then builds a Windows NSIS installer via `electron-builder`.

## electron-builder notes

- Configuration is in `package.json` under `build`.
- The NSIS include hook file is `tools/installer/include.nsh`.
- To customize installer icon, set `build.win.icon` to an `.ico` file path.
- To enable code signing, add standard `electron-builder` signing settings/cert environment variables on Windows CI or release machines.

## Sample standalone NSIS script

Example files:

- `tools/installer/installer.nsi`
- `tools/installer/include.nsh`

Build the sample script manually (optional):

```bash
makensis /DAPP_NAME="3D Game" /DAPP_ARTIFACT_DIR="dist\win-unpacked" tools\installer\installer.nsi
```

The script includes `PreInstallHook` and `PostInstallHook` (plus uninstall hooks) in `include.nsh` for custom steps.
