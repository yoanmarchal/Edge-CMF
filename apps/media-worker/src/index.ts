import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import {
  ALL_MEDIA_MIME_TYPES,
  MEDIA_MAX_BYTES,
  listMediaQuerySchema,
  mediaAltSchema,
  mediaKindOf,
  type MediaItem,
  type MediaListResult,
} from '@edge-cmf/shared-types';

type Bindings = {
  MEDIA: R2Bucket;
};

const app = new Hono<{ Bindings: Bindings }>();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** `Photo de l'Équipe.JPG` → `photo-de-l-equipe` (extension gérée à part). */
function slugifyBaseName(name: string): string {
  const base = name.replace(/\.[^.]+$/, '');
  const slug = base
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return slug.length > 0 ? slug : 'fichier';
}

function extensionOf(name: string, contentType: string): string {
  const fromName = /\.([a-z0-9]+)$/i.exec(name)?.[1]?.toLowerCase();
  if (fromName !== undefined) return fromName;
  // Repli sur le sous-type MIME (image/svg+xml → svg)
  return contentType.split('/')[1]?.split('+')[0] ?? 'bin';
}

/** Clé R2 datée et unique : `2026/07/photo-de-l-equipe-a1b2c3d4.jpg` */
function buildKey(originalName: string, contentType: string): string {
  const now = new Date();
  const yyyy = String(now.getUTCFullYear());
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const rand = crypto.randomUUID().slice(0, 8);
  return `${yyyy}/${mm}/${slugifyBaseName(originalName)}-${rand}.${extensionOf(originalName, contentType)}`;
}

function toMediaItem(obj: R2Object): MediaItem {
  const contentType = obj.httpMetadata?.contentType ?? 'application/octet-stream';
  return {
    key: obj.key,
    size: obj.size,
    uploaded: obj.uploaded.toISOString(),
    contentType,
    kind: mediaKindOf(contentType) ?? 'document',
    originalName: obj.customMetadata?.originalName ?? obj.key,
    alt: obj.customMetadata?.alt ?? '',
  };
}

/** En-têtes de diffusion : clés uniques et immuables → cache agressif sûr. */
function serveHeaders(obj: R2Object): Headers {
  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set('etag', obj.httpEtag);
  headers.set('cache-control', 'public, max-age=31536000, immutable');
  // Un SVG peut embarquer du script : neutralisé même servi inline.
  headers.set('x-content-type-options', 'nosniff');
  headers.set('content-security-policy', "default-src 'none'; style-src 'unsafe-inline'");
  return headers;
}

// ---------------------------------------------------------------------------
// Routes (chaînées : le type MediaAPI alimente les clients RPC hono/client)
// ---------------------------------------------------------------------------

