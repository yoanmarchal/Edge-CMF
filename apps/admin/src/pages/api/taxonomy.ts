import { z } from 'zod';
import { insertVocabularySchema, insertTermSchema, machineNameSchema } from '@edge-cmf/shared-types';
import { contentClient, proxyResponse } from '../../lib/api';
import { mutation, mutations, read } from '../../lib/handler';

const uuid = z.string().uuid();

/** API JSON /api/taxonomy — vocabulaires + termes. Écriture : admin + editor. */
export const GET = read('session', async () =>
  proxyResponse(await contentClient().api.vocabularies.$get()),
);

export const POST = mutations('write', {
  'create-vocab': mutation(insertVocabularySchema, (input) =>
    contentClient().api.vocabularies.$post({ json: input }),
  ),

  'delete-vocab': mutation(z.object({ id: machineNameSchema }), ({ id }) =>
    contentClient().api.vocabularies[':id'].$delete({ param: { id } }),
  ),

  // `id` et `parentId` sont attribués ici : le formulaire ne les fournit pas
  // (la hiérarchie de termes n'est pas exposée dans l'UI pour l'instant).
  'create-term': mutation(insertTermSchema.omit({ id: true, parentId: true }), (input) =>
    contentClient().api.terms.$post({ json: { ...input, id: crypto.randomUUID(), parentId: null } }),
  ),

  'delete-term': mutation(z.object({ id: uuid }), ({ id }) =>
    contentClient().api.terms[':id'].$delete({ param: { id } }),
  ),
});
