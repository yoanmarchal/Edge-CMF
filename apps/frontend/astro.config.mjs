// @ts-check
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';

// Rendu SSR à l'Edge sur Cloudflare Pages (cahier v3 §2.1)
export default defineConfig({
  output: 'server',
  adapter: cloudflare({
    // Émule les bindings (Service Bindings, D1…) en dev local via wrangler
    platformProxy: { enabled: true },
    // sharp n'existe pas dans le runtime Workers : optimisation des images
    // au build uniquement (supprime sharp du bundle serveur)
    imageService: 'compile',
  }),
});
