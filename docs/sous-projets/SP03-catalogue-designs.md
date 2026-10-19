# SP03 — API : catalogue, designs, médias, modération

| | |
|---|---|
| **Agent** | `dev-backend` |
| **Vague** | 1 |
| **Dépend de** | SP00, SP01 |
| **Débloque** | SP04, SP08, SP09 (branchement API), SP10, SP11 (catalogue) |
| **Stories** | US-03, US-10, US-11, US-27, US-31 |
| **Durée indicative** | 6 jours |

## Objectif

Servir le catalogue (motifs, couleurs, polices, prix) au studio et gérer les designs des
clients ; permettre à l'équipe d'importer des motifs avec la preuve de leurs droits.

## Lire d'abord

`CLAUDE.md`, `docs/spec-design.md`, `docs/contrat-api.md` (Catalogue, Designs, routes admin
catalogue et médias), `docs/modele-donnees.md` (Catalogue et designs), `docs/backlog.md`.

## À faire

1. **Modèles Prisma** : `PatternCategory`, `Pattern`, `TshirtColor`, `Font`, `PriceRule`, `BannedWord`, `Design` ; migration ; seed depuis `packages/shared/fixtures` (6 motifs, 5 couleurs, 3 polices, règles de prix, 20 mots interdits de départ en français et en éwé à compléter par la marque).
2. **`MediaProvider`** (interface : signature d'upload, URL de vignette, URL d'aperçu, suppression) + adaptateur Cloudinary + adaptateur `local` pour les tests.
3. **`catalog`** (public) : catégories, motifs paginés avec recherche sans accent (`unaccent` + `ILIKE` sur nom et tags), couleurs, polices, règles de prix, disponibilité par taille (lit le stock via une interface `StockReader` fournie par SP04 ; en attendant, adaptateur « tout disponible »). Réponses mises en cache HTTP 5 min (`Cache-Control`, `ETag`).
4. **`designs`** (client) : CRUD, duplication, envoi des aperçus PNG (≤ 500 Ko, stockés via `MediaProvider`) ; validation par `validateDesignSpec` + vérification que motifs, polices et couleur existent et sont actifs + modération du texte (`422 TEXT_REJECTED`) ; `unitPriceXof` calculé par `computeUnitPriceXof`.
5. **Admin catalogue** : CRUD motifs, catégories, couleurs, polices, règles de prix, mots interdits ; signature d'upload ; contrôle à l'activation d'un motif (détenteur des droits renseigné, `width_px` ou `height_px` ≥ 4 000) ; refus d'une image > 20 Mo ou d'un format hors PNG/JPG/SVG ; SVG nettoyé (pas de script, pas de lien externe).
6. Exposer un service interne `CatalogService.getPatternsByIds()` et `PricingRulesService.current()` pour SP04 et SP08.

## Hors périmètre

Stock réel (SP04), rendu HD (SP08), écrans (SP09 à SP11).

## Critères d'acceptation

- [ ] Critères de US-03, 10, 11, 27, 31 couverts par des tests.
- [ ] Un design avec un motif désactivé est refusé à l'écriture (`422 PATTERN_INACTIVE`) mais reste lisible.
- [ ] Le prix renvoyé par l'API est égal à `computeUnitPriceXof` pour les 3 designs valides des fixtures.
- [ ] La recherche « kente », « KENTÉ » et « ewe » retrouve « Kente éwé ».
- [ ] Un client ne voit et ne modifie que ses propres designs (`404` sinon).
- [ ] `GET /catalog/patterns` répond en moins de 150 ms avec 200 motifs en base (mesuré en local).

## Prompt de délégation

```
Tu es l'agent dev-backend du projet Streetwear App. Réalise le sous-projet SP03 décrit dans
docs/sous-projets/SP03-catalogue-designs.md, sur la branche sp03-catalogue. Lis d'abord
CLAUDE.md, docs/spec-design.md, docs/contrat-api.md, docs/modele-donnees.md et
docs/backlog.md. Réutilise validateDesignSpec et computeUnitPriceXof de packages/shared sans
les réécrire. Les médias passent par l'interface MediaProvider. Ne modifie pas
docs/contrat-api.md : signale tout écart. Termine par le compte rendu de docs/delegation.md.
```
