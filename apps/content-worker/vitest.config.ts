/**
 * Tests du content-worker — exécutés dans workerd, pas dans Node.
 *
 * C'est le point essentiel : les bugs corrigés dans le lot 1 (limite de 100
 * paramètres liés, absence de transaction interactive, en-têtes de cache) sont
 * des comportements de la PLATEFORME. Un test qui tourne dans Node avec un
 * SQLite en mémoire ne les reproduit pas — il passerait au vert sur le code
 * bogué. `@cloudflare/vitest-pool-workers` exécute le worker sur le vrai
 * runtime, avec de vrais bindings D1/KV/Cache.
 *
 * Les migrations SQL du dossier `migrations/` sont lues ici puis appliquées
 * dans `test/setup.ts` : les tests s'exécutent donc sur le schéma réel, index
 * compris, et non sur un schéma redéclaré pour les besoins du test.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-pool-workers';
import { defineConfig } from 'vitest/config';

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [
    cloudflareTest(async () => ({
      // Explicite plutôt que déduit de wrangler.toml : `main` conditionne la
      // disponibilité de `exports.default.fetch()` dans les tests.
      main: './src/index.ts',
      wrangler: { configPath: './wrangler.toml' },
      miniflare: {
        // Transmises au runtime pour être appliquées avant chaque fichier.
        bindings: { TEST_MIGRATIONS: await readD1Migrations(path.join(here, 'migrations')) },
      },
    })),
  ],
  test: {
    setupFiles: ['./test/setup.ts'],
    include: ['test/**/*.spec.ts'],
  },
});
