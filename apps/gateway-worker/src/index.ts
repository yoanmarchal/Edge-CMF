import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { hc } from 'hono/client';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import {
  machineNameSchema,
  slugParamSchema,
  machineParamSchema,
  reportServerError,
  serverErrorMessage,
} from '@edge-cmf/shared-types';
import type { ContentAPI } from '@edge-cmf/content-worker';

/** Binding natif Cloudflare de rate limiting */
interface RateLimitBinding {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

type Bindings = {
  CONTENT_WORKER: Fetcher;
  API_KEYS: KVNamespace;
  CACHE_KV: KVNamespace;
  PUBLIC_API_OPEN: string;
  RL?: RateLimitBinding;
};

type Variables = {
  apiKey: string;
};

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

function contentClient(env: Bindings) {
  return hc<ContentAPI>('http://interne', {
    fetch: env.CONTENT_WORKER.fetch.bind(env.CONTENT_WORKER),
  });
}

/** Forme structurelle minimale d'une réponse RPC (ClientResponse hono). */
interface UpstreamResponse {
  readonly body: ReadableStream | null;
  readonly status: number;
  readonly headers: Headers;
}

/** Repropage la réponse du worker interne telle quelle. */
function passthrough(res: UpstreamResponse): Response {
  return new Response(res.body, { status: res.status, headers: res.headers });
}

// ---------------------------------------------------------------------------
// Middleware 0 : CORS — AVANT tout le reste
//
// L'API était annoncée « pour apps mobiles, autres front-ends, intégrations
// tierces » mais restait inaccessible depuis un navigateur : `x-api-key` est
// un en-tête non simple, donc tout appel cross-origin déclenche un préflight
// OPTIONS — qui n'était pas géré. Et l'en-tête `Access-Control-Allow-Origin`
// n'était posé que sur les succès : un 401 ou un 429 arrivait au client sous
// forme d'erreur réseau opaque, impossible à diagnostiquer côté intégrateur.
//
// Monté en premier pour couvrir AUSSI les réponses des middlewares suivants.
// ---------------------------------------------------------------------------
app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'OPTIONS'],
  allowHeaders: ['x-api-key', 'content-type'],
  exposeHeaders: ['X-Edge-Cache'],
  maxAge: 86400,
}));

// ---------------------------------------------------------------------------
// Middleware 1 : freinage par origine réseau, AVANT toute lecture KV
//
// La validation de clé faisait une lecture KV facturée à chaque requête, sans
// aucun plafond, sur un worker exposé publiquement. Une clé bidon répétée
// suffisait à générer du coût sans jamais être comptabilisée : le limiteur ne
// s'exécutait qu'APRÈS. Ce premier passage large protège le chemin non
// authentifié ; le limiteur fin par clé reste en aval.
// ---------------------------------------------------------------------------
app.use('/v1/*', async (c, next) => {
  const rl = c.env.RL;
  if (rl !== undefined) {
    const source = c.req.header('cf-connecting-ip') ?? 'inconnue';
    const { success } = await rl.limit({ key: `anon:${source}` });
    if (!success) {
      return c.json({ success: false as const, error: 'Limite de requêtes atteinte' }, 429);
    }
  }
  await next();
});

// ---------------------------------------------------------------------------
// Middleware 2 : clé API (x-api-key) — stockées dans KV sous "apikey:<clé>"
// ---------------------------------------------------------------------------
/**
 * Empreinte SHA-256 hexadécimale d'une clé API.
 *
 * KV indexait les clés SOUS LEUR VALEUR EN CLAIR (`apikey:<clé>`). Un listing
 * du namespace — via le tableau de bord, l'API REST ou un jeton d'API trop
 * permissif — suffisait donc à récupérer les clés de tous les consommateurs et
 * à les usurper. En stockant l'empreinte, le namespace ne contient plus rien
 * d'exploitable : on peut vérifier une clé présentée, pas la reconstituer.
 */
