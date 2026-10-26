# Folio — Writing Drafts

**Date:** 2026-10-26
**Status:** Agreed in brainstorming (sessions of 2026-10-24 and 2026-10-26), pending written-spec review
**Builds on:** `2026-10-12-folio-design.md` (reader, render pipeline, watchers, settings). Mockup from the brainstorm: `.superpowers/brainstorm/91667-1792889717/content/writing-screen-v2.html` (local, not committed).

## Purpose

Alex writes blog posts and publishes them on Substack by pasting them in. They want to write those posts in Markdown, inside Folio, and see them rendered as they type, on the same themed page they read on. Once a post is pasted into Substack, they mark it as published in Folio so drafts and finished posts are easy to tell apart.

This is the first time Folio writes to documents. It is also the first step toward a longer goal (not in this release): Folio as a daily and weekly planner built from plain Markdown files. The writing surface and the status line at the top of a file are the parts the planner will reuse, so they should be built as general pieces, not as blog-only code.

**Success:**
- Alex can start a new post, write it in Folio with Markdown turning into formatted text as they type, and never press Save.
- They can add a link without typing `[text](url)`: select words and right-click → Add Link…, ⌘K, or paste a URL over selected words.
- **Copy for Substack** puts the post on the clipboard as formatted text that pastes into Substack's editor with headings, bold, italics, links, lists, quotes and code intact.
- **Mark published** tags the post, and the sidebar shows every post as Draft or Published.
- Files outside the posts folder behave exactly as they do today.

## Decided in brainstorming

These are Alex's decisions:

- Writing happens **inside Folio**, not in an external editor. Folio stops being read-only for posts.
- The writing style is **live**, like Typora or Obsidian's live preview: Markdown is formatted in place. The line (or block) the cursor is in shows its raw Markdown; everything else is shown formatted.
- **No Substack integration.** No API, no login. Alex pastes posts into Substack himself.
- A published post is **marked with a tag** stored in the post file.
- **Adding links must be easy.** Alex's own idea: select words, right-click, **Add Link…**. All four link methods from the mockup are in (see Links).
- They confirmed the played-back description (posts folder, New post, autosave, Copy for Substack, Mark published), including the parts marked as guesses.

## Scope

**In:**
- A posts folder, set in Settings.
- Writing mode for `.md` files inside the posts folder: live formatting, autosave, undo/redo, spellcheck, ⌘B/⌘I.
- New post.
- Draft/Published status stored as frontmatter, shown in the sidebar and above the post.
- Mark published / Mark as draft.
- Copy for Substack.
- Links: paste over selection, ⌘K link box, bare URL paste, right-click Add Link… / Edit Link… / Remove Link.
- Reading view hides frontmatter in every file (today it renders as stray text and a rule).

**Out (non-goals):**
- Any Substack connection, publishing from Folio, scheduling posts.
- Uploading images. Local images show in Folio but won't come through when pasted into Substack; Alex adds images in Substack.
- Editing files outside the posts folder.
- Renaming, deleting, or moving posts from inside Folio (Finder does that; the sidebar already refreshes).
- A formatting toolbar, Substack-specific blocks (buttons, paywall, embeds), word-count goals.
- The planner.

**Anti-goals (would make this a failure even if it technically works):**
- **Losing words.** Quitting, switching posts, a crash, or a file changed elsewhere must never silently throw away what Alex typed.
- **Rewriting the Markdown.** Folio must only change the characters Alex edits. Opening and saving a post must not reformat lists, change `*` to `_`, re-wrap lines, or touch the frontmatter beyond the `status`/`published` keys.
- **Writing outside the posts folder.** The read-only promise still holds for every other file.
- A writing view that looks so unlike the reading view that the post feels like a different document.

## The posts folder

- New setting `postsFolder` (string path, `~`-abbreviated like `lastFolder`; default `null`). Settings gets a **Posts folder** row with Choose… and Clear.
- *My call (from the spec review):* the posts folder can only be set through Rust. Choose… calls a Rust command that shows the native folder picker and saves `postsFolder` itself; Clear calls a Rust command too. The existing `write_config` command keeps whatever `postsFolder` is already on disk and ignores any value the webview sends for it. That way script injected into the webview by a hostile document can't point the posts folder somewhere else and write there. Rust also refuses a posts folder that is `/`, the home folder itself, or a top-level system folder; picking one shows a toast asking for a more specific folder. Hand-editing `postsFolder` in `config.json` still works.
- A file is a **post** when it is a `.md` or `.markdown` file anywhere under the posts folder (subfolders included), after resolving symlinks. Only posts open in writing mode and only posts can be written.
- When the folder open in the sidebar is the posts folder (or inside it), the sidebar header shows **+ New post** and each file row shows its status tag.
- **Open Posts** (File menu and ⌘⇧P, *builder may pick another free shortcut*) opens the posts folder in the sidebar. If no posts folder is set, it asks for one with the folder picker and saves it.
- *My call:* if Alex opens a single post directly (Finder, ⌘O) without its folder in the sidebar, it still opens in writing mode, because it's still under the posts folder.

