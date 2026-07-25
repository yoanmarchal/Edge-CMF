# Spécification 01 — Fonctionnel (état implémenté)

Correspondance Drupal → Edge CMF. Chaque section décrit le comportement attendu tel qu'implémenté ; toute évolution doit maintenir ces invariants.

## 1. Modélisation de contenu dynamique (équivalent Content Types + Field UI)

- Un **content type** a un id machine (`^[a-z][a-z0-9_]*$`, max 64), un label, une description, et un `kind` : `node` (type de contenu à part entière) ou `paragraph` (composant réutilisable). Les deux partagent la même Field API.
- Un **champ** (`fields`) appartient à un type : nom machine, label, `fieldType`, `required`, `settings` (JSON), `weight` (ordre).
- Types de champs supportés : `text` (≤255), `textarea`, `richtext`, `number` (min/max), `boolean`, `date` (`YYYY-MM-DD`), `select` (options), `reference` (UUID de nœud, `targetType`), `media` (chemin `/media/<clé>`).
- `settings.multiple: true` = cardinalité multiple (tableau ; `min(1)` si requis).
- La validation des valeurs est **générée à la volée** par `buildFieldValuesSchema(defs)` (shared-types) : schéma Zod `strict()` — toute clé inconnue est rejetée.
- Formulaires admin générés dynamiquement à partir des définitions de champs (`FieldInput.tsx`).

## 2. Nœuds (équivalent Node system)

- Champs de base : `id` (UUID), `title` (3–255), `slug` (unique, `^[a-z0-9-]+$`), `body`, `contentType` (machine name), `status` (publié/non), `fields` (valeurs personnalisées), `termIds`, `paragraphs`.
- Liste filtrable : `?type=&term=&limit=(1-100, déf. 20)&offset=` ; `all=1` inclut les non-publiés (**admin uniquement, jamais exposé au gateway**).
- Lecture publique par slug ; lecture admin par id.

## 3. Paragraphes (équivalent Paragraphs)

- Instances ordonnées (`weight`) attachées à un nœud (`node_paragraphs`), chaque instance référence un type `kind='paragraph'` et porte ses valeurs de champs validées par la Field API du type.
- Éditeur par blocs dans l'admin (`ParagraphsEditor.tsx`) : ajout/retrait, validation par type.
- Deux types fournis par défaut : « Bloc de texte » et « Citation ».

## 4. Taxonomies (équivalent Taxonomy)

- `vocabularies` (id machine, label) → `terms` (UUID, label, slug, `parentId` hiérarchique nullable) → liaison `node_terms` (PK composite).
- Filtre de liste de nœuds par `?term=<uuid>`. Les réponses de nœuds embarquent les termes hydratés.

## 5. Utilisateurs & RBAC

- Rôles : `admin`, `editor`, `viewer`.
  - `admin` : tout, y compris gestion des utilisateurs et des types.
  - `editor` : création/modification de contenu (`canWrite`).
  - `viewer` : lecture seule.
- Auth : email + mot de passe (8–128), hash **PBKDF2** (`saltHex:hashHex`), **JWT** signé `JWT_SECRET`.
- Bootstrap du premier admin via `POST /register` protégé par header `x-setup-token` (`SETUP_TOKEN`).
- Session admin : cookie httpOnly `cmf_session`, validé à chaque requête auprès de l'auth-worker (`GET /validate`).

## 6. Médias

- Stockage **R2** (bucket `edge-cmf-media`) = source de vérité unique : binaire + métadonnées (`alt`, nom d'origine) en `customMetadata`. Zéro table D1 à synchroniser.
- MIME acceptés (familles) : image (jpeg/png/webp/avif/gif/svg), document (pdf), audio (mp3/ogg/wav), vidéo (mp4/webm). Taille max **50 Mo**.
- Bibliothèque paginée par curseur (limit 1–200, déf. 60) ; upload, remplacement, édition d'alt, suppression ; diffusion publique en lecture seule via le front `/media/*`.

## 7. Réglages du site

- Table clé/valeur `site_settings` (clé ≤64, valeur ≤256) — ex. thème actif, réglé depuis l'admin (« Apparence »), résolu côté serveur par le front.

## 8. API headless publique (gateway)

- Lecture seule, **contenu publié uniquement**, jamais de `all=1`.
- Routes : `GET /v1/nodes` (`type`, `term`, `limit`, `offset`), `/v1/nodes/:slug`, `/v1/types` (`?kind=`), `/v1/types/:id`, `/v1/vocabularies`.
- Clé API obligatoire (header `x-api-key`, stockée en KV `apikey:<clé>` → nom client) sauf `PUBLIC_API_OPEN = "1"` (dev/démo).
- Rate-limit natif Cloudflare : 100 req/60 s par clé. CORS activé. Cache edge partagé avec le content-worker (mêmes tags).

## 9. Format des réponses API

- Succès : `{ "data": ... }` — Erreur : `{ "success": false, "error": "<message>" }` avec code HTTP approprié (400/401/403/404/409/429).
