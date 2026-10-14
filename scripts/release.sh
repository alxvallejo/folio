#!/usr/bin/env bash
# Builds, signs and publishes a Folio release.
# Usage: scripts/release.sh <version> <notes.md> [--dry-run]
#   --dry-run  builds and stages the assets, then restores the version files. Nothing is committed,
#              tagged, pushed or published, and the branch/remote checks are skipped.
# Overrides, for dry runs with a throwaway key: FOLIO_UPDATER_KEY (key path), FOLIO_UPDATER_KEY_PASSWORD.
set -euo pipefail

die() {
  echo "release: $*" >&2
  exit 1
}

[[ $# -eq 2 || ($# -eq 3 && ${3:-} == "--dry-run") ]] || die "usage: scripts/release.sh <version> <notes.md> [--dry-run]"
VERSION=$1
NOTES=$(cd "$(dirname "$2")" && pwd)/$(basename "$2")
DRY_RUN=false
[[ ${3:-} == "--dry-run" ]] && DRY_RUN=true

cd "$(git rev-parse --show-toplevel)"
export PATH="$HOME/.cargo/bin:$PATH"
KEY=${FOLIO_UPDATER_KEY:-$HOME/.tauri/folio-updater.key}
BUNDLE=src-tauri/target/release/bundle
OUT=src-tauri/target/release/upload/v$VERSION
BUMPED=(package.json package-lock.json src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/tauri.conf.json)

# 1. Preconditions. Nothing is changed until all of them pass.
if $DRY_RUN; then
  echo "Dry run: skipping the master and origin/master checks."
else
  [[ $(git branch --show-current) == master ]] || die "not on master"
  git fetch --quiet origin master
  [[ $(git rev-parse master) == $(git rev-parse origin/master) ]] || die "master doesn't match origin/master; push or pull first"
  command -v gh >/dev/null || die "the GitHub CLI (gh) isn't installed"
  gh auth status >/dev/null 2>&1 || die "gh isn't logged in; run gh auth login"
fi
[[ -z $(git status --porcelain) ]] || die "the working tree isn't clean"
node scripts/release/version.mjs check "$VERSION" || exit 1
[[ -f $NOTES ]] || die "notes file not found: $2"
[[ -f $KEY ]] || die "no updater key at $KEY; run scripts/setup-updater-key.sh first"
if [[ -n ${FOLIO_UPDATER_KEY_PASSWORD:-} ]]; then
  PASSWORD=$FOLIO_UPDATER_KEY_PASSWORD
else
  PASSWORD=$(security find-generic-password -s folio-updater-key -a "$USER" -w 2>/dev/null) ||
    die "no folio-updater-key password in the login Keychain"
fi
npm test
npx tsc --noEmit
(cd src-tauri && cargo test)

# 2. Bump. Until the release commit exists, any exit puts the version files back.
COMMITTED=false
restore() { $COMMITTED || git checkout -- "${BUMPED[@]}"; }
trap restore EXIT
npm version "$VERSION" --no-git-tag-version >/dev/null
node scripts/release/version.mjs bump "$VERSION"

# 3. Build a signed bundle. createUpdaterArtifacts lives here, not in tauri.conf.json, so plain builds need no key.
rm -f "$BUNDLE/macos/Folio.app.tar.gz" "$BUNDLE/macos/Folio.app.tar.gz.sig"
TAURI_SIGNING_PRIVATE_KEY="$KEY" TAURI_SIGNING_PRIVATE_KEY_PASSWORD="$PASSWORD" \
  npx tauri build --bundles app,dmg --config '{"bundle":{"createUpdaterArtifacts":true}}'

APP_TGZ=$BUNDLE/macos/Folio.app.tar.gz
DMG=$BUNDLE/dmg/Folio_${VERSION}_aarch64.dmg
for f in "$APP_TGZ" "$APP_TGZ.sig" "$DMG"; do
  [[ -f $f ]] || die "the build didn't produce $f"
done

# 4–5. latest.json and the staged assets.
rm -rf "$OUT"
mkdir -p "$OUT"
cp "$DMG" "$OUT/Folio_${VERSION}_aarch64.dmg"
cp "$DMG" "$OUT/Folio_aarch64.dmg"
cp "$APP_TGZ" "$OUT/Folio.app.tar.gz"
node scripts/release/latest-json.mjs "$VERSION" "$NOTES" "$APP_TGZ.sig" >"$OUT/latest.json"
cat scripts/release/install-note.md "$NOTES" >"$OUT/release-notes.md"
echo
echo "Staged in $OUT:"
ls -lh "$OUT"

if $DRY_RUN; then
  echo "Dry run done. The version files are restored; nothing was committed, pushed or published."
  exit 0
fi

# 6. Commit, tag, push and publish, once the user says so.
read -r -p "Publish Folio $VERSION to GitHub? [y/N] " answer
[[ $answer == [yY] ]] || die "not published. The assets stay in $OUT; the version files are restored."
git add "${BUMPED[@]}"
git commit -m "Release $VERSION"
git tag "v$VERSION"
COMMITTED=true
PUBLISH="gh release create v$VERSION --title \"Folio $VERSION\" --notes-file $OUT/release-notes.md --latest $OUT/*.dmg $OUT/Folio.app.tar.gz $OUT/latest.json"
# Atomic, so a rejected master never leaves a pushed tag pointing off master.
git push --atomic origin master "v$VERSION" ||
  die "Release $VERSION is committed and tagged here but not pushed. Fix the cause, then run: git push --atomic origin master v$VERSION && $PUBLISH"
gh release create "v$VERSION" --title "Folio $VERSION" --notes-file "$OUT/release-notes.md" --latest \
  "$OUT/Folio_${VERSION}_aarch64.dmg" "$OUT/Folio_aarch64.dmg" "$OUT/Folio.app.tar.gz" "$OUT/latest.json" ||
  die "the tag is pushed but the release wasn't created. Retry with: $PUBLISH"
echo "Published: https://github.com/alxvallejo/folio/releases/tag/v$VERSION"
