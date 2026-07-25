/**
 * Socle des routes proxy `/api/*`.
 *
 * Chaque proxy répétait la même séquence : garde de session, lecture du
 * corps, `if (action === '…')` en cascade, `safeParse`, appel RPC, puis une
 * gestion d'erreur recopiée quatre à six fois par fichier. Résultat : des
 * messages d'erreur incohérents (le message précis du worker était souvent
 * remplacé par une chaîne générique du proxy) et un coût d'écriture élevé
 * pour chaque nouvelle action.
 *
 * Ici, une route se déclare : niveau d'autorisation + schéma + appel RPC.
 *
 * Décision structurante : **la réponse du worker est propagée telle quelle**
 * (statut et corps). Les workers renvoient déjà `{ success: false, error }`
 * avec le bon code HTTP et un message français précis (« Des contenus
 * utilisent encore ce type », « Impossible de se supprimer soi-même »…).
 * Les masquer derrière un « suppression » générique faisait perdre de
 * l'information à l'utilisateur.
 *
 * Voir `docs/design/05-ui.md` §3.2.
 */
import type { APIRoute } from 'astro';
import type { z } from 'zod';
import { proxyResponse } from './api';
import { requireApiSession, type Session } from './session';

/**
 * Niveaux d'autorisation, alignés sur le RBAC (`docs/design/04-auth.md`) :
 * `session` = tout compte connecté, `write` = admin + editor,
 * `admin` = admin seul.
 */
export type AuthLevel = 'session' | 'write' | 'admin';

const AUTH_OPTIONS = {
  session: {},
  write: { writeOnly: true },
  admin: { adminOnly: true },
} as const;

export function jsonError(error: string, status: number): Response {
  return Response.json({ success: false, error }, { status });
}

export interface RouteContext {
  readonly session: Session;
  readonly url: URL;
}

/** En-tête d'authentification pour les workers qui refont la vérification. */
export function bearer(session: Session): { Authorization: string } {
  return { Authorization: `Bearer ${session.token}` };
}

/** Route de lecture : garde d'accès, puis le handler. */
export function read(
  level: AuthLevel,
  handler: (ctx: RouteContext) => Promise<Response>,
): APIRoute {
  return async ({ cookies, url }) => {
    const auth = await requireApiSession(cookies, AUTH_OPTIONS[level]);
    if (auth instanceof Response) return auth;
    return handler({ session: auth, url });
  };
}

export interface Mutation {
  readonly handle: (body: unknown, ctx: RouteContext) => Promise<Response>;
}

/**
 * Une action de mutation : le schéma valide (et normalise, via `transform`)
 * le corps reçu, `run` effectue l'appel RPC. La réponse du worker est
 * repropagée par `proxyResponse` — obligatoire, une Response créée dans
 * l'isolat workerd échoue au `instanceof Response` côté Astro.
 */
export function mutation<S extends z.ZodTypeAny>(
  schema: S,
  run: (input: z.output<S>, ctx: RouteContext) => Promise<Response>,
): Mutation {
  return {
    handle: async (body, ctx) => {
      const parsed = schema.safeParse(body);
      if (!parsed.success) return jsonError(parsed.error.message, 400);
      return proxyResponse(await run(parsed.data as z.output<S>, ctx));
    },
  };
}

/**
 * Route POST multi-actions (`{ _action: '…' }`). Le tunnel `_action` est
 * conservé — il est cohérent avec l'existant — mais il devient déclaratif
 * et typé au lieu d'être une cascade de `if`.
 */
export function mutations(level: AuthLevel, actions: Readonly<Record<string, Mutation>>): APIRoute {
  return async ({ cookies, request, url }) => {
    const auth = await requireApiSession(cookies, AUTH_OPTIONS[level]);
    if (auth instanceof Response) return auth;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return jsonError('Corps JSON invalide', 400);
    }

    const action =
      typeof body === 'object' && body !== null
        ? (body as { _action?: unknown })._action
        : undefined;
    if (typeof action !== 'string') return jsonError('Action manquante', 400);

    const handler = actions[action];
    if (handler === undefined) return jsonError(`Action inconnue : ${action}`, 400);

    return handler.handle(body, { session: auth, url });
  };
}
