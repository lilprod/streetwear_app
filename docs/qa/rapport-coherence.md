# Rapport de cohérence (SP12, partie B, item 4)

Date : 21/11/2026. Branche `sp12-coherence`. API et worker **compilés** (`node apps/api/dist/main.js`, `dist/worker.js`), PostgreSQL 16 et Redis 7 locaux, adaptateurs factices (paiement `fake`, SMS console, e-mail/push `fake`). Jeu de démo `db:seed:demo`. Les montants et statuts viennent de l'API réelle ; les contrôles SQL sont rejouables (champ `sql` de chaque `qa/results/coherence-*.json`).

## Rejouer

```
cp apps/api/.env.example apps/api/.env   # JWT_SECRET et FAKE_PAYMENT_WEBHOOK_SECRET >= 32 caractères, DATABASE_URL / REDIS_URL dédiés
pnpm --filter api build && pnpm --filter api prisma migrate deploy && pnpm --filter api db:seed:demo
bash qa/stack.sh start                    # API :3100 + worker, limite de débit relevée (RATE=100000)
node qa/coherence/run.mjs                 # ou un fichier : node qa/coherence/03-webhooks.mjs
bash qa/stack.sh stop
```

Les clients de test sont insérés en SQL avec un jeton signé par le `JWT_SECRET` local (`/auth/otp/verify` est limité à 10/min/IP ; le parcours OTP est couvert par le rapport de sécurité). Le délai d'expiration est ramené à 5 minutes (minimum accepté par `PATCH /admin/settings`) puis `expires_at` est avancé en SQL pour ne pas attendre 5 minutes ; l'expiration elle-même est faite par le worker réel (`REAL_WAIT=1` supprime l'accélération).

## Résultats : 14 scénarios, 13 conformes, 1 anomalie

| Scénario | Attendu | Obtenu | Verdict |
|---|---|---|---|
| C-STOCK-1 : 20 clients, dernière unité (terracotta S) | 1 × 201, 19 × 409 `OUT_OF_STOCK`, stock 1/1, 1 mouvement `reserve` | identique | OK |
| C-STOCK-2 : 12 clients, quantités 1 à 3, stock 5 | Somme acceptée <= 5, `reserved` = somme des lignes, jamais `reserved > on_hand` | 5 unités acceptées, `reserved` 5, aucune violation | OK |
| C-STOCK-3 : même `Idempotency-Key` ×5 en parallèle | 1 commande, 1 réservation (2 unités), créneau 1 | identique | OK |
| C-SLOT-1 : 15 clients, créneau de capacité 3 | 3 × 201, 12 × 409 `SLOT_FULL`, `booked` = 3, 3 retraits, aucune réservation de stock orpheline | identique | OK |
| C-WH-1 : succès rejoué ×3 | 3 × 200, `paid`, stock 9/0 (reserve → out une fois), événements `processed, duplicate, duplicate`, 1 job de production | identique | OK |
| C-WH-2 : 10 webhooks identiques simultanés | 1 `processed` + 9 `duplicate`, 1 mouvement `out` | identique | OK |
| C-WH-3 : falsifiés (mauvais secret, corps modifié, signature absente ou mal formée, agrégateur inconnu, montant 1 XOF, montant +1 000, devise EUR, JSON invalide signé, référence inconnue) | 401 ou ignoré ; commande jamais payée ; rejets conservés dans `payment_events` ; `amount_mismatch` : paiement `failed` + alerte équipe | identique | OK |
| C-PAY-1 : même clé ×5 ; même clé, corps différent | 1 paiement ; 409 `IDEMPOTENCY_CONFLICT` | identique | OK |
| C-PAY-2 : 5 clés différentes en parallèle | 1 × 201, 4 × 409 `payment_pending`, 1 ligne `payments` | identique | OK |
| C-PAY-3 : paiement après paiement réussi ; rejeu de la clé d'origine | 409 `ORDER_NOT_PAYABLE` ; même réponse sans nouveau débit | identique | OK |
| C-PAY-4 : deux paiements (> 2 min d'écart) qui réussissent tous deux | Commande payée une fois, stock sorti une fois, 2e paiement `succeeded` + `order_not_payable`, événement `unexpected_success`, alerte e-mail | identique | OK |
| C-EXP-1 : non payée → `expired` par le worker | Stock 1/0, créneau 0/1, `reserve` puis `release`, historique `system`, nouveau client peut racheter, **paiement `pending` → `expired`** | Tout conforme **sauf** le paiement resté `pending` | **KO (A-COH-2)** |
| C-EXP-2 : `payment_failed` → `expired` | Stock et créneau libérés | identique | OK |
| C-EXP-3 : succès sur commande expirée | 200, commande reste `expired`, `unexpected_success`, aucun `out`, aucun job de production, alerte | identique | OK |

Contrôles SQL de référence (réutilisés dans les scripts) :

```sql
SELECT on_hand, reserved FROM stock_items WHERE color_id='col-terracotta' AND size='S';          -- 1 | 1
SELECT booked, capacity FROM pickup_slots WHERE id='<slot>';                                     -- 3 | 3
SELECT outcome, signature_valid FROM payment_events WHERE provider_ref='<ref>' ORDER BY received_at;
SELECT type, sum(quantity) FROM stock_movements WHERE order_id='<id>' GROUP BY type;
SELECT id FROM stock_items WHERE on_hand < 0 OR reserved < 0 OR reserved > on_hand;              -- 0 ligne
SELECT id FROM pickup_slots WHERE booked > capacity OR booked < 0;                                -- 0 ligne
```

Aucune survente, aucun stock négatif, aucune capacité dépassée, aucun double débit non signalé ne sont apparus.

## Anomalies

| Id | Gravité | Sous-projet | Anomalie | Statut |
|---|---|---|---|---|
| A-COH-1 | **Majeure** | SP04 | **Une commande inexpugnable bloque l'expiration de toutes les autres.** `OrdersService.expireDue` ne rattrape que les `409` ; toute autre erreur (ex. contrainte `stock_items_quantities_check` si `reserved` est incohérent) fait échouer le job BullMQ entier, rejoué chaque minute sur les mêmes 200 plus anciennes commandes, sans aucun journal (le worker n'écoute pas l'événement `failed`). Constaté : 1 000 commandes échues non expirées pendant plus de 10 minutes. | **Corrigée** : erreur journalisée (sans donnée personnelle) et commande suivante traitée ; test Jest `keeps expiring the other orders…` (`apps/api/test/cart-orders.spec.ts`). Reste à faire (proposition) : journaliser les jobs `failed` du worker et alerter. |
| A-COH-2 | Mineure | SP05 / SP04 | Quand une commande expire, son paiement `pending` reste `pending` (le modèle prévoit `expired`). `GET /payments/:id` renvoie `pending` avec `orderStatus: expired` ; le succès tardif est bien traité (`unexpected_success`). Étapes : C-EXP-1. Attendu `payments.status = expired`, obtenu `pending`. | Ouverte (échec conservé dans `coherence-exp-1.json`). Correction à décider par le lead : toucher au statut d'un paiement relève d'une règle métier. |
| A-COH-3 | Mineure | SP05 | Un succès fournisseur arrivant **après** un `failed` (même paiement) est classé `duplicate` et ignoré ; un `amount_mismatch` rend aussi le paiement définitivement `failed`. Si le client a réellement été débité, seul le rapprochement quotidien le détecte. | Ouverte, à arbitrer avec l'agrégateur réel. |
| A-COH-4 | Mineure | SP04 | Le job d'expiration traite 200 commandes par minute (tri par échéance) : un afflux (ex. 2 400 commandes de charge) met plusieurs minutes à se résorber ; sans effet à 50 clients. | Ouverte. |
| A-COH-5 | Info | SP05 | Le filet `getStatus` (> 60 s) confirme un paiement `pending` lors de la création d'un nouveau paiement : le second débit est alors refusé, comportement sûr (utilisé pour dimensionner C-PAY-4). | Aucune action. |

## Limites

Adaptateur factice : le comportement d'un agrégateur réel (ordre des webhooks, délais, montants partiels, remboursements) n'est pas prouvé. Redis et PostgreSQL locaux, un seul processus API : la concurrence entre plusieurs instances n'est pas testée.
