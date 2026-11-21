# Protocole d'impression — 20 designs réels (SP12, partie 2)

| | |
|---|---|
| **Référence** | `docs/sous-projets/SP12-qa-recette.md`, item 7 ; `docs/backlog.md` US-12 et US-26 |
| **Date** | 21/11/2026 |
| **Statut** | Protocole prêt ; exécution à faire (atelier et rendus réels à compléter) |
| **Responsable atelier** | à compléter |
| **Responsable QA** | à compléter |

## 1. Objectif

Vérifier que les fichiers HD produits par SP08 (un PNG 300 DPI transparent par zone non vide,
US-12) s'impriment fidèlement en DTF, et que l'impression reproduit l'aperçu validé par le client
(US-06). L'atelier valide 20 fichiers réels avant le pilote (critère US-12).

## 2. Ce que le code produit (à vérifier sur les fichiers réels)

- Une zone A3 rendue à 3508 px pour 297 mm, soit 300 DPI, sRGB, RGBA (`apps/api/test/render-zone.spec.ts`).
- Recadrage à la boîte englobante plus 5 mm ; une vignette répétée sur une tuile (`render-zone.spec.ts`).
- Texte : encre dans la boîte estimée, non vide (`render-zone.spec.ts`).
- Fiche de production A4 : aperçus, tailles, quantités, opérateur et code-barres du numéro
  (`apps/api/src/modules/production/sheet/production-sheet.ts`). Le code-barres encode le
  numéro de commande ; le jeu de symboles est ASCII 32 à 126 et chaque symbole fait 11 modules
  (`apps/api/test/production-units.spec.ts`), ce qui correspond à Code 128.
- Fichiers stockés à une clé stable ; URL signée valable 15 minutes (`apps/api/test/production.spec.ts`).

## 3. Échantillon

**Taille :** 20 designs réels, tirés de commandes ou de brouillons de test rendus par SP08.

**Répartition à respecter :**

| Critère de sélection | Nombre minimum |
|---|---|
| Devant seul | 4 |
| Dos seul | 4 |
| Devant et dos | 4 |
| Avec un texte (1 à 14 caractères, 3 couleurs : automatique, or, rouge) | 4 |
| Motif en rotation | 2 |
| Motif à la limite de la zone A3 (déplacé au bord) | 2 |
| Couleur de t-shirt foncée (texte en couleur automatique claire) | 3 |

Les designs qui ne remplissent pas une ligne sont remplacés pour que la répartition soit respectée.
Chaque design porte un identifiant d'échantillon `QA-IMP-01` à `QA-IMP-20`.

**Préparation :**

1. Exporter les fichiers HD depuis le back-office (fiche de production, boutons de téléchargement US-26).
2. Enregistrer pour chaque design : identifiant du design, identifiant de commande, couleur du
   t-shirt, zones présentes, version de l'API (commit), date du rendu.
3. Capturer l'aperçu du studio (écran de validation) en PNG, même taille que la zone, à la même
   échelle, pour la comparaison.

## 4. Impression

