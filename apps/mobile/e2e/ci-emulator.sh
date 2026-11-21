#!/usr/bin/env bash
# Exécuté dans l'émulateur Android par reactivecircus/android-emulator-runner (voir .github/workflows/maestro-nightly.yml).
# Variables : APK_PATH, SMS_OUTBOX (fichier écrit par l'API de recette).
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
adb install -r "${APK_PATH:?APK_PATH requis}"
exec bash "$here/run.sh"
