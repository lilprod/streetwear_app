# SP12 — QA, tests bout en bout, performance, recette

| | |
|---|---|
| **Agent** | `qa-recette` |
| **Modèle** | **`haiku`** pour le plan de test ; `sonnet` pour bout en bout, performance, sécurité |
| **Vague** | 3 (plan de test dès la vague 1) |
| **Dépend de** | Tous les sous-projets |
| **Débloque** | Pilote fermé, publication sur les stores, lancement |
| **Stories** | Toutes (vérification) |
| **Durée indicative** | 3 semaines (phase 3) + suivi continu |

## Objectif

Prouver, avant le pilote avec 50 clients à Lomé, que les parcours critiques fonctionnent, que
l'argent et le stock restent cohérents et que l'app tient sur un téléphone d'entrée de gamme.

## Lire d'abord

`CLAUDE.md`, `docs/backlog.md` (tous les critères d'acceptation), `docs/cahier-des-charges.md`
(exigences non fonctionnelles), `docs/modele-donnees.md` (machine à états, règles
transactionnelles), `docs/delegation.md`.

## À faire

1. **Plan de test** (`docs/qa/plan-de-test.md`) dès la vague 1 : matrice story × critère × type de test × statut ; appareils de test (5 Android réels dont 2 Go de RAM, 1 iPhone) ; jeux de données.
2. **Bout en bout mobile** (Maestro, `apps/mobile/e2e/`) : premier design et achat en T-Money ; commande de groupe avec retrait ; paiement à la livraison avec acompte ; suivi et recommande ; connexion avec code faux puis bon.
3. **Bout en bout back-office** (Playwright, `apps/admin/e2e/`) : reprendre ceux de SP11 et ajouter le cycle complet d'une commande jusqu'à « Livrée » avec la vue livreur.
4. **Tests de cohérence** sur l'API de recette : concurrence sur le stock et les créneaux, webhooks rejoués et falsifiés, expiration, double paiement (rejouer les scénarios de SP04, SP05, SP06 en environnement réel).
5. **Performance** : k6 sur les routes publiques et la création de commande (objectif : 95 % < 500 ms à 50 requêtes/s) ; démarrage à froid et images/s du studio sur Android 2 Go ; taille du binaire.
6. **Sécurité** : contrôle d'accès par rôle sur toutes les routes admin (script qui appelle chaque route avec chaque rôle), en-têtes HTTPS, limitation de débit OTP, absence de données personnelles dans les journaux et Sentry.
7. **Impression** : 20 designs réels rendus par SP08, imprimés par l'atelier, comparés à l'aperçu ; écarts consignés.
8. **Accessibilité** : TalkBack et VoiceOver sur le parcours d'achat ; contraste ; navigation clavier du back-office.
9. **Recette et pilote** : procès-verbal de recette ; suivi des anomalies (bloquante, majeure, mineure) ; critère de sortie : zéro bloquante, 95 % des commandes pilotes livrées sans incident.
10. **CI** : brancher les suites bout en bout sur la CI (nocturne pour Maestro, à chaque PR pour Playwright).

## Critères d'acceptation

- [ ] Chaque critère de `docs/backlog.md` a au moins un test ou une vérification manuelle tracée.
- [ ] Les 5 parcours Maestro et les 4 parcours Playwright passent sur la recette.
- [ ] Rapport de performance avec chiffres mesurés et comparaison aux objectifs.
- [ ] Rapport de sécurité des rôles : zéro route accessible à un rôle non autorisé.
- [ ] Procès-verbal de recette signé par le sponsor.

## Prompt de délégation

```
Tu es l'agent qa-recette du projet Streetwear App. Réalise <la partie demandée> du sous-projet
SP12 décrit dans docs/sous-projets/SP12-qa-recette.md, sur la branche sp12-qa. Lis d'abord
CLAUDE.md, docs/backlog.md, docs/cahier-des-charges.md, docs/modele-donnees.md et
docs/delegation.md. Ne corrige pas le code applicatif toi-même : écris le test qui échoue,
décris l'anomalie (étapes, attendu, obtenu, gravité) et indique le sous-projet responsable.
Ne désactive jamais un test. Termine par le compte rendu de docs/delegation.md.
```
