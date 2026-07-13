import { z } from 'zod';

// ---------------------------------------------------------------------------
// Primitives communes
// ---------------------------------------------------------------------------

/** Nom machine à la Drupal : minuscules, chiffres, underscores */
export const machineNameSchema = z
  .string()
  .regex(/^[a-z][a-z0-9_]*$/)
  .max(64);

export const slugSchema = z.string().regex(/^[a-z0-9-]+$/);

export const slugParamSchema = z.object({ slug: slugSchema });
export const idParamSchema = z.object({ id: z.string().uuid() });
export const machineParamSchema = z.object({ id: machineNameSchema });

// ---------------------------------------------------------------------------
// Modélisation dynamique (équivalent "Content Types + Field UI" de Drupal)
// ---------------------------------------------------------------------------

export const fieldTypeEnum = z.enum([
  'text',
  'textarea',
  'richtext',
  'number',
  'boolean',
  'date',
  'select',
  'reference',
]);
export type FieldType = z.infer<typeof fieldTypeEnum>;

export const fieldSettingsSchema = z
  .object({
    /** Options pour fieldType 'select' */
    options: z.array(z.string().min(1)).optional(),
    /** Content type ciblé pour fieldType 'reference' */
    targetType: machineNameSchema.optional(),
    min: z.number().optional(),
    max: z.number().optional(),
  })
  .default({});
export type FieldSettings = z.infer<typeof fieldSettingsSchema>;

/**
 * Nature d'un bundle : 'node' = type de contenu à part entière (page, article…),
 * 'paragraph' = composant structuré réutilisable (équivalent Paragraphs de Drupal).
 * Les deux partagent la même Field API.
 */
export const typeKindEnum = z.enum(['node', 'paragraph']);
export type TypeKind = z.infer<typeof typeKindEnum>;

export const insertContentTypeSchema = z.object({
  /** Identifiant machine, ex. 'article', 'recipe', 'hero_banner' */
  id: machineNameSchema,
  label: z.string().min(1).max(255),
  description: z.string().max(1024).default(''),
  kind: typeKindEnum.default('node'),
});
export type InsertContentType = z.infer<typeof insertContentTypeSchema>;

export const listTypesQuerySchema = z.object({
  kind: typeKindEnum.optional(),
});

export const insertFieldSchema = z.object({
  id: z.string().uuid(),
  contentTypeId: machineNameSchema,
  name: machineNameSchema,
  label: z.string().min(1).max(255),
  fieldType: fieldTypeEnum,
  required: z.boolean().default(false),
  settings: fieldSettingsSchema,
  weight: z.number().int().default(0),
});
export type InsertField = z.infer<typeof insertFieldSchema>;

/** Définition de champ hydratée (settings déjà parsés) */
export interface FieldDef {
  readonly id: string;
  readonly contentTypeId: string;
  readonly name: string;
  readonly label: string;
  readonly fieldType: FieldType;
  readonly required: boolean;
  readonly settings: FieldSettings;
  readonly weight: number;
}

/**
 * Construit à la volée le schéma Zod des valeurs de champs personnalisés
 * d'un content type — c'est l'équivalent Edge de la validation Field API.
 */
export function buildFieldValuesSchema(
  defs: readonly FieldDef[],
): z.ZodType<Record<string, unknown>> {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const f of defs) {
    let s: z.ZodTypeAny;
    switch (f.fieldType) {
      case 'text':
        s = z.string().max(255);
        break;
      case 'textarea':
      case 'richtext':
        s = z.string();
        break;
      case 'number': {
        let n = z.number();
        if (f.settings.min !== undefined) n = n.min(f.settings.min);
        if (f.settings.max !== undefined) n = n.max(f.settings.max);
        s = n;
        break;
      }
      case 'boolean':
        s = z.boolean();
        break;
      case 'date':
        s = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
        break;
      case 'select': {
        const opts = f.settings.options;
        s =
          opts !== undefined && opts.length > 0
            ? z.enum(opts as [string, ...string[]])
            : z.string();
        break;
      }
      case 'reference':
        s = z.string().uuid();
        break;
    }
    shape[f.name] = f.required ? s : s.optional();
  }
  return z.object(shape).strict();
}

// ---------------------------------------------------------------------------
// Taxonomies (équivalent module Taxonomy de Drupal)
// ---------------------------------------------------------------------------

export const insertVocabularySchema = z.object({
  id: machineNameSchema,
  label: z.string().min(1).max(255),
});
export type InsertVocabulary = z.infer<typeof insertVocabularySchema>;

export const insertTermSchema = z.object({
  id: z.string().uuid(),
  vocabularyId: machineNameSchema,
  label: z.string().min(1).max(255),
  slug: slugSchema,
  parentId: z.string().uuid().nullable().default(null),
});
export type InsertTerm = z.infer<typeof insertTermSchema>;

// ---------------------------------------------------------------------------
// Nœuds de contenu
// ---------------------------------------------------------------------------

/** Instance de paragraphe attachée à un nœud (équivalent Paragraphs) */
export const insertParagraphSchema = z.object({
  /** Nom machine du type de paragraphe (content type de kind 'paragraph') */
  type: machineNameSchema,
  /** Valeurs des champs — validées dynamiquement selon le type */
  fields: z.record(z.string(), z.unknown()).default({}),
  weight: z.number().int().default(0),
});
export type InsertParagraph = z.infer<typeof insertParagraphSchema>;

export const insertNodeSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(3).max(255),
  slug: slugSchema,
  body: z.string().default(''),
  /** Nom machine du content type (dynamique, plus d'enum figé) */
  contentType: machineNameSchema,
  status: z.boolean().default(true),
  /** Valeurs des champs personnalisés — validées dynamiquement côté worker */
  fields: z.record(z.string(), z.unknown()).default({}),
  /** Termes de taxonomie associés */
  termIds: z.array(z.string().uuid()).default([]),
  /** Paragraphes ordonnés composant le contenu */
  paragraphs: z.array(insertParagraphSchema).default([]),
});
export type InsertNode = z.infer<typeof insertNodeSchema>;

export const updateNodeSchema = insertNodeSchema.omit({ id: true }).partial();
export type UpdateNode = z.infer<typeof updateNodeSchema>;

export const listNodesQuerySchema = z.object({
  type: machineNameSchema.optional(),
  term: z.string().uuid().optional(),
  /** '1' = inclure les non-publiés (admin uniquement, jamais exposé au gateway) */
  all: z.literal('1').optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});
export type ListNodesQuery = z.infer<typeof listNodesQuerySchema>;

// ---------------------------------------------------------------------------
// Authentification (Auth Service — RBAC + JWT)
// ---------------------------------------------------------------------------

export const roleEnum = z.enum(['admin', 'editor', 'viewer']);
export type Role = z.infer<typeof roleEnum>;

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const registerSchema = loginSchema.extend({
  role: roleEnum.default('viewer'),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const updateRoleSchema = z.object({ role: roleEnum });

/** Contexte utilisateur hydraté par le middleware JWT */
export interface UserContext {
  readonly sub: string;
  readonly email: string;
  readonly role: Role;
}

export const jwtPayloadSchema = z.object({
  sub: z.string().uuid(),
  email: z.string().email(),
  role: roleEnum,
  exp: z.number().int(),
  iat: z.number().int(),
});
export type JwtPayload = z.infer<typeof jwtPayloadSchema>;

// ---------------------------------------------------------------------------
// Enveloppes de réponse API communes
// ---------------------------------------------------------------------------

export interface ApiError {
  readonly success: false;
  readonly error: string;
}
