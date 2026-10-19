# SP08 — Production : rendu HD, fiches de production, opérateurs

| | |
|---|---|
| **Agent** | `dev-backend` |
| **Vague** | 2 |
| **Dépend de** | SP01 (`DesignSpec`), SP03 (motifs, polices), SP04 (commandes, transitions) |
| **Débloque** | SP11 (écran production), SP12 (validation des impressions) |
| **Stories** | US-12, US-26 |
| **Durée indicative** | 6 jours |

## Objectif

Dès qu'une commande est payée, produire pour l'atelier un fichier PNG 300 DPI par zone,
fidèle à l'aperçu du client, et une fiche de production imprimable.

## Lire d'abord

`CLAUDE.md`, `docs/spec-design.md` (en entier, surtout « Rendu des fichiers d'impression »),
`docs/contrat-api.md` (routes admin production), `docs/modele-donnees.md` (`production_jobs`,
`order_items`), `docs/architecture.md` (file `render-print-files`).

## À faire

1. **Modèle Prisma** : `ProductionJob`.
2. **Rendu** (`apps/api/src/modules/production/render/`) : fonction pure `renderZone(zoneSpec, assets, dpi)` → Buffer PNG, avec `@napi-rs/canvas` (ou Skia sous Node) et `sharp` pour l'encodage, le profil sRGB et les métadonnées DPI ; motifs téléchargés en pleine résolution depuis `MediaProvider` (cache disque local) ; polices chargées depuis `Font.fileUrl` ; rotation autour du centre ; `tile` respecté ; recadrage à la boîte englobante + 5 mm.
3. **File `render-print-files`** : déclenchée par `payment.succeeded` ; un travail par ligne de commande ; stockage R2/S3 (`StorageProvider` avec adaptateurs S3 et local) ; mise à jour de `order_items.print_file_*_url` ; `production_jobs.status` ; échec → `failed` + événement d'alerte.
4. **Routes admin** : affectation d'un opérateur (transition `paid → in_production` via `OrdersService.transition`), URL signées des fichiers (15 min), régénération, fiche de production PDF A4 (aperçus devant/dos, numéro en code-barres Code 128, tailles et quantités, couleur, opérateur, date promise).
5. **Test de fidélité** : pour chaque design valide des fixtures, comparer la boîte englobante calculée par `layerBoundingBox` (SP01) à la zone non transparente du PNG (tolérance 1 mm).
6. **Performance** : une zone A3 rendue en moins de 10 s sur 1 vCPU ; mémoire < 512 Mo.

## Hors périmètre

Pilotage des machines d'impression, gestion des consommables.

## Critères d'acceptation

- [ ] Critères de US-12 et US-26 couverts par des tests.
- [ ] Le PNG mesure 3 508 px pour 297 mm (± 1 px) et déclare 300 DPI dans ses métadonnées.
- [ ] Le test de fidélité passe pour les 3 designs valides des fixtures.
- [ ] Relancer un rendu écrase le fichier sans créer de doublon.
- [ ] Un motif introuvable fait échouer le travail proprement (statut `failed`, alerte), sans bloquer la file.
- [ ] 20 fichiers de rendu réels sont fournis à l'atelier pour validation (à faire avec SP12).

## Prompt de délégation

```
Tu es l'agent dev-backend du projet Streetwear App. Réalise le sous-projet SP08 décrit dans
docs/sous-projets/SP08-production-rendu.md, sur la branche sp08-production. Lis d'abord
CLAUDE.md, docs/spec-design.md, docs/contrat-api.md, docs/modele-donnees.md et
docs/architecture.md. Le rendu est une fonction pure testable, branchée sur la file BullMQ
render-print-files ; il réutilise layerBoundingBox de packages/shared. Les fichiers passent par
l'interface StorageProvider. Mesure et rapporte le temps et la mémoire d'un rendu A3. Termine
par le compte rendu de docs/delegation.md.
```
