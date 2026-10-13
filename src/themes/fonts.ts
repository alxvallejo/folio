export interface FontOption {
  label: string;
  stack: string;
}

export type FontKind = "heading" | "body" | "code";

/** Display faces used for headings. Body fonts are also offered for headings. */
export const HEADING_FONTS: FontOption[] = [
  { label: "Fraunces", stack: '"Fraunces Variable", Fraunces, Georgia, serif' },
  { label: "Instrument Serif", stack: '"Instrument Serif", Georgia, serif' },
  { label: "Bricolage Grotesque", stack: '"Bricolage Grotesque Variable", "Bricolage Grotesque", system-ui, sans-serif' },
  { label: "Space Grotesk", stack: '"Space Grotesk Variable", "Space Grotesk", system-ui, sans-serif' },
  { label: "DM Serif Display", stack: '"DM Serif Display", Georgia, serif' },
];

export const BODY_FONTS: FontOption[] = [
  { label: "Literata", stack: '"Literata Variable", Literata, Georgia, serif' },
  { label: "Source Serif 4", stack: '"Source Serif 4 Variable", "Source Serif 4", Georgia, serif' },
  { label: "Inter", stack: '"Inter Variable", Inter, system-ui, sans-serif' },
  { label: "Geist", stack: '"Geist Variable", Geist, system-ui, sans-serif' },
  { label: "Atkinson Hyperlegible", stack: '"Atkinson Hyperlegible", system-ui, sans-serif' },
  { label: "iA Writer Quattro", stack: '"iA Writer Quattro", system-ui, sans-serif' },
  { label: "system-ui", stack: "system-ui, -apple-system, sans-serif" },
];

export const CODE_FONTS: FontOption[] = [
  { label: "JetBrains Mono", stack: '"JetBrains Mono Variable", "JetBrains Mono", ui-monospace, monospace' },
  { label: "Geist Mono", stack: '"Geist Mono Variable", "Geist Mono", ui-monospace, monospace' },
  { label: "iA Writer Mono", stack: '"iA Writer Mono", ui-monospace, monospace' },
  { label: "SF Mono", stack: '"SF Mono", ui-monospace, Menlo, monospace' },
];

const ALL_FONTS = [...HEADING_FONTS, ...BODY_FONTS, ...CODE_FONTS];
const FALLBACK: Record<FontKind, string> = {
  heading: "system-ui, sans-serif",
  body: "system-ui, sans-serif",
  code: "ui-monospace, monospace",
};

/** CSS font-family value for a registered label or any installed family name. */
export function fontStack(name: string, kind: FontKind): string {
  const wanted = name.trim().toLowerCase();
  const known = ALL_FONTS.find((f) => f.label.toLowerCase() === wanted);
  if (known) return known.stack;
  const family = name.replace(/["\\;{}]/g, "").trim();
  return family ? `"${family}", ${FALLBACK[kind]}` : FALLBACK[kind];
}

export function isBundledFont(label: string): boolean {
  return ALL_FONTS.some((f) => f.label === label);
}

/** Labels offered in the settings font fields for each kind. */
export function fontSuggestions(kind: FontKind): string[] {
  const options = kind === "heading" ? [...HEADING_FONTS, ...BODY_FONTS] : kind === "body" ? BODY_FONTS : CODE_FONTS;
  return options.map((f) => f.label);
}
