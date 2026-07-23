import { hc } from 'hono/client';
import { env } from 'cloudflare:workers';
// Importation exclusive des TYPES : le code métier back n'alourdit pas l'admin (cahier v3 §4.2)
import type { ContentAPI } from '@edge-cmf/content-worker';
import type { AuthAPI } from '@edge-cmf/auth-worker';

/**
 * Clients RPC branchés directement sur la fonction fetch des Service Bindings.
 * L'URL "http://interne" n'est jamais résolue publiquement : le fetch injecté
 * court-circuite le réseau HTTP (latence < 2ms). Depuis Astro 6/@astrojs/cloudflare
 * v13+, `env` s'importe directement depuis `cloudflare:workers` (remplace
 * l'ancienne API `Astro.locals.runtime.env`, supprimée).
 */
export function contentClient() {
  return hc<ContentAPI>('http://interne', {
    fetch: env.CONTENT_WORKER.fetch.bind(env.CONTENT_WORKER),
  });
}

export function authClient() {
  return hc<AuthAPI>('http://interne', {
    fetch: env.AUTH_WORKER.fetch.bind(env.AUTH_WORKER),
  });
}

export const SESSION_COOKIE = 'cmf_session';

/**
 * Reconstruit une Response "native" (realm Node/Astro) à partir de la
 * réponse brute d'un Service Binding. `env.X.fetch()` renvoie un objet
 * Response créé dans le realm workerd (isolat séparé) : `instanceof Response`
 * y échoue côté Astro, qui rejette alors la route avec
 * "EndpointDidNotReturnAResponse" même si la réponse est valide. À utiliser
 * systématiquement quand on retourne directement le résultat d'un appel
 * `contentClient`/`authClient` sans passer par `Response.json(...)`.
 */
export function proxyResponse(res: Response): Response {
  return new Response(res.body, { status: res.status, headers: res.headers });
}
