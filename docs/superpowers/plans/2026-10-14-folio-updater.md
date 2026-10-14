# Folio v0.3.0 — In-App Updates and Default Markdown App — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Folio notices a new GitHub release, offers it in a banner, installs it, and relaunches into the document you were reading. On its first launch from Applications, it also asks macOS once to make it the default Markdown app.

**Architecture:**
- **Rust:** `tauri-plugin-updater` does the check, download, signature check and bundle swap. Two new modules:
  - `menu.rs` builds an explicit app menu with **Check for Updates…**.
  - `relaunch.rs` starts the new version on the open document and quits.
- **Frontend:** `src/update/updater.ts` is a small store/state machine with injected dependencies, so it's tested without Tauri. `UpdateBanner.tsx` renders its state; `App.tsx` wires it to the plugin, the menu event and the `autoUpdateCheck` setting.
- **Releases:** `scripts/release.sh` builds a signed bundle, writes `latest.json` and publishes a normal GitHub release. The updater endpoint is that release's `latest.json`.
- **Default app (Tasks 6–7):** `default_app.rs` wraps `NSWorkspace` through `objc2-app-kit`. A pure `askOnFirstLaunch` in `src/defaultApp/defaultApp.ts` runs the one-time ask, and Settings shows the current default with a button.

**Tech Stack:** existing (Tauri 2.12, React 19, TypeScript, Vitest) + `tauri-plugin-updater` 2.x (crate) and `@tauri-apps/plugin-updater` 2.x (npm), `objc2` 0.6 / `block2` 0.6 / `objc2-foundation`, `objc2-app-kit` and `objc2-uniform-type-identifiers` 0.3, bash, Node ESM scripts, `gh`.

**Specs:** `docs/superpowers/specs/2026-10-13-folio-updater-design.md` (Tasks 1–5) and `docs/superpowers/specs/2026-10-14-folio-default-app-design.md` (Tasks 6–7). Read the one for your task before starting. The v1 and v0.2.0 specs still govern everything it doesn't replace.

## Global Constraints

- Updater endpoint: `https://github.com/alxvallejo/folio/releases/latest/download/latest.json`.
- Release page link: `https://github.com/alxvallejo/folio/releases/tag/v<version>`.
- Automatic check: 30 seconds after settings load, once per launch, only when `autoUpdateCheck` is true. Silent on no update and on errors.
- Copy, exactly:
  - banner: `Folio <version> is available.` with **What's new**, **Later**, **Install & Relaunch**
  - progress: `Downloading… <n>%`, `Downloading…`, `Installing…`
  - failure: `Couldn't install the update: <reason>` with **Try Again**, **Dismiss**
  - toasts: `You're on the latest version (<current>).` and `Couldn't check for updates: <reason>.`
  - menu item: `Check for Updates…` (id `check-for-updates`), event `menu-check-for-updates`
  - settings: `Check for updates automatically`
- Setting `autoUpdateCheck`: boolean, default `true`, written to config only when `false`; non-booleans fall back to `true`.
- Default app:
  - content type `net.daringfireball.markdown`
  - first-launch ask 2 seconds after settings load, at most once per launch
  - config key `defaultAppAsked`: boolean, default `false`, written only when `true`
  - copy: `Default Markdown app:`, **Make Folio Default**, `Move Folio to Applications to make it the default.`, toast `Couldn't make Folio the default: <reason>.`
