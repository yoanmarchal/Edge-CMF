# Edge CMF — Alternative Drupal headless, 100 % Edge

CMF Edge-natif conforme au cahier des charges v3, étendu en véritable alternative headless à Drupal : modélisation de contenu dynamique (équivalent Field UI), taxonomies, RBAC, admin UI, et API REST publique — le tout en micro-services Cloudflare Workers reliés par Service Bindings, typage strict de bout en bout (zéro `any`).

## Architecture

```
Navigateur ──HTTPS──▶ Astro SSR + Admin UI (Cloudflare Pages)   ← exposé
Apps externes ─HTTPS─▶ gateway-worker (REST /v1, clés API)      ← exposé (lecture seule)
                          │ Service Bindings (< 2ms, réseau interne)
                          ├──▶ content-worker  (types dynamiques, champs, taxonomies,
                          │                     nœuds — D1 "edge-cmf-content" + cache KV)
                          └──▶ auth-worker     (JWT/RBAC, users — D1 "edge-cmf-users")
```

## Correspondance Drupal

| Drupal | Edge CMF |
|---|---|
| Node system | `content_nodes` + rendu SSR Astro |
| Content types + Field UI | Tables `content_types`/`fields`, validation Zod générée à la volée |
| Taxonomy | `vocabularies`/`terms`/`node_terms`, filtre `?term=` |
| Users + rôles | auth-worker : JWT, PBKDF2, rôles admin/editor/viewer |
| Cache tags | Cache API + version KV partagée (invalidation sur mutation) |
| JSON:API / headless | gateway-worker `/v1/*` (clés API, rate-limit, CORS, cache) |
| Admin UI | `/admin` : contenu, types & champs, taxonomie, utilisateurs |

## Démarrage

```bash
npm install
npm run db:migrate:local        # crée les tables D1 locales (content + users)
cp apps/auth-worker/.dev.vars.example apps/auth-worker/.dev.vars   # puis éditer les secrets
```

4 terminaux (ports wrangler et inspecteurs distincts, déjà configurés) :

```bash
npm run dev:content    # 8701 — worker contenu (interne)
npm run dev:auth       # 8702 — worker auth (interne)
npm run dev:gateway    # 8703 — API publique /v1 (optionnel en dev)
npm run build -w @edge-cmf/frontend && cd apps/frontend && npx wrangler pages dev ./dist   # 8788 — site + admin
```

Les Service Bindings se connectent automatiquement entre processus (`[connected]`).

### Premier admin (bootstrap)

```bash
curl -X POST http://localhost:8702/register \
  -H "content-type: application/json" \
  -H "x-setup-token: <SETUP_TOKEN de .dev.vars>" \
  -d '{"email":"admin@example.com","password":"motdepassefort","role":"admin"}'
```

Puis http://localhost:8788/admin → connexion → tout se gère depuis l'interface :
créer des types de contenu et leurs champs (texte, nombre, booléen, date, liste,
référence…), des vocabulaires et termes, des utilisateurs et leurs rôles, et du
contenu via des formulaires générés dynamiquement depuis les définitions de champs.

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
3 workers, build + deploy Pages. Secrets requis : `CLOUDFLARE_API_TOKEN`,
`CLOUDFLARE_ACCOUNT_ID`. Manuel : `npm run db:migrate:remote && npm run deploy:workers && npm run deploy:front`.

## Structure

```
├── packages/shared-types/   # Contrats Zod partagés + générateur de schémas de champs
├── apps/content-worker/     # Entités dynamiques, taxonomies, nœuds, cache Edge
├── apps/auth-worker/        # JWT, PBKDF2, RBAC, gestion utilisateurs
├── apps/gateway-worker/     # API REST publique /v1 (clés API, rate-limit, CORS)
├── apps/frontend/           # Astro SSR public + admin UI complète
└── .github/workflows/       # CI/CD
```

## Garanties (cahier des charges v1 §6)

TypeScript strict sur les 5 workspaces, zéro `any` ; validation Zod systématique
(y compris champs personnalisés dynamiques) ; workers < 100 Ko gzip (limite 1 Mo) ;
back-end invisible depuis Internet hors gateway lecture seule.
