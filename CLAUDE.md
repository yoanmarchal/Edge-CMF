# CLAUDE.md — Edge CMF

Instructions pour l'IA travaillant sur ce repo. Voir aussi `docs/specs/` (quoi), `docs/design/` (comment) et `.claude/skills/` (workflows pas-à-pas).

## Le projet en une phrase

CMF headless 100 % Edge (alternative à Drupal) : monorepo npm workspaces, micro-services Cloudflare Workers reliés par Service Bindings, Astro 7 SSR pour le front public et l'admin, Hono + Drizzle + D1 pour le back, typage strict de bout en bout (**zéro `any`**).

## Carte du monorepo

| Workspace | Rôle | Exposé ? |
|---|---|---|
| `packages/shared-types` | Contrats Zod partagés + `buildFieldValuesSchema` (Field API dynamique) | — |
| `apps/content-worker` | Types de contenu, champs, taxonomies, nœuds, paragraphes, settings — D1 `edge-cmf-content` + cache | NON (binding interne) |
| `apps/auth-worker` | JWT, PBKDF2, RBAC (admin/editor/viewer) — D1 `edge-cmf-users` | NON (binding interne) |
| `apps/media-worker` | Médias R2 (bucket `edge-cmf-media`, métadonnées en `customMetadata`) | NON (binding interne) |
| `apps/gateway-worker` | API REST publique `/v1/*` lecture seule (clés API KV, rate-limit 100/60s) | OUI |
| `apps/frontend` | Site public Astro 7 SSR (Worker `edge-cmf`) — bindings CONTENT_WORKER + MEDIA_WORKER | OUI |
| `apps/admin` | Admin Astro 7 + îlots Preact `client:only` (Worker `edge-cmf-admin`) — bindings CONTENT + AUTH + MEDIA | OUI (auth applicative) |

## Commandes

```bash
npm run dev                 # tout lancer (migrations locales + 6 process, ports 8701-8704, 4321, 4322)
npm run typecheck           # TS strict sur tous les workspaces — DOIT passer avant tout commit
npm run build               # build all
npm run db:migrate:local    # migrations D1 locales (content + users) → .wrangler-state/
npm run dev:content|auth|media|gateway|front|admin   # process individuels
```

Ports dev : content 8701, auth 8702, gateway 8703, media 8704, frontend 4321, admin 4322.

## Règles non négociables

1. **Zéro `any`** — TypeScript strict sur les 6 workspaces. Utiliser les types inférés Hono/Drizzle/Zod.
2. **Toute entrée est validée par Zod** (`zValidator` côté Hono). Les schémas vivent dans `packages/shared-types` s'ils sont partagés.
3. **Les workers internes n'ont jamais de route publique** : pas de `[routes]`, `workers_dev = false` dans leur `wrangler.toml`. Seul le gateway (et les deux apps Astro) sont exposés.
4. **RPC typé via `hono/client`** : les workers exportent `export type XxxAPI = typeof routes` ; les consommateurs importent *uniquement le type* et branchent `fetch` du Service Binding.
5. **Toute mutation dans content/media-worker doit faire avancer ses cache tags** (`bumpTags` / `cache-tag:media`) — sinon front public et gateway servent des données périmées (voir `docs/design/cache.md`).
6. **Chaîne complète pour un champ/une entité** : schéma Zod (shared-types) → table/migration Drizzle → route worker → proxy admin `/api/*` → îlot Preact → rendu front (`FieldValue.astro`). Ne jamais s'arrêter à mi-chemin (skill `add-field-type`).
7. Workers < 100 Ko gzip. Pas de dépendance lourde côté worker ; `sharp` n'existe pas dans workerd (`imageService: 'compile'`).
8. Admin : **aucun SSR de données** — pages Astro = garde de session (cookie httpOnly `cmf_session`) + îlot Preact `client:only` qui consomme `/api/*`.

## Pièges connus (vérifiés dans le code)

- **Astro 7 / adaptateur Cloudflare v14** : `astro dev` tourne sur workerd réel ; les bindings s'obtiennent par `import { env } from 'cloudflare:workers'` — l'ancienne API `Astro.locals.runtime.env` (encore montrée dans le PDF du cahier des charges) **n'existe plus**. Le PDF mentionne aussi Cloudflare Pages : obsolète, on déploie sur **Workers** via `wrangler deploy`.
- **État D1/KV local partagé** : tous les process persistent dans `../../.wrangler-state` (`persistState` des configs Astro + `--persist-to` des workers). Ne pas casser ça, sinon chaque process voit une BDD vide.
- **`auxiliaryWorkers`** dans `astro.config.mjs` démarre automatiquement les workers internes en dev — inutile de les lancer à part pour travailler seulement sur front ou admin.
- **wrangler épinglé** : `overrides.wrangler = 4.114.0` dans le package.json racine.
- Migrations D1 = SQL brut numéroté dans `apps/*/migrations/` (pas de drizzle-kit generate en CI) ; appliquées avant le deploy des workers, jamais l'inverse.

## Style de code

- Commentaires et libellés UI en **français** (conserver cette convention).
- Schémas : noms machine à la Drupal (`^[a-z][a-z0-9_]*$`), slugs (`^[a-z0-9-]+$`).
- Réponses API : `{ data: ... }` en succès, `{ success: false, error: string }` en erreur.
