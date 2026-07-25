---
name: new-worker
description: Créer un nouveau micro-worker Cloudflare dans Edge CMF (Hono + Service Bindings, interne ou exposé) et le brancher au dev, aux consommateurs et au déploiement. Utiliser quand une nouvelle famille de responsabilités justifie un service dédié.
---

# Nouveau micro-worker

Avant tout : un nouveau worker se justifie pour une **responsabilité isolée** (nouvelle ressource type search-worker, webhook-worker…). Sinon, étendre un worker existant (skill `add-worker-route`).

## Squelette (`apps/<name>-worker/`)

Copier la structure de `apps/media-worker` (le plus simple) : `package.json` (nom `@edge-cmf/<name>-worker`, scripts `dev` avec **port dédié 87xx et `--persist-to ../../.wrangler-state`**, `deploy`, `typecheck`), `tsconfig.json`, `wrangler.toml`, `src/index.ts`.

### wrangler.toml — décision clé

- **Interne** (défaut) : `workers_dev = false`, pas de `[routes]`. Invisible d'Internet, joignable par binding uniquement.
- **Exposé** : uniquement si consommé par des tiers (modèle gateway) — alors clé API + rate-limit obligatoires.
- Bindings selon besoin : `[[d1_databases]]` (nouvelle BDD = `wrangler d1 create`), `[[kv_namespaces]]` (réutiliser `CACHE_KV` id `a8b2d2ae1d5143b3abb8f5426ff69183` si le worker participe au cache), `[[r2_buckets]]`, `[[services]]`.

### src/index.ts

Chaîne Hono typée + `export type <Name>API = typeof routes; export default app;` — validation Zod partout, format `{ data }` / `{ success:false, error }`.

## Branchements (tous obligatoires)

1. **Consommateurs** : `[[services]]` dans le `wrangler.toml` de frontend/admin/gateway + client `hc<API>` dans leur `lib/api.ts` + type `Env`/`env.d.ts`.
2. **Dev racine** (`package.json`) : script `dev:<name>`, intégration dans le script `dev` (concurrently + `wait-on` du port).
3. **Dev Astro** : ajouter `{ configPath: '../<name>-worker/wrangler.toml' }` dans `auxiliaryWorkers` des `astro.config.mjs` concernés.
4. **Déploiement** : ajouter à `deploy:workers` (racine) ET à `.github/workflows/deploy.yml` (après migrations, avant les apps Astro).
5. **Cache** : si le worker sert des données du site public → nouveau tag dans `TAGS` du middleware front (`docs/design/03-cache.md`).
6. **Docs** : mettre à jour `CLAUDE.md` (carte du monorepo), `docs/specs/02-api.md`, `docs/design/01-architecture.md`, README.

## Vérification

`npm run typecheck` ; `npm run dev` → tous les process `[connected]` ; budget < 100 Ko gzip (`wrangler deploy --dry-run --outdir=dist`).
