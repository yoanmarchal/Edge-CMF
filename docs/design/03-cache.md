# Design 03 — Stratégie de cache (équivalent Cache Tags Drupal)

Invalidation par **tags versionnés en KV** (`CACHE_KV`, namespace partagé par content-worker, media-worker, gateway et frontend). Implémentation : `apps/content-worker/src/cache.ts` et `apps/frontend/src/middleware.ts`.

## Principe

- Tags : `content`, `types`, `taxonomy`, `settings` (+ `media` côté media-worker/front). Clé KV `cache-tag:<tag>` → version (`Date.now().toString(36)`).
- Une route GET compose sa clé de cache avec la **signature** des tags dont elle dépend (`getTagSignature` → `content:m2x1|taxonomy:m2x0`), stocke la réponse dans `caches.default` sous une URL interne fictive (`https://content-cache.internal/<sig><path><search>`).
- Une mutation appelle `bumpTags` sur les tags qu'elle **affecte** : la signature change, toutes les entrées dépendantes deviennent inatteignables (invalidation O(1), pas de purge).

## Matrice dépendances/effets (content-worker)

| Route | GET dépend de | Mutation affecte |
|---|---|---|
| `/api/types*`, `/api/fields*` | `types` | `types` |
| `/api/node*` | `content`, `taxonomy` (termes hydratés) | `content` |
| `/api/vocabularies*`, `/api/terms*` | `taxonomy` | `taxonomy` + `content` (libellés embarqués) |
| `/api/settings*` | `settings` | `settings` |
| inconnue | tous (sûr par défaut) | tous |

Toute **nouvelle route** doit être classée dans `tagsForRead`/`tagsForMutation`, sinon elle retombe dans « tous » (correct mais sous-optimal). Toute **nouvelle famille de données** = nouveau tag + ajout dans `TAGS` du middleware front.

## Page cache du front public (2 étages, 100 % anonyme)

1. **ETag = `W/"<signature des 5 tags>"`** ; `If-None-Match` identique → **304 sans aucun rendu SSR**.
2. Sinon, HTML cherché dans le cache edge (`caches.default`, clé versionnée par la même signature) ; en cas de miss, rendu SSR puis mise en cache.
3. Micro-cache in-memory de la signature (1 s par isolat) pour amortir les lectures KV en rafale.
4. Exclusions : méthodes non-GET et `/media/*` (les binaires ont leur propre stratégie : ETag R2, cache edge du media-worker).

Attention : KV est éventuellement cohérent (~60 s inter-POP) — l'invalidation mondiale n'est pas strictement instantanée, c'est un compromis assumé.

## Gateway

Même mécanique côté `/v1/*` (mêmes tags via `CACHE_KV` partagé) : le cache public est invalidé par les mutations faites dans l'admin sans aucun couplage direct.

## Règle d'or

**Toute mutation qui n'appelle pas `bumpTags` (ou n'écrit pas `cache-tag:media`) crée un bug de données périmées** sur le site public, l'admin et l'API publique. C'est le premier point à vérifier en revue de code.
