---
name: d1-migration
description: Créer et appliquer une migration D1 (SQLite) dans Edge CMF en gardant le schéma Drizzle synchrone. Utiliser pour tout changement de schéma BDD — nouvelle table, colonne, index — sur edge-cmf-content ou edge-cmf-users.
---

# Migration D1

Les migrations sont du **SQL brut numéroté** (pas de `drizzle-kit generate` en CI). Deux BDD :

- contenu → `apps/content-worker/migrations/` (D1 `edge-cmf-content`)
- utilisateurs → `apps/auth-worker/migrations/` (D1 `edge-cmf-users`)

## Étapes

1. Créer `apps/<worker>/migrations/NNNN_description.sql` (numéro suivant, 4 chiffres, ex. `0004_add_node_index.sql`). SQLite : préférer l'additif ; pas de `ALTER TABLE ... DROP COLUMN` complexe — recréation de table si nécessaire.
2. **Mettre à jour `apps/<worker>/src/schema.ts` (Drizzle) pour refléter exactement le SQL** — c'est manuel, rien ne le vérifie automatiquement.
3. Si nouveaux types/validation : ajouter les schémas Zod dans `packages/shared-types`.
4. Appliquer en local :

```bash
npm run db:migrate:local     # les deux BDD, état persisté dans .wrangler-state/
```

5. Adapter les routes/consommateurs (voir skill `add-worker-route`), puis `npm run typecheck`.

## Points d'attention

- Conventions du schéma existant : PK `text` (UUID ou nom machine), booléens `integer { mode: 'boolean' }`, timestamps `integer { mode: 'timestamp' }`, JSON en `text` défaut `'{}'`, FK `onDelete: 'cascade'` quand la dépendance est forte.
- **Ordre en prod** : migration appliquée AVANT le deploy du code (`--remote`, fait par la CI en premier). Écrire des migrations compatibles avec l'ancien code encore en ligne.
- Nouvelle famille de données → nouveau cache tag (`docs/design/03-cache.md`).
- Ne jamais mettre de valeurs de champs personnalisés en colonnes : elles vont dans `fields_json` (design 02).
