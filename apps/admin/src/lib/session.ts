import type { AstroCookies } from 'astro';
import type { UserContext } from '@edge-cmf/shared-types';
import { authClient, SESSION_COOKIE } from './api';

export interface Session {
  readonly user: UserContext;
  readonly token: string;
}

/** Valide le cookie de session auprès de l'Auth Worker (RPC interne). */
export async function getSessionUser(cookies: AstroCookies): Promise<Session | null> {
  const token = cookies.get(SESSION_COOKIE)?.value;
  if (token === undefined || token.length === 0) return null;
  const res = await authClient().validate.$get(undefined, {
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

/**
 * Garde d'accès pour l'API JSON /api/* consommée par les îlots Preact
 * (client:only — l'admin n'a pas de SSR de contenu, mais cette vérification
 * de session reste nécessairement côté serveur : le cookie est httpOnly).
 * Retourne directement une Response 401/403 prête à renvoyer, ou la session.
 */
export async function requireApiSession(
  cookies: AstroCookies,
  opts: { adminOnly?: boolean; writeOnly?: boolean } = {},
): Promise<Session | Response> {
  const session = await getSessionUser(cookies);
  if (session === null) {
    return Response.json({ success: false, error: 'Non authentifié' }, { status: 401 });
  }
  if (opts.adminOnly === true && session.user.role !== 'admin') {
    return Response.json({ success: false, error: 'Non autorisé' }, { status: 403 });
  }
  if (opts.writeOnly === true && !canWrite(session.user)) {
    return Response.json({ success: false, error: 'Non autorisé' }, { status: 403 });
  }
  return session;
}
