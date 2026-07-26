/**
 * Régression du constat P0-3 : les réponses servies depuis le cache edge
 * interne sortaient avec `Cache-Control: public`, y compris celles contenant
 * des brouillons (`all=1`), que l'admin repropage ensuite au navigateur.
 *
 * Le test vise l'ÉCART entre MISS et HIT — c'est lui qui rendait le problème
 * intermittent, donc invisible en développement.
 *
 * L'écriture dans le cache part dans un `waitUntil`. On passe donc par
 * `createExecutionContext()` + `waitOnExecutionContext()` plutôt que par
 * `exports.default.fetch()` : sans ça, le second appel courrait contre une
 * écriture non terminée et le HIT serait aléatoire.
 */
import { env } from 'cloudflare:workers';
import { createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import worker from '../src/index';

const IncomingRequest = Request<unknown, IncomingRequestCfProperties>;

/** Un appel complet, side effects `waitUntil` inclus. */
async function fetchSettled(url: string): Promise<Response> {
  const ctx = createExecutionContext();
  const res = await worker.fetch(new IncomingRequest(url), env, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

/**
 * `headers.get()` renvoie `null` quand l'en-tête est absent — et l'absence est
 * précisément le résultat attendu ici. On normalise donc en chaîne vide :
 * `.not.toMatch()` sur `null` lève au lieu de passer, ce qui ferait échouer le
 * test pour la bonne raison mais avec le mauvais message.
 */
const cacheControlOf = (res: Response): string => res.headers.get('Cache-Control') ?? '';

const URL_AVEC_BROUILLONS = 'http://content.test/api/nodes?all=1&limit=20&offset=0';

describe('P0-3 — en-têtes de cache des réponses internes', () => {
  it('ne marque jamais une réponse `public`, ni au premier appel ni au suivant', async () => {
    const premier = await fetchSettled(URL_AVEC_BROUILLONS);
    expect(premier.status).toBe(200);
    expect(cacheControlOf(premier)).not.toMatch(/public/);

    const second = await fetchSettled(URL_AVEC_BROUILLONS);
    expect(second.status).toBe(200);
    expect(cacheControlOf(second)).not.toMatch(/public/);
  });

  /**
   * Test séparé, et c'est délibéré : l'invariant ci-dessus resterait vrai même
   * si le cache ne s'activait jamais — il passerait au vert sans avoir exercé
   * le chemin HIT, c'est-à-dire sans tester la régression visée. Cette
   * assertion-ci vérifie la PRÉCONDITION. Si elle échoue, l'autre test devient
   * suspect, et on le sait.
   */
  it('sert bien la seconde requête depuis le cache edge', async () => {
    const url = 'http://content.test/api/vocabularies';

    const premier = await fetchSettled(url);
    expect(premier.headers.get('X-Edge-Cache')).toBe('MISS');

    const second = await fetchSettled(url);
    expect(second.headers.get('X-Edge-Cache')).toBe('HIT');
  });
});
