# API Streetwear

## Jeu de données de démonstration (recette locale uniquement)

```
pnpm --filter api prisma migrate deploy   # base à jour
pnpm --filter api db:seed:demo
```

- **Interdit** quand `NODE_ENV=production` (le script refuse de démarrer).
- **Idempotent** : on peut le relancer ; comptes, clients et commandes existants ne sont pas dupliqués.
- Demande PostgreSQL et Redis (comme l'API). Lance l'application NestJS sans serveur HTTP et passe par les services réels (stock, livraison, historique, événements). Aucun appel réseau externe.
- Crée : réglages par défaut, catégories, 6 motifs actifs avec détenteur de droits (données de démonstration), couleurs, polices, règles de prix, mots interdits, modèles de notifications, stock ; les 3 zones de Lomé ; une boutique avec des créneaux sur 7 jours ; 4 clients avec adresse ; 10 commandes (en attente de paiement, payée, acompte versé, en production, prête, expédiée, prête au retrait, livrées, annulée) ; les livraisons à planifier ou en cours sont datées d'aujourd'hui.

### Comptes de démonstration

**Ces identifiants sont publics et ne servent qu'à la démonstration locale. Ne jamais les créer en préproduction ou en production.**

| Rôle                                                          | E-mail                                |
| ------------------------------------------------------------- | ------------------------------------- |
| super_admin                                                   | `super-admin@demo.streetwear.local`   |
| order_manager                                                 | `order-manager@demo.streetwear.local` |
| production                                                    | `production@demo.streetwear.local`    |
| logistics                                                     | `logistics@demo.streetwear.local`     |
| courier (livreur, profil livreur créé, tél. +228 91 00 00 00) | `courier@demo.streetwear.local`       |

- Mot de passe commun : `DemoLocal-2026!`
- Double authentification : secret TOTP commun `JBSWY3DPEHPK3PXP` (à saisir dans une application d'authentification, ou `authenticator.generate('JBSWY3DPEHPK3PXP')` avec `otplib`).
- Clients : `+22890000001` à `+22890000004` (connexion par code SMS ; en local le fournisseur SMS affiche le code dans les journaux).

## Réception des uploads de médias en local

Avec `MEDIA_PROVIDER=local`, `POST /v1/admin/media/upload-signature` renvoie `uploadUrl: /v1/admin/media/upload` (variable `MEDIA_UPLOAD_URL`). Le fichier est envoyé en multipart avec les champs signés (`api_key`, `timestamp`, `signature`, `public_id`, `folder`, `file`). La signature (HMAC dérivée de `JWT_SECRET`) expire après 10 minutes ; le format est détecté par signature binaire (png, jpg, svg ; ttf, otf, woff2), 20 Mo maximum. Les fichiers sont conservés en mémoire du processus (comme l'adaptateur local existant) : ils disparaissent au redémarrage.
