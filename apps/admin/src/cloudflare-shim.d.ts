/**
 * Shim de types Cloudflare pour l'Admin (même besoin que le front, voir
 * apps/frontend/src/cloudflare-shim.d.ts).
 *
 * L'admin importe les types RPC depuis les sources des workers
 * (`import type { ContentAPI } from '@edge-cmf/content-worker'`).
 * tsc compile alors ces fichiers sous l'univers DOM d'Astro, où les
 * globaux du runtime Workers (D1Database, KVNamespace, caches.default)
 * n'existent pas. Ces déclarations minimales, purement type-only,
 * comblent l'écart — le code des workers ne s'exécute jamais côté admin.
 */

declare abstract class D1Database {
  prepare(query: string): unknown;
  batch(statements: unknown[]): Promise<unknown[]>;
  exec(query: string): Promise<unknown>;
  dump(): Promise<ArrayBuffer>;
}

interface KVNamespace {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

// Le runtime Workers expose caches.default (absent de lib DOM)
interface CacheStorage {
  readonly default: Cache;
}
