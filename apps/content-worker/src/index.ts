import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { drizzle } from 'drizzle-orm/d1';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import { and, asc, count, desc, eq, inArray } from 'drizzle-orm';
import {
  insertNodeSchema,
  updateNodeSchema,
  listNodesQuerySchema,
  slugParamSchema,
  idParamSchema,
  machineParamSchema,
  insertContentTypeSchema,
  listTypesQuerySchema,
  insertFieldSchema,
  insertVocabularySchema,
  insertTermSchema,
  fieldTypeEnum,
  fieldSettingsSchema,
  buildFieldValuesSchema,
  type ContentStats,
  type FieldDef,
  type InsertParagraph,
} from '@edge-cmf/shared-types';
import {
  contentNodes,
  contentTypes,
  fields,
  vocabularies,
  terms,
  nodeTerms,
  nodeParagraphs,
  siteSettings,
  type ContentNode,
  type FieldRow,
  type TermRow,
} from './schema';
import { getTagSignature, bumpTags, buildCacheKey, tagsForRead, tagsForMutation } from './cache';

const settingKeyParamSchema = z.object({ key: z.string().min(1).max(64) });
const settingValueSchema = z.object({ value: z.string().max(256) });

type Bindings = {
  DB: D1Database;
  CACHE_KV: KVNamespace;
};

type DB = DrizzleD1Database<Record<string, never>>;

const app = new Hono<{ Bindings: Bindings }>();

// ---------------------------------------------------------------------------
// Helpers — Field API dynamique
// ---------------------------------------------------------------------------

function rowToFieldDef(row: FieldRow): FieldDef {
  const rawSettings: unknown = JSON.parse(row.settings);
  return {
    id: row.id,
    contentTypeId: row.contentTypeId,
    name: row.name,
    label: row.label,
    fieldType: fieldTypeEnum.parse(row.fieldType),
    required: row.required,
    settings: fieldSettingsSchema.parse(rawSettings),
    weight: row.weight,
  };
}

async function loadFieldDefs(db: DB, typeId: string): Promise<FieldDef[]> {
  const rows = await db
    .select()
    .from(fields)
    .where(eq(fields.contentTypeId, typeId))
    .orderBy(asc(fields.weight), asc(fields.name));
  return rows.map(rowToFieldDef);
}

async function loadNodeTerms(db: DB, nodeId: string): Promise<TermRow[]> {
  return db
    .select({
      id: terms.id,
      vocabularyId: terms.vocabularyId,
      label: terms.label,
      slug: terms.slug,
      parentId: terms.parentId,
    })
    .from(nodeTerms)
    .innerJoin(terms, eq(nodeTerms.termId, terms.id))
    .where(eq(nodeTerms.nodeId, nodeId));
}

interface HydratedParagraph {
  readonly id: string;
  readonly type: string;
  readonly fields: Record<string, unknown>;
  readonly weight: number;
}

function hydrateNode(
  node: ContentNode,
  nodeTermRows: TermRow[],
  paragraphs: HydratedParagraph[] = [],
) {
  const rawFields: unknown = JSON.parse(node.fieldsJson);
  const { fieldsJson: _drop, ...rest } = node;
  return {
    ...rest,
    fields: (rawFields ?? {}) as Record<string, unknown>,
    terms: nodeTermRows,
    paragraphs,
  };
}

async function replaceNodeTerms(db: DB, nodeId: string, termIds: string[]): Promise<void> {
  await db.delete(nodeTerms).where(eq(nodeTerms.nodeId, nodeId));
  if (termIds.length > 0) {
    await db.insert(nodeTerms).values(termIds.map((termId) => ({ nodeId, termId })));
  }
}

// ---------------------------------------------------------------------------
// Paragraphs — composants structurés réutilisables (équivalent Drupal Paragraphs)
// ---------------------------------------------------------------------------

