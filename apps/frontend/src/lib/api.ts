import { hc } from 'hono/client';
// Importation exclusive des TYPES : le code métier back n'alourdit pas le front (cahier v3 §4.2)
import type { ContentAPI } from '@edge-cmf/content-worker';
import type { AuthAPI } from '@edge-cmf/auth-worker';

/**
 * Clients RPC branchés directement sur la fonction fetch des Service Bindings.
 * L'URL "http://interne" n'est jamais résolue publiquement : le fetch injecté
 * court-circuite le réseau HTTP (latence < 2ms).
 */
export function contentClient(env: Env) {
  return hc<ContentAPI>('http://interne', {
    fetch: env.CONTENT_WORKER.fetch.bind(env.CONTENT_WORKER),
  });
}

export function authClient(env: Env) {
  return hc<AuthAPI>('http://interne', {
    fetch: env.AUTH_WORKER.fetch.bind(env.AUTH_WORKER),
  });
}

export const SESSION_COOKIE = 'cmf_session';
