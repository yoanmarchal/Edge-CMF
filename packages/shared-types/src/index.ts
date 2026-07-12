import { z } from 'zod';

// ---------------------------------------------------------------------------
// Contrats de contenu (équivalent "Content Types" d'un CMF classique)
// Cahier des charges v1 §4.2 — validation stricte, zéro `any`
// ---------------------------------------------------------------------------

export const contentTypeEnum = z.enum(['page', 'article', 'product']);
export type ContentType = z.infer<typeof contentTypeEnum>;

export const insertNodeSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(3).max(255),
  slug: z.string().regex(/^[a-z0-9-]+$/),
  body: z.string(),
  contentType: contentTypeEnum,
  status: z.boolean().default(true),
});
export type InsertNode = z.infer<typeof insertNodeSchema>;

export const updateNodeSchema = insertNodeSchema
  .omit({ id: true })
  .partial();
export type UpdateNode = z.infer<typeof updateNodeSchema>;

export const listNodesQuerySchema = z.object({
  type: contentTypeEnum.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});
export type ListNodesQuery = z.infer<typeof listNodesQuerySchema>;

export const slugParamSchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]+$/),
});

export const idParamSchema = z.object({
  id: z.string().uuid(),
});

// ---------------------------------------------------------------------------
// Contrats d'authentification (Auth Service — RBAC + JWT)
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

/** Contexte utilisateur hydraté par le middleware JWT (cahier des charges v1 §3.2) */
export interface UserContext {
  readonly sub: string;
  readonly email: string;
  readonly role: Role;
}

/** Payload JWT signé par l'Auth Service */
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
