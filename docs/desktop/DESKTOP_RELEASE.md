# MailMind Desktop Release

## Local Build

```bash
cd desktop
npm install
npm run typecheck
npm run build
npm run pack       # unpacked app
npm run dist       # installer
```

## GitHub Actions Build

The workflow at `.github/workflows/desktop-release.yml` builds installers for all platforms.

### Triggers

- `workflow_dispatch` (manual)
- `push` tags matching `v*-desktop-*` or `v0.7.*`

### Matrix

| Runner | Output |
|---|---|
| `windows-latest` | NSIS installer (`.exe`) |
| `macos-latest` | DMG (`.dmg`) |
| `ubuntu-latest` | AppImage (`.AppImage`) |

### Artifacts

Each platform uploads its installer as a GitHub Actions artifact. On tag pushes, artifacts are attached to the GitHub Release.

## Unsigned Builds

v0.7.0 desktop builds are **unsigned**. Users will encounter:

- **Windows**: SmartScreen "Windows protected your PC" warning. Click "More info" → "Run anyway".
- **macOS**: Gatekeeper "can't be opened because it is from an unidentified developer." Right-click → Open, or go to System Settings → Privacy & Security → Allow.
- **Linux**: No warning for AppImage. May need `chmod +x` for first run.

## Future: Code Signing

Planned for v1.0.0 All-in-one release:

- Windows: EV code signing certificate
- macOS: Apple Developer ID + notarization via `notarytool`
- Both require paid certificates and CI secrets
