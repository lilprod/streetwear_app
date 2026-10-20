# Back-office (apps/admin)

```
cp .env.example .env     # VITE_USE_MSW=true : API simulée (MSW), sans backend
pnpm --filter admin dev  # http://localhost:5173
```

## Comptes de démo (MSW uniquement, aucun secret réel)

Mot de passe : `demo-password-12` · code TOTP : `123456`

| E-mail                     | Rôle          | Particularité                    |
| -------------------------- | ------------- | -------------------------------- |
| admin@streetwear.test      | super_admin   |                                  |
| commandes@streetwear.test  | order_manager |                                  |
| production@streetwear.test | production    |                                  |
| logistique@streetwear.test | logistics     |                                  |
| livreur@streetwear.test    | courier       | pas de TOTP                      |
| nouveau@streetwear.test    | order_manager | enrôlement TOTP au premier login |

Passer à l'API de recette : `VITE_USE_MSW=false` et `VITE_API_URL` vers la recette.
