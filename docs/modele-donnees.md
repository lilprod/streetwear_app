# Modèle de données (PostgreSQL)

Le schéma Prisma (`apps/api/prisma/schema.prisma`) est la référence exécutable ; ce document
en est la spécification. Clés primaires `id` en UUID v7 (`uuid` généré côté API), colonnes
`created_at` et `updated_at` sur toutes les tables, montants en `integer` XOF.

## Tables par domaine

### Clients et accès (SP02)

| Table | Colonnes clés | Règles |
|---|---|---|
| `users` | `phone` (unique, E.164), `name`, `email?`, `apple_sub?`, `google_sub?`, `deleted_at?` | Suppression = anonymisation (téléphone haché, nom vidé) ; les commandes restent |
| `addresses` | `user_id`, `label`, `lat`, `lng`, `district` (quartier), `landmark` (repère), `recipient_phone`, `zone_id?` | Point GPS obligatoire |
| `otp_codes` | `phone`, `code_hash`, `expires_at`, `attempts`, `consumed_at?` | Code jamais stocké en clair |
| `refresh_tokens` | `user_id` ou `admin_user_id`, `token_hash`, `family_id`, `expires_at`, `revoked_at?` | Rotation : réutilisation d'un jeton révoqué = révocation de toute la famille |
| `push_tokens` | `user_id`, `token`, `platform` | Unique par `token` |
| `admin_users` | `email` (unique), `password_hash` (argon2id), `role`, `totp_secret?`, `active` | `role` ∈ `super_admin`, `order_manager`, `production`, `logistics`, `courier` |
| `audit_logs` | `admin_user_id`, `action`, `entity`, `entity_id`, `before` (jsonb), `after` (jsonb) | Toute écriture admin est journalisée |
| `settings` | `key` (unique), `value` (jsonb) | Ex. `cod_deposit_percent`, `order_expiry_minutes`, `payment_methods_enabled` |

### Catalogue et designs (SP03)

| Table | Colonnes clés | Règles |
|---|---|---|
| `pattern_categories` | `slug`, `name`, `position` | |
| `patterns` | `category_id`, `name`, `origin`, `tags` (text[]), `price_tier` (`standard`/`premium`), `image_public_id`, `width_px`, `height_px`, `rights_holder`, `rights_proof_url`, `active` | Activation refusée sans `rights_holder` ; `width_px` ≥ 4 000 sur le grand côté |
| `tshirt_colors` | `name`, `hex`, `is_dark`, `active`, `position` | |
| `fonts` | `name`, `family`, `file_public_id`, `license_ref`, `active` | |
| `price_rules` | `key` (`base`, `pattern_standard`, `pattern_premium`, `text`), `amount_xof` | Lu par `packages/shared/pricing` via l'API |
| `banned_words` | `word` | Modération du texte |
| `designs` | `user_id`, `spec` (jsonb, `DesignSpec`), `spec_version`, `preview_front_url?`, `preview_back_url?`, `is_draft`, `name?` | `spec` validé par Zod à chaque écriture |

### Panier, commandes, stock (SP04)

| Table | Colonnes clés | Règles |
|---|---|---|
| `carts` | `user_id` (unique), `updated_at` | Un panier actif par client |
| `cart_items` | `cart_id`, `design_id`, `size`, `quantity` | `size` ∈ `XS,S,M,L,XL,2XL,3XL` ; `quantity` 1–50 |
| `orders` | `number` (unique, `TG-000001`), `user_id`, `status`, `subtotal_xof`, `delivery_fee_xof`, `total_xof`, `vat_included_xof`, `payment_method`, `deposit_xof?`, `reception_type` (`home`/`pickup`), `expires_at?`, `idempotency_key` (unique) | Voir machine à états |
| `order_items` | `order_id`, `design_snapshot` (jsonb, copie figée du `DesignSpec`), `color_id`, `size`, `quantity`, `unit_price_xof`, `print_file_front_url?`, `print_file_back_url?` | Prix et design figés à la commande |
| `order_status_history` | `order_id`, `from_status`, `to_status`, `actor_type` (`system`/`admin`/`customer`/`provider`), `actor_id?`, `note?` | Ligne créée à chaque transition |
| `stock_items` | `color_id`, `size`, `on_hand`, `reserved`, `alert_threshold` | Unique (`color_id`, `size`) ; disponible = `on_hand − reserved` |
| `stock_movements` | `stock_item_id`, `type` (`in`, `reserve`, `release`, `out`, `adjust`), `quantity`, `order_id?`, `admin_user_id?`, `note?` | Jamais modifiée ni supprimée |

### Paiements (SP05)

