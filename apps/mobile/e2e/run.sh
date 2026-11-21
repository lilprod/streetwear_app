#!/usr/bin/env bash
# Lance les 5 parcours Maestro sur l'appareil ou l'émulateur Android connecté (adb).
# Prérequis : API de recette démarrée avec TEST_SMS_OUTBOX_FILE, PAYMENT_PROVIDER=fake et
# FAKE_PAYMENT_WEBHOOK_URL (voir docs/qa/e2e.md) ; APK e2e installé ; `maestro` dans le PATH.
#   SMS_OUTBOX=/chemin/sms.jsonl bash apps/mobile/e2e/run.sh [flux.yaml ...]
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
outbox="${SMS_OUTBOX:?Définir SMS_OUTBOX (valeur de TEST_SMS_OUTBOX_FILE côté API)}"
api_port="${API_PORT:-3000}"

command -v maestro >/dev/null || { echo "maestro introuvable (https://maestro.mobile.dev)"; exit 2; }
command -v adb >/dev/null || { echo "adb introuvable"; exit 2; }
adb get-state >/dev/null 2>&1 || { echo "aucun appareil adb connecté"; exit 2; }

# L'application appelle http://localhost:<port>/v1 : on redirige l'appareil vers l'API de l'hôte.
adb reverse "tcp:${api_port}" "tcp:${api_port}" >/dev/null

node "$here/support/otp-server.mjs" "$outbox" 3999 &
otp_pid=$!
trap 'kill $otp_pid 2>/dev/null || true' EXIT

mkdir -p "$here/report"
if [ "$#" -gt 0 ]; then flows=("$@"); else flows=("$here"/0*.yaml); fi
maestro test --format junit --output "$here/report/maestro.xml" "${flows[@]}"
