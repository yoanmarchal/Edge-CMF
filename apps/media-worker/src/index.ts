import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import {
  ALL_MEDIA_MIME_TYPES,
  MEDIA_MAX_BYTES,
  listMediaQuerySchema,
  mediaAltSchema,
  mediaKindOf,
  reportServerError,
  serverErrorMessage,
  type MediaItem,
  type MediaListResult,
} from '@edge-cmf/shared-types';

type Bindings = {
  MEDIA: R2Bucket;
  CACHE_KV: KVNamespace;
};

const app = new Hono<{ Bindings: Bindings }>();

// Toute mutation de média fait avancer le tag `media` (mêmes clés KV que le
// content-worker) : les pages HTML du front, dont l'ETag inclut ce tag,
// sont invalidées — un remplacement de fichier est donc détecté partout.
app.use('/api/*', async (c, next) => {
  await next();
  if (c.req.method !== 'GET' && c.res.ok) {
    // Échec silencieux = médias remplacés mais pages du front jamais
    // invalidées. KV plafonne à une écriture par seconde et par clé, et cette
    // clé est fixe : sur un import de médias, le dépassement est certain.
    // Suffixe aléatoire : dans un Worker l'horloge est figée entre deux E/S,
    // donc deux mutations d'une même invocation produisaient la même version
    // — le tag « avançait » sans changer de valeur.
    const version = `${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`;
    c.executionCtx.waitUntil(
      c.env.CACHE_KV.put('cache-tag:media', version).catch((error: unknown) => {
        console.error({
          event: 'cache.bump_media_tag_failed',
          method: c.req.method,
          error: String(error),
        });
      }),
    );
  }
});

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

/**
 * Clé R2 datée et unique : `2026/07/photo-de-l-equipe-a1b2c3d4e5f60718.jpg`
 *
 * Le suffixe faisait 8 caractères hexadécimaux, soit 32 bits. Deux fichiers au
 * même nom slugifié dans le même mois entraient donc en collision avec une
 * probabilité non négligeable (paradoxe des anniversaires : ~50 % vers 77 000
 * fichiers pour un préfixe donné) — et une collision faisait un `put` sur une
 * clé existante, ÉCRASANT le fichier précédent sans le moindre signal, pendant
 * que les contenus qui le référençaient se mettaient à afficher autre chose.
 *
 * 16 caractères (64 bits) ramènent le risque à l'inatteignable. La vérification
 * d'absence côté appelant reste la ceinture, ceci est la bretelle.
 */
