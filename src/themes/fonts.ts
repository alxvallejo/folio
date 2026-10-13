export interface FontOption {
  label: string;
  stack: string;
}

export const BODY_FONTS: FontOption[] = [
  { label: "Literata", stack: '"Literata Variable", Literata, Georgia, serif' },
  { label: "Source Serif 4", stack: '"Source Serif 4 Variable", "Source Serif 4", Georgia, serif' },
  { label: "Inter", stack: '"Inter Variable", Inter, system-ui, sans-serif' },
  { label: "Atkinson Hyperlegible", stack: '"Atkinson Hyperlegible", system-ui, sans-serif' },
  { label: "iA Writer Quattro", stack: '"iA Writer Quattro", system-ui, sans-serif' },
  { label: "system-ui", stack: "system-ui, -apple-system, sans-serif" },
];

export const CODE_FONTS: FontOption[] = [
  { label: "JetBrains Mono", stack: '"JetBrains Mono Variable", "JetBrains Mono", ui-monospace, monospace' },
  { label: "iA Writer Mono", stack: '"iA Writer Mono", ui-monospace, monospace' },
  { label: "SF Mono", stack: '"SF Mono", ui-monospace, Menlo, monospace' },
];

const FALLBACK = { body: "system-ui, sans-serif", code: "ui-monospace, monospace" } as const;

/** CSS font-family value for a registered label or any installed family name. */
export function fontStack(name: string, kind: "body" | "code"): string {
  const wanted = name.trim().toLowerCase();
  const known = [...BODY_FONTS, ...CODE_FONTS].find((f) => f.label.toLowerCase() === wanted);
  if (known) return known.stack;
  const family = name.replace(/["\\;{}]/g, "").trim();
  return family ? `"${family}", ${FALLBACK[kind]}` : FALLBACK[kind];
}
