import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { drizzle } from 'drizzle-orm/d1';
import { and, asc, count, desc, eq, inArray, sql } from 'drizzle-orm';
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
  reportServerError,
  serverErrorMessage,
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
import { chunkRows, runBatch, type DB, type Statement } from './batch';

const settingKeyParamSchema = z.object({ key: z.string().min(1).max(64) });
const settingValueSchema = z.object({ value: z.string().max(256) });

type Bindings = {
  DB: D1Database;
  CACHE_KV: KVNamespace;
};

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

/**
 * Instructions remplaçant les termes d'un nœud — À EXÉCUTER DANS UN BATCH.
 *
 * `node_terms` a 2 colonnes : au-delà de 45 termes environ, un `INSERT` unique
 * dépasserait les 100 paramètres liés autorisés par D1. Le découpage n'est pas
 * une optimisation, c'est la condition pour que l'écriture aboutisse.
 */
function replaceNodeTermsStatements(db: DB, nodeId: string, termIds: string[]): Statement[] {
  const statements: Statement[] = [db.delete(nodeTerms).where(eq(nodeTerms.nodeId, nodeId))];
  for (const batch of chunkRows(termIds, 2)) {
    statements.push(db.insert(nodeTerms).values(batch.map((termId) => ({ nodeId, termId }))));
  }
  return statements;
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
  if (paragraphs.length === 0) return { ok: true, data: [] };

  // Deux requêtes, à paramètres CONSTANTS (sous-requête plutôt qu'une liste
  // d'identifiants), au lieu d'une requête par type distinct exécutée EN SÉRIE
  // dans la boucle. Les bundles sont de la configuration : ils sont peu
  // nombreux et se chargent intégralement sans risque.
  const paragraphTypeIds = db
    .select({ id: contentTypes.id })
    .from(contentTypes)
    .where(eq(contentTypes.kind, 'paragraph'));

  const [typeRows, fieldRows] = await db.batch([
    db.select({ id: contentTypes.id }).from(contentTypes).where(eq(contentTypes.kind, 'paragraph')),
    db
      .select()
      .from(fields)
      .where(inArray(fields.contentTypeId, paragraphTypeIds))
      .orderBy(asc(fields.weight), asc(fields.name)),
  ]);

  const known = new Set(typeRows.map((t) => t.id));
  const defsByType = new Map<string, FieldDef[]>();
  for (const row of fieldRows) {
    const list = defsByType.get(row.contentTypeId);
    if (list === undefined) defsByType.set(row.contentTypeId, [rowToFieldDef(row)]);
    else list.push(rowToFieldDef(row));
  }

  // Le schéma Zod est COMPILÉ UNE FOIS par type. `buildFieldValuesSchema` était
  // rappelé à chaque itération, y compris quand les définitions venaient du
  // cache : trente paragraphes du même type reconstruisaient trente fois le
  // même schéma, du CPU pur sur le chemin d'écriture.
  const schemaByType = new Map<string, ReturnType<typeof buildFieldValuesSchema>>();
  const schemaFor = (typeId: string) => {
    const cached = schemaByType.get(typeId);
    if (cached !== undefined) return cached;
    const built = buildFieldValuesSchema(defsByType.get(typeId) ?? []);
    schemaByType.set(typeId, built);
    return built;
  };

  const out: InsertParagraph[] = [];
  for (const [i, p] of paragraphs.entries()) {
    if (!known.has(p.type)) {
      return { ok: false, error: `Type de paragraphe inconnu : ${p.type}` };
    }
    const parsed = schemaFor(p.type).safeParse(p.fields);
    if (!parsed.success) {
      return { ok: false, error: `Paragraphe ${i + 1} (${p.type}) invalide : ${parsed.error.message}` };
    }
    out.push({ type: p.type, fields: parsed.data, weight: i });
  }
  return { ok: true, data: out };
}

/**
 * Instructions remplaçant les paragraphes d'un nœud — À EXÉCUTER DANS UN BATCH.
 *
 * `node_paragraphs` a 5 colonnes : un `INSERT` unique cassait dès 21 blocs
 * (5 × 21 > 100 paramètres liés). Le poids est calculé sur l'index GLOBAL et
 * non sur celui du lot, sinon le découpage réordonnerait les paragraphes.
 */
