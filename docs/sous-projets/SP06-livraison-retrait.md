# SP06 — API : livraison, zones, livreurs, boutiques, créneaux

| | |
|---|---|
| **Agent** | `dev-backend` |
| **Vague** | 1 |
| **Dépend de** | SP00, SP01, SP02 (adresses, rôle `courier`) |
| **Débloque** | SP04 (frais et créneaux dans la commande), SP10, SP11 (livraisons, vue livreur) |
| **Stories** | US-21, US-22, US-28, US-29 |
| **Durée indicative** | 5 jours |

## Objectif

Savoir à partir d'un point GPS si on livre et combien ça coûte, réserver un créneau de retrait
sans surbooking, et donner aux livreurs leurs courses du jour.

## Lire d'abord

`CLAUDE.md`, `docs/contrat-api.md` (Livraison et retrait, routes admin livraison, routes
livreur), `docs/modele-donnees.md` (Livraison et retrait ; règle 3), `docs/backlog.md`.

## À faire

1. **Modèles Prisma** : `DeliveryZone`, `Courier`, `Delivery`, `Store`, `PickupSlot`, `Pickup` ; seed : 3 zones de Lomé (Lomé centre 1 000 FCFA / 24 h, périphérie 1 500 / 48 h, Grand Lomé 2 500 / 48 h — polygones approximatifs à faire valider par la marque) et 1 boutique fictive `[Nom de la boutique]`.
2. **Résolution de zone** : point dans polygone (implémentation pure TypeScript ou PostGIS si disponible sur l'hébergeur ; documenter le choix) ; implémenter l'interface `ZoneResolver` de SP02 pour remplir `Address.zone`.
3. **Public** : `GET /delivery/zones/resolve`, `GET /stores`, `GET /stores/:id/slots` (créneaux futurs, `remaining > 0`).
4. **`DeliveryService`** pour SP04 : `quote(reception)` → frais et dates estimées ; `reserve(reception, orderId, tx)` → crée `Delivery` (code de remise à 6 chiffres haché) ou réserve le créneau (règle 3) dans la transaction de commande ; `release(orderId, tx)`.
5. **Admin** : CRUD zones (import GeoJSON), boutiques, horaires ; génération des créneaux d'une heure sur 14 jours (tâche quotidienne) ; liste des livraisons du jour ; `assign` d'un livreur.
6. **Livreur** : `/courier/deliveries` (ses courses du jour), `start`, `complete` (vérifie le code ; en paiement à la livraison, exige `codCollectedXof` = solde), `fail` ; appelle `OrdersService.transition` de SP04 (interface injectée ; adaptateur factice tant que SP04 n'est pas fusionné).

## Hors périmètre

Partenaires de livraison externes (V1), livraison hors Grand Lomé (V1), écrans.

## Critères d'acceptation

- [ ] Critères de US-21, 22, 28, 29 couverts par des tests.
- [ ] Un point à Tokoin renvoie « Lomé centre » ; un point en mer renvoie `404`.
- [ ] 10 réservations simultanées sur un créneau de capacité 4 : exactement 4 réussissent.
- [ ] Un livreur ne voit que ses courses ; un code de remise faux est refusé et compté (5 essais max).
- [ ] Le code de remise n'est jamais renvoyé par l'API admin ni stocké en clair.

## Prompt de délégation

```
Tu es l'agent dev-backend du projet Streetwear App. Réalise le sous-projet SP06 décrit dans
docs/sous-projets/SP06-livraison-retrait.md, sur la branche sp06-livraison. Lis d'abord
CLAUDE.md, docs/contrat-api.md, docs/modele-donnees.md et docs/backlog.md. Expose
DeliveryService (quote, reserve, release) pour SP04 et implémente ZoneResolver défini par
SP02. Si SP04 n'est pas encore fusionné, dépends d'une interface et d'un adaptateur factice.
Ne modifie pas docs/contrat-api.md : signale tout écart. Termine par le compte rendu de
docs/delegation.md.
```
