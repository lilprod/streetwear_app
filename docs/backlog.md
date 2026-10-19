# Backlog MVP

34 user stories, 146 points. La colonne « SP » indique le sous-projet qui la livre ; une story
qui touche l'API et une interface est livrée par plusieurs sous-projets (API d'abord).

| ID | Story | Pts | Sprint | SP |
|---|---|---|---|---|
| US-01 | Connexion client par numéro +228 et code SMS | 5 | Phase 1 | SP02, SP10 |
| US-02 | Connexion admin e-mail + mot de passe + 2FA | 3 | Phase 1 | SP02, SP11 |
| US-03 | Parcourir et chercher les motifs | 5 | 1 | SP03, SP10 |
| US-04 | Choisir la couleur du t-shirt | 2 | 1 | SP09 |
| US-05 | Placer, redimensionner, pivoter un motif devant ou dos | 8 | 1 | SP09 |
| US-06 | Aperçu 2D temps réel devant et dos | 5 | 1 | SP09 |
| US-07 | Annuler / rétablir | 3 | 1 | SP09 |
| US-08 | Profil client | 2 | 1 | SP02, SP10 |
| US-09 | Ajouter un texte | 5 | 2 | SP09 |
| US-10 | Refus des mots interdits | 2 | 2 | SP03, SP09 |
| US-11 | Brouillon sauvegardé, même hors ligne | 5 | 2 | SP03, SP09 |
| US-12 | Fichiers d'impression 300 DPI par zone | 8 | 2 | SP08 |
| US-13 | Taille, quantité, prix TTC en direct | 3 | 2 | SP01, SP10 |
| US-14 | Panier multi-designs et multi-tailles | 5 | 2 | SP04, SP10 |
| US-15 | Payer en T-Money ou Flooz | 8 | 3 | SP05, SP10 |
| US-16 | Payer par carte | 3 | 3 | SP05, SP10 |
| US-17 | Paiement à la livraison avec acompte | 5 | 3 | SP04, SP05, SP10 |
| US-18 | Confirmation par webhook, expiration 30 min | 5 | 3 | SP04, SP05 |
| US-19 | Stock réservé à la commande, sorti au paiement ; tailles épuisées masquées | 5 | 3 | SP04 |
| US-20 | Récapitulatif, numéro, reçu PDF | 3 | 3 | SP04, SP10 |
| US-21 | Adresse avec point GPS, zone et frais | 5 | 4 | SP06, SP10 |
| US-22 | Retrait en boutique avec créneau | 3 | 4 | SP06, SP10 |
| US-23 | Suivi du statut | 3 | 4 | SP04, SP10 |
| US-24 | Push + SMS à chaque changement de statut | 5 | 4 | SP07, SP10 |
| US-25 | Back-office : liste, détail, statut | 5 | 4 | SP04, SP11 |
| US-26 | Back-office : fiche, fichiers HD, opérateur | 5 | 4 | SP08, SP11 |
| US-27 | Recommander / dupliquer un design | 2 | 4 | SP03, SP04, SP10 |
| US-28 | Zones, affectation livreur, vue livreur | 8 | 5 | SP06, SP11 |
| US-29 | Boutiques, créneaux, capacité | 3 | 5 | SP06, SP11 |
| US-30 | Entrées de stock et alertes | 3 | 5 | SP04, SP07, SP11 |
| US-31 | Import de motifs avec droits, couleurs, polices | 5 | 5 | SP03, SP11 |
| US-32 | Comptes, rôles, journal d'audit | 3 | 5 | SP02, SP11 |
| US-33 | Tableau de bord de base | 3 | 5 | SP11 |
| US-34 | Journal des paiements et rapprochement | 3 | 5 | SP05, SP11 |

## Critères d'acceptation

**US-01** — Le numéro est refusé s'il n'a pas 8 chiffres après +228. Le code (6 chiffres) arrive par SMS en moins de 30 s, expire après 5 min, accepte 5 essais. Au-delà de 3 envois par heure : message « Trop de demandes, réessaie dans X min ». Un nouveau numéro crée un compte ; l'app garde la session 30 jours.

**US-02** — Mot de passe ≥ 12 caractères, haché en argon2id. Le TOTP est obligatoire pour tous les rôles sauf `courier`. 5 échecs = compte bloqué 15 min. Session admin 8 h.

**US-03** — Les catégories s'affichent en onglets ; la recherche filtre par nom et par tag sans accent ni casse. Les vignettes arrivent en WebP ≤ 40 Ko. Un motif désactivé n'apparaît plus, mais un brouillon qui l'utilise affiche « Motif indisponible ».

**US-04** — Seules les couleurs actives sont proposées. Le changement de couleur est instantané (< 100 ms) dans l'aperçu.

