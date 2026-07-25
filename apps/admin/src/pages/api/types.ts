import { z } from 'zod';
import {
  insertContentTypeSchema,
  insertFieldSchema,
  machineNameSchema,
  fieldTypeEnum,
  typeKindEnum,
  type FieldSettings,
} from '@edge-cmf/shared-types';
import { contentClient, proxyResponse } from '../../lib/api';
import { jsonError, mutation, mutations, read } from '../../lib/handler';

/** API JSON /api/types — types de contenu + Field UI. Écriture : admin seul. */
export const GET = read('session', async ({ url }) => {
  const client = contentClient();

  const rawId = url.searchParams.get('id');
  if (rawId !== null) {
    const id = machineNameSchema.safeParse(rawId);
    if (!id.success) return jsonError('id invalide', 400);
    return proxyResponse(await client.api.types[':id'].$get({ param: { id: id.data } }));
  }

  const kind = typeKindEnum.safeParse(url.searchParams.get('kind') ?? undefined);
  const expand = url.searchParams.get('expand') === 'fields';
  // `?expand=fields` joint la Field API de chaque type à la liste, ce qui
  // évite au formulaire de contenu un appel par type de paragraphe.
  const query = {
    ...(kind.success ? { kind: kind.data } : {}),
    ...(expand ? { expand: 'fields' as const } : {}),
  };
  return proxyResponse(await client.api.types.$get({ query }));
});

/**
 * Saisie de la Field UI → `InsertField`. Le formulaire envoie les options en
 * une chaîne séparée par des virgules et la cardinalité en booléen à plat ;
 * la normalisation vers `settings` se fait ici, dans le schéma.
 */
const createFieldInput = z
  .object({
    contentTypeId: machineNameSchema,
    name: machineNameSchema,
    label: z.string().min(1).max(255),
    fieldType: fieldTypeEnum,
    options: z.string().default(''),
    required: z.boolean().default(false),
    multiple: z.boolean().default(false),
    weight: z.coerce.number().int().default(0),
  })
  .transform((raw) => {
    const options = raw.options
      .split(',')
      .map((o) => o.trim())
      .filter((o) => o.length > 0);
    const settings: FieldSettings = {};
    if (raw.fieldType === 'select' && options.length > 0) settings.options = options;
    if (raw.multiple) settings.multiple = true;
    return insertFieldSchema.parse({
      id: crypto.randomUUID(),
      contentTypeId: raw.contentTypeId,
      name: raw.name,
      label: raw.label,
      fieldType: raw.fieldType,
      required: raw.required,
      settings,
      weight: raw.weight,
    });
  });

export const POST = mutations('admin', {
  'create-type': mutation(insertContentTypeSchema, (input) =>
    contentClient().api.types.$post({ json: input }),
  ),

  'delete-type': mutation(z.object({ id: machineNameSchema }), ({ id }) =>
    contentClient().api.types[':id'].$delete({ param: { id } }),
  ),

  'create-field': mutation(createFieldInput, (input) =>
    contentClient().api.fields.$post({ json: input }),
  ),

  'delete-field': mutation(z.object({ id: z.string().uuid() }), ({ id }) =>
    contentClient().api.fields[':id'].$delete({ param: { id } }),
  ),
});
