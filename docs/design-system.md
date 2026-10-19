# Design system

Inspiration : sobriété de Vercel (noir et blanc, bordures fines, Geist, chiffres en chasse
fixe) et d'Apple (grands titres, cartes arrondies, surfaces translucides, segmentés). Les motifs
pagne sont la seule source de couleur vive. Référence visuelle : canevas « Maquettes – Studio
t-shirts pagne (Togo) ».

Les jetons vivent dans `packages/ui-tokens` et sont exportés en TypeScript (mobile) et en
configuration Tailwind (back-office).

## Couleurs

| Jeton | Valeur | Usage |
|---|---|---|
| `ink` | `#0A0A0A` | Texte principal, boutons principaux, sélection |
| `inkSecondary` | `#6E6E73` | Texte secondaire (contraste 4,9:1 sur blanc) |
| `inkDisabled` | `#8A8A8E` | Texte désactivé |
| `surface` | `#FFFFFF` | Fond des écrans mobiles |
| `surfaceMuted` | `#F5F5F7` | Fond des aperçus et cartes de résumé |
| `surfaceAdmin` | `#FAFAFA` | Fond du back-office |
| `segmented` | `#F2F2F4` | Fond des contrôles segmentés |
| `border` | `#EAEAEA` | Bordures et séparateurs |
| `borderStrong` | `#D4D4D8` | Champs de saisie, boutons secondaires |
| `link` | `#0066CC` | Liens et actions texte |
| `focus` | `#0066CC` | Anneau de focus (2 px, décalage 2 px) |

Statuts de commande (fond / encre, contraste ≥ 4,5:1) :

| Statut | Fond | Encre |
|---|---|---|
| Payée, Acompte reçu | `#E8F1FC` | `#0B4F9C` |
| En production | `#FDF1DC` | `#8A4B00` |
| Prête, Prête au retrait | `#E3F4EA` | `#16613A` |
| Expédiée, En livraison | `#EFEAFB` | `#5B3BA3` |
| Livrée, Expirée | `#F0F0F2` | `#4B4B50` |
| Paiement échoué, Annulée, Échec de livraison | `#FCE8E8` | `#A11A1A` |

## Typographie

- **Geist** (texte) et **Geist Mono** (prix, numéros de commande, codes, téléphones), Google Fonts, licence OFL.
- Mobile : titre d'écran 34/40 gras (−2,5 % d'interlettrage) ; titre de section 20 semi-gras ; corps 15/22 ; légende 13 ; micro 11.
- Back-office : titre de page 32 semi-gras ; corps 14 ; en-têtes de tableau 12 gris.
- Montants toujours en Geist Mono : `12 000 FCFA`.

## Formes et espacements

| Élément | Valeur |
|---|---|
| Grille | Multiples de 4 ; marges d'écran mobile 20 px, cartes à 16 px du bord |
| Rayons | Bouton principal : pilule (999) ; carte d'aperçu : 24 ; carte : 16 ; champ : 12 ; contrôle segmenté : 10 ; back-office : 8 à 12 |
| Cibles tactiles | 44 × 44 px minimum |
| Barres inférieures | Fond blanc 82–90 % + flou 20 px, bordure haute 1 px |
| Ombres | Aucune, sauf l'élément actif d'un segmenté (`0 1px 3px rgba(0,0,0,.12)`) |

## Composants (à construire dans chaque application)

| Composant | Description | Écrans |
|---|---|---|
| `PrimaryButton` | Pilule noire, texte blanc 16 semi-gras, hauteur 52 | Partout |
| `SecondaryButton` | Pilule blanche, bordure `borderStrong` | Connexion, Suivi |
| `Segmented` | Deux à trois options, fond `segmented`, actif blanc | Studio, Réception |
| `Tabs` | Onglets texte soulignés de 2 px noir | Studio, back-office |
| `SizePicker` | Grille 4 colonnes, état épuisé barré | Taille et quantité |
| `Stepper` | − valeur + dans une pilule bordée | Quantité |
| `Swatch` | Pastille 44 px, anneau de sélection blanc 2 px + noir 2 px | Studio |
| `PatternTile` | Vignette du motif, rayon 12–16, nom en dessous | Accueil, Studio |
| `PriceRow` | Libellé gris à gauche, montant mono à droite | Taille, Panier, Paiement |
| `StatusBadge` | Pastille arrondie, point de couleur + libellé | Suivi, back-office |
| `Timeline` | Étapes verticales : faite (rond plein), en cours (anneau épais), à venir (anneau gris) | Suivi, détail commande |
| `BottomBar` | Barre translucide fixée en bas avec le bouton principal | Écrans d'achat |
| `TabBar` | 4 onglets : Accueil, Studio, Commandes, Compte | Écrans racine |

## Accessibilité

- Contraste du texte ≥ 4,5:1 ; ne jamais distinguer un état par la seule couleur (barré, icône, libellé).
- Tous les contrôles sont de vrais boutons ou liens, avec `accessibilityLabel` pour les icônes seules.
- Les tailles de texte système (Dynamic Type, taille de police Android) sont respectées jusqu'à 130 %.
