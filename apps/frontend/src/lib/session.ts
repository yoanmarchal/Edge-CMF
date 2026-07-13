import type { AstroCookies } from 'astro';
import type { UserContext } from '@edge-cmf/shared-types';
import { authClient, SESSION_COOKIE } from './api';

export interface Session {
  readonly user: UserContext;
  readonly token: string;
}

/** Valide le cookie de session auprès de l'Auth Worker (RPC interne). */
export async function getSessionUser(cookies: AstroCookies, env: Env): Promise<Session | null> {
  const token = cookies.get(SESSION_COOKIE)?.value;
  if (token === undefined || token.length === 0) return null;
  const res = await authClient(env).validate.$get(undefined, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  const { user } = await res.json();
  return { user, token };
}

/** Rôles autorisés à créer/modifier du contenu. */
export function canWrite(user: UserContext | null | undefined): boolean {
  return user != null && (user.role === 'admin' || user.role === 'editor');
}
