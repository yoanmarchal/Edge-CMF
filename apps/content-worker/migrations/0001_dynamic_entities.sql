-- Entités dynamiques + taxonomies (alternative Field UI / Taxonomy de Drupal)
CREATE TABLE `content_types` (
	`id` text PRIMARY KEY NOT NULL,
	`label` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `fields` (
	`id` text PRIMARY KEY NOT NULL,
	`content_type_id` text NOT NULL REFERENCES `content_types`(`id`) ON DELETE CASCADE,
	`name` text NOT NULL,
	`label` text NOT NULL,
	`field_type` text NOT NULL,
	`required` integer DEFAULT false NOT NULL,
	`settings` text DEFAULT '{}' NOT NULL,
	`weight` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `fields_type_name_unique` ON `fields` (`content_type_id`,`name`);
--> statement-breakpoint
ALTER TABLE `content_nodes` ADD COLUMN `fields_json` text DEFAULT '{}' NOT NULL;
--> statement-breakpoint
CREATE TABLE `vocabularies` (
	`id` text PRIMARY KEY NOT NULL,
	`label` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `terms` (
	`id` text PRIMARY KEY NOT NULL,
	`vocabulary_id` text NOT NULL REFERENCES `vocabularies`(`id`) ON DELETE CASCADE,
	`label` text NOT NULL,
	`slug` text NOT NULL,
	`parent_id` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `terms_vocab_slug_unique` ON `terms` (`vocabulary_id`,`slug`);
--> statement-breakpoint
CREATE TABLE `node_terms` (
	`node_id` text NOT NULL REFERENCES `content_nodes`(`id`) ON DELETE CASCADE,
	`term_id` text NOT NULL REFERENCES `terms`(`id`) ON DELETE CASCADE,
	PRIMARY KEY(`node_id`, `term_id`)
);
--> statement-breakpoint
INSERT INTO `content_types` (`id`,`label`,`description`,`created_at`) VALUES
	('page','Page','Page statique',strftime('%s','now')),
	('article','Article','Contenu éditorial daté',strftime('%s','now')),
	('product','Produit','Fiche produit',strftime('%s','now'));
--> statement-breakpoint
INSERT INTO `vocabularies` (`id`,`label`) VALUES ('tags','Étiquettes');
