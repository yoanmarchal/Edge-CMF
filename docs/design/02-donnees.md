# Design 02 — Modèle de données

Deux BDD D1 isolées (contenu / utilisateurs) + un bucket R2. Schémas Drizzle dans `apps/*/src/schema.ts`, migrations SQL brutes numérotées dans `apps/*/migrations/`.

## D1 `edge-cmf-content` (content-worker)

```
content_types (id PK machine, label, description, kind 'node'|'paragraph', created_at)
fields        (id PK uuid, content_type_id FK cascade, name, label, field_type,
               required, settings JSON, weight)
content_nodes (id PK uuid, title, slug UNIQUE, body, content_type, status bool,
               fields_json JSON, created_at, updated_at)
vocabularies  (id PK machine, label)
terms         (id PK uuid, vocabulary_id FK cascade, label, slug, parent_id nullable)
node_terms    (node_id FK cascade, term_id FK cascade, PK composite)
node_paragraphs (id PK uuid, node_id FK cascade, paragraph_type FK content_types,
                 fields_json JSON, weight)
site_settings (key PK, value)
```

Points de design :

- **Valeurs de champs en JSON** (`fields_json`) et non en colonnes : la modélisation est dynamique, le schéma SQL reste stable. L'intégrité est garantie par la validation Zod générée (`buildFieldValuesSchema`, `strict()`) au moment de l'écriture — jamais par SQLite.
- `content_nodes.content_type` n'est volontairement **pas** une FK SQL (souplesse de suppression/renommage de types) ; la cohérence est vérifiée applicativement.
- Timestamps en `integer { mode: 'timestamp' }`.
- `node_paragraphs.paragraph_type` référence `content_types.id` (types `kind='paragraph'`).

## D1 `edge-cmf-users` (auth-worker)

```
users (id PK uuid, email UNIQUE, password_hash "saltHex:hashHex" PBKDF2,
       role 'admin'|'editor'|'viewer', created_at)
```

Isolation volontaire : compromission du contenu ≠ accès aux credentials, et inversement.

## R2 `edge-cmf-media` (media-worker)

- L'objet R2 est la **source de vérité unique** : binaire + `customMetadata` (`alt`, nom d'origine) + `httpMetadata.contentType`. Aucune table D1 miroir → rien à synchroniser, la liste se fait par `list()` paginé par curseur.
- Clés = chemins avec `/` ; URL publique `/media/<clé>` (servie par le front, lecture seule).

## Migrations

- SQL brut, numéroté (`0000_…`, `0001_…`) ; appliquées par `wrangler d1 migrations apply <db> --local|--remote`.
- En local : `npm run db:migrate:local` → état persisté dans `.wrangler-state/`.
- Règle : additives de préférence ; toute migration part en prod **avant** le code qui en dépend (ordre CI).
- `drizzle.config.ts` sert au tooling ; on n'utilise pas `drizzle-kit generate` en CI — écrire le SQL à la main et tenir `schema.ts` synchrone (skill `d1-migration`).
