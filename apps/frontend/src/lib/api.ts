import { hc } from 'hono/client';
import { env } from 'cloudflare:workers';
// Importation exclusive des TYPES : le code métier back n'alourdit pas le front (cahier v3 §4.2)
import type { ContentAPI } from '@edge-cmf/content-worker';
import { THEME_SETTING_KEY, resolveTheme } from './themes';

/**
 * Client RPC branché directement sur la fonction fetch du Service Binding.
 * L'URL "http://interne" n'est jamais résolue publiquement : le fetch injecté
 * court-circuite le réseau HTTP (latence < 2ms). Depuis Astro 6/@astrojs/cloudflare
 * v13+, `env` s'importe directement depuis `cloudflare:workers` (remplace
 * l'ancienne API `Astro.locals.runtime.env`, supprimée).
 *
 * Le front n'a besoin que du content-worker : l'authentification et toute
 * mutation de contenu vivent désormais dans apps/admin (projet séparé).
 */
export function contentClient() {
  return hc<ContentAPI>('http://interne', {
    fetch: env.CONTENT_WORKER.fetch.bind(env.CONTENT_WORKER),
  });
}

/**
 * Thème actif du front, résolu en SSR (cahier : le front garde du SSR, pas
 * l'admin). Lecture tolérante : si le content-worker est indisponible, on
 * retombe sur le thème natif plutôt que de casser le rendu public.
 */
export async function getActiveTheme(): Promise<string> {
  try {
    const res = await contentClient().api.settings[':key'].$get({
      param: { key: THEME_SETTING_KEY },
    });
    if (!res.ok) {
      // Le repli reste silencieux pour le visiteur — mais pas pour nous : un
      // content-worker en panne se manifestait uniquement par un site qui
      // repasse au thème par défaut, sans la moindre trace.
      console.error({ event: 'theme.fetch_failed', status: res.status });
      return resolveTheme(null);
    }
    const { data } = await res.json();
    return resolveTheme(data.value);
  } catch (error: unknown) {
    console.error({ event: 'theme.fetch_threw', error: String(error) });
    return resolveTheme(null);
  }
}
