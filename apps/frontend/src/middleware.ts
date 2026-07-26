import { defineMiddleware } from 'astro:middleware';
import { env, waitUntil } from 'cloudflare:workers';

/**
 * Page cache à la Drupal pour le site public (100 % anonyme, pas de session) :
 *
 * 1. L'ETag d'une page combine son CHEMIN et la signature des tags de cache
 *    dont elle dépend RÉELLEMENT (mêmes clés KV que les workers).
 *    Navigateur : `If-None-Match` → 304 sans aucun rendu SSR.
 * 2. Le HTML rendu est mis en cache edge (API Cache), clé versionnée par la
 *    même signature : tant que rien ne change, la page sort du cache ; une
 *    mutation fait avancer son tag et invalide ETag + cache edge.
 *
 * `/media/*` est exclu : les binaires ont leur propre stratégie (ETag R2,
 * URLs versionnées immuables, cache edge du media-worker).
 */

type Tag = 'content' | 'types' | 'taxonomy' | 'settings' | 'media';

const ALL_TAGS: readonly Tag[] = ['content', 'types', 'taxonomy', 'settings', 'media'];

/**
 * Tags dont dépend réellement une route.
 *
 * Auparavant les CINQ tags entraient dans la signature de TOUTES les pages :
 * modifier le texte alternatif d'un média purgeait l'intégralité du site,
 * y compris les pages sans le moindre média. Toute la granularité du
 * content-worker — qui range soigneusement ses lectures par famille — était
 * annulée au dernier étage.
 *
 * `settings` porte le thème actif, injecté dans le <head> de chaque page :
 * il est donc partout. `types` en revanche n'influence aucun rendu public,
 * les valeurs de champs étant rendues de façon agnostique du bundle.
 */
function tagsForPath(pathname: string): readonly Tag[] {
  // Accueil : liste de titres, aucun champ ni terme rendu.
  if (pathname === '/') return ['content', 'settings'];
  // Page de contenu : champs, termes hydratés et médias référencés.
  return ['content', 'taxonomy', 'settings', 'media'];
}

/**
 * En-têtes de sécurité du HTML public.
 *
 * La CSP est volontairement stricte et REND COMPTE de ce que le site fait
 * réellement : styles et images seulement, aucun script. Le front public
 * n'embarque aucun JavaScript (les îlots Preact vivent dans l'admin, projet
 * séparé) — `script-src 'none'` est donc exact aujourd'hui. Le jour où une
 * page aura besoin d'un script, la CSP le refusera bruyamment : c'est le
 * comportement voulu, pas un obstacle à contourner d'un `unsafe-inline`.
 *
 * `style-src 'unsafe-inline'` reste nécessaire : Astro injecte les styles de
 * composants en ligne.
 *
 * Pas de HSTS ici : il se règle au niveau de la zone Cloudflare, et le poser
 * depuis le Worker risquerait de le manquer sur les réponses non couvertes.
 */
function applySecurityHeaders(headers: Headers): void {
  headers.set(
    'content-security-policy',
    [
      "default-src 'none'",
      "img-src 'self' data:",
      "style-src 'self' 'unsafe-inline'",
      "font-src 'self'",
      "script-src 'none'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "base-uri 'none'",
    ].join('; '),
  );
  headers.set('x-content-type-options', 'nosniff');
  headers.set('referrer-policy', 'strict-origin-when-cross-origin');
}

/**
 * Micro-cache des versions de tags en mémoire d'isolat (1 s) : les rafales de
 * requêtes ne paient les lectures KV qu'une fois par seconde. Fenêtre de
 * staleness négligeable — KV est lui-même éventuellement cohérent (~60 s
 * inter-POP en prod), et l'ETag redevient exact dès la seconde suivante.
 */
let versionCache: { versions: Map<Tag, string>; at: number } | null = null;

async function tagVersions(): Promise<Map<Tag, string>> {
  if (versionCache !== null && Date.now() - versionCache.at < 1000) return versionCache.versions;
  const read = await Promise.all(ALL_TAGS.map((t) => env.CACHE_KV.get(`cache-tag:${t}`)));
  const versions = new Map(ALL_TAGS.map((t, i): [Tag, string] => [t, read[i] ?? '0']));
  versionCache = { versions, at: Date.now() };
  return versions;
}

async function signatureFor(pathname: string): Promise<string> {
  const versions = await tagVersions();
  return tagsForPath(pathname)
    .map((t) => `${t}:${versions.get(t) ?? '0'}`)
    .join('|');
}

export const onRequest = defineMiddleware(async (context, next) => {
  const { request } = context;
  const url = new URL(request.url);

  if (request.method !== 'GET' || url.pathname.startsWith('/media/')) {
    return next();
  }

  const signature = await signatureFor(url.pathname);
  // Le chemin entre dans l'ETag. Sans lui, toutes les pages du site
  // partageaient le MÊME ETag : le navigateur indexant par URL, ça
  // fonctionnait — mais tout intermédiaire qui déduplique par ETag se
  // trompait, et rien ne signalait l'ambiguïté.
  const etag = `W/"${url.pathname}:${signature}"`;

  // Rien n'a changé depuis la dernière visite : 304, zéro rendu.
  if (request.headers.get('if-none-match') === etag) {
    return new Response(null, {
      status: 304,
      headers: { etag, vary: 'Accept-Encoding', 'x-page-cache': 'revalidated' },
    });
  }

  const cache = caches.default;
  const cacheKey = new Request(
    `https://front-cache.internal/${encodeURIComponent(signature)}${url.pathname}${url.search}`,
  );
  const cached = await cache.match(cacheKey);
  if (cached !== undefined) {
    const out = new Response(cached.body, cached);
    out.headers.set('x-page-cache', 'hit');
    return out;
  }

  const res = await next();
  if (res.status !== 200 || !(res.headers.get('content-type') ?? '').includes('text/html')) {
    return res;
  }

  const headers = new Headers(res.headers);
  headers.set('etag', etag);
  headers.set('cache-control', 'public, max-age=0, must-revalidate');
  headers.set('vary', 'Accept-Encoding');
  applySecurityHeaders(headers);

  // La copie destinée au cache est un CLONE du flux : le HTML n'est plus
  // bufferisé par un `await res.text()`, qui supprimait le streaming SSR
  // d'Astro et repoussait d'autant le premier octet.
  const out = new Response(res.body, { status: 200, headers });
  const toStore = out.clone();

  // La Cache API refuse par exception une réponse porteuse de `Set-Cookie`.
  // Le site est anonyme aujourd'hui ; le jour où une route poserait un
  // cookie, l'exception ferait tomber toutes les pages. On retire l'en-tête
  // de la copie stockée plutôt que d'attendre l'incident.
  const storable = new Headers(headers);
  storable.delete('set-cookie');

  // `waitUntil` au lieu d'un `await` : l'écriture dans le cache edge ne
  // s'ajoute plus au temps de réponse.
  waitUntil(
    cache
      .put(cacheKey, new Response(toStore.body, { status: 200, headers: storable }))
      .catch((error: unknown) => {
        console.error({ event: 'page_cache.put_failed', path: url.pathname, error: String(error) });
      }),
  );

  out.headers.set('x-page-cache', 'miss');
  return out;
});
