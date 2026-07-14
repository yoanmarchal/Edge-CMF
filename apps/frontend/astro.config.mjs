// @ts-check
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import preact from '@astrojs/preact';

// Rendu SSR à l'Edge sur Cloudflare Pages (cahier v3 §2.1) pour le FRONT public.
// L'admin, elle, n'a pas besoin de SSR : ses pages sont des coquilles Astro
// (garde de session uniquement) qui montent des îlots Preact 100% client
// (client:only) consommant l'API JSON /api/admin/* — voir src/islands/.
export default defineConfig({
  output: 'server',
  integrations: [preact()],
  adapter: cloudflare({
    // Émule les bindings (Service Bindings, D1…) en dev local via wrangler
    platformProxy: { enabled: true },
    // sharp n'existe pas dans le runtime Workers : optimisation des images
    // au build uniquement (supprime sharp du bundle serveur)
    imageService: 'compile',
  }),
});
