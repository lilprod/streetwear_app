# SP11 — Back-office web et vue livreur

| | |
|---|---|
| **Agent** | `dev-backoffice` |
| **Modèle** | `sonnet` pour les lots A et B ; **`haiku`** pour le lot C |
| **Vague** | 1 (coquille, jetons, connexion) → 3 (modules restants) |
| **Dépend de** | SP00, SP01 ; chaque module dépend des routes admin de son SP |
| **Débloque** | SP12 (tests Playwright), formation de l'équipe |
| **Stories** | US-02, US-25, US-26, US-28 à US-34 |
| **Durée indicative** | 12 jours, en trois lots |

## Objectif

L'outil quotidien de l'équipe : voir les commandes du jour, produire, livrer, tenir le stock et
le catalogue, avec un accès limité à ce que chaque rôle doit faire.

## Lire d'abord

`CLAUDE.md`, `docs/contrat-api.md` (routes admin et livreur), `docs/design-system.md`,
`docs/cahier-des-charges.md` (rôles), `docs/modele-donnees.md` (machine à états), et les deux
écrans back-office du canevas de maquettes.

## Lots

### Lot A — vague 1 (sans attendre les routes métier)

1. **`packages/ui-tokens`** : jetons de `docs/design-system.md` exportés en TypeScript et en preset Tailwind (utilisés aussi par le mobile).
2. **Coquille** : en-tête (marque, rôle, avatar), navigation par modules filtrée par rôle, mise en page fluide (≥ 768 px), pages 403 et 404, fil d'Ariane.
3. **Connexion** : e-mail + mot de passe → TOTP → enrôlement au premier login ; session 8 h ; déconnexion.
4. **Client API** : TanStack Query, types de `packages/shared/contracts`, gestion des erreurs `{ error }` avec messages français ; **MSW** avec `packages/shared/fixtures` pour développer sans API.
5. **Composants** : `StatusBadge`, `DataTable` (TanStack Table, tri, pagination par curseur, état vide), `FilterBar`, `KpiCard`, `ConfirmDialog`, `Toast`.

### Lot B — vague 2/3 (dès que SP04, SP08 sont en recette)

6. **Commandes** (US-25) : liste avec filtres (onglets de statut avec compteurs, réception, paiement, dates, recherche), détail (aperçus, articles, client, réception, paiement, historique), boutons de transition limités à `allowedTransitions(statut, rôle)` de SP01, annulation avec confirmation.
7. **Production** (US-26) : file « à produire aujourd'hui », affectation d'un opérateur, téléchargement des fichiers HD, régénération, impression de la fiche PDF.

### Lot C — vague 3

8. **Livraisons** (US-28) : courses du jour, affectation d'un livreur, zones (liste, frais, délais, import GeoJSON avec aperçu sur carte Leaflet).
9. **Vue livreur** `/livreur` (US-28) : mise en page mobile, courses du jour, itinéraire (lien Google Maps vers le point GPS), appel, saisie du code de remise et du solde encaissé, échec avec motif.
10. **Retrait** (US-29) : boutiques, horaires, créneaux et capacité.
11. **Stock** (US-30) : tableau couleur × taille avec disponible et seuil, entrées de stock, alertes.
12. **Catalogue** (US-31) : motifs (upload signé direct vers Cloudinary, métadonnées, droits, activation), catégories, couleurs, polices, règles de prix, mots interdits.
13. **Paiements** (US-34) : journal filtrable, rapports de rapprochement avec écarts en évidence.
14. **Équipe et réglages** (US-32) : comptes, rôles, désactivation, journal d'audit filtrable, réglages (acompte, délai d'expiration, moyens de paiement actifs), modèles de notifications.
15. **Tableau de bord** (US-33) : indicateurs de `/admin/stats/summary` sur une période, motifs et couleurs les plus vendus (Recharts).

## Critères d'acceptation

- [ ] Critères de US-02, 25, 26, 28 à 34 vérifiés contre l'API de recette.
- [ ] Un rôle ne voit dans la navigation que ses modules ; une URL interdite affiche 403.
- [ ] Les boutons de transition affichés correspondent exactement à `allowedTransitions` (test).
- [ ] Utilisable sur tablette 768 px (tableaux défilants dans leur cadre) ; vue livreur utilisable sur 360 px.
- [ ] Clavier : tous les parcours réalisables sans souris ; focus visible.
- [ ] Playwright : connexion + TOTP, changement de statut, affectation livreur (fournis à SP12).

## Prompt de délégation

```
Tu es l'agent dev-backoffice du projet Streetwear App. Réalise le lot <A|B|C> du sous-projet
SP11 décrit dans docs/sous-projets/SP11-backoffice.md, sur la branche sp11-backoffice-<lot>.
Lis d'abord CLAUDE.md, docs/contrat-api.md, docs/design-system.md,
docs/cahier-des-charges.md et docs/modele-donnees.md. Types et transitions viennent de
packages/shared ; développe avec MSW sur les fixtures puis branche l'API de recette. Ne modifie
pas docs/contrat-api.md : signale tout écart. Termine par le compte rendu de docs/delegation.md.
```
