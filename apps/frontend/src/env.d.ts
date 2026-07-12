/// <reference types="astro/client" />

/**
 * Interface minimale d'un Service Binding Cloudflare.
 * Structurellement compatible avec `Fetcher`, sans importer
 * @cloudflare/workers-types (évite les conflits avec lib DOM côté Astro).
 */
interface InternalFetcher {
  fetch: typeof fetch;
}

interface Env {
  readonly CONTENT_WORKER: InternalFetcher;
  readonly AUTH_WORKER: InternalFetcher;
}

type Runtime = import('@astrojs/cloudflare').Runtime<Env>;

declare namespace App {
  interface Locals extends Runtime {}
}
