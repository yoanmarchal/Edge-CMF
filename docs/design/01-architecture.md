# Design 01 — Architecture

## Topologie

```
Visiteurs ──HTTPS──▶ apps/frontend  (Astro 7 SSR, Worker "edge-cmf")        ← exposé
Admins    ──HTTPS──▶ apps/admin     (Astro 7 + Preact, Worker "edge-cmf-admin") ← exposé
Apps ext. ──HTTPS──▶ gateway-worker (REST /v1, clés API)                    ← exposé (lecture seule)
                        │ Service Bindings (< 2 ms, réseau interne)
        ┌───────────────┼──────────────────┐
        ▼               ▼                  ▼
  content-worker   auth-worker        media-worker
  D1 "edge-cmf-    D1 "edge-cmf-      R2 "edge-cmf-media"
  content" + KV    users"             + KV
```

Bindings par consommateur : frontend → CONTENT + MEDIA (+ CACHE_KV en lecture) ; admin → CONTENT + AUTH + MEDIA ; gateway → CONTENT (+ API_KEYS, CACHE_KV, rate-limit `RL`).

## Décisions structurantes

1. **Workers internes invisibles** — pas de `[routes]`, `workers_dev = false`. Seul un worker lié peut les invoquer. Conséquence : pas d'auth réseau entre workers ; la confiance est portée par la topologie, l'authorisation applicative vit dans l'admin (session) et le gateway (clé API).
2. **Admin ≠ Frontend** : deux Workers Astro distincts, domaines et cycles de déploiement séparés. Le front public n'a **pas** de binding auth (aucune session côté site public → page cache 100 % anonyme possible).
3. **RPC typé sans HTTP public** : chaque worker exporte `type XxxAPI = typeof routes` ; les clients font `hc<XxxAPI>('http://interne', { fetch: env.BINDING.fetch.bind(env.BINDING) })`. On n'importe jamais le code du worker, seulement son type.
4. **Admin en îlots** : les pages Astro admin ne rendent aucune donnée en SSR — garde de session serveur (cookie httpOnly) puis îlot Preact `client:only` qui consomme le proxy JSON `/api/*`. Évite le double-fetch et garde le token hors du client.
5. **Dev = prod** : `astro dev` tourne sur workerd réel ; `auxiliaryWorkers` démarre les workers internes ; `persistState` + `--persist-to` pointent tous vers `.wrangler-state/` à la racine (état D1/KV partagé entre les 6 process).
6. **Monorepo npm workspaces**, wrangler épinglé (override racine). Budget : chaque worker < 100 Ko gzip.

## Ordre de déploiement (impératif, cahier v3 §5)

1. Migrations D1 (content puis users) — `--remote`.
2. `wrangler deploy` des micro-workers (content, auth, media, gateway).
3. Build + `wrangler deploy` des deux Workers Astro (frontend, admin).

La CI (`.github/workflows/deploy.yml`) applique cet ordre : typecheck → migrations D1 → 4 micro-workers → frontend + admin (`npm run deploy -w …`).
