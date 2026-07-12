import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { drizzle } from 'drizzle-orm/d1';
import { and, desc, eq } from 'drizzle-orm';
import {
  insertNodeSchema,
  updateNodeSchema,
  listNodesQuerySchema,
  slugParamSchema,
  idParamSchema,
} from '@edge-cmf/shared-types';
import { contentNodes } from './schema';
import { getCacheVersion, bumpCacheVersion, buildCacheKey } from './cache';

type Bindings = {
  DB: D1Database;
  CACHE_KV: KVNamespace;
};

const app = new Hono<{ Bindings: Bindings }>();

// ---------------------------------------------------------------------------
// Middleware de cache Edge (Cache API + versionnage KV — cahier v1 §3.3)
// GET  : servi depuis caches.default si présent (TTFB < 20ms visé)
// Écriture réussie : bump de version => invalidation globale des GET
// ---------------------------------------------------------------------------
app.use('/api/*', async (c, next) => {
  if (c.req.method !== 'GET') {
    await next();
    if (c.res.ok) {
      c.executionCtx.waitUntil(bumpCacheVersion(c.env.CACHE_KV));
    }
    return;
  }

  const version = await getCacheVersion(c.env.CACHE_KV);
  const cacheKey = buildCacheKey(version, c.req.url);
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
    c.executionCtx.waitUntil(caches.default.put(cacheKey, toStore));
    c.res.headers.set('X-Edge-Cache', 'MISS');
  }
});

// ---------------------------------------------------------------------------
// Routes chaînées : indispensable pour l'inférence RPC de hono/client
// ---------------------------------------------------------------------------
const routes = app
  // Liste des nœuds publiés (filtre par type + pagination)
  .get('/api/articles', zValidator('query', listNodesQuerySchema), async (c) => {
    const { type, limit, offset } = c.req.valid('query');
    const db = drizzle(c.env.DB);

    const conditions = [eq(contentNodes.status, true)];
    if (type !== undefined) {
      conditions.push(eq(contentNodes.contentType, type));
    }

    const data = await db
      .select()
      .from(contentNodes)
      .where(and(...conditions))
      .orderBy(desc(contentNodes.createdAt))
      .limit(limit)
      .offset(offset);

    // Le type inféré est renvoyé automatiquement (cahier v3 §4.1)
    return c.json({ data });
  })

  // Détail d'un nœud par slug
  .get('/api/nodes/:slug', zValidator('param', slugParamSchema), async (c) => {
    const { slug } = c.req.valid('param');
    const db = drizzle(c.env.DB);

    const [node] = await db
      .select()
      .from(contentNodes)
      .where(and(eq(contentNodes.slug, slug), eq(contentNodes.status, true)))
      .limit(1);

    if (node === undefined) {
      return c.json({ success: false as const, error: 'Nœud introuvable' }, 404);
    }
    return c.json({ success: true as const, data: node });
  })

  // Création d'un nœud
  .post('/api/nodes', zValidator('json', insertNodeSchema), async (c) => {
    const validatedData = c.req.valid('json');
    const db = drizzle(c.env.DB);

    try {
      await db
        .insert(contentNodes)
        .values({
          ...validatedData,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .run();
      return c.json(
        { success: true as const, message: 'Node créé avec succès', id: validatedData.id },
        201,
      );
    } catch (error) {
      return c.json({ success: false as const, error: (error as Error).message }, 500);
    }
  })

  // Mise à jour partielle
  .put(
    '/api/nodes/:id',
    zValidator('param', idParamSchema),
    zValidator('json', updateNodeSchema),
    async (c) => {
      const { id } = c.req.valid('param');
      const patch = c.req.valid('json');
      const db = drizzle(c.env.DB);

      const updated = await db
        .update(contentNodes)
        .set({ ...patch, updatedAt: new Date() })
        .where(eq(contentNodes.id, id))
        .returning({ id: contentNodes.id });

      if (updated.length === 0) {
        return c.json({ success: false as const, error: 'Nœud introuvable' }, 404);
      }
      return c.json({ success: true as const, id });
    },
  )

  // Suppression
  .delete('/api/nodes/:id', zValidator('param', idParamSchema), async (c) => {
    const { id } = c.req.valid('param');
    const db = drizzle(c.env.DB);

    const deleted = await db
      .delete(contentNodes)
      .where(eq(contentNodes.id, id))
      .returning({ id: contentNodes.id });

    if (deleted.length === 0) {
      return c.json({ success: false as const, error: 'Nœud introuvable' }, 404);
    }
    return c.json({ success: true as const, id });
  });

app.onError((err, c) => c.json({ success: false as const, error: err.message }, 500));

// Exportation vitale pour le Front-End (cahier v3 §4.1)
export type ContentAPI = typeof routes;
export default app;
