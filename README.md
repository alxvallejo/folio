<p align="center"><img src="docs/assets/folio-wordmark.svg" alt="folio" width="260"></p>

# Folio

A personal macOS app for reading local Markdown files. Read-only: Folio never writes to your documents. Built with Tauri 2 and React/TypeScript.

## Develop

```sh
npm install
npm run tauri dev          # run the app
npm test                   # frontend tests
cd src-tauri && cargo test # backend tests
npx tauri build --bundles app
```

## Config

Settings live in `~/.config/folio/config.json`. It is the only file Folio writes.
