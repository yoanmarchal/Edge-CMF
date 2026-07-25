import type { APIRoute } from 'astro';
import { z } from 'zod';
import { listMediaQuerySchema, mediaAltSchema } from '@edge-cmf/shared-types';
import { mediaClient, mediaFetch, proxyResponse } from '../../lib/api';
import { jsonError, read } from '../../lib/handler';
import { requireApiSession } from '../../lib/session';

const keySchema = z.string().min(1).max(512);

/**
 * API JSON /api/media — consommée par les îlots médias. Proxy authentifié
 * vers le media-worker (Service Binding R2, jamais exposé directement).
 * Le binaire lui-même est servi par /api/media/file/[...key].
 *
 * Seule surface à rester en REST plutôt qu'en tunnel `_action` : les
 * opérations portent sur une ressource binaire (upload multipart, remplacement
 * sur place, suppression), pas sur un document JSON.
 */
export const GET = read('session', async ({ url }) => {
  // ?key=… → fiche d'un média unique
  const itemKey = url.searchParams.get('key');
  if (itemKey !== null) {
    const key = keySchema.safeParse(itemKey);
    if (!key.success) return jsonError('key invalide', 400);
    return proxyResponse(await mediaClient().api.media.item[':key{.+}'].$get({ param: { key: key.data } }));
  }

  const parsed = listMediaQuerySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) return jsonError('Paramètres invalides', 400);

  const query: Record<string, string> = { limit: String(parsed.data.limit) };
  if (parsed.data.cursor !== undefined) query.cursor = parsed.data.cursor;
  return proxyResponse(await mediaClient().api.media.$get({ query }));
});

/**
 * Upload (multipart `file` + `alt`) — ou remplacement du fichier d'un média
 * existant si `?key=` est fourni (édition sur place, même clé publique).
 */
export const POST: APIRoute = async ({ request, cookies, url }) => {
  const auth = await requireApiSession(cookies, { writeOnly: true });
  if (auth instanceof Response) return auth;

  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.startsWith('multipart/form-data')) {
    return jsonError('multipart/form-data attendu', 400);
  }

  let path = '/api/media';
  const replaceKey = url.searchParams.get('key');
  if (replaceKey !== null) {
    const key = keySchema.safeParse(replaceKey);
    if (!key.success) return jsonError('key invalide', 400);
    path = `/api/media/replace/${key.data}`;
  }

  // Fetch brut : le corps multipart est repropagé tel quel, le client RPC
  // typé ne sait pas transporter un flux binaire.
  const upstream = await mediaFetch(path, {
    method: 'POST',
    headers: { 'content-type': contentType },
    body: await request.arrayBuffer(),
  });
  return proxyResponse(upstream);
};

/** Mise à jour du texte alternatif : { key, alt }. */
export const PUT: APIRoute = async ({ request, cookies }) => {
  const auth = await requireApiSession(cookies, { writeOnly: true });
  if (auth instanceof Response) return auth;

  const parsed = z
    .object({ key: keySchema, alt: mediaAltSchema.shape.alt })
    .safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError('key/alt invalides', 400);

  return proxyResponse(
    await mediaClient().api.media.meta[':key{.+}'].$patch({
      param: { key: parsed.data.key },
      json: { alt: parsed.data.alt },
    }),
  );
};

export const DELETE: APIRoute = async ({ cookies, url }) => {
  const auth = await requireApiSession(cookies, { writeOnly: true });
  if (auth instanceof Response) return auth;

  const key = keySchema.safeParse(url.searchParams.get('key'));
  if (!key.success) return jsonError('key invalide', 400);
  return proxyResponse(await mediaClient().api.media[':key{.+}'].$delete({ param: { key: key.data } }));
};
