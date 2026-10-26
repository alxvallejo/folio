# Folio Writing Drafts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Alex write blog posts inside Folio with live Markdown formatting and autosave, mark them Draft or Published, add links easily, and copy a post as formatted text for Substack, while every file outside the posts folder stays read-only.

**Architecture:** Pure TypeScript modules (`src/posts/`, `src/editor/` logic) carry frontmatter, link, autosave and Substack rules with Vitest coverage. A CodeMirror 6 editor with live-preview decorations replaces the reading view for posts. A new Rust module `posts.rs` owns the posts folder setting and is the only code that writes or creates post files, checking every path against the canonical posts folder it reads from `config.json` itself.

**Tech Stack:** Tauri 2, Rust (edition 2024), React 19, TypeScript, CodeMirror 6 (`@codemirror/state`, `view`, `commands`, `language`, `lang-markdown`, `search`), `@tauri-apps/plugin-clipboard-manager`, Vitest (jsdom), cargo test.

**Spec:** `docs/superpowers/specs/2026-10-26-folio-drafts-design.md`

## Global Constraints

- Only files under the posts folder are ever written; every other file behaves exactly as in v0.3.0.
- Folio changes only the characters Alex edits. Open + save of an untouched post is byte-identical (line endings, BOM, frontmatter, Markdown style).
- Status values: `draft` | `published`. Missing frontmatter, missing `status`, or any other value means Draft.
- Mark published sets `status: published` and adds `published: YYYY-MM-DD` (local date) only if `published` is absent. Mark as draft sets `status: draft` and leaves `published`.
- New post file: `<Title>.md` in the posts folder root; collisions get ` 2`, ` 3`, …; never overwrite. Contents: `---\nstatus: draft\n---\n\n# <Title>\n`, cursor on the line after the title.
- `postsFolder` is stored `~`-abbreviated in `config.json` and can only be changed by Rust (`choose_posts_folder`, `clear_posts_folder`, or a hand edit). `write_config` preserves the on-disk `postsFolder`.
- Refused posts folders: `/`, the home folder itself, any folder whose parent is `/`.
- Autosave ~1000 ms after typing stops, plus on file switch, window blur, close, ⌘Q and Install & Relaunch. Saves are atomic (temp file in the same folder, then rename).
- Shortcuts: ⌘N New post, ⇧⌘P Open Posts, ⇧⌘C Copy for Substack, ⌘K link box, ⌘B bold, ⌘I italic. ⌘F in writing mode opens CodeMirror search. ⌘E saves first, then opens the editor.
- Copy strings (exact): toolbar "Copy for Substack", "Mark published", "Mark as draft"; title suffix " · saved", " · saving…", " · not saved"; conflict banner "This post changed on disk." with buttons "Use the disk version" and "Keep mine"; context menu "Add Link…", "Edit Link…", "Remove Link"; copy toast "Copied for Substack (title left out)" (without the parenthetical when no title was dropped), plus " Left out 1 local image." / " Left out N local images." when N > 0; refused folder toast "Pick a more specific folder for posts."; unparseable frontmatter toast "This post's frontmatter couldn't be read. Fix it by hand to change its status."
- Error toasts end with one period (see `src/lib/text.ts` `sentence()` on the v0.3.1 branch if merged; otherwise end strings with a single period).
- tsconfig lib is ES2020: no `.at()`, no `Object.hasOwn`. Cargo needs `PATH="$HOME/.cargo/bin:$PATH"`.

## Review Focus

1. **A CRLF or BOM post** opened and saved without edits stays byte-identical; after an edit, untouched lines keep CRLF and the BOM survives. → Task 2 (BOM), Task 4 (line separator, `docText`).
2. **Switching posts while an autosave is pending** saves the pending text to the post it was typed in, never to the newly opened one. → Task 6.
3. **A non-post Markdown file that starts with a `---` rule** (e.g. `---\nSome intro\n---`) is not mistaken for frontmatter, so the reader doesn't hide its text. → Task 1.
4. **The watcher echo of Folio's own save** arriving after Alex typed more must not raise the conflict banner or reload. → Task 6.
5. **A post that isn't valid UTF-8** opens read-only with a toast instead of in writing mode, so a save can't replace undecodable bytes with U+FFFD. → Task 2 (`lossy` flag), Task 7 (`writingModeFor`).

---

### Task 1: Frontmatter module and renderer skip

**Files:**
- Create: `src/posts/frontmatter.ts`
- Create: `src/posts/frontmatter.test.ts`
- Modify: `src/render/index.ts` (strip frontmatter before `md.render`)
- Modify: `src/render/render.test.ts`

**Interfaces:**
- Produces:
  - `type PostStatus = "draft" | "published"`
  - `interface Frontmatter { start: 0; end: number; lines: string[] }` where `end` is the offset just past the closing `---` line's newline (or end of text), `lines` the raw lines between the fences.
  - `findFrontmatter(text: string): Frontmatter | null | "unparseable"`
  - `stripFrontmatter(text: string): string` — body after the block (unchanged text when none / unparseable)
  - `readStatus(text: string): PostStatus`
  - `setStatus(text: string, status: PostStatus, today: string): { ok: true; text: string } | { ok: false }`
  - `localDate(d: Date): string` → `"YYYY-MM-DD"`

