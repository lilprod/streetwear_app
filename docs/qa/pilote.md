# Plan du pilote — 50 clients à Lomé

| | |
|---|---|
| **Statut** | Plan. Le pilote ne peut pas démarrer tant que les préalables de la section 2 ne sont pas levés. |
| **Date de début** | à compléter (après signature du PV de recette, `docs/qa/pv-recette.md`) |
| **Durée** | à compléter (proposition : 4 semaines, à valider) |
| **Responsable** | à compléter |
| **Sources** | `docs/reprise-lead.md` (bloquants client), `docs/cahier-des-charges.md`, `docs/backlog.md` |

## 1. Objectif

Vérifier, avec 50 clients réels à Lomé, que le parcours complet fonctionne : connexion par SMS,
création d'un design, paiement, production, livraison ou retrait, notification et suivi. Le critère
de sortie du pilote reprend celui de la recette : au moins 95 % des commandes pilotes livrées sans
incident, et zéro anomalie bloquante.

## 2. Préalables

Chaque préalable est à confirmer par le responsable indiqué. Le statut est celui de
`docs/reprise-lead.md` à la date de ce document.

| # | Préalable | Responsable | Statut |
|---|---|---|---|
| P-01 | Agrégateur de paiement réel (T-Money, Flooz, carte) : contrat, identifiants de test, puis identifiants de production | Client / direction | Bloquant (décision du comité du 13/11) |
| P-02 | Fournisseur SMS : compte, expéditeur, clés, quota | Client / technique | Bloquant |
| P-03 | Clés de signature et secrets de production (`JWT_SECRET`, `NOTIFICATION_CODE_KEY`, secret des webhooks) générés et stockés hors dépôt | Technique | À compléter |
| P-04 | Prix validés (hypothèse : 8 500 / 1 500 / 1 000 FCFA) | Client | Bloquant |
| P-05 | Charte graphique | Client | Bloquant |
| P-06 | 30 motifs avec droits de reproduction et détenteurs identifiés | Client | Bloquant |
| P-07 | Mots interdits en éwé (liste validée) | Client | Bloquant |
| P-08 | Zones de livraison réelles (Grand Lomé) : polygones ou GeoJSON, frais et délais | Client / logistique | Bloquant |
| P-09 | Clé Google Maps (Android, iOS) pour la carte de réception ; sinon mode dégradé par quartiers (validé avec la marque) | Technique | Mode dégradé actif, clé à compléter |
| P-10 | Comptes de publication : Google Play, Apple Developer, projet EAS, identifiant de projet pour les notifications push | Client / technique | À compléter |
| P-11 | Stockage des fichiers d'impression en `s3` (bucket, clés, durée de vie) et, si retenu, Cloudinary pour les motifs | Technique | À compléter ; Cloudinary jamais testé |
| P-12 | Adresse e-mail d'expédition et serveur SMTP (alertes de stock, notifications e-mail) | Technique | À compléter |
| P-13 | Domaine et certificat HTTPS, reverse proxy, même origine pour le back-office et l'API | Technique | À compléter |
| P-14 | Sauvegardes quotidiennes, rétention de 30 jours, restauration testée avant lancement | Technique | Non réalisé |
| P-15 | Déclaration à l'IPDCP (hébergement en Europe, loi n° 2019-014) | Client | À compléter |
| P-16 | Textes légaux et CGV (provisoires à ce jour) validés | Client / juridique | Bloquant |
| P-17 | Atelier d'impression disponible et protocole `docs/qa/protocole-impression.md` exécuté (20 designs) | Atelier | À compléter |
| P-18 | Équipe de livraison et points de retrait : livreurs (comptes `courier` avec téléphone), boutique de retrait, horaires | Client / logistique | À compléter |
| P-19 | Recette signée (`docs/qa/pv-recette.md`) | Sponsor | À compléter |
| P-20 | CI GitHub et Docker vérifiés (jamais exécutés à ce jour) | Technique | À compléter |
| P-21 | Un Android 2 Go disponible pour les tests du studio | Client / QA | Bloquant |
| P-22 | Liste des 50 clients pilotes, avec consentement et numéro de téléphone vérifié | Client / commerce | À compléter |

Un préalable marqué « bloquant » empêche le lancement. Un préalable « à compléter » doit être
levé avant le premier client.

## 3. Sélection des clients

