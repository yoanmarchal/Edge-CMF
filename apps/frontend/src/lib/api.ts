import { hc } from 'hono/client';
// Importation exclusive des TYPES : le code métier back n'alourdit pas le front (cahier v3 §4.2)
import type { ContentAPI } from '@edge-cmf/content-worker';
import { THEME_SETTING_KEY, resolveTheme } from './themes';

/**
 * Client RPC branché directement sur la fonction fetch du Service Binding.
 * L'URL "http://interne" n'est jamais résolue publiquement : le fetch injecté
 * court-circuite le réseau HTTP (latence < 2ms).
 *
 * Le front n'a besoin que du content-worker : l'authentification et toute
 * mutation de contenu vivent désormais dans apps/admin (projet séparé).
 */
export function contentClient(env: Env) {
  return hc<ContentAPI>('http://interne', {
    fetch: env.CONTENT_WORKER.fetch.bind(env.CONTENT_WORKER),
  });
}

/**
 * Thème actif du front, résolu en SSR (cahier : le front garde du SSR, pas
 * l'admin). Lecture tolérante : si le content-worker est indisponible, on
 * retombe sur le thème natif plutôt que de casser le rendu public.
 */
export async function getActiveTheme(env: Env): Promise<string> {
  try {
    const res = await contentClient(env).api.settings[':key'].$get({
      param: { key: THEME_SETTING_KEY },
    });
    if (!res.ok) return resolveTheme(null);
    const { data } = await res.json();
    return resolveTheme(data.value);
  } catch {
    return resolveTheme(null);
  }
}
