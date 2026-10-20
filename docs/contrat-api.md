# Contrat d'API v1

Ce document fige les routes et leurs formes pour que l'API, le mobile et le back-office
avancent en parallèle. Le lead technique en est le seul éditeur. L'OpenAPI généré par NestJS
(`/v1/docs`) doit lui correspondre ; en cas d'écart, ce document fait foi jusqu'à correction.

## Conventions

| Sujet | Règle |
|---|---|
| Base | `https://api.[domaine]/v1` ; JSON UTF-8 ; champs en camelCase |
| Authentification client | `Authorization: Bearer <accessToken>` (JWT 15 min, `sub` = user id, `typ` = `customer`) |
| Authentification admin | Même en-tête, `typ` = `admin`, `role` dans le jeton ; routes sous `/v1/admin/*` et `/v1/courier/*` |
| Idempotence | En-tête `Idempotency-Key` (UUID) **obligatoire** sur `POST /orders` et `POST /orders/:id/payments` ; même clé + même corps = même réponse |
| Pagination | `?cursor=<opaque>&limit=20` (max 100) → `{ "items": [...], "nextCursor": "…" | null }` |
| Montants | Entiers XOF, champs suffixés `Xof` |
| Dates | ISO 8601 UTC (`2026-11-23T14:02:00Z`) |
| Téléphone | E.164 (`+22890123456`) |
| Erreurs | `{ "error": { "code", "message", "details"? } }`, `message` en français |
| Limitation | 100 req/min par IP ; OTP : 3 envois/h par numéro → `429 RATE_LIMITED` |
| Version | Préfixe `/v1` ; champ ajouté = compatible ; champ retiré ou renommé = `/v2` |

## Codes d'erreur communs

| HTTP | `code` | Sens |
|---|---|---|
| 400 | `VALIDATION_FAILED` | Corps ou paramètres invalides ; `details` = erreurs Zod aplaties |
| 401 | `UNAUTHENTICATED` | Jeton absent, expiré ou invalide |
| 403 | `FORBIDDEN` | Rôle insuffisant |
| 404 | `NOT_FOUND` | Ressource absente ou non visible par l'appelant |
| 409 | `INVALID_TRANSITION` | Transition de statut interdite |
| 409 | `OUT_OF_STOCK` | `details.items` = lignes en rupture |
| 409 | `SLOT_FULL` | Créneau de retrait complet |
| 409 | `ORDER_NOT_PAYABLE` | Commande expirée, déjà payée ou annulée |
| 409 | `IDEMPOTENCY_CONFLICT` | Même clé, corps différent |
| 422 | `TEXT_REJECTED` | Texte du design refusé par la modération |
| 422 | `PATTERN_INACTIVE` | Motif désactivé dans le design |
| 429 | `RATE_LIMITED` | Trop de requêtes |
| 502 | `PROVIDER_UNAVAILABLE` | Agrégateur ou fournisseur SMS indisponible |
| 503 | `SERVICE_UNAVAILABLE` | `GET /health` : base ou Redis indisponible ; `details` = `{ db, redis }` |

`GET /v1/health` (public) → `200 { status: "ok", db: "ok", redis: "ok" }` ou `503 SERVICE_UNAVAILABLE`.

## Routes client (application mobile)

### Authentification et compte — SP02

| Méthode | Route | Corps / paramètres | Réponse |
|---|---|---|---|
| POST | `/auth/otp/request` | `{ phone }` | `204` |
| POST | `/auth/otp/verify` | `{ phone, code }` | `{ accessToken, refreshToken, user, isNewUser }` |
| POST | `/auth/oauth/apple` · `/auth/oauth/google` | `{ idToken }` | idem |
| POST | `/auth/refresh` | `{ refreshToken }` | `{ accessToken, refreshToken }` |
| POST | `/auth/logout` | `{ refreshToken }` | `204` |
| GET / PATCH | `/me` | PATCH `{ name?, email? }` | `User` |
| DELETE | `/me` | — | `204` (anonymisation) |
| GET / POST | `/me/addresses` | POST `AddressInput` | `Address[]` / `Address` |
| PATCH / DELETE | `/me/addresses/:id` | `AddressInput` partiel | `Address` / `204` |
| POST | `/me/push-tokens` | `{ token, platform }` | `204` |

