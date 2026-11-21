# Suivi des anomalies — Streetwear App

Registre ouvert le 21/11/2026, alimenté le 22/11/2026 par les parties A, B et C de SP12
(rapports `docs/qa/rapport-*.md`, `docs/qa/e2e.md`, section 7 de `docs/qa/plan-de-test.md`).

## Gravités

| Gravité | Définition |
|---|---|
| Bloquante | Argent (double débit, commande payée non confirmée), stock (survente), droits (accès d'un rôle non autorisé), données personnelles exposées, ou parcours critique impossible (achat, paiement, livraison, retrait). Interdit à la signature. |
| Majeure | Parcours critique dégradé avec contournement difficile, erreur de montant affichée, notification manquante, fichier d'impression non conforme, accessibilité bloquant un parcours. |
| Mineure | Défaut cosmétique, libellé, performance acceptable mais non optimale, cas limite sans effet sur la commande. |

## Statuts

`ouverte` · `en cours` · `corrigée` (correction livrée sur une branche) · `revalidée` (test de non-régression passé) · `fermée` · `acceptée` (réserve signée par le sponsor).

## Registre

| ID | Date | Gravité | Titre | Étapes de reproduction | Attendu | Obtenu | Sous-projet responsable | Test qui échoue (chemin) | Statut |
|---|---|---|---|---|---|---|---|---|---|
| AN-001 | 22/11/2026 | Majeure | Studio : pas de message « Motif indisponible » pour un brouillon dont le motif a été désactivé | 1. Créer un brouillon avec un motif. 2. Désactiver ce motif au back-office. 3. Rouvrir le brouillon dans le studio. | Le studio signale « Motif indisponible » et propose d'en choisir un autre (US-03). | Rien dans le studio ; seule la ligne du panier est signalée indisponible. | SP09 | à écrire | ouverte |
| AN-002 | 22/11/2026 | Majeure | Pas de `trust proxy` : derrière le reverse proxy, tous les clients partagent les limites de débit | `qa/security/02-rate-limits.mjs` avec 12 en-têtes `X-Forwarded-For` distincts. | Un compteur par client réel (OTP 10/min, connexion admin 20/min). | Un seul compteur : l'IP du proxy. Un client abusif bloque l'OTP de tous. | SP00 / SP02 | `qa/security/02-rate-limits.mjs` | ouverte — à traiter avant le pilote |
| AN-003 | 22/11/2026 | Majeure | L'expiration bloquait sur une commande incohérente (job rejoué indéfiniment, sans journal) | Voir `docs/qa/rapport-coherence.md`, A-COH-1. | Les autres commandes échues expirent ; l'erreur est journalisée. | 1 000 commandes échues non expirées pendant plus de 10 min. | SP04 | `apps/api/test/cart-orders.spec.ts` | corrigée |
| AN-004 | 22/11/2026 | Majeure | Aucun en-tête de sécurité, `X-Powered-By: Express`, réponses authentifiées en cache | `qa/security/03-headers-cors.mjs`. | `nosniff`, `X-Frame-Options`, `Referrer-Policy`, `Cache-Control: no-store`, sans `X-Powered-By`. | Aucun de ces en-têtes. | SP00 | `apps/api/test/security-hardening.spec.ts` | corrigée |
| AN-005 | 22/11/2026 | Majeure | Le masquage Sentry laissait passer téléphones, e-mails, noms, codes et jetons | `qa/security/04-sentry-scrub.mjs`. | Aucune donnée personnelle ni secret dans les événements Sentry. | Seules les clés exactes `phone`, `address`, `landmark` étaient masquées. | SP00 | `apps/api/test/security-hardening.spec.ts` | corrigée |
| AN-006 | 22/11/2026 | Mineure | Une commande expirée laisse son paiement en `pending` | `qa/coherence/05-expiry.mjs` (C-EXP-1). | Paiement passé à `expired` avec la commande. | Paiement toujours `pending`. | SP05 / SP04 | `qa/results/coherence-exp-1.json` | ouverte — règle à décider |
| AN-007 | 22/11/2026 | Mineure | Un succès fournisseur après un échec ou un écart de montant est ignoré (détecté seulement au rapprochement) | Voir `docs/qa/rapport-coherence.md`, A-COH-3. | Alerte immédiate (comme `payment.unexpected_success`). | Événement classé `duplicate`, sans alerte. | SP05 | à écrire | ouverte |
| AN-008 | 22/11/2026 | Mineure | Corps de requête > 1 Mo : 500 au lieu de 413 | Envoyer un corps JSON de plus de 1 Mo. | 413 avec un message en français. | 500. | SP00 | `apps/api/test/security-hardening.spec.ts` | corrigée |
| AN-009 | 22/11/2026 | Mineure | Limite « 100 req/min par IP » appliquée par route et en mémoire du processus | `qa/security/02-rate-limits.mjs`. | Limite globale par client, partagée entre instances (Redis). | Compteur par route, propre à chaque processus. | SP02 | `qa/security/02-rate-limits.mjs` | ouverte |
| AN-010 | 22/11/2026 | Mineure | `/v1/docs` (Swagger) public en production | Ouvrir `/v1/docs` sur une API `NODE_ENV=production`. | Documentation désactivée ou protégée en production. | Accessible à tous. | SP00 | à écrire | ouverte |
| AN-011 | 22/11/2026 | Mineure | Erreurs 5xx absentes de Sentry ; le worker ne journalise pas les jobs en échec | Provoquer une erreur serveur et un job BullMQ en échec. | Événement Sentry et ligne de journal. | Rien. | SP00 | à écrire | ouverte |
| AN-012 | 22/11/2026 | Mineure | Expiration limitée à 200 commandes par minute | Voir `docs/qa/rapport-coherence.md`, A-COH-4. | Rattrapage d'un retard en une seule passe. | 200 par minute. | SP04 | — | ouverte |
| AN-013 | 22/11/2026 | Mineure | Critères sans test : vignettes WebP ≤ 40 Ko (US-03), mot de passe admin ≥ 12 caractères (US-02), session client 30 jours (US-01) | Voir `docs/qa/plan-de-test.md`, section 7. | Un test par critère. | Aucun test nommé. | SP02 / SP03 | à écrire | ouverte |
| AN-014 | 22/11/2026 | Mineure | README de l'API : les codes OTP ne s'affichent pas dans les journaux | Lire `apps/api/README.md`. | Instruction exacte pour lire les codes en local. | Instruction fausse. | SP02 | — | corrigée (`TEST_SMS_OUTBOX_FILE` documenté) |

## Règles de saisie

- Un identifiant par anomalie, au format `AN-NNN` (numérotation continue).
- Étapes numérotées, avec les données de test utilisées (numéro de test, identifiant de commande, appareil).
- Une anomalie ne se ferme qu'après un test de non-régression qui passe ; le chemin du test est reporté dans la colonne dédiée.
- Un test ne doit jamais être désactivé ni assoupli pour fermer une anomalie.
- Les données personnelles ne sont pas recopiées (numéro complet, adresse, identifiants) : utiliser les numéros de test ou les identifiants internes.
- Gravité bloquante : signaler immédiatement au chef de projet, sans attendre la revue quotidienne.
