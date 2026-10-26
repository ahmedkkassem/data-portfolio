#!/usr/bin/env bash
# Render pages in headless Chrome. First the dashboard crops the home page shows (real interface, not
# mock-ups), then link-preview images, then full pages for the Upwork portfolio. The home page is shot
# last because it displays the crops.
set -euo pipefail
cd build/site
python -m http.server 8765 >/dev/null 2>&1 &
SERVER=$!
trap 'kill $SERVER' EXIT
sleep 1
mkdir -p shots
CHROME=$(command -v google-chrome || command -v chromium-browser)
shoot() { # file url width height
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars --no-sandbox --force-device-scale-factor=2 \
    --virtual-time-budget=20000 --window-size="$3,$4" --screenshot="shots/$1.png" "http://localhost:8765/$2" >/dev/null 2>&1 || true
  echo "shot $1"
}
# home-page crops: two per demo, dark, 4:5 portrait (720x900)
shoot pane-retail-a        "retail/?theme=dark&shot=kpis"        720 900
shoot pane-retail-b        "retail/?theme=dark&shot=cohorts"     720 900
shoot pane-email-a         "email/?theme=dark&shot=mail"         720 900
shoot pane-email-b         "email/?theme=dark&shot=guard"        720 900
shoot pane-spreadsheets-a  "spreadsheets/?theme=dark&shot=kpis"  720 900
shoot pane-spreadsheets-b  "spreadsheets/?theme=dark&shot=preview" 720 900
shoot pane-ops-a           "ops/?theme=dark&shot=kpis"           720 900
shoot pane-ops-b           "ops/?theme=dark&shot=speed"          720 900
shoot hero-retail          "retail/?theme=light&shot=top"        900 1100
# link previews (1200x630) and portfolio images
for p in retail email spreadsheets ops; do
  shoot "$p-og"     "$p/?theme=light&shot=top" 1200 630
  shoot "$p-cover"  "$p/?theme=light&shot=top" 1440 1080
  shoot "$p-full"   "$p/?theme=light&shot=top" 1440 4200
  shoot "$p-dark"   "$p/?theme=dark&shot=top"  1440 1080
  shoot "$p-mobile" "$p/?theme=light&shot=top" 390 2400
done
shoot home-og     "?shot=1" 1200 630
shoot index-cover "?shot=1" 1440 1080
shoot index-full  "?shot=1" 1440 7000
shoot index-mobile "?shot=1" 390 3200
ls shots | wc -l