**US-05** — Glisser déplace, pincer redimensionne, rotation à deux doigts. Le calque ne peut pas sortir de la zone A3. Le cadre de la zone s'affiche en pointillés pendant la manipulation.

**US-06** — Basculer devant/dos en un geste ; 60 images/s visées, 30 minimum sur Android 2 Go.

**US-07** — 30 niveaux d'annulation, conservés jusqu'à la fermeture du studio.

**US-08** — Nom obligatoire avant la première commande ; e-mail facultatif et validé.

**US-09** — 1 à 14 caractères ; 3 polices ; 3 couleurs (automatique selon la couleur du t-shirt, or, rouge) ; taille 8 à 80 mm ; placé au dos par défaut.

**US-10** — Le mot interdit est signalé dès la saisie (liste mise en cache) et refusé par l'API (`422 TEXT_REJECTED`) ; message « Ce texte ne peut pas être imprimé ».

**US-11** — Chaque modification est sauvegardée localement en moins d'une seconde ; synchronisée avec l'API au retour du réseau ; le dernier écrit gagne. Liste « Mes designs » triée par date.

**US-12** — Un PNG 300 DPI transparent par zone non vide, généré en moins de 60 s après le paiement. L'atelier valide 20 fichiers réels. Une erreur de rendu passe le travail en `failed` et alerte la production.

**US-13** — Le prix affiché par le mobile est identique au prix calculé par l'API (même fonction). Quantité 1 à 50.

**US-14** — Le même design peut être ajouté en plusieurs tailles ; une ligne indisponible est signalée et bloque la commande tant qu'elle n'est pas retirée.

**US-15** — Le client saisit son numéro, reçoit la demande sur son téléphone, l'app attend la confirmation (2 min max) puis affiche le succès ou l'échec avec « Réessayer ». Aucun double débit sur double appui (clé d'idempotence).

**US-16** — Paiement par carte via la page de l'agrégateur (redirection), retour automatique dans l'app.

**US-17** — L'acompte (50 % paramétrable) est payé en Mobile Money ; la commande passe `deposit_paid` ; le solde s'affiche au livreur et au client.

**US-18** — Seul un webhook à signature valide fait passer la commande en payée. Un webhook rejoué n'a aucun effet. Commande non payée en 30 min → `expired` et stock libéré.

**US-19** — Stock réservé à la création de la commande, sorti au paiement, libéré à l'expiration ou l'annulation. Disponible ≤ 0 → taille grisée « Épuisé ». Deux clients ne peuvent pas obtenir la dernière pièce.

**US-20** — Écran de confirmation avec numéro `TG-000124`, articles, total, réception, date estimée. Reçu PDF avec mentions légales et TVA incluse.

**US-21** — Le point GPS est obligatoire ; la zone et les frais s'affichent dès que le point est posé ; hors zone : « Nous ne livrons pas encore ici, choisis le retrait en boutique ».

**US-22** — Seuls les créneaux futurs avec places restantes sont proposés ; un créneau plein pendant la commande renvoie `SLOT_FULL` et l'app propose les créneaux suivants.

**US-23** — Les 5 étapes visibles avec date et heure ; rafraîchissement à l'ouverture et à la réception d'une notification.

**US-24** — Une notification push et un SMS par changement de statut visible du client, dans les 60 s ; textes en français dans `notification_templates`.

**US-25** — Filtres combinables, recherche par numéro, nom, téléphone ; changement de statut limité aux transitions autorisées par rôle ; chaque action journalisée.

**US-26** — Fiche A4 imprimable (aperçus, tailles, quantités, opérateur, code-barres du numéro) ; boutons de téléchargement des fichiers HD ; régénération possible.

**US-27** — « Recommander » ajoute les lignes au panier avec les prix actuels ; « Dupliquer » crée un nouveau brouillon modifiable.

**US-28** — Zones dessinées ou importées en GeoJSON ; affectation d'un livreur ; la vue livreur liste ses courses du jour avec itinéraire, appel, saisie du code de remise et du solde encaissé.

**US-29** — Horaires par jour ; génération des créneaux d'une heure sur 14 jours ; capacité par créneau.

**US-30** — Entrée de stock avec quantité et note ; alerte au back-office et e-mail au super admin quand le disponible passe sous le seuil.

**US-31** — Import d'image ≥ 4 000 px sur le grand côté, PNG/JPG/SVG nettoyé, 20 Mo max ; activation impossible sans détenteur des droits.

**US-32** — Création de comptes avec rôle ; désactivation ; journal d'audit filtrable par entité.

**US-33** — Commandes, chiffre d'affaires, panier moyen sur une période ; motifs et couleurs les plus vendus.

**US-34** — Liste des paiements filtrable ; rapport de rapprochement quotidien avec écarts mis en évidence.
