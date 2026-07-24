import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';

/**
 * Diffusion publique des médias — /media/2026/07/photo-a1b2c3d4.jpg
 * Streaming direct depuis le media-worker (R2, Service Binding). Les clés
 * sont uniques et immuables : le worker répond avec
 * `Cache-Control: immutable` + ETag, le cache edge/navigateur fait le reste.
 * Range repropagé pour le seek audio/vidéo.
 */
export const GET: APIRoute = async ({ params, request }) => {
  const key = params.key;
  if (key === undefined || key.length === 0) {
    return new Response('Introuvable', { status: 404 });
  }

  const headers = new Headers();
  const range = request.headers.get('range');
  const ifNoneMatch = request.headers.get('if-none-match');
  if (range !== null) headers.set('range', range);
  if (ifNoneMatch !== null) headers.set('if-none-match', ifNoneMatch);

  // La query est repropagée : `?v=` (URL versionnée au rendu SSR) déclenche
  // le cache immuable côté media-worker.
  const search = new URL(request.url).search;
  const upstream = await env.MEDIA_WORKER.fetch(`http://interne/api/media/file/${key}${search}`, { headers });
  if (upstream.status === 404) return new Response('Introuvable', { status: 404 });
  return new Response(upstream.body, { status: upstream.status, headers: upstream.headers });
};
