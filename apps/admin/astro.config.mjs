// @ts-check
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import preact from '@astrojs/preact';

// Admin — projet Cloudflare Pages distinct du front public (apps/frontend).
// Pas de SSR de contenu ici : chaque page ne fait qu'une garde de session
// (nécessairement serveur, cookie httpOnly) puis monte un îlot Preact
// client:only qui consomme /api/* (proxy JSON vers content-worker/auth-worker
// via Service Bindings). Voir src/islands/.
export default defineConfig({
  output: 'server',
  integrations: [preact()],
  adapter: cloudflare({
    platformProxy: { enabled: true },
    imageService: 'compile',
  }),
});
