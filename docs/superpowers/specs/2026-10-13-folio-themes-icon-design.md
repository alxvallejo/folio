# Folio — Bold Themes, Typography, and Icon (v0.2.0)

**Date:** 2026-10-13
**Status:** Approved in brainstorming, pending written-spec review
**Builds on:** `docs/superpowers/specs/2026-10-12-folio-design.md` (v1). Everything in v1 stays unless this spec replaces it.

## Purpose

v1 works but looks bland: the themes are muted and every theme uses one font for headings and body, so nothing stands out. v0.2.0 replaces the theme set with bolder palettes, gives every theme its own heading/body/code type pairing, and adds a real app icon and wordmark.

**Success:** opening Folio with no config shows a document that is visibly designed (Riso by day, Klein by night); switching themes changes the document's personality, not just its colors; the Dock icon is recognizably Folio at 32px.

## Scope

**In:** theme palettes and typography (the rendered document), theme selection model (separate light and dark themes), heading-font override, per-theme code highlighting, app icon, wordmark (empty state + README), v0.2.0 GitHub release.

**Out:** redesign of the app chrome (toolbar, sidebar, panels keep their layout; they only inherit the new colors), code signing/notarization, the personal-site project entry (separate follow-up), Intel builds.

## Themes

Seven themes, nine palettes. A theme supports one or both modes.

| Theme | Modes | Heading font (weight, tracking, style) | Body font | Code font |
|---|---|---|---|---|
| Paper | light, dark | Fraunces (600, -0.01em, normal) | Literata | JetBrains Mono |
| Minimal | light, dark | Geist (300, -0.03em, normal) | Geist | Geist Mono |
| Riso | light | Fraunces (900, -0.02em, normal) | Literata | JetBrains Mono |
| Citrus | light | Bricolage Grotesque (800, -0.03em, normal) | Atkinson Hyperlegible | JetBrains Mono |
| Terracotta | light | DM Serif Display (400, 0, normal) | Source Serif 4 | JetBrains Mono |
| Klein | dark | Instrument Serif (400, 0, italic) | Inter | JetBrains Mono |
| Neon Noir | dark | Space Grotesk (700, -0.02em, normal) | Inter | JetBrains Mono |

Removed: iA, GitHub, Catppuccin, Nord, Rosé Pine.

Theme ids: `paper`, `minimal`, `riso`, `citrus`, `terracotta`, `klein`, `neon-noir`.

### Palettes

Every palette defines these colors (CSS variable in parentheses):

`bg` (`--bg`), `fg` (`--fg`), `muted` (`--muted`), `border` (`--border`), `selection` (`--selection`), `heading` (`--heading`), `link` (`--link`), `linkUnderline` (`--link-underline`), `accent` (`--accent`, used by app chrome: active sidebar row, pressed toolbar buttons, range inputs), `highlight` (`--highlight`, find matches and `<mark>`), `codeBg` (`--code-bg`), `codeFg` (`--code-fg`), `quote` (`--quote`, blockquote rule), and `syntax` = { `keyword`, `string`, `comment`, `function`, `number`, `type` } (code highlighting only).

| Palette | bg | fg | muted | border | selection | heading | link | linkUnderline | accent | highlight | codeBg | codeFg | quote |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| paper/light | #fbf8f1 | #2b2622 | #7a6f63 | #e6dccb | #f2d7b6 | #2b2622 | #a4471c | #e0b89f | #a4471c | #f5d9a8 | #f3ede1 | #2b2622 | #d9c7ad |
| paper/dark | #1d1b18 | #e6dfd2 | #9b9183 | #36312a | #4d3b28 | #f1e9dc | #e39a63 | #7a5236 | #e39a63 | #5c4426 | #26231f | #e6dfd2 | #4a4238 |
| minimal/light | #fafafa | #171717 | #737373 | #e5e5e5 | #e0e0e0 | #171717 | #171717 | #a3a3a3 | #171717 | #d4d4d4 | #f0f0f0 | #171717 | #d4d4d4 |
| minimal/dark | #0a0a0a | #ededed | #a3a3a3 | #262626 | #333333 | #ededed | #ededed | #525252 | #ededed | #404040 | #161616 | #ededed | #404040 |
| riso/light | #f6efe2 | #1b2a6b | #5a6596 | #e2d6c2 | #ffd0c9 | #1b2a6b | #c42d1d | #ff9d93 | #ff5a4e | #ffc2bb | #1b2a6b | #f6efe2 | #ff5a4e |
| citrus/light | #fffbe6 | #22201a | #6e6650 | #efe6b8 | #e4ff5c | #22201a | #b84a00 | #ff9a4d | #ff6a00 | #e4ff5c | #22201a | #fffbe6 | #c8f21d |
| terracotta/light | #f2e3d3 | #2a1a12 | #725a4a | #e0c9b3 | #f0b99f | #b2431f | #0f6f6c | #7fb5b3 | #c4502a | #f6c9a8 | #0f3d3c | #f2e3d3 | #c4502a |
| klein/dark | #0a2aa6 | #f3f1ea | #b9c2ea | #2443bd | #3550c8 | #ffd23f | #ffd23f | #b8962a | #ffd23f | #806a00 | #061c78 | #e8ecff | #ffd23f |
| neon-noir/dark | #0e0d14 | #ece9ff | #9a95b8 | #26233a | #3a2140 | #ff2e88 | #00e0ff | #007f91 | #ff2e88 | #5c1238 | #17151f | #ece9ff | #ff2e88 |

