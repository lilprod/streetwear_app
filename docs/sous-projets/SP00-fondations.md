# SP00 — Fondations du monorepo, CI et environnements

| | |
|---|---|
| **Agent** | `devops` |
| **Vague** | 0 (premier sous-projet, bloque tous les autres) |
| **Dépend de** | — |
| **Débloque** | Tous les sous-projets |
| **Durée indicative** | 4 jours |

## Objectif

Un dépôt qui s'installe, se lance et se teste en une commande, avec une CI qui protège `main`.
Aucune fonctionnalité métier : seulement le squelette sur lequel les autres agents construisent.

## Lire d'abord

`CLAUDE.md`, `docs/conventions.md`, `docs/architecture.md` (stack, environnements), `docs/decisions.md` (ADR-001, ADR-002).

## À faire

1. **Monorepo** : `pnpm-workspace.yaml`, `turbo.json` (tâches `build`, `dev`, `lint`, `typecheck`, `test`), `package.json` racine avec les scripts de `CLAUDE.md`, `.nvmrc` (22), `.editorconfig`, `.gitignore`.
2. **`packages/config`** : configuration ESLint (flat config, TypeScript strict, React, React Native), `tsconfig.base.json` (`strict`, `noUncheckedIndexedAccess`), Prettier (largeur 100, guillemets simples).
3. **`packages/shared`** : paquet TypeScript vide exportant `src/index.ts`, Vitest configuré, un test d'exemple.
4. **`packages/ui-tokens`** : paquet vide exportant un objet `tokens` (rempli par SP11).
5. **`apps/api`** : NestJS minimal, deux points d'entrée `src/main.ts` (HTTP, préfixe `/v1`) et `src/worker.ts` (BullMQ, aucune file encore) ; validation des variables d'environnement par Zod au démarrage ; journaux Pino ; OpenAPI sur `/v1/docs` ; `GET /v1/health` → `{ status: "ok", db: "ok", redis: "ok" }` ; format d'erreur `{ error: { code, message } }` via un filtre global ; Prisma initialisé avec le modèle `Setting` uniquement.
6. **`apps/admin`** : Vite + React 18 + TypeScript + Tailwind + React Router ; page d'accueil vide « Back-office » ; Vitest.
7. **`apps/mobile`** : Expo (dernière SDK stable) + Expo Router + TypeScript ; écran vide « Accueil » ; Jest ; `eas.json` avec profils `development`, `preview`, `production`.
8. **`docker-compose.yml`** : PostgreSQL 16 et Redis 7 avec volumes ; base de test séparée.
9. **`.env.example`** à la racine et par application : chaque variable commentée (aucune valeur réelle).
10. **CI GitHub Actions** (`.github/workflows/ci.yml`) : installation avec cache pnpm, `lint`, `typecheck`, `test` (service PostgreSQL + Redis), `build` ; uniquement sur ce qui a changé (Turborepo).
11. **Qualité de commit** : Husky + lint-staged (Prettier, ESLint sur les fichiers modifiés), commitlint (Conventional Commits).
12. **Sentry** : initialisation dans les trois applications, désactivée si `SENTRY_DSN` est vide ; masquage des champs `phone`, `address`, `landmark`.
13. Mettre à jour la section « Commandes » de `CLAUDE.md` si une commande diffère.

## Hors périmètre

Modèles métier, écrans, déploiement en recette/production (fait par SP12 avec le lead).

## Critères d'acceptation

- [ ] Sur un clone neuf : `pnpm install && docker compose up -d && pnpm dev` démarre l'API (port 3000) et le back-office (port 5173).
- [ ] `curl localhost:3000/v1/health` renvoie 200 avec `db` et `redis` à `ok`.
- [ ] `pnpm lint && pnpm typecheck && pnpm test` passent à la racine.
- [ ] `pnpm --filter mobile start` ouvre Expo sans erreur.
- [ ] La CI passe sur la PR et échoue si un test échoue (vérifié avec un test volontairement cassé, puis retiré).
- [ ] L'API refuse de démarrer avec un message clair si une variable obligatoire manque.

## Livrables

Le squelette complet, `CLAUDE.md` à jour, le compte rendu de `docs/delegation.md`.

## Prompt de délégation

```
Tu es l'agent devops du projet Streetwear App. Réalise le sous-projet SP00 décrit dans
docs/sous-projets/SP00-fondations.md. Lis d'abord CLAUDE.md, docs/conventions.md,
docs/architecture.md et docs/decisions.md. Travaille sur la branche sp00-fondations.
N'ajoute aucune logique métier. Vérifie chaque critère d'acceptation en exécutant
réellement les commandes. Termine par le compte rendu au format de docs/delegation.md.
```