Rules the code must follow (no YAML dependency; line-based so bytes are preserved):
- Frontmatter exists only when line 1 is exactly `---` (optionally followed by `\r`) and a later line is exactly `---` or `...`.
- Every line between must be blank, a comment (`#…`), indented (starts with space/tab), a list item (`- …`), or `key:` / `key: value` where key matches `/^[A-Za-z0-9_-]+$/`. If any line fails, it is **not** frontmatter (`null`) — this is what keeps a leading horizontal rule safe.
- Line 1 `---` with no closing fence: `"unparseable"` only if the following lines up to the first blank line all look like `key: value`; otherwise `null`.
- `setStatus` replaces the value on the existing `status:` line (keeping the line's ending), appends `published: <today>` after the `status` line when publishing and no `published:` key exists, and inserts `status: …` as the first key when there's a block without it. With no block, prepends `---\nstatus: <s>\n---\n\n` (using `\r\n` if the text's first line ending is CRLF). `"unparseable"` → `{ ok: false }`.

- [ ] **Step 1: Write the failing tests** in `src/posts/frontmatter.test.ts`

```ts
const post = "---\nstatus: draft\ntags: [a]\n---\n\n# Title\n";
it("reads status, defaulting to draft", () => {
  expect(readStatus(post)).toBe("draft");
  expect(readStatus("---\nstatus: published\n---\nx")).toBe("published");
  expect(readStatus("# no frontmatter")).toBe("draft");
  expect(readStatus("---\nstatus: weird\n---\n")).toBe("draft");
});
it("does not mistake a leading rule for frontmatter", () => {
  const doc = "---\nSome intro sentence.\n---\n\nBody";
  expect(findFrontmatter(doc)).toBeNull();
  expect(stripFrontmatter(doc)).toBe(doc);
});
it("strips a block", () => expect(stripFrontmatter(post)).toBe("\n# Title\n"));
it("publishing sets status and adds the date once", () => {
  const once = setStatus(post, "published", "2026-10-26");
  expect(once).toEqual({ ok: true, text: "---\nstatus: published\npublished: 2026-10-26\ntags: [a]\n---\n\n# Title\n" });
  const back = setStatus((once as { text: string }).text, "draft", "2026-11-01");
  const again = setStatus((back as { text: string }).text, "published", "2026-11-02");
  expect((again as { text: string }).text).toContain("published: 2026-10-26");
  expect((again as { text: string }).text).not.toContain("2026-11-02");
});
it("keeps other keys, comments, order and CRLF", () => {
  const crlf = "---\r\n# note\r\ntitle: X\r\nstatus: draft\r\n---\r\nbody";
  expect(setStatus(crlf, "draft", "2026-10-26")).toEqual({ ok: true, text: crlf });
  expect((setStatus(crlf, "published", "2026-10-26") as { text: string }).text).toBe(
    "---\r\n# note\r\ntitle: X\r\nstatus: published\r\npublished: 2026-10-26\r\n---\r\nbody",
  );
});
it("adds a block when there is none", () => {
  expect(setStatus("# T\n", "published", "2026-10-26")).toEqual({ ok: true, text: "---\nstatus: published\npublished: 2026-10-26\n---\n\n# T\n" });
});
it("refuses unparseable frontmatter", () => {
  expect(findFrontmatter("---\nstatus: draft\ntitle: x\n")).toBe("unparseable");
  expect(setStatus("---\nstatus: draft\ntitle: x\n", "published", "2026-10-26")).toEqual({ ok: false });
});
it("formats local dates", () => expect(localDate(new Date(2026, 0, 5))).toBe("2026-01-05"));
```

Add to `src/render/render.test.ts`: `it("hides frontmatter", …)` asserting `html("---\nstatus: draft\n---\n\n# Hi\n")` contains `<h1` and not `status`, and that `html("---\nIntro\n---\n")` still contains `Intro`.

- [ ] **Step 2: Run** `npx vitest run src/posts/frontmatter.test.ts src/render/render.test.ts` — Expected: FAIL (module missing; frontmatter rendered).
- [ ] **Step 3: Implement** `src/posts/frontmatter.ts` per the rules above, and call `stripFrontmatter(source)` at the top of the render closure in `src/render/index.ts`.
- [ ] **Step 4: Run** `npm test` — Expected: all pass (gfm snapshot unchanged).
- [ ] **Step 5: Commit** `git add src/posts src/render && git commit -m "Read and set post status in frontmatter, and hide frontmatter when reading"`

---

### Task 2: Rust posts module (folder setting, guarded writes, create)

**Files:**
- Create: `src-tauri/src/posts.rs`
- Modify: `src-tauri/src/lib.rs` (mod + handlers), `src-tauri/src/config.rs` (`write_config` preserves `postsFolder`), `src-tauri/src/fs.rs` (`FileContents.lossy`), `src-tauri/Cargo.toml` (`serde_json` feature `preserve_order`)
- Modify: `src/lib/api.ts` (new commands, `FileContents.lossy`)

**Interfaces:**
- Produces (Rust, all `Result<_, String>`):
  - `pub fn posts_folder_in(config_text: &str, home: &Path) -> Option<PathBuf>` — reads `postsFolder`, expands `~`.
  - `pub fn check_folder(path: &Path, home: &Path) -> Result<PathBuf, String>` — canonicalizes; `Err("Pick a more specific folder for posts.")` for `/`, `home`, or a folder whose parent is `/`.
  - `pub fn resolve_post(folder: &Path, path: &Path) -> Result<PathBuf, String>` — `watch::resolve(path)` must be Markdown (`fs::is_markdown`) and `starts_with(canonical folder)`; else `Err("Folio only writes posts in your posts folder.")`.
  - `pub fn write_post_at(folder: &Path, path: &Path, text: &str) -> Result<(), String>` — target must already exist; prepends BOM if the existing file starts with one; writes `.<name>.folio-tmp` in the same dir, `sync_all`, renames over.
  - `pub fn post_file_name(title: &str) -> String` — trims; replaces `/` and `:` with `-`; strips leading `.`; collapses whitespace; empty → `Untitled`; appends `.md`.
  - `pub fn create_post_at(folder: &Path, title: &str) -> Result<PathBuf, String>` — tries `Name.md`, `Name 2.md`, … with `OpenOptions::create_new(true)`; writes `---\nstatus: draft\n---\n\n# <trimmed title or Untitled>\n`.
  - `pub fn set_posts_folder_in(config_text: Option<&str>, value: Option<&str>) -> Result<String, String>` — returns the new config text (2-space pretty JSON + `\n`, keys in original order), with `postsFolder` set or removed.
  - `pub fn keep_posts_folder(incoming: &str, on_disk: Option<&str>) -> String` — used by `write_config`: replaces the incoming `postsFolder` with the on-disk one (or removes it).
  - Commands: `posts_folder() -> Option<String>` (canonical absolute path, or None), `choose_posts_folder(app) -> Option<String>` (async; `tauri_plugin_dialog::DialogExt` `blocking_pick_folder`, then `check_folder`, then saves `~`-abbreviated), `clear_posts_folder()`, `write_post(path, text)`, `create_post(title) -> String`.
- Produces (TS `api`): `postsFolder(): Promise<string | null>`, `choosePostsFolder(): Promise<string | null>`, `clearPostsFolder(): Promise<void>`, `writePost(path, text): Promise<void>`, `createPost(title): Promise<string>`; `FileContents` gains `lossy: boolean`.

- [ ] **Step 1: Write the failing cargo tests** in `posts.rs` `mod tests` (use `tempfile`):
  - `refuses_root_home_and_top_level`: `check_folder("/")`, `check_folder(home)`, `check_folder("/Users")` are `Err`; `home/Blog` is `Ok`.
  - `resolve_refuses_outside_dotdot_symlink_and_non_markdown`: `folder/../x.md`, a symlink inside `folder` pointing to `outside/x.md`, `folder/a.txt` → `Err`; `folder/sub/a.md` → `Ok`.
  - `write_is_atomic_and_keeps_bom`: existing `\u{feff}# a\r\n` + `write_post_at(.., "# b\r\n")` → file bytes are `EF BB BF` + `# b\r\n`; no `.folio-tmp` left in the dir.
  - `write_refuses_missing_file`: writing a path that doesn't exist → `Err` (a deleted post isn't recreated by autosave).
  - `names_posts`: `post_file_name(" Slow software ") == "Slow software.md"`, `"a/b: c"` → `"a-b- c.md"`, `".hidden"` → `"hidden.md"`, `"  "` → `"Untitled.md"`.
  - `create_never_overwrites`: with `Hello.md` present, `create_post_at(folder, "Hello")` returns `folder/Hello 2.md`; `Hello.md` unchanged; new file text equals `"---\nstatus: draft\n---\n\n# Hello\n"`.
  - `write_config_keeps_disk_posts_folder`: `keep_posts_folder(r#"{"fontSize":20,"postsFolder":"/"}"#, Some(r#"{"postsFolder":"~/Blog"}"#))` parses to `{"fontSize":20,"postsFolder":"~/Blog"}`; with `on_disk` lacking the key, `postsFolder` is removed.
  - `set_posts_folder_preserves_order`: `set_posts_folder_in(Some("{\n  \"b\": 1,\n  \"a\": 2\n}\n"), Some("~/Blog"))` == `"{\n  \"b\": 1,\n  \"a\": 2,\n  \"postsFolder\": \"~/Blog\"\n}\n"`.
  - In `fs.rs`: `read_text_flags_lossy_utf8` (`[0xff, b'a']` → `lossy == true`; valid text → `false`).
- [ ] **Step 2: Run** `cd src-tauri && PATH="$HOME/.cargo/bin:$PATH" cargo test posts fs::` — Expected: FAIL (not defined).
- [ ] **Step 3: Implement** `posts.rs`, `FileContents.lossy` (true when `String::from_utf8` fails), `keep_posts_folder` in `write_config`, register commands in `lib.rs`, enable `serde_json/preserve_order`. Commands read `config::config_path()` and `HOME` themselves; nothing takes a folder argument from the webview.
- [ ] **Step 4: Run** cargo tests again — Expected: PASS (all existing 39+ still green).
- [ ] **Step 5: Add the TS `api` entries** listed above; `npm test` and `npx tsc --noEmit` pass.
- [ ] **Step 6: Commit** `git commit -am "Add the posts folder and guarded post writes in Rust"` (include new files).

---

### Task 3: Posts in settings and the sidebar

**Files:**
- Create: `src/posts/posts.ts`, `src/posts/posts.test.ts`
- Modify: `src/settings/schema.ts` (`postsFolder: string | null`, read via `text()`; never written by `applyPatch` — drop it from patches), `src/settings/*.test.ts`
- Modify: `src/ui/SettingsPanel.tsx` (Posts folder row: path or "Not set", Choose…, Clear)
- Modify: `src/ui/Sidebar.tsx` (status tags, + New post), `src/ui/useFolder.ts` or new `src/ui/usePostStatuses.ts`
- Modify: `src/ui/App.tsx`, `src/styles/app.css`
- Create: `src/ui/NewPostBox.tsx`
- Modify: `src-tauri/src/menu.rs` (File menu), `src/lib/api.ts` (`events.onMenuAction`)

**Interfaces:**
- Consumes: `readStatus` (Task 1); `api.postsFolder/choosePostsFolder/clearPostsFolder/createPost`, `FileContents.lossy` (Task 2).
- Produces:
  - `isPostPath(path: string, postsFolder: string | null): boolean` — Markdown and strictly under `postsFolder + "/"` (UI hint only; Rust is the authority).
  - `postFilesIn(tree: Tree): string[]`
  - `usePostStatuses(tree: Tree | null, postsFolder: string | null): Map<string, PostStatus>` — reads each post via `api.readFile`, `readStatus`; refreshes when `tree` changes (the folder watcher already fires on Markdown writes).
  - `App` state `postsFolder: string | null` (canonical, from `api.postsFolder()` on load and on `config-changed`).
  - `openPosts(): Promise<void>` and `newPost(title: string): Promise<void>` in `App` (used by Task 9's menu).
- `Sidebar` props gain `statuses?: Map<string, PostStatus>` and `onNewPost?: () => void`; header shows "+ New post" only when `onNewPost` is set (open folder is the posts folder or inside it); file rows show `<span class="post-tag draft">Draft</span>` / `<span class="post-tag published">Published</span>`.
- `NewPostBox`: inline input under the sidebar header; Enter calls `newPost`, Esc closes; on success opens the new file. ⌘N with no posts folder open runs `openPosts` first, then shows the box.
- Menu (Rust `menu.rs`): new **File** submenu between Folio and Edit with "New Post" (`CmdOrCtrl+N`, id `new-post`) and "Open Posts…" (`CmdOrCtrl+Shift+P`, id `open-posts`). `on_event` emits `menu-action` with the id as payload for every id `action_for` knows. `pub fn action_for(id: &str) -> Option<&'static str>`; later tasks add ids to it. TS: `events.onMenuAction: on<string>("menu-action")`. These shortcuts live only in the menu, not in `actionFor`.

- [ ] **Step 1: Write failing tests**: `posts.test.ts` — `isPostPath("/u/Blog/a.md", "/u/Blog")` true; `"/u/Blog2/a.md"` false; `"/u/Blog/a.txt"` false; `"/u/Blog/sub/b.markdown"` true; null folder false. `postFilesIn` returns nested Markdown paths. Cargo `menu::tests::maps_menu_actions`: `action_for("new-post") == Some("new-post")`, `action_for("open-posts") == Some("open-posts")`, `action_for("check-for-updates") == None`. Schema test: `effectiveSettings({ postsFolder: "~/Blog" }).postsFolder === "~/Blog"` and `applyPatch({ postsFolder: "~/Blog" }, { postsFolder: "/" } as Partial<Settings>)` keeps `"~/Blog"`.
- [ ] **Step 2: Run** `npx vitest run src/posts src/settings` and `cargo test menu` — Expected: FAIL.
- [ ] **Step 3: Implement** the module, schema field, hook, Sidebar tags and button, NewPostBox, Settings row (Choose… → `api.choosePostsFolder()`, which may toast its error string; Clear → `api.clearPostsFolder()`), and `openPosts` (if `postsFolder` null → `choosePostsFolder` first; then `openFolder`).
- [ ] **Step 4: Run** `npm test` and `npx tsc --noEmit` — Expected: PASS.
- [ ] **Step 5: Commit** `git commit -am "Show post status in the sidebar and set the posts folder in Settings"` (with new files).

---

### Task 4: CodeMirror editor with live preview

**Files:**
- Modify: `package.json` (add `@codemirror/state`, `@codemirror/view`, `@codemirror/commands`, `@codemirror/language`, `@codemirror/lang-markdown`, `@codemirror/search`, `@lezer/markdown`)
- Create: `src/editor/livePreview.ts`, `src/editor/livePreview.test.ts`
- Create: `src/editor/editorTheme.ts`
- Create: `src/editor/createEditor.ts`
- Create: `src/editor/headings.ts`, `src/editor/headings.test.ts`
- Modify: `src/styles/prose.css` or new `src/styles/editor.css`

**Interfaces:**
- Produces:
  - `interface EditorOptions { parent: HTMLElement; doc: string; lineSeparator: "\n" | "\r\n"; onDocChange: (text: string) => void; extensions?: Extension[] }`
  - `createEditor(opts: EditorOptions): EditorView` — markdown with GFM (`markdown({ base: markdownLanguage })`), history, default + history keymaps, `bold`/`italic` commands on Mod-b / Mod-i, `search({ top: true })`, `EditorView.lineWrapping`, `contentAttributes: { spellcheck: "true", autocorrect: "off", autocapitalize: "off" }`, `EditorState.lineSeparator.of(opts.lineSeparator)`, `livePreview`, `editorTheme`.
  - `detectLineSeparator(text: string): "\n" | "\r\n"` — CRLF if the first line break is `\r\n`.
  - `docText(state: EditorState): string` — the file text using the state's line separator (`state.sliceDoc()`, never `doc.toString()`); every save goes through it.
  - `toggleWrap(marker: "**" | "*"): Command` (⌘B/⌘I).
  - `livePreview: Extension` and the pure `previewRanges(state: EditorState): { hide: [number, number][]; lineClass: [number, string][] }` used by the extension and the tests.
  - `headingsOf(state: EditorState): (Heading & { pos: number })[]` — same slugs as the reader (`github-slugger`), levels ≤ 4.
- Live preview rules: for the block(s) touching any selection range, show raw Markdown; elsewhere hide syntax marks (`HeaderMark`, `EmphasisMark`, `CodeMark` of inline code, `LinkMark` + `URL` of links, `QuoteMark`) and style lines/spans via classes (`cm-h1`…`cm-h6`, `cm-strong`, `cm-em`, `cm-link`, `cm-inline-code`, `cm-quote`, `cm-hr`, `cm-codeblock`). List bullets and task boxes may stay visible. `hide` is sorted and adjacent/overlapping ranges are merged. The frontmatter block is a single replaced widget line (Task 7 supplies its text via a facet; here render it as raw while the cursor is inside, otherwise a muted line).
- Styling: the editor uses the same CSS variables as `.prose` (fonts, size, line height, width, heading colors), so a post looks like its reading view.

- [ ] **Step 1: Install** `npm i @codemirror/state @codemirror/view @codemirror/commands @codemirror/language @codemirror/lang-markdown @codemirror/search @lezer/markdown` — Expected: lockfile updated.
- [ ] **Step 2: Write failing tests**:

```ts
const at = (doc: string, cursor: number) => EditorState.create({ doc, selection: { anchor: cursor }, extensions: markdown({ base: markdownLanguage }) });
it("hides marks away from the cursor and shows them on the cursor's block", () => {
  const doc = "## Why\n\nSome **bold** text";
  const away = previewRanges(at(doc, doc.length));
  expect(away.hide).toContainEqual([0, 3]);              // "## "
  const on = previewRanges(at(doc, 4));
  expect(on.hide.some(([f]) => f === 0)).toBe(false);
  expect(on.hide).toContainEqual([13, 15]);              // "**" of bold, other block
});
it("hides link syntax but keeps the text", () => {
  const r = previewRanges(at("[Tauri](https://tauri.app)\n\nx", 28));
  expect(r.hide).toEqual(expect.arrayContaining([[0, 1], [6, 26]]));
});
it("detects CRLF", () => { expect(detectLineSeparator("a\r\nb")).toBe("\r\n"); expect(detectLineSeparator("a\nb")).toBe("\n"); });
it("round-trips CRLF text", () => {
  const s = EditorState.create({ doc: "a\r\nb\r\n", extensions: EditorState.lineSeparator.of("\r\n") });
  expect(docText(s)).toBe("a\r\nb\r\n");
  expect(docText(s.update({ changes: { from: 1, insert: "!" } }).state)).toBe("a!\r\nb\r\n");
});
it("finds headings with reader slugs", () => {
  expect(headingsOf(at("# Hi\n\n## Hi\n", 0)).map((h) => h.id)).toEqual(["hi", "hi-1"]);
});
it("⌘B wraps and unwraps the selection", () => { /* EditorState with selection "bold" → run toggleWrap("**") via a minimal dispatch stub → "**bold**"; again → "bold" */ });
```

- [ ] **Step 3: Run** `npx vitest run src/editor` — Expected: FAIL.
- [ ] **Step 4: Implement** the files above. Use `syntaxTree(state).iterate` for `previewRanges`; the ViewPlugin turns `hide` into `Decoration.replace({})` and `lineClass` into `Decoration.line`.
- [ ] **Step 5: Run** `npm test`, `npx tsc --noEmit` — Expected: PASS.
- [ ] **Step 6: Commit** `git commit -am "Add the CodeMirror editor with live preview"` (with new files).

---

### Task 5: Links (paste, ⌘K box, bare URLs, right-click)

**Files:**
- Create: `src/editor/links.ts`, `src/editor/links.test.ts`
- Create: `src/ui/LinkBox.tsx`
- Create: `src/editor/contextMenu.ts`
- Modify: `src-tauri/capabilities/default.json` (add `core:menu:default`)

**Interfaces:**
- Consumes: `createEditor` `extensions` option (Task 4).
- Produces:
  - `isLinkUrl(text: string): boolean` — whole trimmed text is one `http://`, `https://` or `mailto:` URL with no whitespace.
  - `linkAt(state: EditorState, pos: number): { from: number; to: number; text: string; url: string } | null` — `[text](url)` or `<url>` containing `pos`.
  - `setLink(state, range: { from: number; to: number }, url: string, text?: string): TransactionSpec` — wraps the range as `[text](url)`, or replaces an existing link's URL when `range` is a `linkAt` result; when `range` is empty and `text` given, inserts `[text](url)`.
  - `removeLink(state, link): TransactionSpec` — leaves the text.
  - `pasteLinkHandler: Extension` — on paste: selection non-empty and `isLinkUrl(clip)` → `setLink`; selection empty and `isLinkUrl(clip)` → insert `<url>`; otherwise default.
  - `linkKeymap(open: (req: LinkRequest) => void): Extension` — Mod-k → `open`.
  - `type LinkRequest = { from: number; to: number; existing: { url: string; text: string } | null; needsText: boolean; anchor: { left: number; top: number } }`
  - `contextMenuKind(selectionBeforeClick: { empty: boolean }, linkUnderPointer: boolean): "folio" | "native"` — `"folio"` when the selection was non-empty *before* the right-click (record it on `mousedown` with `button === 2`) or the pointer is on a link.
  - `showFolioContextMenu(view, req: LinkRequest, open): Promise<void>` — `@tauri-apps/api/menu` `Menu.new` with Cut/Copy/Paste (predefined items), separator, then "Add Link…" (accelerator `CmdOrCtrl+K`) or "Edit Link…" + "Remove Link"; `menu.popup()`.
- `LinkBox`: popover at `anchor`, URL input (prefilled when editing), a "Text" input when `needsText`, Enter applies `setLink`, Esc cancels, "Remove" button when `existing`. Returns focus to the editor.

- [ ] **Step 1: Write failing tests**:

```ts
it("recognises URLs", () => {
  expect(isLinkUrl(" https://tauri.app/start ")).toBe(true);
  expect(isLinkUrl("mailto:a@b.co")).toBe(true);
  expect(isLinkUrl("see https://x.y")).toBe(false);
  expect(isLinkUrl("tauri.app")).toBe(false);
});
it("wraps a selection and edits an existing link", () => {
  const s = EditorState.create({ doc: "a Tauri prototype" });
  expect(apply(s, setLink(s, { from: 2, to: 17 }, "https://tauri.app"))).toBe("a [Tauri prototype](https://tauri.app)");
  const l = EditorState.create({ doc: "[x](https://a.b) y" });
  expect(apply(l, setLink(l, linkAt(l, 1)!, "https://c.d"))).toBe("[x](https://c.d) y");
  expect(apply(l, removeLink(l, linkAt(l, 1)!))).toBe("x y");
});
it("finds autolinks", () => expect(linkAt(EditorState.create({ doc: "<https://a.b>" }), 3)?.url).toBe("https://a.b"));
it("inserts link text when nothing is selected", () => {
  const s = EditorState.create({ doc: "" });
  expect(apply(s, setLink(s, { from: 0, to: 0 }, "https://a.b", "here"))).toBe("[here](https://a.b)");
});
it("chooses Folio's menu only for a prior selection or a link", () => {
  expect(contextMenuKind({ empty: false }, false)).toBe("folio");
  expect(contextMenuKind({ empty: true }, true)).toBe("folio");
  expect(contextMenuKind({ empty: true }, false)).toBe("native");
});
```
(`apply` = `state.update(spec).state.doc.toString()`.) Paste handler test: build an `EditorView` in jsdom, dispatch a synthetic `paste` `ClipboardEvent` with `text/plain` = URL over a selection → doc becomes `[sel](url)`; with empty selection → `<url>`; with plain text → default insert.

- [ ] **Step 2: Run** `npx vitest run src/editor/links.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** the module, LinkBox and context-menu hook (`EditorView.domEventHandlers({ mousedown, contextmenu })`: call `preventDefault()` only for `"folio"`). ⌘-click on a link in the editor opens it with `openUrl` (same rule as reader: external only); plain click just moves the cursor.
- [ ] **Step 4: Run** `npm test`, `npx tsc --noEmit` — Expected: PASS.
- [ ] **Step 5: Commit** `git commit -am "Add links by paste, ⌘K and right-click in the editor"` (with new files).

---

### Task 6: Autosave and outside changes

**Files:**
- Create: `src/editor/autosave.ts`, `src/editor/autosave.test.ts`

**Interfaces:**
- Produces:
  - `type SaveState = "saved" | "saving" | "unsaved" | "error"`
  - `interface Autosave { edit(text: string): void; flush(): Promise<void>; state(): SaveState; subscribe(fn: () => void): () => void; isOwnWrite(diskText: string): boolean; markSaved(text: string): void; dispose(): Promise<void> }`
  - `createAutosave(opts: { path: string; save: (path: string, text: string) => Promise<void>; delayMs?: number /* 1000 */; onError: (message: string) => void; setTimer?: typeof setTimeout; clearTimer?: typeof clearTimeout }): Autosave` — one instance per open post; `path` is fixed at creation, so a pending save always goes to the post it was typed in. Saves are serialized (never two writes in flight); `flush` waits for any in-flight save then writes the latest text if it differs from the last saved. `isOwnWrite` is true when `diskText` equals any of the last 5 texts written. On failure: state `"error"`, `onError("Couldn't save <name>: <err>.")` once per streak; the next edit retries.
  - `decideDiskChange(diskText: string, a: Autosave, editorText: string): "ignore" | "reload" | "conflict"` — `ignore` when `isOwnWrite(diskText)` or `diskText === editorText`; `reload` when state is `"saved"`; else `conflict`.

- [ ] **Step 1: Write failing tests** with fake timers (`vi.useFakeTimers()`):
  - `debounces`: three `edit`s 300 ms apart → no save until 1000 ms after the last; then exactly one `save(path, lastText)`.
  - `flush_saves_now_to_its_own_path`: create for `/p/a.md`, `edit("x")`, `await flush()` → `save` called with `"/p/a.md"`; a second instance for `/p/b.md` doesn't affect it.
  - `serializes_writes`: `save` returns a promise resolved manually; edit, advance 1000 ms (save 1 in flight), edit again, advance 1000 ms → second save starts only after the first resolves; final saved text is the latest.
  - `own_echo_is_ignored_after_more_typing`: save "v1" completes; `edit("v2")` (unsaved) → `decideDiskChange("v1", a, "v2")` is `"ignore"`.
  - `outside_change_reloads_when_clean_and_conflicts_when_dirty`: saved state + disk "other" → `"reload"`; after `edit("mine")` → `"conflict"`.
  - `error_then_retry`: `save` rejects once → state `"error"`, `onError` called once; next edit + 1000 ms → saves, state `"saved"`.
- [ ] **Step 2: Run** `npx vitest run src/editor/autosave.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** `src/editor/autosave.ts`.
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `git commit -am "Add autosave with own-write detection"` (with new files).

---

### Task 7: Writing view in the app

**Files:**
- Create: `src/ui/WriteView.tsx`, `src/ui/ConflictBanner.tsx`
- Modify: `src/ui/App.tsx`, `src/ui/useDocument.ts` (expose `text`, `lossy`, `diskText` updates), `src/ui/Toolbar.tsx`, `src/ui/Toc.tsx`, `src/styles/app.css`

**Interfaces:**
- Consumes: `createEditor`, `detectLineSeparator`, `headingsOf` (Task 4); link extensions + `LinkBox` (Task 5); `createAutosave`, `decideDiskChange` (Task 6); `api.writePost` (Task 2); `isPostPath` (Task 3); `readStatus` (Task 1).
- Produces:
  - `DocumentHandle` gains `text: string | null` (latest disk text) and `lossy: boolean`.
  - `WriteView` props: `{ path: string; diskText: string; removed: boolean; onState: (s: SaveState) => void; onHeadings: (h: Heading[]) => void; handleRef: RefObject<WriterHandle | null>; notify: (m: string) => void }`, rendered with `key={path}`.
  - `interface WriterHandle { flush(): Promise<void>; text(): string; replace(next: string): void /* one undoable transaction */; openSearch(): void; jumpTo(id: string): void; view: EditorView }`
  - `App` computes `writing = doc.path !== null && isPostPath(doc.path, postsFolder) && !doc.lossy`. When `doc.lossy` and it's a post, toast "<name> isn't valid UTF-8, so Folio opened it read-only." once.
  - `Toc` gains optional `onJump?: (id: string) => void` and `activeIndex?: number`; when `onJump` is set it doesn't query the DOM.
- Behavior:
  - `openFile` awaits `writerRef.current?.flush()` before opening another file; window `blur` and `⌘E` flush too.
  - `useDocument`'s `file-changed` reload updates `diskText`; `WriteView` runs `decideDiskChange` → `reload` (replace doc keeping selection clamped, mark saved), `conflict` (show `ConflictBanner`; "Use the disk version" replaces and marks saved, "Keep mine" flushes the editor text), `ignore`.
  - `removed` shows the existing banner; autosave stays paused (Rust refuses missing files anyway).
  - Toolbar title: `${basename} · saved|saving…|not saved` in writing mode.
  - The frontmatter facet from Task 4 is fed "Draft · N words" / "Published · N words" (words in the body after frontmatter, split on whitespace).
  - `"find"` action calls `openSearch()` in writing mode; FindBar is only for the reader.

- [ ] **Step 1: Write failing tests** in `src/posts/posts.test.ts`: `wordCount("---\nstatus: draft\n---\n\n# Hi there\n\nOne two.")` is `4`; `writingModeFor("/u/Blog/a.md", "/u/Blog", false)` is `true`, with `lossy = true` is `false`, `writingModeFor("/u/x.md", "/u/Blog", false)` is `false`.
- [ ] **Step 2: Run** `npx vitest run src/posts` — Expected: FAIL.
- [ ] **Step 3: Implement** `wordCount(text: string): number` and `writingModeFor(path: string, postsFolder: string | null, lossy: boolean): boolean` in `src/posts/posts.ts` (App uses the latter for `writing`), then `WriteView`, `ConflictBanner`, App/Toolbar/Toc/useDocument changes.
- [ ] **Step 4: Run** `npm test`, `npx tsc --noEmit`, then `npm run tauri dev` and check by hand: a post opens in writing mode, typing saves (title flips to "· saved"), the file on disk matches, a non-post file is unchanged in behavior, editing the post in another editor reloads it, typing then editing elsewhere shows the banner.
- [ ] **Step 5: Commit** `git commit -am "Open posts in writing mode with autosave and outside-change handling"` (with new files).

---

### Task 8: Mark published and Copy for Substack

**Files:**
- Create: `src/posts/substack.ts`, `src/posts/substack.test.ts`
- Modify: `package.json` + `src-tauri/Cargo.toml` + `src-tauri/src/lib.rs` (`tauri-plugin-clipboard-manager` / `@tauri-apps/plugin-clipboard-manager`), `src-tauri/capabilities/default.json` (`clipboard-manager:allow-write-html`)
- Modify: `src/ui/Toolbar.tsx`, `src/ui/App.tsx`, `src-tauri/src/menu.rs` (Edit → "Copy for Substack", `CmdOrCtrl+Shift+C`, id `copy-for-substack`, after Paste; add to `action_for` and its test)

**Interfaces:**
- Consumes: `stripFrontmatter`, `setStatus`, `readStatus`, `localDate` (Task 1); `createMarkdown` (`src/render/markdown.ts`), `sanitize` (`src/render/postprocess.ts`); `WriterHandle.replace/text` (Task 7).
- Produces:
  - `toSubstack(markdown: string): { html: string; text: string; droppedTitle: boolean; droppedImages: number }` — strips frontmatter; drops the first block if it is a `# ` heading (from both `html` and `text`); renders with `createMarkdown()` (no highlighter) + `sanitize`; removes `id`/`class`/`style`/`data-*` attributes; removes `<img>` whose `src` isn't `http(s)://` (count them); `text` is the Markdown body after those removals of frontmatter/title.
  - `copyMessage(r): string` — exact copy from Global Constraints.
  - Toolbar props gain `post?: { status: PostStatus; onCopy: () => void; onToggleStatus: () => void }`; renders "Copy for Substack" and a solid "Mark published" / "Mark as draft".
- Mark published/draft: `setStatus(writer.text(), next, localDate(new Date()))`; `{ ok: false }` → toast (exact copy); else `writer.replace(text)` so it is undoable and autosaved.

- [ ] **Step 1: Write failing tests**:

```ts
it("drops frontmatter and the title, keeps formatting and links", () => {
  const r = toSubstack("---\nstatus: draft\n---\n\n# Slow software\n\nA **bold** [link](https://a.b).\n\n## Why\n");
  expect(r.droppedTitle).toBe(true);
  expect(r.html).not.toContain("Slow software");
  expect(r.html).toContain('<strong>bold</strong>');
  expect(r.html).toContain('<a href="https://a.b">link</a>');
  expect(r.html).toContain("<h2>Why</h2>");   // no id attribute
  expect(r.text.startsWith("A **bold**")).toBe(true);
});
it("keeps a post without a top heading whole", () => expect(toSubstack("Hello").droppedTitle).toBe(false));
it("drops local images only", () => {
  const r = toSubstack("![a](pic.png) ![b](https://x.y/b.png)");
  expect(r.droppedImages).toBe(1);
  expect(r.html).toContain("https://x.y/b.png");
});
it("renders code blocks plainly", () => expect(toSubstack("```js\nx\n```").html).toContain("<pre><code>x\n</code></pre>"));
it("words the toast", () => {
  expect(copyMessage({ droppedTitle: true, droppedImages: 0 } as never)).toBe("Copied for Substack (title left out).");
  expect(copyMessage({ droppedTitle: false, droppedImages: 2 } as never)).toBe("Copied for Substack. Left out 2 local images.");
  expect(copyMessage({ droppedTitle: true, droppedImages: 1 } as never)).toBe("Copied for Substack (title left out). Left out 1 local image.");
});
```
- [ ] **Step 2: Run** `npx vitest run src/posts/substack.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** `substack.ts`; add the clipboard plugin (Rust `tauri_plugin_clipboard_manager::init()`, JS `writeHtml(html, text)`); wire toolbar buttons and the `copy-for-substack` menu action (ignored outside writing mode).
- [ ] **Step 4: Run** `npm test`, `npx tsc --noEmit`, cargo tests — Expected: PASS. In `tauri dev`, Copy for Substack then paste into TextEdit: formatted, no title.
- [ ] **Step 5: Commit** `git commit -am "Add Mark published and Copy for Substack"` (with new files).

---

### Task 9: Quitting safely, docs and screenshots

**Files:**
- Modify: `src-tauri/src/menu.rs` (custom Quit), `src-tauri/src/lib.rs` (`quit` command), `src/lib/api.ts` (`events.onMenuAction`, `api.quit`), `src/ui/App.tsx`
- Modify: `README.md`, `scripts/screenshots/mock.ts`, `scripts/screenshots/capture.mjs`, `scripts/screenshots/sample/` (add a sample post)

**Interfaces:**
- Consumes: `action_for`, `events.onMenuAction` (Task 3); `WriterHandle.flush` (Task 7).
- Produces:
  - Quit: replace `.quit()` with a text item "Quit Folio" (`CmdOrCtrl+Q`, id `quit`) emitting `menu-action` "quit". Frontend flushes the writer then calls `api.quit()` (`app.exit(0)`). Rust also starts a 3 s fallback timer on the menu event and exits if `quit` hasn't been called, so a hung webview can't block quitting.
  - Window close: `getCurrentWindow().onCloseRequested` → `preventDefault`, flush, `destroy()` (add `core:window:allow-destroy`).
  - Install & Relaunch: `onInstall` awaits `writerRef.current?.flush()` before `updater.install`.
- [ ] **Step 1: Extend the cargo test** `maps_menu_actions` with `action_for("quit") == Some("quit")`. Run `cargo test menu` — Expected: FAIL.
- [ ] **Step 2: Implement** the menu, quit command and fallback, frontend listeners, close/install flushing. Run cargo and `npm test` — Expected: PASS.
- [ ] **Step 3: README**: replace "Read-only: Folio never writes to your documents." with "Folio only writes to posts in your posts folder, and only when you edit them; every other file is read-only." and "It is the only file Folio writes." with "Besides posts you edit, it is the only file Folio writes." Add a short **Writing posts** section (posts folder, New post ⌘N, autosave, links ⌘K/right-click/paste, Copy for Substack, Mark published).
- [ ] **Step 4: Screenshots**: mock `posts_folder`, `write_post`, `create_post` in `mock.ts`; add `sample/Posts/Slow software.md` with `status: draft`; capture `docs/screenshots/writing.png` in writing mode (Riso). Run `npm run screenshots` — Expected: the new PNG exists and other screenshots are unchanged apart from the hidden-frontmatter fix if the sample used any.
- [ ] **Step 5: Full verification**: `npm test`, `npx tsc --noEmit`, `cd src-tauri && PATH="$HOME/.cargo/bin:$PATH" cargo test`, `npx tauri build --bundles app` — all succeed.
- [ ] **Step 6: Commit** `git commit -am "Save before quitting, and document writing posts"` (with new files).

---

## Handoff (manual acceptance, Alex)

From the spec: (1) set a posts folder, New post, write with a heading, list and one link by each of the four methods, quit and reopen; (2) Copy for Substack into a real Substack draft; (3) Mark published / Mark as draft; (4) edit in VS Code while open, with and without unsaved typing; (5) a non-post file is read-only and unchanged.

## Spec deviations (deliberate)

1. New post naming is tested in Rust (`post_file_name`), not Vitest: Rust creates the file, so naming and collision handling live where `create_new` makes them race-free.
2. Sidebar statuses come from the frontend reading each post with the existing `read_file` command (`usePostStatuses`) instead of a new Rust scan; post folders are small and the folder watcher already refreshes on any Markdown write.
3. The clipboard mechanism is decided: `tauri-plugin-clipboard-manager` `writeHtml`.
4. ⌘Q becomes a custom menu item so Folio can save before quitting.
