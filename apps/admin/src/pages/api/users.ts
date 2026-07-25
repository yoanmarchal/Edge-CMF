import { z } from 'zod';
import { registerSchema, roleEnum } from '@edge-cmf/shared-types';
import { authClient, proxyResponse } from '../../lib/api';
import { bearer, mutation, mutations, read } from '../../lib/handler';

const uuid = z.string().uuid();

/**
 * API JSON /api/users — gestion des comptes (adminOnly de bout en bout).
 * L'auth-worker revérifie lui-même le rôle de l'appelant à partir du JWT :
 * d'où le header `Authorization` sur chaque appel.
 */
export const GET = read('admin', async ({ session }) =>
  proxyResponse(await authClient().users.$get(undefined, { headers: bearer(session) })),
);

export const POST = mutations('admin', {
  create: mutation(registerSchema, (input, { session }) =>
    authClient().register.$post({ json: input }, { headers: bearer(session) }),
  ),

  'set-role': mutation(z.object({ id: uuid, role: roleEnum }), ({ id, role }, { session }) =>
    authClient().users[':id'].role.$put(
      { param: { id }, json: { role } },
      { headers: bearer(session) },
    ),
  ),

  delete: mutation(z.object({ id: uuid }), ({ id }, { session }) =>
    authClient().users[':id'].$delete({ param: { id } }, { headers: bearer(session) }),
  ),
});