async function apiKeyFingerprint(key: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

app.use('/v1/*', async (c, next) => {
  if (c.env.PUBLIC_API_OPEN === '1') {
    c.set('apiKey', 'open');
    await next();
    return;
  }
  const key = c.req.header('x-api-key');
  if (key === undefined || key.length === 0) {
    return c.json({ success: false as const, error: 'Clé API manquante (header x-api-key)' }, 401);
  }
  const fingerprint = await apiKeyFingerprint(key);
  const owner = await c.env.API_KEYS.get(`apikey:${fingerprint}`);
  if (owner === null) {
    return c.json({ success: false as const, error: 'Clé API invalide' }, 403);
  }
  // L'empreinte, et non la clé, sert de clé de rate limiting : la valeur
  // secrète n'a pas à circuler plus loin que nécessaire.
  c.set('apiKey', fingerprint);
  await next();
});

// ---------------------------------------------------------------------------
// Middleware 3 : rate limiting fin, par clé API
// ---------------------------------------------------------------------------
app.use('/v1/*', async (c, next) => {
  const rl = c.env.RL;
  if (rl !== undefined) {
    const { success } = await rl.limit({ key: c.get('apiKey') });
    if (!success) {
      return c.json({ success: false as const, error: 'Limite de requêtes atteinte' }, 429);
    }
  }
  await next();
});

// ---------------------------------------------------------------------------
// Middleware 3 : cache Edge des GET (version partagée avec le content-worker)
// ---------------------------------------------------------------------------
/**
 * Tags de cache dont dépend chaque route publique (mêmes clés KV que le
 * content-worker : `cache-tag:<tag>`, invalidation par version à la Drupal).
 */
function readTags(pathname: string): readonly string[] {
  if (pathname.startsWith('/v1/nodes')) return ['content', 'taxonomy'];
  if (pathname.startsWith('/v1/types')) return ['types'];
  if (pathname.startsWith('/v1/vocabularies')) return ['taxonomy'];
  return ['content', 'types', 'taxonomy', 'settings'];
}

app.use('/v1/*', async (c, next) => {
  if (c.req.method !== 'GET') {
    await next();
    return;
  }
  const { pathname, search } = new URL(c.req.url);
  const tags = readTags(pathname);
  const versions = await Promise.all(tags.map((t) => c.env.CACHE_KV.get(`cache-tag:${t}`)));
  const signature = tags.map((t, i) => `${t}:${versions[i] ?? '0'}`).join('|');
  const cacheKey = new Request(`https://gateway-cache.internal/${signature}${pathname}${search}`);
  const cached = await caches.default.match(cacheKey);
  if (cached !== undefined) {
    c.res = new Response(cached.body, cached);
    c.res.headers.set('X-Edge-Cache', 'HIT');
    return;
  }
  await next();
  if (c.res.ok) {
    const clone = c.res.clone();
    const toStore = new Response(clone.body, clone);
    toStore.headers.set('Cache-Control', 'public, s-maxage=60');
    c.executionCtx.waitUntil(
      caches.default.put(cacheKey, toStore).catch((error: unknown) => {
        console.error({ event: 'cache.put_failed', pathname, error: String(error) });
      }),
    );
    c.res.headers.set('X-Edge-Cache', 'MISS');
  }
});

// ---------------------------------------------------------------------------
// Routes publiques v1 — LECTURE SEULE, contenu publié uniquement
// (le paramètre interne `all` n'est jamais transmis)
// ---------------------------------------------------------------------------

const publicListQuerySchema = z.object({
  type: machineNameSchema.optional(),
  term: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

app
  .get('/v1/nodes', zValidator('query', publicListQuerySchema), async (c) => {
    const { type, term, limit, offset } = c.req.valid('query');
    const res = await contentClient(c.env).api.nodes.$get({
      query: {
        ...(type !== undefined ? { type } : {}),
        ...(term !== undefined ? { term } : {}),
        limit: String(limit),
        offset: String(offset),
      },
    });
    return passthrough(res);
  })

  .get('/v1/nodes/:slug', zValidator('param', slugParamSchema), async (c) => {
    const { slug } = c.req.valid('param');
    const res = await contentClient(c.env).api.nodes[':slug'].$get({ param: { slug } });
    return passthrough(res);
  })

  .get(
    '/v1/types',
    zValidator('query', z.object({ kind: z.enum(['node', 'paragraph']).optional() })),
    async (c) => {
      const { kind } = c.req.valid('query');
      const res = await contentClient(c.env).api.types.$get({
        query: kind !== undefined ? { kind } : {},
      });
      return passthrough(res);
    },
  )

  .get('/v1/types/:id', zValidator('param', machineParamSchema), async (c) => {
    const { id } = c.req.valid('param');
    const res = await contentClient(c.env).api.types[':id'].$get({ param: { id } });
    return passthrough(res);
  })

  .get('/v1/vocabularies', async (c) => {
    const res = await contentClient(c.env).api.vocabularies.$get();
    return passthrough(res);
  })

  .notFound((c) =>
    c.json({ success: false as const, error: 'Route inconnue — voir /v1/nodes, /v1/types…' }, 404),
  );

// Le gateway est le SEUL worker exposé publiquement : c'est ici qu'une fuite
// de message interne atteint un tiers non authentifié.
app.onError((err, c) => {
  const ref = reportServerError(err, {
    service: 'gateway-worker',
    method: c.req.method,
    path: new URL(c.req.url).pathname,
  });
  return c.json({ success: false as const, error: serverErrorMessage(ref) }, 500);
});

export default app;
