import { convertFileSrc } from "@tauri-apps/api/core";
import { getHighlighter, makeHighlight, type ThemePair } from "./highlight";
import { createMarkdown, type Heading, type RenderEnv } from "./markdown";
import { postprocess } from "./postprocess";

export type { Heading } from "./markdown";
export type { ThemePair } from "./highlight";

export interface RenderOptions {
  baseDir: string;
  themes: ThemePair;
  toAssetUrl?: (absolutePath: string) => string;
}

export interface RenderResult {
  html: string;
  headings: Heading[];
}

export type Render = (source: string, options: RenderOptions) => RenderResult;

/** Pure: Markdown string + base dir → sanitized HTML and headings. No UI, no file I/O. */
export async function createRenderer(): Promise<Render> {
  const highlighter = await getHighlighter();
  const byThemes = new Map<string, ReturnType<typeof createMarkdown>>();

  return (source, { baseDir, themes, toAssetUrl = convertFileSrc }) => {
    const key = `${themes.light}|${themes.dark}`;
    let md = byThemes.get(key);
    if (!md) {
      md = createMarkdown(makeHighlight(highlighter, themes));
      byThemes.set(key, md);
    }
    const env: RenderEnv = {};
    const raw = md.render(source, env);
    return { html: postprocess(raw, { baseDir, toAssetUrl }), headings: env.headings ?? [] };
  };
}
