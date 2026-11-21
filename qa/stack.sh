#!/usr/bin/env bash
# Usage : [PORT=3100] [RATE=100000] [WORKER=1] [LOGDIR=qa/results/logs] bash qa/stack.sh start|stop|status
# Démarre l'API et le worker COMPILÉS (apps/api/dist) avec apps/api/.env (non commité).
# Une variable déjà exportée prime sur le .env (comportement de node --env-file).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CMD="${1:-status}"
PORT="${PORT:-3100}"
LOGDIR="${LOGDIR:-$ROOT/qa/results/logs}"
mkdir -p "$LOGDIR"
API_PID="$LOGDIR/api-$PORT.pid"
WORKER_PID="$LOGDIR/worker-$PORT.pid"
case "$CMD" in
  start)
    export PORT RATE_LIMIT_PER_MINUTE="${RATE:-${RATE_LIMIT_PER_MINUTE:-100000}}"
    cd "$ROOT/apps/api"
    : > "$LOGDIR/api-$PORT.log"
    : > "$LOGDIR/worker-$PORT.log"
    nohup node --env-file=.env dist/main.js >"$LOGDIR/api-$PORT.log" 2>&1 &
    echo $! > "$API_PID"
    if [ "${WORKER:-1}" = "1" ]; then
      nohup node --env-file=.env dist/worker.js >"$LOGDIR/worker-$PORT.log" 2>&1 &
      echo $! > "$WORKER_PID"
    fi
    for _ in $(seq 1 60); do
      if curl -fs "http://localhost:$PORT/v1/health" >/dev/null 2>&1; then echo "API prête sur :$PORT"; exit 0; fi
      sleep 0.5
    done
    echo "API non démarrée, voir $LOGDIR/api-$PORT.log" >&2
    exit 1 ;;
  stop)
    for f in "$API_PID" "$WORKER_PID"; do
      if [ -f "$f" ]; then kill "$(cat "$f")" 2>/dev/null || true; rm -f "$f"; fi
    done
    echo "arrêtés" ;;
  status) curl -s "http://localhost:$PORT/v1/health" || echo "arrêtée" ;;
esac
