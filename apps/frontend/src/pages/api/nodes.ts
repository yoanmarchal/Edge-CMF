import type { APIRoute } from 'astro';

/** Ancien endpoint conservé pour compatibilité — redirige vers l'admin. */
export const POST: APIRoute = ({ url }) =>
  Response.redirect(new URL('/api/admin/nodes', url), 307);
