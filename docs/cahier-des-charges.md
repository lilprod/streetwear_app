# Cahier des charges (version condensée pour les agents)

La version complète vit dans le document partagé « Cahier des charges – Application de
t-shirts personnalisés (Togo) ». Ce fichier en garde ce qu'il faut pour coder.

## Contexte

- Marché : **Lomé (Togo)**, en français, en franc CFA **XOF**, TVA **18 %** incluse dans les prix affichés.
- Utilisateurs : 18–35 ans, surtout sur Android d'entrée de gamme (2 Go de RAM), réseau parfois instable.
- Impression : **DTF** par l'atelier de la marque ; zone maximale A3 devant et dos.
- Paiement : un **agrégateur local** (T-Money de Togocom, Flooz de Moov Africa, carte). Orange
  Money, MTN MoMo, Wave et Stripe **ne sont pas** disponibles au Togo.
- Données personnelles : loi togolaise n° 2019-014 ; hébergement en Europe déclaré à l'IPDCP.

## Périmètre MVP

### Application mobile

| Module | Fonctions MVP |
|---|---|
| Compte | Connexion par numéro +228 et code SMS ; Apple et Google en option ; profil ; carnet d'adresses ; suppression de compte |
| Catalogue | Motifs par catégorie, recherche par nom ; couleurs de t-shirt actives ; polices |
| Studio | Couleur de base ; motif sur devant et/ou dos ; un texte (police, taille, couleur, position) ; aperçu 2D temps réel ; annuler/rétablir ; brouillon sauvegardé (y compris hors ligne) ; texte modéré (mots interdits) |
| Produit | Taille XS à 3XL (tailles épuisées masquées ou grisées) ; quantité 1–50 ; prix TTC en direct |
| Panier | Plusieurs designs ; plusieurs tailles d'un même design |
| Réception | Livraison : point GPS, quartier, repère, téléphone, zone et frais calculés. Retrait : boutique, jour, créneau avec capacité |
| Paiement | T-Money, Flooz, carte ; paiement à la livraison avec acompte 50 % en Mobile Money |
| Suivi | Statuts en temps réel ; notification push + SMS à chaque changement ; reçu PDF ; recommander un design |

### Back-office web

| Module | Fonctions MVP |
|---|---|
| Commandes | Liste filtrable (statut, date, réception, paiement), détail, changement de statut, annulation |
| Production | Fiche imprimable, fichiers HD par zone, affectation d'un opérateur |
| Livraisons | Zones (frais, délai), affectation d'un livreur, vue livreur web mobile avec validation par code |
| Retrait | Boutiques, horaires, créneaux et capacité |
| Stock | Par couleur et taille ; entrées ; réservation au paiement ; alertes de seuil |
| Catalogue | Import de motifs (métadonnées + droits), activation ; couleurs ; polices |
| Paiements | Journal des transactions ; rapprochement quotidien |
| Équipe | Comptes, rôles, double authentification, journal d'audit |
| Statistiques | Commandes, chiffre d'affaires, panier moyen (indicateurs de base) |

### Rôles du back-office

| Rôle | Code | Accès |
|---|---|---|
| Super admin | `super_admin` | Tout |
| Responsable commandes | `order_manager` | Commandes, clients, paiements en lecture |
| Production | `production` | Production, fichiers HD, statuts « En production » et « Prête », stock |
| Logistique | `logistics` | Livraisons, retraits, statuts d'expédition et de livraison |
| Livreur | `courier` | Vue livreur : ses courses, validation de remise |

## Hors périmètre MVP (V1 et après)

Motifs sur les manches, plusieurs textes, favoris, codes promo, remboursements par API,
fiche client, notifications WhatsApp, statistiques complètes, livraison hors Grand Lomé,
partenaires de livraison, fidélité, aperçu 3D, autres produits, autres pays.

## Exigences non fonctionnelles

| Exigence | Cible |
|---|---|
| Temps de réponse API | 95 % des requêtes < 500 ms depuis Lomé |
| Ouverture de l'app | < 3 s sur Android 2 Go de RAM |
| Taille de l'app | ≤ 40 Mo |
| Disponibilité | 99,5 % par mois |
| Back-office | Utilisable dès 768 px de large |
| Sécurité | HTTPS partout, JWT courts + rotation des jetons de rafraîchissement, webhooks signés, RBAC sur chaque route admin, limitation de débit |
| Sauvegardes | Quotidiennes, 30 jours, restauration testée avant lancement |
