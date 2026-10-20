# Spécification du design (`DesignSpec`), du prix et du rendu HD

Le design d'un t-shirt est un document JSON. Le studio mobile le produit, l'API le valide et le
stocke, le worker le transforme en fichiers d'impression. Le schéma Zod vit dans
`packages/shared/src/design-spec/` ; ce document en est la spécification.

## Format v1

```ts
type DesignSpec = {
  version: 1;
  colorId: string;                 // TshirtColor.id
  zones: {
    front?: Zone;
    back?: Zone;
  };
};

type Zone = { layers: Layer[] };    // ordre = ordre d'empilement (0 = dessous)

type Layer = PatternLayer | TextLayer;

type PatternLayer = {
  type: 'pattern';
  id: string;                      // identifiant local du calque (uuid)
  patternId: string;               // Pattern.id
  x: number; y: number;            // coin haut-gauche, en mm, relatif à la zone
  width: number; height: number;   // en mm
  rotation: number;                // degrés, -180..180, autour du centre du calque
  repeat: 'none' | 'tile';         // 'tile' = motif répété pour remplir le cadre
  tileScale: number;               // 0.25..4, taille d'un module répété (1 = taille native à 300 DPI)
};

type TextLayer = {
  type: 'text';
  id: string;
  text: string;                    // 1..14 caractères, majuscules autorisées, emoji refusés
  fontId: string;                  // Font.id
  colorHex: string;                // #RRGGBB
  sizeMm: number;                  // hauteur de capitale, 8..80 mm
  x: number; y: number;            // centre du texte, en mm, relatif à la zone
  rotation: number;
  align: 'center';
};
```

## Zones d'impression

| Zone | Largeur × hauteur (mm) | Repère d'origine | Placement sur le t-shirt |
|---|---|---|---|
| `front` | 297 × 420 | Coin haut-gauche du cadre A3 | Centré, 70 mm sous l'encolure |
| `back` | 297 × 420 | Coin haut-gauche du cadre A3 | Centré, 90 mm sous l'encolure |

Les dimensions viennent de `settings.print_zones` (valeurs ci-dessus par défaut) pour pouvoir
suivre les gabarits de l'atelier sans changer le code.

## Règles de validation (Zod + règles métier)

1. Au moins une zone avec au moins un calque.
2. **MVP :** au plus 1 calque `pattern` par zone et au plus 1 calque `text` dans tout le design.
3. Chaque calque reste entièrement dans sa zone après rotation (boîte englobante).
4. `patternId`, `fontId`, `colorId` existent et sont actifs (vérifié par l'API, pas par Zod) → sinon `422 PATTERN_INACTIVE`.
5. Le texte ne contient aucun mot de `banned_words` (comparaison sans accents, insensible à la casse) → sinon `422 TEXT_REJECTED`.
6. Traits de texte : `sizeMm ≥ 8`.
7. Boîte englobante d'un texte (sans métriques de police) : largeur = nombre de caractères × `sizeMm`, hauteur = 1,4 × `sizeMm`. Constantes dans `packages/shared/src/design-spec/zones.ts` ; le rendu HD (SP08) doit rester dans cette boîte.

## Calcul du prix unitaire

Fonction unique `computeUnitPriceXof(spec, rules, patternsById)` dans `packages/shared/src/pricing/`.

```
prix = rules.baseXof
     + Σ pour chaque calque pattern : (pattern.priceTier === 'premium' ? rules.patternPremiumXof : rules.patternStandardXof)
     + (au moins un calque text ? rules.textXof : 0)
```

- Valeurs par défaut en recette : base 8 500, motif standard 1 500, motif premium 2 500, texte 1 000 (hypothèses à confirmer).
- Prix TTC ; `vatIncludedXof = round(totalXof × 18 / 118)`, calculé par `computeVatIncludedXof`.
- Frais de livraison : ceux de la zone, ajoutés une fois par commande.
- Acompte paiement à la livraison : `ceil(totalXof × cod_deposit_percent / 100)`, arrondi à la centaine supérieure.

## Rendu des fichiers d'impression (SP08)

| Règle | Valeur |
|---|---|
| Résolution | 300 DPI → 1 mm = 11,811 px ; zone A3 = 3 508 × 4 961 px |
| Format | PNG 8 bits RGBA, fond transparent, profil sRGB intégré |
| Un fichier par zone non vide | `<orderNumber>_<itemIndex>_front.png`, `…_back.png` |
| Recadrage | Image recadrée à la boîte englobante des calques + 5 mm de marge ; dimensions réelles notées dans les métadonnées |
| Motif `tile` | Module répété à `tileScale × taille native`, découpé au cadre du calque |
| Texte | Police chargée depuis `Font.fileUrl`, rendu vectoriel puis rastérisé à 300 DPI |
| Stockage | R2/S3, clé `print-files/<orderId>/<file>`, URL signée 15 min pour le back-office |
| Idempotence | Rendu relancé = fichier écrasé à la même clé |

Le rendu mobile (Skia) applique la même géométrie à l'échelle de l'écran : un test commun
(`packages/shared/test/fixtures/*.json`) vérifie que les boîtes englobantes calculées sont
identiques côté mobile et côté worker.

## Évolution du format

Ajouter une zone (manches en V1) ou plusieurs textes = `version: 2` ; l'API accepte v1 et v2
pendant la transition et `migrateSpec()` convertit les brouillons v1.
