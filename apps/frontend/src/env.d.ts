/// <reference types="astro/client" />

/**
 * Interface minimale d'un Service Binding Cloudflare.
 * Structurellement compatible avec `Fetcher`, sans importer
 * @cloudflare/workers-types (évite les conflits avec lib DOM côté Astro).
 */
interface InternalFetcher {
  fetch: typeof fetch;
}

/**
 * Depuis Astro 6/@astrojs/cloudflare v13+, `Astro.locals.runtime` est
 * supprimé : les bindings s'accèdent via `import { env } from 'cloudflare:workers'`,
 * typé contre ce namespace global `Cloudflare.Env` (et non plus un `Env`
 * local threadé à travers `locals`).
 */
/** Interface minimale d'un namespace KV (lecture seule côté front). */
interface InternalKV {
  get(key: string): Promise<string | null>;
}

declare namespace Cloudflare {
  interface Env {
    readonly CONTENT_WORKER: InternalFetcher;
    readonly MEDIA_WORKER: InternalFetcher;
    readonly CACHE_KV: InternalKV;
  }
}

/** L'API Cache Workers expose `caches.default`, absent des types DOM. */
interface CacheStorage {
  readonly default: Cache;
}

/**
 * Déclaration minimale du module virtuel `cloudflare:workers` (fourni par le
 * runtime Workers). On évite d'importer tout `@cloudflare/workers-types` :
 * ce paquet redéfinit `Request`/`Response`/`fetch` dans une saveur workerd
 * qui entre en conflit avec la lib DOM utilisée par Astro/TypeScript ici.
 */
declare module 'cloudflare:workers' {
  export const env: Cloudflare.Env;
}
