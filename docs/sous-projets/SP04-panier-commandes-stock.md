# SP04 — API : panier, commandes, stock

| | |
|---|---|
| **Agent** | `dev-backend` |
| **Modèle** | **`opus`** — surcharger le défaut de l'agent |
| **Vague** | 2 |
| **Dépend de** | SP02, SP03, SP06 (frais de zone, créneaux) |
| **Débloque** | SP05, SP07, SP08, SP10 (commande), SP11 (commandes, stock) |
| **Stories** | US-14, US-17, US-18 (expiration), US-19, US-20, US-23, US-25, US-27, US-30 |
| **Durée indicative** | 8 jours |

## Objectif

Transformer un panier en commande au prix juste, sans jamais vendre une pièce qui n'existe pas,
et faire évoluer la commande uniquement par les transitions autorisées.

## Lire d'abord

`CLAUDE.md`, `docs/modele-donnees.md` (Panier, commandes, stock ; machine à états ; règles
transactionnelles), `docs/contrat-api.md` (Panier, Commandes, routes admin commandes et
stock), `docs/spec-design.md` (prix, acompte), `docs/architecture.md` (événements, files).

## À faire

1. **Modèles Prisma** : `Cart`, `CartItem`, `Order`, `OrderItem`, `OrderStatusHistory`, `StockItem`, `StockMovement` ; séquence pour `number` (`TG-000001`).
2. **`cart`** : CRUD des lignes (fusion si même design + même taille) ; disponibilité par ligne ; `POST /cart/quote` (frais via `DeliveryService.quote()` de SP06, TVA incluse, dates estimées).
3. **`orders`** : création transactionnelle (règle 1 de `modele-donnees.md`) avec `Idempotency-Key` ; `design_snapshot` figé ; acompte si `cod` ; expiration après `order_expiry_minutes` (file `orders-expire`) ; lecture client ; reçu PDF (pdfkit, mentions légales, TVA incluse) ; `reorder`.
4. **`OrdersService.transition(orderId, to, actor, note?)`** : unique point de changement de statut ; vérifie `canTransition` (SP01) et les préconditions (opérateur, fichiers HD, livreur, code) ; écrit `order_status_history` ; émet `order.status_changed`.
5. **Écoute de `payment.succeeded` / `payment.failed`** (émis par SP05) : transition + mouvements de stock `out` dans la même transaction que la mise à jour du paiement (SP05 appelle `OrdersService.applyPaymentResult()` dans sa transaction).
6. **`stock`** : `StockReader` réel pour SP03 ; réservation avec `SELECT … FOR UPDATE` ; mouvements immuables ; `GET /admin/stock`, entrées et ajustements, seuils ; événement `stock.below_threshold`.
7. **Admin commandes** : liste filtrée (statut, réception, paiement, dates, recherche numéro/nom/téléphone) paginée par curseur ; détail ; `POST /admin/orders/:id/transitions` ; annulation avec libération de stock.

## Hors périmètre

Appels à l'agrégateur (SP05), notifications (SP07), rendu HD (SP08), affectation livreur (SP06).

## Critères d'acceptation

- [ ] Critères de US-14, 17, 19, 20, 23, 25, 27, 30 couverts par des tests d'intégration.
- [ ] **Test de concurrence** : 20 commandes simultanées pour 5 pièces en stock → exactement 5 réussissent, 15 reçoivent `409 OUT_OF_STOCK`, stock final cohérent.
- [ ] Même `Idempotency-Key` rejouée → même commande, aucune réservation en double.
- [ ] Le total d'une commande ne dépend jamais d'un prix envoyé par le client.
- [ ] Une commande expirée libère son stock (test avec horloge simulée).
- [ ] Toutes les transitions interdites renvoient `409 INVALID_TRANSITION`.
- [ ] La liste admin de 10 000 commandes répond en moins de 300 ms (index sur `status`, `created_at`, `user_id`).

## Prompt de délégation

```
Tu es l'agent dev-backend du projet Streetwear App. Réalise le sous-projet SP04 décrit dans
docs/sous-projets/SP04-panier-commandes-stock.md, sur la branche sp04-commandes. Lis d'abord
CLAUDE.md, docs/modele-donnees.md, docs/contrat-api.md, docs/spec-design.md et
docs/architecture.md. Toute modification de statut passe par OrdersService.transition et la
machine à états de packages/shared. Les opérations stock + commande + paiement sont
transactionnelles ; écris le test de concurrence demandé. Ne modifie pas docs/contrat-api.md :
signale tout écart. Termine par le compte rendu de docs/delegation.md.
```
