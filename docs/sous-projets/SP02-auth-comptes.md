# SP02 — API : authentification, comptes, équipe, réglages, audit

| | |
|---|---|
| **Agent** | `dev-backend` |
| **Modèle** | `sonnet` |
| **Vague** | 1 |
| **Dépend de** | SP00, SP01 |
| **Débloque** | SP04, SP10 (connexion), SP11 (connexion admin) |
| **Stories** | US-01, US-02, US-08, US-32 |
| **Durée indicative** | 6 jours |

## Objectif

Les clients se connectent par code SMS, l'équipe par e-mail + mot de passe + TOTP ; chaque
route est protégée par type de compte et par rôle ; chaque écriture admin est journalisée.

## Lire d'abord

`CLAUDE.md`, `docs/decisions.md` (ADR-005), `docs/contrat-api.md` (sections Authentification
et compte, routes admin `auth`, `users`, `audit-logs`, `settings`), `docs/modele-donnees.md`
(Clients et accès), `docs/backlog.md` (US-01, 02, 08, 32).

## À faire (`apps/api/src/modules/`)

1. **Modèles Prisma** : `User`, `Address`, `OtpCode`, `RefreshToken`, `PushToken`, `AdminUser`, `AuditLog`, `Setting` ; migration ; seed (1 super admin depuis variables d'environnement, réglages par défaut : `cod_deposit_percent=50`, `order_expiry_minutes=30`, `payment_methods_enabled`, `print_zones`).
2. **`SmsProvider`** (interface `send(phone, text)`) + adaptateur `console` (dev/test) ; l'adaptateur réel sera ajouté par SP07.
3. **`auth`** : OTP (6 chiffres, haché, 5 min, 5 essais, 3 envois/h/numéro), JWT accès 15 min et rafraîchissement 30 jours avec rotation par famille et détection de réutilisation ; vérification des `idToken` Apple et Google (JWKS) ; gardes `CustomerAuthGuard`, `AdminAuthGuard`, décorateur `@Roles(...)`.
4. **Admin** : connexion e-mail + mot de passe (argon2id) → défi TOTP (otplib) ; enrôlement TOTP au premier login (QR) ; verrouillage 15 min après 5 échecs ; session 8 h.
5. **`users`** : `/me` (GET, PATCH, DELETE avec anonymisation), adresses (CRUD ; `zone` laissée `null`, SP06 la remplira via un service injectable `ZoneResolver` dont tu fournis l'interface), jetons push.
6. **`admin-users`** : CRUD des comptes équipe (super_admin), désactivation, réinitialisation TOTP.
7. **`audit`** : intercepteur qui journalise toute requête admin en écriture (`action`, `entity`, `entityId`, `before`, `after`) ; `GET /admin/audit-logs`.
8. **`settings`** : `GET/PATCH /admin/settings` avec schéma Zod par clé ; service `SettingsService.get<T>(key)` mis en cache 60 s, utilisé par les autres modules.
9. Limitation de débit (`@nestjs/throttler`) : globale et spécifique OTP.

## Hors périmètre

Envoi réel de SMS (SP07), résolution de zone (SP06), écrans (SP10, SP11).

## Critères d'acceptation

- [ ] Critères de US-01, 02, 08, 32 dans `docs/backlog.md` couverts par des tests d'intégration.
- [ ] Un jeton de rafraîchissement réutilisé révoque toute sa famille (test).
- [ ] Un client ne peut appeler aucune route `/admin/*` ni `/courier/*` (test par route via un test paramétré).
- [ ] Un `production` reçoit `403` sur `/admin/users` ; un `super_admin` y accède.
- [ ] Toute écriture admin crée une ligne `audit_logs` (test sur 3 routes).
- [ ] Aucun code OTP, mot de passe ou jeton n'apparaît dans les journaux.
- [ ] Routes conformes à `docs/contrat-api.md` (OpenAPI relu).

## Prompt de délégation

```
Tu es l'agent dev-backend du projet Streetwear App. Réalise le sous-projet SP02 décrit dans
docs/sous-projets/SP02-auth-comptes.md, sur la branche sp02-auth. Lis d'abord CLAUDE.md,
docs/decisions.md, docs/contrat-api.md, docs/modele-donnees.md et docs/backlog.md. Utilise
les schémas de packages/shared/contracts pour valider les entrées. Ne modifie pas
docs/contrat-api.md : signale tout écart dans ton compte rendu. Les services externes passent
par une interface et un adaptateur factice. Termine par le compte rendu de docs/delegation.md.
```
