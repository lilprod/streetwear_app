# Streetwear App — t-shirts personnalisés aux motifs pagne (Togo)

Application mobile (Android d'abord, iOS) et back-office web d'une marque streetwear togolaise :
le client compose son t-shirt avec des motifs pagne dans un studio, paie en T-Money, Flooz, carte
ou à la livraison (acompte), puis la marque imprime (DTF) et livre à Lomé ou en retrait boutique.

## État du projet

Les sous-projets SP00 à SP11 sont terminés et fusionnés ; la recette (SP12) est en cours. Suivi
détaillé : [`docs/delegation.md`](docs/delegation.md) (tableau d'état) et
[`docs/reprise-lead.md`](docs/reprise-lead.md) (décisions, points ouverts).

| Partie            | Contenu                                                                                                                                                            | Tests |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----- |
| `apps/api`        | API NestJS + worker BullMQ : comptes et OTP, catalogue, designs, panier, commandes et stock, paiement, livraison et retrait, production et rendu HD, notifications | 415   |
| `apps/admin`      | Back-office React : commandes, production, livraisons et vue livreur, retrait, stock, catalogue, paiements, équipe, réglages, tableau de bord                      | 167   |
| `apps/mobile`     | Application Expo : studio de design, panier, livraison ou retrait, paiement, suivi, compte                                                                         | 177   |
| `packages/shared` | Schémas Zod (DesignSpec, contrats), machine à états des commandes, calcul des prix                                                                                 | 96    |

Pas encore branché en réel (adaptateurs factices en place) : agrégateur de paiement, fournisseur
SMS, Cloudinary, notifications push (projet EAS et Firebase), carte Google Maps sur Android.
Jamais vérifié sur un vrai téléphone. Liste complète des bloquants : `docs/reprise-lead.md`.

## Démarrer en local

Prérequis : Node 22, Docker (PostgreSQL 16 et Redis 7).

```bash
corepack enable                          # active pnpm 9 (version épinglée)
pnpm install                             # monorepo + client Prisma
docker compose up -d                     # PostgreSQL (streetwear, streetwear_test) + Redis
cp apps/api/.env.example apps/api/.env   # renseigner JWT_SECRET et FAKE_PAYMENT_WEBHOOK_SECRET
                                         # (openssl rand -hex 32 pour chacun)
pnpm --filter api prisma migrate deploy
pnpm --filter api db:seed:demo           # jeu de démonstration (jamais en production)
pnpm dev                                 # API :3000 + back-office :5173
pnpm --filter api dev:worker             # worker (rendu HD, notifications, expiration, rapprochement)
pnpm --filter mobile start               # application mobile (Expo)
```

- Santé de l'API : `curl localhost:3000/v1/health` ; documentation OpenAPI : `/v1/docs`.
- Comptes de démonstration (back-office et clients) : [`apps/api/README.md`](apps/api/README.md).
- Le back-office appelle l'API sur la même origine (`/v1`, relayé par Vite en local, par le
  reverse proxy en recette et production) : l'API n'active pas CORS.
- Sans backend : back-office avec `VITE_USE_MSW=true` ([`apps/admin/README.md`](apps/admin/README.md)),
  mobile avec `EXPO_PUBLIC_API_MODE=mock`.

## Vérifier

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

Les tests de l'API exigent PostgreSQL et Redis ; ils utilisent `TEST_DATABASE_URL` et
`TEST_REDIS_URL` (par défaut la base `streetwear_test` et Redis base 1, comme la CI). La CI
(GitHub Actions) lance la même suite et démarre l'API compilée pour interroger `/v1/health`.

## Règles du projet

Les règles non négociables (français partout, montants en entiers XOF, téléphone E.164, dates
UTC affichées à Lomé, prix calculés uniquement par `packages/shared`, production seulement après
confirmation du paiement par l'agrégateur, secrets hors du dépôt) sont dans
[`CLAUDE.md`](CLAUDE.md). Conventions de code, Git et définition de terminé :
[`docs/conventions.md`](docs/conventions.md).

## Documentation

Index et ordre de lecture : [`docs/README.md`](docs/README.md) — cahier des charges, architecture,
modèle de données, contrat d'API, format des designs, design system, backlog, fiches des
sous-projets et documents de recette.
