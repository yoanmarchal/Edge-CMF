import type { APIRoute } from 'astro';
import { z } from 'zod';
import { listMediaQuerySchema, mediaAltSchema } from '@edge-cmf/shared-types';
import { mediaClient, mediaFetch, proxyResponse } from '../../lib/api';
import { requireApiSession } from '../../lib/session';

const keySchema = z.string().min(1).max(512);

/**
 * API JSON /api/media — consommée par l'îlot MediaLibrary. Proxy authentifié
 * vers le media-worker (Service Binding R2, jamais exposé directement).
 * Le binaire lui-même est servi par /api/media/file/[...key].
 */
export const GET: APIRoute = async ({ cookies, url }) => {
  const auth = await requireApiSession(cookies);
  if (auth instanceof Response) return auth;

  // ?key=… → fiche d'un média unique
  const itemKey = url.searchParams.get('key');
  if (itemKey !== null) {
    const key = keySchema.safeParse(itemKey);
    if (!key.success) return Response.json({ success: false, error: 'key invalide' }, { status: 400 });
    return proxyResponse(await mediaClient().api.media.item[':key{.+}'].$get({ param: { key: key.data } }));
  }

  const parsed = listMediaQuerySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) return Response.json({ success: false, error: 'Paramètres invalides' }, { status: 400 });

  const query: Record<string, string> = { limit: String(parsed.data.limit) };
  if (parsed.data.cursor !== undefined) query.cursor = parsed.data.cursor;
  return proxyResponse(await mediaClient().api.media.$get({ query }));
};

/** Upload : repropage le multipart tel quel (champs `file` et `alt`). */
export const POST: APIRoute = async ({ request, cookies }) => {
  const auth = await requireApiSession(cookies, { writeOnly: true });
  if (auth instanceof Response) return auth;

  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.startsWith('multipart/form-data')) {
    return Response.json({ success: false, error: 'multipart/form-data attendu' }, { status: 400 });
  }
  const upstream = await mediaFetch('/api/media', {
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

  const body = (await request.json()) as Record<string, unknown>;
  const key = keySchema.safeParse(body.key);
  const alt = mediaAltSchema.safeParse({ alt: body.alt });
  if (!key.success || !alt.success) {
    return Response.json({ success: false, error: 'key/alt invalides' }, { status: 400 });
  }
  return proxyResponse(
    await mediaClient().api.media.meta[':key{.+}'].$patch({
      param: { key: key.data },
      json: alt.data,
    }),
  );
};

export const DELETE: APIRoute = async ({ cookies, url }) => {
  const auth = await requireApiSession(cookies, { writeOnly: true });
  if (auth instanceof Response) return auth;

  const key = keySchema.safeParse(url.searchParams.get('key'));
  if (!key.success) return Response.json({ success: false, error: 'key invalide' }, { status: 400 });
  return proxyResponse(await mediaClient().api.media[':key{.+}'].$delete({ param: { key: key.data } }));
};
