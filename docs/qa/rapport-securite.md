# Rapport de sécurité (SP12, partie B, item 6)

Date : 21/11/2026. API et worker **compilés**, jeu de démo, adaptateurs factices. Scripts : `qa/security/*.mjs` (`node qa/security/run.mjs`, `SKIP_RATE=1` saute les 6 min de limitation de débit ; la limitation démarre sa propre API sur :3101 avec la limite par défaut). Résultats bruts : `qa/results/security-*.json`.

## Verdict

- **Contrôle d'accès : zéro accès non autorisé** sur 413 requêtes (59 routes protégées × 7 identités).
- Corrigées dans cette partie : en-têtes de sécurité absents, 413 renvoyé en 500, scrub Sentry insuffisant (voir anomalies).
- **À traiter avant le pilote** : A-SEC-4 (limitation de débit par IP derrière le reverse proxy).

## 1. Matrice des rôles

Routes extraites **des contrôleurs compilés** (`qa/security/extract-routes.mjs`, métadonnées NestJS) : 110 routes au total, **64 sous `/admin/*` et `/courier/*`** (59 protégées, 5 publiques : `auth/login|totp|refresh|logout`, `media/upload` signée). Matrice attendue transcrite du contrat (`qa/security/contract-routes.mjs`). Règle : « passé » = autre réponse que 401/403 (la garde s'exécute avant la validation ; corps vide et identifiants fictifs, donc aucune mutation).

| Identité | Requêtes | Passées | Refusées (401/403) | Attendu par le contrat | Écart |
|---|---|---|---|---|---|
| sans jeton | 59 | 0 | 59 (401) | 0 | 0 |
| jeton client | 59 | 0 | 59 (401) | 0 | 0 |
| super_admin | 59 | 55 | 4 | 55 | 0 |
| order_manager | 59 | 7 | 52 | 7 | 0 |
| production | 59 | 13 | 46 | 13 | 0 |
| logistics | 59 | 16 | 43 | 16 | 0 |
| courier | 59 | 4 | 55 | 4 | 0 |

(Les 4 refus de `super_admin` sont les 4 routes `/courier/*`, réservées au rôle `courier` par le contrat.) Détail route par route : `qa/results/security-roles-matrix.json`.

Contrôles complémentaires, tous conformes :

- Jeton d'équipe sur 8 routes client (`/me`, `/cart`, `/orders`, `/designs`, `/orders/:id/payments`, `/payments/:id`, …) : 401 partout (5 rôles × 8).
- Jetons forgés sur `GET /admin/users` : `alg=none`, mauvaise signature, expiré, jeton client signé `typ=admin`, jeton de défi TOTP : 401 chacun.
- Claim `role=super_admin` dans un jeton valide du livreur : 403 (le rôle est relu en base).
- Compte désactivé : 401 immédiat avec un jeton encore valide.
- Transitions de statut (`POST /admin/orders/:id/transitions`, « selon la transition ») : `production`, `logistics`, `courier` ne franchissent aucune transition (les 14 statuts essayés) depuis `pending_payment` ; `order_manager` seulement `cancelled` ; `super_admin` ne peut pas poser `paid`, `deposit_paid`, `payment_failed`, `expired` ; `paid → in_production` refusé à `order_manager`, `logistics`, `courier` et à `production` sans opérateur.

### Écarts code ↔ contrat

| Écart | Gravité |
|---|---|
| Le contrat écrit « GET / POST / PATCH `/admin/price-rules` » ; le code expose `PATCH /admin/price-rules` (sans `:id`, règles identifiées par `key`) alors que les autres ressources utilisent `PATCH /:id`. Transcrit tel que dans le code. | Mineure (documentaire) |
| `POST /admin/media/upload` (public, signé) existe dans le code et seulement dans la prose du contrat, pas dans les tableaux. | Mineure (documentaire) |
| Aucune route du contrat absente du code ; aucune route du code sans rôle déclaré et non publique. | — |

## 2. Limitation de débit et verrouillage (API :3101, limite par défaut)

| Contrôle | Attendu | Obtenu |
|---|---|---|
| OTP : 4 demandes pour un numéro | 3 × 204 puis `429 RATE_LIMITED` avec `retryAfterMinutes` | conforme ; 3 codes en base |
| OTP : 5 codes faux | 4 × `OTP_INVALID` puis `OTP_ATTEMPTS_EXCEEDED` ; bon code refusé ensuite | conforme |
| OTP : 12 numéros distincts depuis une IP | 10 × 204 puis 429 | conforme (10/min/IP) |
| Connexion admin : 5 mots de passe faux | verrouillage 15 min | 4 × `INVALID_CREDENTIALS`, puis **`ACCOUNT_LOCKED` dès le 5e échec** ; bon mot de passe refusé (`retryAfterMinutes` ≈ 15, `locked_until` = +15 min) |
| Compte inconnu vs mot de passe faux | réponses identiques | identiques (pas d'énumération) |
| Connexion admin : 25 tentatives/min | 20 × 401 puis 429 | conforme |
| Limite globale « 100 req/min par IP » (contrat) | 429 au-delà de 100 toutes routes confondues | **non conforme** : 100 sur `/catalog/colors` (429 à la 101e) puis 60 sur `/catalog/categories` toutes en 200 : compteur par route (A-SEC-5) |

## 3. En-têtes, CORS, fuites

| Contrôle | Résultat |
|---|---|
| `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, absence de `X-Powered-By`, `Cache-Control: no-store` hors catalogue | Absents avant correction (A-SEC-1) ; présents après (middleware `securityHeaders`, test Jest) |
| **HSTS, TLS, CSP du back-office** | **Relèvent du reverse proxy** (TLS y est terminé) : non vérifiables contre l'API en HTTP. À contrôler sur la recette réelle (`Strict-Transport-Security: max-age>=15552000`, redirection HTTP → HTTPS, CSP de l'admin). |
| CORS | Absent (aucun `Access-Control-*` sur GET, préflight, `Origin: null`) : conforme à la décision du lead |
| Corps de 1,2 Mo | 500 avant correction ; 413 après (A-SEC-2) ; JSON invalide : 400 sans trace de pile ; aucune trace Prisma/SQL dans les erreurs |
| `/v1/docs` (Swagger UI) | Publique, sans condition d'environnement (A-SEC-6) |

## 4. Données personnelles dans les journaux

`node qa/security/05-logs-pii.mjs` analyse les journaux de l'API et du worker produits pendant les scénarios (cohérence, rôles, limitation, Sentry : 4 fichiers, 1 712 lignes ; les journaux de la charge k6, volumineux, ont été écartés) et la base. Recherche : numéros E.164 complets et locaux, codes (OTP, retrait, remise), JWT, en-tête `Authorization`, e-mails clients, coordonnées GPS en URL, mots de passe et secrets du `.env`.

Résultat : **0 occurrence**. `notifications.payload` sans code, `payment_events.raw_body` sans numéro complet. Les numéros n'apparaissent que masqués (`+228 90 •• •• 11`), `Authorization` et `Cookie` sont `[Redacted]`. Observations mineures (non bloquantes) : les en-têtes `x-fake-signature` et `idempotency-key` sont journalisés en clair (signature d'un corps déjà enregistré en base, rejouable sans effet) ; le SMS factice ne journalise pas le code, donc **le README annonce à tort que le code s'affiche dans les journaux** (les testeurs ne peuvent pas se connecter sans lecture de la base).

## 5. Sentry

Configuration (`apps/api/src/config/sentry.ts`) : `sendDefaultPii: false`, `beforeSend` = `scrub`. **Avant correction**, `scrub` ne masquait que les clés exactes `phone`, `address`, `landmark` : `recipientPhone`, `payerPhone`, e-mail, nom, codes OTP/remise, jetons, `Authorization` et les numéros dans les messages d'erreur partaient en clair (testé en direct, enveloppe réelle reçue par un serveur local). **Après correction** : masquage par nom de clé (téléphone, e-mail, nom, adresse, repère, lat/lng, code, jeton, secret, mot de passe, `Authorization`, cookie, signature, IP) et des numéros E.164 et jetons `Bearer` dans les textes ; 0 fuite sur 12 valeurs sensibles, dans la fonction et dans l'enveloppe émise. Note : le SDK joint des lignes de code source autour des piles ; un secret écrit en littéral dans le code y apparaîtrait. Limite : les erreurs HTTP 5xx ne sont **pas** envoyées à Sentry (le filtre global les absorbe, aucun `captureException`) ; seuls les échecs de rendu HD et les erreurs non gérées du processus le sont (A-SEC-7).

## Anomalies

| Id | Gravité | Sous-projet | Anomalie | Statut |
|---|---|---|---|---|
| A-SEC-1 | Majeure | SP00 | Aucun en-tête de sécurité (ni helmet ni équivalent), `X-Powered-By: Express`, réponses authentifiées sans `Cache-Control`. | **Corrigée** : `apps/api/src/common/security-headers.ts` (sans nouvelle dépendance), test `security-hardening.spec.ts`. |
| A-SEC-2 | Mineure | SP00 | Corps > 1 Mo : `500 INTERNAL_ERROR` (erreur body-parser non reconnue par le filtre) au lieu de 413. | **Corrigée** : 413 `VALIDATION_FAILED` (code existant, pas de nouveau code) ; **à ajouter au contrat** : 413. Test Jest. |
| A-SEC-3 | Majeure | SP00 | Scrub Sentry insuffisant (voir §5). | **Corrigée** + test Jest. |
| A-SEC-4 | **Majeure** | SP00 / devops | Pas de `trust proxy` : derrière le reverse proxy, tous les clients ont l'IP du proxy et partagent les compteurs (OTP verify 10/min, OTP request 10/min, connexion admin 20/min, 100/min par route). Mesuré : 12 `X-Forwarded-For` distincts → même compteur. Un pilote à 50 clients (et le CGNAT des opérateurs) provoquera des 429 en série, y compris pour la connexion. | **Ouverte** : propose `app.set('trust proxy', <nombre de proxys>)` configurable par variable (dépend de l'infrastructure), puis relancer `02-rate-limits`. |
| A-SEC-5 | Mineure | SP02 | Limite « 100 req/min par IP » appliquée par route et en mémoire du processus (non partagée entre instances). | Ouverte (stockage Redis du throttler + clé d'IP seule). |
| A-SEC-6 | Mineure | SP00 | `/v1/docs` exposé en production. | Ouverte (désactiver si `NODE_ENV=production` ou protéger). |
| A-SEC-7 | Mineure | SP00 | Les erreurs 5xx ne sont pas envoyées à Sentry ; le worker n'écrit aucun journal quand un job BullMQ échoue (cause de A-COH-1). | Ouverte. |
| A-SEC-8 | Mineure | SP02 | README : « le fournisseur SMS affiche le code dans les journaux » est faux (code jamais journalisé) : aucun moyen de se connecter en recette locale sans SQL. | Ouverte (documentation / outil de recette). |
| A-SEC-9 | Mineure | SP00 | Contrat : ambiguïté `PATCH /admin/price-rules`, `/admin/media/upload` hors tableau, 413 absent, `ACCOUNT_LOCKED` renvoyé dès le 5e échec (cohérent avec « bloqué après 5 échecs »). | Ouverte (lead). |

## Limites

Adaptateurs factices ; pas de test d'intrusion (injection, XSS du back-office, fichiers uploadés malveillants, fuzzing) ni d'audit des dépendances ; TLS et HSTS non testés ; Apple/Google Sign-In non câblés ; TOTP : pas de test de rejeu d'un même code (fenêtre ±1).