function buildKey(originalName: string, contentType: string): string {
  const now = new Date();
  const yyyy = String(now.getUTCFullYear());
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const rand = crypto.randomUUID().replaceAll('-', '').slice(0, 16);
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

/**
 * En-têtes de diffusion. Les fichiers sont REMPLAÇABLES sur place (édition),
 * donc pas d'`immutable` aveugle : revalidation ETag côté navigateur
 * (max-age court + stale-while-revalidate), le gros du travail étant fait
 * par le cache edge interne versionné par ETag (voir route file).
 */
function serveHeaders(obj: R2Object): Headers {
  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set('etag', obj.httpEtag);
  headers.set('cache-control', 'public, max-age=300, stale-while-revalidate=86400');
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

  /**
   * Upload multipart : champs `file` (obligatoire) et `alt` (optionnel).
   *
   * LIMITE CONNUE : `parseBody()` s'appuie sur `request.formData()`, qui
   * matérialise le corps multipart complet — jusqu'à MEDIA_MAX_BYTES (50 Mo)
   * dans cet isolat, sur les 128 Mo disponibles. Le relais admin ne bufferise
   * plus (il transmet le flux) et le `put` consomme désormais un flux plutôt
   * qu'un `arrayBuffer()`, ce qui supprime la SECONDE copie ; la première
   * subsiste tant que l'upload passe par du multipart.
   *
   * Suppression définitive : envoyer le binaire brut avec le nom de fichier et
   * l'alt en en-têtes, et faire `MEDIA.put(key, c.req.raw.body)`. Cela touche
   * l'îlot d'upload côté admin — hors du périmètre du lot 1.
   */
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
    // `file.stream()` au lieu de `file.arrayBuffer()` : R2 consomme le flux
    // sans qu'on matérialise les 50 Mo dans le tas de l'isolat (limite : 128 Mo
    // par isolat, partagés entre toutes les requêtes concurrentes).
    const obj = await c.env.MEDIA.put(key, file.stream(), {
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

  // Diffusion du binaire — ETag/304, Range (audio/vidéo) et cache edge
  // versionné : la clé de cache inclut l'ETag R2, donc un remplacement de
  // fichier invalide instantanément l'ancienne entrée (même principe que
  // l'invalidation par version du content-worker, cahier §3.3).
  .get('/api/media/file/:key{.+}', async (c) => {
    const key = c.req.param('key');
    const meta = await c.env.MEDIA.head(key);
    if (meta === null) return c.json({ success: false as const, error: 'Média introuvable' }, 404);

    const headers = serveHeaders(meta);
    // URL versionnée (`?v=` estampillé au rendu SSR, façon itok Drupal) :
    // chaque version a une URL unique → cache immuable sans risque.
    if (c.req.query('v') !== undefined) {
      headers.set('cache-control', 'public, max-age=31536000, immutable');
    }

    // Revalidation navigateur : 304 sans corps ni lecture R2.
    const ifNoneMatch = c.req.header('if-none-match');
    if (ifNoneMatch !== undefined && stripEtag(ifNoneMatch) === stripEtag(meta.httpEtag)) {
      return new Response(null, { status: 304, headers });
    }

    // Requêtes Range : streaming direct depuis R2, hors cache.
    const parsed = parseRange(c.req.header('range'), meta.size);
    if (parsed.kind === 'unsatisfiable') {
      // 416 avec `Content-Range: bytes */<taille>` : c'est cette réponse qui
      // permet au client de se recaler. Auparavant, R2 levait et le client
      // recevait une 500.
      headers.set('content-range', `bytes */${meta.size}`);
      return new Response(null, { status: 416, headers });
    }
    if (parsed.kind === 'range') {
      const { range } = parsed;
      const partial = await c.env.MEDIA.get(key, { range });
      if (partial === null || partial.body === null) {
        return c.json({ success: false as const, error: 'Média introuvable' }, 404);
      }
      const end =
        range.length !== undefined ? range.offset + range.length - 1 : meta.size - 1;
      headers.set('content-range', `bytes ${range.offset}-${end}/${meta.size}`);
      headers.set('content-length', String(end - range.offset + 1));
      return new Response(partial.body, { status: 206, headers });
    }

    // Cache edge (API Cache Workers), versionné par ETag.
    const cache = caches.default;
    const cacheKey = new Request(`https://media-cache.interne/${encodeURI(key)}?etag=${stripEtag(meta.httpEtag)}`);
    const cached = await cache.match(cacheKey);
    if (cached !== undefined) {
      const out = new Response(cached.body, cached);
      out.headers.set('accept-ranges', 'bytes');
      out.headers.set('x-media-cache', 'hit');
      return out;
    }

    const obj = await c.env.MEDIA.get(key);
    if (obj === null || obj.body === null) {
      return c.json({ success: false as const, error: 'Média introuvable' }, 404);
    }
    const res = new Response(obj.body, { status: 200, headers });
    c.executionCtx.waitUntil(
      cache.put(cacheKey, res.clone()).catch((error: unknown) => {
        console.error({ event: 'media.cache_put_failed', key, error: String(error) });
      }),
    );
    res.headers.set('accept-ranges', 'bytes');
    return res;
  })

  // Remplacement du fichier d'un média existant (édition) : même clé — les
  // contenus qui référencent `/media/<clé>` restent valides —, métadonnées
  // conservées, nouvel ETag → caches edge et navigateur invalidés.
  .post('/api/media/replace/:key{.+}', async (c) => {
    const key = c.req.param('key');
    const existing = await c.env.MEDIA.head(key);
    if (existing === null) return c.json({ success: false as const, error: 'Média introuvable' }, 404);

    const body = await c.req.parseBody();
    const file = body.file;
    if (!(file instanceof File)) {
      return c.json({ success: false as const, error: 'Champ "file" manquant' }, 400);
    }
    if (!ALL_MEDIA_MIME_TYPES.includes(file.type)) {
      return c.json({ success: false as const, error: `Type non autorisé : ${file.type}` }, 415);
    }
    // Même famille obligatoire : une image reste une image (les contenus
    // qui l'affichent en <img> ne doivent pas se retrouver avec un PDF).
    const existingType = existing.httpMetadata?.contentType ?? 'application/octet-stream';
    if (mediaKindOf(file.type) !== mediaKindOf(existingType)) {
      return c.json({ success: false as const, error: 'Le remplacement doit être du même type de média' }, 415);
    }
    if (file.size > MEDIA_MAX_BYTES) {
      return c.json(
        { success: false as const, error: `Fichier trop lourd (max ${MEDIA_MAX_BYTES / 1024 / 1024} Mo)` },
        413,
      );
    }

    const updated = await c.env.MEDIA.put(key, file.stream(), {
      httpMetadata: { contentType: file.type },
      customMetadata: {
        originalName: file.name.slice(0, 255),
        alt: existing.customMetadata?.alt ?? '',
      },
    });
    return c.json({ success: true as const, data: toMediaItem(updated) });
  })

  /**
   * Mise à jour de l'alt — R2 ne mute pas les métadonnées d'un objet existant,
   * il faut le réécrire. Mais le binaire n'a aucune raison de transiter par le
   * tas de l'isolat pour ça : `obj.body` est repassé DIRECTEMENT en flux au
   * `put`. L'ancienne version faisait `await obj.arrayBuffer()`, soit jusqu'à
   * 50 Mo en mémoire pour changer une chaîne de quelques dizaines d'octets.
   *
   * Reste une réécriture complète côté R2 (donc un nouvel ETag, donc les caches
   * invalidés alors que le binaire est identique). Sortir l'alt de
   * `customMetadata` pour le mettre en D1 supprimerait le problème à la racine
   * — voir P0-6 du rapport d'audit.
   */
  .patch('/api/media/meta/:key{.+}', zValidator('json', mediaAltSchema), async (c) => {
    const key = c.req.param('key');
    const { alt } = c.req.valid('json');
    const obj = await c.env.MEDIA.get(key);
    if (obj === null || obj.body === null) {
      return c.json({ success: false as const, error: 'Média introuvable' }, 404);
    }
    const putOpts: R2PutOptions = { customMetadata: { ...obj.customMetadata, alt } };
    if (obj.httpMetadata !== undefined) putOpts.httpMetadata = obj.httpMetadata;
    const updated = await c.env.MEDIA.put(key, obj.body, putOpts);
    return c.json({ success: true as const, data: toMediaItem(updated) });
  })

  // `R2.delete` ne dit pas si l'objet existait : l'admin affichait donc
  // « supprimé » pour une clé inexistante ou mal saisie. Le `head` préalable
  // coûte une sous-requête interne et rend la réponse honnête.
  .delete('/api/media/:key{.+}', async (c) => {
    const key = c.req.param('key');
    const existing = await c.env.MEDIA.head(key);
    if (existing === null) {
      return c.json({ success: false as const, error: 'Média introuvable' }, 404);
    }
    await c.env.MEDIA.delete(key);
    return c.json({ success: true as const, key });
  });

// ---------------------------------------------------------------------------
// Range HTTP : forme simple `bytes=start-end` (suffisant pour <video>/<audio>)
// ---------------------------------------------------------------------------

/**
 * Résultat d'analyse d'un en-tête `Range`.
 * `unsatisfiable` déclenche un 416, distinct d'un en-tête simplement absent ou
 * non géré — que la spécification demande de traiter comme une requête pleine.
 */
type RangeResult =
  | { readonly kind: 'none' }
  | { readonly kind: 'unsatisfiable' }
  | { readonly kind: 'range'; readonly range: { offset: number; length?: number } };

/**
 * Analyse `Range`, formes `bytes=début-fin`, `bytes=début-` et `bytes=-N`.
 *
 * L'ancienne version ne gérait que les deux premières et ne validait pas les
 * bornes : un `bytes=-500` (les N derniers octets, émis par plusieurs lecteurs
 * vidéo) et un décalage au-delà de la taille du fichier passaient tels quels à
 * R2, qui levait — soit une 500 sur une requête pourtant légitime.
 *
 * Le multi-range (`bytes=0-99,200-299`) n'est volontairement pas géré : la
 * spécification autorise à l'ignorer et à répondre 200 avec le corps complet,
 * ce que fait `kind: 'none'`.
 */
export function parseRange(header: string | undefined, size: number): RangeResult {
  if (header === undefined) return { kind: 'none' };

  // Suffixe : les N derniers octets.
  const suffix = /^bytes=-(\d+)$/.exec(header);
  if (suffix?.[1] !== undefined) {
    const n = Number(suffix[1]);
    if (n === 0) return { kind: 'unsatisfiable' };
    const length = Math.min(n, size);
    return { kind: 'range', range: { offset: size - length, length } };
  }

  const m = /^bytes=(\d+)-(\d*)$/.exec(header);
  if (m?.[1] === undefined) return { kind: 'none' };

  const offset = Number(m[1]);
  if (offset >= size) return { kind: 'unsatisfiable' };

  const rawEnd = m[2] !== undefined && m[2] !== '' ? Number(m[2]) : undefined;
  if (rawEnd === undefined) {
    // Sans borne de fin : lecture jusqu'à la fin de l'objet (R2Range).
    return { kind: 'range', range: { offset } };
  }
  if (rawEnd < offset) return { kind: 'unsatisfiable' };
  // Une borne de fin au-delà du fichier est tronquée, pas rejetée (RFC 9110).
  const end = Math.min(rawEnd, size - 1);
  return { kind: 'range', range: { offset, length: end - offset + 1 } };
}

function stripEtag(value: string): string {
  return value.replace(/^W\//, '').replace(/^"|"$/g, '');
}

app.onError((err, c) => {
  const ref = reportServerError(err, {
    service: 'media-worker',
    method: c.req.method,
    path: new URL(c.req.url).pathname,
  });
  return c.json({ success: false as const, error: serverErrorMessage(ref) }, 500);
});

// Exportation vitale pour l'Admin et le Front
export type MediaAPI = typeof routes;
export default app;