```ts
type User = { id: string; phone: string; name: string | null; email: string | null; createdAt: string };
type AddressInput = { label: string; lat: number; lng: number; district: string; landmark: string; recipientPhone: string };
type Address = AddressInput & { id: string; zone: DeliveryZoneSummary | null };
```

### Catalogue — SP03

| Méthode | Route | Paramètres | Réponse |
|---|---|---|---|
| GET | `/catalog/categories` | — | `PatternCategory[]` |
| GET | `/catalog/patterns` | `category?`, `q?`, `cursor?` | `Page<Pattern>` |
| GET | `/catalog/patterns/:id` | — | `Pattern` |
| GET | `/catalog/colors` | — | `TshirtColor[]` |
| GET | `/catalog/fonts` | — | `Font[]` |
| GET | `/catalog/pricing` | — | `PriceRules` |
| GET | `/catalog/availability` | `colorId` | `{ sizes: { size: Size; available: boolean }[] }` |

```ts
type Pattern = { id: string; name: string; origin: string; categoryId: string; tags: string[];
  priceTier: 'standard' | 'premium'; thumbnailUrl: string; previewUrl: string; widthPx: number; heightPx: number };
type TshirtColor = { id: string; name: string; hex: string; isDark: boolean };
type Font = { id: string; name: string; family: string; fileUrl: string };
type PriceRules = { baseXof: number; patternStandardXof: number; patternPremiumXof: number; textXof: number };
type Size = 'XS' | 'S' | 'M' | 'L' | 'XL' | '2XL' | '3XL';
```

### Designs — SP03

| Méthode | Route | Corps | Réponse |
|---|---|---|---|
| GET | `/designs` | `?drafts=true` | `Page<Design>` |
| POST | `/designs` | `{ spec: DesignSpec, name? }` | `Design` |
| GET / PATCH / DELETE | `/designs/:id` | PATCH `{ spec?, name?, isDraft? }` | `Design` / `204` |
| POST | `/designs/:id/duplicate` | — | `Design` |
| POST | `/designs/:id/previews` | `{ front?: base64Png, back?: base64Png }` (≤ 500 Ko chacun) | `Design` |

```ts
type Design = { id: string; name: string | null; spec: DesignSpec; isDraft: boolean;
  previewFrontUrl: string | null; previewBackUrl: string | null; unitPriceXof: number; updatedAt: string };
```

### Panier — SP04

| Méthode | Route | Corps | Réponse |
|---|---|---|---|
| GET | `/cart` | — | `Cart` |
| POST | `/cart/items` | `{ designId, size, quantity }` | `Cart` |
| PATCH / DELETE | `/cart/items/:id` | `{ size?, quantity? }` | `Cart` |
| POST | `/cart/quote` | `{ reception: ReceptionInput }` | `Quote` |

```ts
type Cart = { items: CartItem[]; subtotalXof: number; itemCount: number };
type CartItem = { id: string; design: Design; size: Size; quantity: number; unitPriceXof: number; lineTotalXof: number; available: boolean };
type ReceptionInput = { type: 'home'; addressId: string } | { type: 'pickup'; storeId: string; slotId: string };
type Quote = { subtotalXof: number; deliveryFeeXof: number; totalXof: number; vatIncludedXof: number;
  estimatedReadyAt: string; estimatedDeliveryAt: string | null };
```

### Livraison et retrait — SP06

| Méthode | Route | Paramètres | Réponse |
|---|---|---|---|
| GET | `/delivery/zones/resolve` | `lat`, `lng` | `DeliveryZoneSummary` ou `404 NOT_FOUND` (hors zone) |
| GET | `/stores` | — | `Store[]` |
| GET | `/stores/:id/slots` | `date` (AAAA-MM-JJ) | `PickupSlot[]` |