- Procédé : DTF (impression sur film, transfert thermique), comme en production.
- Un seul tirage par design ; sur la même machine et le même lot de film pour les 20 designs.
- Matériel, lot de film, encres, température et durée de transfert : à compléter (relevés dans la fiche d'écart).
- Le t-shirt est celui de la couleur indiquée dans la commande (couleurs actives du catalogue).

## 5. Grille de mesure

Chaque design est mesuré sur les 5 points ci-dessous. Les tolérances sont des **propositions à valider
par l'atelier et le sponsor** ; elles ne sont pas des exigences du cahier des charges.

| Point | Méthode | Tolérance proposée (à valider) | Résultat (à remplir) |
|---|---|---|---|
| **Couleurs** | Spectrophotomètre sur 3 zones de couleur vive et 1 zone de texte, comparé à l'aperçu converti en profil d'impression de l'atelier. Mesure ΔE 2000 moyen. | ΔE 2000 moyen ≤ 3 ; aucune zone > 5 | ΔE moyen : ____ ; max : ____ |
| **Position (mm)** | Règle ou pied à coulisse : distance des bords du motif à deux repères (encolure, bas du t-shirt) sur le tirage, à comparer à l'aperçu coté. | ± 1 mm pour le motif ; ± 2 mm pour le texte | X : ____ ; Y : ____ ; rotation : ____ ° |
| **Netteté** | Loupe x10 sur les bords et les textes de 8 mm ; traits fins de 0,5 mm. | Pas de bavure visible ; texte de 8 mm lisible sans débord | Oui / non ; remarque : ____ |
| **Découpe** | Vérifier le contour du motif découpé (si découpe) et la transparence hors motif (pas de halo blanc hors encre). | Pas de halo visible à 30 cm ; contour régulier | Oui / non ; remarque : ____ |
| **Code-barres de la fiche** | Lire le code-barres de la fiche A4 avec un lecteur (application ou scanner) et comparer au numéro de commande. | Lecture au premier essai ; numéro identique | Lu : oui / non ; numéro : ____ |

**Contrôles complémentaires (par design) :**

- Taille du texte : mesure du texte en mm, à comparer à la taille choisie (8 à 80 mm).
- Pas de texte interdit imprimé (mots interdits : liste de la marque).
- Fichier HD : dimension 3508 × 4961 px par zone ou recadrage conforme, 300 DPI.

## 6. Verdict par design

| Verdict | Condition |
|---|---|
| Conforme | Les 5 points dans la tolérance |
| Conforme sous réserve | Un point hors tolérance sans effet sur la commande (ex. ΔE 3,5 sur une zone secondaire) ; à décider par l'atelier |
| Non conforme | Un point hors tolérance qui rend le produit inacceptable, ou code-barres illisible |

**Critère d'acceptation (US-12) :** 20 fichiers validés par l'atelier, avec au plus 2 verdicts
« conforme sous réserve » et aucun « non conforme » non traité. Un « non conforme » ouvre une
anomalie dans `docs/qa/anomalies.md` (sous-projet responsable SP08 si le fichier est en cause,
SP09 si l'aperçu diverge du fichier, atelier si l'impression diverge du fichier).

## 7. Fiche d'écart

À remplir pour chaque design non conforme ou sous réserve. Une fiche par écart.

| Champ | Contenu |
|---|---|
| Identifiant échantillon | QA-IMP-__ |
| Identifiant design et commande | ____ |
| Zone concernée | devant / dos / texte |
| Point de mesure | couleurs / position / netteté / découpe / code-barres / autre |
| Valeur attendue (aperçu, fichier) | ____ |
| Valeur obtenue (tirage) | ____ |
| Écart | ____ |
| Photo du tirage et de l'aperçu | Référence du fichier : ____ |
| Fichier HD d'origine vérifié | Oui / non ; si oui, ouvert dans quel logiciel : ____ |
| Hypothèse de cause | fichier (SP08) / aperçu (SP09) / impression (atelier) / inconnue |
| Sous-projet responsable proposé | ____ |
| Gravité | bloquante / majeure / mineure |
| Date et signature de l'atelier | ____ |

## 8. Relevés de la session

| Date | Opérateur atelier | Machine et film (lot) | Température et durée | Commit API | Observations |
|---|---|---|---|---|---|
| à compléter | à compléter | à compléter | à compléter | à compléter | à compléter |

## 9. Limites connues

- Aucun fichier réel n'a encore été rendu et imprimé à ce jour (`docs/reprise-lead.md` : « jamais vérifié
  en impression »). Le protocole ne préjuge pas du résultat.
- Les rendus de test du dépôt utilisent des motifs fictifs (`apps/api/test/fixtures/`) ; ils ne
  remplacent pas les 20 designs réels.
- Le rendu HD (300 DPI A3) est mesuré en temps (< 10 s en test, `render-perf.spec.ts`) ; le délai
  de 60 s après paiement n'est pas mesuré de bout en bout. À mesurer lors de la session.
