import type { APIRoute } from 'astro';
import { z } from 'zod';
import { registerSchema, roleEnum } from '@edge-cmf/shared-types';
import { authClient, proxyResponse } from '../../lib/api';
import { requireApiSession } from '../../lib/session';

const uuid = z.string().uuid();

/** API JSON /api/users — gestion des comptes (adminOnly). */
export const GET: APIRoute = async ({ locals, cookies }) => {
  const env = locals.runtime.env;
  const auth = await requireApiSession(cookies, env, { adminOnly: true });
  if (auth instanceof Response) return auth;
  return proxyResponse(
    await authClient(env).users.$get(undefined, { headers: { Authorization: `Bearer ${auth.token}` } }),
  );
};

export const POST: APIRoute = async ({ request, locals, cookies }) => {
  const env = locals.runtime.env;
  const auth = await requireApiSession(cookies, env, { adminOnly: true });
  if (auth instanceof Response) return auth;

  const body = (await request.json()) as Record<string, unknown>;
  const action = body._action;
  const client = authClient(env);
  const headers = { Authorization: `Bearer ${auth.token}` };

  if (action === 'create') {
    const parsed = registerSchema.safeParse({
      email: body.email,
      password: body.password,
      role: body.role,
    });
    if (!parsed.success) return Response.json({ success: false, error: parsed.error.message }, { status: 400 });
    const res = await client.register.$post({ json: parsed.data }, { headers });
    return res.ok
      ? Response.json({ success: true }, { status: 201 })
      : Response.json({ success: false, error: 'email déjà utilisé' }, { status: 409 });
  }

  if (action === 'set-role') {
    const id = uuid.safeParse(body.id);
    const role = roleEnum.safeParse(body.role);
    if (!id.success || !role.success) {
      return Response.json({ success: false, error: 'validation' }, { status: 400 });
    }
    const res = await client.users[':id'].role.$put(
      { param: { id: id.data }, json: { role: role.data } },
      { headers },
    );
    return res.ok
      ? Response.json({ success: true })
      : Response.json({ success: false, error: 'modification' }, { status: 400 });
  }

  if (action === 'delete') {
    const id = uuid.safeParse(body.id);
    if (!id.success) return Response.json({ success: false, error: 'validation' }, { status: 400 });
    const res = await client.users[':id'].$delete({ param: { id: id.data } }, { headers });
    return res.ok
      ? Response.json({ success: true })
      : Response.json({ success: false, error: 'suppression' }, { status: 400 });
  }

  return Response.json({ success: false, error: 'action inconnue' }, { status: 400 });
};
