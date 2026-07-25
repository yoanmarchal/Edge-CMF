import type { APIRoute } from 'astro';
import { z } from 'zod';
import { contentClient, proxyResponse } from '../../lib/api';
import { jsonError, read } from '../../lib/handler';
import { requireApiSession } from '../../lib/session';
import { isValidTheme } from '../../lib/themes';

const keySchema = z.string().min(1).max(64);
const valueSchema = z.string().max(256);

/**
 * API JSON /api/settings — réglages clé/valeur (thème actif, etc.).
 * REST plutôt que tunnel `_action` : une seule ressource, deux verbes.
 */
export const GET = read('admin', async ({ url }) => {
  const key = keySchema.safeParse(url.searchParams.get('key'));
  if (!key.success) return jsonError('clé invalide', 400);
  return proxyResponse(
    await contentClient().api.settings[':key'].$get({ param: { key: key.data } }),
  );
});

export const PUT: APIRoute = async ({ request, cookies }) => {
  const auth = await requireApiSession(cookies, { adminOnly: true });
  if (auth instanceof Response) return auth;

  const parsed = z
    .object({ key: keySchema, value: valueSchema })
    .safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError('clé ou valeur invalide', 400);

  // Le thème actif est un identifiant de thème installé, pas une chaîne
  // libre : le contrôle est fait ici, l'admin étant seul à connaître le
  // registre des thèmes (src/lib/themes.ts).
  const { key, value } = parsed.data;
  if (key === 'active_theme' && !isValidTheme(value)) return jsonError('thème inconnu', 400);

  return proxyResponse(
    await contentClient().api.settings[':key'].$put({ param: { key }, json: { value } }),
  );
};
