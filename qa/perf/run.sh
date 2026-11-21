#!/usr/bin/env bash
# Usage : K6=/chemin/vers/k6 bash qa/perf/run.sh   (API compilée déjà démarrée : bash qa/stack.sh start)
# Produit qa/results/perf-*.json (résumés k6) et qa/results/perf-machine.txt.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
K6="${K6:-k6}"
OUT="$ROOT/qa/results"
{
  echo "date: $(date -u +%FT%TZ)"
  echo "nproc: $(nproc)"
  grep -m1 'model name' /proc/cpuinfo || true
  free -m | sed -n 1,2p
  echo "node: $(node -v)"
  echo "k6: $($K6 version)"
  echo "postgres: $(psql --version)"
  echo "redis: $(redis-server --version | cut -c1-60)"
} > "$OUT/perf-machine.txt"
cd "$ROOT"
node qa/perf/prepare.mjs "${ORDERS_FIXTURES:-2400}"
export BASE="${BASE:-http://localhost:${PORT:-3100}/v1}"
echo "== public 50 req/s 60 s"
SCENARIO=public RATE=50 DURATION=60s "$K6" run --quiet --summary-export "$OUT/perf-public-50.json" qa/perf/perf.js || true
echo "== orders 50 req/s 20 s"
SCENARIO=orders RATE=50 DURATION=20s "$K6" run --quiet --summary-export "$OUT/perf-orders-50.json" qa/perf/perf.js || true
echo "== public 200 req/s 30 s (marge)"
SCENARIO=public RATE=200 DURATION=30s "$K6" run --quiet --summary-export "$OUT/perf-public-200.json" qa/perf/perf.js || true
echo "== mixte : public 50 req/s + commandes 50 req/s simultanés, 20 s (100 req/s au total)"
SCENARIO=public RATE=50 DURATION=20s "$K6" run --quiet --summary-export "$OUT/perf-mixed-public.json" qa/perf/perf.js &
PUB=$!
SCENARIO=orders RATE=50 DURATION=20s "$K6" run --quiet --summary-export "$OUT/perf-mixed-orders.json" qa/perf/perf.js || true
wait "$PUB" || true
