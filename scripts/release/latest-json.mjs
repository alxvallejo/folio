// Writes the updater manifest that https://github.com/alxvallejo/folio/releases/latest/download/latest.json serves.
// CLI: node scripts/release/latest-json.mjs <version> <notes.md> <Folio.app.tar.gz.sig>  (prints JSON)
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { isSemver } from "./version.mjs";

export function buildLatestJson({ version, notes, pubDate, url, signature }) {
  if (!isSemver(version)) throw new Error(`"${version}" isn't a SemVer version like 0.3.0`);
  if (!url) throw new Error("the url is empty");
  if (!signature || !signature.trim()) throw new Error("the signature is empty");
  return {
    version,
    notes: notes.trim(),
    pub_date: pubDate,
    platforms: { "darwin-aarch64": { signature: signature.trim(), url } },
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [version, notesFile, sigFile] = process.argv.slice(2);
  const manifest = buildLatestJson({
    version,
    notes: readFileSync(notesFile, "utf8"),
    pubDate: new Date().toISOString(),
    url: `https://github.com/alxvallejo/folio/releases/download/v${version}/Folio.app.tar.gz`,
    signature: readFileSync(sigFile, "utf8"),
  });
  process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
}
