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
| **Correctif démarrage API (devops)** | **Bloquant : l'API compilée ne démarre pas hors Jest (voir plus bas)** |
| **SP05 → SP07** | **Prochaine étape, un par un** |
| SP10 Parcours mobile, SP11 lot C | Ensuite, en parallèle |
| SP12 QA et recette | En dernier |

Dernière vérification (base neuve) : API 288, shared 88, admin 72, mobile 18 tests, tout vert.
Branche unique autorisée : `ccr-beb850b2-5rmap5` (ne jamais pousser ailleurs).

## Procédure de délégation qui marche dans ce conteneur

1. Lancer l'agent avec `isolation: "worktree"` et `run_in_background: true` ; prompt court qui renvoie à la fiche `docs/sous-projets/SPxx-*.md`.
2. Dans le prompt, toujours préciser :
   - commits Conventional Commits en anglais, jamais de préfixe `merge:` (commitlint le refuse), avec les deux lignes `Co-Authored-By` / `Claude-Session` de la session ;
   - pas de push ; ne pas modifier `docs/` (le lead met le contrat à jour) ;
   - bases PostgreSQL dédiées `streetwear_spXX` et `streetwear_spXX_test` + une base Redis dédiée (numéros déjà pris : 1 à 9 ; SP05 prend 10) via `apps/api/.env` non commité (`TEST_DATABASE_URL`, `TEST_REDIS_URL`) ;
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
- SP05 doit émettre `order.status_changed` après le commit (`runInTransaction`).
- Les fiches SP05, SP07, SP08 contiennent une section « Laissé par SP04 » avec ce qu'il faut brancher.

## Points ouverts après SP11 lot B

- **API non démarrable hors tests** : `node dist/main.js` échoue (`ERR_UNSUPPORTED_DIR_IMPORT` sur `packages/shared/src/design-spec`) car `packages/shared` expose ses sources TypeScript. Jest masque le problème. À confier à `devops` : compiler `shared` en JS (exports vers `dist`) et vérifier `pnpm dev`, `start` et `start:worker`. Bloque la recette (SP12) et la mise en ligne.
- Routes manquantes demandées par le back-office (lot backend à faire, puis contrat) : `GET /admin/operators` (aujourd'hui l'opérateur est l'utilisateur connecté), `GET /admin/production/queue`, compteurs par statut (`/admin/stats/summary` n'existe pas encore).
- Contrat à aligner sur l'API réelle : champs `receptionType`, `customer`, `statusHistory`, `allowedTransitions`, `vatIncludedXof` des réponses `/admin/orders*` ; erreur du mauvais code de retrait.
- `ORDER_NOT_PRODUCIBLE` et `OPERATOR_INVALID` à ajouter à `ERROR_CODES` de `packages/shared` avec leurs textes français.
- Détail commande admin sans opérateur, état des fichiers HD, livreur ni paiements : préconditions vérifiées seulement par l'API.

## Modèles des agents

`taches-simples` haiku · `devops`, `dev-backend`, `dev-mobile`, `dev-backoffice`, `qa-recette` sonnet · `integrateur-paiement` opus · SP04 a tourné en opus · SP11 lot C et le plan de test SP12 en haiku. Consommation des agents à ce jour : environ 1,25 million de tokens.

## Bloquants côté client (inchangés)

Agrégateur de paiement et identifiants de test, fournisseur SMS, prix (8 500 / 1 500 / 1 000 FCFA en hypothèse), charte graphique, 30 motifs avec droits, mots interdits en éwé, zones de livraison réelles, un Android 2 Go pour tester le studio. Jamais vérifiés ici : CI GitHub et Docker (aucune PR ouverte).

## Documents hors dépôt

- Cahier des charges : https://claude.ai/artifact/LhzEXkHqtukaopLk7eKF8r
- Cadrage phase 0 : https://claude.ai/artifact/VYsdqB4TxZoff3UVujFLGi
- Maquettes : https://claude.ai/artifact/DwfVQAQ3uW3zkYS94h916p
