import { z } from 'zod';
import { insertNodeSchema, updateNodeSchema } from '@edge-cmf/shared-types';
import { contentClient, proxyResponse } from '../../lib/api';
import { jsonError, mutation, mutations, read } from '../../lib/handler';

const uuid = z.string().uuid();

/**
 * API JSON /api/nodes — consommée par les îlots ContentList/ContentForm.
 * Proxy authentifié vers le content-worker (Service Binding, jamais exposé
 * directement au client). Lecture : tout compte connecté ; écriture :
 * admin + editor.
 */
export const GET = read('session', async ({ url }) => {
  const client = contentClient();

  const rawId = url.searchParams.get('id');
  if (rawId !== null) {
    const id = uuid.safeParse(rawId);
    if (!id.success) return jsonError('id invalide', 400);
    return proxyResponse(await client.api.node[':id'].$get({ param: { id: id.data } }));
  }

  // `all=1` : les brouillons sont visibles en back-office, jamais côté public.
  //
  // Seuls les paramètres de la liste blanche sont relayés. La boucle
  // précédente recopiait toute la query et ÉCRASAIT au passage les valeurs
  // posées juste au-dessus : n'importe quel client pouvait redéfinir `all` ou
  // `limit`, et pousser des clés arbitraires vers le worker. Le content-worker
  // revalide, donc pas d'exploitation directe — mais une politique décidée ici
  // ne doit pas être annulée par le paramètre qui la suit.
  const RELAYABLE = ['type', 'term', 'limit', 'offset'] as const;
  const query: Record<string, string> = { all: '1', limit: '100' };
  for (const key of RELAYABLE) {
    const value = url.searchParams.get(key);
    if (value !== null) query[key] = value;
  }
  return proxyResponse(await client.api.nodes.$get({ query }));
});

export const POST = mutations('write', {
  // L'identifiant est attribué ici : le formulaire ne le fournit pas.
  create: mutation(insertNodeSchema.omit({ id: true }), (input) =>
    contentClient().api.nodes.$post({ json: { ...input, id: crypto.randomUUID() } }),
  ),

  update: mutation(updateNodeSchema.extend({ id: uuid }), ({ id, ...changes }) =>
    contentClient().api.nodes[':id'].$put({ param: { id }, json: changes }),
  ),

  delete: mutation(z.object({ id: uuid }), ({ id }) =>
    contentClient().api.nodes[':id'].$delete({ param: { id } }),
  ),
});
