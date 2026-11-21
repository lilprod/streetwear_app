# Protocole d'accessibilité (SP12, partie 3)

| | |
|---|---|
| **Référence** | `docs/sous-projets/SP12-qa-recette.md`, item 8 |
| **Date** | 21/11/2026 |
| **Statut** | Protocole prêt ; aucune session de test n'a encore été menée (`docs/reprise-lead.md` : lecteurs d'écran jamais vérifiés) |
| **Testeur** | à compléter |
| **Référence de conformité** | WCAG 2.2 niveau AA, adaptée aux applications mobiles et back-office (proposition à valider par le chef de projet) |

## 1. Périmètre

| Surface | Parcours ou écrans |
|---|---|
| Application mobile, parcours d'achat | Connexion (saisie du numéro, code SMS) → studio (choix couleur, motif, texte) → produit (taille, quantité) → panier → réception (retrait ou livraison) → paiement → confirmation → suivi |
| Back-office web | Connexion (e-mail, mot de passe, TOTP), commandes, production, livraisons, retrait, stock, catalogue, paiements, équipe, audit, réglages, tableau de bord |
| Vue livreur (360 px) | Liste du jour, saisie du code de remise, montant encaissé |

## 2. Lecteurs d'écran : TalkBack et VoiceOver

### 2.1 Configuration

| Plateforme | Lecteur | Version | Appareil | Langue du système |
|---|---|---|---|---|
| Android | TalkBack | à compléter | Android entrée de gamme (au moins un 2 Go) | Français |
| iOS | VoiceOver | à compléter | iPhone | Français |

Réglages à consigner : taille de police système (défaut), mouvement réduit désactivé, gestes
TalkBack standard. Pas de modification de l'application pendant la session.

### 2.2 Grille par écran (mobile, parcours d'achat)

Pour chaque écran : 1 = conforme ; 0 = non conforme ; NA = non applicable. Une remarque est obligatoire
pour tout 0.

