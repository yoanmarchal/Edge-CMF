import { defineMiddleware } from 'astro:middleware';
import { env } from 'cloudflare:workers';

/**
 * Page cache à la Drupal pour le site public (100% anonyme, pas de session) :
 *
 * 1. L'ETag de chaque page HTML est la signature des tags de cache
 *    (content, types, taxonomy, settings, media — mêmes clés KV que les
 *    workers). Navigateur : `If-None-Match` → 304 sans AUCUN rendu SSR.
 * 2. Le HTML rendu est mis en cache edge (API Cache), clé versionnée par la
 *    même signature : tant que rien n'est modifié, la page sort du cache ;
 *    toute mutation (contenu, taxo, thème, remplacement de média…) fait
 *    avancer son tag et invalide instantanément ETag + cache edge.
 *
 * `/media/*` est exclu : les binaires ont leur propre stratégie (ETag R2,
 * URLs versionnées immuables, cache edge du media-worker).
 */
const TAGS = ['content', 'types', 'taxonomy', 'settings', 'media'] as const;

/**
 * Micro-cache de la signature en mémoire d'isolat (1 s) : les rafales de
 * requêtes ne paient les lectures KV qu'une fois par seconde. Fenêtre de
 * staleness négligeable — KV est lui-même éventuellement cohérent (~60 s
 * inter-POP en prod), et l'ETag reste exact dès la seconde suivante.
 */
let sigCache: { sig: string; at: number } | null = null;

async function tagSignature(): Promise<string> {
  if (sigCache !== null && Date.now() - sigCache.at < 1000) return sigCache.sig;
  const versions = await Promise.all(TAGS.map((t) => env.CACHE_KV.get(`cache-tag:${t}`)));
  const sig = TAGS.map((t, i) => `${t}:${versions[i] ?? '0'}`).join('|');
  sigCache = { sig, at: Date.now() };
  return sig;
}

export const onRequest = defineMiddleware(async (context, next) => {
  const { request } = context;
  const url = new URL(request.url);

  if (request.method !== 'GET' || url.pathname.startsWith('/media/')) {
    return next();
  }

  const signature = await tagSignature();
  const etag = `W/"${signature}"`;

  // Rien n'a changé depuis la dernière visite : 304, zéro rendu.
  if (request.headers.get('if-none-match') === etag) {
    return new Response(null, {
      status: 304,
      headers: { etag, 'x-page-cache': 'revalidated' },
    });
  }

  // HTML déjà rendu pour cette version du site : cache edge.
  const cache = caches.default;
  const cacheKey = new Request(`https://front-cache.internal/${encodeURIComponent(signature)}${url.pathname}${url.search}`);
  const cached = await cache.match(cacheKey);
  if (cached !== undefined) {
    const out = new Response(cached.body, cached);
    out.headers.set('x-page-cache', 'hit');
    return out;
  }

  // Rendu SSR, puis mise en cache (pages HTML 200 uniquement).
  const res = await next();
  if (res.status !== 200 || !(res.headers.get('content-type') ?? '').includes('text/html')) {
    return res;
  }

  const html = await res.text();
  const headers = new Headers(res.headers);
  headers.set('etag', etag);
  headers.set('cache-control', 'public, max-age=0, must-revalidate');
  await cache.put(cacheKey, new Response(html, { status: 200, headers }));

  const out = new Response(html, { status: 200, headers });
  out.headers.set('x-page-cache', 'miss');
  return out;
});
