export function dirname(path: string): string {
  const i = path.lastIndexOf("/");
  return i <= 0 ? "/" : path.slice(0, i);
}

export function basename(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

export function normalize(path: string): string {
  const out: string[] = [];
  for (const segment of path.split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") out.pop();
    else out.push(segment);
  }
  return (path.startsWith("/") ? "/" : "") + out.join("/");
}

export function resolvePath(baseDir: string, target: string): string {
  return normalize(target.startsWith("/") ? target : `${baseDir}/${target}`);
}

export function isMarkdownPath(path: string): boolean {
  return /\.(md|markdown)$/i.test(path);
}

export function expandHome(path: string, home: string): string {
  if (path === "~") return home;
  return path.startsWith("~/") ? home.replace(/\/$/, "") + path.slice(1) : path;
}

export function abbreviateHome(path: string, home: string): string {
  const h = home.replace(/\/$/, "");
  if (path === h) return "~";
  return path.startsWith(`${h}/`) ? `~${path.slice(h.length)}` : path;
}
