# Suivi des anomalies — Streetwear App

Aucune anomalie n'est ouverte à la date de création de ce document (21/11/2026). Les anomalies
détectées pendant la recette sont ajoutées ici. La ligne d'exemple ci-dessous est fictive et doit
être supprimée dès la première anomalie réelle.

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
| AN-EXEMPLE | 00/00/0000 | Majeure | EXEMPLE — à supprimer | 1. Ouvrir la fiche d'une commande. 2. Cliquer sur « Régénérer ». | Fichiers régénérés, bouton désactivé pendant le travail. | Message d'erreur en anglais, fichiers non régénérés. | SP11 | à compléter | ouverte |

## Règles de saisie

- Un identifiant par anomalie, au format `AN-NNN` (numérotation continue).
- Étapes numérotées, avec les données de test utilisées (numéro de test, identifiant de commande, appareil).
- Une anomalie ne se ferme qu'après un test de non-régression qui passe ; le chemin du test est reporté dans la colonne dédiée.
- Un test ne doit jamais être désactivé ni assoupli pour fermer une anomalie.
- Les données personnelles ne sont pas recopiées (numéro complet, adresse, identifiants) : utiliser les numéros de test ou les identifiants internes.
- Gravité bloquante : signaler immédiatement au chef de projet, sans attendre la revue quotidienne.
