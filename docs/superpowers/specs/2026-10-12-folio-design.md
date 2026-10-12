# Folio — Design Spec

**Date:** 2026-10-12
**Status:** Approved

## Purpose

A personal macOS app for *reading* local Markdown files beautifully. Primary content: READMEs, notes, and Claude-generated specs/plans. Success = Alex sets Folio as the default `.md` app and prefers reading in it over VS Code preview or GitHub.

**Audience:** Alex only. No distribution, code signing, notarization, or App Store work.

## Scope

**In v1**
- Open a single `.md` file (double-click in Finder, Dock drop, ⌘O) or a folder (⇧⌘O) with a sidebar file tree.
- Read-only rendering of GitHub-flavored Markdown with syntax-highlighted code.
- Table of contents panel with scroll-spy.
- Live reload when the open file changes on disk.
- Six theme presets (each with light + dark), a settings panel, and a hand-editable JSON config.
- In-document find (⌘F).
- "Open in editor" handoff.

**Out of v1:** editing, Mermaid, math, frontmatter display, cross-file search, multiple windows/tabs, export/print, code signing.

## Stack

- **Shell:** Tauri 2 (Rust backend, WKWebView frontend).
- **Frontend:** Vite + React + TypeScript.
- **Rendering:** `markdown-it` with plugins: GFM tables/strikethrough/autolinks (core), `markdown-it-task-lists`, `markdown-it-footnote`. Heading ids come from a small custom core rule using `github-slugger`, so `#anchors` match GitHub's. Code highlighting via Shiki (JavaScript regex engine, no WASM; dual light/dark themes as CSS variables so appearance switches need no re-render).
- **Sanitization:** DOMPurify on rendered HTML.
- **Fonts:** Bundled via Fontsource: Literata, Source Serif 4, Inter, Atkinson Hyperlegible, JetBrains Mono. iA Writer Quattro and iA Writer Mono bundled from the iA-Fonts repo (OFL).
- **Tests:** Vitest (frontend), `cargo test` (Rust).
- **Prerequisite:** Rust toolchain is not installed on the dev machine; install via `rustup` first. Node 24 + npm are available.

Project location: `~/Sites/personal/folio/`. Bundle identifier: `com.alexvallejo.folio`.

## Architecture

### Rust (`src-tauri/`), kept thin

| Unit | Responsibility | Interface |
|---|---|---|
| `fs` | Read a file as text (lossy UTF-8, BOM stripped). List a folder as a tree, including only `.md`/`.markdown` files and dirs that contain them; skip `node_modules` and any dot-file or dot-dir (including `.git`); never follow symlinked dirs; stop at depth 10 or 5,000 files and report `truncated`. | Commands `read_file(path) -> {text, size}`, `list_tree(root) -> TreeNode` |
| `watch` | Watch the open file and open folder via the `notify` crate; debounce ~100ms. | Commands `watch_file(path)`, `watch_folder(root)`; events `file-changed`, `file-removed`, `tree-changed` |
| `open` | Register `.md`/`.markdown` document types in `Info.plist`; handle macOS open-file events (Finder double-click, Dock drop), including at cold start. | Event `open-path(path)` |
| `editor` | Launch configured editor command with the current file path. | Command `open_in_editor(path, command)` |

### Frontend (`src/`)

| Unit | Responsibility | Depends on |
|---|---|---|
| `render/` | Pure: Markdown string + base dir → `{ html, headings[] }`. Rewrites relative image `src` to Tauri asset URLs; marks relative `.md` links for in-app navigation. Sanitizes with DOMPurify (allows `details`, `summary`, `kbd`, `img` attrs, etc.; strips scripts and `on*` handlers). No DOM UI, no file I/O. | markdown-it, Shiki, DOMPurify |
| `themes/` | Preset definitions: CSS custom properties per light/dark variant + paired Shiki theme name. `applyTheme()` writes variables onto `:root`. | — |
| `settings/` | Load/merge/save config. Effective settings = preset defaults ⊕ user overrides. Persists only overridden keys. Watches config file for hand edits. | Tauri fs |
| `ui/` | Three-pane layout: Sidebar (tree), Document, TOC. Toolbar (theme picker, settings, open-in-editor). Settings panel. Find bar. Banners/toasts. | all of the above |

### Data flow

Open path → `read_file` → `render()` → Document displays HTML, TOC displays headings → `watch_file` registered. On `file-changed` → re-read → re-render → restore previous `scrollTop`. On `file-removed` → keep last render, show "File no longer exists" banner.

Shiki highlighters are created once per theme and cached; theme switch re-renders the current document.

## Themes

Each preset defines light and dark variants. Appearance follows the system unless forced in settings.

| Preset | Character | Body / code font | Shiki theme (light / dark) |
|---|---|---|---|
| Paper (default) | Warm off-white, ink text, long-read serif | Literata / JetBrains Mono | `github-light` / `github-dark` |
| iA | Minimal, high-contrast | iA Writer Quattro / iA Writer Mono | `min-light` / `min-dark` |
| GitHub | Familiar baseline | system-ui / SF Mono | `github-light` / `github-dark` |
| Catppuccin | Latte / Mocha | Inter / JetBrains Mono | `catppuccin-latte` / `catppuccin-mocha` |
| Nord | Cool blue-grey | Source Serif 4 / JetBrains Mono | `nord` (both; in the light variant, code blocks intentionally stay dark Nord against a light page) |
| Rosé Pine | Dawn / Moon | Atkinson Hyperlegible / iA Writer Mono | `rose-pine-dawn` / `rose-pine-moon` |

