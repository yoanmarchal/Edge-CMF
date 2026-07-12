/**
 * Invalidation de cache par version (simulation des "Cache Tags" — cahier v1 §3.3).
 * La version courante est stockée dans KV ; toute mutation la fait avancer,
 * ce qui rend obsolètes toutes les entrées du cache Edge précédentes.
 */

const VERSION_KEY = 'content-cache-version';

export async function getCacheVersion(kv: KVNamespace): Promise<string> {
  return (await kv.get(VERSION_KEY)) ?? '0';
}

export async function bumpCacheVersion(kv: KVNamespace): Promise<void> {
  await kv.put(VERSION_KEY, Date.now().toString(36));
}

export function buildCacheKey(version: string, url: string): Request {
  const { pathname, search } = new URL(url);
  return new Request(`https://content-cache.internal/${version}${pathname}${search}`, {
    method: 'GET',
  });
}
