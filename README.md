<p align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/assets/folio-wordmark-dark.svg"><img src="docs/assets/folio-wordmark.svg" alt="folio" width="260"></picture></p>

# Folio

A personal macOS app for reading local Markdown files. Read-only: Folio never writes to your documents. Built with Tauri 2 and React/TypeScript.

<picture><source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/klein.png"><img src="docs/screenshots/riso.png" alt="Folio showing a Markdown document in the Riso theme, with a folder sidebar and a table of contents"></picture>

## Install

Download the DMG from the [latest release](https://github.com/alxvallejo/folio/releases) (Apple Silicon). The app isn't signed by Apple yet, so the release notes explain how to open it the first time.

From 0.3.0 on, Folio checks for updates on its own and offers to install them; **Folio → Check for Updates…** checks right away. Turn the automatic check off in Settings.

## Themes

Folio switches with macOS appearance. Pick a light theme and a dark theme separately in Settings (⌘,); each theme brings its own heading, body and code fonts.

<table>
  <tr>
    <td><img src="docs/screenshots/riso.png" alt="Riso theme"><br><b>Riso</b> · light, default</td>
    <td><img src="docs/screenshots/klein.png" alt="Klein theme"><br><b>Klein</b> · dark, default</td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/paper.png" alt="Paper theme"><br><b>Paper</b> · light and dark</td>
    <td><img src="docs/screenshots/minimal.png" alt="Minimal theme"><br><b>Minimal</b> · light and dark</td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/citrus.png" alt="Citrus theme"><br><b>Citrus</b> · light</td>
    <td><img src="docs/screenshots/terracotta.png" alt="Terracotta theme"><br><b>Terracotta</b> · light</td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/neon-noir.png" alt="Neon Noir theme"><br><b>Neon Noir</b> · dark</td>
    <td><img src="docs/screenshots/klein-settings.png" alt="The Settings panel open over the Klein theme"><br><b>Settings</b> · fonts, size, line height, width</td>
  </tr>
</table>

## Develop

```sh
npm install
npm run tauri dev          # run the app
npm test                   # frontend tests
cd src-tauri && cargo test # backend tests
npx tauri build --bundles app
```

### Screenshots

`npm run screenshots` regenerates everything in `docs/screenshots/`. It renders the real frontend in WebKit against mocked Tauri commands and a sample document (`scripts/screenshots/`). The first run needs `npx playwright install webkit`.

### Releasing

Releases are signed for the updater with a key made once by `scripts/setup-updater-key.sh` (it lives in `~/.tauri/folio-updater.key`, with its password in the login Keychain). Then:

```sh
scripts/release.sh 0.3.1 notes.md --dry-run   # build and stage only
scripts/release.sh 0.3.1 notes.md             # bump, build, tag, push and publish
```

The script checks that you're on a clean, pushed `master` and that the tests pass, and asks before it publishes.

## Config

Settings live in `~/.config/folio/config.json`. It is the only file Folio writes, apart from replacing its own app when you install an update. Folio never changes your documents, and it only becomes the default Markdown app after you confirm the macOS dialog.
