# Documentation du projet

Lisez les documents dans cet ordre. Les quatre premiers sont obligatoires pour tout agent.

| # | Document | Contenu | Qui le maintient |
|---|---|---|---|
| 1 | [`../CLAUDE.md`](../CLAUDE.md) | Règles non négociables, organisation du dépôt, commandes | Lead technique |
| 2 | [`cahier-des-charges.md`](cahier-des-charges.md) | Périmètre fonctionnel MVP, contexte Togo, hors périmètre | Chef de projet |
| 3 | [`conventions.md`](conventions.md) | Conventions de code, tests, Git, définition de terminé | Lead technique |
| 4 | [`delegation.md`](delegation.md) | Découpage en sous-projets, dépendances, vagues, protocole de compte rendu | Chef de projet |
| 5 | [`architecture.md`](architecture.md) | Stack, monorepo, flux principaux, environnements | Lead technique |
| 6 | [`decisions.md`](decisions.md) | Décisions d'architecture (ADR) et leurs raisons | Lead technique |
| 7 | [`modele-donnees.md`](modele-donnees.md) | Tables PostgreSQL, machine à états des commandes, règles transactionnelles | Lead technique |
| 8 | [`contrat-api.md`](contrat-api.md) | Conventions REST, liste des routes, erreurs, webhooks | Lead technique |
| 9 | [`spec-design.md`](spec-design.md) | Format JSON d'un design, calcul du prix, règles du rendu HD | Lead technique |
| 10 | [`design-system.md`](design-system.md) | Jetons visuels et composants issus des maquettes | Designer |
| 11 | [`backlog.md`](backlog.md) | 34 user stories MVP avec critères d'acceptation | Chef de projet |
| 12 | [`sous-projets/`](sous-projets/) | Une fiche par sous-projet (SP00 à SP12) avec son prompt de délégation | Chef de projet |

## Références externes au dépôt

- Cahier des charges complet (document partagé) : Cahier des charges – Application de t-shirts personnalisés (Togo).
- Cadrage phase 0 : Cadrage – Phase 0 – Application de t-shirts personnalisés (Togo).
- Maquettes interactives : canevas « Maquettes – Studio t-shirts pagne (Togo) » (10 écrans).

Ces documents sont privés : demandez l'accès au chef de projet.

## Décisions encore ouvertes (impactent le code)

| Sujet | Hypothèse retenue dans le code en attendant | Où elle vit |
|---|---|---|
| Agrégateur de paiement | Interface `PaymentProvider` + adaptateur factice ; PayGate Global ou CinetPay ensuite | SP05 |
| Prix de base, motif, texte | 8 500 / 1 500 / 1 000 FCFA, en base dans `price_rules`, jamais en dur | SP01, SP03 |
| Technique d'impression | DTF, zone A3 (297 × 420 mm), PNG 300 DPI | `spec-design.md` |
| Acompte paiement à la livraison | 50 %, paramètre `settings.cod_deposit_percent` | SP04, SP05 |
| Fournisseur SMS | Interface `SmsProvider` + adaptateur console en dev | SP02, SP07 |
