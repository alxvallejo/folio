# Folio — In-App Updates (v0.3.0)

**Date:** 2026-10-13
**Status:** Approved in brainstorming, pending written-spec review
**Builds on:** `2026-10-12-folio-design.md` (v1) and `2026-10-13-folio-themes-icon-design.md` (v0.2.0). Everything there stays unless this spec replaces it.

## Purpose

Today, getting a new Folio means downloading the DMG from GitHub and replacing the app by hand. v0.3.0 makes Folio update itself: it notices a new release, asks once, installs it, and reopens the document you were reading.

**Success:**
- A copy of v0.3.0 installed in `/Applications` updates to v0.3.1 from the in-app banner without opening a browser.
- It relaunches into the same document.
- The updated app opens with no Gatekeeper prompt.

## Scope

**In:**
- Tauri updater plugin with signed updates.
- An automatic check on launch, with a settings toggle.
- A manual "Check for Updates…" menu item.
- The update banner with progress and errors.
- Relaunching into the open document.
- A custom app menu that keeps the standard items.
- A one-time key setup script and a release script.
- Publishing releases as normal (not pre-release) GitHub releases.

**Out:**
- Apple code signing and notarization.
- Intel or universal builds.
- "Skip This Version".
- Update channels (beta/stable).
- Delta updates.
- Automatic background install.

## User experience

**Automatic check.**
- When `autoUpdateCheck` is on (the default), Folio checks for an update 30 seconds after launch, once per launch.
- If there's no update, or the check fails (offline, server error, invalid manifest), nothing is shown.

**Update banner.**
- When an update is available, a banner appears at the top of the document area, in the same slot as the "File no longer exists" banner.
- Copy: `Folio <version> is available.`
- Actions, in order: **What's new** (opens `https://github.com/alxvallejo/folio/releases/tag/v<version>` in the default browser), **Later**, and **Install & Relaunch** (primary).
- **Later** hides the banner until the next launch.
- The banner never steals focus and never covers document text.

**Installing.**
- **Install & Relaunch** turns the banner into progress: `Downloading… <n>%` when the size is known, `Downloading…` when it isn't, then `Installing…`.
- On success Folio relaunches. If a document was open, the new instance opens that same path; otherwise it starts normally and restores the last folder.
- On failure the banner shows `Couldn't install the update: <reason>` with **Try Again** and **Dismiss**. The running version is unaffected.

**Manual check.**
- **Folio → Check for Updates…** always runs a check, whatever the setting.
- With an update: the same banner.
- With none: the toast `You're on the latest version (<current>).`
- On error: the toast `Couldn't check for updates: <reason>.`
- A manual check while a download or install is in progress is ignored.

**Settings.**
- A checkbox labeled "Check for updates automatically", bound to `autoUpdateCheck`.

## App menu

Folio replaces Tauri's default menu with an explicit one.

**Folio** submenu:
- About Folio
- separator
- **Check for Updates…** (id `check-for-updates`)
- separator
- Services
- separator
- Hide Folio, Hide Others, Show All
- separator
- Quit Folio

**Edit** submenu: Undo, Redo, separator, Cut, Copy, Paste, Select All.

**Window** submenu: Minimize, Zoom, Close Window.

Standard shortcuts keep working: ⌘C, ⌘V, ⌘A, ⌘Q, ⌘W, ⌘H, ⌘M. Selecting **Check for Updates…** emits the event `menu-check-for-updates` to the frontend.

## Architecture

### Rust (`src-tauri/`)

**Updater plugin.**
- Add `tauri-plugin-updater` (desktop target), registered on the builder.
- `tauri.conf.json`:
  - `bundle.createUpdaterArtifacts: true`
  - `plugins.updater.pubkey: "<contents of folio-updater.key.pub>"`
  - `plugins.updater.endpoints: ["https://github.com/alxvallejo/folio/releases/latest/download/latest.json"]`

**Menu module** (`menu.rs`). Builds the menu above, sets it in `setup`, and handles `on_menu_event`, emitting `menu-check-for-updates` for the update item.

**Relaunch** (`relaunch.rs`).
- Command `relaunch(path: Option<String>)`:
  1. Spawns `std::env::current_exe()` with `path` as its only argument (when given and the file exists).
  2. Then calls `app.exit(0)`.
- The new instance receives the path through the existing `paths_from_args` → `PendingOpen` cold-start flow.
- The executable path is unchanged after an in-place bundle swap.
- The pure function `relaunch_args(path: Option<&str>) -> Vec<String>` is unit-tested: no path gives no args; a path that doesn't exist gives no args; an existing path gives `[path]`.