- Key file `~/.tauri/folio-updater.key`; Keychain service `folio-updater-key`, account `$USER`.
- Only the user runs `scripts/setup-updater-key.sh` and only the user publishes a release. Agents never touch the real `~/.tauri`, the login Keychain, `~/.config/folio` or `/Applications`, and never call `make_default_markdown_app` or `setDefaultApplication` (it changes the user's real default).
- tsconfig `lib` is ES2020: no `Array.prototype.at`, no `Object.hasOwn`.
- Cargo: `PATH="$HOME/.cargo/bin:$PATH" cargo …` (sourcing `~/.cargo/env` is blocked in the agent sandbox).
- Commits: short imperative subject, blank line, then the Co-Authored-By line for the model that wrote the commit.

**Spec deviations decided while planning** (each is small; the reviewer should hold the code to these, not the spec's original wording):
1. `createUpdaterArtifacts` is **not** set in `tauri.conf.json`. With it set, every `tauri build` fails without the private key, which breaks the README's plain `npx tauri build --bundles app`. `release.sh` passes it with `--config` instead.
2. The menu keeps a **View → Enter Full Screen** submenu. Tauri's default menu has it, and dropping it would lose ⌃⌘F. The spec's "keeps the standard items" wins over its item list.
3. **Relaunch** goes through `/usr/bin/open -n <Folio.app> --args <path>` when running from a bundle, as Tauri's own `restart` does on macOS. Spawning the binary directly can abort the new instance once the old one's stdout closes. It still lands in the same `paths_from_args` → `PendingOpen` cold-start flow.
4. The update banner is a **flex row above `.doc-scroll`**, not a sticky element inside it, so it takes its own space and never covers document text.
5. **Try Again** checks the server again for a fresh update instead of reusing the failed download.
6. Failed-state buttons are **Dismiss**, then **Try Again** (primary last, like the available state).
7. `release.sh` **builds before it commits**. The version bump stays uncommitted until the build succeeds, and an exit trap restores the version files on any failure. `--dry-run` never commits or tags, so there's nothing to undo.
8. `release.sh` asks `Publish Folio <version>? [y/N]` before pushing. Releases are published only with the user's approval.
9. Versions are plain `X.Y.Z` (no pre-release suffixes).
10. `release.sh --dry-run` skips the "on master" and "matches origin/master" checks so it can run from a feature branch. All other preconditions still apply.
11. `release.sh` also bumps `package-lock.json` (via `npm version`) and `src-tauri/Cargo.lock`, so the release commit is complete.

## Review Focus

1. **A check that finishes mid-install:** an automatic check still in flight when the user clicks Install & Relaunch, or a manual check, must never replace the progress banner with "available". Pinned by the "stale check result" tests in Task 3.
2. **Unknown download size:** a missing or `0` `contentLength` must show `Downloading…`, never `NaN%`, `Infinity%` or more than 100%. Progress events arrive per chunk, so the store must notify only when the whole-number percent changes. Pinned by the progress tests in Task 3.
3. **The open document is gone at relaunch,** or its path has spaces: a deleted or moved file must relaunch with no argument (normal start, last folder restored), and a path with spaces must arrive as one argument. Pinned by the `relaunch_args` tests in Task 2.
4. **The setting is switched off before the 30 seconds are up:** no check may run. Also, toggling must never cause a second check in one launch. Pinned by the `scheduleAutomaticCheck` tests in Task 3 and the effect cleanup in Task 4.
5. **A release that fails halfway:** a failing test run, build, or missing key must leave no bumped files, commit or tag behind. Pinned by the `version.mjs` tests, the exit trap and the failure dry runs in Task 5.

Default app (Tasks 6–7):

6. **Declining the macOS dialog** must be silent and final: no toast, and `defaultAppAsked` is written so it never asks again. macOS reports a decline as `NSCocoaErrorDomain` 256 wrapping `userCanceledErr` (-128). Pinned by the `outcome` tests in Task 6 and the `askOnFirstLaunch` tests in Task 7.
7. **Running from the DMG or an App Translocation copy** must never ask, and must not write the key either, so the later real install still asks. Pinned by the `is_installed_location` tests in Task 6 and the "not a real install" test in Task 7.
8. **The status query fails at launch:** stay silent, don't write the key, try again next launch. Pinned by the error test in Task 7.

---

## File Structure

```
scripts/setup-updater-key.sh        NEW  one-time key + Keychain password (user runs it)
scripts/release.sh                  NEW  preconditions, bump, signed build, assets, publish
scripts/release/latest-json.mjs     NEW  buildLatestJson + CLI
scripts/release/latest-json.test.mjs NEW
scripts/release/version.mjs         NEW  isSemver, compareSemver, bump helpers + CLI
scripts/release/version.test.mjs    NEW
scripts/release/install-note.md     NEW  unsigned-app note prepended to release notes
src-tauri/Cargo.toml                MOD  tauri-plugin-updater
src-tauri/tauri.conf.json           MOD  plugins.updater (pubkey, endpoints); Markdown contentTypes
src-tauri/capabilities/default.json MOD  updater permissions
src-tauri/src/lib.rs                MOD  updater plugin, menu, relaunch command
src-tauri/src/menu.rs               NEW  app menu + menu event
src-tauri/src/relaunch.rs           NEW  relaunch_args, bundle_root, relaunch command
src/settings/schema.ts              MOD  autoUpdateCheck
src/settings/schema.test.ts         MOD
src/ui/SettingsPanel.tsx            MOD  checkbox
src/update/updater.ts               NEW  update store/state machine, bannerMessage, releaseNotesUrl
src/update/updater.test.ts          NEW
src/ui/UpdateBanner.tsx             NEW
src/ui/App.tsx                      MOD  wiring
src/lib/api.ts                      MOD  relaunch command, menu event
src/styles/app.css                  MOD  .update-banner, .settings-check, .settings-default-app
src-tauri/src/default_app.rs        NEW  is_installed_location, is_user_cancel, outcome, 2 commands
src/defaultApp/defaultApp.ts        NEW  shouldAsk, askOnFirstLaunch
src/defaultApp/defaultApp.test.ts   NEW
scripts/screenshots/mock.ts         MOD  mock the updater check
vite.config.ts                      MOD  test include adds scripts/**/*.test.mjs
package.json, package-lock.json     MOD  @tauri-apps/plugin-updater
README.md                           MOD  updates + releasing
```

---

### Task 1: Updater key and plugin setup

This task needs the user once, in the middle. The key and its password are the user's secrets; the agent writes the script, and the user runs it.

**Files:**
- Create: `scripts/setup-updater-key.sh`
- Modify: `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`, `src-tauri/capabilities/default.json`, `src-tauri/src/lib.rs`, `package.json`, `package-lock.json`

**Interfaces:**
- Produces: the updater plugin registered in Rust; `@tauri-apps/plugin-updater` installed for Task 4; the public key in `tauri.conf.json`; `~/.tauri/folio-updater.key` and its Keychain password for Task 5.

- [ ] **Step 1: Write the key setup script**

`scripts/setup-updater-key.sh`:

```bash
#!/usr/bin/env bash
# One-time: creates the key that signs Folio updates. Run it yourself, once, on the Mac you release from.
set -euo pipefail

KEY="$HOME/.tauri/folio-updater.key"
SERVICE=folio-updater-key

if [[ -e $KEY ]]; then
  echo "$KEY already exists. Installed copies of Folio trust only that key, so it's never overwritten." >&2
  exit 1
fi

cd "$(git rev-parse --show-toplevel)"
mkdir -p "$HOME/.tauri"

PASSWORD=$(openssl rand -base64 32)
security add-generic-password -U -s "$SERVICE" -a "$USER" -w "$PASSWORD"
npx tauri signer generate --ci -p "$PASSWORD" -w "$KEY" >/dev/null
chmod 600 "$KEY"

echo "Public key (goes in src-tauri/tauri.conf.json, plugins.updater.pubkey):"
echo
cat "$KEY.pub"
echo
echo
cat <<EOF
Back up both of these in your password manager now:
  1. the key file: $KEY
  2. the password: security find-generic-password -s $SERVICE -a $USER -w
If either is lost, installed copies of Folio can never update themselves again.
EOF
```

Run: `chmod +x scripts/setup-updater-key.sh && bash -n scripts/setup-updater-key.sh`
Expected: no output (syntax OK). Do **not** run the script.

- [ ] **Step 2: Ask the user to run it**

Stop and tell the user, in these words or close:

> Task 1 needs your signing key. Run `! scripts/setup-updater-key.sh` here. It creates `~/.tauri/folio-updater.key`, stores its password in your login Keychain and prints the public key. Then back up the key file and the password in your password manager.

Wait for the output. Copy the public key (the single base64 line after "Public key") exactly. If the script says the key already exists, ask the user to run `! cat ~/.tauri/folio-updater.key.pub` instead.

- [ ] **Step 3: Add the plugin**

```bash
PATH="$HOME/.cargo/bin:$PATH" cargo add tauri-plugin-updater@2 --manifest-path src-tauri/Cargo.toml
npm install @tauri-apps/plugin-updater@^2
```

Expected: `src-tauri/Cargo.toml` `[dependencies]` gains `tauri-plugin-updater = "2"` (Folio is macOS-only, so no mobile target table). `package.json` gains `"@tauri-apps/plugin-updater": "^2.x"`. If `cargo add` resolves a 3.x alpha, change it to `"2"` by hand.

- [ ] **Step 4: Configure it**

In `src-tauri/tauri.conf.json`, add a top-level `plugins` key after `bundle`, using the public key from Step 2:

```json
  "plugins": {
    "updater": {
      "pubkey": "<the public key line from Step 2>",
      "endpoints": ["https://github.com/alxvallejo/folio/releases/latest/download/latest.json"]
    }
  }
```

Don't add `bundle.createUpdaterArtifacts` (deviation 1).

In `src-tauri/capabilities/default.json`, add to `permissions` after `"dialog:allow-open"`:

```json
    "updater:allow-check",
    "updater:allow-download-and-install"
```

In `src-tauri/src/lib.rs`, register the plugin after the opener plugin:

```rust
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
```

- [ ] **Step 5: Verify**

Run: `cd src-tauri && PATH="$HOME/.cargo/bin:$PATH" cargo test`
Expected: compiles; all existing tests PASS.

Run: `npm test && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add scripts/setup-updater-key.sh src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/tauri.conf.json src-tauri/capabilities/default.json src-tauri/src/lib.rs package.json package-lock.json
git commit -m "Add the updater plugin and a one-time signing key script"
```

---

### Task 2: App menu and relaunch command (Rust)

**Files:**
- Create: `src-tauri/src/menu.rs`, `src-tauri/src/relaunch.rs`
- Modify: `src-tauri/src/lib.rs`

**Interfaces:**
- Consumes: nothing from Task 1 except a compiling `lib.rs`.
- Produces:
  - event `menu-check-for-updates` (no payload), emitted when the menu item is chosen
  - command `relaunch` with argument `{ path: string | null }`, returning `Result<(), String>`. On success the app exits.

- [ ] **Step 1: Write the failing relaunch tests**

`src-tauri/src/relaunch.rs`:

```rust
use std::ffi::OsStr;
use std::path::Path;
use std::process::{Command, Stdio};
use tauri::{AppHandle, Manager};

/// Arguments for the relaunched Folio: the open document, if it still exists.
pub fn relaunch_args(path: Option<&str>) -> Vec<String> {
    unimplemented!()
}

/// `/Applications/Folio.app` for `/Applications/Folio.app/Contents/MacOS/folio`; None outside a bundle (`tauri dev`).
pub fn bundle_root(exe: &Path) -> Option<&Path> {
    unimplemented!()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn no_path_gives_no_args() {
        assert!(relaunch_args(None).is_empty());
    }

    #[test]
    fn missing_file_or_directory_gives_no_args() {
        let dir = tempfile::tempdir().unwrap();
        let gone = dir.path().join("deleted.md");
        assert!(relaunch_args(Some(gone.to_str().unwrap())).is_empty());
        assert!(relaunch_args(Some(dir.path().to_str().unwrap())).is_empty());
    }

    #[test]
    fn existing_file_is_the_only_arg_even_with_spaces() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("Two-ink printing.md");
        std::fs::write(&file, "x").unwrap();
        let path = file.to_str().unwrap();
        assert_eq!(relaunch_args(Some(path)), vec![path.to_string()]);
    }

    #[test]
    fn finds_the_app_bundle() {
        let exe = Path::new("/Applications/Folio.app/Contents/MacOS/folio");
        assert_eq!(bundle_root(exe), Some(Path::new("/Applications/Folio.app")));
    }

    #[test]
    fn no_bundle_for_dev_builds_or_lookalikes() {
        assert_eq!(bundle_root(Path::new("/repo/src-tauri/target/debug/folio")), None);
        assert_eq!(bundle_root(Path::new("/tmp/Folio/Contents/MacOS/folio")), None);
        assert_eq!(bundle_root(Path::new("folio")), None);
    }
}
```

Add `mod relaunch;` to `src-tauri/src/lib.rs` (keep the `mod` list alphabetical: after `open`).

- [ ] **Step 2: Run them to verify they fail**

Run: `cd src-tauri && PATH="$HOME/.cargo/bin:$PATH" cargo test relaunch`
Expected: FAIL (panics at `unimplemented!`).

- [ ] **Step 3: Implement**

Replace the two stub bodies and add the command:

```rust
/// Arguments for the relaunched Folio: the open document, if it still exists.
pub fn relaunch_args(path: Option<&str>) -> Vec<String> {
    match path {
        Some(p) if Path::new(p).is_file() => vec![p.to_string()],
        _ => Vec::new(),
    }
}

/// `/Applications/Folio.app` for `/Applications/Folio.app/Contents/MacOS/folio`; None outside a bundle (`tauri dev`).
pub fn bundle_root(exe: &Path) -> Option<&Path> {
    let macos = exe.parent()?;
    let contents = macos.parent()?;
    let root = contents.parent()?;
    let is_bundle = macos.file_name()? == OsStr::new("MacOS")
        && contents.file_name()? == OsStr::new("Contents")
        && root.extension()? == OsStr::new("app");
    is_bundle.then_some(root)
}

/// Starts a fresh Folio (the version just installed) on `path`, then quits this one.
/// The new instance gets `path` as a command-line argument, so it opens through `paths_from_args`.
#[tauri::command]
pub fn relaunch(app: AppHandle, path: Option<String>) -> Result<(), String> {
    let exe = tauri::process::current_binary(&app.env()).map_err(|e| e.to_string())?;
    let args = relaunch_args(path.as_deref());
    match bundle_root(&exe) {
        // Through LaunchServices, as Tauri's own restart does, so launchd owns the new process
        // instead of it inheriting the stdio of this one, which is about to exit.
        Some(root) => {
            let out = Command::new("/usr/bin/open")
                .arg("-n")
                .arg(root)
                .arg("--args")
                .args(&args)
                .stdin(Stdio::null())
                .output()
                .map_err(|e| e.to_string())?;
            if !out.status.success() {
                return Err(String::from_utf8_lossy(&out.stderr).trim().to_string());
            }
        }
        None => {
            Command::new(&exe)
                .args(&args)
                .stdin(Stdio::null())
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .spawn()
                .map_err(|e| e.to_string())?;
        }
    }
    app.exit(0);
    Ok(())
}
```

- [ ] **Step 4: Run them to verify they pass**

Run: `cd src-tauri && PATH="$HOME/.cargo/bin:$PATH" cargo test relaunch`
Expected: 5 PASS.

- [ ] **Step 5: Write the menu**

`src-tauri/src/menu.rs`:

```rust
use tauri::menu::{AboutMetadata, Menu, MenuBuilder, MenuEvent, SubmenuBuilder, WINDOW_SUBMENU_ID};
use tauri::{AppHandle, Emitter, Runtime};

pub const CHECK_FOR_UPDATES: &str = "check-for-updates";

/// Tauri's default macOS menu, minus File and Help, plus Check for Updates… in the app menu.
pub fn build<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Menu<R>> {
    let pkg = app.package_info();
    let about = AboutMetadata {
        name: Some(pkg.name.clone()),
        version: Some(pkg.version.to_string()),
        ..Default::default()
    };
    let folio = SubmenuBuilder::new(app, "Folio")
        .about(Some(about))
        .separator()
        .text(CHECK_FOR_UPDATES, "Check for Updates…")
        .separator()
        .services()
        .separator()
        .hide()
        .hide_others()
        .show_all()
        .separator()
        .quit()
        .build()?;
    let edit = SubmenuBuilder::new(app, "Edit")
        .undo()
        .redo()
        .separator()
        .cut()
        .copy()
        .paste()
        .select_all()
        .build()?;
    let view = SubmenuBuilder::new(app, "View").fullscreen().build()?;
    // The window-menu id lets macOS list open windows in it.
    let window = SubmenuBuilder::with_id(app, WINDOW_SUBMENU_ID, "Window")
        .minimize()
        .maximize()
        .separator()
        .close_window()
        .build()?;
    MenuBuilder::new(app).items(&[&folio, &edit, &view, &window]).build()
}

pub fn on_event<R: Runtime>(app: &AppHandle<R>, event: MenuEvent) {
    if event.id().0 == CHECK_FOR_UPDATES {
        let _ = app.emit("menu-check-for-updates", ());
    }
}
```

If a builder method name doesn't compile, check `~/.cargo/registry/src/*/tauri-2.12.3/src/menu/builders/menu.rs`; the shared item methods are listed there (`about`, `services`, `hide`, `hide_others`, `show_all`, `quit`, `undo`, `redo`, `cut`, `copy`, `paste`, `select_all`, `fullscreen`, `minimize`, `maximize`, `close_window`, `separator`, `text`).

- [ ] **Step 6: Wire both into `lib.rs`**

Add `mod menu;` (alphabetical: after `fs`). On the builder, after `.manage(watch::Watchers::default())`:

```rust
        .menu(menu::build)
        .on_menu_event(menu::on_event)
```

Add `relaunch::relaunch,` to `generate_handler!` after `editor::open_in_editor,`.

- [ ] **Step 7: Verify**

Run: `cd src-tauri && PATH="$HOME/.cargo/bin:$PATH" cargo test && PATH="$HOME/.cargo/bin:$PATH" cargo clippy --all-targets -- -D warnings`
Expected: all PASS; no clippy warnings. (If clippy isn't installed, skip it and say so in the report.)

- [ ] **Step 8: Commit**

```bash
git add src-tauri/src/menu.rs src-tauri/src/relaunch.rs src-tauri/src/lib.rs
git commit -m "Add an app menu with Check for Updates and a relaunch command"
```

---

### Task 3: `autoUpdateCheck` setting and the update store

**Files:**
- Modify: `src/settings/schema.ts`, `src/settings/schema.test.ts`, `src/ui/SettingsPanel.tsx`, `src/styles/app.css`
- Create: `src/update/updater.ts`, `src/update/updater.test.ts`

**Interfaces:**
- Consumes: the `DownloadEvent` type from `@tauri-apps/plugin-updater` (type-only import; Task 1 installed it).
- Produces, for Task 4:
  - `Settings.autoUpdateCheck: boolean`
  - `createUpdater(deps: UpdaterDeps): Updater`
  - `type UpdateState`, `interface PendingUpdate`, `interface UpdaterDeps`, `interface Updater` (below)
  - `bannerMessage(state: UpdateState): string | null`
  - `releaseNotesUrl(version: string): string`
  - `AUTO_CHECK_DELAY_MS = 30_000`

**Part A: the setting.**

- [ ] **Step 1: Write the failing setting tests**

In `src/settings/schema.test.ts`:

1. In "returns the defaults for an empty config", add `autoUpdateCheck: true,` after `lastFolder: null,` in the expected object.
2. In "ignores values of the wrong type", add `autoUpdateCheck: "no"` to the input object.
3. Add to `describe("effectiveSettings")`:

```ts
  it("reads autoUpdateCheck only when it is a boolean", () => {
    expect(effectiveSettings({ autoUpdateCheck: false }).autoUpdateCheck).toBe(false);
    expect(effectiveSettings({ autoUpdateCheck: true }).autoUpdateCheck).toBe(true);
    expect(effectiveSettings({ autoUpdateCheck: 0 }).autoUpdateCheck).toBe(true);
  });
```

4. Add to `describe("applyPatch")`:

```ts
  it("writes autoUpdateCheck only when it is turned off", () => {
    expect(applyPatch({}, { autoUpdateCheck: false })).toEqual({ autoUpdateCheck: false });
    expect(applyPatch({ autoUpdateCheck: false }, { autoUpdateCheck: true })).toEqual({});
  });
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/settings/schema.test.ts`
Expected: FAIL (and `tsc` would reject `autoUpdateCheck` in the patch).

- [ ] **Step 3: Implement**

In `src/settings/schema.ts`:
- `Settings` gains, after `lastFolder`:

```ts
  /** Check GitHub for a new Folio 30 seconds after launch. */
  autoUpdateCheck: boolean;
```

- `DEFAULTS` gains `autoUpdateCheck: true,` after `lastFolder: null,`.
- `effectiveSettings` returns, after `lastFolder`:

```ts
    autoUpdateCheck: typeof raw.autoUpdateCheck === "boolean" ? raw.autoUpdateCheck : DEFAULTS.autoUpdateCheck,
```

`applyPatch` needs no change: `true` equals the default and is deleted; `false` is written.

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run src/settings/`
Expected: PASS.

- [ ] **Step 5: Add the checkbox**

In `src/ui/SettingsPanel.tsx`, after the `Editor command` `TextField` and before the hint paragraph:

```tsx
      <label className="settings-check">
        <input type="checkbox" checked={settings.autoUpdateCheck} onChange={(e) => onChange({ autoUpdateCheck: e.target.checked })} />
        Check for updates automatically
      </label>
```

In `src/styles/app.css`, after the `.settings-panel input[type="range"]` rule:

```css
.settings-panel label.settings-check { flex-direction: row; align-items: center; gap: 8px; color: var(--fg); }
.settings-panel input[type="checkbox"] { margin: 0; accent-color: var(--accent); }
```

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/settings/schema.ts src/settings/schema.test.ts src/ui/SettingsPanel.tsx src/styles/app.css
git commit -m "Add the autoUpdateCheck setting"
```

**Part B: the update store.**

- [ ] **Step 7: Write the module skeleton**

`src/update/updater.ts`, types and stubs only:

```ts
import type { DownloadEvent } from "@tauri-apps/plugin-updater";

export const AUTO_CHECK_DELAY_MS = 30_000;

export const releaseNotesUrl = (version: string) => `https://github.com/alxvallejo/folio/releases/tag/v${version}`;

export type UpdateState =
  | { kind: "idle" }
  | { kind: "available"; version: string }
  | { kind: "downloading"; version: string; percent: number | null }
  | { kind: "installing"; version: string }
  | { kind: "failed"; version: string; message: string }
  | { kind: "dismissed" };

/** The parts of the plugin's `Update` that Folio uses. */
export interface PendingUpdate {
  version: string;
  downloadAndInstall(onEvent: (event: DownloadEvent) => void): Promise<void>;
}

export interface UpdaterDeps {
  /** Resolves to null when Folio is up to date. */
  check(): Promise<PendingUpdate | null>;
  currentVersion(): Promise<string>;
  /** Starts the installed version on `path` and quits; only resolves if it fails to quit. */
  relaunch(path: string | null): Promise<void>;
  notify(message: string): void;
}

export interface Updater {
  getState(): UpdateState;
  subscribe(listener: () => void): () => void;
  /** Runs one silent check after `delayMs`, at most once per Updater. Returns a cancel function. */
  scheduleAutomaticCheck(delayMs?: number): () => void;
  /** Shows the banner if there is an update; silent otherwise. */
  checkAutomatically(): Promise<void>;
  /** Shows the banner, or a toast saying Folio is current or the check failed. */
  checkManually(): Promise<void>;
  /** From `available` or `failed`: downloads, installs, then relaunches on `path`. */
  install(path: string | null): Promise<void>;
  /** From `available` or `failed`: hides the banner. */
  dismiss(): void;
}

export function bannerMessage(state: UpdateState): string | null {
  throw new Error("not implemented");
}

export function createUpdater(deps: UpdaterDeps): Updater {
  throw new Error("not implemented");
}
```

- [ ] **Step 8: Write the failing tests**

`src/update/updater.test.ts`:

```ts
import type { DownloadEvent } from "@tauri-apps/plugin-updater";
import { afterEach, describe, expect, it, vi } from "vitest";
import { bannerMessage, createUpdater, releaseNotesUrl, type PendingUpdate, type UpdaterDeps } from "./updater";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** An update whose download the test drives by hand through `emit`, `finish` and `fail`. */
function fakeUpdate(version = "0.3.1") {
  const done = deferred<void>();
  let onEvent: (event: DownloadEvent) => void = () => {};
  const update: PendingUpdate & { emit(e: DownloadEvent): void; finish(): void; fail(e: unknown): void; started: boolean } = {
    version,
    started: false,
    downloadAndInstall(handler) {
      update.started = true;
      onEvent = handler;
      return done.promise;
    },
    emit: (e) => onEvent(e),
    finish: () => done.resolve(),
    fail: (e) => done.reject(e),
  };
  return update;
}

function setup(check: UpdaterDeps["check"]) {
  const deps = {
    check: vi.fn(check),
    currentVersion: vi.fn(async () => "0.3.0"),
    relaunch: vi.fn(async (_path: string | null) => {}),
    notify: vi.fn(),
  };
  const updater = createUpdater(deps);
  const changes = vi.fn();
  updater.subscribe(changes);
  return { deps, updater, changes };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("automatic check", () => {
  it("shows the banner when an update exists", async () => {
    const { updater, deps } = setup(async () => fakeUpdate());
    await updater.checkAutomatically();
    expect(updater.getState()).toEqual({ kind: "available", version: "0.3.1" });
    expect(deps.notify).not.toHaveBeenCalled();
  });

  it("is silent when there is no update or the check fails", async () => {
    const none = setup(async () => null);
    await none.updater.checkAutomatically();
    expect(none.updater.getState()).toEqual({ kind: "idle" });

    const offline = setup(async () => {
      throw new Error("offline");
    });
    await offline.updater.checkAutomatically();
    expect(offline.updater.getState()).toEqual({ kind: "idle" });
    expect(none.deps.notify).not.toHaveBeenCalled();
    expect(offline.deps.notify).not.toHaveBeenCalled();
  });
});

describe("scheduleAutomaticCheck", () => {
  afterEach(() => vi.useRealTimers());

  it("checks once after the delay", async () => {
    vi.useFakeTimers();
    const { updater, deps } = setup(async () => null);
    updater.scheduleAutomaticCheck(30_000);
    await vi.advanceTimersByTimeAsync(29_999);
    expect(deps.check).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(deps.check).toHaveBeenCalledTimes(1);
  });

  it("never checks when cancelled before the delay (setting turned off)", async () => {
    vi.useFakeTimers();
    const { updater, deps } = setup(async () => null);
    const cancel = updater.scheduleAutomaticCheck(30_000);
    await vi.advanceTimersByTimeAsync(10_000);
    cancel();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(deps.check).not.toHaveBeenCalled();
  });

  it("checks at most once per launch, however often it is rescheduled", async () => {
    vi.useFakeTimers();
    const { updater, deps } = setup(async () => null);
    updater.scheduleAutomaticCheck(30_000);
    await vi.advanceTimersByTimeAsync(30_000);
    const cancel = updater.scheduleAutomaticCheck(30_000);
    await vi.advanceTimersByTimeAsync(60_000);
    cancel();
    expect(deps.check).toHaveBeenCalledTimes(1);
  });
});

describe("manual check", () => {
  it("shows the banner when an update exists", async () => {
    const { updater, deps } = setup(async () => fakeUpdate("0.4.0"));
    await updater.checkManually();
    expect(updater.getState()).toEqual({ kind: "available", version: "0.4.0" });
    expect(deps.notify).not.toHaveBeenCalled();
  });

  it("says when Folio is up to date", async () => {
    const { updater, deps } = setup(async () => null);
    await updater.checkManually();
    expect(deps.notify).toHaveBeenCalledWith("You're on the latest version (0.3.0).");
    expect(updater.getState()).toEqual({ kind: "idle" });
  });

  it("says when the check fails", async () => {
    const { updater, deps } = setup(async () => {
      throw "error sending request";
    });
    await updater.checkManually();
    expect(deps.notify).toHaveBeenCalledWith("Couldn't check for updates: error sending request.");
  });

  it("brings back a banner dismissed with Later", async () => {
    const { updater } = setup(async () => fakeUpdate());
    await updater.checkAutomatically();
    updater.dismiss();
    expect(updater.getState()).toEqual({ kind: "dismissed" });
    await updater.checkManually();
    expect(updater.getState()).toEqual({ kind: "available", version: "0.3.1" });
  });

  it("is ignored while downloading or installing", async () => {
    const update = fakeUpdate();
    const { updater, deps } = setup(async () => update);
    await updater.checkAutomatically();
    void updater.install(null);
    await updater.checkManually();
    expect(deps.check).toHaveBeenCalledTimes(1);
    update.emit({ event: "Finished" });
    await updater.checkManually();
    expect(deps.check).toHaveBeenCalledTimes(1);
    expect(deps.notify).not.toHaveBeenCalled();
  });
});

describe("stale check result", () => {
  it("never replaces the progress banner when a check finishes mid-install", async () => {
    const first = fakeUpdate();
    const late = deferred<PendingUpdate | null>();
    let calls = 0;
    const { updater, deps } = setup(() => (++calls === 1 ? Promise.resolve(first) : late.promise));
    await updater.checkAutomatically();
    const slowCheck = updater.checkManually();
    void updater.install(null);
    late.resolve(fakeUpdate("0.3.2"));
    await slowCheck;
    expect(updater.getState()).toEqual({ kind: "downloading", version: "0.3.1", percent: null });
    expect(deps.notify).not.toHaveBeenCalled();
  });

  it("drops a late 'up to date' or error result mid-install without a toast", async () => {
    const first = fakeUpdate();
    const late = deferred<PendingUpdate | null>();
    let calls = 0;
    const { updater, deps } = setup(() => (++calls === 1 ? Promise.resolve(first) : late.promise));
    await updater.checkAutomatically();
    const slowCheck = updater.checkManually();
    void updater.install(null);
    late.reject(new Error("offline"));
    await slowCheck;
    expect(updater.getState().kind).toBe("downloading");
    expect(deps.notify).not.toHaveBeenCalled();
  });
});

describe("install", () => {
  it("reports progress, installs, then relaunches on the open document", async () => {
    const update = fakeUpdate();
    const { updater, deps } = setup(async () => update);
    await updater.checkAutomatically();
    const done = updater.install("/Users/reader/Notes/a b.md");
    expect(updater.getState()).toEqual({ kind: "downloading", version: "0.3.1", percent: null });
    update.emit({ event: "Started", data: { contentLength: 1000 } });
    update.emit({ event: "Progress", data: { chunkLength: 250 } });
    expect(updater.getState()).toEqual({ kind: "downloading", version: "0.3.1", percent: 25 });
    update.emit({ event: "Progress", data: { chunkLength: 750 } });
    expect(updater.getState()).toEqual({ kind: "downloading", version: "0.3.1", percent: 100 });
    update.emit({ event: "Finished" });
    expect(updater.getState()).toEqual({ kind: "installing", version: "0.3.1" });
    update.finish();
    await done;
    expect(deps.relaunch).toHaveBeenCalledWith("/Users/reader/Notes/a b.md");
  });

  it("shows an unknown size as no percent, never NaN or Infinity", async () => {
    for (const contentLength of [undefined, 0]) {
      const update = fakeUpdate();
      const { updater } = setup(async () => update);
      await updater.checkAutomatically();
      void updater.install(null);
      update.emit({ event: "Started", data: { contentLength } });
      update.emit({ event: "Progress", data: { chunkLength: 500 } });
      expect(updater.getState()).toEqual({ kind: "downloading", version: "0.3.1", percent: null });
    }
  });

  it("caps the percent at 100 when the server sends more than it announced", async () => {
    const update = fakeUpdate();
    const { updater } = setup(async () => update);
    await updater.checkAutomatically();
    void updater.install(null);
    update.emit({ event: "Started", data: { contentLength: 100 } });
    update.emit({ event: "Progress", data: { chunkLength: 150 } });
    expect(updater.getState()).toEqual({ kind: "downloading", version: "0.3.1", percent: 100 });
  });

  it("notifies subscribers only when the whole percent changes", async () => {
    const update = fakeUpdate();
    const { updater, changes } = setup(async () => update);
    await updater.checkAutomatically();
    void updater.install(null);
    update.emit({ event: "Started", data: { contentLength: 1_000_000 } });
    changes.mockClear();
    for (let i = 0; i < 1000; i++) update.emit({ event: "Progress", data: { chunkLength: 100 } });
    // Started already showed 0%. 100 KB of 1 MB in 100-byte chunks: 10 whole-percent steps, not 1000 updates.
    expect(changes).toHaveBeenCalledTimes(10);
  });

  it("installs when the plugin never sends Finished", async () => {
    const update = fakeUpdate();
    const { updater, deps } = setup(async () => update);
    await updater.checkAutomatically();
    const done = updater.install(null);
    update.finish();
    await done;
    expect(deps.relaunch).toHaveBeenCalledWith(null);
  });

  it("shows the failure, and Try Again fetches a fresh update", async () => {
    const broken = fakeUpdate();
    const fresh = fakeUpdate();
    let calls = 0;
    const { updater, deps } = setup(async () => (++calls === 1 ? broken : fresh));
    await updater.checkAutomatically();
    const first = updater.install("/doc.md");
    broken.fail("signature verification failed");
    await first;
    expect(updater.getState()).toEqual({ kind: "failed", version: "0.3.1", message: "signature verification failed" });
    expect(deps.relaunch).not.toHaveBeenCalled();

    const retry = updater.install("/doc.md");
    await flush();
    expect(deps.check).toHaveBeenCalledTimes(2);
    expect(fresh.started).toBe(true);
    fresh.finish();
    await retry;
    expect(deps.relaunch).toHaveBeenCalledWith("/doc.md");
  });

  it("fails Try Again cleanly when the release was withdrawn", async () => {
    const broken = fakeUpdate();
    let calls = 0;
    const { updater } = setup(async () => (++calls === 1 ? broken : null));
    await updater.checkAutomatically();
    const first = updater.install(null);
    broken.fail(new Error("connection reset"));
    await first;
    await updater.install(null);
    expect(updater.getState()).toEqual({ kind: "failed", version: "0.3.1", message: "the update is no longer available" });
  });

  it("shows a relaunch failure", async () => {
    const update = fakeUpdate();
    const { updater, deps } = setup(async () => update);
    deps.relaunch.mockRejectedValueOnce("open failed");
    await updater.checkAutomatically();
    const done = updater.install(null);
    update.finish();
    await done;
    expect(updater.getState()).toEqual({ kind: "failed", version: "0.3.1", message: "open failed" });
  });

  it("does nothing unless an update is available or failed", async () => {
    const { updater, deps } = setup(async () => null);
    await updater.install(null);
    expect(updater.getState()).toEqual({ kind: "idle" });
    expect(deps.relaunch).not.toHaveBeenCalled();
  });
});

describe("dismiss", () => {
  it("hides an available or failed banner but not progress", async () => {
    const update = fakeUpdate();
    const { updater } = setup(async () => update);
    await updater.checkAutomatically();
    void updater.install(null);
    updater.dismiss();
    expect(updater.getState().kind).toBe("downloading");
    update.fail("disk full");
    await flush();
    updater.dismiss();
    expect(updater.getState()).toEqual({ kind: "dismissed" });
  });
});

describe("bannerMessage", () => {
  it("renders each state", () => {
    expect(bannerMessage({ kind: "idle" })).toBeNull();
    expect(bannerMessage({ kind: "dismissed" })).toBeNull();
    expect(bannerMessage({ kind: "available", version: "0.3.1" })).toBe("Folio 0.3.1 is available.");
    expect(bannerMessage({ kind: "downloading", version: "0.3.1", percent: 42 })).toBe("Downloading… 42%");
    expect(bannerMessage({ kind: "downloading", version: "0.3.1", percent: null })).toBe("Downloading…");
    expect(bannerMessage({ kind: "installing", version: "0.3.1" })).toBe("Installing…");
    expect(bannerMessage({ kind: "failed", version: "0.3.1", message: "disk full" })).toBe("Couldn't install the update: disk full");
  });
});

describe("releaseNotesUrl", () => {
  it("links the version's GitHub release", () => {
    expect(releaseNotesUrl("0.3.1")).toBe("https://github.com/alxvallejo/folio/releases/tag/v0.3.1");
  });
});
```

- [ ] **Step 9: Run to verify they fail**

Run: `npx vitest run src/update/`
Expected: FAIL with "not implemented".

- [ ] **Step 10: Implement**

Replace the two stubs in `src/update/updater.ts`:

```ts
export function bannerMessage(state: UpdateState): string | null {
  switch (state.kind) {
    case "available":
      return `Folio ${state.version} is available.`;
    case "downloading":
      return state.percent === null ? "Downloading…" : `Downloading… ${state.percent}%`;
    case "installing":
      return "Installing…";
    case "failed":
      return `Couldn't install the update: ${state.message}`;
    default:
      return null;
  }
}

const reason = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function createUpdater(deps: UpdaterDeps): Updater {
  let state: UpdateState = { kind: "idle" };
  let pending: PendingUpdate | null = null;
  let autoChecked = false;
  const listeners = new Set<() => void>();

  const set = (next: UpdateState) => {
    state = next;
    for (const listener of listeners) listener();
  };
  // Reads `state` through a call so TypeScript doesn't keep a narrowing from before an await.
  const current = (): UpdateState => state;
  const busy = () => state.kind === "downloading" || state.kind === "installing";

  // A check can finish after the user started installing; its result must not replace the progress banner.
  function offer(update: PendingUpdate) {
    if (busy()) return;
    pending = update;
    set({ kind: "available", version: update.version });
  }

  async function checkAutomatically() {
    if (busy()) return;
    try {
      const update = await deps.check();
      if (update) offer(update);
    } catch {
      // Offline or a bad manifest: say nothing. The menu item reports errors.
    }
  }

  async function checkManually() {
    if (busy()) return;
    let update: PendingUpdate | null;
    let installed: string;
    try {
      [update, installed] = await Promise.all([deps.check(), deps.currentVersion()]);
    } catch (e) {
      if (!busy()) deps.notify(`Couldn't check for updates: ${reason(e)}.`);
      return;
    }
    if (update) offer(update);
    else if (!busy()) deps.notify(`You're on the latest version (${installed}).`);
  }

  function scheduleAutomaticCheck(delayMs = AUTO_CHECK_DELAY_MS) {
    if (autoChecked) return () => {};
    const timer = setTimeout(() => {
      autoChecked = true;
      void checkAutomatically();
    }, delayMs);
    return () => clearTimeout(timer);
  }

  async function install(path: string | null) {
    if (state.kind !== "available" && state.kind !== "failed") return;
    const retry = state.kind === "failed";
    let version = state.version;
    set({ kind: "downloading", version, percent: null });
    try {
      // After a failure, ask the server again rather than reusing a half-finished download.
      const update = retry ? await deps.check() : pending;
      if (!update) throw new Error("the update is no longer available");
      version = update.version;
      pending = update;
      let total: number | null = null;
      let received = 0;
      await update.downloadAndInstall((event) => {
        if (event.event === "Started") {
          // 0 or missing means the size is unknown: show "Downloading…" with no percent.
          total = event.data.contentLength || null;
          if (total && current().kind === "downloading") set({ kind: "downloading", version, percent: 0 });
        } else if (event.event === "Progress") {
          received += event.data.chunkLength;
          const percent = total ? Math.min(100, Math.floor((received / total) * 100)) : null;
          const now = current();
          if (now.kind === "downloading" && now.percent !== percent) set({ kind: "downloading", version, percent });
        } else if (current().kind !== "installing") {
          set({ kind: "installing", version });
        }
      });
      if (current().kind !== "installing") set({ kind: "installing", version });
      await deps.relaunch(path);
    } catch (e) {
      pending = null;
      set({ kind: "failed", version, message: reason(e) });
    }
  }

  function dismiss() {
    if (state.kind === "available" || state.kind === "failed") set({ kind: "dismissed" });
  }

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    scheduleAutomaticCheck,
    checkAutomatically,
    checkManually,
    install,
    dismiss,
  };
}
```

- [ ] **Step 11: Run to verify they pass**

Run: `npx vitest run src/update/ && npx tsc --noEmit`
Expected: PASS. If the "stale check result" tests fail, the bug is in the code, not the test: a check result must be dropped while `busy()`.

- [ ] **Step 12: Commit**

```bash
git add src/update/
git commit -m "Add the update store: checks, progress, install and relaunch"
```

---

### Task 4: Update banner and App wiring

**Files:**
- Create: `src/ui/UpdateBanner.tsx`
- Modify: `src/lib/api.ts`, `src/ui/App.tsx`, `src/styles/app.css`, `scripts/screenshots/mock.ts`

**Interfaces:**
- Consumes: `createUpdater`, `bannerMessage`, `releaseNotesUrl`, `UpdateState` (Task 3); `settings.autoUpdateCheck` (Task 3); command `relaunch` and event `menu-check-for-updates` (Task 2); `check` from `@tauri-apps/plugin-updater` (Task 1).
- Produces: the working feature.

- [ ] **Step 1: Add the API calls**

In `src/lib/api.ts`, add to `api` after `openInEditor`:

```ts
  /** Starts the installed version on `path` and quits Folio. */
  relaunch: (path: string | null) => invoke<void>("relaunch", { path }),
```

and to `events` after `onOpenPath`:

```ts
  /** Folio → Check for Updates… */
  onMenuCheckForUpdates: on<null>("menu-check-for-updates"),
```

- [ ] **Step 2: Write the banner**

`src/ui/UpdateBanner.tsx`:

```tsx
import { bannerMessage, type UpdateState } from "../update/updater";

interface Props {
  state: UpdateState;
  onWhatsNew: (version: string) => void;
  onLater: () => void;
  onInstall: () => void;
}

/** Sits above the document in its own row, so it never covers text, and never takes focus. */
export function UpdateBanner({ state, onWhatsNew, onLater, onInstall }: Props) {
  const message = bannerMessage(state);
  if (message === null) return null;
  return (
    <div className="update-banner" role="status">
      <span className="update-message">{message}</span>
      {state.kind === "available" && (
        <>
          <button onClick={() => onWhatsNew(state.version)}>What's new</button>
          <button onClick={onLater}>Later</button>
          <button className="primary" onClick={onInstall}>
            Install &amp; Relaunch
          </button>
        </>
      )}
      {state.kind === "failed" && (
        <>
          <button onClick={onLater}>Dismiss</button>
          <button className="primary" onClick={onInstall}>
            Try Again
          </button>
        </>
      )}
    </div>
  );
}
```

In `src/styles/app.css`, after the `.banner` rule:

```css
.update-banner { display: flex; align-items: center; gap: 8px; padding: 8px 16px; border-bottom: 1px solid var(--border); background: color-mix(in srgb, var(--accent) 10%, var(--bg)); }
.update-message { flex: 1; min-width: 0; }
.update-banner button { padding: 4px 10px; border: 1px solid var(--border); border-radius: 6px; background: var(--bg); color: var(--fg); }
.update-banner button:hover { border-color: var(--accent); }
.update-banner button.primary { background: var(--fg); color: var(--bg); border-color: var(--fg); }
```

(`--fg` on `--bg` is the highest-contrast pair every theme guarantees, so the primary button is readable in all seven.)

- [ ] **Step 3: Wire it into `App.tsx`**

Imports, merged into the existing import list:

```ts
import { getVersion } from "@tauri-apps/api/app";
import { check } from "@tauri-apps/plugin-updater";
import { createUpdater, releaseNotesUrl } from "../update/updater";
import { UpdateBanner } from "./UpdateBanner";
```

After the `doc`/`folder` setup block (after `const clearFragment = …`), add:

```tsx
  // Updates
  const updater = useMemo(
    () => createUpdater({ check: () => check({ timeout: 30_000 }), currentVersion: getVersion, relaunch: api.relaunch, notify }),
    [notify],
  );
  const updateState = useSyncExternalStore(updater.subscribe, updater.getState);
  // Once per launch, 30 s after settings load. Turning the setting off before then cancels it.
  useEffect(() => {
    if (!loaded || !settings.autoUpdateCheck) return;
    return updater.scheduleAutomaticCheck();
  }, [loaded, settings.autoUpdateCheck, updater]);
  useEffect(() => {
    const unlisten = events.onMenuCheckForUpdates(() => void updater.checkManually());
    return () => void unlisten.then((stop) => stop());
  }, [updater]);
```

In the JSX, between the `FindBar` line and `<div className="doc-scroll" …>`:

```tsx
        <UpdateBanner
          state={updateState}
          onWhatsNew={(version) => openUrl(releaseNotesUrl(version)).catch((e) => notify(`Couldn't open link: ${String(e)}`))}
          onLater={updater.dismiss}
          onInstall={() => void updater.install(doc.path)}
        />
```

- [ ] **Step 4: Keep screenshots quiet**

In `scripts/screenshots/mock.ts`, add a case before `default:` so the mocked check reports no update even if a capture runs past 30 seconds:

```ts
      case "plugin:updater|check":
        return null;
```

- [ ] **Step 5: Verify**

Run: `npm test && npx tsc --noEmit && npm run build`
Expected: all PASS; Vite build succeeds.

Run: `cd src-tauri && PATH="$HOME/.cargo/bin:$PATH" cargo test`
Expected: PASS.

Run `npm run screenshots` and check that `git status` shows no changes to `docs/screenshots/` beyond what WebKit's rendering noise has produced before. If images changed visibly, look at them; the banner must not appear. Discard the regenerated images with `git checkout -- docs/screenshots` unless they changed for a real reason.

- [ ] **Step 6: Commit**

```bash
git add src/lib/api.ts src/ui/UpdateBanner.tsx src/ui/App.tsx src/styles/app.css scripts/screenshots/mock.ts
git commit -m "Show the update banner and wire Check for Updates"
```

---

### Task 5: Release pipeline

**Files:**
- Create: `scripts/release/latest-json.mjs`, `scripts/release/latest-json.test.mjs`, `scripts/release/version.mjs`, `scripts/release/version.test.mjs`, `scripts/release/install-note.md`, `scripts/release.sh`
- Modify: `vite.config.ts`, `README.md`

**Interfaces:**
- Consumes: the key from Task 1; the updater config from Task 1.
- Produces:
  - `buildLatestJson({ version, notes, pubDate, url, signature })`
  - `isSemver(v)`, `compareSemver(a, b)`, `bumpTauriConf(text, v)`, `bumpCargoToml(text, v)`, `bumpCargoLock(text, v)`
  - `scripts/release.sh <version> <notes.md> [--dry-run]`

- [ ] **Step 1: Let Vitest find script tests**

In `vite.config.ts`, change the test include:

```ts
    include: ["src/**/*.test.ts", "scripts/**/*.test.mjs"],
```

- [ ] **Step 2: Write the failing tests**

`scripts/release/version.test.mjs`:

```js
import { describe, expect, it } from "vitest";
import { bumpCargoLock, bumpCargoToml, bumpTauriConf, compareSemver, isSemver } from "./version.mjs";

describe("isSemver", () => {
  it("accepts plain X.Y.Z only", () => {
    expect(isSemver("0.3.0")).toBe(true);
    expect(isSemver("10.20.30")).toBe(true);
    for (const v of ["v0.3.0", "0.3", "0.3.0-beta.1", "0.03.0", " 0.3.0", ""]) expect(isSemver(v)).toBe(false);
  });
});

describe("compareSemver", () => {
  it("compares numerically, not as strings", () => {
    expect(compareSemver("0.10.0", "0.9.9")).toBe(1);
    expect(compareSemver("0.3.0", "0.3.0")).toBe(0);
    expect(compareSemver("0.2.9", "0.3.0")).toBe(-1);
    expect(compareSemver("1.0.0", "0.99.99")).toBe(1);
  });
});

describe("bump helpers", () => {
  it("bumps only the app version in tauri.conf.json, keeping its formatting", () => {
    const text = '{\n  "productName": "Folio",\n  "version": "0.2.0",\n  "app": { "windows": [ { "title": "Folio" } ] }\n}\n';
    expect(bumpTauriConf(text, "0.3.0")).toBe(text.replace('"0.2.0"', '"0.3.0"'));
  });

  it("bumps only the package version in Cargo.toml", () => {
    const text = '[package]\nname = "folio"\nversion = "0.2.0"\n\n[dependencies]\ntauri = { version = "2", features = [] }\nserde = { version = "1" }\n';
    expect(bumpCargoToml(text, "0.3.0")).toBe(text.replace('version = "0.2.0"', 'version = "0.3.0"'));
  });

  it("bumps only folio's entry in Cargo.lock", () => {
    const text = '[[package]]\nname = "fnv"\nversion = "1.0.7"\n\n[[package]]\nname = "folio"\nversion = "0.2.0"\ndependencies = [\n "serde",\n]\n';
    expect(bumpCargoLock(text, "0.3.0")).toBe(text.replace('"0.2.0"', '"0.3.0"'));
  });

  it("throws instead of silently writing nothing when the version line is missing", () => {
    expect(() => bumpTauriConf("{}", "0.3.0")).toThrow(/tauri.conf.json/);
    expect(() => bumpCargoToml("[package]\n", "0.3.0")).toThrow(/Cargo.toml/);
    expect(() => bumpCargoLock('[[package]]\nname = "fnv"\nversion = "1.0.7"\n', "0.3.0")).toThrow(/Cargo.lock/);
  });
});
```

`scripts/release/latest-json.test.mjs`:

```js
import { describe, expect, it } from "vitest";
import { buildLatestJson } from "./latest-json.mjs";

const input = {
  version: "0.3.1",
  notes: "Fixes the thing.\n",
  pubDate: "2026-10-20T15:04:05.000Z",
  url: "https://github.com/alxvallejo/folio/releases/download/v0.3.1/Folio.app.tar.gz",
  signature: "dW50cnVzdGVkIGNvbW1lbnQ=\n",
};

describe("buildLatestJson", () => {
  it("builds the updater manifest for Apple Silicon", () => {
    expect(buildLatestJson(input)).toEqual({
      version: "0.3.1",
      notes: "Fixes the thing.",
      pub_date: "2026-10-20T15:04:05.000Z",
      platforms: { "darwin-aarch64": { signature: "dW50cnVzdGVkIGNvbW1lbnQ=", url: input.url } },
    });
  });

  it("refuses a non-SemVer version, an empty url or an empty signature", () => {
    expect(() => buildLatestJson({ ...input, version: "v0.3.1" })).toThrow(/SemVer/);
    expect(() => buildLatestJson({ ...input, url: "" })).toThrow(/url/);
    expect(() => buildLatestJson({ ...input, signature: " \n" })).toThrow(/signature/);
  });
});
```

- [ ] **Step 3: Run to verify they fail**

Run: `npx vitest run scripts/`
Expected: FAIL (modules not found).

- [ ] **Step 4: Implement the helpers**

`scripts/release/version.mjs`:

```js
// Version checks and bumps for scripts/release.sh. package.json and package-lock.json are bumped with `npm version`.
// CLI: node scripts/release/version.mjs check <version>   exits 1 unless <version> is SemVer and newer
//      node scripts/release/version.mjs bump <version>    rewrites tauri.conf.json, Cargo.toml and Cargo.lock
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

export const isSemver = (v) => SEMVER.test(v);

export function compareSemver(a, b) {
  const [x, y] = [a, b].map((v) => v.split(".").map(Number));
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i] ? 1 : -1;
  return 0;
}

function replaceOnce(text, pattern, version, file) {
  if (!pattern.test(text)) throw new Error(`couldn't find the version in ${file}`);
  return text.replace(pattern, (_, before, after) => `${before}${version}${after}`);
}

/** The first "version" key is the app's; the rest of the file keeps its hand formatting. */
export const bumpTauriConf = (text, v) => replaceOnce(text, /("version":\s*")[^"]+(")/, v, "tauri.conf.json");
/** The first line-initial `version =` is [package]'s; dependency versions are inline tables. */
export const bumpCargoToml = (text, v) => replaceOnce(text, /^(version = ")[^"]+(")/m, v, "Cargo.toml");
export const bumpCargoLock = (text, v) => replaceOnce(text, /(\[\[package\]\]\nname = "folio"\nversion = ")[^"]+(")/, v, "Cargo.lock");

const FILES = [
  ["src-tauri/tauri.conf.json", bumpTauriConf],
  ["src-tauri/Cargo.toml", bumpCargoToml],
  ["src-tauri/Cargo.lock", bumpCargoLock],
];

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [command, version] = process.argv.slice(2);
  const current = JSON.parse(readFileSync("src-tauri/tauri.conf.json", "utf8")).version;
  if (command === "check") {
    if (!isSemver(version ?? "")) {
      console.error(`release: "${version}" isn't a version like 0.3.0`);
      process.exit(1);
    }
    if (compareSemver(version, current) <= 0) {
      console.error(`release: ${version} isn't newer than the current ${current}`);
      process.exit(1);
    }
  } else if (command === "bump") {
    for (const [file, bump] of FILES) writeFileSync(file, bump(readFileSync(file, "utf8"), version));
  } else {
    console.error("usage: version.mjs check|bump <version>");
    process.exit(1);
  }
}
```

`scripts/release/latest-json.mjs`:

```js
// Writes the updater manifest that https://github.com/alxvallejo/folio/releases/latest/download/latest.json serves.
// CLI: node scripts/release/latest-json.mjs <version> <notes.md> <Folio.app.tar.gz.sig>  (prints JSON)
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { isSemver } from "./version.mjs";

export function buildLatestJson({ version, notes, pubDate, url, signature }) {
  if (!isSemver(version)) throw new Error(`"${version}" isn't a SemVer version like 0.3.0`);
  if (!url) throw new Error("the url is empty");
  if (!signature || !signature.trim()) throw new Error("the signature is empty");
  return {
    version,
    notes: notes.trim(),
    pub_date: pubDate,
    platforms: { "darwin-aarch64": { signature: signature.trim(), url } },
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [version, notesFile, sigFile] = process.argv.slice(2);
  const manifest = buildLatestJson({
    version,
    notes: readFileSync(notesFile, "utf8"),
    pubDate: new Date().toISOString(),
    url: `https://github.com/alxvallejo/folio/releases/download/v${version}/Folio.app.tar.gz`,
    signature: readFileSync(sigFile, "utf8"),
  });
  process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
}
```

- [ ] **Step 5: Run to verify they pass**

Run: `npx vitest run scripts/ && npm test`
Expected: PASS, and the full suite still passes.

- [ ] **Step 6: Commit the helpers**

```bash
git add vite.config.ts scripts/release/version.mjs scripts/release/version.test.mjs scripts/release/latest-json.mjs scripts/release/latest-json.test.mjs
git commit -m "Add release helpers for version bumps and latest.json"
```

- [ ] **Step 7: Write the install note**

`scripts/release/install-note.md`:

```markdown
> **First install?** Folio isn't signed by Apple yet. Drag **Folio** to **Applications**, then run `xattr -dr com.apple.quarantine /Applications/Folio.app` in Terminal once, or open it and use **System Settings → Privacy & Security → Open Anyway**. From 0.3.0 on, Folio updates itself.

```

(Keep the trailing blank line: it separates the note from the release notes that follow.)

- [ ] **Step 8: Write the release script**

`scripts/release.sh`:

```bash
#!/usr/bin/env bash
# Builds, signs and publishes a Folio release.
# Usage: scripts/release.sh <version> <notes.md> [--dry-run]
#   --dry-run  builds and stages the assets, then restores the version files. Nothing is committed,
#              tagged, pushed or published, and the branch/remote checks are skipped.
# Overrides, for dry runs with a throwaway key: FOLIO_UPDATER_KEY (key path), FOLIO_UPDATER_KEY_PASSWORD.
set -euo pipefail

die() {
  echo "release: $*" >&2
  exit 1
}

[[ $# -eq 2 || ($# -eq 3 && ${3:-} == "--dry-run") ]] || die "usage: scripts/release.sh <version> <notes.md> [--dry-run]"
VERSION=$1
NOTES=$(cd "$(dirname "$2")" && pwd)/$(basename "$2")
DRY_RUN=false
[[ ${3:-} == "--dry-run" ]] && DRY_RUN=true

cd "$(git rev-parse --show-toplevel)"
export PATH="$HOME/.cargo/bin:$PATH"
KEY=${FOLIO_UPDATER_KEY:-$HOME/.tauri/folio-updater.key}
BUNDLE=src-tauri/target/release/bundle
OUT=src-tauri/target/release/upload/v$VERSION
BUMPED=(package.json package-lock.json src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/tauri.conf.json)

# 1. Preconditions. Nothing is changed until all of them pass.
if $DRY_RUN; then
  echo "Dry run: skipping the master and origin/master checks."
else
  [[ $(git branch --show-current) == master ]] || die "not on master"
  git fetch --quiet origin master
  [[ $(git rev-parse master) == $(git rev-parse origin/master) ]] || die "master doesn't match origin/master; push or pull first"
  command -v gh >/dev/null || die "the GitHub CLI (gh) isn't installed"
fi
[[ -z $(git status --porcelain) ]] || die "the working tree isn't clean"
node scripts/release/version.mjs check "$VERSION" || exit 1
[[ -f $NOTES ]] || die "notes file not found: $2"
[[ -f $KEY ]] || die "no updater key at $KEY; run scripts/setup-updater-key.sh first"
if [[ -n ${FOLIO_UPDATER_KEY_PASSWORD:-} ]]; then
  PASSWORD=$FOLIO_UPDATER_KEY_PASSWORD
else
  PASSWORD=$(security find-generic-password -s folio-updater-key -a "$USER" -w 2>/dev/null) ||
    die "no folio-updater-key password in the login Keychain"
fi
npm test
npx tsc --noEmit
(cd src-tauri && cargo test)

# 2. Bump. Until the release commit exists, any exit puts the version files back.
COMMITTED=false
restore() { $COMMITTED || git checkout -- "${BUMPED[@]}"; }
trap restore EXIT
npm version "$VERSION" --no-git-tag-version >/dev/null
node scripts/release/version.mjs bump "$VERSION"

# 3. Build a signed bundle. createUpdaterArtifacts lives here, not in tauri.conf.json, so plain builds need no key.
rm -f "$BUNDLE/macos/Folio.app.tar.gz" "$BUNDLE/macos/Folio.app.tar.gz.sig"
TAURI_SIGNING_PRIVATE_KEY="$KEY" TAURI_SIGNING_PRIVATE_KEY_PASSWORD="$PASSWORD" \
  npx tauri build --bundles app,dmg --config '{"bundle":{"createUpdaterArtifacts":true}}'

APP_TGZ=$BUNDLE/macos/Folio.app.tar.gz
DMG=$BUNDLE/dmg/Folio_${VERSION}_aarch64.dmg
for f in "$APP_TGZ" "$APP_TGZ.sig" "$DMG"; do
  [[ -f $f ]] || die "the build didn't produce $f"
done

# 4–5. latest.json and the staged assets.
rm -rf "$OUT"
mkdir -p "$OUT"
cp "$DMG" "$OUT/Folio_${VERSION}_aarch64.dmg"
cp "$DMG" "$OUT/Folio_aarch64.dmg"
cp "$APP_TGZ" "$OUT/Folio.app.tar.gz"
node scripts/release/latest-json.mjs "$VERSION" "$NOTES" "$APP_TGZ.sig" >"$OUT/latest.json"
cat scripts/release/install-note.md "$NOTES" >"$OUT/release-notes.md"
echo
echo "Staged in $OUT:"
ls -lh "$OUT"

if $DRY_RUN; then
  echo "Dry run done. The version files are restored; nothing was committed, pushed or published."
  exit 0
fi

# 6. Commit, tag, push and publish, once the user says so.
read -r -p "Publish Folio $VERSION to GitHub? [y/N] " answer
[[ $answer == [yY] ]] || die "not published. The assets stay in $OUT; the version files are restored."
git add "${BUMPED[@]}"
git commit -m "Release $VERSION"
git tag "v$VERSION"
COMMITTED=true
git push origin master "v$VERSION"
gh release create "v$VERSION" --title "Folio $VERSION" --notes-file "$OUT/release-notes.md" --latest \
  "$OUT/Folio_${VERSION}_aarch64.dmg" "$OUT/Folio_aarch64.dmg" "$OUT/Folio.app.tar.gz" "$OUT/latest.json" ||
  die "the tag is pushed but the release wasn't created. Retry with: gh release create v$VERSION --title \"Folio $VERSION\" --notes-file $OUT/release-notes.md --latest $OUT/*.dmg $OUT/Folio.app.tar.gz $OUT/latest.json"
echo "Published: https://github.com/alxvallejo/folio/releases/tag/v$VERSION"
```

Run: `chmod +x scripts/release.sh && bash -n scripts/release.sh`
Expected: no output.

- [ ] **Step 9: Commit the script before the dry runs**

The dry runs need a clean tree, so commit first:

```bash
git add scripts/release.sh scripts/release/install-note.md
git commit -m "Add the release script"
```

- [ ] **Step 10: Dry-run the failure paths**

Each must stop with the quoted message and leave `git status --porcelain` empty. Set `SCRATCH` to your session scratchpad directory and create `$SCRATCH/notes.md` containing `Test notes.`

```bash
scripts/release.sh 0.3.0 "$SCRATCH/notes.md" --dry-run --nope      # usage: ...
scripts/release.sh 0.2.0 "$SCRATCH/notes.md" --dry-run             # 0.2.0 isn't newer than the current 0.2.0
scripts/release.sh v0.3.0 "$SCRATCH/notes.md" --dry-run            # "v0.3.0" isn't a version like 0.3.0
scripts/release.sh 0.3.0 "$SCRATCH/missing.md" --dry-run           # notes file not found
FOLIO_UPDATER_KEY="$SCRATCH/none.key" scripts/release.sh 0.3.0 "$SCRATCH/notes.md" --dry-run   # no updater key at ...
echo >> README.md && scripts/release.sh 0.3.0 "$SCRATCH/notes.md" --dry-run; git checkout README.md   # the working tree isn't clean
```

Run `git status --porcelain` after each. Expected: empty.

- [ ] **Step 11: Dry-run a full build with a throwaway key**

This confirms the artifact names and paths (the spec's open question) without the user's real key.

```bash
npx tauri signer generate --ci -p throwaway -w "$SCRATCH/throwaway.key"
FOLIO_UPDATER_KEY="$SCRATCH/throwaway.key" FOLIO_UPDATER_KEY_PASSWORD=throwaway \
  scripts/release.sh 0.3.0 "$SCRATCH/notes.md" --dry-run
```

Expected:
- the build succeeds, and `src-tauri/target/release/upload/v0.3.0/` holds `Folio_0.3.0_aarch64.dmg`, `Folio_aarch64.dmg`, `Folio.app.tar.gz`, `latest.json` and `release-notes.md`
- `latest.json` has `"version": "0.3.0"`, a non-empty signature and the `v0.3.0/Folio.app.tar.gz` url
- `git status --porcelain` is empty and `git tag -l v0.3.0` prints nothing

If the build puts the `.tar.gz` somewhere other than `bundle/macos/`, fix `APP_TGZ` in `release.sh`, amend the script commit, rerun, and record the real path in the task report. If `TAURI_SIGNING_PRIVATE_KEY` doesn't accept a path, change the build line to `TAURI_SIGNING_PRIVATE_KEY="$(cat "$KEY")"` and record that.

Then delete the throwaway key and the staged folder: `rm -f "$SCRATCH"/throwaway.key* && rm -rf src-tauri/target/release/upload/v0.3.0`.

- [ ] **Step 12: Document it**

In `README.md`:

1. In **Install**, after the existing sentence, add:

```markdown
From 0.3.0 on, Folio checks for updates on its own and offers to install them; **Folio → Check for Updates…** checks right away. Turn the automatic check off in Settings.
```

2. Add a section after **Screenshots**:

````markdown
### Releasing

Releases are signed for the updater with a key made once by `scripts/setup-updater-key.sh` (it lives in `~/.tauri/folio-updater.key`, with its password in the login Keychain). Then:

```sh
scripts/release.sh 0.3.1 notes.md --dry-run   # build and stage only
scripts/release.sh 0.3.1 notes.md             # bump, build, tag, push and publish
```

The script checks that you're on a clean, pushed `master` and that the tests pass, and asks before it publishes.
````

- [ ] **Step 13: Commit**

```bash
git add README.md scripts/release.sh
git commit -m "Document updates and the release script"
```

(`scripts/release.sh` is only in this commit if Step 11 changed it.)

---

### Task 6: Default-app commands (Rust)

**Files:**
- Create: `src-tauri/src/default_app.rs`
- Modify: `src-tauri/Cargo.toml`, `src-tauri/src/lib.rs`, `src-tauri/tauri.conf.json`

**Interfaces:**
- Consumes: `crate::relaunch::bundle_root(exe: &Path) -> Option<&Path>` (Task 2).
- Produces, for Task 7:
  - command `default_markdown_app` → `{ name: string | null, isFolio: boolean, canSet: boolean }`
  - async command `make_default_markdown_app` → `"made" | "declined"`, or an error string

Never run `make_default_markdown_app` or anything that calls `setDefaultApplication` from a task: it shows a real dialog and changes the user's real default. Only the pure functions are tested here; the dialog is in the user's manual checks.

- [ ] **Step 1: Claim the Markdown type**

In `src-tauri/tauri.conf.json`, the `fileAssociations` entry becomes:

```json
      { "ext": ["md", "markdown"], "contentTypes": ["net.daringfireball.markdown"], "name": "Markdown Document", "role": "Viewer", "mimeType": "text/markdown" }
```

- [ ] **Step 2: Add the Objective-C bindings**

In `src-tauri/Cargo.toml` `[dependencies]`, after `notify-debouncer-mini`:

```toml
# NSWorkspace, for making Folio the default Markdown app. Tauri already uses these crate families.
objc2 = "0.6"
block2 = "0.6"
objc2-foundation = { version = "0.3", default-features = false, features = ["std", "NSArray", "NSError", "NSString", "NSURL"] }
objc2-app-kit = { version = "0.3", default-features = false, features = ["std", "NSWorkspace", "block2", "objc2-uniform-type-identifiers"] }
objc2-uniform-type-identifiers = { version = "0.3", default-features = false, features = ["std", "UTType"] }
```

(These versions and features were checked in a scratch crate on 2026-10-14: they compile and `URLForApplicationToOpenContentType` returns the real default.)

- [ ] **Step 3: Write the failing tests**

`src-tauri/src/default_app.rs`:

```rust
//! Making Folio the default app for Markdown files, through NSWorkspace.
use block2::RcBlock;
use objc2::rc::Retained;
use objc2_app_kit::NSWorkspace;
use objc2_foundation::{NSError, NSString, NSURL};
use objc2_uniform_type_identifiers::UTType;
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::sync::mpsc;
use tauri::{AppHandle, Manager};

pub const MARKDOWN_TYPE: &str = "net.daringfireball.markdown";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DefaultApp {
    /// The default app's name, e.g. "Warp"; None when nothing opens Markdown.
    name: Option<String>,
    is_folio: bool,
    /// Whether this copy may become the default (see `is_installed_location`).
    can_set: bool,
}

#[derive(Serialize, Debug, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum MakeDefault {
    Made,
    Declined,
}

/// What AppKit's completion handler reported, copied out of the NSError.
pub struct ErrorInfo {
    pub domain: String,
    pub code: isize,
    pub underlying: Option<(String, isize)>,
    pub message: String,
}

/// Whether macOS should remember this bundle as the default: not the mounted DMG,
/// not the App Translocation copy macOS runs an unopened download from.
pub fn is_installed_location(bundle: &Path) -> bool {
    unimplemented!()
}

/// The user declined the macOS dialog: `userCanceledErr` (-128), directly or under NSCocoaErrorDomain 256.
pub fn is_user_cancel(domain: &str, code: isize, underlying: Option<(&str, isize)>) -> bool {
    unimplemented!()
}

pub fn outcome(error: Option<ErrorInfo>) -> Result<MakeDefault, String> {
    unimplemented!()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn error(domain: &str, code: isize, underlying: Option<(&str, isize)>) -> Option<ErrorInfo> {
        Some(ErrorInfo {
            domain: domain.into(),
            code,
            underlying: underlying.map(|(d, c)| (d.into(), c)),
            message: "The file couldn’t be opened.".into(),
        })
    }

    #[test]
    fn installed_locations() {
        assert!(is_installed_location(Path::new("/Applications/Folio.app")));
        assert!(is_installed_location(Path::new("/Users/reader/Applications/Folio.app")));
    }

    #[test]
    fn dmg_and_translocated_copies_are_not_installed() {
        assert!(!is_installed_location(Path::new("/Volumes/Folio/Folio.app")));
        assert!(!is_installed_location(Path::new(
            "/private/var/folders/xy/abc123/T/AppTranslocation/0F1E2D3C/d/Folio.app"
        )));
    }

    #[test]
    fn recognizes_a_declined_dialog() {
        assert!(is_user_cancel("NSCocoaErrorDomain", 256, Some(("NSOSStatusErrorDomain", -128))));
        assert!(is_user_cancel("NSOSStatusErrorDomain", -128, None));
        assert!(!is_user_cancel("NSCocoaErrorDomain", 256, Some(("NSOSStatusErrorDomain", -54))));
        assert!(!is_user_cancel("NSCocoaErrorDomain", -128, None));
    }

    #[test]
    fn outcomes() {
        assert_eq!(outcome(None), Ok(MakeDefault::Made));
        assert_eq!(
            outcome(error("NSCocoaErrorDomain", 256, Some(("NSOSStatusErrorDomain", -128)))),
            Ok(MakeDefault::Declined)
        );
        assert_eq!(
            outcome(error("NSCocoaErrorDomain", 256, Some(("NSOSStatusErrorDomain", -54)))),
            Err("The file couldn’t be opened.".to_string())
        );
    }
}
```

In `src-tauri/src/lib.rs`, add `mod default_app;` at the top of the `mod` list (alphabetical: before `editor`).

- [ ] **Step 4: Run to verify they fail**

Run: `cd src-tauri && PATH="$HOME/.cargo/bin:$PATH" cargo test default_app`
Expected: FAIL (panics at `unimplemented!`).

- [ ] **Step 5: Implement the pure functions**

```rust
pub fn is_installed_location(bundle: &Path) -> bool {
    let path = bundle.to_string_lossy();
    !path.starts_with("/Volumes/") && !path.contains("/AppTranslocation/")
}

pub fn is_user_cancel(domain: &str, code: isize, underlying: Option<(&str, isize)>) -> bool {
    let cancel = |d: &str, c: isize| d == "NSOSStatusErrorDomain" && c == -128;
    cancel(domain, code) || underlying.is_some_and(|(d, c)| cancel(d, c))
}

pub fn outcome(error: Option<ErrorInfo>) -> Result<MakeDefault, String> {
    match error {
        None => Ok(MakeDefault::Made),
        Some(e) if is_user_cancel(&e.domain, e.code, e.underlying.as_ref().map(|(d, c)| (d.as_str(), *c))) => {
            Ok(MakeDefault::Declined)
        }
        Some(e) => Err(e.message),
    }
}
```

Run: `cd src-tauri && PATH="$HOME/.cargo/bin:$PATH" cargo test default_app`
Expected: 4 PASS.

- [ ] **Step 6: Add the commands**

Append to `default_app.rs`, above `#[cfg(test)]`:

```rust
fn markdown_type() -> Result<Retained<UTType>, String> {
    UTType::typeWithIdentifier(&NSString::from_str(MARKDOWN_TYPE)).ok_or_else(|| format!("macOS doesn't know {MARKDOWN_TYPE}"))
}

/// This copy's `.app` bundle; None for `tauri dev`.
fn this_bundle(app: &AppHandle) -> Option<PathBuf> {
    let exe = tauri::process::current_binary(&app.env()).ok()?;
    crate::relaunch::bundle_root(&exe).map(Path::to_path_buf)
}

#[tauri::command]
pub fn default_markdown_app(app: AppHandle) -> Result<DefaultApp, String> {
    let current = NSWorkspace::sharedWorkspace()
        .URLForApplicationToOpenContentType(&markdown_type()?)
        .and_then(|url| url.path())
        .map(|path| PathBuf::from(path.to_string()));
    let bundle = this_bundle(&app);
    Ok(DefaultApp {
        name: current.as_deref().and_then(Path::file_stem).map(|s| s.to_string_lossy().into_owned()),
        is_folio: current.is_some() && current == bundle,
        can_set: bundle.as_deref().is_some_and(is_installed_location),
    })
}

/// Shows the macOS "change the default app" dialog and waits for the user's answer.
#[tauri::command]
pub async fn make_default_markdown_app(app: AppHandle) -> Result<MakeDefault, String> {
    let bundle = this_bundle(&app)
        .filter(|b| is_installed_location(b))
        .ok_or_else(|| "Folio isn't installed in Applications".to_string())?;
    let (tx, rx) = mpsc::channel::<Option<ErrorInfo>>();
    // AppKit is called on the main thread; its answer arrives on another queue once the user clicks.
    app.run_on_main_thread(move || ask_macos(&bundle, tx)).map_err(|e| e.to_string())?;
    let answer = tauri::async_runtime::spawn_blocking(move || rx.recv())
        .await
        .map_err(|e| e.to_string())?
        .map_err(|_| "macOS didn't answer".to_string())?;
    outcome(answer)
}

fn ask_macos(bundle: &Path, tx: mpsc::Sender<Option<ErrorInfo>>) {
    let ty = match markdown_type() {
        Ok(ty) => ty,
        Err(message) => {
            let _ = tx.send(Some(ErrorInfo { domain: String::new(), code: 0, underlying: None, message }));
            return;
        }
    };
    let url = NSURL::fileURLWithPath(&NSString::from_str(&bundle.to_string_lossy()));
    let handler = RcBlock::new(move |err: *mut NSError| {
        // SAFETY: AppKit passes null on success, or an NSError that is valid for this call.
        let info = unsafe { err.as_ref() }.map(|e| ErrorInfo {
            domain: e.domain().to_string(),
            code: e.code(),
            underlying: e.underlyingErrors().firstObject().map(|u| (u.domain().to_string(), u.code())),
            message: e.localizedDescription().to_string(),
        });
        let _ = tx.send(info);
    });
    NSWorkspace::sharedWorkspace().setDefaultApplicationAtURL_toOpenContentType_completionHandler(&url, &ty, Some(&handler));
}
```

If AppKit drops the handler without calling it, `tx` is dropped and `recv` fails, giving "macOS didn't answer" instead of a hang.

In `lib.rs`, add `default_app::default_markdown_app,` and `default_app::make_default_markdown_app,` to `generate_handler!`, after `config::watch_config,`.

- [ ] **Step 7: Verify**

Run: `cd src-tauri && PATH="$HOME/.cargo/bin:$PATH" cargo test && PATH="$HOME/.cargo/bin:$PATH" cargo clippy --all-targets -- -D warnings`
Expected: all PASS; no warnings. (If clippy isn't installed, skip it and say so.)

- [ ] **Step 8: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/tauri.conf.json src-tauri/src/default_app.rs src-tauri/src/lib.rs
git commit -m "Add commands to read and set the default Markdown app"
```

---

### Task 7: First-launch ask and the Settings row

**Files:**
- Create: `src/defaultApp/defaultApp.ts`, `src/defaultApp/defaultApp.test.ts`
- Modify: `src/settings/schema.ts`, `src/settings/schema.test.ts`, `src/lib/api.ts`, `src/ui/App.tsx`, `src/ui/SettingsPanel.tsx`, `src/styles/app.css`, `scripts/screenshots/mock.ts`, `docs/screenshots/klein-settings.png`

**Interfaces:**
- Consumes: the commands from Task 6; `store.update` and `settings` in `App.tsx`; `settings.autoUpdateCheck` already in the schema (Task 3).
- Produces: the feature.

- [ ] **Step 1: Write the failing setting tests**

In `src/settings/schema.test.ts`:
1. In "returns the defaults for an empty config", add `defaultAppAsked: false,` after `autoUpdateCheck: true,`.
2. In "ignores values of the wrong type", add `defaultAppAsked: "yes"` to the input.
3. Add to `describe("applyPatch")`:

```ts
  it("writes defaultAppAsked only once it is true", () => {
    expect(applyPatch({}, { defaultAppAsked: true })).toEqual({ defaultAppAsked: true });
    expect(applyPatch({ defaultAppAsked: true }, { defaultAppAsked: false })).toEqual({});
    expect(effectiveSettings({ defaultAppAsked: true }).defaultAppAsked).toBe(true);
  });
```

- [ ] **Step 2: Write the failing first-launch tests**

`src/defaultApp/defaultApp.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import type { DefaultApp } from "../lib/api";
import { askOnFirstLaunch, shouldAsk } from "./defaultApp";

const warp: DefaultApp = { name: "Warp", isFolio: false, canSet: true };
const folio: DefaultApp = { name: "Folio", isFolio: true, canSet: true };
const fromDmg: DefaultApp = { name: "Warp", isFolio: false, canSet: false };

function deps(status: DefaultApp | Error, answer: "made" | "declined" | Error = "made") {
  return {
    status: vi.fn(async () => {
      if (status instanceof Error) throw status;
      return status;
    }),
    make: vi.fn(async () => {
      if (answer instanceof Error) throw answer;
      return answer;
    }),
    markAsked: vi.fn(async () => {}),
  };
}

describe("shouldAsk", () => {
  it("asks only a real install that isn't the default and hasn't asked", () => {
    expect(shouldAsk({ asked: false, status: warp })).toBe(true);
    expect(shouldAsk({ asked: true, status: warp })).toBe(false);
    expect(shouldAsk({ asked: false, status: folio })).toBe(false);
    expect(shouldAsk({ asked: false, status: fromDmg })).toBe(false);
  });
});

describe("askOnFirstLaunch", () => {
  it("asks once and remembers, whether accepted or declined", async () => {
    for (const answer of ["made", "declined"] as const) {
      const d = deps(warp, answer);
      await askOnFirstLaunch(false, d);
      expect(d.make).toHaveBeenCalledTimes(1);
      expect(d.markAsked).toHaveBeenCalledTimes(1);
    }
  });

  it("does nothing once it has asked", async () => {
    const d = deps(warp);
    await askOnFirstLaunch(true, d);
    expect(d.status).not.toHaveBeenCalled();
    expect(d.make).not.toHaveBeenCalled();
  });

  it("remembers without asking when Folio is already the default", async () => {
    const d = deps(folio);
    await askOnFirstLaunch(false, d);
    expect(d.make).not.toHaveBeenCalled();
    expect(d.markAsked).toHaveBeenCalledTimes(1);
  });

  it("neither asks nor remembers when not a real install, so the installed copy still asks", async () => {
    const d = deps(fromDmg);
    await askOnFirstLaunch(false, d);
    expect(d.make).not.toHaveBeenCalled();
    expect(d.markAsked).not.toHaveBeenCalled();
  });

  it("stays silent and unmarked on errors, so the next launch tries again", async () => {
    const statusFails = deps(new Error("ipc"));
    await expect(askOnFirstLaunch(false, statusFails)).resolves.toBeUndefined();
    expect(statusFails.markAsked).not.toHaveBeenCalled();

    const makeFails = deps(warp, new Error("permErr"));
    await expect(askOnFirstLaunch(false, makeFails)).resolves.toBeUndefined();
    expect(makeFails.markAsked).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run to verify they fail**

Run: `npx vitest run src/settings/ src/defaultApp/`
Expected: FAIL (module not found; `defaultAppAsked` missing).

- [ ] **Step 4: Implement**

`src/settings/schema.ts`:
- `Settings` gains, after `autoUpdateCheck`:

```ts
  /** Set once Folio has asked macOS to make it the default Markdown app; never shown in Settings. */
  defaultAppAsked: boolean;
```

- `DEFAULTS` gains `defaultAppAsked: false,` after `autoUpdateCheck: true,`.
- `effectiveSettings` returns, after `autoUpdateCheck`:

```ts
    defaultAppAsked: typeof raw.defaultAppAsked === "boolean" ? raw.defaultAppAsked : DEFAULTS.defaultAppAsked,
```

`src/lib/api.ts`: add after the `Tree` interface:

```ts
export interface DefaultApp {
  /** The app that opens Markdown files, e.g. "Warp"; null when there is none. */
  name: string | null;
  isFolio: boolean;
  /** False when Folio runs from the DMG, a translocated copy or a dev build. */
  canSet: boolean;
}
```

and to `api`, after `relaunch`:

```ts
  defaultMarkdownApp: () => invoke<DefaultApp>("default_markdown_app"),
  /** Shows the macOS confirmation dialog; resolves when the user answers. */
  makeDefaultMarkdownApp: () => invoke<"made" | "declined">("make_default_markdown_app"),
```

`src/defaultApp/defaultApp.ts`:

```ts
import type { DefaultApp } from "../lib/api";

export const ASK_DELAY_MS = 2_000;

export function shouldAsk({ asked, status }: { asked: boolean; status: DefaultApp }): boolean {
  return !asked && status.canSet && !status.isFolio;
}

export interface FirstLaunchDeps {
  status(): Promise<DefaultApp>;
  /** Shows the macOS dialog. */
  make(): Promise<"made" | "declined">;
  markAsked(): Promise<void>;
}

/**
 * The one-time ask. macOS's own dialog is the only prompt. Accepted or declined, it is never
 * shown again. Errors mean no dialog appeared, so they stay silent and leave the key unset.
 */
export async function askOnFirstLaunch(asked: boolean, deps: FirstLaunchDeps): Promise<void> {
  if (asked) return;
  try {
    const status = await deps.status();
    if (status.isFolio) {
      await deps.markAsked();
      return;
    }
    if (!shouldAsk({ asked, status })) return;
    await deps.make();
    await deps.markAsked();
  } catch {
    // Try again next launch.
  }
}
```

- [ ] **Step 5: Run to verify they pass**

Run: `npx vitest run src/settings/ src/defaultApp/ && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Wire it into `App.tsx`**

Imports, merged into the existing lists:

```ts
import { api, events, type DefaultApp } from "../lib/api";
import { ASK_DELAY_MS, askOnFirstLaunch } from "../defaultApp/defaultApp";
```

After the `// Updates` block from Task 4, add:

```tsx
  // Default Markdown app: the one-time ask, 2 s after settings load, and the Settings row.
  const askScheduled = useRef(false);
  useEffect(() => {
    if (askScheduled.current || !loaded) return;
    askScheduled.current = true;
    const asked = settings.defaultAppAsked;
    window.setTimeout(() => {
      void askOnFirstLaunch(asked, {
        status: api.defaultMarkdownApp,
        make: api.makeDefaultMarkdownApp,
        markAsked: () => store.update({ defaultAppAsked: true }),
      });
    }, ASK_DELAY_MS);
  }, [loaded, settings.defaultAppAsked, store]);
```

(No cleanup on purpose: like the last-folder restore, it runs once per launch, and Folio doesn't use StrictMode.)

After the `// Panels` state declarations (it needs `settingsOpen`), add:

```tsx
  const [defaultApp, setDefaultApp] = useState<DefaultApp | null>(null);
  const refreshDefaultApp = useCallback(() => {
    api.defaultMarkdownApp().then(setDefaultApp, () => setDefaultApp(null));
  }, []);
  useEffect(() => {
    if (settingsOpen) refreshDefaultApp();
  }, [settingsOpen, refreshDefaultApp]);
  const makeDefaultApp = useCallback(() => {
    api.makeDefaultMarkdownApp().then(refreshDefaultApp, (e) => notify(`Couldn't make Folio the default: ${String(e)}.`));
  }, [refreshDefaultApp, notify]);
```

Pass them to the panel:

```tsx
        {settingsOpen && (
          <SettingsPanel
            settings={settings}
            shownTheme={shownTheme}
            invalid={invalid}
            defaultApp={defaultApp}
            onMakeDefault={makeDefaultApp}
            onChange={updateSettings}
            onClose={() => setSettingsOpen(false)}
          />
        )}
```

- [ ] **Step 7: Add the Settings row**

In `src/ui/SettingsPanel.tsx`:
- Import `import type { DefaultApp } from "../lib/api";`.
- `Props` gains:

```ts
  /** null until known, or when it can't be read; the row is hidden then. */
  defaultApp: DefaultApp | null;
  onMakeDefault: () => void;
```

- Destructure `defaultApp, onMakeDefault` in `SettingsPanel`.
- After the "Check for updates automatically" label, add `<DefaultAppRow status={defaultApp} onMakeDefault={onMakeDefault} />`.
- Add the component at the end of the file:

```tsx
function DefaultAppRow({ status, onMakeDefault }: { status: DefaultApp | null; onMakeDefault: () => void }) {
  if (!status) return null;
  return (
    <div className="settings-default-app">
      <span>
        Default Markdown app: <strong>{status.isFolio ? "Folio" : (status.name ?? "None")}</strong>
      </span>
      {!status.isFolio &&
        (status.canSet ? (
          <button className="settings-button" onClick={onMakeDefault}>
            Make Folio Default
          </button>
        ) : (
          <span className="settings-hint">Move Folio to Applications to make it the default.</span>
        ))}
    </div>
  );
}
```

In `src/styles/app.css`, after the `.settings-check` rules from Task 3:

```css
.settings-default-app { display: flex; flex-direction: column; align-items: flex-start; gap: 6px; color: var(--muted); }
.settings-default-app strong { color: var(--fg); font-weight: 600; }
.settings-button { padding: 5px 10px; border: 1px solid var(--border); border-radius: 6px; background: color-mix(in srgb, var(--fg) 4%, var(--bg)); color: var(--fg); }
.settings-button:hover { border-color: var(--accent); }
```

- [ ] **Step 8: Update the screenshot mock and the Settings screenshot**

In `scripts/screenshots/mock.ts`, add before `default:`:

```ts
      case "default_markdown_app":
        return { name: "Folio", isFolio: true, canSet: true };
```

Run: `npm run screenshots`. Open `docs/screenshots/klein-settings.png` and check that the panel shows the "Check for updates automatically" checkbox and `Default Markdown app: Folio`, legibly, in Klein. Keep the new `klein-settings.png`. Discard changes to the other images unless they differ visibly: `git checkout -- docs/screenshots/riso.png docs/screenshots/klein.png …` (every changed file except `klein-settings.png`).

- [ ] **Step 9: Verify**

Run: `npm test && npx tsc --noEmit && npm run build`
Expected: all PASS.

- [ ] **Step 10: Commit**

```bash
git add src/settings/ src/defaultApp/ src/lib/api.ts src/ui/App.tsx src/ui/SettingsPanel.tsx src/styles/app.css scripts/screenshots/mock.ts docs/screenshots/klein-settings.png
git commit -m "Ask once to become the default Markdown app, and show it in Settings"
```

---

## After the tasks: handoff to the user

These are the user's steps; the agent lists them in the final report and does not perform them.

1. **GUI pass** in `npm run tauri dev`:
   - the menu shows Folio (About, Check for Updates…, Services, Hide, Hide Others, Show All, Quit), Edit, View, Window
   - ⌘C, ⌘V, ⌘A, ⌘Q, ⌘W, ⌘H, ⌘M and ⌃⌘F work
   - **Check for Updates…** shows `Couldn't check for updates: …` until v0.3.0 is published. That's expected: v0.2.0 is a pre-release, so `releases/latest/download/latest.json` doesn't exist yet. After v0.3.0 ships, it shows `You're on the latest version (0.3.0).`
   - the settings checkbox toggles `autoUpdateCheck` in `~/.config/folio/config.json`
2. **Rollout** (spec): `scripts/release.sh 0.3.0 notes.md`, install it from the DMG, then release 0.3.1 and run the spec's manual end-to-end checks from the 0.3.0 install:
   - the banner appears
   - Install & Relaunch reaches 0.3.1 and reopens the document
   - `xattr -l /Applications/Folio.app` shows no `com.apple.quarantine`
   - with the setting off, there's no automatic check
3. **Default app** (default-app spec, on the v0.3.0 install from `/Applications`):
   1. Make another app the default (Finder → Get Info on a `.md` → Open With → TextEdit → Change All) and remove `defaultAppAsked` from `~/.config/folio/config.json`.
   2. Launch Folio. The macOS dialog appears about 2 seconds in. Accept, and double-click a `.md`: it opens in Folio.
   3. Repeat step 1 and decline. Relaunch: no dialog. Settings shows `TextEdit` and **Make Folio Default**, which shows the dialog again.
   4. Run Folio from the mounted DMG: no dialog, and Settings shows the "Move Folio to Applications" hint.
