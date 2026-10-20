# Streetwear App — t-shirts personnalisés aux motifs pagne (Togo)

Application mobile (Android d'abord, iOS) et back-office web d'une marque streetwear togolaise :
le client compose un t-shirt avec des motifs pagne, paie en T-Money, Flooz, carte ou à la
livraison, et la marque produit (impression DTF) puis livre à Lomé ou en retrait boutique.

Ce fichier est lu par **tous** les agents. Lisez ensuite `docs/README.md`, puis la fiche de
votre sous-projet dans `docs/sous-projets/`.

## Règles non négociables

1. **Langue :** toute l'interface, les notifications, les messages d'erreur visibles et les
   documents sont en **français**. Le code (identifiants, commits) est en anglais.
2. **Argent :** montants en **entiers XOF** (franc CFA, pas de centimes), champs suffixés
   `Xof` (`totalXof`). Jamais de `float`. Affichage `12 000 FCFA` (espace fine insécable).
3. **Téléphone :** stocké en E.164 (`+22890123456`), affiché `+228 90 12 34 56`.
4. **Dates :** stockées en UTC ISO 8601 ; affichées en `Africa/Lome` (UTC+0, pas d'heure d'été).
5. **Le design est un document JSON** (`DesignSpec`, voir `docs/spec-design.md`) validé par le
   schéma Zod de `packages/shared`. Le mobile, l'API et le rendu HD utilisent ce même schéma.
6. **Le prix est calculé par `packages/shared/pricing`.** L'API est la source de vérité ; le
   mobile affiche le même calcul. Ne recodez jamais une règle de prix ailleurs.
7. **Une commande n'entre en production qu'après confirmation du paiement par webhook**
   de l'agrégateur, jamais sur la seule réponse de l'application.
8. **Le contrat d'API (`docs/contrat-api.md`) appartient au lead technique.** Un sous-agent
   qui a besoin d'une nouvelle route ou d'un champ le propose dans son compte rendu ; il ne
   modifie pas le contrat seul.
9. **Secrets :** jamais dans le code ni dans les commits. `.env.example` documente chaque variable.
10. **Pas de test désactivé ou ignoré** pour obtenir une CI verte.

## Organisation du dépôt (cible)

```
apps/
  api/        API NestJS + worker BullMQ (deux points d'entrée : main.ts, worker.ts)
  mobile/     Application Expo (React Native) — client
  admin/      Back-office React + Vite (inclut la vue livreur web mobile)
packages/
  shared/     Schémas Zod (DesignSpec, DTO), machine à états commande, calcul de prix, utilitaires
  ui-tokens/  Jetons de design (couleurs, typo, rayons) communs au mobile et au back-office
  config/     Configurations ESLint, TypeScript, Prettier partagées
docs/         Documentation de référence (voir docs/README.md)
.claude/agents/  Définitions des sous-agents
```

## Commandes (à créer par SP00, à garder à jour)

```
pnpm install            # installe tout le monorepo
pnpm dev                # lance api + admin (+ docker compose postgres/redis)
pnpm lint               # ESLint sur tout le dépôt
pnpm typecheck          # tsc --noEmit partout
pnpm test               # tests unitaires et d'intégration
pnpm --filter api prisma migrate dev
pnpm --filter mobile start
```

## Façon de travailler

- Une branche par sous-projet : `sp<NN>-<slug>` (ex. `sp05-paiement`). Une PR par lot cohérent.
- Commits au format Conventional Commits en anglais (`feat(api): add OTP request endpoint`).
- Avant de pousser : `pnpm lint && pnpm typecheck && pnpm test` doivent passer.
- Toute story livrée respecte la « définition de terminé » de `docs/conventions.md`.
- En fin de mission, chaque sous-agent rend le compte rendu décrit dans `docs/delegation.md`.
- **Économie de tokens :** concision, aucune narration, lectures ciblées, sorties de commandes
  tronquées, tests ciblés avant la suite complète. Modèle par sous-projet et règles d'escalade :
  `docs/delegation.md`, section « Choix du modèle ».
