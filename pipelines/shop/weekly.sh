#!/usr/bin/env bash
# The Monday email: only on Mondays (UTC) unless FORCE=true. Write with a free model, check every number,
# then send (send_email.py holds it back if the guard fails, and never sends the same week twice).
set -euo pipefail
if [ "$(date -u +%u)" != "1" ] && [ "${FORCE:-false}" != "true" ]; then echo "not Monday: no weekly email"; exit 0; fi
python pipelines/summary/generate_free.py data/shop/shop_week.json data/shop/summary.json
if [ ! -f data/shop/summary.json ]; then echo "no summary written (no Gemini key yet): nothing to send"; exit 0; fi
GUARD_FACTS=data/shop/shop_week.json GUARD_SUMMARY=data/shop/summary.json GUARD_OUT=data/shop/guard.json \
  python checks/number_guard.py || true
python pipelines/shop/send_email.py weekly data/shop/shop_week.json data/shop/summary.json data/shop/guard.json state
