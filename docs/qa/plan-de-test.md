# Plan de test — Streetwear App (SP12, partie 1)

| | |
|---|---|
| **Version** | 0.1 (ébauche, à valider par le chef de projet) |
| **Date** | 21/11/2026 |
| **Branche** | `sp12-plan` |
| **Source** | `docs/backlog.md` (34 stories, critères d'acceptation) ; `docs/cahier-des-charges.md` ; `docs/reprise-lead.md` |
| **Périmètre** | Tous les critères de `docs/backlog.md`, plus les exigences non fonctionnelles du cahier des charges |

Ce document ne contient aucun résultat de test : il décrit ce qui existe, ce qui reste à exécuter
et ce qui n'est couvert par rien. Les statuts reflètent l'état du dépôt à la date ci-dessus ;
ils ne sont pas des résultats d'exécution.

## 1. Légende

**Types de test**

| Code | Type | Outil / support |
|---|---|---|
| U | Unitaire | Jest (API, shared, mobile), Vitest (admin) |
| I | Intégration API | Jest + supertest, PostgreSQL et Redis réels (`apps/api/test`) |
| E-W | Bout en bout back-office | Playwright (`apps/admin/e2e/`, partie A de SP12, non encore fusionnée) |
| E-M | Bout en bout mobile | Maestro (`apps/mobile/e2e/`, partie A de SP12, non encore fusionnée) |
| M | Manuel sur appareil | Procédure à dérouler sur les appareils de la section 4 |
| A | Atelier | Impression réelle, voir `docs/qa/protocole-impression.md` |

**Statuts**

- **couvert automatiquement** : un test existant dans le dépôt vérifie le critère (chemin cité).
- **à exécuter manuellement** : aucun test automatique possible ou pertinent ; procédure à dérouler.
- **non couvert** : aucun test ni procédure ne vérifie le critère, ou le comportement attendu n'est pas
  implémenté (écart probable, à confirmer).

Un critère « partiel » est noté avec la mention « à vérifier » quand le test cité ne couvre qu'une
partie de la phrase du critère.

## 2. Matrice story × critère × test

Les chemins sont relatifs à la racine du dépôt. « (partie A) » désigne des suites que la partie A
de SP12 doit créer ; aucun chemin n'est encore présent.

### US-01 — Connexion client par numéro +228 et code SMS (SP02, SP10)

| Critère | Type | Fichier ou procédure | Statut |
|---|---|---|---|
| Numéro refusé s'il n'a pas 8 chiffres après +228 | U | `apps/mobile/src/features/auth/auth.test.ts` | couvert automatiquement |
| Code à 6 chiffres envoyé par SMS | I | `apps/api/test/auth-customer.spec.ts` | couvert automatiquement |
| Code reçu par SMS en moins de 30 s (fournisseur réel) | M | Procédure M-01 (section 6) ; fournisseur SMS bloquant | à exécuter manuellement |
| Code expire après 5 min | I | `apps/api/test/auth-customer.spec.ts` (« rejects an expired code ») | couvert automatiquement |
| 5 essais de code maximum | I | `apps/api/test/auth-customer.spec.ts` | couvert automatiquement |
| 3 envois par heure ; message « Trop de demandes, réessaie dans X min » | I + U | `apps/api/test/auth-customer.spec.ts` ; `apps/mobile/src/features/auth/auth.test.ts` (« shows the remaining wait ») | couvert automatiquement |
| Nouveau numéro crée un compte | I | `apps/api/test/auth-customer.spec.ts` (« creates the account for a new number ») | couvert automatiquement |
| Session conservée 30 jours | I | Aucun test ne nomme la durée de 30 jours ; `apps/api/src/modules/auth/tokens.service.ts` la définit | non couvert (à vérifier) |
| Parcours complet « code faux puis bon » sur l'app | E-M | Parcours 5 (partie A) | à exécuter manuellement (dès que la suite existe) |

### US-02 — Connexion admin e-mail + mot de passe + 2FA (SP02, SP11)

| Critère | Type | Fichier ou procédure | Statut |
|---|---|---|---|
| Mot de passe ≥ 12 caractères | I | Non vérifié par titre de test dans `apps/api/test/admin-auth.spec.ts` ; à vérifier | non couvert (à vérifier) |
| Haché en argon2id | I | `apps/api/src/common/password.ts` ; `apps/api/test/admin-auth.spec.ts` (référence argon2) | couvert automatiquement (partiel) |
| TOTP obligatoire, enrôlé au premier login | I + U | `apps/api/test/admin-auth.spec.ts` (« enrols TOTP at the first login ») ; `apps/admin/src/app.test.tsx` (« propose l'enrôlement TOTP ») | couvert automatiquement |
| Courier sans TOTP | I + U | `apps/api/test/admin-auth.spec.ts` (« logs a courier in without TOTP ») ; `apps/admin/src/app.test.tsx` | couvert automatiquement |
| 5 échecs = compte bloqué 15 min | I | `apps/api/test/admin-auth.spec.ts` (« locks the account for 15 minutes ») | couvert automatiquement |
| Session admin 8 h | I + U | `apps/api/test/admin-auth.spec.ts` (« keeps the original 8 h cap ») ; `apps/admin/src/lib/api.test.ts` (« le refresh ne prolonge pas les 8 h ») | couvert automatiquement |
| Connexion e-mail, mot de passe puis TOTP, dans le back-office | E-W | Parcours de connexion (partie A ; script SP11 non versionné) | non couvert (automatiquement) |

### US-03 — Parcourir et chercher les motifs (SP03, SP10)

| Critère | Type | Fichier ou procédure | Statut |
|---|---|---|---|
| Catégories affichées en onglets | M | Écran catalogue mobile ; aucun test de rendu des onglets identifié | à exécuter manuellement |
| Recherche par nom et par tag, sans accent ni casse | I | `apps/api/test/catalog.spec.ts` (« searches tags and treats % literally ») ; l'insensibilité aux accents n'est pas nommée | couvert automatiquement (partiel, à vérifier) |
| Vignettes WebP ≤ 40 Ko | — | Aucun test ; les adaptateurs médias citent WebP (`apps/api/src/media/`) sans contrôle de taille | non couvert |
| Motif désactivé n'apparaît plus | I | `apps/api/test/catalog.spec.ts` (« hides inactive patterns but keeps the rest ») | couvert automatiquement |
| Brouillon utilisant un motif désactivé affiche « Motif indisponible » | U / M | Le studio signale « Motif indisponible » sur le calque, bloque « Choisir la taille » et propose de remplacer ou retirer (`apps/mobile/src/features/studio/unavailable.test.tsx`, AN-001) ; l'API refuse l'écriture (`apps/api/test/designs.spec.ts`, « refuses a deactivated pattern on write ») | couvert (AN-001 corrigée) |

### US-04 — Choisir la couleur du t-shirt (SP09)

| Critère | Type | Fichier ou procédure | Statut |
|---|---|---|---|
| Seules les couleurs actives sont proposées | I | `apps/api/test/admin-catalog.spec.ts` (« hides deactivated ones from the public catalog ») ; `apps/api/test/catalog.spec.ts` (« serves colors ») | couvert automatiquement |
| Changement de couleur instantané (< 100 ms) dans l'aperçu | M | Mesure sur Android 2 Go et un téléphone milieu de gamme (protocole performance, section 6 de ce document) | à exécuter manuellement |

### US-05 — Placer, redimensionner, pivoter un motif (SP09)

| Critère | Type | Fichier ou procédure | Statut |
|---|---|---|---|
| Glisser, pincer, rotation à deux doigts | M | Gestes réels sur appareil ; la logique est couverte par `apps/mobile/src/features/studio/studio.test.ts` (« hit-tests rotated boxes ») | à exécuter manuellement |
| Calque ne peut pas sortir de la zone A3 | U | `apps/mobile/src/features/studio/studio.test.ts` (« never leaves the zone, whatever the gesture ») | couvert automatiquement |
| Cadre de zone en pointillés pendant la manipulation | M | Aucun test | à exécuter manuellement |

### US-06 — Aperçu 2D temps réel devant et dos (SP09)

| Critère | Type | Fichier ou procédure | Statut |
|---|---|---|---|
| Basculer devant/dos en un geste | U + M | `apps/mobile/src/features/studio/studio.test.ts` (« rebuilds the 3 reference designs ») ; geste réel à vérifier | couvert automatiquement (partiel) |
| 60 images/s visées, 30 minimum sur Android 2 Go | M | Mesure réelle, protocole performance (section 6) | à exécuter manuellement |

### US-07 — Annuler / rétablir (SP09)

| Critère | Type | Fichier ou procédure | Statut |
|---|---|---|---|
| 30 niveaux d'annulation | U | `apps/mobile/src/features/studio/studio.test.ts` (« undoes and redoes, up to 30 levels ») | couvert automatiquement |
| Historique conservé jusqu'à la fermeture du studio | U / M | Non nommé dans les tests ; à vérifier sur appareil (changement d'écran) | à exécuter manuellement |

### US-08 — Profil client (SP02, SP10)

| Critère | Type | Fichier ou procédure | Statut |
|---|---|---|---|
| Nom obligatoire avant la première commande | U / E-M | `apps/mobile/src/features/auth/auth.test.ts` (« validates name and e-mail ») ; blocage avant commande à vérifier | couvert automatiquement (partiel) |
| E-mail facultatif et validé | U + I | `apps/mobile/src/features/auth/auth.test.ts` ; `apps/api/test/me.spec.ts` (« refuses an invalid profile update ») | couvert automatiquement |

### US-09 — Ajouter un texte (SP09)

| Critère | Type | Fichier ou procédure | Statut |
|---|---|---|---|
| 1 à 14 caractères | U | `packages/shared/src/design-spec/zones.ts` (`TEXT_MAX_LENGTH = 14`) ; `packages/shared/src/design-spec/design-spec.test.ts` | couvert automatiquement |
| 3 polices | U | Non vérifié par test nommé ; à vérifier | non couvert (à vérifier) |
| 3 couleurs : automatique selon le t-shirt, or, rouge | U | `apps/mobile/src/features/studio/studio.test.ts` (« switches automatic text color with the t-shirt color ») ; or et rouge à vérifier | couvert automatiquement (partiel) |
| Taille de 8 à 80 mm | U | `packages/shared/src/design-spec/zones.ts` (`TEXT_MIN_SIZE_MM`, `TEXT_MAX_SIZE_MM`) ; `design-spec.test.ts` | couvert automatiquement |
| Placé au dos par défaut | M | Aucun test nommé | à exécuter manuellement |

### US-10 — Refus des mots interdits (SP03, SP09)

| Critère | Type | Fichier ou procédure | Statut |
|---|---|---|---|
| Mot interdit signalé dès la saisie (liste en cache) | U | `apps/mobile/src/features/studio/studio.test.ts` (« flags banned words as typed ») | couvert automatiquement |
| Refusé par l'API, `422 TEXT_REJECTED` | I | `apps/api/test/designs.spec.ts` (« refuses banned words regardless of accents and case ») | couvert automatiquement |
| Message « Ce texte ne peut pas être imprimé » | U / M | Libellé présent dans `apps/mobile/src/i18n/fr.ts` ; aucun test de rendu identifié | à exécuter manuellement |
| Liste de mots interdits en éwé (bloquant client) | — | Données attendues de la marque | non couvert (donnée manquante) |

### US-11 — Brouillon sauvegardé, même hors ligne (SP03, SP09)

| Critère | Type | Fichier ou procédure | Statut |
|---|---|---|---|
| Sauvegarde locale en moins d'une seconde | U / M | `apps/mobile/src/features/studio/studio.test.ts` (« persists, survives a restart ») ; la durée n'est pas mesurée | à exécuter manuellement (mesure) |
| Synchronisation au retour du réseau | U | `apps/mobile/src/features/studio/studio.test.ts` (« syncs when back online ») | couvert automatiquement |
| Dernier écrit gagne | I | `apps/api/src/designs/designs.service.ts` (`updatedAt`) ; pas de test nommé | non couvert (à vérifier) |
| « Mes designs » triée par date | U / M | `apps/mobile/src/features/studio/DesignsScreen.tsx` (tri par `updatedAt`) ; pas de test de l'ordre | à exécuter manuellement |

### US-12 — Fichiers d'impression 300 DPI par zone (SP08)

| Critère | Type | Fichier ou procédure | Statut |
|---|---|---|---|
| PNG 300 DPI transparent par zone non vide | I + U | `apps/api/test/render-zone.spec.ts` (« full A3 zone: 3508 px for 297 mm, 300 DPI ») ; `apps/api/test/production.spec.ts` (« renders every zone ») | couvert automatiquement |
| Généré en moins de 60 s après paiement | I | `apps/api/test/render-perf.spec.ts` (rendu A3 < 10 s) ; délai paiement → fichiers non mesuré en bout en bout | couvert automatiquement (partiel) |
| L'atelier valide 20 fichiers réels | A | `docs/qa/protocole-impression.md` | à exécuter manuellement |
| Erreur de rendu : statut `failed` et alerte production | I | `apps/api/test/production.spec.ts` (« a missing pattern fails the job, alerts ») | couvert automatiquement |

### US-13 — Taille, quantité, prix TTC en direct (SP01, SP10)

| Critère | Type | Fichier ou procédure | Statut |
|---|---|---|---|
| Prix mobile identique au prix API (même fonction) | U | `apps/mobile/src/features/studio/studio.test.ts` (« matches the mock API ») ; `apps/mobile/src/features/purchase/screens.test.tsx` (« shows the unit price and the live total ») | couvert automatiquement (sur mock) |
| Prix mobile identique au prix API réelle | Script | `apps/mobile/scripts/verify-real-api.ts` (52 vérifications, exécution manuelle) | à exécuter manuellement |
| Calcul serveur, champs client refusés | I | `apps/api/test/cart-orders.spec.ts` (« never trusts a client price ») | couvert automatiquement |
| Quantité de 1 à 50 | U + I | `apps/mobile/src/features/purchase/screens.test.tsx` (« keeps the quantity between 1 and 50 ») ; `apps/api/test/cart-orders.spec.ts` (lignes > 50 refusées) | couvert automatiquement |

### US-14 — Panier multi-designs et multi-tailles (SP04, SP10)

| Critère | Type | Fichier ou procédure | Statut |
|---|---|---|---|
| Même design en plusieurs tailles | I + U | `apps/api/test/cart-orders.spec.ts` (« keeps sizes apart ») ; `apps/mobile/src/features/cart/cart.test.ts` (« adds a line and merges the same design and size ») | couvert automatiquement |
| Commande de groupe : un design en 3 tailles (5 M + 4 L + 3 XL), un panier, un paiement, retrait en boutique | U + E-M | `apps/mobile/src/features/cart/cart.test.ts` (« keeps a group order (one design in three sizes) as three lines after sign-in ») ; `apps/mobile/e2e/02-commande-groupe-retrait.yaml` | U couvert ; Maestro à exécuter sur appareil |
| Commande de groupe : fiche de production avec les 3 tailles et quantités | Manuel | Après le parcours 02 : `GET /admin/orders/:id/production-sheet.pdf` depuis le back-office (Production > Fiche PDF) | à exécuter manuellement |

> **Commande de groupe** (décision du chef de projet, 22/11/2026) : une personne commande pour un groupe le même design en plusieurs tailles, dans un seul panier, avec un seul paiement et une seule livraison ou un seul retrait. Les commandes collectives (plusieurs payeurs, nom par t-shirt, remise au volume, lien de partage) sont hors du MVP.
| Ligne indisponible signalée et bloquante | U + I | `apps/mobile/src/features/purchase/screens.test.tsx` (« blocks the order until they are removed ») ; `apps/api/test/cart-orders.spec.ts` (« flags unavailable ») | couvert automatiquement |

### US-15 — Payer en T-Money ou Flooz (SP05, SP10)

| Critère | Type | Fichier ou procédure | Statut |
|---|---|---|---|
| Demande sur le téléphone, attente 2 min, succès ou échec avec « Réessayer » | U | `apps/mobile/src/features/payment/flow.test.ts` (« times out after 2 minutes », « offers a retry after a failure ») | couvert automatiquement (adaptateur `fake`) |
| Montant recalculé côté serveur | I | `apps/api/test/payments.spec.ts` (« un montant envoyé par le client est refusé ») | couvert automatiquement |
| Double appui : un seul débit (clé d'idempotence) | I + U | `apps/api/test/payments.spec.ts` (« simultané ×5 ») ; `apps/mobile/src/features/payment/PaymentScreen.test.tsx` (« creates a single payment on a double press ») | couvert automatiquement |
| Paiement réel T-Money et Flooz | M | Agrégateur réel non disponible (bloquant client) | non couvert (donnée manquante) |
| Parcours achat en T-Money sur appareil | E-M | Parcours 1 (partie A) | à exécuter manuellement (dès que la suite existe) |

### US-16 — Payer par carte (SP05, SP10)

| Critère | Type | Fichier ou procédure | Statut |
|---|---|---|---|
| Redirection vers la page de l'agrégateur | I + U | `apps/api/test/payments.spec.ts` (« carte (US-16) ») ; `apps/mobile/src/features/payment/flow.test.ts` (« opens the card page ») | couvert automatiquement |
| Retour automatique dans l'app | M | Retour du navigateur jamais vérifié sur appareil (`docs/reprise-lead.md`) | non couvert (agrégateur réel requis) |

### US-17 — Paiement à la livraison avec acompte (SP04, SP05, SP10)

| Critère | Type | Fichier ou procédure | Statut |
|---|---|---|---|
| Acompte 50 % paramétrable en Mobile Money | I + U | `apps/api/test/cart-orders.spec.ts` (« computes the COD deposit ») ; `apps/api/test/payments.spec.ts` (« paiement à la livraison (US-17) ») ; `apps/mobile/src/features/payment/flow.test.ts` (« pays the deposit for cash on delivery ») | couvert automatiquement |
| Commande passe `deposit_paid` | I | `apps/api/test/production.spec.ts` (« also triggers on deposit_paid ») | couvert automatiquement |
| Solde affiché au livreur et au client | I + U | `apps/api/test/delivery.spec.ts` (« requires the collected amount to equal the balance ») ; `apps/admin/src/pages/courier/courier.test.tsx` ; affichage client : `apps/mobile/src/features/orders/orders.test.tsx` | couvert automatiquement (partiel) |

### US-18 — Confirmation par webhook, expiration 30 min (SP04, SP05)

| Critère | Type | Fichier ou procédure | Statut |
|---|---|---|---|
| Seul un webhook à signature valide fait passer la commande en payée | I | `apps/api/test/payments.spec.ts` (« signature invalide », « corps modifié après signature ») | couvert automatiquement |
| Webhook rejoué sans effet | I | `apps/api/test/payments.spec.ts` (« même webhook reçu 3 fois ») | couvert automatiquement |
| Expiration à 30 min, stock libéré | I | `apps/api/test/cart-orders.spec.ts` (« expires unpaid orders after order_expiry_minutes ») ; valeur par défaut 30 dans `apps/api/src/modules/settings/settings.schemas.ts` | couvert automatiquement |
| Confirmation réelle par l'agrégateur (webhook réel) | M | Agrégateur réel requis | non couvert (donnée manquante) |

### US-19 — Stock réservé, sorti au paiement, tailles épuisées masquées (SP04)

| Critère | Type | Fichier ou procédure | Statut |
|---|---|---|---|
| Réservation à la création, sortie au paiement, libération à l'expiration ou à l'annulation | I | `apps/api/test/cart-orders.spec.ts` (« reserves stock », « moves stock from reserved to out », « expires unpaid orders ») ; `apps/api/test/admin-orders-stock.spec.ts` (« cancels before production ») | couvert automatiquement |
| Disponible ≤ 0 : taille grisée « Épuisé » | I + U | `apps/api/test/catalog.spec.ts` (« reports availability by size ») ; `apps/mobile/src/features/purchase/screens.test.tsx` (« shows sold-out sizes struck through ») | couvert automatiquement |
| Deux clients ne peuvent pas obtenir la dernière pièce | I | `apps/api/test/cart-orders.spec.ts` (« 20 simultaneous orders for 5 pieces ») | couvert automatiquement |

### US-20 — Récapitulatif, numéro, reçu PDF (SP04, SP10)

| Critère | Type | Fichier ou procédure | Statut |
|---|---|---|---|
| Écran de confirmation : numéro, articles, total, réception, date estimée | U | `apps/mobile/src/features/orders/orders.test.tsx` (« shows the number, the timeline ») ; « shows the estimated date » | couvert automatiquement |
| Numéro au format `TG-000124` | I | `apps/api/src/modules/orders/orders.service.ts` ; `apps/api/test/cart-orders.spec.ts` | couvert automatiquement (partiel) |
| Reçu PDF servi | I | `apps/api/test/cart-orders.spec.ts` (« serves the PDF receipt ») | couvert automatiquement |
| Mentions légales et TVA incluse sur le reçu | M | Textes juridiques provisoires (`docs/reprise-lead.md`) ; relecture manuelle | à exécuter manuellement |

### US-21 — Adresse avec point GPS, zone et frais (SP06, SP10)

| Critère | Type | Fichier ou procédure | Statut |
|---|---|---|---|
| Point GPS obligatoire | I | `apps/api/test/me.spec.ts` (« validates the input (GPS point required) ») | couvert automatiquement |
| Zone et frais dès que le point est posé | I + U | `apps/api/test/delivery.spec.ts` (« resolves Tokoin to Lomé centre ») ; `apps/mobile/src/features/reception/reception.test.tsx` (« resolves the zone live ») | couvert automatiquement |
| Hors zone : « Nous ne livrons pas encore ici, choisis le retrait en boutique » | I + U | `apps/mobile/src/features/reception/reception.test.tsx` (« offers the pickup when the point is out of zone ») ; `apps/api/test/delivery.spec.ts` (« rejects out-of-zone addresses ») | couvert automatiquement |
| Carte réelle et point posé à la main sur appareil | M | Clé Google Maps absente (mode dégradé), `docs/reprise-lead.md` | non couvert (donnée manquante) |

### US-22 — Retrait en boutique avec créneau (SP06, SP10)

| Critère | Type | Fichier ou procédure | Statut |
|---|---|---|---|
| Seuls les créneaux futurs avec places sont proposés | I | `apps/api/test/delivery.spec.ts` (« exposes only open ones ») ; « quotes pickup, refusing full and unknown slots » | couvert automatiquement |
| `SLOT_FULL` et proposition des créneaux suivants | U + I | `apps/mobile/src/features/reception/reception.test.tsx` (« handles SLOT_FULL ») ; `apps/mobile/src/features/payment/flow.test.ts` (« surfaces SLOT_FULL ») ; `apps/api/test/delivery.spec.ts` (« exactly 4 of 10 simultaneous reservations ») | couvert automatiquement |

### US-23 — Suivi du statut (SP04, SP10)

| Critère | Type | Fichier ou procédure | Statut |
|---|---|---|---|
| 5 étapes visibles avec date et heure | U | `apps/mobile/src/features/orders/orders.test.tsx` (« shows the number, the timeline, dates in Africa/Lome ») | couvert automatiquement |
| Rafraîchissement à l'ouverture et à la réception d'une notification | U / M | `apps/mobile/src/features/notifications/notifications.test.ts` (« opens the order when a notification is tapped ») ; rafraîchissement réel sur appareil non vérifié | à exécuter manuellement (partiel) |

### US-24 — Push et SMS à chaque changement de statut (SP07, SP10)

| Critère | Type | Fichier ou procédure | Statut |
|---|---|---|---|
| Push et SMS à chaque changement visible, dans les 60 s | I | `apps/api/test/notifications.spec.ts` (« suit la commande : production (push seul), retrait, livraison ») ; délai de 60 s non mesuré | couvert automatiquement (partiel) |
| Au plus un push et un SMS par (commande, statut) | I | `apps/api/test/notifications.spec.ts` (« événement émis deux fois : un seul push et un seul SMS ») | couvert automatiquement |
| Réception réelle du push et du SMS sur appareil | M | Procédure M-02 ; SMS réel et push réel non vérifiés (`docs/reprise-lead.md`) | à exécuter manuellement |
| Textes en français dans `notification_templates` | U | `apps/api/test/notifications-units.spec.ts` (« couvre chaque clé de la fiche avec ses canaux ») | couvert automatiquement |

### US-25 — Back-office : liste, détail, statut (SP04, SP11)

| Critère | Type | Fichier ou procédure | Statut |
|---|---|---|---|
| Filtres combinables, recherche par numéro, nom, téléphone | I + U | `apps/api/test/admin-orders-stock.spec.ts` (« filters by status, reception, payment, dates and searches number, name, phone ») ; `apps/admin/src/pages/orders/orders.test.tsx` | couvert automatiquement |
| Changement de statut limité aux transitions autorisées par rôle | I | `apps/api/test/admin-orders-stock.spec.ts` (« answers 409 INVALID_TRANSITION ») ; `apps/api/test/admin-backoffice-routes.spec.ts` | couvert automatiquement |
| Chaque action journalisée | I | `apps/api/test/admin-routes.spec.ts` (« records before/after on 3 admin write routes ») | couvert automatiquement (partiel) |
| Cycle complet jusqu'à « Livrée » depuis le back-office | E-W | Script SP11 non versionné ; parcours cible en partie B/A | non couvert (automatiquement) |

### US-26 — Back-office : fiche, fichiers HD, opérateur (SP08, SP11)

| Critère | Type | Fichier ou procédure | Statut |
|---|---|---|---|
| Fiche A4 : aperçus, tailles, quantités, opérateur, code-barres | I + A | `apps/api/test/production.spec.ts` (« returns an A4 PDF ») ; `apps/api/test/production-units.spec.ts` (encodage du code-barres) ; contenu visuel : `docs/qa/protocole-impression.md` | couvert automatiquement (partiel) |
| Boutons de téléchargement des fichiers HD | I + U | `apps/api/test/production.spec.ts` (« returns signed URLs valid 15 minutes ») ; `apps/admin/src/pages/production/production.test.tsx` (« obtient des liens HD à chaque demande ») | couvert automatiquement |
| Régénération possible | I + U | `apps/api/test/production.spec.ts` (« regenerating after a failure recovers the job ») ; `apps/admin/src/pages/production/production.test.tsx` (« régénère les fichiers ») | couvert automatiquement |
| Affectation d'un opérateur | I + U | `apps/api/test/production.spec.ts` (« assigns the operator ») ; `apps/admin/src/pages/production/production.test.tsx` (« affecte l'opérateur ») | couvert automatiquement |

### US-27 — Recommander ou dupliquer un design (SP03, SP04, SP10)

| Critère | Type | Fichier ou procédure | Statut |
|---|---|---|---|
| « Recommander » ajoute au panier aux prix actuels | I + U | `apps/api/test/cart-orders.spec.ts` (« re-adds lines at current prices ») ; `apps/mobile/src/features/orders/orders.test.tsx` (« reorders into the cart ») | couvert automatiquement |
| « Dupliquer » crée un brouillon modifiable | I | `apps/api/test/designs.spec.ts` (« duplicates into a new editable draft ») | couvert automatiquement |

### US-28 — Zones, affectation livreur, vue livreur (SP06, SP11)

| Critère | Type | Fichier ou procédure | Statut |
|---|---|---|---|
| Zones dessinées ou importées en GeoJSON | I + U | `apps/api/test/delivery.spec.ts` (« creates a zone from a GeoJSON Feature ») ; `apps/admin/src/pages/deliveries/deliveries.test.tsx` (« accepte Polygon, MultiPolygon, Feature et FeatureCollection ») | couvert automatiquement |
| Dessin de zone sur carte Leaflet | M | Procédure M-03 ; aucun test de dessin | à exécuter manuellement |
| Affectation d'un livreur | I + U | `apps/api/test/delivery.spec.ts` (« assigns a courier ») ; `apps/admin/src/pages/deliveries/deliveries.test.tsx` (« affecte un livreur ») | couvert automatiquement |
| Vue livreur : courses du jour, itinéraire, appel | U / M | `apps/admin/src/pages/courier/courier.test.tsx` (itinéraire) ; appel téléphonique non testé | à exécuter manuellement (partiel) |
| Saisie du code de remise (5 essais) | I + U | `apps/api/test/delivery.spec.ts` (« refuses wrong handover codes (5 tries max) ») ; `apps/admin/src/pages/courier/courier.test.tsx` (« refuse un code faux ») | couvert automatiquement |
| Saisie du solde encaissé | I + U | `apps/api/test/delivery.spec.ts` (« requires the collected amount to equal the balance ») ; `apps/admin/src/pages/courier/courier.test.tsx` | couvert automatiquement |
| Vue livreur utilisable sur téléphone (360 px) | M | Procédure M-04 | à exécuter manuellement |

### US-29 — Boutiques, créneaux, capacité (SP06, SP11)

| Critère | Type | Fichier ou procédure | Statut |
|---|---|---|---|
| Horaires par jour | I + U | `apps/api/test/delivery.spec.ts` (« computes opening hours ») ; `apps/admin/src/pages/pickup/pickup.test.tsx` (« valide les horaires ») | couvert automatiquement |
| Créneaux d'une heure sur 14 jours | I | `apps/api/test/delivery.spec.ts` (« generates 1-hour slots over 14 days ») | couvert automatiquement |
| Capacité par créneau | I + U | `apps/api/test/delivery.spec.ts` (« exactly 4 of 10 simultaneous reservations ») ; `apps/admin/src/pages/pickup/pickup.test.tsx` (« modifie une capacité ») | couvert automatiquement |

### US-30 — Entrées de stock et alertes (SP04, SP07, SP11)

| Critère | Type | Fichier ou procédure | Statut |
|---|---|---|---|
| Entrée de stock avec quantité et note | I + U | `apps/api/test/admin-orders-stock.spec.ts` (« records entries and adjustments ») ; `apps/admin/src/pages/stock/stock.test.tsx` (« enregistre une entrée de stock ») ; note : à vérifier | couvert automatiquement (partiel) |
| Alerte au back-office quand le disponible passe sous le seuil | I + U | `apps/api/test/admin-orders-stock.spec.ts` (« emits stock.below_threshold ») ; `apps/admin/src/pages/stock/stock.test.tsx` (« modifie le seuil d'alerte ») | couvert automatiquement (partiel) |
| E-mail au super admin sous le seuil | I | `apps/api/test/notifications.spec.ts` (« stock bas : e-mail aux comptes production et super_admin actifs uniquement ») | couvert automatiquement |

### US-31 — Import de motifs avec droits, couleurs, polices (SP03, SP11)

| Critère | Type | Fichier ou procédure | Statut |
|---|---|---|---|
| Image ≥ 4 000 px sur le grand côté | I | `apps/api/test/admin-catalog.spec.ts` (« refuses activation under 4 000 px ») | couvert automatiquement |
| PNG, JPG, SVG nettoyé ; 20 Mo maximum | I | `apps/api/test/admin-catalog.spec.ts` (« sanitizes SVG sources », « refuses an image over 20 MB ») ; `apps/api/test/media-upload.spec.ts` | couvert automatiquement |
| Activation impossible sans détenteur des droits | I | `apps/api/test/admin-catalog.spec.ts` (« refuses activation without rights holder ») | couvert automatiquement |
| Import avec Cloudinary réel | M | Adaptateur non testé avec Cloudinary réel (`docs/reprise-lead.md`) | non couvert (donnée manquante) |

### US-32 — Comptes, rôles, journal d'audit (SP02, SP11)

| Critère | Type | Fichier ou procédure | Statut |
|---|---|---|---|
| Création de comptes avec rôle | I + U | `apps/api/test/admin-routes.spec.ts` (« lists, creates, validates, updates, deactivates and resets TOTP ») ; `apps/admin/src/pages/team/team.test.tsx` | couvert automatiquement |
| Désactivation de compte | I | `apps/api/test/admin-auth.spec.ts` (« refuses refresh once the admin is deactivated ») | couvert automatiquement |
| Journal d'audit filtrable par entité | I | `apps/api/test/admin-routes.spec.ts` (« filters by entity ») | couvert automatiquement |

### US-33 — Tableau de bord de base (SP11)

| Critère | Type | Fichier ou procédure | Statut |
|---|---|---|---|
| Commandes, chiffre d'affaires, panier moyen sur une période | I | `apps/api/test/api-complements.spec.ts` (« defines days, revenue and tops precisely ») ; `apps/api/test/api-complements.spec.ts` (« defaults to the last 30 civil days ») | couvert automatiquement (panier moyen à vérifier) |
| Motifs et couleurs les plus vendus | I + U | `apps/api/test/api-complements.spec.ts` `apps/admin/src/pages/dashboard/dashboard.test.tsx` | couvert automatiquement (partiel) |

### US-34 — Journal des paiements et rapprochement (SP05, SP11)

| Critère | Type | Fichier ou procédure | Statut |
|---|---|---|---|
| Liste des paiements filtrable, numéro masqué | I + U | `apps/api/test/payments-admin.spec.ts` (« liste filtrable, numéro masqué ») ; `apps/admin/src/pages/payments/payments.test.tsx` | couvert automatiquement |
| Rapport de rapprochement quotidien | I | `apps/api/test/payments-admin.spec.ts` (« tout concorde : rapport sans écart ») ; file `payments-reconcile` à 02:00 (même fichier) | couvert automatiquement |
| Écarts mis en évidence | I | `apps/api/test/payments-admin.spec.ts` (« écarts : montant falsifié ») | couvert automatiquement |

## 3. Exigences non fonctionnelles et transverses

| Exigence (`docs/cahier-des-charges.md`) | Type | Fichier ou procédure | Statut |
|---|---|---|---|
| Temps de réponse API : 95 % < 500 ms depuis Lomé | Performance (k6) | Partie B (rapport de performance) ; mesure à faire sur la recette | à exécuter manuellement |
| Démarrage de l'app < 3 s sur Android 2 Go | M | Procédure performance (section 6) | à exécuter manuellement |
| Taille de l'app ≤ 40 Mo | M | Mesure de l'APK ou de l'AAB, procédure performance | à exécuter manuellement |
| Disponibilité 99,5 % par mois | Exploitation | Hors recette ; supervision à compléter | non couvert |
| Back-office utilisable dès 768 px | M / E-W | Vérification à 768 px ; aucun test de largeur identifié | à exécuter manuellement |
| HTTPS partout | Sécurité | Partie B ; aucun en-tête HSTS identifié dans `apps/api/src` | non couvert (à vérifier) |
| JWT courts et rotation des jetons de rafraîchissement | I | `apps/api/test/auth-customer.spec.ts` (« rotates the refresh token ») ; `apps/api/test/admin-auth.spec.ts` (« rotates, keeps the original 8 h cap ») | couvert automatiquement |
| Webhooks signés | I | `apps/api/test/payments.spec.ts` (« signature invalide ») | couvert automatiquement |
| RBAC sur chaque route admin | I + E-W | `apps/api/test/admin-orders-stock.spec.ts` (« requires a staff role on every admin order and stock route ») ; `apps/api/test/admin-routes.spec.ts` ; script de matrice rôle × route (partie B) | couvert automatiquement (matrice complète à produire) |
| Limitation de débit | I | `apps/api/test/auth-customer.spec.ts` (« limits to 3 sends per hour ») ; `apps/api/test/auth-customer.spec.ts` (« holds the limit under concurrent requests ») | couvert automatiquement |
| Sauvegardes quotidiennes, 30 jours, restauration testée | Exploitation | Aucun test ; procédure de restauration à écrire | non couvert |
| Données personnelles absentes des journaux et de Sentry | I | `apps/api/test/payments.spec.ts` (« numéro masqué ») ; `apps/api/src/config/sentry.spec.ts` ; `apps/api/test/seed-logs.spec.ts` (« never writes OTP codes ») | couvert automatiquement |

## 4. Appareils de test

| Appareil | Quantité | Usage | Statut |
|---|---|---|---|
| Android 2 Go de RAM, entrée de gamme | 1 (au minimum) | Démarrage à froid, images/s du studio, taille, parcours complet | à compléter (modèle, version Android) |
| Android entrée et milieu de gamme | 4 | Parcours d'achat, TalkBack, paiement, notifications | à compléter (modèles, versions) |
| iPhone | 1 | VoiceOver, parcours d'achat, notifications iOS | à compléter (modèle, version iOS) |
| Postes de bureau (Chrome, Firefox, Safari) | au moins 2 | Back-office, navigation clavier | à compléter |
| Tablette ou téléphone 360 px | 1 | Vue livreur web mobile | à compléter |

Les appareils doivent être réels. Un émulateur ne remplace pas la mesure sur le 2 Go.

## 5. Jeux de données et environnements

**Jeux de données**

| Jeu | Commande | Contenu | Limite |
|---|---|---|---|
| Seed minimal (paramètres, super admin) | `pnpm --filter api db:seed` | Réglages par défaut, un super admin | Ne crée ni motifs, ni commandes |
| Seed de démo | `pnpm --filter api db:seed:demo` | 10 commandes dans des statuts variés, comptes `<rôle>@demo.streetwear.local` (identifiants dans `apps/api/README.md`) | Aucune ligne `payments`, aucun fichier d'impression réel ; refusé en production |
| Catalogue réel | À compléter | Motifs avec droits, couleurs, polices | 30 motifs avec droits attendus de la marque (bloquant client) |
| Zones de livraison réelles | À compléter | Zones et frais | Données attendues de la marque (bloquant client) |

**Environnements**

| Environnement | Base et services | Paiement et SMS | Statut |
|---|---|---|---|
| Local (développeur) | PostgreSQL 16 et Redis 7 via `docker compose up -d` | Adaptateurs `fake` (paiement) et `console` (SMS) | disponible |
| CI | Workflow `.github/workflows/ci.yml` (lint, typecheck, test, build ; smoke test de l'API compilée) | Adaptateurs factices | disponible ; non exécuté sur GitHub à ce jour (`docs/reprise-lead.md`) |
| Recette | Reverse proxy, même origine pour le back-office et l'API ; `STORAGE_PROVIDER=s3` attendu | Agrégateur de test à compléter ; fournisseur SMS à compléter | à compléter |
| Pilote | Production, adaptateurs réels | Agrégateur réel, fournisseur SMS réel | à compléter (voir `docs/qa/pilote.md`) |

## 6. Procédures manuelles référencées

| Code | Procédure | Appareils | Critères |
|---|---|---|---|
| M-01 | Demander un code à un numéro réel, chronométrer la réception du SMS (départ de la requête, arrivée sur le téléphone), vérifier le texte et le nombre de chiffres. Répéter 10 fois. | Au moins 3 Android et l'iPhone | US-01 (< 30 s) |
| M-02 | Changer le statut d'une commande de test et relever la réception du push et du SMS, avec l'heure d'arrivée. Répéter pour chaque statut visible. | Android et iPhone | US-23, US-24 (60 s) |
| M-03 | Dessiner une zone sur la carte du back-office, l'importer en GeoJSON, puis vérifier l'affectation d'une adresse de test à cette zone. | Poste de bureau | US-28 |
| M-04 | Ouvrir la vue livreur à 360 px, vérifier la liste du jour, l'itinéraire, l'appel et la saisie du code. | Téléphone 360 px | US-28 |
| PERF-01 | Démarrage à froid (3 mesures médianes, application fermée puis tuée), images/s du studio (rotation et déplacement pendant 30 s), taille de l'AAB ou de l'APK. Consigner modèle d'appareil, version Android, réseau et charge. | Android 2 Go obligatoire | Démarrage < 3 s ; US-06 ; taille ≤ 40 Mo ; US-04 (< 100 ms) |

Les résultats de ces procédures se consignent dans `docs/qa/pv-recette.md`, les anomalies dans
`docs/qa/anomalies.md`.

## 7. Critères non couverts

Liste consolidée des critères sans test automatique ni procédure manuelle, ou dont le comportement
attendu n'est pas implémenté. Ces lignes doivent être traitées avant la recette ou acceptées
explicitement par le sponsor dans `docs/qa/pv-recette.md`.

| # | Story | Critère | Raison | Gravité probable |
|---|---|---|---|---|
| 1 | US-03 | Brouillon avec motif désactivé affiche « Motif indisponible » | Corrigé : AN-001 | corrigée |
| 2 | US-03 | Vignettes WebP ≤ 40 Ko | Aucun contrôle de taille testé | mineure |
| 3 | US-01 | Session de 30 jours | Durée non testée | mineure (à vérifier) |
| 4 | US-02 | Mot de passe ≥ 12 caractères | Non nommé dans les tests | majeure (à vérifier) |
| 5 | US-09 | 3 polices, couleurs or et rouge | Non nommé dans les tests | mineure (à vérifier) |
| 6 | US-11 | Dernier écrit gagne ; « Mes designs » triée | Pas de test de l'ordre ni de la résolution de conflit | mineure (à vérifier) |
| 7 | US-16 | Retour automatique depuis la page carte | Agrégateur réel absent | bloquante pour le pilote |
| 8 | US-15 | Paiement réel T-Money et Flooz | Agrégateur réel absent | bloquante pour le pilote |
| 9 | US-18 | Confirmation par webhook réel | Agrégateur réel absent | bloquante pour le pilote |
| 10 | US-24 | Push et SMS réels reçus dans les 60 s | Fournisseur SMS absent | bloquante pour le pilote |
| 11 | US-21 | Carte réelle et point posé sur appareil | Clé Google Maps absente | majeure |
| 12 | US-31 | Import avec Cloudinary réel | Non testé | majeure |
| 13 | US-25 | Cycle complet jusqu'à « Livrée » en E2E | Script non versionné | majeure (couverture) |
| 14 | Transverse | Sauvegardes testées | Procédure absente | bloquante avant lancement |
| 15 | Transverse | En-têtes HTTPS (HSTS) | Non identifié dans le code | majeure (à vérifier) |
| 16 | US-04, US-06, transverse | Performances mesurées sur Android 2 Go | Pas encore mesuré | bloquante (à mesurer) |

Les critères marqués « à exécuter manuellement » sont couverts par les procédures de la section 2
et par `docs/qa/protocole-accessibilite.md`, `docs/qa/protocole-impression.md` et `docs/qa/pv-recette.md`.
