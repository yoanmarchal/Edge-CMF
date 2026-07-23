# Edge CMF — Alternative Drupal headless, 100 % Edge

CMF Edge-natif conforme au cahier des charges v3, étendu en véritable alternative headless à Drupal : modélisation de contenu dynamique (équivalent Field UI), taxonomies, RBAC, admin UI, et API REST publique — le tout en micro-services Cloudflare Workers reliés par Service Bindings, typage strict de bout en bout (zéro `any`).

## Architecture

```
Visiteurs ──HTTPS──▶ apps/frontend  (Astro 7 SSR, Cloudflare Workers)   ← exposé, site public
Admins    ──HTTPS──▶ apps/admin     (Astro 7 + îlots Preact, Workers)   ← exposé, séparé du site
Apps externes ─HTTPS─▶ gateway-worker (REST /v1, clés API)              ← exposé (lecture seule)
                          │ Service Bindings (< 2ms, réseau interne)
                          ├──▶ content-worker  (types dynamiques, champs, taxonomies,
                          │                     nœuds — D1 "edge-cmf-content" + cache KV)
                          └──▶ auth-worker     (JWT/RBAC, users — D1 "edge-cmf-users")
```

`apps/frontend` et `apps/admin` sont deux Workers Cloudflare indépendants
(Astro 7 + `@astrojs/cloudflare` v14 — Cloudflare Pages n'est plus supporté par
l'adaptateur depuis sa v13 ; migration effectuée), déployés séparément via
`wrangler deploy`, chacun avec ses propres Service Bindings : `apps/frontend`
ne parle qu'à `content-worker` (aucune SSR de données sensibles, thème résolu
côté serveur) ; `apps/admin` parle à `content-worker` et `auth-worker`, ne fait
aucun SSR de données (tout passe par des îlots Preact `client:only` + API JSON
`/api/*`).

Depuis Astro 6/l'adaptateur v13+, `astro dev` tourne directement sur le
runtime `workerd` réel (via le plugin Vite Cloudflare) et l'accès aux bindings
se fait par `import { env } from 'cloudflare:workers'` (l'ancienne API
`Astro.locals.runtime.env` a été supprimée). Les Service Bindings vers
`content-worker`/`auth-worker` sont démarrés automatiquement en dev via
`auxiliaryWorkers` dans `astro.config.mjs` — plus besoin de les lancer dans des
terminaux séparés pour développer sur `apps/frontend`/`apps/admin` seuls.

## Correspondance Drupal

| Drupal | Edge CMF |
|---|---|
| Node system | `content_nodes` + rendu SSR Astro |
| Content types + Field UI | Tables `content_types`/`fields`, validation Zod générée à la volée |
| Paragraphs | Types de paragraphes (`kind='paragraph'`, même Field API) + `node_paragraphs` ordonnés ; éditeur par blocs dans l'admin |
| Taxonomy | `vocabularies`/`terms`/`node_terms`, filtre `?term=` |
| Users + rôles | auth-worker : JWT, PBKDF2, rôles admin/editor/viewer |
| Cache tags | Cache API + version KV partagée (invalidation sur mutation) |
| JSON:API / headless | gateway-worker `/v1/*` (clés API, rate-limit, CORS, cache) |
| Admin UI | `apps/admin` (projet séparé) : contenu, types & champs, taxonomie, utilisateurs |

## Démarrage

```bash
npm install
npm run db:migrate:local        # crée les tables D1 locales (content + users)
cp apps/auth-worker/.dev.vars.example apps/auth-worker/.dev.vars   # puis éditer les secrets
```

5 terminaux (ports wrangler et inspecteurs distincts, déjà configurés) :

```bash
npm run dev:content    # 8701 — worker contenu (interne)
npm run dev:auth       # 8702 — worker auth (interne)
npm run dev:gateway    # 8703 — API publique /v1 (optionnel en dev)
npm run dev:front      # 4321 — site public (apps/frontend, Astro dev)
npm run dev:admin      # 4322 — admin (apps/admin, Astro dev)
```

