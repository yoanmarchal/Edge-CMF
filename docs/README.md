# Documentation Edge CMF

Fichiers pensés pour être lus par l'IA (et les humains) avant toute modification.

## Specs — *quoi* (comportement attendu)

- [00-cahier-des-charges-v3.md](specs/00-cahier-des-charges-v3.md) — synthèse du PDF de référence + écarts assumés
- [01-functionnel.md](specs/01-functionnel.md) — fonctionnalités implémentées (types dynamiques, nœuds, paragraphes, taxonomies, RBAC, médias, gateway)
- [02-api.md](specs/02-api.md) — les 3 surfaces d'API (workers internes, gateway public, proxy admin)

## Design — *comment* (décisions et invariants)

- [01-architecture.md](design/01-architecture.md) — topologie, Service Bindings, décisions structurantes, ordre de déploiement
- [02-donnees.md](design/02-donnees.md) — schémas D1, R2, règles de migration
- [03-cache.md](design/03-cache.md) — cache tags versionnés, page cache ETag/304
- [04-auth.md](design/04-auth.md) — JWT/PBKDF2, session admin, RBAC, invariants de sécurité

## Skills — *workflows* (`.claude/skills/`)

`add-field-type` (nouveau type de champ de bout en bout), `add-worker-route` (nouvelle route API), `d1-migration` (changement de schéma), `admin-screen` (nouvel écran admin), `new-worker` (nouveau micro-service).

Instructions générales : [`CLAUDE.md`](../CLAUDE.md) à la racine.