async function loadNodeParagraphs(db: DB, nodeId: string): Promise<HydratedParagraph[]> {
  const rows = await db
    .select()
    .from(nodeParagraphs)
    .where(eq(nodeParagraphs.nodeId, nodeId))
    .orderBy(asc(nodeParagraphs.weight));
  return rows.map((r) => {
    const raw: unknown = JSON.parse(r.fieldsJson);
    return {
      id: r.id,
      type: r.paragraphType,
      fields: (raw ?? {}) as Record<string, unknown>,
      weight: r.weight,
    };
  });
}

/**
 * Valide chaque paragraphe contre la Field API de son type (kind 'paragraph').
 * Retourne les paragraphes normalisés ou un message d'erreur.
 */
async function validateParagraphs(
  db: DB,
  paragraphs: InsertParagraph[],
): Promise<{ ok: true; data: InsertParagraph[] } | { ok: false; error: string }> {
  const defsCache = new Map<string, FieldDef[]>();
  const out: InsertParagraph[] = [];
  for (const [i, p] of paragraphs.entries()) {
    if (!defsCache.has(p.type)) {
      const [type] = await db
        .select({ id: contentTypes.id, kind: contentTypes.kind })
        .from(contentTypes)
        .where(eq(contentTypes.id, p.type))
        .limit(1);
      if (type === undefined || type.kind !== 'paragraph') {
        return { ok: false, error: `Type de paragraphe inconnu : ${p.type}` };
      }
      defsCache.set(p.type, await loadFieldDefs(db, p.type));
    }
    const defs = defsCache.get(p.type) ?? [];
    const parsed = buildFieldValuesSchema(defs).safeParse(p.fields);
    if (!parsed.success) {
      return { ok: false, error: `Paragraphe ${i + 1} (${p.type}) invalide : ${parsed.error.message}` };
    }
    out.push({ type: p.type, fields: parsed.data, weight: i });
  }
  return { ok: true, data: out };
}

async function replaceNodeParagraphs(
  db: DB,
  nodeId: string,
  paragraphs: InsertParagraph[],
): Promise<void> {
  await db.delete(nodeParagraphs).where(eq(nodeParagraphs.nodeId, nodeId));
  if (paragraphs.length > 0) {
    await db.insert(nodeParagraphs).values(
      paragraphs.map((p, i) => ({
        id: crypto.randomUUID(),
        nodeId,
        paragraphType: p.type,
        fieldsJson: JSON.stringify(p.fields),
        weight: p.weight ?? i,
      })),
    );
  }
}

