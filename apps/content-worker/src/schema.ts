import { sqliteTable, text, integer, primaryKey } from 'drizzle-orm/sqlite-core';

// ---------------------------------------------------------------------------
// Modélisation dynamique — équivalent "Content Types + Field UI" de Drupal
// ---------------------------------------------------------------------------

export const contentTypes = sqliteTable('content_types', {
  id: text('id').primaryKey(), // nom machine : 'page', 'article', 'hero_banner'…
  label: text('label').notNull(),
  description: text('description').notNull().default(''),
  kind: text('kind').notNull().default('node'), // 'node' | 'paragraph'
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

export const fields = sqliteTable('fields', {
  id: text('id').primaryKey(),
  contentTypeId: text('content_type_id')
    .notNull()
    .references(() => contentTypes.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  label: text('label').notNull(),
  fieldType: text('field_type').notNull(), // FieldType (validé par Zod)
  required: integer('required', { mode: 'boolean' }).notNull().default(false),
  settings: text('settings').notNull().default('{}'), // JSON FieldSettings
  weight: integer('weight').notNull().default(0),
});

// ---------------------------------------------------------------------------
// Nœuds de contenu
// ---------------------------------------------------------------------------

export const contentNodes = sqliteTable('content_nodes', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  slug: text('slug').notNull().unique(),
  body: text('body').notNull(),
  contentType: text('content_type').notNull(), // référence contentTypes.id
  status: integer('status', { mode: 'boolean' }).notNull().default(false),
  fieldsJson: text('fields_json').notNull().default('{}'), // valeurs des champs personnalisés
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

// ---------------------------------------------------------------------------
// Taxonomies — équivalent module Taxonomy
// ---------------------------------------------------------------------------

export const vocabularies = sqliteTable('vocabularies', {
  id: text('id').primaryKey(), // nom machine : 'tags', 'categories'…
  label: text('label').notNull(),
});

export const terms = sqliteTable('terms', {
  id: text('id').primaryKey(),
  vocabularyId: text('vocabulary_id')
    .notNull()
    .references(() => vocabularies.id, { onDelete: 'cascade' }),
  label: text('label').notNull(),
  slug: text('slug').notNull(),
  parentId: text('parent_id'),
});

export const nodeTerms = sqliteTable(
  'node_terms',
  {
    nodeId: text('node_id')
      .notNull()
      .references(() => contentNodes.id, { onDelete: 'cascade' }),
    termId: text('term_id')
      .notNull()
      .references(() => terms.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.nodeId, t.termId] })],
);

/**
 * Instances de paragraphes attachées aux nœuds (équivalent Paragraphs de Drupal).
 * Ordonnées par weight ; les valeurs de champs suivent la Field API du type.
 */
export const nodeParagraphs = sqliteTable('node_paragraphs', {
  id: text('id').primaryKey(),
  nodeId: text('node_id')
    .notNull()
    .references(() => contentNodes.id, { onDelete: 'cascade' }),
  paragraphType: text('paragraph_type')
    .notNull()
    .references(() => contentTypes.id),
  fieldsJson: text('fields_json').notNull().default('{}'),
  weight: integer('weight').notNull().default(0),
});

export type ContentNode = typeof contentNodes.$inferSelect;
export type NodeParagraphRow = typeof nodeParagraphs.$inferSelect;
export type NewContentNode = typeof contentNodes.$inferInsert;
export type ContentTypeRow = typeof contentTypes.$inferSelect;
export type FieldRow = typeof fields.$inferSelect;
export type VocabularyRow = typeof vocabularies.$inferSelect;
export type TermRow = typeof terms.$inferSelect;
