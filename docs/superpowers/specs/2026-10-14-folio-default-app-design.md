# Folio — Default Markdown App (ships in v0.3.0)

**Date:** 2026-10-14
**Status:** Approved in brainstorming, pending written-spec review
**Builds on:** `2026-10-13-folio-updater-design.md`. Ships in the same v0.3.0 release, and reuses its `bundle_root` helper (`relaunch.rs`).

## Purpose

After installing Folio, you shouldn't have to go to Finder → Get Info → Open With → Change All to make Folio open your Markdown files. On its first launch from Applications, Folio asks once, and one click makes it the default.

**Success:**
- A fresh copy in `/Applications` shows the macOS "change the default app" dialog once, shortly after its first launch, unless Folio is already the default.
- Accepting makes double-clicking any `.md` or `.markdown` file open it in Folio.
- Declining is final: Folio doesn't ask again by itself.
- Settings shows which app opens Markdown files and offers **Make Folio Default** whenever that isn't Folio.

## What macOS does (verified 2026-10-14 on macOS 27.0.1)

- `.md` and `.markdown` files have the type `net.daringfireball.markdown`.
- `NSWorkspace.setDefaultApplication(at:toOpen:completionHandler:)` (macOS 12+) works for unsigned Folio.
- macOS always shows its own confirmation dialog before changing the default:
  - **Accept:** the completion handler gets no error, and Folio becomes the default.
  - **Decline:** the handler gets `NSCocoaErrorDomain` 256 with an underlying `NSOSStatusErrorDomain` -128 (`userCanceledErr`), and the default is unchanged.
- Rank (`LSHandlerRank`) doesn't override a default the user already has (on the test Mac that was Warp), so the API call is the only way to become the default.

Because macOS always asks, Folio doesn't show a prompt of its own: the system dialog is the one ask.

## Scope

**In:**
- Claiming the Markdown type in the file association.
- The one-time ask on first launch.
- The default-app status and button in Settings.
- The `defaultAppAsked` config key.

**Out:**
- Other extensions (`.mdown`, `.mkd`, `.txt`).
- Switching the default back to another app (Finder's Get Info does that).
- Asking again after a decline.
- Any non-macOS platform.

## User experience

**First launch.**
- Folio asks only when all of these are true:
  - `defaultAppAsked` isn't `true`
  - Folio is a real install (below)
  - Folio isn't already the default for `net.daringfireball.markdown`
- It asks 2 seconds after settings have loaded, so the window has drawn first. The macOS dialog is the only UI.
- After the dialog, whether accepted or declined, Folio writes `defaultAppAsked: true` and stays silent.
- If Folio is already the default, it writes `defaultAppAsked: true` without asking.
- If the call fails any other way (no dialog was shown), Folio stays silent and doesn't write the key, so it tries again next launch.

**Real install.** Folio counts as installed only when:
- it runs from an `.app` bundle (`bundle_root` from the updater spec finds one), and
- the bundle path doesn't start with `/Volumes/` (the mounted DMG), and
- the bundle path doesn't contain `/AppTranslocation/` (the quarantine copy macOS runs an unopened download from).

Anywhere else, macOS would remember a path that's about to disappear.

**Settings.** A "Default Markdown app" row, refreshed each time the panel opens:
- When Folio is the default: `Folio`, no button.
- Otherwise: the default app's name (or `None`), and a **Make Folio Default** button.
  - The button shows the same macOS dialog.
  - Accepted: the row refreshes to `Folio`.
  - Declined: nothing happens.
  - Any other failure shows the toast `Couldn't make Folio the default: <reason>.`
- When Folio isn't a real install, the button is replaced by the hint `Move Folio to Applications to make it the default.`
- The button works whatever `defaultAppAsked` says. Using it doesn't change the key.

**Updates.** Relaunching after an update reads the same `config.json`, so it never asks again. Someone who installs v0.3.0 over v0.2.0 by hand is asked once, on the first v0.3.0 launch.

## Architecture

### Bundle (`tauri.conf.json`)

The existing file association gains `"contentTypes": ["net.daringfireball.markdown"]` (which becomes `LSItemContentTypes`). Its extensions, role (Viewer) and rank (Default) stay as they are.

### Rust (`src-tauri/src/default_app.rs`)

macOS-only, using `objc2-app-kit` 0.3 (features `NSWorkspace`, `block2`, `objc2-uniform-type-identifiers`) and `objc2-uniform-type-identifiers` 0.3 (`UTType`). Tauri already depends on the `objc2` 0.6 family.

- `is_installed_location(bundle: &Path) -> bool` is pure and unit-tested:
  - `/Applications/Folio.app` and `~/Applications/Folio.app` → true
  - `/Volumes/Folio/Folio.app` → false
  - `/private/var/folders/xy/…/T/AppTranslocation/ABCD/d/Folio.app` → false
- `is_user_cancel(domain, code, underlying: Option<(domain, code)>) -> bool` is pure and unit-tested. It's true for `NSOSStatusErrorDomain` -128, whether that error comes directly or as the underlying error of `NSCocoaErrorDomain` 256.
- Command `default_markdown_app() -> Result<DefaultApp, String>`, where `DefaultApp` is `{ name: Option<String>, isFolio: bool, canSet: bool }`:
  - `name` is the default app's display name (its bundle file name without `.app`), or none.
  - `isFolio` compares the default app's path with this bundle's path.
  - `canSet` is the real-install check.
- Async command `make_default_markdown_app() -> Result<MakeDefault, String>`, where `MakeDefault` is `"made" | "declined"`:
  - It refuses with an error when `canSet` is false.
  - It awaits the completion handler through a oneshot channel, with no timeout: the dialog waits for the user.

### Frontend

- `src/defaultApp/defaultApp.ts` holds `shouldAsk({ asked, status }) -> boolean`, a pure function that is unit-tested, and the first-launch sequence with injected dependencies, so it's testable without Tauri:
  - **Inputs:** `status`, `make`, `markAsked`.
  - **Ask:** if `shouldAsk`, call `make`; on `made` or `declined`, call `markAsked`; on an error, do nothing.
  - **Already the default:** if Folio is the default and `asked` is false, just call `markAsked`.
  - **Not a real install:** do nothing, so moving Folio to Applications later still gets the one ask.
- `App.tsx` runs that sequence once per launch, 2 seconds after settings load, alongside the updater's 30-second check.
- `SettingsPanel.tsx` shows the row above. It gets `status` and an `onMakeDefault` callback from `App`, which refreshes the status when the panel opens.

### Settings

- `defaultAppAsked: boolean`, default `false`, written only when `true`, following the existing minimal write-back.
- Non-boolean values fall back to `false`.
- It isn't shown in Settings.

## Testing

**cargo test:** `is_installed_location` and `is_user_cancel`.

**Vitest:**
- `shouldAsk` and the first-launch sequence: asks once, marks asked on made/declined, stays unmarked on error, marks without asking when already the default, never asks when `canSet` is false
- the `defaultAppAsked` default and write-back

**Manual** (added to the updater spec's rollout, on the v0.3.0 install):
1. Set another default first: Finder → Get Info on a `.md` → Open With → TextEdit → Change All.
2. Remove `defaultAppAsked` from `~/.config/folio/config.json`.
3. Launch Folio from `/Applications`. The dialog appears about 2 seconds in. Accept, and double-click a `.md`: it opens in Folio.
4. Repeat steps 1–2 and decline. Relaunch: no dialog. Settings shows `TextEdit` and the button. The button shows the dialog again.
5. Run Folio from the mounted DMG. No dialog appears, and Settings shows the "Move Folio to Applications" hint.
