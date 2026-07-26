import { env } from 'cloudflare:workers';
import { applyD1Migrations } from 'cloudflare:test';
import { beforeAll } from 'vitest';

/**
 * Applique les migrations D1 réelles avant chaque fichier de test.
 *
 * `vitest-pool-workers` isole le stockage par fichier : chaque fichier part
 * d'une base vierge, ce qui évite qu'un test en pollue un autre — mais impose
 * de rejouer les migrations à chaque fois.
 */
beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
});
