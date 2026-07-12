-- Migration initiale : table des nœuds de contenu (cahier v1 §4.1)
CREATE TABLE `content_nodes` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`slug` text NOT NULL,
	`body` text NOT NULL,
	`content_type` text NOT NULL,
	`status` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `content_nodes_slug_unique` ON `content_nodes` (`slug`);
--> statement-breakpoint
CREATE INDEX `content_nodes_type_status_idx` ON `content_nodes` (`content_type`,`status`);
