-- Index des requêtes de liste (constat P1-3 de l'audit du 26/07/2026).
--
-- Plans mesurés par EXPLAIN QUERY PLAN sur le schéma réel, avant / après.
--
-- AVANT
--   liste publique     : SCAN content_nodes + USE TEMP B-TREE FOR ORDER BY
--   filtre par terme   : SCAN node_terms
--
-- APRÈS
--   liste publique     : SEARCH ... USING INDEX content_nodes_status_created_idx
--   filtre par type    : SEARCH ... USING INDEX content_nodes_type_status_created_idx
--   filtre par terme   : SEARCH node_terms USING INDEX node_terms_term_idx
--   liste admin        : SCAN ... USING INDEX content_nodes_created_idx (parcours
--                        ordonné, arrêt au LIMIT — pas de tri temporaire)
--
-- D1 facture au `rows_read` : supprimer un scan complet est autant une
-- question de coût que de latence.

-- 1. Liste publique : `WHERE status = 1 ORDER BY created_at DESC LIMIT ?`.
--    L'index existant `(content_type, status)` avait `content_type` en colonne
--    de tête : inutilisable quand seul `status` est filtré, c'est-à-dire sur la
--    page d'accueil du site et sur /v1/nodes du gateway. Placer `created_at`
--    dans l'index supprime AUSSI le tri temporaire.
CREATE INDEX `content_nodes_status_created_idx` ON `content_nodes` (`status`,`created_at` DESC);
--> statement-breakpoint

-- 2. Remplace `content_nodes_type_status_idx` : mêmes colonnes de tête, plus
--    `created_at` pour servir le ORDER BY. Strictement supérieur à l'ancien,
--    donc aucun index net supplémentaire ici.
CREATE INDEX `content_nodes_type_status_created_idx` ON `content_nodes` (`content_type`,`status`,`created_at` DESC);
--> statement-breakpoint
DROP INDEX `content_nodes_type_status_idx`;
--> statement-breakpoint

-- 3. Liste du back-office (`all=1`, tous statuts confondus) : sans index, tout
--    l'espace de contenu était lu puis trié à chaque affichage de l'écran
--    principal de l'admin.
CREATE INDEX `content_nodes_created_idx` ON `content_nodes` (`created_at` DESC);
--> statement-breakpoint

-- 4. Filtre par terme de taxonomie. La clé primaire de `node_terms` est
--    (node_id, term_id) : une recherche par `term_id` seul ne peut pas
--    l'exploiter et parcourait toute la table de jonction.
CREATE INDEX `node_terms_term_idx` ON `node_terms` (`term_id`);