CSS variables per variant (minimum): `--bg`, `--fg`, `--muted`, `--accent`, `--border`, `--code-bg`, `--selection`, `--font-body`, `--font-heading`, `--font-code`. Size/rhythm variables (`--font-size`, `--line-height`, `--max-width`) come from settings.

## Settings

**Panel** (⌘,), live-previewing on the open document:
- Theme; appearance (`system` | `light` | `dark`)
- Body font, code font: dropdown of bundled fonts plus free-text for any installed font family
- Font size 14–24px; line height 1.3–2.0; max width 55–90ch
- Editor command (default `code`)

**Config file:** `~/.config/folio/config.json`

```json
{
  "theme": "paper",
  "appearance": "system",
  "bodyFont": "Literata",
  "codeFont": "JetBrains Mono",
  "fontSize": 18,
  "lineHeight": 1.65,
  "maxWidth": 68,
  "editorCommand": "code",
  "lastFolder": "~/Sites/personal/dayoff"
}
```

Rules:
- Only keys differing from the defaults are written (font defaults come from the active preset; `theme` is written when not `paper`). Changing theme never turns the old preset's fonts into overrides.
- `maxWidth` is a number of `ch`.
- If `config.json` is a symlink (e.g. into a dotfiles repo), writes go to the link target and the link is preserved; hand edits to the target are picked up.
- Out-of-range numeric values are clamped; unknown keys are ignored and preserved.
- Hand edits are picked up live. Invalid JSON → keep last good config in memory, show a non-blocking toast; never overwrite the file while it is invalid.
- Missing file → defaults; file created on first settings change.

## Behavior

**Live reload:** Re-render on change, preserve absolute `scrollTop`. Tree refreshes on folder changes.

**Links:**
- Relative `.md`/`.markdown` link → open in Folio, select in sidebar if within open folder; `#fragment` scrolls to heading.
- `#fragment`-only → scroll within document.
- `http(s)`/`mailto` → system default handler.
- Relative link to a non-Markdown file → reveal in Finder.

**Images:** Relative paths resolved against the document's directory and served via Tauri asset protocol, scoped to `$HOME/**`. Remote images load normally. Broken images show alt text.

**TOC:** H1–H4. Scroll-spy highlights the current section; click smooth-scrolls. Hidden when the document has fewer than 3 headings.

**Find (⌘F):** Floating bar; case-insensitive match highlighting via the CSS Custom Highlight API; Enter / ⇧Enter for next/previous; Esc closes; shows "n of m". v1 limitation: a match must sit inside a single text node (so it won't span differently-highlighted code tokens or inline formatting).

**Keyboard:**

| Shortcut | Action |
|---|---|
| ⌘O / ⇧⌘O | Open file / open folder |
| ⌘F | Find in document |
| ⌘\ / ⌥⌘\ | Toggle sidebar / TOC |
| ⌘E | Open in editor |
| ⌘+ / ⌘− / ⌘0 | Font size up / down / reset to preset |
| ⌘, | Settings |

**Window model:** Single window. Opening a file replaces the current document; sidebar folder is unchanged. Last folder is restored on launch. Launch with no file and no last folder shows an empty state with Open File / Open Folder buttons.

## Error handling

| Case | Behavior |
|---|---|
| File deleted/renamed while open | Keep last render; banner "File no longer exists" |
| File > 5MB | Confirmation prompt before rendering |
| Invalid UTF-8 | Lossy decode, render anyway |
| Empty file | Quiet empty state |
| Folder unreadable | Toast with OS error; tree shows nothing |
| Editor command fails | Toast: "Couldn't run `<cmd>` — set your editor in Settings" |
| Invalid config JSON | See Settings rules |

## Testing

**Vitest (`render/`):** Snapshot of a GFM fixture covering headings, lists, task lists, tables, footnotes, code blocks (multiple languages), blockquotes, inline HTML. Unit tests: heading extraction + slug uniqueness; relative image rewriting; relative `.md` link marking; sanitizer strips `<script>`, `onerror=`, `javascript:` URLs while keeping `<details>`/`<kbd>`.

**Vitest (`settings/`):** Preset ⊕ overrides merge; clamping; minimal write-back; invalid JSON retains last good config.

**cargo test:** Tree builder filtering (extensions, ignored dirs, empty-dir pruning); watcher debounce coalesces bursts.

**Manual acceptance:**
1. Build the app, set as default for `.md` in Finder (Get Info → Open with → Change All).
2. Double-click a spec file; it opens rendered.
3. Edit the file in VS Code; Folio updates without losing scroll position.
4. Cycle all six presets in light and dark; code highlighting matches each.
5. Change fonts/size/width in the panel and by hand-editing config; both apply live.
6. Open a repo folder; tree shows only Markdown; relative links and images work.
