/**
 * Tests du media-worker — environnement Node, PAS workerd.
 *
 * Choix assumé et différent de celui du content-worker : ce qui est testé ici
 * (`parseRange`) est de la logique pure, sans binding ni API de plateforme.
 * L'exécuter dans workerd n'apporterait rien et coûterait un démarrage de
 * runtime. Les comportements qui dépendent réellement de R2 ou de la Cache API
 * relèvent, eux, de `vitest-pool-workers`.
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.spec.ts'],
  },
});
