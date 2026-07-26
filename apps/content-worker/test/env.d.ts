/**
 * Typage de l'environnement de test.
 *
 * Fichier de script global (aucun import/export au niveau racine) : c'est la
 * condition pour augmenter le namespace `Cloudflare` déclaré par
 * @cloudflare/workers-types.
 *
 * Ces déclarations seront redondantes le jour où le projet adoptera
 * `wrangler types`, qui génère `Cloudflare.Env` à partir des bindings réels de
 * chaque wrangler.toml (voir P3 du rapport d'audit).
 */
declare namespace Cloudflare {
  /** Bindings de wrangler.toml + `TEST_MIGRATIONS`, injecté par vitest.config.ts. */
  interface Env {
    DB: D1Database;
    CACHE_KV: KVNamespace;
    TEST_MIGRATIONS: import('cloudflare:test').D1Migration[];
  }

  /** `exports.default` = le handler exporté par `main` (src/index.ts). */
  interface Exports {
    default: Fetcher;
  }
}
