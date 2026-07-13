import type { APIRoute } from 'astro';
import { z } from 'zod';
import { registerSchema, roleEnum } from '@edge-cmf/shared-types';
import { authClient } from '../../../lib/api';
import { getSessionUser } from '../../../lib/session';

const uuid = z.string().uuid();
const BACK = '/admin/users';

export const POST: APIRoute = async ({ request, locals, cookies, redirect }) => {
  const env = locals.runtime.env;
  const session = await getSessionUser(cookies, env);
  if (session === null || session.user.role !== 'admin') {
    return redirect('/admin?error=droits', 303);
  }

  const form = await request.formData();
  const action = form.get('_action');
  const client = authClient(env);
  const headers = { Authorization: `Bearer ${session.token}` };

  if (action === 'create') {
    const parsed = registerSchema.safeParse({
      email: form.get('email'),
      password: form.get('password'),
      role: form.get('role'),
    });
    if (!parsed.success) return redirect(`${BACK}?error=validation`, 303);
    const res = await client.register.$post({ json: parsed.data }, { headers });
    return redirect(res.ok ? `${BACK}?ok=1` : `${BACK}?error=conflit`, 303);
  }

  if (action === 'set-role') {
    const id = uuid.safeParse(form.get('id'));
    const role = roleEnum.safeParse(form.get('role'));
    if (!id.success || !role.success) return redirect(`${BACK}?error=validation`, 303);
    const res = await client.users[':id'].role.$put(
      { param: { id: id.data }, json: { role: role.data } },
      { headers },
    );
    return redirect(res.ok ? `${BACK}?ok=1` : `${BACK}?error=modification`, 303);
  }

  if (action === 'delete') {
    const id = uuid.safeParse(form.get('id'));
    if (!id.success) return redirect(`${BACK}?error=validation`, 303);
    const res = await client.users[':id'].$delete({ param: { id: id.data } }, { headers });
    return redirect(res.ok ? `${BACK}?ok=1` : `${BACK}?error=suppression`, 303);
  }

  return redirect(`${BACK}?error=action-inconnue`, 303);
};