// ---------------------------------------------------------------------------
// Middleware de cache Edge (Cache API + tags versionnés en KV, à la Drupal) :
// une lecture ne dépend que des tags de sa famille, une mutation ne fait
// avancer que les tags qu'elle affecte.
// ---------------------------------------------------------------------------
app.use('/api/*', async (c, next) => {
  const pathname = new URL(c.req.url).pathname;

  if (c.req.method !== 'GET') {
    await next();
    if (c.res.ok) {
      c.executionCtx.waitUntil(bumpTags(c.env.CACHE_KV, tagsForMutation(pathname)));
    }
    return;
  }

  const signature = await getTagSignature(c.env.CACHE_KV, tagsForRead(pathname));
  const cacheKey = buildCacheKey(signature, c.req.url);
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
// Routes chaînées (RPC hono/client)
// ---------------------------------------------------------------------------
const routes = app
  // ------------------------- Content Types (Field UI) ----------------------
  .get('/api/types', zValidator('query', listTypesQuerySchema), async (c) => {
    const { kind, expand } = c.req.valid('query');
    const db = drizzle(c.env.DB);
    const types = await db
      .select()
      .from(contentTypes)
      .where(kind !== undefined ? eq(contentTypes.kind, kind) : undefined)
      .orderBy(asc(contentTypes.id));

    if (expand !== 'fields') return c.json({ data: types });

    // Une seule requête pour TOUS les champs, puis regroupement en mémoire —
    // même stratégie que /api/vocabularies avec ses termes.
    const ids = types.map((t) => t.id);
    const rows =
      ids.length === 0
        ? []
        : await db
            .select()
            .from(fields)
            .where(inArray(fields.contentTypeId, ids))
            .orderBy(asc(fields.weight), asc(fields.name));
    const defs = rows.map(rowToFieldDef);
    return c.json({
      data: types.map((t) => ({ ...t, fields: defs.filter((f) => f.contentTypeId === t.id) })),
    });
  })

  /**
   * Compteurs du tableau de bord — comptés en SQL. L'admin les déduisait de
   * la longueur des listes renvoyées, or celles-ci sont plafonnées à 100.
   */
  .get('/api/stats', async (c) => {
    const db = drizzle(c.env.DB);
    const [[nodes], [published], [nodeTypes], [paragraphTypes]] = await Promise.all([
      db.select({ n: count() }).from(contentNodes),
      db.select({ n: count() }).from(contentNodes).where(eq(contentNodes.status, true)),
      db.select({ n: count() }).from(contentTypes).where(eq(contentTypes.kind, 'node')),
      db.select({ n: count() }).from(contentTypes).where(eq(contentTypes.kind, 'paragraph')),
    ]);
    const data: ContentStats = {
      nodes: nodes?.n ?? 0,
      publishedNodes: published?.n ?? 0,
      types: nodeTypes?.n ?? 0,
      paragraphTypes: paragraphTypes?.n ?? 0,
    };
    return c.json({ data });
  })

  .get('/api/types/:id', zValidator('param', machineParamSchema), async (c) => {
    const { id } = c.req.valid('param');
    const db = drizzle(c.env.DB);
    const [type] = await db.select().from(contentTypes).where(eq(contentTypes.id, id)).limit(1);
    if (type === undefined) {
      return c.json({ success: false as const, error: 'Type introuvable' }, 404);
    }
    const defs = await loadFieldDefs(db, id);
    return c.json({ success: true as const, data: { type, fields: defs } });
  })

  .post('/api/types', zValidator('json', insertContentTypeSchema), async (c) => {
    const input = c.req.valid('json');
    const db = drizzle(c.env.DB);
    const [existing] = await db
      .select({ id: contentTypes.id })
      .from(contentTypes)
      .where(eq(contentTypes.id, input.id))
      .limit(1);
    if (existing !== undefined) {
      return c.json({ success: false as const, error: 'Ce type existe déjà' }, 409);
    }
    await db.insert(contentTypes).values({ ...input, createdAt: new Date() }).run();
    return c.json({ success: true as const, id: input.id }, 201);
  })

  .delete('/api/types/:id', zValidator('param', machineParamSchema), async (c) => {
    const { id } = c.req.valid('param');
    const db = drizzle(c.env.DB);
    const [nodeOfType] = await db
      .select({ id: contentNodes.id })
      .from(contentNodes)
      .where(eq(contentNodes.contentType, id))
      .limit(1);
    if (nodeOfType !== undefined) {
      return c.json(
        { success: false as const, error: 'Des contenus utilisent encore ce type' },
        409,
      );
    }
    await db.delete(fields).where(eq(fields.contentTypeId, id));
    const deleted = await db
      .delete(contentTypes)
      .where(eq(contentTypes.id, id))
      .returning({ id: contentTypes.id });
    if (deleted.length === 0) {
      return c.json({ success: false as const, error: 'Type introuvable' }, 404);
    }
    return c.json({ success: true as const, id });
  })

  .post('/api/fields', zValidator('json', insertFieldSchema), async (c) => {
    const input = c.req.valid('json');
    const db = drizzle(c.env.DB);
    const [type] = await db
      .select({ id: contentTypes.id })
      .from(contentTypes)
      .where(eq(contentTypes.id, input.contentTypeId))
      .limit(1);
    if (type === undefined) {
      return c.json({ success: false as const, error: 'Type introuvable' }, 404);
    }
    try {
      await db
        .insert(fields)
        .values({ ...input, settings: JSON.stringify(input.settings) })
        .run();
    } catch {
      return c.json({ success: false as const, error: 'Champ déjà existant sur ce type' }, 409);
    }
    return c.json({ success: true as const, id: input.id }, 201);
  })

  .delete('/api/fields/:id', zValidator('param', idParamSchema), async (c) => {
    const { id } = c.req.valid('param');
    const db = drizzle(c.env.DB);
    const deleted = await db.delete(fields).where(eq(fields.id, id)).returning({ id: fields.id });
    if (deleted.length === 0) {
      return c.json({ success: false as const, error: 'Champ introuvable' }, 404);
    }
    return c.json({ success: true as const, id });
  })

  // ------------------------------ Taxonomies -------------------------------
  .get('/api/vocabularies', async (c) => {
    const db = drizzle(c.env.DB);
    const vocabs = await db.select().from(vocabularies).orderBy(asc(vocabularies.id));
    const allTerms = await db.select().from(terms).orderBy(asc(terms.label));
    const data = vocabs.map((v) => ({
      ...v,
      terms: allTerms.filter((t) => t.vocabularyId === v.id),
    }));
    return c.json({ data });
  })

  .post('/api/vocabularies', zValidator('json', insertVocabularySchema), async (c) => {
    const input = c.req.valid('json');
    const db = drizzle(c.env.DB);
    try {
      await db.insert(vocabularies).values(input).run();
    } catch {
      return c.json({ success: false as const, error: 'Ce vocabulaire existe déjà' }, 409);
    }
    return c.json({ success: true as const, id: input.id }, 201);
  })

  .delete('/api/vocabularies/:id', zValidator('param', machineParamSchema), async (c) => {
    const { id } = c.req.valid('param');
    const db = drizzle(c.env.DB);
    const vocabTerms = await db
      .select({ id: terms.id })
      .from(terms)
      .where(eq(terms.vocabularyId, id));
    if (vocabTerms.length > 0) {
      await db.delete(nodeTerms).where(
        inArray(
          nodeTerms.termId,
          vocabTerms.map((t) => t.id),
        ),
      );
      await db.delete(terms).where(eq(terms.vocabularyId, id));
    }
    const deleted = await db
      .delete(vocabularies)
      .where(eq(vocabularies.id, id))
      .returning({ id: vocabularies.id });
    if (deleted.length === 0) {
      return c.json({ success: false as const, error: 'Vocabulaire introuvable' }, 404);
    }
    return c.json({ success: true as const, id });
  })

  .post('/api/terms', zValidator('json', insertTermSchema), async (c) => {
    const input = c.req.valid('json');
    const db = drizzle(c.env.DB);
    const [vocab] = await db
      .select({ id: vocabularies.id })
      .from(vocabularies)
      .where(eq(vocabularies.id, input.vocabularyId))
      .limit(1);
    if (vocab === undefined) {
      return c.json({ success: false as const, error: 'Vocabulaire introuvable' }, 404);
    }
    try {
      await db.insert(terms).values(input).run();
    } catch {
      return c.json({ success: false as const, error: 'Slug déjà pris dans ce vocabulaire' }, 409);
    }
    return c.json({ success: true as const, id: input.id }, 201);
  })

  .delete('/api/terms/:id', zValidator('param', idParamSchema), async (c) => {
    const { id } = c.req.valid('param');
    const db = drizzle(c.env.DB);
    await db.delete(nodeTerms).where(eq(nodeTerms.termId, id));
    const deleted = await db.delete(terms).where(eq(terms.id, id)).returning({ id: terms.id });
    if (deleted.length === 0) {
      return c.json({ success: false as const, error: 'Terme introuvable' }, 404);
    }
    return c.json({ success: true as const, id });
  })

  // -------------------------------- Nœuds ----------------------------------
  .get('/api/nodes', zValidator('query', listNodesQuerySchema), async (c) => {
    const { type, term, all, limit, offset } = c.req.valid('query');
    const db = drizzle(c.env.DB);

    const conditions = [];
    if (all !== '1') conditions.push(eq(contentNodes.status, true));
    if (type !== undefined) conditions.push(eq(contentNodes.contentType, type));
    if (term !== undefined) {
      conditions.push(
        inArray(
          contentNodes.id,
          db.select({ id: nodeTerms.nodeId }).from(nodeTerms).where(eq(nodeTerms.termId, term)),
        ),
      );
    }

    const rows = await db
      .select()
      .from(contentNodes)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(contentNodes.createdAt))
      .limit(limit)
      .offset(offset);

    const data = rows.map((n) => hydrateNode(n, []));
    return c.json({ data });
  })

  // Détail par slug — contenu publié uniquement (front public)
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
    const [nodeTermRows, paragraphs] = await Promise.all([
      loadNodeTerms(db, node.id),
      loadNodeParagraphs(db, node.id),
    ]);
    return c.json({ success: true as const, data: hydrateNode(node, nodeTermRows, paragraphs) });
  })

  // Détail par id — tout statut (admin)
  .get('/api/node/:id', zValidator('param', idParamSchema), async (c) => {
    const { id } = c.req.valid('param');
    const db = drizzle(c.env.DB);
    const [node] = await db.select().from(contentNodes).where(eq(contentNodes.id, id)).limit(1);
    if (node === undefined) {
      return c.json({ success: false as const, error: 'Nœud introuvable' }, 404);
    }
    const [nodeTermRows, paragraphs] = await Promise.all([
      loadNodeTerms(db, node.id),
      loadNodeParagraphs(db, node.id),
    ]);
    return c.json({ success: true as const, data: hydrateNode(node, nodeTermRows, paragraphs) });
  })

  .post('/api/nodes', zValidator('json', insertNodeSchema), async (c) => {
    const input = c.req.valid('json');
    const db = drizzle(c.env.DB);

    const [type] = await db
      .select({ id: contentTypes.id, kind: contentTypes.kind })
      .from(contentTypes)
      .where(eq(contentTypes.id, input.contentType))
      .limit(1);
    if (type === undefined || type.kind !== 'node') {
      return c.json({ success: false as const, error: 'Content type inconnu' }, 400);
    }

    // Validation dynamique des champs personnalisés (Field API)
    const defs = await loadFieldDefs(db, input.contentType);
    const parsedFields = buildFieldValuesSchema(defs).safeParse(input.fields);
    if (!parsedFields.success) {
      return c.json(
        { success: false as const, error: `Champs invalides : ${parsedFields.error.message}` },
        400,
      );
    }

    // Validation des paragraphes contre leur propre Field API
    const parsedParagraphs = await validateParagraphs(db, input.paragraphs);
    if (!parsedParagraphs.ok) {
      return c.json({ success: false as const, error: parsedParagraphs.error }, 400);
    }

    try {
      await db
        .insert(contentNodes)
        .values({
          id: input.id,
          title: input.title,
          slug: input.slug,
          body: input.body,
          contentType: input.contentType,
          status: input.status,
          fieldsJson: JSON.stringify(parsedFields.data),
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .run();
      await replaceNodeTerms(db, input.id, input.termIds);
      await replaceNodeParagraphs(db, input.id, parsedParagraphs.data);
      return c.json({ success: true as const, message: 'Node créé avec succès', id: input.id }, 201);
    } catch (error) {
      return c.json({ success: false as const, error: (error as Error).message }, 500);
    }
  })

  .put(
    '/api/nodes/:id',
    zValidator('param', idParamSchema),
    zValidator('json', updateNodeSchema),
    async (c) => {
      const { id } = c.req.valid('param');
      const patch = c.req.valid('json');
      const db = drizzle(c.env.DB);

      const [existing] = await db
        .select()
        .from(contentNodes)
        .where(eq(contentNodes.id, id))
        .limit(1);
      if (existing === undefined) {
        return c.json({ success: false as const, error: 'Nœud introuvable' }, 404);
      }

      const targetType = patch.contentType ?? existing.contentType;
      let fieldsJson: string | undefined;
      if (patch.fields !== undefined) {
        const defs = await loadFieldDefs(db, targetType);
        const parsedFields = buildFieldValuesSchema(defs).safeParse(patch.fields);
        if (!parsedFields.success) {
          return c.json(
            { success: false as const, error: `Champs invalides : ${parsedFields.error.message}` },
            400,
          );
        }
        fieldsJson = JSON.stringify(parsedFields.data);
      }

      await db
        .update(contentNodes)
        .set({
          ...(patch.title !== undefined ? { title: patch.title } : {}),
          ...(patch.slug !== undefined ? { slug: patch.slug } : {}),
          ...(patch.body !== undefined ? { body: patch.body } : {}),
          ...(patch.contentType !== undefined ? { contentType: patch.contentType } : {}),
          ...(patch.status !== undefined ? { status: patch.status } : {}),
          ...(fieldsJson !== undefined ? { fieldsJson } : {}),
          updatedAt: new Date(),
        })
        .where(eq(contentNodes.id, id));

      if (patch.termIds !== undefined) {
        await replaceNodeTerms(db, id, patch.termIds);
      }
      if (patch.paragraphs !== undefined) {
        const parsedParagraphs = await validateParagraphs(db, patch.paragraphs);
        if (!parsedParagraphs.ok) {
          return c.json({ success: false as const, error: parsedParagraphs.error }, 400);
        }
        await replaceNodeParagraphs(db, id, parsedParagraphs.data);
      }
      return c.json({ success: true as const, id });
    },
  )

  .delete('/api/nodes/:id', zValidator('param', idParamSchema), async (c) => {
    const { id } = c.req.valid('param');
    const db = drizzle(c.env.DB);
    await db.delete(nodeTerms).where(eq(nodeTerms.nodeId, id));
    const deleted = await db
      .delete(contentNodes)
      .where(eq(contentNodes.id, id))
      .returning({ id: contentNodes.id });
    if (deleted.length === 0) {
      return c.json({ success: false as const, error: 'Nœud introuvable' }, 404);
    }
    return c.json({ success: true as const, id });
  })

  // ------------------------------ Réglages ---------------------------------
  // Clé/valeur générique — sert notamment au thème actif du front (admin
  // « Apparence »). Lecture ouverte au binding (le front public l'appelle
  // en SSR pour résoudre son thème), écriture réservée à l'admin côté Astro.
  .get('/api/settings/:key', zValidator('param', settingKeyParamSchema), async (c) => {
    const { key } = c.req.valid('param');
    const db = drizzle(c.env.DB);
    const [row] = await db
      .select()
      .from(siteSettings)
      .where(eq(siteSettings.key, key))
      .limit(1);
    return c.json({ data: { key, value: row?.value ?? null } });
  })

  .put(
    '/api/settings/:key',
    zValidator('param', settingKeyParamSchema),
    zValidator('json', settingValueSchema),
    async (c) => {
      const { key } = c.req.valid('param');
      const { value } = c.req.valid('json');
      const db = drizzle(c.env.DB);
      await db
        .insert(siteSettings)
        .values({ key, value })
        .onConflictDoUpdate({ target: siteSettings.key, set: { value } })
        .run();
      return c.json({ success: true as const, key, value });
    },
  );

app.onError((err, c) => c.json({ success: false as const, error: err.message }, 500));

// Exportation vitale pour le Front-End et le Gateway
export type ContentAPI = typeof routes;
export default app;
