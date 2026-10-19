# Conventions

## Outils

- **Node.js 22 LTS**, **pnpm 9** (workspaces), **TypeScript 5 en mode `strict`** partout.
- Monorepo **Turborepo** ; tâches `lint`, `typecheck`, `test`, `build` déclarées dans `turbo.json`.
- ESLint (config partagée `packages/config`) + Prettier (largeur 100, guillemets simples, point-virgule).
- Validation des entrées : **Zod** (schémas dans `packages/shared`, réutilisés par l'API via un pipe Zod).

## Nommage

| Élément | Convention | Exemple |
|---|---|---|
| Fichiers TS | kebab-case | `order-state-machine.ts` |
| Classes, types | PascalCase | `DesignSpec`, `OrdersService` |
| Variables, fonctions | camelCase | `computeUnitPrice` |
| Tables SQL | snake_case pluriel | `order_items` |
| Colonnes SQL | snake_case | `total_xof` |
| Champs JSON d'API | camelCase | `totalXof` |
| Statuts, enums | snake_case anglais | `in_production` |
| Libellés affichés | français, dans les fichiers de traduction | `"En production"` |

Les libellés français ne sont **jamais** en dur dans les composants : ils vivent dans
`apps/mobile/src/i18n/fr.ts` et `apps/admin/src/i18n/fr.ts` (clé anglaise → texte français).

## Argent, téléphone, dates

- Montant : `number` entier, suffixe `Xof`. Utilitaires `formatXof(12000) → "12 000 FCFA"` dans `packages/shared/money`.
- Téléphone : `normalizeTgPhone("90 12 34 56") → "+22890123456"` ; refuser tout ce qui n'a pas 8 chiffres après +228.
- Date : `Date`/ISO UTC en interne ; formatage via `Intl.DateTimeFormat('fr-FR', { timeZone: 'Africa/Lome' })`.

## Erreurs

- L'API renvoie toujours `{ "error": { "code": "ORDER_NOT_PAYABLE", "message": "…", "details": {…} } }`.
- `code` en SCREAMING_SNAKE_CASE anglais, stable, documenté dans `contrat-api.md`.
- `message` en français, compréhensible par l'utilisateur final.

## Tests

| Couche | Outil | Exigence |
|---|---|---|
| `packages/shared` | Vitest | 100 % des fonctions de prix, de la machine à états et des schémas couverts par des cas limites |
| API | Jest (Nest) + Supertest + PostgreSQL de test (Docker) | Chaque route : cas nominal, validation refusée, droits refusés. Paiement, stock et statuts : tests d'intégration obligatoires |
| Mobile | Jest + React Native Testing Library | Logique d'écran et hooks ; le studio teste la sérialisation du `DesignSpec` |
| Back-office | Vitest + Testing Library ; Playwright pour 3 parcours clés | Filtres, changement de statut, affectation |
| Bout en bout | Maestro (mobile), Playwright (admin) | Géré par SP12 |

Les appels externes (agrégateur, SMS, Cloudinary, push) passent par une interface et un
adaptateur ; les tests utilisent l'adaptateur factice, jamais le vrai service.

## Git

- Branche par sous-projet `sp<NN>-<slug>`, issue de `main`.
- Conventional Commits : `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, avec la portée (`api`, `mobile`, `admin`, `shared`, `infra`).
- PR : titre court, description = stories couvertes + comment tester + captures pour l'UI.
- Pas de `force-push` sur une branche partagée ; pas de fusion avec CI rouge.

## Définition de terminé (pour chaque story)

- [ ] Critères d'acceptation de `backlog.md` vérifiés.
- [ ] Tests écrits et verts ; `pnpm lint && pnpm typecheck && pnpm test` passent.
- [ ] Route API documentée (OpenAPI généré par Nest) et conforme à `contrat-api.md`.
- [ ] Textes en français dans les fichiers i18n, relus.
- [ ] Écran testé sur un Android à 2 Go de RAM (ou émulateur équivalent) pour le mobile.
- [ ] Aucun secret ajouté ; nouvelles variables décrites dans `.env.example`.
- [ ] Compte rendu rédigé selon `delegation.md`.
