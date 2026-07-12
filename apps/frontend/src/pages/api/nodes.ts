import type { APIRoute } from 'astro';
import { insertNodeSchema } from '@edge-cmf/shared-types';
import { authClient, contentClient, SESSION_COOKIE } from '../../lib/api';

/**
 * Création de contenu : le front (seul point exposé) orchestre
 * Auth Service (validation JWT + RBAC) puis Content Service (CRUD).
 * Les deux appels transitent par Service Bindings internes (cahier v3 §3).
 */
export const POST: APIRoute = async ({ request, locals, cookies, redirect }) => {
  const token = cookies.get(SESSION_COOKIE)?.value;
  if (token === undefined) {
    return redirect('/admin?error=session', 303);
  }

  const env = locals.runtime.env;

  // 1. Validation de session auprès de l'Auth Worker
  const authRes = await authClient(env).validate.$get(undefined, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!authRes.ok) {
    return redirect('/admin?error=session', 303);
  }
  const { user } = await authRes.json();
  if (user.role !== 'admin' && user.role !== 'editor') {
    return redirect('/admin?error=droits', 303);
  }

  // 2. Validation stricte du payload (Zod)
  const form = await request.formData();
  const parsed = insertNodeSchema.safeParse({
    id: crypto.randomUUID(),
    title: form.get('title'),
    slug: form.get('slug'),
    body: form.get('body'),
    contentType: form.get('contentType'),
    status: form.get('status') === 'on',
  });
  if (!parsed.success) {
    return redirect('/admin?error=validation', 303);
  }

  // 3. Appel RPC au micro-service de contenu (typage 100% strict conservé)
  const res = await contentClient(env).api.nodes.$post({ json: parsed.data });
  return redirect(res.ok ? '/admin?ok=1' : '/admin?error=creation', 303);
};
