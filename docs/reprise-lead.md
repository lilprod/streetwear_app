# Note de reprise — session principale (lead)

À lire en premier par une nouvelle session qui reprend la coordination du projet.
Mise à jour : 08/11/2026, après la fusion de SP11 lot B.

## État

| SP | État |
|---|---|
| SP00 Fondations, SP01 Code partagé | Fusionnés |
| SP02 Auth/comptes, SP03 Catalogue/designs | Fusionnés (intégrés ensemble) |
| SP06 Livraison/retrait | Fusionné |
| SP04 Panier/commandes/stock | Fusionné |
| SP08 Production/rendu HD | Fusionné |
| SP09 Studio mobile | Fusionné (mode mock ; jamais testé sur appareil) |
| SP11 lots A et B (coquille, commandes, production) | Fusionnés |
| Correctif démarrage API, routes admin complémentaires | Fusionnés |
| Reprise back-office sur les nouvelles routes | Fusionnée |
| SP05 Paiement (adaptateur `fake`) | Fusionné ; agrégateur réel après le comité du 13/11 |
| SP07 Notifications | Fusionné (SMS `console`, push `fake`/Expo, e-mail `fake`/SMTP) |
| SP10 lot A (navigation, connexion, taille, panier) | Fusionné |
| **SP10 lot B (réception, paiement, suivi, notifications, compte), SP11 lot C** | **Prochaine étape, en parallèle** |
| SP12 QA et recette | En dernier |

Dernière vérification (base neuve) : API 392, shared 91, admin 97, mobile 108, mobile 18 tests, tout vert.
Branche unique autorisée : `ccr-beb850b2-5rmap5` (ne jamais pousser ailleurs).

## Procédure de délégation qui marche dans ce conteneur

