# Architecture

Une seule API sert l'application mobile, le back-office et la vue livreur. Seule l'API parle à
la base, au stockage de fichiers et aux services externes.

```
 ┌──────────────┐   ┌──────────────┐   ┌──────────────┐
 │ apps/mobile  │   │ apps/admin   │   │ vue livreur  │ (route /livreur de apps/admin)
 │ Expo + Skia  │   │ React + Vite │   │ web mobile   │
 └──────┬───────┘   └──────┬───────┘   └──────┬───────┘
        └──────── HTTPS, JSON, JWT ───────────┘
                           │
                 ┌─────────▼──────────┐        ┌───────────────────────────┐
                 │ apps/api (NestJS)  │◄──────►│ Agrégateur de paiement     │ webhooks signés
                 │  main.ts  : HTTP   │        │ (T-Money, Flooz, carte)    │
                 │  worker.ts: BullMQ │◄──────►│ SMS / Expo Push            │
                 └──┬──────┬──────┬───┘        └───────────────────────────┘
                    │      │      │
          ┌─────────▼┐ ┌───▼────┐ ┌▼──────────────────────────────┐
          │PostgreSQL│ │ Redis  │ │ Cloudinary (motifs, aperçus)   │
          │  16      │ │ BullMQ │ │ R2/S3 (fichiers d'impression)  │
          └──────────┘ └────────┘ └───────────────────────────────┘
```

## Stack

| Couche | Choix |
|---|---|
| Mobile | Expo SDK (dernière stable), Expo Router, TypeScript, `@shopify/react-native-skia` pour le studio, TanStack Query, Zustand, MMKV (stockage local des brouillons), expo-notifications, expo-location, react-native-maps |
| Back-office | React 18, Vite, TypeScript, Tailwind CSS, shadcn/ui, TanStack Query, TanStack Table, React Router, Recharts |
| API | NestJS, TypeScript, Prisma, Zod (pipe de validation), Passport-JWT, `@nestjs/swagger` (OpenAPI), `@nestjs/throttler`, Pino |
| Worker | Même code que l'API, point d'entrée `worker.ts`, BullMQ sur Redis |
| Base | PostgreSQL 16 géré (Neon, Railway ou RDS) — région Europe (Paris) |
| Fichiers | Cloudinary (motifs, aperçus, transformations) ; Cloudflare R2 ou S3 (fichiers d'impression, URL signées) |
| Rendu d'impression | `sharp` + `@napi-rs/canvas` (ou Skia sous Node) à partir du `DesignSpec` |
| Supervision | Sentry (mobile, admin, API), PostHog (usage produit), journaux Pino |
| CI/CD | GitHub Actions ; EAS Build et EAS Submit pour le mobile |

## Modules NestJS (`apps/api/src/modules/`)

| Module | Sous-projet | Responsabilité |
|---|---|---|
| `auth` | SP02 | OTP SMS, JWT, rafraîchissement, OAuth Apple/Google, 2FA admin |
| `users` | SP02 | Profil, adresses, suppression (anonymisation), jetons push |
| `admin-users` | SP02 | Comptes back-office, rôles, journal d'audit |
| `catalog` | SP03 | Motifs, catégories, couleurs, polices, règles de prix, disponibilité |
| `designs` | SP03 | CRUD designs, aperçus, duplication |
| `media` | SP03 | Upload signé Cloudinary, validation des fichiers |
| `cart` | SP04 | Panier, devis (totaux) |
| `orders` | SP04 | Création, machine à états, historique, expiration |
| `stock` | SP04 | Stock, mouvements, réservation, alertes |
| `payments` | SP05 | Interface `PaymentProvider`, adaptateurs, webhooks, rapprochement |
| `delivery` | SP06 | Zones, livraisons, livreurs, boutiques, créneaux |
| `notifications` | SP07 | Modèles, envoi push et SMS, journal |
| `production` | SP08 | Fiches, travaux de production, rendu HD |
| `stats` | SP11 (API) | Indicateurs du tableau de bord |
| `settings` | SP02 | Paramètres (acompte, délais, moyens actifs) |

## Événements internes

Les modules communiquent par événements (`@nestjs/event-emitter`) puis files BullMQ pour le
travail lent. Noms d'événements :

| Événement | Émis par | Consommé par |
|---|---|---|
| `order.created` | orders | stock (réservation), notifications |
| `payment.succeeded` | payments | orders (transition `paid`/`deposit_paid`), stock (sortie), production |
| `payment.failed` | payments | orders, notifications |
| `order.status_changed` | orders | notifications, delivery, stats |
| `order.expired` | orders (job planifié) | stock (libération) |
| `design.ordered` | orders | production (file `render-print-files`) |
| `stock.below_threshold` | stock | notifications (admin) |

## Files BullMQ

| File | Job | Sous-projet |
|---|---|---|
| `render-print-files` | Génère les PNG 300 DPI par zone pour une ligne de commande | SP08 |
| `notifications` | Envoie un push et/ou un SMS | SP07 |
| `payments-reconcile` | Rapprochement quotidien à 02:00 Africa/Lome | SP05 |
| `orders-expire` | Expire les commandes non payées après 30 min | SP04 |

## Environnements

| Environnement | API | Base | Usage |
|---|---|---|---|
| `local` | `http://localhost:3000` | Docker Compose | Développement |
| `recette` | `https://api-recette.[domaine]` | Base dédiée | Démos de sprint, tests client, bac à sable agrégateur |
| `production` | `https://api.[domaine]` | Base gérée + sauvegardes | Clients réels |
