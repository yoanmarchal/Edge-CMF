import type { APIRoute } from 'astro';
import { mediaFetch } from '../../../../lib/api';
import { requireApiSession } from '../../../../lib/session';

/**
 * Streaming des binaires pour les aperçus de la bibliothèque admin.
 * Session obligatoire (le bucket R2 n'est jamais public) ; ETag et Range
 * sont repropagés pour bénéficier du cache navigateur et du seek vidéo.
 */
export const GET: APIRoute = async ({ params, cookies, request }) => {
  const auth = await requireApiSession(cookies);
  if (auth instanceof Response) return auth;

  const key = params.key;
  if (key === undefined || key.length === 0) {
    return Response.json({ success: false, error: 'Clé manquante' }, { status: 400 });
  }

  const headers = new Headers();
  const range = request.headers.get('range');
  const ifNoneMatch = request.headers.get('if-none-match');
  if (range !== null) headers.set('range', range);
  if (ifNoneMatch !== null) headers.set('if-none-match', ifNoneMatch);

  const upstream = await mediaFetch(`/api/media/file/${key}`, { headers });
  return new Response(upstream.body, { status: upstream.status, headers: upstream.headers });
};
