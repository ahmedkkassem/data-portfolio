#!/usr/bin/env bash
# Render each page in headless Chrome for the portfolio images. Demo covers are copied into the site
# (the hub page shows them), then the hub itself is shot last.
set -euo pipefail
cd build/site
python -m http.server 8765 >/dev/null 2>&1 &
SERVER=$!
trap 'kill $SERVER' EXIT
sleep 1
mkdir -p shots
CHROME=$(command -v google-chrome || command -v chromium-browser)
shoot() { # name path width height theme
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars --no-sandbox --force-device-scale-factor=2 \
    --virtual-time-budget=15000 --window-size="$3,$4" --screenshot="shots/$1.png" \
    "http://localhost:8765/${2}theme=$5" >/dev/null 2>&1 || true
  echo "shot $1"
}
for page in "retail|retail/?" "email|email/?" "spreadsheets|spreadsheets/?" "ops|ops/?" "index|?"; do
  name=${page%%|*}; path=${page#*|}
  shoot "$name-cover" "$path" 1440 1080 light
  shoot "$name-full" "$path" 1440 4200 light
  shoot "$name-dark" "$path" 1440 1080 dark
  shoot "$name-mobile" "$path" 390 2400 light
done
ls -la shots