- 50 clients, invités par la marque (liste fermée, pas d'inscription ouverte pendant le pilote).
- Répartition à proposer : au moins 10 clients sans compte préalable, au moins 10 clients sur iPhone, au moins 10 clients sur Android entrée de gamme.
- Chaque client accepte les conditions du pilote et est informé que ses données sont traitées au Togo et en Europe (`docs/cahier-des-charges.md`).
- Les numéros de téléphone sont ceux des clients, en E.164 (`+228 ...`) ; aucune donnée personnelle n'est recopiée dans les tableaux de suivi.

## 4. Déroulé

| Phase | Durée indicative | Contenu | Sortie |
|---|---|---|---|
| Phase 0 : mise en place | J-14 à J-1 | Levée des préalables P-01 à P-22, déploiement en recette puis en production, seed de vérification (`pnpm --filter api db:seed` ; le seed de démo n'est pas utilisé en production) | Go technique signé |
| Phase 1 : commandes test internes | J0 à J+3 | L'équipe passe des commandes réelles de bout en bout (paiement réel de faible montant, à rembourser ou annuler selon la politique), vérifie les notifications et l'impression | Liste des anomalies corrigées |
| Phase 2 : ouverture à 10 clients | J+4 à J+7 | Premiers clients pilotes, surveillance quotidienne | Premier bilan |
| Phase 3 : ouverture aux 50 clients | J+8 à fin | Invitations en lot, suivi quotidien, réunion hebdomadaire | Bilan final |
| Phase 4 : clôture | fin + 5 jours ouvrés | Bilan, décision de lancement, PV de clôture | Décision signée |

**Suivi quotidien (cinq minutes) :** commandes du jour par statut, paiements en attente depuis plus de 2 minutes,
commandes expirées, notifications en échec, anomalies ouvertes par gravité, rapprochement du jour (US-34).

## 5. Indicateurs

| Code | Indicateur | Définition | Cible | Source |
|---|---|---|---|---|
| I-01 | Commandes livrées sans incident | Commandes livrées (ou retirées) sans incident, rapportées au total des commandes pilotes | ≥ 95 % | Back-office, `docs/qa/anomalies.md` |
| I-02 | Commandes payées confirmées par webhook | Commandes en `paid` ou `deposit_paid` dont le paiement est confirmé par webhook ou par `getStatus` | 100 % | Journal des paiements, rapprochement |
| I-03 | Écarts de rapprochement | Nombre de jours avec écart entre paiements de l'agrégateur et commandes | 0 | Rapport quotidien US-34 |
| I-04 | Double débit | Nombre de paiements en double constatés | 0 | Rapprochement |
| I-05 | Survente | Nombre de commandes acceptées au-delà du stock | 0 | Stock, `apps/api/test/cart-orders.spec.ts` |
| I-06 | Notifications livrées dans les 60 s | Part des changements de statut notifiés (push et SMS) dans les 60 s | ≥ 95 % (cible proposée, à valider) | Journal des notifications |
| I-07 | Temps de réponse API | p95 des requêtes à Lomé | < 500 ms | Supervision, mesure client |
| I-08 | Plantages de l'application | Taux de sessions avec plantage | à compléter (proposition : < 1 %) | Sentry, sans donnée personnelle |
| I-09 | Délai de production | Temps entre paiement et statut `ready` | à compléter (valeur à fixer par l'atelier) | Journal de production |
| I-10 | Délai de livraison | Temps entre statut `ready` ou `shipped` et `delivered` | à compléter (proposition : 48 h à Lomé, à valider) | Back-office |
| I-11 | Tickets d'assistance | Nombre de demandes par client et par type | à compléter | Canal d'assistance |
| I-12 | Satisfaction | Question unique à la livraison (de 1 à 5) | à compléter | Enquête |

Les indicateurs I-01 à I-05 sont ceux du critère de sortie. Les cibles marquées « à compléter »
ou « proposition » sont à valider par le sponsor avant la phase 2.

## 6. Critère d'arrêt

Le pilote est **suspendu immédiatement** (nouvelles commandes désactivées, réglage à compléter
dans le back-office) si l'un des événements suivants survient :

- un double débit constaté (I-04 > 0) ;
- une commande en `paid` ou `deposit_paid` sans paiement confirmé (I-02 < 100 %) ;
- une survente (I-05 > 0) ;
- une fuite de données personnelles (journaux, Sentry, accès non autorisé) ;
- une anomalie bloquante ouverte ;
- un écart de rapprochement non expliqué le même jour.

Le pilote est **arrêté** (décision du sponsor) si, sur une semaine glissante après la phase 2, I-01 est
inférieur à 90 % ou si deux incidents majeurs de notification ou de livraison surviennent sans cause
identifiée.

La reprise après suspension exige la correction, le test de non-régression de l'anomalie et la
validation écrite du chef de projet. Les seuils de cette section sont proposés et à valider par
le sponsor avant le début du pilote.

## 7. Communication et support

| Sujet | Contenu | Responsable |
|---|---|---|
| Message d'invitation | à compléter (en français) | Commerce |
| Canal d'assistance | à compléter (WhatsApp ou téléphone ; `EXPO_PUBLIC_WHATSAPP_NUMBER` attendu côté application) | Support |
| Horaires d'assistance | à compléter | Support |
| Procédure en cas de paiement non confirmé | Le client attend la confirmation ; la commande expire après 30 min et le stock est libéré. Aucun remboursement manuel sans vérification du rapprochement. | Responsable commandes |
| Procédure en cas de retard de livraison | à compléter | Logistique |

## 8. Revue et décision

| Revue | Date | Participants | Décision |
|---|---|---|---|
| Go technique | à compléter | à compléter | à compléter |
| Bilan phase 2 | à compléter | à compléter | à compléter |
| Bilan final | à compléter | à compléter | à compléter |
| Décision de lancement | à compléter | Sponsor, chef de projet | à compléter |