```ts
type DeliveryZoneSummary = { id: string; name: string; feeXof: number; delayHours: number };
type Store = { id: string; name: string; address: string; lat: number; lng: number; openingHours: Record<string, string> };
type PickupSlot = { id: string; startsAt: string; endsAt: string; remaining: number };
```

### Commandes — SP04

| Méthode | Route | Corps | Réponse |
|---|---|---|---|
| POST | `/orders` | `{ reception: ReceptionInput, paymentMethod: 'tmoney' \| 'flooz' \| 'card' \| 'cod' }` + `Idempotency-Key` | `201 Order` (statut `pending_payment`) |
| GET | `/orders` | `cursor?` | `Page<OrderSummary>` |
| GET | `/orders/:id` | — | `Order` |
| GET | `/orders/:id/receipt.pdf` | — | PDF (commande payée uniquement) |
| POST | `/orders/:id/reorder` | — | `Cart` (lignes ajoutées au panier) |

```ts
type OrderStatus = 'pending_payment' | 'payment_failed' | 'expired' | 'paid' | 'deposit_paid' | 'in_production'
  | 'ready' | 'shipped' | 'ready_for_pickup' | 'delivered' | 'delivery_failed' | 'returned' | 'cancelled' | 'refunded';
type Order = { id: string; number: string; status: OrderStatus; items: OrderItem[]; subtotalXof: number;
  deliveryFeeXof: number; totalXof: number; depositXof: number | null; paymentMethod: string;
  reception: { type: 'home'; address: Address } | { type: 'pickup'; store: Store; slot: PickupSlot };
  history: { status: OrderStatus; at: string }[]; expiresAt: string | null; createdAt: string };
type OrderSummary = { id: string; number: string; status: OrderStatus; totalXof: number;
  paymentMethod: string; itemCount: number; createdAt: string };
type OrderItem = { id: string; design: { spec: DesignSpec; previewFrontUrl: string | null; previewBackUrl: string | null };
  colorId: string; size: Size; quantity: number; unitPriceXof: number; lineTotalXof: number };
```

### Paiements — SP05

| Méthode | Route | Corps | Réponse |
|---|---|---|---|
| POST | `/orders/:id/payments` | `{ method: 'tmoney' \| 'flooz' \| 'card', payerPhone? }` + `Idempotency-Key` | `{ paymentId, status: 'pending', amountXof, kind, nextAction }` |
| GET | `/payments/:id` | — | `{ paymentId, status, orderStatus }` (interrogé toutes les 3 s par le mobile, 2 min max) |
| POST | `/webhooks/payments/:provider` | Corps de l'agrégateur | `200` toujours si la signature est valide (idempotent) |

```ts
type NextAction = { type: 'approve_on_phone'; message: string } | { type: 'redirect'; url: string };
```

Pour `paymentMethod = 'cod'`, le mobile appelle `/orders/:id/payments` avec `tmoney` ou `flooz` :
l'API facture l'acompte (`kind = 'deposit'`).

## Routes back-office — `/v1/admin/*`

