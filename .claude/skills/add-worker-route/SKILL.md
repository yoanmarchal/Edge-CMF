---
name: add-worker-route
description: Ajouter une route API à un micro-worker Edge CMF (content/auth/media/gateway) en respectant le RPC typé Hono, la validation Zod et les cache tags. Utiliser pour toute nouvelle route ou endpoint, interne ou public.
---

# Ajouter une route à un worker

## Règles

- Les routes sont **chaînées** sur une seule expression (`const routes = app.get(...).post(...)`) : c'est ce chaînage qui alimente `export type XxxAPI = typeof routes`. Ajouter la route **dans la chaîne**, pas sur `app` après coup.
- Toute entrée (param, query, json) passe par `zValidator` avec un schéma de `@edge-cmf/shared-types` (le créer là-bas s'il est partagé, localement sinon).
- Réponses : `c.json({ data })` en succès, `c.json({ success: false, error }, code)` en erreur.
- Zéro `any` ; types Drizzle inférés (`$inferSelect`).

## Selon le worker

**content-worker** (`apps/content-worker/src/index.ts`)
1. Ajouter la route dans la chaîne.
2. **Obligatoire** : classer le chemin dans `tagsForRead` ET `tagsForMutation` (`src/cache.ts`). Une mutation doit déclencher `bumpTags` (déjà fait par le middleware si le chemin est classé). Voir `docs/design/03-cache.md`.

**auth-worker** — attention aux gardes : qui a le droit d'appeler ? (`x-setup-token`, Bearer admin…). Jamais de `passwordHash` en sortie.

**media-worker** — clés avec `/` : motif `:key{.+}` ; mutations : bump `cache-tag:media`.

**gateway-worker** — uniquement des GET lecture seule proxifiés via `hc<ContentAPI>` (`passthrough`). Jamais exposer `all=1` ni de mutation. La route hérite du middleware clé API + rate-limit + cache.

## Exposer aux consommateurs

- **Admin** : ajouter/étendre la page proxy `apps/admin/src/pages/api/*.ts` avec `requireApiSession(cookies, { writeOnly: true })` (ou `adminOnly: true`), puis consommer depuis l'îlot via `src/islands/lib/adminApi.ts`.
- **Front public** : consommer via `apps/frontend/src/lib/api.ts` (client RPC binding).

## Vérification

```bash
npm run typecheck
npm run dev   # exercer la route ; muter puis vérifier que le front/l'API publique voient le changement (cache tags)
```
