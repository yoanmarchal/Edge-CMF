import type { APIRoute } from 'astro';
import { z } from 'zod';
import { insertNodeSchema, updateNodeSchema, machineNameSchema } from '@edge-cmf/shared-types';
import { contentClient, proxyResponse } from '../../lib/api';
import { requireApiSession } from '../../lib/session';

const uuid = z.string().uuid();

/**
 * API JSON /api/nodes — consommée par l'îlot Preact ContentList/ContentForm
 * (client:only, l'admin n'a pas de SSR de contenu). Proxy authentifié vers
 * le content-worker (Service Binding, jamais exposé directement au client).
 */
export const GET: APIRoute = async ({ locals, cookies, url }) => {
  const env = locals.runtime.env;
  const auth = await requireApiSession(cookies, env);
  if (auth instanceof Response) return auth;

  const client = contentClient(env);
  const id = url.searchParams.get('id');
  if (id !== null) {
    const parsedId = uuid.safeParse(id);
    if (!parsedId.success) return Response.json({ success: false, error: 'id invalide' }, { status: 400 });
    return proxyResponse(await client.api.node[':id'].$get({ param: { id: parsedId.data } }));
  }

  const query: Record<string, string> = { all: '1', limit: '100' };
  for (const [key, value] of url.searchParams) query[key] = value;
  return proxyResponse(await client.api.nodes.$get({ query }));
};

export const POST: APIRoute = async ({ request, locals, cookies }) => {
  const env = locals.runtime.env;
  const auth = await requireApiSession(cookies, env, { writeOnly: true });
  if (auth instanceof Response) return auth;

  const body = (await request.json()) as Record<string, unknown>;
  const action = body._action;
  const client = contentClient(env);

  if (action === 'delete') {
    const id = uuid.safeParse(body.id);
    if (!id.success) return Response.json({ success: false, error: 'validation' }, { status: 400 });
    const res = await client.api.nodes[':id'].$delete({ param: { id: id.data } });
    return res.ok
      ? Response.json({ success: true })
      : Response.json({ success: false, error: 'suppression' }, { status: 400 });
  }

  if (action === 'update') {
    const id = uuid.safeParse(body.id);
    if (!id.success) return Response.json({ success: false, error: 'validation' }, { status: 400 });
    const parsed = updateNodeSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ success: false, error: parsed.error.message }, { status: 400 });
    }
    const res = await client.api.nodes[':id'].$put({ param: { id: id.data }, json: parsed.data });
    if (!res.ok) {
      const respBody = await res.json();
      const msg = 'error' in respBody ? respBody.error : 'modification';
      return Response.json({ success: false, error: msg }, { status: 400 });
    }
    return Response.json({ success: true, id: id.data });
  }

  if (action === 'create') {
    const contentType = machineNameSchema.safeParse(body.contentType);
    if (!contentType.success) {
      return Response.json({ success: false, error: 'type invalide' }, { status: 400 });
    }
    const parsed = insertNodeSchema.safeParse({ ...body, id: crypto.randomUUID() });
    if (!parsed.success) {
      return Response.json({ success: false, error: parsed.error.message }, { status: 400 });
    }
    const res = await client.api.nodes.$post({ json: parsed.data });
    if (!res.ok) {
      const respBody = await res.json();
      return Response.json(
        { success: false, error: 'error' in respBody ? respBody.error : 'création' },
        { status: 400 },
      );
    }
    return Response.json({ success: true, id: parsed.data.id }, { status: 201 });
  }

  return Response.json({ success: false, error: 'action inconnue' }, { status: 400 });
};
