import type { APIRoute } from 'astro';
import { z } from 'zod';
import { contentClient, proxyResponse } from '../../lib/api';
import { requireApiSession } from '../../lib/session';
import { isValidTheme } from '../../lib/themes';

const keySchema = z.string().min(1).max(64);

/** API JSON /api/settings — réglages clé/valeur (thème actif, etc.). */
export const GET: APIRoute = async ({ cookies, url }) => {
  const auth = await requireApiSession(cookies, { adminOnly: true });
  if (auth instanceof Response) return auth;

  const key = keySchema.safeParse(url.searchParams.get('key'));
  if (!key.success) return Response.json({ success: false, error: 'clé invalide' }, { status: 400 });
  return proxyResponse(await contentClient().api.settings[':key'].$get({ param: { key: key.data } }));
};

export const PUT: APIRoute = async ({ request, cookies }) => {
  const auth = await requireApiSession(cookies, { adminOnly: true });
  if (auth instanceof Response) return auth;

  const body = (await request.json()) as Record<string, unknown>;
  const key = keySchema.safeParse(body.key);
  const value = z.string().max(256).safeParse(body.value);
  if (!key.success || !value.success) {
    return Response.json({ success: false, error: 'validation' }, { status: 400 });
  }
  if (key.data === 'active_theme' && !isValidTheme(value.data)) {
    return Response.json({ success: false, error: 'thème inconnu' }, { status: 400 });
  }

  return proxyResponse(
    await contentClient().api.settings[':key'].$put({
      param: { key: key.data },
      json: { value: value.data },
    }),
  );
};