| Écran | Annonce du titre | Ordre de lecture et focus | Libellés des boutons et champs | Annonce des états (chargement, erreur, indisponible) | Prix et montants lus en FCFA | Remarque |
|---|---|---|---|---|---|---|
| Connexion : numéro | | | | | NA | |
| Connexion : code SMS (6 chiffres) | | | Chaque case annoncée avec sa position | Code faux et verrouillage annoncés | NA | |
| Studio : choix de la couleur | | | Couleur nommée, état actif annoncé | | NA | |
| Studio : motif (sélection, déplacement) | | | Motif nommé (« bouton nommé d'après le motif » couvert par `design-system.test.tsx`) | Gestes : alternative par boutons | NA | |
| Studio : texte (saisie, taille, couleur) | | | Limite de 14 caractères annoncée | « Ce texte ne peut pas être imprimé » annoncé | NA | |
| Studio : devant / dos | | | Bascule annoncée avec l'état | | NA | |
| Produit : taille | | | Taille épuisée annoncée « épuisée », non sélectionnable | | Prix unitaire | |
| Produit : quantité (1 à 50) | | | Boutons « moins » et « plus » nommés ; limites annoncées | Limite atteinte annoncée | Total | |
| Panier | | | Ligne indisponible annoncée | Blocage annoncé | Total | |
| Réception : point GPS | | | Alternative sans carte (quartiers) | Hors zone annoncé | Frais | |
| Réception : créneau retrait | | | Créneau complet annoncé | « Créneau plein » (SLOT_FULL) | NA | |
| Paiement : mode et numéro | | | Mode choisi annoncé | Erreur de numéro annoncée | Montant | |
| Paiement : attente de confirmation | | | Attente annoncée (2 min maximum) | Succès et échec annoncés | Montant | |
| Confirmation et suivi | | | Étapes annoncées avec leur état (`design-system.test.tsx` « announces each step with its state ») | Nouveau statut annoncé | Date et heure en Africa/Lome | |

### 2.3 Parcours à dérouler

1. Connexion avec un numéro de test, saisie du code faux puis du bon, sans voir l'écran.
2. Création d'un design (couleur, un motif, un texte), aperçu devant et dos.
3. Ajout au panier, taille épuisée, quantité 3.
4. Choix de la livraison avec point, puis du retrait.
5. Paiement (adaptateur réel si disponible, sinon adaptateur de test signalé).
6. Lecture de la confirmation et du suivi.

Mesures à consigner : nombre d'éléments sans nom, nombre de gestes sans alternative, nombre
de messages d'erreur non annoncés, durée du parcours avec lecteur (informative).

## 3. Contraste

Mesure avec un outil de contraste (sélecteur de couleur de l'appareil ou outil d'audit) sur :

| Élément | Seuil WCAG AA | Mesure (à remplir) | Résultat |
|---|---|---|---|
| Texte courant (corps, libellés) sur fond | 4,5 : 1 | | |
| Texte de grande taille (titres, prix ≥ 18 pt ou 14 pt gras) | 3 : 1 | | |
| Bordures et contours de champs, icônes porteuses de sens | 3 : 1 | | |
| Libellés des états (épuisé, erreur, succès) | 4,5 : 1 | | |
| Couleurs de t-shirt proposées au studio (texte automatique) | non applicable à la couleur du motif ; contraste du texte automatique à mesurer | | |
| Back-office : tableaux, badges de statut, boutons désactivés | 4,5 : 1 pour le texte, 3 : 1 pour les contours | | |

Les couleurs de jetons viennent de `packages/ui-tokens` ; une valeur non conforme se signale
au sous-projet SP09 (mobile) ou SP11 (back-office).

## 4. Navigation clavier du back-office

Navigateurs : Chrome et Firefox sur poste de bureau ; une passe sur Safari si disponible. Largeur 1280 px
et 768 px (seuil du cahier des charges).

### 4.1 Grille par écran

| Écran | Ordre de tabulation logique | Focus visible | Toutes les actions au clavier | Pas de piège de focus | Échap ferme les boîtes de dialogue (focus rendu) | Remarque |
|---|---|---|---|---|---|---|
| Connexion (e-mail, mot de passe, TOTP) | | | | | NA | |
| Commandes : liste, filtres, recherche | | | | | | |
| Commandes : détail et changement de statut | | | | | Confirmation (`components.test.tsx` « annule avec Échap ») | |
| Production : affectation d'opérateur | | | | | | |
| Livraisons : zones et affectation | | | | | | Carte Leaflet : vérifier l'alternative clavier |
| Vue livreur (360 px) | | | | | NA | |
| Retrait : boutiques et créneaux | | | | | | |
| Stock : entrées et seuil | | | | | | |
| Catalogue : import et activation | | | | | | |
| Paiements : liste et rapprochement | | | | | | |
| Équipe et audit | | | | | | |
| Réglages et modèles de notifications | | | | | | |
| Tableau de bord | | | | | NA | Graphiques : alternative textuelle |

### 4.2 Critères

- Chaque élément interactif est atteignable par Tab et Maj+Tab dans un ordre cohérent avec la lecture.
- Le focus est toujours visible (contour d'au moins 2 px, contraste 3 : 1).
- Les tableaux se parcourent sans souris ; les champs de date suivent le format JJ/MM/AAAA.
- Les messages d'erreur sont annoncés (`role="alert"` ou équivalent) et associés au champ concerné.

## 5. Fiche de constat

| Réf. | Écran | Critère | Constat | Gravité (bloquante, majeure, mineure) | Sous-projet proposé | Lien anomalie |
|---|---|---|---|---|---|---|
| A-01 | | | | | | |

Une anomalie d'accessibilité est au moins majeure si elle empêche d'acheter (mobile) ou de traiter
une commande (back-office) sans assistance.

## 6. Limites connues

- Aucune campagne d'accessibilité n'a été menée ; le dépôt n'a pas de test automatique de lecteur d'écran.
- Les tests unitaires de composants (`apps/mobile/src/ui/design-system.test.tsx`,
  `apps/admin/src/components/components.test.tsx`) vérifient des libellés et des états ; ils ne remplacent
  pas le test avec TalkBack ou VoiceOver.
