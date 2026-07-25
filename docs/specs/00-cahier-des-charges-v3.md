# Spécification 00 — Cahier des charges v3 (synthèse de référence)

> Source : `cahier_des_charges_fullstack_edge-v3.pdf` (Spécifications Définitives, v3.0.0).
> Ce fichier est la version exploitable par l'IA ; le PDF fait foi pour l'intention d'origine,
> les **écarts assumés** (implémentation ayant dépassé le cahier) sont listés en fin de document.

## 1. Objectif

Système de gestion de contenu (CMF) 100 % Edge-natif combinant SEO du rendu SSR et scalabilité serverless. Front-end et back-end déployés sur le réseau Cloudflare, communiquant **exclusivement** via Service Bindings (réseau interne, < 2 ms), avec typage strict de bout en bout.

## 2. Stack imposée

- **Front SSR** : Astro (Island Architecture, zero-JS par défaut), hébergé sur Cloudflare (Edge).
- **Client API** : `hono/client` (RPC) — import des *types* du back pour l'auto-complétion.
- **Back** : Cloudflare Workers + Hono ; Drizzle ORM + Cloudflare D1 (SQLite distribué).
- **Topologie** : micro-services internes (Auth Service, Content Service) non exposés sur Internet.

## 3. Topologie réseau (exigence de sécurité)

| Composant | Rôle exclusif | Exposition publique |
|---|---|---|
| Astro SSR | Génère le HTML final | OUI (domaine principal) |
| Content Worker (Hono) | Logique métier Drizzle, interroge D1 | NON (binding interne) |
| Auth Worker | Sessions, JWT, RBAC | NON (binding interne) |

Exigence : les workers back-end n'ont **aucune route HTTP publique** (pas de `[routes]` dans `wrangler.toml`) → invisibles depuis l'extérieur, insensibles aux DDoS directs.

## 4. Typage de bout en bout (exigence)

- Le worker exporte son interface : `export type ContentAPI = typeof routes;`
- Le front importe **uniquement le type** et crée un client RPC branché sur le `fetch` du binding :

```ts
const client = hc<ContentAPI>('http://interne', {
  fetch: env.CONTENT_WORKER.fetch.bind(env.CONTENT_WORKER),
});
```

- Aucun `any` : tout changement de schéma BDD remonte jusqu'au template HTML.

## 5. Monorepo & déploiement

- Monorepo npm workspaces ; un push sur `main` déclenche la CI/CD.
- **Ordre impératif** : 1) migrations D1 → 2) `wrangler deploy` des micro-workers → 3) build + deploy des apps Astro.

## 6. Garanties économiques/perfs visées

Coût d'entrée 0 € (free tier), TTFB < 40 ms, auto-scaling Cloudflare, en contrepartie d'une complexité de dev élevée (distribué, TS strict, monorepo).

## Écarts assumés entre le PDF et l'implémentation actuelle

1. **Cloudflare Pages → Workers** : l'adaptateur `@astrojs/cloudflare` v13+ a supprimé le support Pages. `apps/frontend` et `apps/admin` sont des Workers déployés par `wrangler deploy`.
2. **`Astro.locals.runtime.env` → `import { env } from 'cloudflare:workers'`** (Astro 6+/adaptateur v13+).
3. **Périmètre étendu** au-delà du cahier : modélisation de contenu dynamique (Field UI), paragraphes, taxonomies, media-worker (R2), gateway-worker (API publique `/v1`), admin séparé. Voir specs 01 et 02.
4. Le monorepo place les workers dans `apps/*` (le PDF montrait `packages/content-worker`).
