# SP09 — Mobile : studio de design (Skia)

| | |
|---|---|
| **Agent** | `dev-mobile` |
| **Vague** | 1 (démarre dès SP01, sur les fixtures ; branche l'API SP03 ensuite) |
| **Dépend de** | SP00, SP01 ; SP03 pour l'API réelle |
| **Débloque** | SP10 (le studio s'insère dans le parcours d'achat) |
| **Stories** | US-04, US-05, US-06, US-07, US-09, US-10, US-11 |
| **Durée indicative** | 10 jours (risque produit principal) |

## Objectif

Un studio fluide sur un Android d'entrée de gamme, où le client compose son t-shirt (couleur,
motif devant/dos, texte) et voit le résultat exact qui sera imprimé.

## Lire d'abord

`CLAUDE.md`, `docs/spec-design.md` (en entier), `docs/design-system.md`,
`docs/contrat-api.md` (Catalogue, Designs), `docs/backlog.md` (stories ci-dessus), et l'écran
« 02 · Studio » du canevas de maquettes (interactions de référence).

## À faire (`apps/mobile/src/features/studio/`)

1. **Rendu Skia** : t-shirt vectoriel (silhouette devant et dos) teinté par la couleur ; zone A3 projetée à l'échelle de l'écran ; calques motif (image, `tile` via shader) et texte (police chargée) ; même géométrie que `layerBoundingBox` (SP01).
2. **Gestes** (react-native-gesture-handler + Reanimated) : glisser, pincer, pivoter ; contraintes de zone appliquées en direct (le calque ne sort pas) ; cadre en pointillés pendant la manipulation ; 60 images/s visées.
3. **État** : store Zustand du `DesignSpec` en cours, historique 30 niveaux (annuler/rétablir), sélection du calque actif ; toute modification produit un `DesignSpec` valide (`validateDesignSpec`).
4. **Panneaux** : Devant/Dos (segmenté), onglets Motifs / Couleur / Texte comme dans la maquette ; motifs par catégorie avec vignettes ; 5 couleurs ; texte 1–14 caractères, 3 polices, 3 couleurs (automatique selon `isDark`), compteur ; mots interdits signalés en direct (`containsBannedWord`, liste mise en cache).
5. **Prix en direct** : `computeUnitPriceXof` avec les règles de `/catalog/pricing`, affiché en Geist Mono dans la barre inférieure.
6. **Brouillons** : sauvegarde locale (MMKV) en moins d'1 s après chaque changement ; synchronisation `POST/PATCH /designs` au retour du réseau ; envoi des aperçus PNG (capture Skia, ≤ 500 Ko) ; liste « Mes designs ».
7. **Données** : client API typé avec `packages/shared/contracts` ; mode simulé basé sur `packages/shared/fixtures` activé par `EXPO_PUBLIC_API_MODE=mock`.
8. **Accessibilité** : chaque contrôle a un libellé ; alternative aux gestes (boutons ± taille, flèches de position, rotation par pas de 15°) pour qui ne peut pas faire de gestes à deux doigts.

## Hors périmètre

Choix de taille, panier, paiement (SP10) ; manches et multi-textes (V1).

## Critères d'acceptation

- [ ] Critères de US-04 à 07 et 09 à 11 vérifiés sur un émulateur Android 2 Go de RAM et un iPhone.
- [ ] Au moins 30 images/s pendant un glisser sur l'émulateur bas de gamme (mesure rapportée).
- [ ] Les `DesignSpec` produits pour les 3 designs de référence correspondent aux fixtures (test).
- [ ] Hors ligne : on compose, on ferme l'app, on rouvre : le brouillon est là ; au retour du réseau il est synchronisé.
- [ ] Prix identique à celui de l'API pour les mêmes données (test avec les fixtures).
- [ ] Aucun libellé en dur hors de `src/i18n/fr.ts`.

## Prompt de délégation

```
Tu es l'agent dev-mobile du projet Streetwear App. Réalise le sous-projet SP09 décrit dans
docs/sous-projets/SP09-mobile-studio.md, sur la branche sp09-studio. Lis d'abord CLAUDE.md,
docs/spec-design.md, docs/design-system.md, docs/contrat-api.md et docs/backlog.md. Le design
produit doit toujours être un DesignSpec valide selon packages/shared ; le prix vient de
computeUnitPriceXof, jamais d'un calcul local. Développe d'abord en mode mock sur les fixtures,
puis branche l'API si SP03 est disponible. Mesure et rapporte les images par seconde sur un
émulateur Android bas de gamme. Termine par le compte rendu de docs/delegation.md.
```
