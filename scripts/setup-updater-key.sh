#!/usr/bin/env bash
# One-time: creates the key that signs Folio updates. Run it yourself, once, on the Mac you release from.
set -euo pipefail

KEY="$HOME/.tauri/folio-updater.key"
SERVICE=folio-updater-key

if [[ -e $KEY ]]; then
  echo "$KEY already exists. Installed copies of Folio trust only that key, so it's never overwritten." >&2
  exit 1
fi

cd "$(git rev-parse --show-toplevel)"
mkdir -p "$HOME/.tauri"

PASSWORD=$(openssl rand -base64 32)
security add-generic-password -U -s "$SERVICE" -a "$USER" -w "$PASSWORD"
npx tauri signer generate --ci -p "$PASSWORD" -w "$KEY" >/dev/null
chmod 600 "$KEY"

echo "Public key (goes in src-tauri/tauri.conf.json, plugins.updater.pubkey):"
echo
cat "$KEY.pub"
echo
echo
cat <<EOF
Back up both of these in your password manager now:
  1. the key file: $KEY
  2. the password: security find-generic-password -s $SERVICE -a $USER -w
If either is lost, installed copies of Folio can never update themselves again.
EOF
