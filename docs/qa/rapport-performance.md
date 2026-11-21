# Rapport de performance serveur (SP12, partie B, item 5)

**Avertissement : la machine de test n'est pas la production.** Charge générée et servie par la même machine virtuelle ; réseau = boucle locale (latence réseau nulle, aucune TLS, aucun reverse proxy). Ces chiffres prouvent la marge de calcul de l'API et de la base, pas la latence vue depuis un téléphone à Lomé.

## Conditions

| | |
|---|---|
| Machine | VM Linux, 4 vCPU (`nproc` = 4), Intel Xeon 2,1 GHz, 16 Go de RAM (≈ 13 Go disponibles) |
| Logiciels | Node 22.23, PostgreSQL 16.15 et Redis 7.0 locaux, **k6 0.54.0** (binaire officiel téléchargé ; installation possible, donc pas de script de remplacement) |
| API | `apps/api/dist/main.js` compilée, `NODE_ENV=development`, un seul processus, journalisation pino de chaque requête active, limite de débit relevée à 100 000/min (la limite par défaut, 100/min/IP, bloquerait toute charge issue d'une IP) |
| Données | Jeu de démo (6 motifs, 5 couleurs, 3 zones, 1 boutique) ; 2 400 clients de test avec panier prêt ; stock et créneau de retrait très larges ; > 4 000 commandes en base à la fin |
| Charge | k6, exécuteur `constant-arrival-rate` (le débit est tenu même si l'API ralentit) |
| Reproduction | `bash qa/stack.sh start` puis `K6=<chemin> bash qa/perf/run.sh` (ajuster `OFFSET`/fixtures : un client ne passe qu'une commande) ; résumés bruts dans `qa/results/perf-*.json`, machine dans `qa/results/perf-machine.txt` |

## Résultats mesurés

Objectif du cahier des charges : 95 % des requêtes sous 500 ms à 50 req/s.

| Scénario | Débit | Durée | Requêtes | Moy. | Méd. | p90 | **p95** | p99 | Max | Erreurs | Objectif |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Routes publiques (catalogue ×5, résolution de zone, boutiques, créneaux) | 50/s | 60 s | 3 001 | 2,7 ms | 2,3 | 3,8 | **4,9 ms** | 8,4 | 33,5 | 0 % | atteint (100× de marge) |
| Création de commande `POST /orders` | 50/s | 20 s | 1 001 | 26,3 ms | 24,3 | 37,0 | **42,4 ms** | 57,0 | 66,3 | 0 % (1 001 × 201) | atteint |
| Routes publiques, marge | 200/s | 30 s | 6 000 | 2,1 ms | 1,7 | 3,0 | **4,0 ms** | 7,1 | 42,7 | 0 % | atteint |
| Mixte simultané : publiques 50/s + commandes 50/s (100 req/s) | 100/s | 20 s | 1 000 + 1 001 | 2,7 / 27,4 ms | 2,1 / 25,3 | 4,2 / 37,1 | **5,4 / 44,2 ms** | 8,6 / 56,5 | 23,9 / 132,5 | 0 % | atteint |

p95 par route (50 req/s) : catalogue couleurs 4,1 ms, tarifs 4,0, catégories 4,4, motifs 4,4, disponibilités 6,0, boutiques 4,7, créneaux 5,9, résolution de zone 4,4, création de commande 42,4 ms.

Intégrité après charge : 1 001 commandes créées et 1 001 réservations de stock ; aucune réponse 5xx dans les journaux de l'API.

## Limites et précautions

- Catalogue de démonstration très petit (6 motifs) : le catalogue réel (30 motifs et plus, miniatures) alourdira les réponses ; les clients n'ont pas envoyé `If-None-Match` (réponses complètes à chaque fois, cas le plus défavorable côté serveur).
- Pas de TLS, pas de reverse proxy, pas de latence mobile (3G/4G Lomé) ; la charge et le serveur partagent les 4 vCPU.
- Les paiements (initiation, webhooks) et le worker de rendu HD n'ont pas été chargés ; seul le rendu 20 designs réels (item 7) mesurera le temps de production.
- À relancer sur la recette réelle (même scripts, `BASE=https://…`) avec la limite de débit de production ; voir l'anomalie A-SEC-4 du rapport de sécurité (limite par IP derrière le proxy).

## À mesurer sur appareil (non mesurable ici)

| Mesure | Objectif | Appareil requis |
|---|---|---|
| Ouverture de l'application (démarrage à froid) | < 3 s (CDC) | Android 2 Go de RAM, Android d'entrée de gamme, iPhone |
| Images par seconde du studio de composition (manipulation de calques) | non chiffré au CDC (aperçu 2D « temps réel ») ; viser >= 30 i/s | Android 2 Go |
| Taille de l'application (APK/AAB, IPA) | <= 40 Mo (CDC) | build EAS de recette |
| Consommation mémoire et batterie du studio | — | Android 2 Go |
| Latence ressentie sur 3G/4G à Lomé | — | téléphone sur réseau opérateur |