| Méthode | Route | Rôles | Sous-projet |
|---|---|---|---|
| POST | `/admin/auth/login` `{ email, password }` → `AdminLoginResult` | tous | SP02 |
| POST | `/admin/auth/totp` `{ challenge, code }` → `AdminSession` | tous | SP02 |
| POST | `/admin/auth/refresh` `{ refreshToken }` → `AdminSession` | tous | SP02 |
| POST | `/admin/auth/logout` `{ refreshToken }` → `204` | tous | SP02 |
| GET | `/admin/orders` `?status&receptionType&paymentMethod&from&to&q&cursor` | order_manager, production, logistics, super_admin | SP04 |
| GET | `/admin/orders/:id` | idem | SP04 |
| POST | `/admin/orders/:id/transitions` `{ to: OrderStatus, note? }` | selon la transition | SP04 |
| POST | `/admin/orders/:id/assign-operator` `{ operatorId }` | production, super_admin | SP08 |
| GET | `/admin/orders/:id/production-sheet.pdf` | production, super_admin | SP08 |
| GET | `/admin/order-items/:id/print-files` → `{ front?: signedUrl, back?: signedUrl }` | production, super_admin | SP08 |
| POST | `/admin/order-items/:id/print-files/regenerate` | production, super_admin | SP08 |
| GET / POST / PATCH | `/admin/delivery-zones` | logistics, super_admin | SP06 |
| GET | `/admin/deliveries` `?status&date` | logistics, super_admin | SP06 |
| POST | `/admin/deliveries/:id/assign` `{ courierId }` | logistics, super_admin | SP06 |
| GET / POST / PATCH | `/admin/stores`, `/admin/stores/:id/slots` | logistics, super_admin | SP06 |
| GET | `/admin/stock` | production, super_admin | SP04 |
| POST | `/admin/stock/movements` `{ colorId, size, type: 'in' \| 'adjust', quantity, note }` | production, super_admin | SP04 |
| PATCH | `/admin/stock/:id` `{ alertThreshold }` | production, super_admin | SP04 |
| GET / POST / PATCH | `/admin/patterns`, `/admin/pattern-categories`, `/admin/colors`, `/admin/fonts`, `/admin/price-rules` | super_admin | SP03 |
| POST | `/admin/media/upload-signature` `{ kind: 'pattern' \| 'font' }` | super_admin | SP03 |
| GET | `/admin/payments` `?status&from&to` · `/admin/reconciliations` | order_manager, super_admin | SP05 |
| GET / POST / PATCH | `/admin/users` (comptes équipe) | super_admin | SP02 |
| GET | `/admin/audit-logs` `?entity&entityId` | super_admin | SP02 |
| GET / PATCH | `/admin/settings` | super_admin | SP02 |
| GET / PATCH | `/admin/notification-templates` | super_admin | SP07 |
| GET | `/admin/stats/summary` `?from&to` → `{ ordersCount, revenueXof, averageOrderXof, byStatus, byReception, topPatterns, topColors }` | order_manager, super_admin | SP11 |

```ts
type AdminRole = 'super_admin' | 'order_manager' | 'production' | 'logistics' | 'courier';
type AdminUser = { id: string; email: string; name: string; role: AdminRole };
type AdminSession = { accessToken: string; refreshToken: string; expiresAt: string; user: AdminUser };
// Rôle courier : pas de TOTP, la session est renvoyée directement.
// Premier login d'un autre rôle : `enrollment` contient le secret TOTP à enregistrer.
type AdminLoginResult =
  | { type: 'session'; session: AdminSession }
  | { type: 'totp_required'; challenge: string; enrollment: { secret: string; otpauthUrl: string } | null };
```

- Session admin : jeton d'accès 15 min ; jeton de rafraîchissement valable 8 h, sans prolongation au-delà de 8 h après la connexion.
- Le back-office lit l'utilisateur dans `AdminSession.user`, jamais dans les claims du JWT.

## Routes livreur — `/v1/courier/*` (rôle `courier`)

| Méthode | Route | Corps | Réponse |
|---|---|---|---|
| GET | `/courier/deliveries` | `?date` (défaut : aujourd'hui) | `CourierDelivery[]` |
| POST | `/courier/deliveries/:id/start` | — | `CourierDelivery` |
| POST | `/courier/deliveries/:id/complete` | `{ handoverCode, codCollectedXof? }` | `CourierDelivery` |
| POST | `/courier/deliveries/:id/fail` | `{ reason: 'absent' \| 'refused' \| 'unreachable' \| 'other', note? }` | `CourierDelivery` |

```ts
type CourierDelivery = { id: string; orderNumber: string; customerName: string; customerPhone: string;
  address: Address; codBalanceXof: number | null; status: string; itemsCount: number };
```

## Webhooks sortants

Aucun au MVP.