const routes = app

  // Bibliothèque — listing paginé par cursor R2 (métadonnées incluses).
  .get('/api/media', zValidator('query', listMediaQuerySchema), async (c) => {
    const { cursor, limit } = c.req.valid('query');
    // `include` est indispensable au runtime (compat date ≥ 2022-08-04) pour
    // récupérer les métadonnées, mais absent du R2ListOptions de cette
    // version de @cloudflare/workers-types : cast structurel assumé.
    const listed = await c.env.MEDIA.list({
      limit,
      ...(cursor !== undefined ? { cursor } : {}),
      include: ['httpMetadata', 'customMetadata'],
    } as unknown as R2ListOptions);
    const result: MediaListResult = {
      data: listed.objects.map(toMediaItem),
      cursor: listed.truncated ? listed.cursor : null,
    };
    return c.json(result);
  })

  // Upload multipart : champs `file` (obligatoire) et `alt` (optionnel).
  .post('/api/media', async (c) => {
    const body = await c.req.parseBody();
    const file = body.file;
    if (!(file instanceof File)) {
      return c.json({ success: false as const, error: 'Champ "file" manquant' }, 400);
    }
    if (!ALL_MEDIA_MIME_TYPES.includes(file.type)) {
      return c.json({ success: false as const, error: `Type non autorisé : ${file.type}` }, 415);
    }
    if (file.size > MEDIA_MAX_BYTES) {
      return c.json(
        { success: false as const, error: `Fichier trop lourd (max ${MEDIA_MAX_BYTES / 1024 / 1024} Mo)` },
        413,
      );
    }
    const alt = typeof body.alt === 'string' ? body.alt.slice(0, 512) : '';
    const key = buildKey(file.name, file.type);
    const obj = await c.env.MEDIA.put(key, await file.arrayBuffer(), {
      httpMetadata: { contentType: file.type },
      customMetadata: { originalName: file.name.slice(0, 255), alt },
    });
    return c.json({ success: true as const, data: toMediaItem(obj) }, 201);
  })

  // Fiche d'un média — métadonnées seules (R2 head, pas de corps).
  .get('/api/media/item/:key{.+}', async (c) => {
    const key = c.req.param('key');
    const obj = await c.env.MEDIA.head(key);
    if (obj === null) return c.json({ success: false as const, error: 'Média introuvable' }, 404);
    return c.json({ data: toMediaItem(obj) });
  })

  // Diffusion du binaire — ETag + Range (audio/vidéo), cache immutable.
  .get('/api/media/file/:key{.+}', async (c) => {
    const key = c.req.param('key');

    const ifNoneMatch = c.req.header('if-none-match');
    const range = parseRange(c.req.header('range'));

    const getOpts: R2GetOptions = {};
    if (ifNoneMatch !== undefined) getOpts.onlyIf = { etagDoesNotMatch: stripEtag(ifNoneMatch) };
    if (range !== undefined) getOpts.range = range;
    const obj = await c.env.MEDIA.get(key, getOpts);
    if (obj === null) return c.json({ success: false as const, error: 'Média introuvable' }, 404);

    const headers = serveHeaders(obj);
    if (!('body' in obj) || obj.body === null) {
      // Précondition If-None-Match satisfaite : pas de corps.
      return new Response(null, { status: 304, headers });
    }
    if (range !== undefined) {
      const end = range.length !== undefined ? Math.min(range.offset + range.length, obj.size) - 1 : obj.size - 1;
      headers.set('content-range', `bytes ${range.offset}-${end}/${obj.size}`);
      return new Response(obj.body, { status: 206, headers });
    }
    headers.set('accept-ranges', 'bytes');
    return new Response(obj.body, { status: 200, headers });
  })

  // Mise à jour de l'alt — R2 ne mute pas les métadonnées : réécriture sur place.
  .patch('/api/media/meta/:key{.+}', zValidator('json', mediaAltSchema), async (c) => {
    const key = c.req.param('key');
    const { alt } = c.req.valid('json');
    const obj = await c.env.MEDIA.get(key);
    if (obj === null) return c.json({ success: false as const, error: 'Média introuvable' }, 404);
    const putOpts: R2PutOptions = { customMetadata: { ...obj.customMetadata, alt } };
    if (obj.httpMetadata !== undefined) putOpts.httpMetadata = obj.httpMetadata;
    const updated = await c.env.MEDIA.put(key, await obj.arrayBuffer(), putOpts);
    return c.json({ success: true as const, data: toMediaItem(updated) });
  })

  .delete('/api/media/:key{.+}', async (c) => {
    const key = c.req.param('key');
    await c.env.MEDIA.delete(key);
    return c.json({ success: true as const, key });
  });

// ---------------------------------------------------------------------------
// Range HTTP : forme simple `bytes=start-end` (suffisant pour <video>/<audio>)
// ---------------------------------------------------------------------------

function parseRange(header: string | undefined): { offset: number; length?: number } | undefined {
  if (header === undefined) return undefined;
  const m = /^bytes=(\d+)-(\d*)$/.exec(header);
  if (m === null || m[1] === undefined) return undefined;
  const offset = Number(m[1]);
  const end = m[2] !== undefined && m[2] !== '' ? Number(m[2]) : undefined;
  if (end !== undefined && end < offset) return undefined;
  // Sans borne de fin : {offset} seul = lecture jusqu'à la fin de l'objet (R2Range).
  return end !== undefined ? { offset, length: end - offset + 1 } : { offset };
}

function stripEtag(value: string): string {
  return value.replace(/^W\//, '').replace(/^"|"$/g, '');
}

app.onError((err, c) => c.json({ success: false as const, error: err.message }, 500));

// Exportation vitale pour l'Admin et le Front
export type MediaAPI = typeof routes;
export default app;
