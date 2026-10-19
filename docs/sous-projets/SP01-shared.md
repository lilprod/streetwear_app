# SP01 — Package partagé : design, prix, machine à états, contrats

| | |
|---|---|
| **Agent** | `dev-backend` (relu par le lead : ce paquet est le cœur commun) |
| **Vague** | 0 |
| **Dépend de** | SP00 |
| **Débloque** | Tous les sous-projets applicatifs |
| **Stories** | US-13 ; socle de US-05, 09, 10, 12, 18 |
| **Durée indicative** | 5 jours |

## Objectif

Écrire **une seule fois** ce que l'API, le mobile, le back-office et le worker doivent calculer
à l'identique : le format du design, le prix, les transitions de commande et les types du
contrat d'API. Paquet pur TypeScript, sans dépendance à Node, React ou Nest (utilisable partout).

## Lire d'abord

`CLAUDE.md`, `docs/spec-design.md` (en entier), `docs/modele-donnees.md` (machine à états),
`docs/contrat-api.md` (tous les types), `docs/conventions.md`.

## À faire (`packages/shared/src/`)

1. **`design-spec/`** : schémas Zod `DesignSpecV1`, `Zone`, `PatternLayer`, `TextLayer` ; type `DesignSpec` ; constantes des zones (297 × 420 mm) surchargeables ; `validateDesignSpec(spec, zones?)` qui applique les règles 1, 2, 3 et 6 de `spec-design.md` (la boîte englobante d'un calque pivoté doit rester dans la zone) ; `migrateSpec(unknown)` (v1 → v1 pour l'instant, structure prête pour v2) ; `layerBoundingBox(layer)`.
2. **`pricing/`** : `computeUnitPriceXof(spec, rules, patternsById)`, `computeVatIncludedXof(totalXof)`, `computeDepositXof(totalXof, percent)` (arrondi à la centaine supérieure), `computeCartTotals(lines, deliveryFeeXof)`.
3. **`order-state-machine/`** : type `OrderStatus` ; table des transitions avec les rôles autorisés et les préconditions nommées (`requiresOperator`, `requiresPrintFiles`, `requiresCourier`, `requiresHandoverCode`) ; `canTransition(from, to, actor)` ; `allowedTransitions(from, actor)` ; libellés français `ORDER_STATUS_LABELS_FR` et étapes client `CUSTOMER_TIMELINE` (Payée → En production → Prête → Expédiée/Prête au retrait → Livrée).
4. **`contracts/`** : un schéma Zod + type exporté pour **chaque** type de `docs/contrat-api.md` (User, Address, Pattern, Design, Cart, Quote, Order, Payment, CourierDelivery, erreurs, Page<T>…), et les schémas d'entrée des routes (ex. `CreateOrderInput`). L'API les utilise pour valider ; le mobile et le back-office pour typer.
5. **`money/`, `phone/`, `dates/`** : `formatXof`, `normalizeTgPhone`, `formatTgPhone`, `isValidTgPhone`, `formatLome(date, style)`.
6. **`text/`** : `normalizeForModeration(text)` (sans accents, minuscules, sans ponctuation), `containsBannedWord(text, words)`.
7. **`fixtures/`** : données d'exemple réalistes pour les maquettes de données du mobile et du back-office : 6 motifs (Kente éwé, Wax Bè, Losanges, Soleil, Bogolan, Bandes), 5 couleurs, 3 polices, règles de prix, 3 zones de Lomé, 1 boutique, 8 commandes à différents statuts, 3 designs valides et 5 invalides (cas limites).
8. Exports propres dans `src/index.ts` et sous-chemins (`@streetwear/shared/pricing`, etc.).

## Hors périmètre

Accès à la base, appels réseau, composants d'interface.

## Critères d'acceptation

- [ ] Couverture Vitest ≥ 95 % des lignes sur `design-spec`, `pricing`, `order-state-machine`.
- [ ] Les 5 designs invalides des fixtures sont refusés avec un message d'erreur précis ; les 3 valides passent.
- [ ] Un calque carré de 280 mm pivoté de 45° est refusé (sort de la zone) ; non pivoté, il est accepté.
- [ ] `computeDepositXof(34000, 50) === 17000` ; `computeDepositXof(33500, 50) === 16800`.
- [ ] Chaque transition de `modele-donnees.md` est testée en autorisé et en interdit.
- [ ] `formatXof(12000)` rend `12 000 FCFA` avec une espace fine insécable (U+202F) ou insécable (U+00A0), documenté.
- [ ] Le paquet compile sans `dom` ni `node` dans `lib` (vérifie qu'il reste universel).

## Prompt de délégation

```
Tu es l'agent dev-backend du projet Streetwear App. Réalise le sous-projet SP01 décrit dans
docs/sous-projets/SP01-shared.md. Lis d'abord CLAUDE.md, docs/spec-design.md,
docs/modele-donnees.md, docs/contrat-api.md et docs/conventions.md. Travaille uniquement dans
packages/shared, sur la branche sp01-shared. Ce paquet doit rester pur TypeScript (aucune
dépendance Node, React ou Nest ; Zod autorisé). Si une règle des documents est ambiguë ou
contradictoire, choisis l'interprétation la plus stricte et signale-la dans ton compte rendu.
Termine par le compte rendu au format de docs/delegation.md.
```
