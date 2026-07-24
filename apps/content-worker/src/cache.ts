/**
 * Invalidation de cache par TAGS versionnés — équivalent Edge des Cache Tags
 * de Drupal (cahier v1 §3.3, granularisé). Chaque famille de données a sa
 * propre version en KV ; une route GET compose sa clé de cache avec les
 * versions des tags dont elle DÉPEND, une mutation ne fait avancer que les
 * tags qu'elle AFFECTE. Modifier un contenu ne purge donc plus le cache des
 * types ou de la taxonomie, et réciproquement.
 */

export type CacheTag = 'content' | 'types' | 'taxonomy' | 'settings';

export const ALL_TAGS: readonly CacheTag[] = ['content', 'types', 'taxonomy', 'settings'];

const tagKey = (tag: CacheTag) => `cache-tag:${tag}`;

/** Signature de version des tags demandés, ex. `content:m2x1|taxonomy:m2x0`. */
export async function getTagSignature(kv: KVNamespace, tags: readonly CacheTag[]): Promise<string> {
  const versions = await Promise.all(tags.map((t) => kv.get(tagKey(t))));
  return tags.map((t, i) => `${t}:${versions[i] ?? '0'}`).join('|');
}

/** Fait avancer la version des tags affectés par une mutation. */
export async function bumpTags(kv: KVNamespace, tags: readonly CacheTag[]): Promise<void> {
  const v = Date.now().toString(36);
  await Promise.all(tags.map((t) => kv.put(tagKey(t), v)));
}

export function buildCacheKey(signature: string, url: string): Request {
  const { pathname, search } = new URL(url);
  return new Request(`https://content-cache.internal/${signature}${pathname}${search}`, {
    method: 'GET',
  });
}

/**
 * Tags dont dépend une route GET. Les réponses de nœuds embarquent les
 * termes de taxonomie hydratés → elles dépendent aussi de `taxonomy`.
 */
export function tagsForRead(pathname: string): readonly CacheTag[] {
  if (pathname.startsWith('/api/types') || pathname.startsWith('/api/fields')) return ['types'];
  if (pathname.startsWith('/api/node')) return ['content', 'taxonomy'];
  if (pathname.startsWith('/api/taxonomy')) return ['taxonomy'];
  if (pathname.startsWith('/api/settings')) return ['settings'];
  return ALL_TAGS; // route inconnue : dépend de tout (sûr par défaut)
}

/**
 * Tags affectés par une mutation. Une mutation de taxonomie invalide aussi
 * `content` : les réponses de nœuds embarquent les libellés des termes.
 */
export function tagsForMutation(pathname: string): readonly CacheTag[] {
  if (pathname.startsWith('/api/types') || pathname.startsWith('/api/fields')) return ['types'];
  if (pathname.startsWith('/api/node')) return ['content'];
  if (pathname.startsWith('/api/taxonomy')) return ['taxonomy', 'content'];
  if (pathname.startsWith('/api/settings')) return ['settings'];
  return ALL_TAGS;
}
