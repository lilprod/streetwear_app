# SP07 — Notifications push et SMS

| | |
|---|---|
| **Agent** | `dev-backend` |
| **Modèle** | `sonnet` (modèles de messages → `taches-simples`) |
| **Vague** | 2 |
| **Dépend de** | SP02 (jetons push, `SmsProvider`), SP04 (événements de commande) |
| **Débloque** | SP10 (réception des notifications), SP11 (modèles) |
| **Stories** | US-24, US-30 (alerte stock) |
| **Durée indicative** | 4 jours |

## Objectif

Prévenir le client à chaque étape de sa commande, par push et par SMS, en français, en moins de
60 secondes, et prévenir l'équipe des ruptures de stock.

## Lire d'abord

`CLAUDE.md`, `docs/architecture.md` (événements, file `notifications`), `docs/modele-donnees.md`
(Production et notifications), `docs/contrat-api.md` (`/admin/notification-templates`).

## À faire

1. **Modèles Prisma** : `NotificationTemplate`, `Notification` ; seed des modèles en français :

   | Clé | Push (titre / corps) | SMS |
   |---|---|---|
   | `order.paid` | « Commande confirmée » / « {{orderNumber}} est payée, on lance la production. » | « [MARQUE] : commande {{orderNumber}} confirmée. Suivi dans l'app. » |
   | `order.in_production` | « En production » / « Ton t-shirt est à l'atelier. » | — (push seul) |
   | `order.ready_for_pickup` | « Prête au retrait » / « Code de retrait : {{pickupCode}} » | « [MARQUE] : {{orderNumber}} prête. Code de retrait {{pickupCode}}. » |
   | `order.shipped` | « En route » / « Le livreur arrive. Code de remise : {{handoverCode}} » | « [MARQUE] : {{orderNumber}} en livraison. Code de remise {{handoverCode}}. » |
   | `order.delivered` | « Livrée » / « Merci ! Montre-nous ton t-shirt. » | — |
   | `order.payment_failed` | « Paiement non abouti » / « Réessaie depuis l'app. » | — |
   | `order.expired` | « Commande expirée » / « Ton panier t'attend. » | — |
   | `stock.below_threshold` | (admin, e-mail) « Stock bas : {{color}} {{size}} ({{available}}) » | — |

   SMS ≤ 160 caractères GSM-7 (sans emoji) ; un test le vérifie pour chaque modèle.
2. **Écoute** de `order.status_changed` et `stock.below_threshold` → file BullMQ `notifications` (3 essais, attente exponentielle).
3. **`PushProvider`** + adaptateur Expo Push (lots de 100, gestion des reçus, suppression des jetons `DeviceNotRegistered`) + adaptateur factice.
4. **Adaptateur SMS réel** pour `SmsProvider` (fournisseur à choisir par le lead : agrégateur SMS local ou international couvrant Togocom et Moov ; laisser l'adaptateur `console` par défaut tant que non choisi).
5. **`EmailProvider`** minimal pour les alertes admin (adaptateur factice + SMTP).
6. **Admin** : `GET/PATCH /admin/notification-templates` (aperçu avec variables d'exemple).
7. Les codes de retrait et de remise ne sont envoyés qu'au client concerné et ne sont jamais journalisés en clair.

## Critères d'acceptation

- [ ] Critères de US-24 et de l'alerte de US-30 couverts par des tests.
- [ ] Un changement de statut produit au plus un push et un SMS (idempotence par `orderId + status`).
- [ ] Un fournisseur en panne n'empêche jamais la transition de commande (envoi asynchrone).
- [ ] Les jetons push invalides sont supprimés après le premier reçu d'erreur.

## Prompt de délégation

```
Tu es l'agent dev-backend du projet Streetwear App. Réalise le sous-projet SP07 décrit dans
docs/sous-projets/SP07-notifications.md, sur la branche sp07-notifications. Lis d'abord
CLAUDE.md, docs/architecture.md, docs/modele-donnees.md et docs/contrat-api.md. Tout envoi
passe par une file BullMQ et une interface de fournisseur avec un adaptateur factice. Ne choisis
pas toi-même le fournisseur SMS réel : laisse l'adaptateur console par défaut et indique dans ton
compte rendu ce qu'il faut pour brancher le vrai. Termine par le compte rendu de
docs/delegation.md.
```
