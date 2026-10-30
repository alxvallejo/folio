// Renders the real frontend against mocked Tauri commands (mock.ts) in WebKit, the engine
// behind Folio's macOS webview, and writes framed PNGs plus share.jpg to docs/screenshots.
//   npm run screenshots          (first run: npx playwright install webkit)
//   npm run screenshots -- riso writing    only those shots, and no share.jpg
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { webkit } from "playwright";
import { createServer } from "vite";

const root = fileURLToPath(new URL("../..", import.meta.url));
const outDir = `${root}docs/screenshots`;
const title = "Two-ink printing.md";

const SHOTS = [
  { name: "riso", light: "riso", appearance: "light" },
  { name: "klein", dark: "klein", appearance: "dark" },
  { name: "klein-settings", dark: "klein", appearance: "dark", settings: true },
  { name: "paper", light: "paper", appearance: "light" },
  { name: "minimal", light: "minimal", appearance: "light" },
  { name: "citrus", light: "citrus", appearance: "light" },
  { name: "terracotta", light: "terracotta", appearance: "light" },
  { name: "neon-noir", dark: "neon-noir", appearance: "dark" },
  { name: "writing", light: "riso", appearance: "light", writing: "1", title: "Slow software.md" },
  { name: "daily-report", light: "riso", appearance: "light", report: "1", title: "2026-10-29.md" },
  { name: "daily-report-guide", light: "riso", appearance: "light", guide: "1", title: "daily-report.md" },
];

const only = process.argv.slice(2);
const shots = only.length ? SHOTS.filter((shot) => only.includes(shot.name)) : SHOTS;

const server = await createServer({ root, configFile: `${root}vite.config.ts`, server: { port: 1430, strictPort: true }, logLevel: "warn" });
await server.listen();
const browser = await webkit.launch();
mkdirSync(outDir, { recursive: true });

try {
  for (const { name, settings, title: shotTitle, ...query } of shots) {
    const page = await browser.newPage({ viewport: { width: 1400, height: 1000 }, deviceScaleFactor: 2, colorScheme: query.appearance });
    page.on("pageerror", (e) => console.error(`${name}: ${e.message}`));
    await page.goto(`http://localhost:1430/scripts/screenshots/frame.html?${new URLSearchParams({ ...query, title: shotTitle ?? title })}`);
    const app = page.frameLocator("#app");
    await app.locator(query.writing ? ".cm-content" : ".prose h2").first().waitFor();
    if (settings) await app.locator('button[title^="Settings"]').click();
    // Fonts and Shiki highlighting finish after the first paint.
    await page.waitForTimeout(1200);
    const path = `${outDir}/${name}.png`;
    await page.locator(".stage").screenshot({ path, omitBackground: true });
    try {
      execFileSync("pngquant", ["--force", "--skip-if-larger", "--quality=80-95", "--ext", ".png", path]);
    } catch {
      // pngquant is optional; keep the full-size PNG.
    }
    console.log(`wrote docs/screenshots/${name}.png`);
    await page.close();
  }

  if (!only.length) {
    const share = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 2 });
    await share.goto("http://localhost:1430/scripts/screenshots/share.html");
    await share.waitForFunction(() => [...document.images].every((img) => img.complete && img.naturalWidth > 0));
    await share.screenshot({ path: `${outDir}/share.jpg`, type: "jpeg", quality: 90 });
    console.log("wrote docs/screenshots/share.jpg");
  }
} finally {
  await browser.close();
  await server.close();
}