| Table | Colonnes clés | Règles |
|---|---|---|
| `payments` | `order_id`, `provider`, `method` (`tmoney`, `flooz`, `card`), `kind` (`full`, `deposit`, `balance`), `amount_xof`, `status` (`pending`, `succeeded`, `failed`, `expired`, `refunded`), `provider_ref?`, `idempotency_key` (unique), `payer_phone?` | Montant toujours recalculé côté serveur |
| `payment_events` | `payment_id?`, `provider`, `raw` (jsonb), `signature_valid`, `received_at`, `processed_at?` | Chaque webhook stocké brut, même invalide |
| `reconciliations` | `date`, `provider`, `matched`, `mismatches` (jsonb) | Rapport quotidien |

### Livraison et retrait (SP06)

| Table | Colonnes clés | Règles |
|---|---|---|
| `delivery_zones` | `name`, `polygon` (jsonb GeoJSON), `fee_xof`, `delay_hours`, `active` | Résolution par point dans polygone |
| `couriers` | `admin_user_id`, `phone`, `active` | Rôle `courier` |
| `deliveries` | `order_id` (unique), `address_snapshot` (jsonb), `zone_id`, `fee_xof`, `courier_id?`, `handover_code_hash`, `cod_balance_xof?`, `cod_collected_xof?`, `status` (`to_assign`, `assigned`, `in_progress`, `delivered`, `failed`) | Code de remise à 6 chiffres envoyé au client |
| `stores` | `name`, `address`, `lat`, `lng`, `opening_hours` (jsonb), `active` | |
| `pickup_slots` | `store_id`, `starts_at`, `ends_at`, `capacity`, `booked` | `booked ≤ capacity`, verrou ligne à la réservation |
| `pickups` | `order_id` (unique), `slot_id`, `pickup_code_hash`, `collected_at?` | |

### Production et notifications (SP07, SP08)

| Table | Colonnes clés | Règles |
|---|---|---|
| `production_jobs` | `order_id`, `operator_id?`, `status` (`queued`, `rendering`, `ready_to_print`, `printed`, `failed`), `error?` | |
| `notification_templates` | `key` (`order.paid`, …), `channel` (`push`, `sms`), `title?`, `body` | Variables `{{orderNumber}}`, `{{status}}` |
| `notifications` | `user_id?`, `admin_user_id?`, `template_key`, `channel`, `payload` (jsonb), `status` (`queued`, `sent`, `failed`), `provider_ref?`, `error?` | |

## Machine à états d'une commande

Implémentée **une seule fois** dans `packages/shared/order-state-machine.ts` et appliquée par
`OrdersService.transition()`.

```
pending_payment ──payment ok (full)────► paid ─────────┐
       │        ──payment ok (deposit)─► deposit_paid ─┤
       │                                               ▼
       ├──payment ko──► payment_failed ──(nouvel essai)──► pending_payment
       └──30 min──────► expired                     in_production
                                                       │
                                                       ▼
                                                     ready
                                             ┌─────────┴──────────┐
                                    (home)   ▼                    ▼ (pickup)
                                          shipped          ready_for_pickup
                                       ┌─────┴──────┐             │
                                       ▼            ▼             ▼
                                   delivered  delivery_failed  delivered
                                                 │   └──► shipped (nouvelle tentative)
                                                 ▼
                                              returned

cancelled : depuis pending_payment, paid, deposit_paid (admin, avant production)
refunded  : depuis cancelled ou returned (super_admin)
```

| Transition | Qui | Effets |
|---|---|---|
| `pending_payment → paid / deposit_paid` | Webhook paiement | Stock `reserve → out`, file `render-print-files`, notification |
| `pending_payment → expired` | Job `orders-expire` | Stock `release` |
| `paid → in_production` | `production` | Affectation opérateur requise |
| `in_production → ready` | `production` | Fichiers HD présents requis |
| `ready → shipped` | `logistics` | Livreur affecté requis |
| `ready → ready_for_pickup` | `logistics` | Code de retrait envoyé |
| `shipped → delivered` | `courier` | Code de remise valide ; si paiement à la livraison, solde encaissé saisi |
| `* → cancelled` | `order_manager`, `super_admin` | Stock `release` ou `adjust` |

Toute autre transition renvoie `409 INVALID_TRANSITION`.

## Règles transactionnelles

1. **Création de commande :** dans une transaction, lire les prix (`price_rules`), recalculer chaque ligne, réserver le stock (`SELECT … FOR UPDATE` sur `stock_items`), créer `orders` + `order_items` + `stock_movements(reserve)`. Stock insuffisant → `409 OUT_OF_STOCK` avec les lignes concernées.
2. **Webhook de paiement :** dans une transaction, vérifier la signature, verrouiller la commande, rendre l'opération idempotente (`provider_ref` déjà traité → 200 sans effet), vérifier le montant, puis transition + mouvements de stock `out`.
3. **Réservation de créneau :** `UPDATE pickup_slots SET booked = booked + 1 WHERE id = $1 AND booked < capacity` ; 0 ligne → `409 SLOT_FULL`.
