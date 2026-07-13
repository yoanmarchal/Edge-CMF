import type { APIRoute } from 'astro';
import { z } from 'zod';
import {
  insertNodeSchema,
  updateNodeSchema,
  machineNameSchema,
  type InsertParagraph,
  type FieldDef,
} from '@edge-cmf/shared-types';
import { contentClient } from '../../../lib/api';
import { getSessionUser, canWrite } from '../../../lib/session';
import { parseFieldValues } from '../../../lib/fields';

const uuid = z.string().uuid();

/**
 * Reconstruit les paragraphes depuis le formulaire :
 * inputs nommés p_<i>_type et p_<i>_field_<name> (ordre = ordre du DOM).
 */
async function parseParagraphs(
  form: FormData,
  client: ReturnType<typeof contentClient>,
): Promise<InsertParagraph[]> {
  const indices = [...form.keys()]
    .map((k) => /^p_(\d+)_type$/.exec(k))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => Number(m[1]))
    .sort((a, b) => a - b);

  const defsCache = new Map<string, FieldDef[]>();
  const out: InsertParagraph[] = [];
  for (const i of indices) {
    const ptype = machineNameSchema.safeParse(form.get(`p_${i}_type`));
    if (!ptype.success) continue;
    if (!defsCache.has(ptype.data)) {
      const res = await client.api.types[':id'].$get({ param: { id: ptype.data } });
      if (!res.ok) continue;
      const { data } = await res.json();
      defsCache.set(ptype.data, data.fields);
    }
    const defs = defsCache.get(ptype.data) ?? [];
    out.push({
      type: ptype.data,
      fields: parseFieldValues(form, defs, `p_${i}_`),
      weight: out.length,
    });
  }
  return out;
}

export const POST: APIRoute = async ({ request, locals, cookies, redirect }) => {
  const env = locals.runtime.env;
  const session = await getSessionUser(cookies, env);
  if (session === null || !canWrite(session.user)) {
    return redirect('/admin?error=droits', 303);
  }

  const form = await request.formData();
  const action = form.get('_action');
  const client = contentClient(env);

  if (action === 'delete') {
    const id = uuid.safeParse(form.get('id'));
    if (!id.success) return redirect('/admin/content?error=validation', 303);
    const res = await client.api.nodes[':id'].$delete({ param: { id: id.data } });
    return redirect(res.ok ? '/admin/content?ok=1' : '/admin/content?error=suppression', 303);
  }

  // create / update : charger les définitions de champs du type
  const contentType = machineNameSchema.safeParse(form.get('contentType'));
  if (!contentType.success) return redirect('/admin/content?error=type', 303);

  const typeRes = await client.api.types[':id'].$get({ param: { id: contentType.data } });
  if (!typeRes.ok) return redirect('/admin/content?error=type-inconnu', 303);
  const { data: typeDetail } = await typeRes.json();

  const base = {
    title: form.get('title'),
    slug: form.get('slug'),
    body: form.get('body') ?? '',
    contentType: contentType.data,
    status: form.get('status') === 'on',
    fields: parseFieldValues(form, typeDetail.fields),
    termIds: form.getAll('termIds').map(String),
    paragraphs: await parseParagraphs(form, client),
  };

  if (action === 'update') {
    const id = uuid.safeParse(form.get('id'));
    if (!id.success) return redirect('/admin/content?error=validation', 303);
    const parsed = updateNodeSchema.safeParse(base);
    if (!parsed.success) return redirect(`/admin/content/edit/${id.data}?error=validation`, 303);
    const res = await client.api.nodes[':id'].$put({ param: { id: id.data }, json: parsed.data });
    if (!res.ok) {
      const body = await res.json();
      const msg = 'error' in body ? body.error : 'modification';
      return redirect(`/admin/content/edit/${id.data}?error=${encodeURIComponent(msg)}`, 303);
    }
    return redirect('/admin/content?ok=1', 303);
  }

  const parsed = insertNodeSchema.safeParse({ ...base, id: crypto.randomUUID() });
  if (!parsed.success) {
    return redirect(`/admin/content/new?type=${contentType.data}&error=validation`, 303);
  }
  const res = await client.api.nodes.$post({ json: parsed.data });
  if (!res.ok) {
    const body = await res.json();
    return redirect(
      `/admin/content/new?type=${contentType.data}&error=${encodeURIComponent(body.error)}`,
      303,
    );
  }
  return redirect('/admin/content?ok=1', 303);
};
