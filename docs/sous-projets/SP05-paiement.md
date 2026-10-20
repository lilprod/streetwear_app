# SP05 — API : paiement (T-Money, Flooz, carte), webhooks, rapprochement

| | |
|---|---|
| **Agent** | `integrateur-paiement` |
| **Modèle** | `opus` |
| **Vague** | 2 |
| **Dépend de** | SP04 |
| **Débloque** | SP10 (paiement), SP11 (journal des paiements), SP12 |
| **Stories** | US-15, US-16, US-17 (acompte), US-18, US-34 |
| **Durée indicative** | 7 jours |

## Objectif

Encaisser sans jamais débiter deux fois, sans jamais livrer une commande non payée, et pouvoir
prouver chaque jour que les paiements de l'agrégateur et les commandes concordent.

## Contexte du moment

L'agrégateur n'est pas encore choisi (PayGate Global, PayDunya ou CinetPay ; décision au comité
du 13 novembre 2026). Construire l'interface et l'adaptateur `fake` d'abord ; l'adaptateur réel
s'ajoute quand le lead complète cette section avec la documentation et les identifiants de
bac à sable.

## Lire d'abord

`CLAUDE.md`, `docs/decisions.md` (ADR-004), `docs/contrat-api.md` (Paiements),
`docs/modele-donnees.md` (Paiements ; règle transactionnelle 2), `docs/backlog.md` (US-15 à 18, 34).

## À faire

1. **Modèles Prisma** : `Payment`, `PaymentEvent`, `Reconciliation`.
2. **Interface `PaymentProvider`** : `initiate({ payment, order, method, payerPhone, returnUrl })` → `{ providerRef, nextAction }` ; `getStatus(providerRef)` ; `verifyWebhook(headers, rawBody)` → booléen ; `parseWebhook(rawBody)` → `{ providerRef, status, amountXof, raw }` ; `listTransactions(date)` pour le rapprochement.
3. **Adaptateur `fake`** : simule succès, échec, délai et webhook rejoué, piloté par le numéro de téléphone (ex. se terminant par `00` = échec) ; signature HMAC comme un vrai agrégateur.
4. **`POST /orders/:id/payments`** : vérifie que la commande est payable, calcule le montant (`full` ou `deposit`) côté serveur, crée le `Payment` avec `Idempotency-Key`, appelle `initiate`.
5. **`POST /webhooks/payments/:provider`** : corps brut conservé ; signature vérifiée ; `PaymentEvent` enregistré même si invalide ; traitement idempotent dans une transaction qui appelle `OrdersService.applyPaymentResult()` (SP04) ; montant reçu ≠ montant attendu → paiement `failed` + alerte, commande non payée.
6. **`GET /payments/:id`** : statut pour l'attente côté mobile ; si toujours `pending` après 60 s, interroge `getStatus` (filet si le webhook se perd).
7. **Rapprochement** : file `payments-reconcile` à 02:00 Africa/Lome ; compare `listTransactions` et `payments` ; écrit `Reconciliation` ; alerte si écart.
8. **Admin** : `GET /admin/payments`, `GET /admin/reconciliations`.
9. Journaux : jamais le numéro complet ni de données de carte ; masquer `+228 90 •• •• 56`.

## Hors périmètre

Remboursement par API (V1, mais prévoir la méthode optionnelle `refund` dans l'interface), écrans.

## Critères d'acceptation

- [ ] Critères de US-15 à 18 et 34 couverts par des tests d'intégration avec l'adaptateur `fake`.
- [ ] Webhook à signature invalide : enregistré, `401`, aucune transition.
- [ ] Même webhook reçu 3 fois : une seule transition, un seul mouvement de stock.
- [ ] Double appui « Payer » (même clé) : un seul `Payment`.
- [ ] Webhook perdu : la commande passe quand même payée via `getStatus` lors de l'interrogation.
- [ ] Montant falsifié dans le webhook : commande non payée, alerte émise.
- [ ] Ajouter un adaptateur réel ne demande aucun changement hors du dossier `payments/providers/`.

## Prompt de délégation

```
Tu es l'agent integrateur-paiement du projet Streetwear App. Réalise le sous-projet SP05
décrit dans docs/sous-projets/SP05-paiement.md, sur la branche sp05-paiement. Lis d'abord
CLAUDE.md, docs/decisions.md (ADR-004), docs/contrat-api.md, docs/modele-donnees.md et
docs/backlog.md. Commence par l'interface PaymentProvider et l'adaptateur fake ; n'invente
aucune API d'agrégateur réel : si la section « Contexte du moment » ne fournit pas sa
documentation, n'écris pas d'adaptateur réel. Chaque scénario de sécurité listé doit avoir
son test. Termine par le compte rendu de docs/delegation.md.
```