**Capabilities.** Add `updater:allow-check`, `updater:allow-download-and-install`, and `opener:default` (already present, used for What's new).

### Frontend (`src/`)

**`update/updater.ts`** is a small state machine with injected dependencies (`check`, `relaunch`, `notify`), so it's testable without Tauri.
- States:
  - `idle`
  - `available{version}`
  - `downloading{percent|null}`
  - `installing`
  - `failed{version, message}`
  - `dismissed`
- `checkAutomatically()` swallows errors and "no update".
- `checkManually()` reports both through `notify`.
- `install()` runs `downloadAndInstall` with progress events (`Started` → total, `Progress` → accumulated chunk lengths, `Finished`), then `relaunch(currentPath)`.
- `dismiss()` sets `dismissed`.
- Manual checks are ignored while `downloading` or `installing`.

**`ui/UpdateBanner.tsx`.** Renders the states above. It's a `role="status"` region; buttons are real `<button>`s.

**`ui/App.tsx`.**
- Creates the updater once.
- Listens for `menu-check-for-updates`.
- Schedules the 30-second automatic check when `settings.autoUpdateCheck` is true, once per launch, after settings have loaded.
- Passes the current document path to `install`.

**Settings.**
- `autoUpdateCheck: boolean`, default `true`.
- Written to config only when `false`, following the existing minimal write-back.
- Non-boolean values fall back to the default.

## Release pipeline

**One-time key setup: `scripts/setup-updater-key.sh`**, run by the user.
1. Refuses to run if `~/.tauri/folio-updater.key` already exists.
2. Generates a random 32-byte password and stores it in the login Keychain: service `folio-updater-key`, account `$USER`.
3. Runs `npx tauri signer generate -w ~/.tauri/folio-updater.key` with that password (non-interactive).
4. Prints the public key and a reminder to back up both the key file and the password in a password manager. Losing the key means installed copies can never auto-update again.

**Releasing: `scripts/release.sh <version> <notes.md> [--dry-run]`**
1. Preconditions, each failing loudly:
   - on `master`
   - clean tree
   - `master` equals `origin/master`
   - `<version>` is SemVer and greater than the current version
   - notes file exists
   - key file and Keychain password present
   - `npm test`, `tsc --noEmit` and `cargo test` pass
2. Bumps the version in `package.json`, `src-tauri/Cargo.toml` and `src-tauri/tauri.conf.json`, then commits `Release <version>` and tags `v<version>`.
3. Builds with `TAURI_SIGNING_PRIVATE_KEY=~/.tauri/folio-updater.key` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD=<from Keychain>` as real environment variables (not a `.env` file), producing the DMG, `Folio.app.tar.gz` and `Folio.app.tar.gz.sig`.
4. Generates `latest.json` with `scripts/release/latest-json.mjs`:
   - `version`, `notes`, and `pub_date` (RFC 3339)
   - `platforms.darwin-aarch64.url` = `https://github.com/alxvallejo/folio/releases/download/v<version>/Folio.app.tar.gz`
   - `platforms.darwin-aarch64.signature` = the `.sig` file contents
5. Stages assets:
   - `Folio_<version>_aarch64.dmg`
   - a copy named `Folio_aarch64.dmg`, which gives a stable `releases/latest/download/` link
   - `Folio.app.tar.gz`
   - `latest.json`
6. Unless `--dry-run`:
   1. Pushes the commit and tag.
   2. Creates a normal (not pre-release) GitHub release titled `Folio <version>`. The notes start with a short unsigned-app install note, followed by the notes file.

   With `--dry-run`, it instead undoes the version bump commit and tag after building.

**`latest-json.mjs`** exports a pure `buildLatestJson({version, notes, pubDate, url, signature})`. It throws when the version isn't SemVer or the signature/url is empty. It's unit-tested; Vitest's `include` adds `scripts/**/*.test.mjs`.

## Testing

**Vitest:**
- the updater state machine: every transition, the automatic-check silence, manual-check toasts, progress percentage, failure then Try Again, and ignoring a check while downloading
- `buildLatestJson`
- the `autoUpdateCheck` setting default and write-back

**cargo test:** `relaunch_args`.

**Build:** `npx tauri build --bundles app,dmg` with signing env vars produces the `.tar.gz` and `.sig`. A plan step confirms the artifact names and path.

**Manual end-to-end** (the rollout below):
- the banner appears in 0.3.0
- installing reaches 0.3.1 and reopens the document
- `xattr -l /Applications/Folio.app` shows no `com.apple.quarantine` afterwards
- the menu's Edit shortcuts still work
- with the setting off, there's no automatic check

## Rollout

1. Release **v0.3.0**, the first version that can update itself, as a normal release. Users install it manually once; v0.1 and v0.2 can't update themselves.
2. Release **v0.3.1**, a small change, and run the manual end-to-end checks from a v0.3.0 install.
3. Each release is published only after the user approves it.

## To confirm during planning

These are facts the docs check couldn't verify:
- `SubmenuBuilder` predefined-item method names in tauri 2.12.
- The `tauri signer generate` flags for a non-interactive password.
- The exact macOS updater artifact path with the default target.
- Whether `Update` exposes `currentVersion` in `@tauri-apps/plugin-updater`. If it doesn't, read the current version with `getVersion()` from `@tauri-apps/api/app`.