| Palette | keyword | string | comment | function | number | type |
|---|---|---|---|---|---|---|
| paper/light | #a4471c | #5d7a3a | #857a6d | #2f5d8a | #a0662a | #7a4f8c |
| paper/dark | #e39a63 | #a9c47f | #7d7468 | #8ab4dc | #e2b36d | #c9a0dc |
| minimal/light | #0369a1 | #15803d | #808080 | #7c3aed | #b45309 | #0e7490 |
| minimal/dark | #7dd3fc | #86efac | #737373 | #c4b5fd | #fcd34d | #67e8f9 |
| riso/light | #ff8a80 | #ffd8a8 | #8d97c4 | #9fe3d6 | #ffb3d1 | #b8c4ff |
| citrus/light | #c8f21d | #ffb86b | #8f8a73 | #7fd4ff | #ff9a4d | #f5e663 |
| terracotta/light | #ffb38a | #c7e59b | #7f9e9c | #f6d38a | #ff9e7a | #9be0d8 |
| klein/dark | #ffd23f | #a8f0c6 | #8090d0 | #ff9fd2 | #ffb26b | #9fe6ff |
| neon-noir/dark | #ff2e88 | #00e0ff | #6e6890 | #c6a0ff | #ffd166 | #7dffb0 |

**Contrast requirements** (WCAG relative-luminance ratio, enforced by tests):

| Pair | Minimum |
|---|---|
| `fg` on `bg` | 7 |
| `codeFg` on `codeBg` | 7 |
| `muted` on `bg` | 4.5 |
| `link` on `bg` | 4.5 |
| `heading` on `bg` | 3 |
| each `syntax` color on `codeBg` | 3 |

The hex values above are the intended design. An implementer may adjust a value only as far as needed to meet a threshold, and must record each adjustment.

### Typography variables

Per theme, written by `applyTheme`: `--font-heading`, `--font-body`, `--font-code`, `--heading-weight`, `--heading-tracking`, `--heading-style`. Settings still provide `--font-size`, `--line-height`, `--max-width`.

`prose.css` uses them:
- Headings: `--font-heading`, `--heading-weight`, `--heading-tracking`, `--heading-style`, color `--heading`.
- Links: color `--link`, underline color `--link-underline`.
- Blockquote rule: `--quote`.
- `<mark>` and find highlights: `--highlight`.
- Code blocks: background `--code-bg`, text `--code-fg`.
- Inline code: a tint of `--fg` as today.

### Bundled fonts

New (Fontsource, latin subset only):
- Fraunces (variable, roman + italic)
- Instrument Serif (400 roman + italic)
- Bricolage Grotesque (variable)
- Space Grotesk (variable)
- DM Serif Display (400)
- Geist (variable)
- Geist Mono (variable)

Kept: Literata, Source Serif 4, Inter, Atkinson Hyperlegible, JetBrains Mono, and iA Writer Quattro/Mono. No theme uses the iA fonts by default, but they stay selectable.

Each heading/body/code font stack ends in a generic fallback of the same kind (serif, sans-serif, monospace), so a font that fails to load degrades gracefully.

## Code highlighting

Remove the nine bundled Shiki themes. For each palette, generate a Shiki theme object at runtime:
- name `folio-<theme>-<mode>`
- `type` light or dark
- editor background `codeBg`, foreground `codeFg`
- token scopes mapped to the six `syntax` colors

The mapping:
- comment: `comment`, `punctuation.definition.comment`
- keyword: `keyword`, `storage`, `storage.type`, `keyword.operator.new`
- string: `string`, `string.quoted`, `string.template`
- number: `constant.numeric`, `constant.language`, `constant.character`
- function: `entity.name.function`, `support.function`, `meta.function-call`
- type: `entity.name.type`, `entity.name.class`, `support.type`, `support.class`, `entity.name.tag`

