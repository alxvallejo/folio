<p align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/assets/folio-wordmark-dark.svg"><img src="docs/assets/folio-wordmark.svg" alt="folio" width="260"></picture></p>

# Folio

A personal macOS app for reading local Markdown files. Folio only writes to posts in your posts folder, and only when you edit them; every other file is read-only. Built with Tauri 2 and React/TypeScript.

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

## Writing posts

Folio opens the Markdown files in your posts folder for writing (`~/Documents/Folio/Posts` unless you choose another in Settings), with the same themes as reading.

<img src="docs/screenshots/writing.png" alt="Writing a post in Folio, with the Riso theme">

- **New post** (⌘N, or the button at the top of the sidebar) creates a draft in the posts folder and puts the cursor in its empty title. The file is named after the title, and renamed when you change the title and move off that line. If no posts folder is set yet, Folio uses `~/Documents/Folio/Posts`, creating it if needed.
- **Autosave** writes about a second after you stop typing, and again when you switch files, leave the window, close it, quit or install an update. The title bar shows saved, saving or not saved.
- **Links**: ⌘K, right-click, or paste a URL over selected text.
- **Copy for Substack** (⇧⌘C) puts the post on the clipboard as formatted text, ready to paste into a Substack draft.
- **Mark published** sets `status: published` and adds a `published` date; **Mark as draft** flips it back.

## Daily report

**File › Daily Report** (⇧⌘R) runs the report command from Settings in your login shell and opens the Markdown file whose path the command prints last. With no command set, it opens **Help › Build a Daily Report**, a guide to the starter script Folio ships in `guides/daily-report/`: it summarizes yesterday's git commits and Claude Code sessions with `claude -p` for a standup. While the command runs, a banner offers Cancel; if it fails, the banner shows its last lines of error output.

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

Settings live in `~/.config/folio/config.json`. Besides posts you edit, it is the only file Folio writes, apart from replacing its own app when you install an update. Folio never changes your other documents, and it only becomes the default Markdown app after you confirm the macOS dialog. The report command you set runs as you, so it can write wherever you can; Folio only opens the file it reports.
