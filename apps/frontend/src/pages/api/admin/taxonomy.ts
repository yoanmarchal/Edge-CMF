import type { APIRoute } from 'astro';
import { z } from 'zod';
import {
  insertVocabularySchema,
  insertTermSchema,
  machineNameSchema,
} from '@edge-cmf/shared-types';
import { contentClient } from '../../../lib/api';
import { getSessionUser, canWrite } from '../../../lib/session';

const uuid = z.string().uuid();
const BACK = '/admin/taxonomy';

export const POST: APIRoute = async ({ request, locals, cookies, redirect }) => {
  const env = locals.runtime.env;
  const session = await getSessionUser(cookies, env);
  if (session === null || !canWrite(session.user)) {
    return redirect('/admin?error=droits', 303);
  }

  const form = await request.formData();
  const action = form.get('_action');
  const client = contentClient(env);

  if (action === 'create-vocab') {
    const parsed = insertVocabularySchema.safeParse({
      id: form.get('id'),
      label: form.get('label'),
    });
    if (!parsed.success) return redirect(`${BACK}?error=validation`, 303);
    const res = await client.api.vocabularies.$post({ json: parsed.data });
    return redirect(res.ok ? `${BACK}?ok=1` : `${BACK}?error=conflit`, 303);
  }

  if (action === 'delete-vocab') {
    const id = machineNameSchema.safeParse(form.get('id'));
    if (!id.success) return redirect(`${BACK}?error=validation`, 303);
    const res = await client.api.vocabularies[':id'].$delete({ param: { id: id.data } });
    return redirect(res.ok ? `${BACK}?ok=1` : `${BACK}?error=suppression`, 303);
  }

  if (action === 'create-term') {
    const parsed = insertTermSchema.safeParse({
      id: crypto.randomUUID(),
      vocabularyId: form.get('vocabularyId'),
      label: form.get('label'),
      slug: form.get('slug'),
      parentId: null,
    });
    if (!parsed.success) return redirect(`${BACK}?error=validation`, 303);
    const res = await client.api.terms.$post({ json: parsed.data });
    return redirect(res.ok ? `${BACK}?ok=1` : `${BACK}?error=conflit`, 303);
  }

  if (action === 'delete-term') {
    const id = uuid.safeParse(form.get('id'));
    if (!id.success) return redirect(`${BACK}?error=validation`, 303);
    const res = await client.api.terms[':id'].$delete({ param: { id: id.data } });
    return redirect(res.ok ? `${BACK}?ok=1` : `${BACK}?error=suppression`, 303);
  }

  return redirect(`${BACK}?error=action-inconnue`, 303);
};
