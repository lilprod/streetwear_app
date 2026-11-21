# Procès-verbal de recette — Streetwear App

> Modèle. Aucune recette n'a encore eu lieu. Toute valeur marquée « à compléter » doit être
> renseignée lors de la recette ; ne pas remplir ce document à l'avance.

| | |
|---|---|
| **Numéro de PV** | à compléter |
| **Date de début et de fin de recette** | à compléter |
| **Lieu** | à compléter |
| **Sponsor** | à compléter |
| **Chef de projet** | à compléter |
| **Responsable QA** | à compléter |
| **Plan de test de référence** | `docs/qa/plan-de-test.md` (version : à compléter) |

## 1. Périmètre

**Inclus :** les 34 stories de `docs/backlog.md`, les exigences non fonctionnelles de
`docs/cahier-des-charges.md`, les parcours des suites Maestro et Playwright (partie A de SP12),
les protocoles `docs/qa/protocole-impression.md` et `docs/qa/protocole-accessibilite.md`.

**Exclus :** à compléter (ex. : fonctionnalités hors MVP listées dans `docs/cahier-des-charges.md`).

**Adaptateurs utilisés :**

| Service | Adaptateur | Justification |
|---|---|---|
| Paiement | à compléter (`fake` interdit en production) | Agrégateur réel attendu |
| SMS | à compléter (`console` en local) | Fournisseur réel attendu |
| Push | à compléter (`fake` ou Expo) | |
| E-mail | à compléter (`fake` ou SMTP) | |
| Stockage des fichiers | à compléter (`local` ou `s3`) | `s3` attendu en production |
| Cartographie | à compléter (mode dégradé sans clé Google Maps) | |

## 2. Versions

| Élément | Version ou référence | Commande ou source |
|---|---|---|
| API | à compléter (SHA) | `git rev-parse --short HEAD` sur la branche de recette |
| Back-office | à compléter | même SHA |
| Application mobile (Android) | à compléter (versionCode) | build EAS |
| Application mobile (iOS) | à compléter | build EAS |
| Base de données | PostgreSQL 16 (attendu) | à compléter |
| Redis | 7 (attendu) | à compléter |
| Jeu de données | `pnpm --filter api db:seed:demo` ou catalogue réel | à compléter |

## 3. Environnement et appareils

| Appareil | Système | Rôle | Référence |
|---|---|---|---|
| Android 2 Go | à compléter | Studio, démarrage, images/s | à compléter |
| Android (4 appareils) | à compléter | Parcours d'achat, notifications | à compléter |
| iPhone | à compléter | Parcours d'achat, VoiceOver | à compléter |
| Poste de bureau | à compléter | Back-office | à compléter |

## 4. Résultats par lot

Résultats par lot de tests. Statut : **réussi**, **échoué**, **bloqué**, **non exécuté**.

| Lot | Contenu | Total | Réussi | Échoué | Bloqué | Non exécuté | Anomalies ouvertes (id) |
|---|---|---|---|---|---|---|---|
| L1 | Tests unitaires et d'intégration API (`pnpm test`) | à compléter | | | | | |
| L2 | Suites Playwright back-office (4 parcours) | 4 | | | | | |
| L3 | Suites Maestro mobile (5 parcours) | 5 | | | | | |
| L4 | Cohérence API : stock, créneaux, webhooks, expiration, double paiement | à compléter | | | | | |
| L5 | Performance (k6 sur les routes publiques et la création de commande) | à compléter | | | | | |
| L6 | Sécurité des rôles (matrice rôle × route) | à compléter | | | | | |
| L7 | Parcours manuels sur appareil (SMS, push, carte, studio 2 Go) | à compléter | | | | | |
| L8 | Impression (20 designs) | 20 | | | | | |
| L9 | Accessibilité (TalkBack, VoiceOver, contraste, clavier) | à compléter | | | | | |
| L10 | Pilote : suivi des commandes pilotes | à compléter | | | | | |

**Critères de performance (mesurés, pas estimés)** — à remplir avec l'appareil, le réseau et la charge :

| Mesure | Objectif | Résultat | Appareil | Réseau | Charge |
|---|---|---|---|---|---|
| p95 des requêtes API | < 500 ms depuis Lomé | à compléter | à compléter | à compléter | à compléter |
| Démarrage à froid, Android 2 Go | < 3 s | à compléter | | | |
| Images par seconde, studio, Android 2 Go | 30 minimum (60 visées) | à compléter | | | |
| Taille de l'application | ≤ 40 Mo | à compléter | | | |
| Rendu HD d'une zone A3 après paiement | < 60 s | à compléter | | | |

## 5. Sécurité

| Contrôle | Résultat | Référence |
|---|---|---|
| Zéro route admin accessible à un rôle non autorisé | à compléter | matrice de la partie B |
| Webhooks rejetés sans signature valide | à compléter | `apps/api/test/payments.spec.ts` |
| Limitation des codes SMS | à compléter | `apps/api/test/auth-customer.spec.ts` |
| Aucune donnée personnelle dans les journaux ni dans Sentry | à compléter | `apps/api/test/seed-logs.spec.ts`, `apps/api/src/config/sentry.spec.ts` |
| HTTPS partout | à compléter | |

## 6. Anomalies

Les anomalies sont suivies dans `docs/qa/anomalies.md`. Le tableau ci-dessous en donne le décompte à la clôture.

| Gravité | Ouvertes | Corrigées et revalidées | Acceptées par le sponsor (réserve) |
|---|---|---|---|
| Bloquante | à compléter | à compléter | 0 (interdit) |
| Majeure | à compléter | à compléter | à compléter |
| Mineure | à compléter | à compléter | à compléter |

## 7. Critère de sortie

La recette est acceptée si et seulement si les deux conditions suivantes sont remplies :

1. **Zéro anomalie bloquante ouverte** à la date de signature.
2. **Au moins 95 % des commandes pilotes livrées sans incident** (voir `docs/qa/pilote.md`, indicateur I-01).

Un incident est une commande qui ne se déroule pas comme prévu : paiement non confirmé ou double
débit, écart de stock, erreur de montant, erreur de livraison ou de retrait, notification manquante
ou fausse, fiche ou fichier d'impression non conforme.

**Décision :** à compléter (acceptée / acceptée avec réserves / refusée).

**Réserves** (anomalies majeures ou mineures acceptées, avec date limite) :

| Réf. | Description | Gravité | Échéance | Acceptée par |
|---|---|---|---|---|
| à compléter | | | | |

**Anomalies bloquantes restantes :** à compléter (le critère de sortie n'est pas atteint si la liste n'est pas vide).

## 8. Signatures

| Rôle | Nom | Signature | Date |
|---|---|---|---|
| Sponsor | à compléter | | |
| Chef de projet | à compléter | | |
| Responsable QA | à compléter | | |

Le procès-verbal est signé par le sponsor (critère de SP12). La signature du chef de projet et
du responsable QA atteste des résultats consignés.
