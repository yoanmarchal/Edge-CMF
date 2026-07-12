import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

/**
 * Table des nœuds de contenu (équivalent "node" d'un CMF classique).
 * Spécification exacte du cahier des charges v1 §4.1.
 */
export const contentNodes = sqliteTable('content_nodes', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  slug: text('slug').notNull().unique(),
  body: text('body').notNull(),
  contentType: text('content_type').notNull(), // Restreint à : 'page' | 'article' | 'product'
  status: integer('status', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

export type ContentNode = typeof contentNodes.$inferSelect;
export type NewContentNode = typeof contentNodes.$inferInsert;
