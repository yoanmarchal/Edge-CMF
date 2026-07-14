-- Réglages du site (clé/valeur) — sert au thème actif du front, extensible
-- à d'autres réglages globaux sans nouvelle migration.
CREATE TABLE `site_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
INSERT INTO `site_settings` (`key`, `value`) VALUES ('active_theme', 'base');
