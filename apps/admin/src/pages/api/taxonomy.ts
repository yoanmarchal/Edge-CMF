import type { APIRoute } from 'astro';
import { z } from 'zod';
import { insertVocabularySchema, insertTermSchema, machineNameSchema } from '@edge-cmf/shared-types';
import { contentClient, proxyResponse } from '../../lib/api';
import { requireApiSession } from '../../lib/session';

const uuid = z.string().uuid();

/** API JSON /api/taxonomy — vocabulaires + termes (writeOnly : admin/editor). */
export const GET: APIRoute = async ({ cookies }) => {
  const auth = await requireApiSession(cookies);
  if (auth instanceof Response) return auth;
  return proxyResponse(await contentClient().api.vocabularies.$get());
};

export const POST: APIRoute = async ({ request, cookies }) => {
  const auth = await requireApiSession(cookies, { writeOnly: true });
  if (auth instanceof Response) return auth;

  const body = (await request.json()) as Record<string, unknown>;
  const action = body._action;
  const client = contentClient();

  if (action === 'create-vocab') {
    const parsed = insertVocabularySchema.safeParse({ id: body.id, label: body.label });
    if (!parsed.success) return Response.json({ success: false, error: parsed.error.message }, { status: 400 });
    const res = await client.api.vocabularies.$post({ json: parsed.data });
    return res.ok
      ? Response.json({ success: true, id: parsed.data.id }, { status: 201 })
      : Response.json({ success: false, error: 'ce vocabulaire existe déjà' }, { status: 409 });
  }

  if (action === 'delete-vocab') {
    const id = machineNameSchema.safeParse(body.id);
    if (!id.success) return Response.json({ success: false, error: 'validation' }, { status: 400 });
    const res = await client.api.vocabularies[':id'].$delete({ param: { id: id.data } });
    return res.ok
      ? Response.json({ success: true })
      : Response.json({ success: false, error: 'suppression' }, { status: 400 });
  }

  if (action === 'create-term') {
    const parsed = insertTermSchema.safeParse({
      id: crypto.randomUUID(),
      vocabularyId: body.vocabularyId,
      label: body.label,
      slug: body.slug,
      parentId: null,
    });
    if (!parsed.success) return Response.json({ success: false, error: parsed.error.message }, { status: 400 });
    const res = await client.api.terms.$post({ json: parsed.data });
    return res.ok
      ? Response.json({ success: true, id: parsed.data.id }, { status: 201 })
      : Response.json({ success: false, error: 'slug déjà pris' }, { status: 409 });
  }

  if (action === 'delete-term') {
    const id = uuid.safeParse(body.id);
    if (!id.success) return Response.json({ success: false, error: 'validation' }, { status: 400 });
    const res = await client.api.terms[':id'].$delete({ param: { id: id.data } });
    return res.ok
      ? Response.json({ success: true })
      : Response.json({ success: false, error: 'suppression' }, { status: 400 });
  }

  return Response.json({ success: false, error: 'action inconnue' }, { status: 400 });
};
