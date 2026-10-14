// Version checks and bumps for scripts/release.sh. package.json and package-lock.json are bumped with `npm version`.
// CLI: node scripts/release/version.mjs check <version>   exits 1 unless <version> is SemVer and newer
//      node scripts/release/version.mjs bump <version>    rewrites tauri.conf.json, Cargo.toml and Cargo.lock
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

export const isSemver = (v) => SEMVER.test(v);

export function compareSemver(a, b) {
  const [x, y] = [a, b].map((v) => v.split(".").map(Number));
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i] ? 1 : -1;
  return 0;
}

function replaceOnce(text, pattern, version, file) {
  if (!pattern.test(text)) throw new Error(`couldn't find the version in ${file}`);
  return text.replace(pattern, (_, before, after) => `${before}${version}${after}`);
}

/** The first "version" key is the app's; the rest of the file keeps its hand formatting. */
export const bumpTauriConf = (text, v) => replaceOnce(text, /("version":\s*")[^"]+(")/, v, "tauri.conf.json");
/** The first line-initial `version =` is [package]'s; dependency versions are inline tables. */
export const bumpCargoToml = (text, v) => replaceOnce(text, /^(version = ")[^"]+(")/m, v, "Cargo.toml");
export const bumpCargoLock = (text, v) => replaceOnce(text, /(\[\[package\]\]\nname = "folio"\nversion = ")[^"]+(")/, v, "Cargo.lock");

const FILES = [
  ["src-tauri/tauri.conf.json", bumpTauriConf],
  ["src-tauri/Cargo.toml", bumpCargoToml],
  ["src-tauri/Cargo.lock", bumpCargoLock],
];

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [command, version] = process.argv.slice(2);
  const current = JSON.parse(readFileSync("src-tauri/tauri.conf.json", "utf8")).version;
  if (command === "check") {
    if (!isSemver(version ?? "")) {
      console.error(`release: "${version}" isn't a version like 0.3.0`);
      process.exit(1);
    }
    if (compareSemver(version, current) <= 0) {
      console.error(`release: ${version} isn't newer than the current ${current}`);
      process.exit(1);
    }
  } else if (command === "bump") {
    for (const [file, bump] of FILES) writeFileSync(file, bump(readFileSync(file, "utf8"), version));
  } else {
    console.error("usage: version.mjs check|bump <version>");
    process.exit(1);
  }
}
