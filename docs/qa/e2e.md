# Tests bout en bout : mode d'emploi (SP12 partie A)

## Back-office (Playwright)

Commande unique : `pnpm --filter admin e2e`.

Elle compile l'API (`pnpm --filter api... build`), puis `apps/admin/e2e/global-setup.ts` :
1. refuse toute base dont le nom ne contient pas `e2e`, `sp12` ou `test` ;
2. vide Redis (base dédiée), recrée le schéma PostgreSQL (`DROP SCHEMA public CASCADE`), `migrate deploy`, `db:seed:demo` ;
3. préremplit le cache d'assets du rendu HD (voir « Contournement ») ;
4. démarre l'API compilée, le worker et Vite (proxy `/v1`, même origine) ; arrête tout à la fin.

Variables (défauts entre parenthèses) : `E2E_DATABASE_URL` (`…/streetwear_e2e`, à créer : `createdb streetwear_e2e`), `E2E_REDIS_URL` (`redis://localhost:6379/9`), `E2E_API_PORT` (3107), `E2E_WEB_PORT` (5187), `E2E_RUN_DIR` (`$TMPDIR/streetwear-e2e` : journaux `api.log`, `worker.log`, `web.log`, outbox SMS). `PW_CHROMIUM_PATH` pointe vers un Chromium déjà installé (sinon `pnpm --filter admin exec playwright install chromium`). Rapport : `pnpm --filter admin e2e:report`.

Parcours : A connexion TOTP (mauvais mot de passe, mauvais code, bon code, rôle sans accès) ; B changement de statut par la logistique (boutons autorisés seulement, code de retrait à 6 chiffres) ; C affectation d'un livreur ; D cycle complet d'une commande payée (production avec fichiers HD, prête, livreur, expédition, vue `/livreur` à 360 px, code faux puis code reçu par SMS, « Livrée »).

### Code de remise
Le code n'est jamais journalisé. `ConsoleSmsProvider` ajoute chaque SMS en JSON par ligne à `TEST_SMS_OUTBOX_FILE` quand cette variable est définie ; **l'API refuse de démarrer si elle est définie avec `NODE_ENV=production`** (tests `env.spec.ts`, `sms.provider.spec.ts`). Le test lit ce fichier (le worker et l'API sont deux processus).

### Contournement du rendu HD
Les motifs et polices du jeu de démo ne sont hébergés nulle part. `global-setup.ts` écrit dans `ASSET_CACHE_DIR` (clé = sha256 du `publicId`) un SVG local pour chaque motif et la police DejaVu de `apps/api/test/fixtures`. Le rendu, le stockage local et les liens signés sont réels ; seule la source des images est locale.

### Limitation de débit
`/admin/auth/*` accepte 20 requêtes par minute et par IP (non assoupli). Les helpers (`authBudget`) espacent les connexions : la suite dure environ 1 min 20, dont un parcours D ralenti par ce quota.

## Mobile (Maestro)

Parcours dans `apps/mobile/e2e/` : 01 premier design + T-Money, 02 commande de groupe (12 t-shirts : 5 M, 4 L, 3 XL) avec retrait + Flooz, 03 paiement à la livraison avec acompte, 04 suivi et recommande, 05 code SMS faux puis bon. « Commande de groupe » = un design en plusieurs tailles dans un seul panier et un seul paiement (décision du chef de projet, 22/11/2026). Sans appareil, `pnpm --filter mobile test` vérifie la syntaxe YAML, les commandes, les fichiers référencés et que chaque `id:` correspond à un `testID` du code (`e2e/flows.test.ts`). Les flux n'ont **jamais été exécutés** (pas d'émulateur ; le binaire Maestro téléchargé n'a pas pu être lancé ici).

Lancer sur un appareil ou un émulateur Android :
1. Base fraîche + `pnpm --filter api db:seed:demo` (les flux 04 supposent TG-000008 au client +228 90 00 00 04).
2. API : `PAYMENT_PROVIDER=fake`, `FAKE_PAYMENT_WEBHOOK_SECRET` (≥ 32 car.), `FAKE_PAYMENT_WEBHOOK_URL=http://localhost:3000/v1/webhooks/payments/fake`, `TEST_SMS_OUTBOX_FILE=/chemin/sms.jsonl`, `RATE_LIMIT_PER_MINUTE=5000` ; worker démarré.
3. APK : `cd apps/mobile && eas build --platform android --profile e2e` (HTTP en clair autorisé via `E2E_ALLOW_CLEARTEXT=1`, API `http://localhost:3000/v1`, cartes désactivées), l'installer.
4. `SMS_OUTBOX=/chemin/sms.jsonl pnpm --filter mobile e2e` (`adb reverse tcp:3000`, sidecar OTP sur 127.0.0.1:3999, `maestro test`). Un flux : `… e2e e2e/05-connexion-code-faux-puis-bon.yaml`.
5. Entre deux exécutions : `DELETE FROM otp_codes;` (3 envois de code par heure et par numéro). Paiement factice : numéro payeur finissant par `00` échec, `01` webhook perdu, `02` rejoué, `03` jamais validé, autre = succès.

## CI

- `.github/workflows/ci.yml`, job `e2e-admin` : à chaque PR, services PostgreSQL/Redis, Chromium, `pnpm --filter admin e2e` ; rapport et journaux en artefacts en cas d'échec.
- `.github/workflows/maestro-nightly.yml` : cron 02:00 UTC, émulateur Android 34 (`reactivecircus/android-emulator-runner@v2.33.0`, Maestro 2.12.1, EAS CLI 16.32.0), **désactivé** tant que la variable de dépôt `MAESTRO_ENABLED` n'est pas `true`.

### Prérequis manquants pour le nocturne
Compte Expo/EAS (projet créé, `EAS_PROJECT_ID` en variable, `EXPO_TOKEN` en secret) ; variable `MAESTRO_ENABLED=true` ; premier passage manuel (`workflow_dispatch`) pour régler les attentes sur appareil. Le build EAS à chaque nuit consomme le quota : prévoir de réutiliser l'APK du jour. Les tags des actions n'ont pas pu être vérifiés hors ligne (actionlint indisponible) : syntaxe YAML validée par parseur seulement.
