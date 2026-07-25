# Spécification 02 — Surfaces d'API (état implémenté)

Trois surfaces distinctes. Les routes internes ne sont joignables **que** par Service Binding.

## 1. content-worker (interne — bindings `DB`, `CACHE_KV`)

Toutes les entrées validées par `zValidator` avec les schémas de `@edge-cmf/shared-types`.
Exporte `export type ContentAPI = typeof routes` pour les clients RPC.

| Méthode | Route | Rôle |
|---|---|---|
| GET | `/api/types?kind=&expand=fields` | Liste des types (node/paragraph) ; `expand=fields` joint la Field API de chaque type en une requête |
| GET | `/api/types/:id` | Type + définitions de champs |
| POST | `/api/types` | Créer un type |
| DELETE | `/api/types/:id` | Supprimer un type (cascade champs) |
| POST | `/api/fields` | Ajouter un champ à un type |
| DELETE | `/api/fields/:id` | Supprimer un champ |
| GET | `/api/vocabularies` | Vocabulaires + termes |
| POST | `/api/vocabularies` | Créer un vocabulaire |
| DELETE | `/api/vocabularies/:id` | Supprimer (cascade termes) |
| POST | `/api/terms` | Créer un terme |
| DELETE | `/api/terms/:id` | Supprimer un terme |
| GET | `/api/nodes?type=&term=&all=&limit=&offset=` | Liste (publiés ; `all=1` = tous, admin) |
| GET | `/api/nodes/:slug` | Nœud publié par slug (hydraté : champs, termes, paragraphes) |
| GET | `/api/node/:id` | Nœud par id (admin, y compris non publié) |
| POST | `/api/nodes` | Créer (validation dynamique des champs + paragraphes) |
| PUT | `/api/nodes/:id` | Mettre à jour (partiel) |
| DELETE | `/api/nodes/:id` | Supprimer |
| GET | `/api/stats` | Compteurs du tableau de bord (`count()` SQL : nœuds, publiés, types, types de paragraphe) |
| GET | `/api/settings/:key` | Lire un réglage |
| PUT | `/api/settings/:key` | Écrire un réglage |

Cache : GET servis via Cache API avec clé versionnée par tags (`content`, `types`, `taxonomy`, `settings`) ; toute mutation appelle `bumpTags` sur les tags affectés (voir `docs/design/03-cache.md`).

## 2. auth-worker (interne — binding `DB` ; secrets `JWT_SECRET`, `SETUP_TOKEN`)

| Méthode | Route | Rôle |
|---|---|---|
| POST | `/register` | Créer un utilisateur — 1er admin via header `x-setup-token`, ensuite réservé admin |
| POST | `/login` | Vérifie PBKDF2, renvoie JWT |
| GET | `/validate` | Valide `Authorization: Bearer <jwt>` → `{ user: UserContext }` |
| GET | `/users` | Liste (admin) |
| DELETE | `/users/:id` | Supprimer (admin) |

## 3. media-worker (interne — bindings `MEDIA` (R2), `CACHE_KV`)

| Méthode | Route | Rôle |
|---|---|---|
| GET | `/api/media?cursor=&limit=` | Bibliothèque paginée |
| POST | `/api/media` | Upload (multipart ; MIME + 50 Mo validés) |
| GET | `/api/media/item/:key` | Métadonnées d'un objet |
| GET | `/api/media/file/:key` | Binaire (ETag R2) |
| POST | `/api/media/replace/:key` | Remplacer le binaire |
| PATCH | `/api/media/meta/:key` | Modifier l'alt |
| DELETE | `/api/media/:key` | Supprimer |

Les clés contiennent des `/` → motif Hono `:key{.+}`. Toute mutation bump `cache-tag:media`.

## 4. gateway-worker (PUBLIC — bindings `CONTENT_WORKER`, `API_KEYS`, `CACHE_KV`, rate-limit `RL`)

Lecture seule, proxy typé (`hc<ContentAPI>`) vers content-worker, contenu publié uniquement.

| Méthode | Route |
|---|---|
| GET | `/v1/nodes?type=&term=&limit=&offset=` |
| GET | `/v1/nodes/:slug` |
| GET | `/v1/types?kind=` |
| GET | `/v1/types/:id` |
| GET | `/v1/vocabularies` |

Middleware dans l'ordre : CORS → clé API (`x-api-key`, sauf `PUBLIC_API_OPEN="1"`) → rate-limit (100/60 s par clé) → cache edge (tags partagés).

## 5. apps/admin — proxy JSON `/api/*` (public derrière session)

Pages Astro `src/pages/api/*.ts` : garde `requireApiSession(cookies, { adminOnly?, writeOnly? })` puis relais RPC vers les workers. Endpoints : `login`, `logout`, `nodes`, `types`, `taxonomy`, `users`, `media` (+ `media/file/[...key]`), `settings`. Consommés exclusivement par les îlots Preact.

## 6. apps/frontend — routes publiques

`/` (accueil), `/[slug]` (rendu SSR d'un nœud publié : champs via `FieldValue.astro`, paragraphes, termes), `/media/[...key]` (proxy lecture seule vers media-worker), `404`, `500`. Page cache ETag/304 + cache edge via `src/middleware.ts`.
