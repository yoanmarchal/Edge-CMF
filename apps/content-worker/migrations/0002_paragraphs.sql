-- Paragraphs (composants structurés réutilisables, équivalent Paragraphs de Drupal)
ALTER TABLE `content_types` ADD COLUMN `kind` text DEFAULT 'node' NOT NULL;
--> statement-breakpoint
CREATE TABLE `node_paragraphs` (
	`id` text PRIMARY KEY NOT NULL,
	`node_id` text NOT NULL REFERENCES `content_nodes`(`id`) ON DELETE CASCADE,
	`paragraph_type` text NOT NULL REFERENCES `content_types`(`id`),
	`fields_json` text DEFAULT '{}' NOT NULL,
	`weight` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `node_paragraphs_node_idx` ON `node_paragraphs` (`node_id`,`weight`);
--> statement-breakpoint
-- Types de paragraphes de démarrage
INSERT INTO `content_types` (`id`,`label`,`description`,`kind`,`created_at`) VALUES
	('text_block','Bloc de texte','Simple bloc de texte riche','paragraph',strftime('%s','now')),
	('quote','Citation','Citation avec auteur','paragraph',strftime('%s','now'));
--> statement-breakpoint
INSERT INTO `fields` (`id`,`content_type_id`,`name`,`label`,`field_type`,`required`,`settings`,`weight`) VALUES
	('11111111-1111-4111-8111-111111111101','text_block','texte','Texte','textarea',1,'{}',0),
	('11111111-1111-4111-8111-111111111102','quote','citation','Citation','textarea',1,'{}',0),
	('11111111-1111-4111-8111-111111111103','quote','auteur','Auteur','text',0,'{}',1);
