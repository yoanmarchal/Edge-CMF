import type { APIRoute } from 'astro';
import { loginSchema } from '@edge-cmf/shared-types';
import { authClient, SESSION_COOKIE } from '../../lib/api';

export const POST: APIRoute = async ({ request, locals, cookies, redirect }) => {
  const form = await request.formData();
  const parsed = loginSchema.safeParse({
    email: form.get('email'),
    password: form.get('password'),
  });
  if (!parsed.success) {
    return redirect('/?error=validation', 303);
  }

  // Appel RPC interne au micro-service d'authentification
  const res = await authClient(locals.runtime.env).login.$post({ json: parsed.data });
  if (!res.ok) {
    return redirect('/?error=identifiants', 303);
  }

  const { token } = await res.json();
  cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    path: '/',
    maxAge: 60 * 60 * 8,
  });
  return redirect('/', 303);
};
