import DOMPurify from "dompurify";
import { isMarkdownPath, resolvePath } from "../lib/paths";

const SCHEME = /^[a-z][a-z0-9+.-]*:/i;

export interface RewriteOptions {
  baseDir: string;
  toAssetUrl: (absolutePath: string) => string;
}

export function sanitize(html: string): string {
  return DOMPurify.sanitize(html, {
    // DOMPurify's clobbering guard strips ids such as "links", "images", and "title",
    // which are ordinary heading slugs. Scripts and on* handlers are still removed;
    // `name`, the attribute that can shadow document properties, is forbidden instead.
    SANITIZE_DOM: false,
    FORBID_ATTR: ["name"],
  });
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function splitUrl(url: string): { path: string; fragment: string | null } {
  const hash = url.indexOf("#");
  const beforeHash = hash >= 0 ? url.slice(0, hash) : url;
  const query = beforeHash.indexOf("?");
  return {
    path: query >= 0 ? beforeHash.slice(0, query) : beforeHash,
    fragment: hash >= 0 ? url.slice(hash + 1) : null,
  };
}

const isExternal = (url: string) => SCHEME.test(url) || url.startsWith("//");

export function rewriteLinks(root: ParentNode, { baseDir, toAssetUrl }: RewriteOptions): void {
  for (const img of root.querySelectorAll("img[src]")) {
    const src = img.getAttribute("src") ?? "";
    if (!src || isExternal(src)) continue;
    img.setAttribute("src", toAssetUrl(resolvePath(baseDir, safeDecode(splitUrl(src).path))));
  }

  for (const a of root.querySelectorAll<HTMLAnchorElement>("a[href]")) {
    const href = a.getAttribute("href") ?? "";
    if (href.startsWith("#")) {
      a.dataset.folioAnchor = safeDecode(href.slice(1));
    } else if (isExternal(href)) {
      a.dataset.folioExternal = "";
    } else {
      const { path, fragment } = splitUrl(href);
      const target = resolvePath(baseDir, safeDecode(path));
      if (isMarkdownPath(target)) {
        a.dataset.folioMd = target;
        if (fragment) a.dataset.folioFragment = safeDecode(fragment);
      } else {
        a.dataset.folioFile = target;
      }
    }
  }
}

/** Sanitize first, then rewrite, so rewritten asset: URLs never pass through DOMPurify's URL filter. */
export function postprocess(html: string, options: RewriteOptions): string {
  const template = document.createElement("template");
  template.innerHTML = sanitize(html);
  rewriteLinks(template.content, options);
  return template.innerHTML;
}
