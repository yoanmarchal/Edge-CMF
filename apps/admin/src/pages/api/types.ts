import type { APIRoute } from 'astro';
import { z } from 'zod';
import {
  insertContentTypeSchema,
  insertFieldSchema,
  machineNameSchema,
  fieldTypeEnum,
  typeKindEnum,
} from '@edge-cmf/shared-types';
import { contentClient, proxyResponse } from '../../lib/api';
import { requireApiSession } from '../../lib/session';

const uuid = z.string().uuid();

/** API JSON /api/types — types de contenu + Field UI (adminOnly). */
export const GET: APIRoute = async ({ cookies, url }) => {
  const auth = await requireApiSession(cookies);
  if (auth instanceof Response) return auth;

  const client = contentClient();
  const id = url.searchParams.get('id');
  if (id !== null) {
    const parsedId = machineNameSchema.safeParse(id);
    if (!parsedId.success) return Response.json({ success: false, error: 'id invalide' }, { status: 400 });
    return proxyResponse(await client.api.types[':id'].$get({ param: { id: parsedId.data } }));
  }

  const kind = typeKindEnum.safeParse(url.searchParams.get('kind') ?? undefined);
  return proxyResponse(await client.api.types.$get({ query: kind.success ? { kind: kind.data } : {} }));
};

export const POST: APIRoute = async ({ request, cookies }) => {
  const auth = await requireApiSession(cookies, { adminOnly: true });
  if (auth instanceof Response) return auth;

  const body = (await request.json()) as Record<string, unknown>;
  const action = body._action;
  const client = contentClient();

  if (action === 'create-type') {
    const parsed = insertContentTypeSchema.safeParse({
      id: body.id,
      label: body.label,
      description: body.description ?? '',
      kind: body.kind ?? 'node',
    });
    if (!parsed.success) return Response.json({ success: false, error: parsed.error.message }, { status: 400 });
    const res = await client.api.types.$post({ json: parsed.data });
    return res.ok
      ? Response.json({ success: true, id: parsed.data.id }, { status: 201 })
      : Response.json({ success: false, error: 'ce type existe déjà' }, { status: 409 });
  }

  if (action === 'delete-type') {
    const id = machineNameSchema.safeParse(body.id);
    if (!id.success) return Response.json({ success: false, error: 'validation' }, { status: 400 });
    const res = await client.api.types[':id'].$delete({ param: { id: id.data } });
    if (!res.ok) {
      const respBody = await res.json();
      const msg = 'error' in respBody ? respBody.error : 'suppression';
      return Response.json({ success: false, error: msg }, { status: 400 });
    }
    return Response.json({ success: true });
  }

  if (action === 'create-field') {
    const optionsRaw = String(body.options ?? '').trim();
    const options =
      optionsRaw.length > 0
        ? optionsRaw.split(',').map((o) => o.trim()).filter((o) => o.length > 0)
        : undefined;
    const fieldType = fieldTypeEnum.safeParse(body.fieldType);
    if (!fieldType.success) return Response.json({ success: false, error: 'validation' }, { status: 400 });
    const settings: Record<string, unknown> = {};
    if (fieldType.data === 'select' && options !== undefined) settings.options = options;
    if (body.multiple === true) settings.multiple = true;
    const parsed = insertFieldSchema.safeParse({
      id: crypto.randomUUID(),
      contentTypeId: body.contentTypeId,
      name: body.name,
      label: body.label,
      fieldType: fieldType.data,
      required: body.required === true,
      settings,
      weight: Number(body.weight ?? 0),
    });
    if (!parsed.success) return Response.json({ success: false, error: parsed.error.message }, { status: 400 });
    const res = await client.api.fields.$post({ json: parsed.data });
    return res.ok
      ? Response.json({ success: true, id: parsed.data.id }, { status: 201 })
      : Response.json({ success: false, error: 'champ déjà existant' }, { status: 409 });
  }

  if (action === 'delete-field') {
    const id = uuid.safeParse(body.id);
    if (!id.success) return Response.json({ success: false, error: 'validation' }, { status: 400 });
    const res = await client.api.fields[':id'].$delete({ param: { id: id.data } });
    return res.ok
      ? Response.json({ success: true })
      : Response.json({ success: false, error: 'suppression' }, { status: 400 });
  }

  return Response.json({ success: false, error: 'action inconnue' }, { status: 400 });
};
