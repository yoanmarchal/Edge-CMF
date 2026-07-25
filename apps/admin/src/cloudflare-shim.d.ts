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

// ---------------------------------------------------------------------------
// R2 — requis car l'admin importe `type { MediaAPI } from '@edge-cmf/media-worker'`,
// dont la source utilise les globaux R2 de workers-types. Déclarations
// minimales couvrant exactement l'usage de apps/media-worker/src/index.ts.
// ---------------------------------------------------------------------------

interface R2HTTPMetadata {
  contentType?: string;
}

interface R2Range {
  offset: number;
  length?: number;
}

interface R2ListOptions {
  limit?: number;
  cursor?: string;
}

declare abstract class R2Object {
  readonly key: string;
  readonly size: number;
  readonly uploaded: Date;
  readonly httpEtag: string;
  readonly httpMetadata?: R2HTTPMetadata;
  readonly customMetadata?: Record<string, string>;
  writeHttpMetadata(headers: Headers): void;
}

declare abstract class R2ObjectBody extends R2Object {
  readonly body: ReadableStream | null;
  arrayBuffer(): Promise<ArrayBuffer>;
}

type R2Objects = {
  objects: R2Object[];
} & ({ truncated: true; cursor: string } | { truncated: false });

interface R2PutOptions {
  httpMetadata?: R2HTTPMetadata;
  customMetadata?: Record<string, string>;
}

interface R2Bucket {
  head(key: string): Promise<R2Object | null>;
  get(key: string, options?: { range?: R2Range }): Promise<R2ObjectBody | null>;
  put(key: string, value: ArrayBuffer, options?: R2PutOptions): Promise<R2Object>;
  delete(key: string): Promise<void>;
  list(options?: R2ListOptions): Promise<R2Objects>;
}
