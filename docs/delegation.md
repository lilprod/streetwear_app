# Plan de délégation aux sous-agents

Le projet est découpé en **13 sous-projets** (SP00 à SP12). Chaque sous-projet a une fiche dans
`docs/sous-projets/` qui contient tout ce qu'un sous-agent doit savoir, et se termine par un
**prompt de délégation** prêt à copier. Les sous-agents sont définis dans `.claude/agents/`.

## Sous-projets

| SP | Nom | Agent | Vague | Dépend de | Stories |
|---|---|---|---|---|---|
| SP00 | Fondations du monorepo, CI, environnements | `devops` | 0 | — | socle |
| SP01 | Package partagé : `DesignSpec`, prix, machine à états, utilitaires | `dev-backend` | 0 | SP00 | US-13, socle |
| SP02 | API Auth, comptes, équipe, réglages, audit | `dev-backend` | 1 | SP00, SP01 | US-01, 02, 08, 32 |
| SP03 | API Catalogue, designs, médias, modération | `dev-backend` | 1 | SP00, SP01 | US-03, 10, 11, 27, 31 |
| SP06 | API Livraison, zones, livreurs, boutiques, créneaux | `dev-backend` | 1 (après fusion de SP02) | SP00, SP01, SP02 | US-21, 22, 28, 29 |
| SP09 | Mobile : studio de design (Skia) | `dev-mobile` | 1 | SP01 | US-04 à 07, 09, 10, 11 |
| SP04 | API Panier, commandes, stock | `dev-backend` | 2 | SP02, SP03, SP06 | US-14, 17 à 20, 23, 25, 30 |
| SP05 | API Paiement : agrégateur, webhooks, rapprochement | `integrateur-paiement` | 2 | SP04 | US-15 à 18, 34 |
| SP07 | Notifications push et SMS | `dev-backend` | 2 | SP04 | US-24, 30 |
| SP08 | Production : rendu HD, fiches, opérateurs | `dev-backend` | 2 | SP01, SP03, SP04 | US-12, 26 |
| SP10 | Mobile : parcours d'achat et compte | `dev-mobile` | 2 | SP09 + contrats SP02 à SP06 | US-01, 03, 08, 13 à 24, 27 |
| SP11 | Back-office web et vue livreur | `dev-backoffice` | 1 → 3 | SP00, SP01 ; routes admin au fil de l'eau | US-02, 25, 26, 28 à 34 |
| SP12 | QA, tests bout en bout, performance, recette | `qa-recette` | 3 | Tout | Tout |

## Vagues et parallélisme

```
Vague 0 (séquentiel, 2 semaines)   SP00 ──► SP01
Vague 1 (parallèle)                SP02 · SP03 · SP09 · SP11 lot A ; puis SP06 dès SP02 fusionné
Vague 2 (parallèle)                SP04 ──► SP05, SP07, SP08 ; SP10 (sur maquettes de données, puis API réelle)
Vague 3                            SP11 (modules restants) · SP12 · corrections
```

- Le mobile (SP09, SP10) et le back-office (SP11) n'attendent pas l'API : ils codent contre
  `docs/contrat-api.md` avec des données simulées (MSW côté web, un faux client côté mobile),
  puis branchent l'API réelle dès qu'elle est en recette.
- Deux sous-agents ne modifient jamais le même module en même temps. Les seuls fichiers
  partagés (`packages/shared`, `schema.prisma`, `contrat-api.md`) sont modifiés par le
  propriétaire indiqué ci-dessous.

## Propriété des fichiers partagés

| Fichier ou dossier | Propriétaire | Les autres… |
|---|---|---|
| `docs/contrat-api.md` | Lead (session principale) | proposent un changement dans leur compte rendu |
| `packages/shared/src/design-spec`, `pricing`, `order-state-machine` | SP01 | ouvrent une demande de changement |
| `apps/api/prisma/schema.prisma` | Chaque SP pour **ses** modèles (voir `modele-donnees.md`) | ne touchent pas les modèles d'un autre SP ; une migration par PR |
| `packages/ui-tokens` | SP11 (création), puis designer | consomment |
| `.github/workflows`, `turbo.json`, `docker-compose.yml` | SP00 | demandent l'ajout d'une tâche |

## Comment déléguer (session principale)

1. Choisir le sous-projet dont toutes les dépendances sont livrées.
2. Ouvrir sa fiche `docs/sous-projets/SPxx-*.md`, compléter la section « Contexte du moment » si besoin (décisions récentes, agrégateur choisi…).
3. Lancer l'agent indiqué avec le **prompt de délégation** de la fiche.
4. À réception du compte rendu : relire, faire tourner `pnpm lint && pnpm typecheck && pnpm test`, valider les propositions de changement de contrat, fusionner.
5. Mettre à jour le tableau d'état ci-dessous.

## Compte rendu attendu de chaque sous-agent

Chaque sous-agent termine sa mission par ce message, et rien d'autre :

```
## Compte rendu SPxx — <nom>
**Statut :** terminé | partiel | bloqué
**Stories livrées :** US-xx (critères vérifiés : oui/non, lesquels manquent)
**Fichiers principaux :** liste courte
**Commandes vérifiées :** lint ✅/❌ · typecheck ✅/❌ · test ✅/❌ (nombre de tests)
**Écarts au contrat d'API :** aucun | liste (route, champ, raison) — à valider par le lead
**Décisions prises seul :** liste avec la raison
**Reste à faire / blocages :** liste
**Comment vérifier :** 3 à 5 étapes reproductibles
```

## État des sous-projets

| SP | État | Branche | Dernier compte rendu |
|---|---|---|---|
| SP00 | À faire | | |
| SP01 | À faire | | |
| SP02 | À faire | | |
| SP03 | À faire | | |
| SP04 | À faire | | |
| SP05 | À faire | | |
| SP06 | À faire | | |
| SP07 | À faire | | |
| SP08 | À faire | | |
| SP09 | À faire | | |
| SP10 | À faire | | |
| SP11 | À faire | | |
| SP12 | À faire | | |