function replaceNodeParagraphsStatements(
  db: DB,
  nodeId: string,
  paragraphs: InsertParagraph[],
): Statement[] {
  const rows = paragraphs.map((p, i) => ({
    id: crypto.randomUUID(),
    nodeId,
    paragraphType: p.type,
    fieldsJson: JSON.stringify(p.fields),
    weight: p.weight ?? i,
  }));
  const statements: Statement[] = [
    db.delete(nodeParagraphs).where(eq(nodeParagraphs.nodeId, nodeId)),
  ];
  for (const batch of chunkRows(rows, 5)) {
    statements.push(db.insert(nodeParagraphs).values(batch));
  }
  return statements;
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
      // L'échec de ce `put` est le pire scénario silencieux du projet : le
      // contenu est bien enregistré, mais le cache n'est jamais invalidé — le
      // site sert du périmé sans que rien ne l'indique. KV n'accepte qu'UNE
      // écriture par seconde et par clé (P1-2) : sur une rafale de mutations,
      // ce cas se produit réellement.
      c.executionCtx.waitUntil(
        bumpTags(c.env.CACHE_KV, tagsForMutation(pathname)).catch((error: unknown) => {
          console.error({
            event: 'cache.bump_tags_failed',
            pathname,
            method: c.req.method,
            error: String(error),
          });
        }),
      );
    }
    return;
  }

  const signature = await getTagSignature(c.env.CACHE_KV, tagsForRead(pathname));
  const cacheKey = buildCacheKey(signature, c.req.url);
  const cached = await caches.default.match(cacheKey);
  if (cached !== undefined) {
    c.res = new Response(cached.body, cached);
    // Le `Cache-Control: public` ne concerne QUE le cache edge interne, qui
    // vient de faire son travail. Le laisser sortir d'ici, c'était autoriser
    // n'importe quel intermédiaire à stocker une réponse potentiellement
    // authentifiée : l'admin appelle ce worker avec `all=1`, donc avec les
    // brouillons. Le MISS ne posait pas l'en-tête, le HIT si — un écart de
    // comportement qui rendait le problème intermittent.
    c.res.headers.delete('Cache-Control');
    c.res.headers.set('X-Edge-Cache', 'HIT');
    return;
  }

  await next();

  if (c.res.ok) {
    const clone = c.res.clone();
    const toStore = new Response(clone.body, clone);
    // TTL volontairement court tant que P1-2 (limite d'une écriture KV par
    // seconde sur les clés de tags) n'est pas corrigé : si un `bumpTags` est
    // silencieusement perdu, ces 60 s bornent la durée du contenu périmé.
    // À rallonger en même temps que P1-2, pas avant.
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
    // Deux requêtes agrégées au lieu de quatre comptages. Le `Promise.all`
    // précédent donnait l'illusion du parallélisme : une base D1 est
    // mono-thread et traite ses requêtes une à une, les quatre étaient donc
    // sérialisées côté base tout en consommant quatre sous-requêtes.
    const [[nodeStats], [typeStats]] = await db.batch([
      db
        .select({
          total: count(),
          published: sql<number>`coalesce(sum(case when ${contentNodes.status} then 1 else 0 end), 0)`,
        })
        .from(contentNodes),
      db
        .select({
          nodes: sql<number>`coalesce(sum(case when ${contentTypes.kind} = 'node' then 1 else 0 end), 0)`,
          paragraphs: sql<number>`coalesce(sum(case when ${contentTypes.kind} = 'paragraph' then 1 else 0 end), 0)`,
        })
        .from(contentTypes),
    ]);
    const data: ContentStats = {
      nodes: nodeStats?.total ?? 0,
      publishedNodes: Number(nodeStats?.published ?? 0),
      types: Number(typeStats?.nodes ?? 0),
      paragraphTypes: Number(typeStats?.paragraphs ?? 0),
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
    // Deux usages possibles d'un bundle : comme type de nœud, ou comme type de
    // paragraphe instancié. Seul le premier était vérifié — supprimer un type
    // de paragraphe encore utilisé violait la clé étrangère `paragraph_type`
    // (sans ON DELETE) et sortait en 500 SQLite au lieu du 409 attendu.
    const [nodesOfType, paragraphsOfType] = await db.batch([
      db.select({ id: contentNodes.id }).from(contentNodes).where(eq(contentNodes.contentType, id)).limit(1),
      db.select({ id: nodeParagraphs.id }).from(nodeParagraphs).where(eq(nodeParagraphs.paragraphType, id)).limit(1),
    ]);
    if (nodesOfType.length > 0 || paragraphsOfType.length > 0) {
      return c.json(
        { success: false as const, error: 'Des contenus utilisent encore ce type' },
        409,
      );
    }
    const [, deleted] = await db.batch([
      db.delete(fields).where(eq(fields.contentTypeId, id)),
      db.delete(contentTypes).where(eq(contentTypes.id, id)).returning({ id: contentTypes.id }),
    ]);
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

    // Les identifiants de termes restent DANS SQL (sous-requête) au lieu d'être
    // rapatriés puis réinjectés en paramètres : un vocabulaire de plus de 100
    // termes dépassait sinon la limite de paramètres liés de D1 — précisément
    // au moment le plus destructeur, la suppression.
    const [, , deleted] = await db.batch([
      db
        .delete(nodeTerms)
        .where(
          inArray(
            nodeTerms.termId,
            db.select({ id: terms.id }).from(terms).where(eq(terms.vocabularyId, id)),
          ),
        ),
      db.delete(terms).where(eq(terms.vocabularyId, id)),
      db.delete(vocabularies).where(eq(vocabularies.id, id)).returning({ id: vocabularies.id }),
    ]);
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
    const [, deleted] = await db.batch([
      db.delete(nodeTerms).where(eq(nodeTerms.termId, id)),
      db.delete(terms).where(eq(terms.id, id)).returning({ id: terms.id }),
    ]);
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

    // Nœud, termes et paragraphes partent en UNE transaction implicite : un
    // échec sur les paragraphes ne peut plus laisser un nœud publié à moitié
    // écrit, et les 5 allers-retours D1 séquentiels deviennent un seul.
    const now = new Date();
    try {
      await runBatch(db, [
        db.insert(contentNodes).values({
          id: input.id,
          title: input.title,
          slug: input.slug,
          body: input.body,
          contentType: input.contentType,
          status: input.status,
          fieldsJson: JSON.stringify(parsedFields.data),
          createdAt: now,
          updatedAt: now,
        }),
        ...replaceNodeTermsStatements(db, input.id, input.termIds),
        ...replaceNodeParagraphsStatements(db, input.id, parsedParagraphs.data),
      ]);
      return c.json({ success: true as const, message: 'Node créé avec succès', id: input.id }, 201);
    } catch (error) {
      const ref = reportServerError(error, {
        service: 'content-worker',
        method: 'POST',
        path: '/api/nodes',
      });
      return c.json({ success: false as const, error: serverErrorMessage(ref) }, 500);
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

      // Les paragraphes sont validés AVANT d'ouvrir le batch : un contenu
      // invalide doit sortir en 400 sans avoir touché la base.
      let paragraphStatements: Statement[] = [];
      if (patch.paragraphs !== undefined) {
        const parsedParagraphs = await validateParagraphs(db, patch.paragraphs);
        if (!parsedParagraphs.ok) {
          return c.json({ success: false as const, error: parsedParagraphs.error }, 400);
        }
        paragraphStatements = replaceNodeParagraphsStatements(db, id, parsedParagraphs.data);
      }

      // Mise à jour, termes et paragraphes en une transaction implicite.
      await runBatch(db, [
        db
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
          .where(eq(contentNodes.id, id)),
        ...(patch.termIds !== undefined ? replaceNodeTermsStatements(db, id, patch.termIds) : []),
        ...paragraphStatements,
      ]);
      return c.json({ success: true as const, id });
    },
  )

  .delete('/api/nodes/:id', zValidator('param', idParamSchema), async (c) => {
    const { id } = c.req.valid('param');
    const db = drizzle(c.env.DB);
    // Les deux tables de jonction sont purgées EXPLICITEMENT : `node_terms`
    // l'était déjà à la main, `node_paragraphs` reposait sur la cascade FK.
    // Deux stratégies opposées dans la même fonction rendaient le résultat
    // dépendant de l'application effective des contraintes par D1.
    const [, , deleted] = await db.batch([
      db.delete(nodeTerms).where(eq(nodeTerms.nodeId, id)),
      db.delete(nodeParagraphs).where(eq(nodeParagraphs.nodeId, id)),
      db.delete(contentNodes).where(eq(contentNodes.id, id)).returning({ id: contentNodes.id }),
    ]);
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

app.onError((err, c) => {
  const ref = reportServerError(err, {
    service: 'content-worker',
    method: c.req.method,
    path: new URL(c.req.url).pathname,
  });
  return c.json({ success: false as const, error: serverErrorMessage(ref) }, 500);
});

// Exportation vitale pour le Front-End et le Gateway
export type ContentAPI = typeof routes;

/**
 * Types de lignes exportés pour les CONSOMMATEURS (admin, front) : ils y
 * dérivent la forme des réponses au lieu de la redéclarer à la main. Export
 * de types uniquement — rien n'atterrit dans le bundle client.
 * Voir `apps/admin/src/islands/lib/contract.ts`.
 */
export type { ContentNode, ContentTypeRow, TermRow, VocabularyRow } from './schema';

export default app;