## Post files and status

Status lives in YAML frontmatter at the top of the file:

```markdown
---
status: draft
---

# Slow software

I spent a year building…
```

- `status: draft` or `status: published`. A post with no frontmatter, no `status`, or any other value counts as a **Draft**.
- Mark published sets `status: published` and adds `published: YYYY-MM-DD` (local date). *My call:* the date costs nothing now and gives the future planner something to sort and schedule by. Mark as draft sets `status: draft` and leaves `published` alone. *My call:* marking a post published again keeps the existing `published` date, so it always means when the post first went out; Alex can edit the date by hand.
- Changing status edits only those lines. Other frontmatter keys, their order, comments and formatting are left byte-for-byte. If the file has no frontmatter, Folio adds the block at the top.
- If the frontmatter can't be parsed, Folio leaves it alone, shows the post as Draft, and Mark published shows a toast that the frontmatter needs fixing by hand.
- Frontmatter handling (read status, set a key while preserving everything else) is a small standalone module with unit tests, because the planner will reuse it.

**Sidebar:** each post row shows a small **Draft** or **Published** tag after the name (as in the mockup: drafts in the theme's accent, published muted). Order stays as it is today. Reading status means reading each post's first few lines; *builder decides* how (for example a Rust command that returns the status for every post in the tree, cached and refreshed by the existing folder watcher).

**Rendering frontmatter:** the reading view and Copy for Substack skip a leading `---` … `---` block in every file, not just posts. In writing mode the frontmatter block is shown as one small, muted line (e.g. "Draft · 640 words") at the top of the post, above the title, where the frontmatter actually is (the mockup put it under the title) that expands to its raw text when the cursor moves into it.

## New post

- **+ New post** in the sidebar header and **File → New Post** (⌘N).
- Asks for a title in a small inline box. Creates `<Title>.md` in the posts folder root, using the title as typed (characters macOS can't use in a file name are replaced). If the name is taken, adds ` 2`, ` 3`, and so on. Mockup file names keep spaces and capitals, so *my call* is title-cased names, not slugs.
- The new file contains the frontmatter block with `status: draft`, a blank line, and `# <Title>`. It opens in writing mode with the cursor on the line after the title.
- Creating the file must never overwrite an existing one.

## Writing mode

**Look:** the post is shown in the same column, theme, fonts, size, line height and width as the reading view, using the same CSS variables, so a draft looks like the post it will become. Headings, bold, italic, links, inline code, lists, task lists, quotes, rules and code blocks are shown formatted. The block the cursor is in shows its Markdown marks (as the `##` heading in the mockup). Tables, footnotes and HTML may stay raw; *builder decides* how far to go beyond the list above. Code blocks use the theme's code font; syntax colors are nice to have.

**Editor:** *my call:* CodeMirror 6 with live-preview decorations (the approach Obsidian uses). It keeps the file as plain text, so it can't reformat Markdown it didn't touch, which a WYSIWYG editor that converts to and from Markdown (ProseMirror, Milkdown, TipTap) can't guarantee. Builder may choose differently only if the anti-goals still hold.

**Saving:**
- Autosave about a second after typing stops, when switching files, when the window loses focus, and before quit (including Install & Relaunch from the updater).
- Saves are atomic (write a temp file in the same folder, then rename) and keep the file's existing line endings and encoding (UTF-8; a BOM if the file had one).
- The toolbar title shows the state: "Slow software.md · saved", "· saving…", or "· not saved" with the error in a toast. A failed save keeps retrying on the next edit and blocks nothing.
- Folio's own writes must not bounce back through the file watcher as a reload.

**Changes from outside** (iCloud sync, another editor, ⌘E):
- If everything Alex typed is saved, Folio reloads the post in place, keeping the cursor and scroll as close as it can.
- If there are unsaved edits, Folio keeps Alex's text, does not reload, and shows a banner: "This post changed on disk. **Use the disk version** / **Keep mine**". Keep mine saves over the disk version.
- If the file is deleted while open, the existing "File no longer exists" banner shows; the text stays in the editor and is not saved anywhere until Alex copies it out. *Builder may* add a "Save again" button that recreates the file.

**Also in writing mode:** ⌘Z/⇧⌘Z undo, ⌘B bold, ⌘I italic, macOS spellcheck on, ⌘F find (CodeMirror's search, styled like the existing find bar), the contents panel (built from the editor's headings, updating while typing), and ⌘E Open in editor (saves first). Links are not followed on a plain click while writing; ⌘-click opens them (external links in the browser, as today).

## Links

All four go through one link box: a small popover near the selection with a URL field, Enter to apply, Esc to cancel, and Remove when editing an existing link.

- **A. Paste over selection:** with words selected, pasting something that is a single `http(s)://` or `mailto:` URL makes the selection a link to it. Any other paste is a normal paste.
- **B. ⌘K:** with words selected, opens the link box. With the cursor in an existing link, opens the box to edit or remove it. With nothing selected, opens the box with a second field for the link text.
- **C. Bare URL paste:** pasting a URL with nothing selected inserts it as `<https://…>` autolink text, so it shows as a link. *My call:* autolink rather than `[url](url)`, which reads cleaner in the file.
- **D. Right-click:** with words selected, the context menu has **Add Link…  ⌘K**, which opens the box. On an existing link, it has **Edit Link…** and **Remove Link**. *My call (from the spec review):* Folio shows its own menu (Cut, Copy, Paste, then the link items) only when words were already selected before the right-click, or the click is on a link. Everywhere else, including right-clicking an unselected misspelled word, the normal macOS menu with spelling suggestions appears. This avoids native AppKit hooks into WebKit's menu, which are fragile. The cost: with words already selected, the menu doesn't offer spelling suggestions.

Links are written as `[text](url)`. Remove Link leaves the text.

## Copy for Substack

- A toolbar button in writing mode (and **Edit → Copy for Substack**, ⇧⌘C).
- Puts two formats on the clipboard: HTML for rich paste, and the plain Markdown body as the plain-text fallback.
- The HTML is the post rendered with Folio's renderer, then cleaned for Substack: no frontmatter, no `data-folio-*` attributes, no Folio class names, no inline theme colors or fonts, links pointing at their real URLs. Code blocks as plain `<pre><code>`.
- *My call:* the first `# ` heading is left out, because Substack has its own title field. The toast says "Copied for Substack (title left out)". If the post has no top heading, nothing is left out.
- Local images are left out of the HTML (a `file`/`asset` URL would paste as a broken image); the toast mentions how many were left out, if any.
- Clipboard writing goes through whatever reliably sets both formats in Tauri's WKWebView (Tauri clipboard plugin or `navigator.clipboard.write`); *builder decides* after checking which works.
- A one-time manual check against Substack's editor is part of acceptance (below), since its paste handling can't be tested automatically.

## Toolbar and window

In writing mode the toolbar shows, besides today's buttons: **Copy for Substack**, and **Mark published** (solid) which becomes **Mark as draft** for published posts. Outside writing mode the toolbar is unchanged.

## Backend changes

- New commands: write a post, create a post, set status (or do status on the frontend and use write), and read statuses for the sidebar. *Builder decides* the exact split.
- Every write and create checks on the Rust side, not in the webview, that the canonical target is a Markdown file under the canonical `postsFolder` (read from `config.json` by Rust, and only settable through Rust; see The posts folder). Paths that escape through `..` or symlinks are refused. Create refuses existing files.
- The capabilities file gets only what these commands need, plus clipboard permission if the plugin is used.
- The README's "Read-only: Folio never writes to your documents" and "It is the only file Folio writes" change to say Folio writes only to posts in your posts folder, and only when you edit them.

## Testing

**Vitest:** frontmatter read/set (preserves other keys, order, comments, line endings; adds a block when missing; leaves unparseable frontmatter alone); post detection by path; New post file naming and collisions; link commands (A–D) on editor state; Copy for Substack HTML cleanup (title dropped, frontmatter dropped, attributes stripped, local images dropped); renderer skips frontmatter; autosave timing and the outside-change rules.

**Cargo:** write/create refuse paths outside the posts folder, through `..`, through symlinks, and non-Markdown files; create never overwrites; atomic write keeps line endings and BOM; status scan.

**Screenshots:** add a writing-mode screenshot to `npm run screenshots`.

**Manual acceptance (Alex):**
1. Set a posts folder, New post, write a few paragraphs with a heading, a list and a link added by each of the four methods. Quit and reopen: nothing is lost and the file reads as clean Markdown.
2. Copy for Substack, paste into a Substack draft: formatting and links come through, no title duplication.
3. Mark published: tag changes in the sidebar and in the file. Mark as draft flips it back.
4. Edit the post in VS Code (⌘E) while Folio is open: Folio picks up the change. Repeat with unsaved typing in Folio: the banner appears and both choices work.
5. Open a Markdown file outside the posts folder: it's read-only and looks as it did in v0.3.

## Left to the builder

Anything marked *builder decides* above, plus: CodeMirror extension structure, how live-preview decorations are drawn, keyboard handling inside the editor vs. Folio's global shortcuts, where the status line and banners sit in the DOM, the clipboard mechanism, and how statuses reach the sidebar. Keep the module boundaries of the original design: pure modules (frontmatter, Substack cleanup, link logic, naming) with tests, UI on top.
