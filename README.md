# Edge CMF — Full-Stack Edge (v3)

CMF 100 % Edge-natif conforme au cahier des charges v3 : rendu SSR Astro sur Cloudflare Pages, back-end en micro-workers Hono/Drizzle/D1 invisibles depuis Internet, communication exclusive par Service Bindings avec typage strict de bout en bout (zéro `any`).

## Architecture

```
Navigateur ──HTTPS──▶ Astro SSR (Cloudflare Pages)          ← seul point exposé
                        │ Service Binding (< 2ms, réseau interne)
                        ├──▶ content-worker (Hono + Drizzle + D1 "edge-cmf-content")
                        └──▶ auth-worker    (Hono + JWT/RBAC + D1 "edge-cmf-users")
```

Les workers back-end n'ont **aucune route publique** (`workers_dev = false`, pas de `routes`) : ils ne sont invocables que par le front via `env.CONTENT_WORKER` / `env.AUTH_WORKER`.

## Structure du monorepo (npm workspaces)

```
├── packages/shared-types/   # Schémas Zod + contrats partagés (source de vérité)
├── apps/content-worker/     # CRUD content_nodes, cache Edge + invalidation KV
├── apps/auth-worker/        # login/validate/register, JWT (hono/jwt), PBKDF2
├── apps/frontend/           # Astro SSR + client hono/client (RPC typé)
└── .github/workflows/       # CI/CD : migrations D1 → workers → Pages
```

## Prérequis

Node ≥ 20, un compte Cloudflare, `wrangler` authentifié (`npx wrangler login`).

## Installation

```bash
npm install
```

## Provisionnement Cloudflare (une seule fois)

```bash
# Bases D1 (une par service — isolation des données)
npx wrangler d1 create edge-cmf-content   # → coller database_id dans apps/content-worker/wrangler.toml
npx wrangler d1 create edge-cmf-users     # → coller database_id dans apps/auth-worker/wrangler.toml

# KV pour l'invalidation du cache
npx wrangler kv namespace create CACHE_KV # → coller l'id dans apps/content-worker/wrangler.toml

# Secrets de l'auth-worker
cd apps/auth-worker
npx wrangler secret put JWT_SECRET
npx wrangler secret put SETUP_TOKEN
```

En local : copier `apps/auth-worker/.dev.vars.example` vers `.dev.vars`.

## Développement local

Le front est un projet **Pages** : il se lance avec `wrangler pages dev` (pas `wrangler dev`).
Les Service Bindings sont résolus automatiquement entre processus par le registre de dev
local de wrangler : il suffit que les trois tournent en même temps.

```bash
npm run db:migrate:local      # une seule fois : migrations D1 locales

# Terminal 1
npm run dev:content           # worker contenu (port 8701)

# Terminal 2 (copier d'abord apps/auth-worker/.dev.vars.example → .dev.vars)
npm run dev:auth              # worker auth (port 8702)

# Terminal 3
npm run build -w @edge-cmf/frontend
cd apps/frontend && npx wrangler pages dev ./dist   # site sur http://localhost:8787
```

Quand tout est connecté, `wrangler pages dev` affiche `[connected]` à côté de
`CONTENT_WORKER` et `AUTH_WORKER`.

Note Windows : l'`Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)` affiché à
l'arrêt de wrangler est un bug cosmétique connu de Node/libuv — sans conséquence.

## Créer le premier admin

L'endpoint `/register` du auth-worker exige un JWT admin **ou** le jeton de bootstrap :

```bash
curl -X POST http://localhost:8702/register \
  -H "content-type: application/json" \
  -H "x-setup-token: <SETUP_TOKEN>" \
  -d '{"email":"admin@example.com","password":"motdepassefort","role":"admin"}'
```

Ensuite : `/admin` sur le front → connexion → création de contenu.

## Déploiement

Automatique à chaque push sur `main` (GitHub Actions), dans l'ordre imposé par le cahier des charges : migrations D1, puis `wrangler deploy` des micro-workers, puis build + déploiement Pages.

Secrets GitHub requis : `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`.

Manuel :

```bash
npm run db:migrate:remote && npm run deploy:workers && npm run deploy:front
```

## Vérifications

```bash
npm run typecheck   # TypeScript strict sur tous les workspaces — zéro any
npm run build       # build Astro
```

## Critères d'acceptation couverts (cahier v1 §6)

Zéro `any` (mode strict + `noUncheckedIndexedAccess`), cache Edge par Cache API avec invalidation par version KV sur les GET, workers < 1 Mo (Hono + Drizzle uniquement), validation Zod systématique (body, query, params) avant tout contrôleur.
