import { env } from 'cloudflare:workers';

/**
 * Résolution des URLs média versionnées (`?v=<epoch d'upload>`, équivalent du
 * jeton `itok` de Drupal).
 *
 * ## Le problème
 *
 * `FieldValue.astro` interrogeait le media-worker UNE FOIS PAR VALEUR pour
 * récupérer un seul horodatage. Une page de trente images déclenchait trente
 * sous-requêtes, sérialisées par paquets de six — la limite de connexions
 * simultanées est partagée avec les workers appelés par Service Binding.
 *
 * ## Ce qui a été écarté, et pourquoi
 *
 * **Figer la version à l'écriture** (stocker `/media/clé?v=…` dans
 * `fields_json` au moment de l'enregistrement) supprimerait toute sous-requête.
 * Mais un média est REMPLAÇABLE sur place, à clé constante : après un
 * remplacement, les contenus continueraient d'émettre l'ancienne version, et
 * comme les URLs versionnées sont servies en `immutable, max-age=1an`, les
 * navigateurs ne retéléchargeraient jamais le nouveau fichier. Le N+1 payait
 * précisément cette exactitude.
 *
 * **Utiliser la version du tag `media`** comme cache-buster global
 * (`?v=<version du tag>`) coûterait zéro sous-requête et resterait correct —
 * mais toucher un seul texte alternatif invaliderait le cache navigateur de
 * TOUTES les images du site. Piste valable si la bande passante le permet ;
 * c'est un arbitrage produit, pas technique.
 *
 * ## Ce qui est fait ici
 *
 * Mémoïsation à l'échelle de l'isolat, même motif que `sigCache` dans
 * `middleware.ts`. La sémantique est INCHANGÉE (on lit toujours le vrai
 * horodatage), mais une clé donnée n'est résolue qu'une fois par fenêtre :
 * les répétitions au sein d'une page comme entre requêtes deviennent
 * gratuites. Combiné au cache de page, le coût réel tend vers zéro.
 *
 * La fenêtre est volontairement courte : un remplacement de média doit se voir
 * vite. Elle borne le retard, elle ne l'annule pas.
 */

const TTL_MS = 30_000;

interface Entry {
  readonly url: string;
  readonly at: number;
}

const cache = new Map<string, Entry>();

/** Empêche l'isolat de retenir indéfiniment les clés d'un gros catalogue. */
const MAX_ENTRIES = 500;

function remember(path: string, url: string): string {
  if (cache.size >= MAX_ENTRIES) cache.clear();
  cache.set(path, { url, at: Date.now() });
  return url;
}

/**
 * `/media/<clé>` → `/media/<clé>?v=<epoch>`.
 * Repli sur le chemin nu si le média a disparu : une image cassée vaut mieux
 * qu'une page cassée, mais l'incohérence part dans les journaux.
 */
export async function versionedMediaUrl(path: string): Promise<string> {
  const hit = cache.get(path);
  if (hit !== undefined && Date.now() - hit.at < TTL_MS) return hit.url;

  const key = path.replace(/^\/media\//, '');
  try {
    const res = await env.MEDIA_WORKER.fetch(`http://interne/api/media/item/${key}`);
    if (!res.ok) {
      console.error({ event: 'media.version_lookup_failed', key, status: res.status });
      // L'échec est mémoïsé lui aussi : sans ça, un média manquant référencé
      // vingt fois dans une page relance vingt appels voués à échouer.
      return remember(path, path);
    }
    const { data } = (await res.json()) as { data: { uploaded: string } };
    return remember(path, `${path}?v=${Date.parse(data.uploaded)}`);
  } catch (error: unknown) {
    console.error({ event: 'media.version_lookup_threw', key, error: String(error) });
    return remember(path, path);
  }
}

/**
 * Résout un lot de chemins en dédoublonnant d'abord.
 *
 * Une galerie qui affiche vingt fois la même image ne doit produire qu'une
 * seule résolution — `Promise.all` sur la liste brute en aurait lancé vingt en
 * parallèle avant que la première ne peuple le cache.
 */
export async function versionedMediaUrls(paths: readonly string[]): Promise<Map<string, string>> {
  const unique = [...new Set(paths)];
  const resolved = await Promise.all(unique.map(versionedMediaUrl));
  return new Map(unique.map((p, i) => [p, resolved[i] ?? p]));
}

/**
 * Extrait les chemins `/media/…` d'un jeu de valeurs de champs.
 *
 * Les champs à cardinalité multiple portent un tableau, d'où l'aplatissement.
 * Sert au préchauffage en tête de page, avant que les composants ne rendent.
 */
export function collectMediaPaths(fields: Record<string, unknown>): string[] {
  const out: string[] = [];
  for (const value of Object.values(fields)) {
    for (const item of Array.isArray(value) ? value : [value]) {
      if (typeof item === 'string' && item.startsWith('/media/')) out.push(item);
    }
  }
  return out;
}