1. Lancer l'agent avec `isolation: "worktree"` et `run_in_background: true` ; prompt court qui renvoie à la fiche `docs/sous-projets/SPxx-*.md`.
2. Dans le prompt, toujours préciser :
   - commits Conventional Commits en anglais, jamais de préfixe `merge:` (commitlint le refuse), avec les deux lignes `Co-Authored-By` / `Claude-Session` de la session ;
   - pas de push ; ne pas modifier `docs/` (le lead met le contrat à jour) ;
   - bases PostgreSQL dédiées `streetwear_spXX` et `streetwear_spXX_test` + une base Redis dédiée (Redis n'a que les bases 0 à 15, toutes prises : chaque nouvel agent lance son propre Redis sur un port dédié, ex. `redis-server --port 6391 --daemonize yes` hors du dépôt, et utilise sa base 0) via `apps/api/.env` non commité (`TEST_DATABASE_URL`, `TEST_REDIS_URL`) ;
   - pas de Docker : `service postgresql start` et `redis-server --daemonize yes` si arrêtés ;
   - jamais `prisma migrate reset` (refusé sans consentement de l'utilisateur) : `DROP SCHEMA public CASCADE; CREATE SCHEMA public;` puis `migrate deploy` sur sa propre base ;
   - vérification finale `pnpm turbo run lint typecheck test build --force`.
3. À la réception du compte rendu : trancher les écarts (le lead seul édite `docs/contrat-api.md`, `docs/modele-donnees.md`), renvoyer l'agent corriger par `SendMessage` s'il manque quelque chose (il garde son contexte).
4. Fusion dans la session principale :

```bash
cd /home/user/streetwear_app
git merge --no-ff --no-commit <branche-worktree>
pnpm install --frozen-lockfile
export PGPASSWORD=streetwear
dropdb -h localhost -U streetwear --if-exists streetwear_main_test
createdb -h localhost -U streetwear streetwear_main_test
TEST_DATABASE_URL=postgresql://streetwear:streetwear@localhost:5432/streetwear_main_test \
TEST_REDIS_URL=redis://localhost:6379/5 \
pnpm turbo run lint typecheck test build --force --env-mode=loose
git commit   # message "chore: merge SPxx ..." + lignes de session
git push -u origin ccr-beb850b2-5rmap5
```

5. Mettre à jour le tableau d'état de `docs/delegation.md` et cette note.

Pour une fusion qui touche plusieurs branches API en même temps (schéma Prisma, migrations), confier l'intégration à un agent `dev-backend` dédié dans un worktree, comme pour SP02 + SP03.

## Décisions du lead à respecter

- `super_admin` peut faire toute transition d'équipe, jamais celles réservées à `provider`, `system` ou `customer`.
- Les transitions liées au type de réception exigent `context.receptionType`.
- Connexion admin : `AdminLoginResult` (`session` ou `totp_required`), session 8 h max, utilisateur lu dans `AdminSession.user`.
- Profil livreur créé automatiquement avec un compte `courier` (téléphone obligatoire).
- Retrait : la logistique saisit le code du client pour passer en « Livrée » (5 essais).
- `payment_failed → expired` par le système, libère stock et créneau.
- `POST /designs` accepte un `Idempotency-Key` optionnel ; `GET /catalog/banned-words` public.
- SP08 : déclenché par `order.status_changed` vers `paid`/`deposit_paid` ; émet `production.render_failed` (SP07 doit notifier) ; `print_file_*_url` contient une clé de stockage, l'URL signée est générée à la demande ; prod : `STORAGE_PROVIDER=s3`.
- SP05 : `order.status_changed` émis après le commit (prouvé par test : webhook → job de production). Confirmation possible par webhook signé ou par `getStatus` de l'agrégateur (filet du webhook perdu, après 60 s), jamais par l'application.
- SP05 : `FAKE_PAYMENT_WEBHOOK_SECRET` (≥ 32 caractères) obligatoire hors production, sinon l'API refuse de démarrer ; le `fake` est refusé en production, qui ne démarrera qu'avec l'adaptateur réel. Un adaptateur réel = une classe dans `payments/providers/` + `providers.factory.ts` + `.env.example`.
- SP07 : les codes de retrait et de remise sont réémis par le worker `notifications` au passage en `ready_for_pickup` / `shipped` (nouveau hachage, tentatives remises à 0), chiffrés AES-256-GCM dans la charge du job (`NOTIFICATION_CODE_KEY`, obligatoire en production), jamais en clair en base, dans Redis ni dans les journaux. Le code affiché à la création est donc remplacé : le mobile (SP10) doit afficher le dernier code reçu par push/SMS, pas celui de la création.
- SP07 : `order.created` n'envoie rien ; au plus un push et un SMS par (commande, statut) ; alertes équipe par e-mail selon le rôle.
- Variables d'environnement SP07 : `BRAND_NAME`, `NOTIFICATION_CODE_KEY`, `PUSH_PROVIDER`, `EXPO_ACCESS_TOKEN`, `EMAIL_PROVIDER`, `SMTP_URL`, `EMAIL_FROM`. Relation Prisma `Payment → Order` déclarée (plus de dérive de schéma).
- Les fiches SP05, SP07, SP08 contiennent une section « Laissé par SP04 » avec ce qu'il faut brancher.

## Points ouverts après SP11 lot B

- Corrigé le 08/11 : l'API et le worker compilés démarrent (`packages/shared` compilé en CommonJS dans `dist`, chargé seulement par `require` Node ; Vite, Jest et Metro gardent les sources). La CI démarre l'API compilée et interroge `/v1/health`. Tout nouveau paquet chargé par l'API à l'exécution suit le même schéma.
- Ajouté le 08/11 : `GET /admin/operators`, `GET /admin/production/queue`, `GET /admin/orders/counts`, détail admin enrichi (`production`, `delivery`, `payments`), `ERROR_CODES` complet et types admin dans `packages/shared`.
- Fait le 08/11 : le back-office utilise ces routes (choix et réaffectation d'opérateur, file de production, compteurs, blocs production/livraison/paiements, préconditions fichiers HD et livreur) ; vérifié par Playwright contre l'API compilée (connexion TOTP → commandes → détail → affectation).
- **Décision : pas de CORS.** Le back-office et l'API sont servis sur la même origine (reverse proxy en recette et production ; proxy Vite `/v1` en local, `API_PROXY_TARGET`). `VITE_API_URL` vide par défaut.
- Lot C : l'affectation d'un livreur (route SP06 existante) débloquera « Expédier » ; le fil d'Ariane du détail affiche l'UUID au lieu du numéro ; les champs date suivent la langue du navigateur.
- Le seed ne crée aucune commande : à prévoir pour la recette (SP12).
- SP05 : remplir `payments[]` du détail admin et faire reposer `paidAt` de la file de production sur le paiement (aujourd'hui : première entrée `paid`/`deposit_paid` de l'historique).
- `AdminStockItem.size` est typé `string` dans `stock.service.ts` au lieu de `Size` (à corriger au passage).
- Tests de rendu HD : délai porté à 30 s (rendus réels gourmands en CPU sous Turborepo). Les tests admin `orders.test.tsx` ont aussi dépassé 5 s chez un agent sous charge : à surveiller.

## Points ouverts après SP10 lot A

- Mobile : un visiteur garde un panier local (MMKV), synchronisé à la connexion (`syncGuestCartToAccount`) car `/designs` et `/cart` exigent un compte.
- Mobile : typecheck avec `apps/mobile/tsconfig.typecheck.json`, qui force les types React 19 du mobile (pnpm peut remonter ceux de l'admin, React 18). Pas de `paths` dans `tsconfig.json` : jest-expo les transforme en moduleNameMapper.
- Lot B : réception (carte, zones, créneaux ; aucun créneau de retrait dans le seed), paiement (`Idempotency-Key`, attente 3 s / 2 min), suivi (afficher le dernier code reçu par push/SMS), `POST /me/push-tokens`, compte (adresses, designs, suppression), Google Sign-In (`setSocialProvider`). Points d'accroche : `ApiClient` dans `src/api/{types,http,mock}.ts`, `src/auth/session.ts`, `src/features/cart/store.ts`, `app/purchase/*.tsx`.
- Le nom d'un brouillon n'est pas envoyé par la synchronisation SP09 (`sync.ts`) : « Design sans nom » côté serveur (à corriger au lot B).
- Script de vérification réelle : `apps/api/node_modules/.bin/tsx apps/mobile/scripts/verify-real-api.ts` (15 vérifications) ; bundle Android Hermes 6,9 Mo.
- Jamais vérifié : appareil Android 2 Go, iPhone, lecteurs d'écran, remplissage SMS natif.

## Modèles des agents

`taches-simples` haiku · `devops`, `dev-backend`, `dev-mobile`, `dev-backoffice`, `qa-recette` sonnet · `integrateur-paiement` opus · SP04 a tourné en opus · SP11 lot C et le plan de test SP12 en haiku. Consommation des agents à ce jour : environ 1,25 million de tokens.

## Bloquants côté client (inchangés)

Agrégateur de paiement et identifiants de test, fournisseur SMS, prix (8 500 / 1 500 / 1 000 FCFA en hypothèse), charte graphique, 30 motifs avec droits, mots interdits en éwé, zones de livraison réelles, un Android 2 Go pour tester le studio. Jamais vérifiés ici : CI GitHub et Docker (aucune PR ouverte).

## Documents hors dépôt

- Cahier des charges : https://claude.ai/artifact/LhzEXkHqtukaopLk7eKF8r
- Cadrage phase 0 : https://claude.ai/artifact/VYsdqB4TxZoff3UVujFLGi
- Maquettes : https://claude.ai/artifact/DwfVQAQ3uW3zkYS94h916p
