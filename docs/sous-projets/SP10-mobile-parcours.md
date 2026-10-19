# SP10 — Mobile : parcours d'achat, compte, suivi

| | |
|---|---|
| **Agent** | `dev-mobile` |
| **Vague** | 2 (démarre en mode mock dès la vague 1 si un agent mobile est libre) |
| **Dépend de** | SP09 ; contrats SP02 à SP07 (API réelle au fil de leur livraison) |
| **Débloque** | SP12 (tests bout en bout mobile), publication sur les stores |
| **Stories** | US-01, US-03, US-08, US-13 à US-24, US-27 |
| **Durée indicative** | 12 jours |

## Objectif

Tout le reste de l'application autour du studio : accueil, connexion par SMS, taille et
quantité, panier, livraison ou retrait, paiement, confirmation, suivi, compte.

## Lire d'abord

`CLAUDE.md`, `docs/contrat-api.md` (toutes les routes client), `docs/design-system.md`,
`docs/backlog.md`, `docs/cahier-des-charges.md`, et les écrans 01 et 03 à 08 du canevas de
maquettes.

## À faire (`apps/mobile/src/`)

1. **Navigation** (Expo Router) : onglets Accueil, Studio, Commandes, Compte ; pile d'achat Studio → Taille → Panier → Connexion (si non connecté) → Réception → Paiement → Confirmation.
2. **Composants du design system** : `PrimaryButton`, `SecondaryButton`, `Segmented`, `Tabs`, `SizePicker`, `Stepper`, `PriceRow`, `StatusBadge`, `Timeline`, `BottomBar`, `TabBar` avec les jetons de `packages/ui-tokens`.
3. **Accueil** : collection mise en avant, motifs, reprise du dernier brouillon.
4. **Connexion** : numéro +228 avec formatage, code à 6 chiffres (remplissage automatique SMS sur Android, `one-time-code` sur iOS), Apple et Google ; stockage sécurisé des jetons (expo-secure-store) ; rafraîchissement automatique.
5. **Taille et quantité, panier** : tailles indisponibles barrées « Épuisé » ; quantité 1–50 ; lignes indisponibles signalées ; devis.
6. **Réception** : carte (react-native-maps) avec point déplaçable, résolution de zone en direct, repère, téléphone ; hors zone → proposition du retrait ; retrait : boutique, jours, créneaux restants ; `SLOT_FULL` géré.
7. **Paiement** : choix T-Money, Flooz, carte, paiement à la livraison (acompte) ; `POST /orders` puis `/orders/:id/payments` avec `Idempotency-Key` générée une fois par tentative ; attente de validation (interrogation 3 s, 2 min max) avec message « Valide sur ton téléphone » ; carte : navigateur intégré puis retour ; échec : « Réessayer ».
8. **Confirmation et suivi** : numéro, total, date estimée, chronologie des statuts, reçu PDF, « Nous écrire » (lien WhatsApp vers le numéro de la marque), « Recommander ».
9. **Notifications** : demande d'autorisation après la première commande (pas au lancement) ; enregistrement du jeton ; ouverture de la commande au toucher.
10. **Compte** : profil, adresses, mes designs, mes commandes, déconnexion, suppression du compte (confirmation explicite), mentions légales, CGV.
11. **États** : chargement (squelettes), vide, erreur réseau avec « Réessayer », hors ligne (bandeau) sur chaque écran.
12. **Mode mock** commun avec SP09 ; bascule écran par écran vers l'API réelle quand elle est disponible.

## Critères d'acceptation

- [ ] Critères des stories listées vérifiés sur Android 2 Go de RAM et iPhone.
- [ ] Ouverture à froid < 3 s ; binaire Android ≤ 40 Mo.
- [ ] Un double appui sur « Payer » ne crée qu'un paiement (vérifié contre l'adaptateur `fake` de SP05).
- [ ] Coupure réseau pendant l'attente de paiement : à la reprise, l'app retrouve le bon statut.
- [ ] Parcours complet réussi en mode mock et contre l'API de recette.
- [ ] Lecteur d'écran (TalkBack, VoiceOver) : parcours d'achat réalisable de bout en bout.

## Prompt de délégation

```
Tu es l'agent dev-mobile du projet Streetwear App. Réalise le sous-projet SP10 décrit dans
docs/sous-projets/SP10-mobile-parcours.md, sur la branche sp10-parcours. Lis d'abord
CLAUDE.md, docs/contrat-api.md, docs/design-system.md, docs/backlog.md et
docs/cahier-des-charges.md. Réutilise le studio de SP09 sans le modifier (demande un
changement si besoin). Types et validations viennent de packages/shared/contracts. Développe
en mode mock puis branche chaque écran sur l'API dès qu'elle existe. Ne modifie pas
docs/contrat-api.md : signale tout écart. Termine par le compte rendu de docs/delegation.md.
```