Les Service Bindings se connectent automatiquement entre processus (`[connected]`).
En local, le site public pointe vers l'admin via `PUBLIC_ADMIN_URL` (défaut
`http://localhost:4322`) et l'admin pointe vers le site public via
`PUBLIC_SITE_URL` (défaut relatif/vide). Ces variables se définissent dans les
fichiers `.env`/`.dev.vars` respectifs de chaque app, ou en variables
d'environnement Cloudflare Pages en production.

### Premier admin (bootstrap)

```bash
curl -X POST http://localhost:8702/register \
  -H "content-type: application/json" \
  -H "x-setup-token: <SETUP_TOKEN de .dev.vars>" \
  -d '{"email":"admin@example.com","password":"motdepassefort","role":"admin"}'
```

Puis http://localhost:4322 → connexion → tout se gère depuis l'interface :
créer des types de contenu et leurs champs (texte, nombre, booléen, date, liste,
référence…), des types de paragraphes (composants réutilisables — deux fournis :
« Bloc de texte » et « Citation »), des vocabulaires et termes, des utilisateurs
et leurs rôles, et du contenu via des formulaires générés dynamiquement — y compris
la composition par blocs de paragraphes (ajout/retrait, validation par type).

## API headless publique (gateway)

Lecture seule, contenu publié uniquement : `GET /v1/nodes?type=&term=&limit=&offset=`,
`/v1/nodes/:slug`, `/v1/types`, `/v1/types/:id`, `/v1/vocabularies`.

Clé API requise (header `x-api-key`) sauf si `PUBLIC_API_OPEN = "1"` :

```bash
wrangler kv key put --binding=API_KEYS "apikey:ma-cle-secrete" "nom-du-client"
curl https://gateway-worker.<compte>.workers.dev/v1/nodes -H "x-api-key: ma-cle-secrete"
```

Rate limiting natif Cloudflare : 100 req/60s par clé (binding `[[unsafe.bindings]]`).

## Provisionnement Cloudflare (une fois)

```bash
npx wrangler d1 create edge-cmf-content    # → id dans apps/content-worker/wrangler.toml
npx wrangler d1 create edge-cmf-users      # → id dans apps/auth-worker/wrangler.toml
npx wrangler kv namespace create CACHE_KV  # → id dans content-worker ET gateway-worker
npx wrangler kv namespace create API_KEYS  # → id dans apps/gateway-worker/wrangler.toml
cd apps/auth-worker && npx wrangler secret put JWT_SECRET && npx wrangler secret put SETUP_TOKEN
```

## Déploiement

Push sur `main` → GitHub Actions : typecheck strict, migrations D1, deploy des
3 micro-workers, build + deploy des deux Workers Astro (`frontend` et `admin`,
`wrangler deploy` — plus de `wrangler pages deploy`). Secrets requis :
`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`.
Manuel : `npm run db:migrate:remote && npm run deploy:workers && npm run deploy:front && npm run deploy:admin`.

## Structure

```
├── packages/shared-types/   # Contrats Zod partagés + générateur de schémas de champs
├── apps/content-worker/     # Entités dynamiques, taxonomies, nœuds, cache Edge
├── apps/auth-worker/        # JWT, PBKDF2, RBAC, gestion utilisateurs
├── apps/gateway-worker/     # API REST publique /v1 (clés API, rate-limit, CORS)
├── apps/frontend/           # Astro 7 SSR (Cloudflare Workers) — site public, thème natif
├── apps/admin/              # Astro 7 + îlots Preact (Cloudflare Workers) — admin UI, projet séparé
└── .github/workflows/       # CI/CD
```

## Garanties (cahier des charges v1 §6)

TypeScript strict sur les 6 workspaces, zéro `any` ; validation Zod systématique
(y compris champs personnalisés dynamiques) ; workers < 100 Ko gzip (limite 1 Mo) ;
back-end invisible depuis Internet hors gateway lecture seule.
