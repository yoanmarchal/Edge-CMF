// @ts-check
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import preact from '@astrojs/preact';

// Admin — projet Cloudflare Workers distinct du front public (apps/frontend).
// Pas de SSR de contenu ici : chaque page ne fait qu'une garde de session
// (nécessairement serveur, cookie httpOnly) puis monte un îlot Preact
// client:only qui consomme /api/* (proxy JSON vers content-worker/auth-worker
// via Service Bindings). Voir src/islands/.
//
// `astro dev` tourne désormais directement sur le runtime workerd réel (via
// le plugin Vite Cloudflare) : plus besoin de lancer content-worker/auth-worker
// dans des terminaux séparés pour le dev local de cette app — `auxiliaryWorkers`
// les démarre automatiquement. Le binding lui-même reste déclaré dans
// wrangler.toml (les deux mécanismes sont complémentaires, pas redondants).
//
// `persistState` pointe vers le même dossier que les scripts `dev`/`db:migrate:local`
// des workers (`--persist-to ../../.wrangler-state`) : sans ça, chaque
// processus (front, admin, content-worker/auth-worker en standalone…) crée son
// propre état D1/KV local isolé et vide — les migrations appliquées côté
// workers restent invisibles de l'admin.
export default defineConfig({
  output: 'server',
  integrations: [preact()],
  adapter: cloudflare({
    imageService: 'compile',
    auxiliaryWorkers: [
      { configPath: '../content-worker/wrangler.toml' },
      { configPath: '../auth-worker/wrangler.toml' },
      { configPath: '../media-worker/wrangler.toml' },
    ],
    persistState: { path: '../../.wrangler-state' },
  }),
});
