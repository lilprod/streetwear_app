# Décisions d'architecture (ADR)

Chaque décision : contexte, choix, conséquences. Une décision ne change que par une nouvelle
entrée qui la remplace.

## ADR-001 — Monorepo Turborepo + pnpm

- **Contexte :** trois applications partagent des types, le schéma du design et le calcul de prix.
- **Choix :** un seul dépôt, `apps/*` et `packages/*`, Turborepo pour le cache des tâches.
- **Conséquences :** un changement de `packages/shared` est visible partout dans la même PR ; la CI ne relance que ce qui est touché.

## ADR-002 — NestJS + Prisma + PostgreSQL

- **Contexte :** commandes, paiements et stock doivent rester cohérents ; statistiques en SQL.
- **Choix :** PostgreSQL 16, Prisma pour les migrations et l'accès typé, NestJS pour les modules, gardes de rôles et OpenAPI généré.
- **Conséquences :** transactions Prisma (`$transaction`) pour toute opération touchant paiement + commande + stock ; requêtes SQL brutes autorisées pour les statistiques.

## ADR-003 — Le design est un JSON partagé (`DesignSpec`)

- **Contexte :** ce que le client voit doit être exactement ce qui est imprimé.
- **Choix :** un schéma Zod versionné dans `packages/shared/design-spec` ; le mobile le dessine avec Skia, le worker le rend en PNG 300 DPI avec les mêmes règles géométriques.
- **Conséquences :** toute évolution du studio passe par une nouvelle `version` du schéma et une migration des brouillons.

## ADR-004 — Paiement derrière une interface `PaymentProvider`

- **Contexte :** l'agrégateur (PayGate Global, PayDunya ou CinetPay) n'est pas encore choisi.
- **Choix :** interface `initiate`, `getStatus`, `verifyWebhook`, `parseWebhook`, `refund?` ; un adaptateur `fake` pour le développement et les tests ; l'adaptateur réel arrive dès le choix.
- **Conséquences :** changer d'agrégateur = un nouvel adaptateur, sans toucher aux commandes.

## ADR-005 — Connexion par code SMS

- **Contexte :** les clients utilisent surtout leur numéro de téléphone ; pas de mot de passe à retenir.
- **Choix :** OTP à 6 chiffres, validité 5 min, 5 essais, 3 envois par heure et par numéro ; JWT d'accès 15 min, jeton de rafraîchissement 30 jours avec rotation ; interface `SmsProvider`.
- **Conséquences :** coût SMS à surveiller ; Apple et Google restent proposés (exigence App Store).

## ADR-006 — Un seul back-office pour l'équipe et les livreurs

- **Contexte :** les livreurs ont seulement besoin de leurs courses du jour.
- **Choix :** route `/livreur` dans `apps/admin`, mise en page mobile, rôle `courier`.
- **Conséquences :** pas d'application livreur séparée au MVP.

## ADR-007 — Hébergement en Europe (Paris)

- **Contexte :** latence correcte depuis Lomé, offre cloud mature ; la loi 2019-014 encadre le transfert hors du Togo.
- **Choix :** région Paris pour l'API, la base et Redis ; transfert déclaré à l'IPDCP.
- **Conséquences :** aucune donnée personnelle dans les journaux tiers (Sentry : masquer téléphone et adresse).
