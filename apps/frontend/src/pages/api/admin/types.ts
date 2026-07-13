import type { APIRoute } from 'astro';
import { z } from 'zod';
import {
  insertContentTypeSchema,
  insertFieldSchema,
  machineNameSchema,
  fieldTypeEnum,
} from '@edge-cmf/shared-types';
import { contentClient } from '../../../lib/api';
import { getSessionUser } from '../../../lib/session';

const uuid = z.string().uuid();

/** Cible de retour sûre (fournie par un input hidden "back" des formulaires). */
function backOf(form: FormData): string {
  const raw = form.get('back');
  return typeof raw === 'string' && raw.startsWith('/admin') ? raw : '/admin/types';
}

export const POST: APIRoute = async ({ request, locals, cookies, redirect }) => {
  const env = locals.runtime.env;
  const session = await getSessionUser(cookies, env);
  if (session === null || session.user.role !== 'admin') {
    return redirect('/admin?error=droits', 303);
  }

  const form = await request.formData();
  const action = form.get('_action');
  const client = contentClient(env);
  const back = backOf(form);

  if (action === 'create-type') {
    const parsed = insertContentTypeSchema.safeParse({
      id: form.get('id'),
      label: form.get('label'),
      description: form.get('description') ?? '',
      kind: form.get('kind') ?? 'node',
    });
    if (!parsed.success) return redirect(`${back}?error=validation`, 303);
    const res = await client.api.types.$post({ json: parsed.data });
    // Succès : atterrir directement sur la gestion des champs du nouveau type
    return redirect(res.ok ? `/admin/types/${parsed.data.id}?ok=1` : `${back}?error=conflit`, 303);
  }

  if (action === 'delete-type') {
    const id = machineNameSchema.safeParse(form.get('id'));
    if (!id.success) return redirect(`${back}?error=validation`, 303);
    const res = await client.api.types[':id'].$delete({ param: { id: id.data } });
    if (!res.ok) {
      const body = await res.json();
      const msg = 'error' in body ? body.error : 'suppression';
      return redirect(`${back}?error=${encodeURIComponent(msg)}`, 303);
    }
    return redirect(`${back}?ok=1`, 303);
  }

  if (action === 'create-field') {
    const optionsRaw = String(form.get('options') ?? '').trim();
    const options =
      optionsRaw.length > 0
        ? optionsRaw.split(',').map((o) => o.trim()).filter((o) => o.length > 0)
        : undefined;
    const fieldType = fieldTypeEnum.safeParse(form.get('fieldType'));
    if (!fieldType.success) return redirect(`${back}?error=validation`, 303);
    const parsed = insertFieldSchema.safeParse({
      id: crypto.randomUUID(),
      contentTypeId: form.get('contentTypeId'),
      name: form.get('name'),
      label: form.get('label'),
      fieldType: fieldType.data,
      required: form.get('required') === 'on',
      settings: fieldType.data === 'select' && options !== undefined ? { options } : {},
      weight: Number(form.get('weight') ?? 0),
    });
    if (!parsed.success) return redirect(`${back}?error=validation`, 303);
    const res = await client.api.fields.$post({ json: parsed.data });
    return redirect(res.ok ? `${back}?ok=1` : `${back}?error=conflit`, 303);
  }

  if (action === 'delete-field') {
    const id = uuid.safeParse(form.get('id'));
    if (!id.success) return redirect(`${back}?error=validation`, 303);
    const res = await client.api.fields[':id'].$delete({ param: { id: id.data } });
    return redirect(res.ok ? `${back}?ok=1` : `${back}?error=suppression`, 303);
  }

  return redirect(`${back}?error=action-inconnue`, 303);
};
