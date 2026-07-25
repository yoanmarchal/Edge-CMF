import type { APIRoute } from 'astro';
import { contentClient, proxyResponse } from '../../lib/api';
import { requireApiSession } from '../../lib/session';

/**
 * API JSON /api/stats — compteurs du tableau de bord, comptés en SQL par le
 * content-worker. L'îlot Dashboard les déduisait auparavant de la longueur
 * des listes, plafonnées à 100 par `listNodesQuerySchema`.
 */
export const GET: APIRoute = async ({ cookies }) => {
  const auth = await requireApiSession(cookies);
  if (auth instanceof Response) return auth;

  return proxyResponse(await contentClient().api.stats.$get());
};
