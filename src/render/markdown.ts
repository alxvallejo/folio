import GithubSlugger from "github-slugger";
import MarkdownIt, { type MarkdownIt as MarkdownItInstance } from "markdown-it";
import footnote from "markdown-it-footnote";
import taskLists from "markdown-it-task-lists";

export interface Heading {
  level: number;
  text: string;
  id: string;
}

export type RenderEnv = {
  headings?: Heading[];
};

export type Highlight = (code: string, lang: string) => string;

interface InlineToken {
  children: { type: string; content: string }[] | null;
}

function inlineText(token: InlineToken | undefined): string {
  return (token?.children ?? [])
    .filter((child) => child.type === "text" || child.type === "code_inline")
    .map((child) => child.content)
    .join("");
}

export function createMarkdown(highlight?: Highlight): MarkdownItInstance {
  const md = new MarkdownIt({ html: true, linkify: true, highlight: highlight ?? null });
  md.use(taskLists);
  md.use(footnote);

  // Ids come from github-slugger so #anchors match the ones GitHub generates.
  md.core.ruler.push("folio_heading_ids", (state) => {
    const slugger = new GithubSlugger();
    const headings: Heading[] = [];
    state.tokens.forEach((token, i) => {
      if (token.type !== "heading_open") return;
      const text = inlineText(state.tokens[i + 1]);
      const id = slugger.slug(text);
      token.attrSet("id", id);
      const level = Number(token.tag.slice(1));
      if (level <= 4) headings.push({ level, text, id });
    });
    (state.env as RenderEnv).headings = headings;
  });

  return md;
}
