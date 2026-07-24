// @ts-check
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';

// Rendu SSR à l'Edge sur Cloudflare Workers (cahier v3 §2.1) — site public
// uniquement. L'admin vit dans son propre projet (apps/admin), déployé
// séparément, avec son propre design system et ses propres îlots Preact.
//
// `astro dev` tourne désormais directement sur le runtime workerd réel (via
// le plugin Vite Cloudflare) : plus besoin de lancer content-worker dans un
// terminal séparé pour le dev local de cette app — `auxiliaryWorkers` le
// démarre automatiquement. Le binding lui-même reste déclaré dans
// wrangler.toml (les deux mécanismes sont complémentaires, pas redondants).
//
// `persistState` pointe vers le même dossier que les scripts `dev`/`db:migrate:local`
// des workers (`--persist-to ../../.wrangler-state`) : sans ça, chaque
// processus (front, admin, content-worker en standalone…) crée son propre
// état D1/KV local isolé et vide — les migrations appliquées côté
// content-worker restent invisibles du front.
export default defineConfig({
  output: 'server',
  adapter: cloudflare({
    // sharp n'existe pas dans le runtime Workers : optimisation des images
    // au build uniquement (supprime sharp du bundle serveur)
    imageService: 'compile',
    auxiliaryWorkers: [
      { configPath: '../content-worker/wrangler.toml' },
      { configPath: '../media-worker/wrangler.toml' },
    ],
    persistState: { path: '../../.wrangler-state' },
  }),
});