The highlighter loads all nine. Rendering keeps the dual-theme CSS-variable mechanism, with `themes: { light: <current light theme's generated theme>, dark: <current dark theme's generated theme> }`. Changing appearance needs no re-render; changing either theme selection re-renders.

## Settings and config

| Key | Type | Default | Notes |
|---|---|---|---|
| `lightTheme` | theme id supporting light | `riso` | Unknown or dark-only id → default |
| `darkTheme` | theme id supporting dark | `klein` | Unknown or light-only id → default |
| `appearance` | `system` \| `light` \| `dark` | `system` | Unchanged |
| `headingFont` | string | theme's heading font | New override |
| `bodyFont`, `codeFont` | string | theme's fonts | Unchanged semantics |
| `theme` | — | — | Removed (migration below) |

Font defaults come from the theme currently shown. Overrides apply to whichever theme is shown.

**Minimal write-back:** a key is written only when it differs from its default. `lightTheme` is written when not `riso`, `darkTheme` when not `klein`. Unknown keys are still preserved.

**Migration from v1** happens when the config is read:
- Legacy `theme` is `paper` and neither new key is present → both `lightTheme` and `darkTheme` become `paper`.
- Legacy `theme` is any other value (`ia`, `github`, `catppuccin`, `nord`, `rose-pine`, or unknown) → ignored, defaults apply.
- The legacy `theme` key is removed the next time the config is written.

**Settings panel:** "Light theme" and "Dark theme" pickers, each listing only themes that support that mode, plus "Heading font" alongside body and code fonts.

**Toolbar theme dropdown:** lists the themes for the currently resolved appearance and edits that slot.

## Icon and wordmark

**App icon:** the source SVG lives at `src-tauri/icons/source/folio-icon.svg`, 1024×1024 viewBox.
- Tile: macOS grid rounded square at x=100, y=100, 824×824, corner radius 185, fill `#f6efe2`, with a 3px `#e2d6c2` inner stroke.
- Glyphs: two copies of the lowercase "f" from Fraunces at weight 900, converted to path outlines. The source has no `<text>` and needs no font.
  - Coral `#ff5a4e` copy offset by (+28, +22) units from the blue `#1b2a6b` copy.
  - The overlap is filled with the multiply blend of the two inks, `#1b0f21`, drawn as its own path (blue ∩ coral). No `mix-blend-mode` dependency.
  - Glyph optical size: the f's ascender reaches about 18% from the tile's top edge, centered horizontally on the pair.
- Generation: `npx tauri icon src-tauri/icons/source/folio-icon.svg` regenerates `src-tauri/icons/*`. Renders at 1024, 128, 32 and 16 px are reviewed by eye before committing.
- Export: a 512px PNG copy at `docs/assets/folio-icon-512.png`, for README and website use.

**Wordmark "folio":**
- Lowercase Fraunces 900 with the same two-ink offset, scaled to the type size.
- In-app (EmptyState): rendered as text using the active theme. Top layer `--heading`, offset layer `--accent`, so it follows Riso, Klein, etc.
- README: an SVG with outlined paths in riso blue and coral, at `docs/assets/folio-wordmark.svg`.

## Testing

**Vitest:**
- Every theme definition is complete: modes, fonts, heading style, palette per supported mode, all syntax colors.
- Every palette meets the contrast table.
- Every font a theme names is in the bundled font registry.
- The generated Shiki theme for each palette maps all six syntax colors and its background/foreground.
- Settings:
  - defaults
  - wrong-mode and unknown theme ids fall back
  - legacy `theme` migration for `paper`, a removed id, and an unknown value
  - minimal write-back for `lightTheme`/`darkTheme`/`headingFont`
  - the legacy key is dropped on write
- `themeVariables` writes the new variables.
- Updated render snapshot.

**Manual (user):**
- All seven themes in both modes where supported; the toolbar dropdown edits the current slot.
- The heading-font override.
- A v1 config with `"theme": "nord"` and with `"theme": "paper"` loads correctly.
- The icon in the Dock, Finder (list and icon view) and ⌘-Tab, light and dark.
- The wordmark in the empty state under Riso and Klein.

## Release

- Version 0.2.0 in `package.json`, `src-tauri/Cargo.toml` and `src-tauri/tauri.conf.json`.
- Apple Silicon DMG attached to a `v0.2.0` GitHub pre-release.
- Release notes mention the theme changes and the v1 config migration.
