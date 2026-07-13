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

/** Charge les types de paragraphes avec leurs définitions de champs. */
export async function loadParagraphTypes(client: ReturnType<typeof contentClient>) {
  const res = await client.api.types.$get({ query: { kind: 'paragraph' } });
  if (!res.ok) return [];
  const { data } = await res.json();
  const out: { id: string; label: string; fields: import('@edge-cmf/shared-types').FieldDef[] }[] =
    [];
  for (const t of data) {
    const d = await client.api.types[':id'].$get({ param: { id: t.id } });
    if (d.ok) {
      const { data: detail } = await d.json();
      out.push({ id: t.id, label: t.label, fields: detail.fields });
    }
  }
  return out;
}
