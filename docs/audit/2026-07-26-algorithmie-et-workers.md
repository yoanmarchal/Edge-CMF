# Audit — algorithmie & best practices Cloudflare Workers

**Date** : 26 juillet 2026
**Périmètre** : tout le monorepo (6 workspaces + migrations + CI)

> ## État d'avancement — lot 1 appliqué le 26/07/2026
>
> | Constat | État | Où |
> |---|---|---|
> | P0-1 découpage sous la limite de 100 paramètres D1 | ✅ corrigé | `content-worker/src/batch.ts` (nouveau) + `index.ts` |
> | P0-2 atomicité des écritures composées (`db.batch`) | ✅ corrigé | `content-worker/src/index.ts` |
> | P0-3 `Cache-Control: public` sur réponses authentifiées | ✅ corrigé | `content-worker/src/index.ts`, `admin/src/lib/api.ts`, `admin/.../media/file/[...key].ts` |
> | P0-4 rate limiting sur `/login` | ✅ corrigé | `auth-worker/src/index.ts` + `wrangler.toml` |
> | P0-5 KV `API_KEYS` + garde-fou CI | ⚠️ **action requise** | `--dry-run` ajouté en CI ; **le namespace reste à créer** (voir ci-dessous) |
> | P0-6 streaming des uploads | 🟡 partiel | double bufferisation supprimée ; `parseBody()` bufferise encore une fois (documenté sur place) |
> | P1-5 oracle temporel d'énumération | ✅ corrigé | `auth-worker/src/crypto.ts` (`burnPasswordTime`) |
> | P1-6 bootstrap à usage unique + temps constant | ✅ corrigé | `auth-worker/src/crypto.ts` (`constantTimeEquals`) + `index.ts` |
> | P1-9 contrôle `node_paragraphs` à la suppression d'un type | ✅ corrigé | `content-worker/src/index.ts` |
> | P1-8 messages d'erreur génériques + réf. de corrélation | ✅ corrigé | `packages/shared-types/src/errors.ts` (nouveau) + les 4 workers |
> | Observabilité (Workers Logs) | ✅ corrigé | `[observability]` dans les 6 `wrangler.toml` |
> | Échecs silencieux (`waitUntil`, `catch {}`) | ✅ corrigé | content, media, gateway, `frontend/src/lib/api.ts`, `FieldValue.astro` |
> | Harnais de test `vitest-pool-workers` | ⚠️ **non exécuté** | `apps/content-worker/vitest.config.ts` + `test/` — voir avertissement |
> | P1-3 index des requêtes de liste | ✅ corrigé | `migrations/0004_indexes_listes.sql` — plans mesurés |
> | P1-1 N+1 de sous-requêtes média | ✅ atténué | `frontend/src/lib/media-versions.ts` — voir la note sur l'option écartée |
> | P1-12 cache de page granulaire | ✅ corrigé | `frontend/src/middleware.ts` |
> | P2-1 streaming SSR + écriture non bloquante | ✅ corrigé | `frontend/src/middleware.ts` |
> | P2-2 ETag identique pour toutes les pages | ✅ corrigé | `frontend/src/middleware.ts` |
> | P2-3 `cache.put` et `Set-Cookie` | ✅ corrigé | `frontend/src/middleware.ts` |
> | P1-2 collision de version des tags | ✅ corrigé | `content-worker/src/cache.ts`, `media-worker` |
> | P1-2 limite d'écriture KV (Durable Object) | ❌ **écarté** | voir « Deux refus argumentés » |
> | D1 read replication (`withSession`) | ❌ **écarté** | idem |
> | P1-11 CORS du gateway (préflight, en-têtes sur les 4xx) | ✅ corrigé | `gateway-worker/src/index.ts` |
> | P1-10 rate limiting avant la lecture KV | ✅ corrigé | `gateway-worker/src/index.ts` |
> | P1-7 révocation des JWT | ✅ corrigé | `auth-worker/src/index.ts` — `/validate` relit le rôle en base |
> | P2-4 schémas Zod mémoïsés + requêtes groupées | ✅ corrigé | `content-worker/src/index.ts` |
> | P2-5 `/api/stats` en 2 requêtes agrégées | ✅ corrigé | `content-worker/src/index.ts` |
> | P2-8 entropie des clés média (32 → 64 bits) | ✅ corrigé | `media-worker/src/index.ts` |
> | P2-9 Range HTTP (416, suffixe, bornes) | ✅ corrigé | `media-worker` — **13 cas testés et vérifiés** |
> | P2-10 suppression média idempotente | ✅ corrigé | `media-worker/src/index.ts` |
> | P2-12 liste blanche des paramètres relayés | ✅ corrigé | `admin/src/pages/api/nodes.ts` |
> | P2-14 bornes des champs texte (limite 2 Mo D1) | ✅ corrigé | `packages/shared-types/src/index.ts` |
> | En-têtes de sécurité du HTML public | ✅ ajouté | `frontend/src/middleware.ts` |
> | P2-6 pagination par curseur, P2-13, P2-15, P3 restants | ⏳ non entamés | voir §5 et §7 |
>
> ### Deux actions manuelles restantes
>
> **1. Namespace KV du gateway (P0-5).** Le déploiement du gateway échouera
> tant que ce n'est pas fait :
>
> ```bash
> npx wrangler kv namespace create API_KEYS   # puis reporter l'id dans apps/gateway-worker/wrangler.toml
> ```
>
> **2. Première exécution de la suite de tests.** Les dépendances ont été
> déclarées dans le `package.json` racine mais l'installation n'a pas pu être
> menée à son terme dans l'environnement où le lot 2 a été écrit, et **workerd
> n'y démarrait pas** : la suite n'a donc **jamais été exécutée**.
>
> ```bash
> npm install
> npm test
> ```
>
> Ce qui **a** été vérifié : les fichiers de test compilent sous
> `tsc --noEmit -p apps/content-worker/test/tsconfig.json` (imports résolus,
> `exports.default.fetch()` correctement typé, formes de réponses conformes),
> et l'API de `@cloudflare/vitest-pool-workers@0.18.8` a été lue directement
> dans les déclarations installées plutôt que dans la documentation — laquelle
> indique encore `readD1Migrations` sous `/config`, export qui n'existe plus
> dans cette version.
>
> Ce qui **n'a pas** été vérifié : que les tests passent. Attendez-vous à des
> ajustements au premier lancement, en particulier sur `test/cache-headers.spec.ts`,
> dont les assertions dépendent du comportement de la Cache API sous Miniflare.
> Il est isolé dans son propre fichier pour cette raison.
>
> **Exception — `apps/media-worker/test/range.spec.ts`.** Son sujet
> (`parseRange`) est de la logique pure : les 13 cas ont été exécutés
> directement et passent tous, y compris ceux qui produisaient une 500 avant
> correction (`bytes=-200`, `bytes=1500-1600`, `bytes=300-200`). Seule
> l'enveloppe vitest reste non lancée.
>
> ### Deux refus argumentés
>
> **Durable Object pour les versions de tags (P1-2).** C'est le bon correctif :
> écritures sérialisées, cohérence forte, pas de plafond d'une écriture par
> seconde. Mais il ajoute un binding et une classe de migration, et il touche
> le mécanisme le plus porteur de l'application — l'invalidation de cache
> partagée par trois workers et les deux apps Astro. Une erreur ne se
> manifesterait pas par une exception mais par du contenu périmé servi en
> silence, exactement le symptôme qu'on cherche à supprimer. Le déployer sans
> pouvoir l'exécuter serait déraisonnable. Ce qui a été fait à la place :
> l'échec d'écriture est désormais journalisé (il était totalement muet) et la
> collision de versions due à l'horloge figée est corrigée. Le plafond KV, lui,
> demeure.
>
> **Read replication D1 (`withSession`).** Vérifié dans les déclarations
> installées : `drizzle()` accepte `AnyD1Database = D1Database | MiniflareD1Database`,
> et **pas** `D1DatabaseSession`, qui n'expose ni `exec()` ni `dump()`. Le
> branchement fonctionnerait au runtime — la session a bien `prepare()` et
> `batch()` — mais exigerait un cast structurel, ce que la règle « zéro `any` »
> du projet cherche précisément à éviter. S'y ajoute la propagation du bookmark
> `x-d1-bookmark` à travers le gateway, le front et l'admin pour préserver la
> cohérence séquentielle : c'est une modification du contrat RPC, pas un
> réglage. Reste le levier de latence le plus important du projet, mais il
> mérite sa propre itération, testée.
>
> Le reste du document décrit l'état **avant** correction et reste la référence
> pour les lots suivants.

Les limites Cloudflare citées ont été vérifiées le jour de l'audit contre la
documentation officielle (voir « Sources » en fin de document). Chaque constat
porte une référence `fichier:ligne` vérifiable.

---

## 1. Synthèse

| Sévérité | Nombre | Nature |
|---|---|---|
| **P0 — bloquant** | 6 | Casse en production sous charge ou volume réalistes, ou fuite de données |
| **P1 — élevé** | 12 | Dégradation forte, faille exploitable, ou plafond plateforme atteint |
| **P2 — moyen** | 15 | Coût, latence, correction fonctionnelle partielle |
| **P3 — hygiène** | 13 | Outillage, observabilité, configuration plateforme |

**Ce qui est solide.** L'architecture micro-workers + Service Bindings est bien
posée : les workers internes n'exposent aucune route, le typage RPC par
`hono/client` est correct, la validation Zod est systématique aux frontières,
le `tsconfig` est strict (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`
— au-delà du minimum), l'invalidation par tags versionnés est une bonne idée
correctement granularisée **côté content-worker**, et le mécanisme d'ETag R2 du
media-worker est propre. Les regroupements en mémoire de `/api/types?expand=fields`
et `/api/vocabularies` montrent qu'on a déjà chassé les N+1 SQL évidents.

**Le fil rouge des problèmes.** Trois familles reviennent partout :

1. **Les limites dures de la plateforme ne sont jamais prises en compte.**
   100 paramètres liés par requête D1, 1 écriture KV par seconde et par clé,
   128 Mo de mémoire par isolat, 6 connexions simultanées, 50 sous-requêtes sur
   le plan Free. Le code est écrit comme s'il tournait sur un serveur Node.
2. **L'absence de transaction n'est jamais compensée.** D1 n'a pas de
   transaction interactive ; `db.batch()` est la seule primitive atomique, et
   elle n'est utilisée nulle part. Toutes les écritures composées sont donc
   non atomiques *et* multiplient les allers-retours.
3. **Les erreurs sont invisibles.** Aucun `[observability]`, aucun test, des
   `catch {}` silencieux et des `waitUntil` dont l'échec ne remonte nulle part.

---

## 2. P0 — Bloquants

### P0-1 · Limite D1 de 100 paramètres liés : trois insertions en lot cassent en production

D1 impose **100 paramètres liés maximum par requête**. Drizzle génère un
`INSERT … VALUES (?,?),(?,?),…` : le nombre de paramètres est
`lignes × colonnes`.

| Emplacement | Colonnes/ligne | Plafond réel |
|---|---|---|
| `apps/content-worker/src/index.ts:119` (`replaceNodeTerms`) | 2 | **50 termes** par nœud |
| `apps/content-worker/src/index.ts:183-191` (`replaceNodeParagraphs`) | 5 | **20 paragraphes** par nœud |
| `apps/content-worker/src/index.ts:399-404` (`DELETE /api/vocabularies/:id`) | 1 | **100 termes** dans le vocabulaire |

Un article de 25 blocs, ou la suppression d'un vocabulaire « Étiquettes » qui a
grossi au-delà de 100 termes, échoue avec une erreur D1 brute. Le troisième cas
est le plus vicieux : il survient à la suppression, donc au pire moment.

**Correctif** : découper en lots (`chunk(rows, Math.floor(100 / colonnes))`) et
enchaîner les morceaux dans un unique `db.batch([...])`, qui s'exécute dans une
transaction implicite. Pour le cas `DELETE`, remplacer le `inArray` par une
sous-requête SQL (`WHERE term_id IN (SELECT id FROM terms WHERE vocabulary_id = ?)`)
— zéro paramètre variable, et une requête au lieu de deux.

### P0-2 · Aucune atomicité sur la création / mise à jour d'un nœud

`apps/content-worker/src/index.ts:539-559` (POST) et `:594-616` (PUT) enchaînent
jusqu'à **cinq requêtes D1 séquentielles** sans transaction :

```
INSERT node → DELETE node_terms → INSERT node_terms → DELETE node_paragraphs → INSERT node_paragraphs
```

Un échec au troisième pas (voir P0-1, très atteignable) laisse un nœud publié
avec ses **anciens termes supprimés et aucun nouveau**, et ses paragraphes
intacts alors qu'ils auraient dû être remplacés. Le `catch` de la ligne 557 ne
compense rien : il n'y a rien à annuler.

Coût annexe : cinq allers-retours vers une base mono-région, sur le chemin
d'écriture le plus fréquent de l'application.

**Correctif** : `db.batch([...])` regroupe tout en une transaction implicite et
un aller-retour. La validation (types, Field API, paragraphes) reste en amont ;
seules les écritures entrent dans le batch.

### P0-3 · `Cache-Control: public` sur les réponses authentifiées de l'admin

Le middleware de cache du content-worker pose `public, s-maxage=60` sur la
**copie stockée** (`index.ts:225`) — correct sur un MISS. Mais sur un **HIT**
(`index.ts:213-217`), la réponse renvoyée *est* la copie stockée, en-têtes
compris. Puis `apps/admin/src/lib/api.ts:52-54` (`proxyResponse`) recopie
intégralement les en-têtes amont vers le navigateur.

Conséquence : la réponse de `GET /api/nodes?all=1` — **qui contient les
brouillons non publiés** — arrive au navigateur admin marquée
`Cache-Control: public`, donc stockable par n'importe quel intermédiaire
partagé. Le comportement diffère selon MISS/HIT, ce qui rend le problème
intermittent et difficile à reproduire.

**Correctif** :
1. Ne poser `Cache-Control` que sur `toStore`, et le retirer explicitement de
   `c.res` sur le chemin HIT.
2. Défense en profondeur : forcer `Cache-Control: private, no-store` dans le
   `proxyResponse` de l'admin — aucune réponse authentifiée ne doit être
   cachable, quoi que dise l'amont.

### P0-4 · Aucune limitation de débit sur l'authentification

`apps/auth-worker/src/index.ts:90` (`POST /login`) et
`apps/admin/src/pages/api/login.ts` : ni binding de rate limiting, ni compteur
d'échecs, ni verrouillage, ni délai progressif. L'auth-worker n'a d'ailleurs
aucun binding `RL` dans son `wrangler.toml`.

L'admin est exposé publiquement. Un attaquant peut essayer des mots de passe à
la vitesse que le PBKDF2 autorise, indéfiniment. C'est la voie d'entrée la plus
courte vers un compte `admin`.

**Correctif** : `[[ratelimits]]` sur l'auth-worker, clé composite
`login:<email>` **et** `login-ip:<cf-connecting-ip>`, ~5 tentatives / 60 s.
Attention : le rate limiting Workers est **local à un POP** — c'est un
ralentisseur, pas une garantie globale. Le compléter par un compteur d'échecs
persistant par compte.

### P0-5 · Le namespace KV `API_KEYS` du gateway n'a pas d'identifiant

`apps/gateway-worker/wrangler.toml` :

```toml
[[kv_namespaces]]
binding = "API_KEYS"
id = "REMPLACER_PAR_ID_KV_API_KEYS"
```

L'étape « Deploy gateway-worker » de `.github/workflows/deploy.yml` échoue —
après que les migrations D1 et trois autres workers ont déjà été déployés.
Le pipeline n'a ni `--dry-run` préalable, ni étape de rollback : on se retrouve
avec un déploiement partiel en production.

**Correctif** : créer le namespace, renseigner l'ID, et ajouter en tête de job
un `wrangler deploy --dry-run` sur les six workers — ça coûte trente secondes
et attrape toute la classe des erreurs de configuration.

### P0-6 · Bufferisation intégrale des médias contre 128 Mo d'isolat

La limite mémoire est de **128 Mo par isolat**, partagée par toutes les
requêtes concurrentes servies par cet isolat. Un upload de 50 Mo
(`MEDIA_MAX_BYTES`, `packages/shared-types/src/index.ts:291`) est mis en mémoire
**deux fois** :

| Emplacement | Opération |
|---|---|
| `apps/admin/src/pages/api/media.ts:62` | `body: await request.arrayBuffer()` — 50 Mo dans l'isolat admin |
| `apps/media-worker/src/index.ts:119` | `await c.req.parseBody()` — reparse le multipart complet |
| `apps/media-worker/src/index.ts:135` | `await file.arrayBuffer()` — 50 Mo de plus |
| `apps/media-worker/src/index.ts:252` | `await obj.arrayBuffer()` — **réécrit l'objet entier pour changer un texte alternatif** |

Deux uploads simultanés de 40 Mo suffisent à déclencher `Exceeded Memory` ou
l'erreur runtime `Memory limit would be exceeded before EOF`. Le cas du PATCH
alt est le plus absurde : télécharger 50 Mo depuis R2 puis les réécrire pour
modifier une chaîne de 40 caractères.

**Correctif** :
- Admin → media-worker : `body: request.body` avec `duplex: 'half'`, sans
  jamais matérialiser le corps.
- Media-worker : `MEDIA.put(key, file.stream())` au lieu de `arrayBuffer()`.
- Texte alternatif : le sortir de `customMetadata` R2 pour le mettre en D1 ou
  KV, indexé par clé R2. Le champ éditable n'a rien à faire dans le même
  objet que le binaire. À défaut, streamer `obj.body` directement dans le
  `put` (copie sans matérialisation).

---

## 3. P1 — Élevé

### P1-1 · N+1 de sous-requêtes au rendu des champs média

`apps/frontend/src/components/FieldValue.astro:42-50` déclenche **un
`MEDIA_WORKER.fetch` par valeur média** pour ne récupérer qu'un horodatage
`uploaded` et fabriquer l'URL versionnée `?v=`.

Une page à 30 images = 30 sous-requêtes. Deux plafonds sont en jeu :

- **50 sous-requêtes par invocation sur le plan Free** (10 000 en Paid) — une
  galerie fait purement tomber la page en Free ;
- **6 connexions simultanées**, et la documentation précise que les workers
  appelés par Service Binding **partagent le quota du worker de tête**. Le
  `Promise.all` de la ligne 42 est donc sérialisé par paquets de 6, en
  concurrence avec les lectures KV du middleware et les appels au
  content-worker.

**Correctif** : figer la version au moment de l'écriture. Quand l'admin
enregistre un nœud, stocker `/media/<clé>?v=<uploaded>` (ou un hash) directement
dans `fields_json`. Le rendu redevient un pur formatage, zéro sous-requête.
Variante moins invasive : une route `POST /api/media/items` qui résout un lot de
clés en un appel.

### P1-2 · `bumpTags` écrit sur une clé KV fixe — 1 écriture par seconde

`apps/content-worker/src/cache.ts:23-26` et `apps/media-worker/src/index.ts:26`
écrivent toujours sur les **mêmes clés** (`cache-tag:content`, `cache-tag:media`…).
La limite documentée est de **1 écriture par seconde et par clé, sur le plan
Free comme sur le plan Paid**.

Un import de contenu, un enregistrement en rafale, une suppression en masse ou
simplement deux éditeurs qui publient en même temps dépassent la limite. Comme
l'écriture est dans un `waitUntil` sans `catch`, **l'échec est silencieux** :
l'invalidation est perdue, le site sert du contenu périmé, et rien ne le
signale.

Aggravant : `Date.now()` est figé dans un Worker jusqu'au prochain I/O. Deux
mutations traitées dans la même invocation produisent la même version — donc le
tag « avance » sans changer de valeur.

**Correctif** : à court terme, `${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`
pour garantir l'unicité, et un `.catch(e => console.error(…))` sur le `put`
pour rendre l'échec visible. À moyen terme, déplacer le compteur de versions
vers un Durable Object (écritures sérialisées, cohérence forte, pas de limite
d'écriture par seconde) — c'est le substrat prévu pour ce type de compteur.

### P1-3 · Index manquants sur les deux requêtes de liste les plus chaudes

**a) Liste des nœuds publiés** — `apps/content-worker/src/index.ts:464-470` produit
`WHERE status = 1 ORDER BY created_at DESC LIMIT ? OFFSET ?`.
Le seul index disponible est `content_nodes_type_status_idx (content_type, status)`
(`migrations/0000_init_content_nodes.sql`). Sa **colonne de tête est `content_type`** :
il est inutilisable quand seul `status` est filtré — c'est-à-dire sur la page
d'accueil du site public et sur `/v1/nodes` du gateway. Résultat : scan complet
de `content_nodes` + tri en mémoire, à chaque MISS de cache.

**b) Filtre par terme de taxonomie** — `index.ts:459` produit
`WHERE id IN (SELECT node_id FROM node_terms WHERE term_id = ?)`.
La clé primaire de `node_terms` est `(node_id, term_id)` : une recherche par
`term_id` seul ne peut pas l'exploiter → scan complet de la table de jonction.

**Correctif** (nouvelle migration) :

```sql
CREATE INDEX content_nodes_status_created_idx ON content_nodes(status, created_at DESC);
CREATE INDEX node_terms_term_idx ON node_terms(term_id);
```

À valider par `EXPLAIN QUERY PLAN` avant/après — D1 facture au `rows_read`,
le gain est aussi financier.

### P1-4 · Deux jointures quadratiques en mémoire

- `index.ts:373-376` (`GET /api/vocabularies`) : `allTerms.filter(...)` **à
  l'intérieur** de `vocabs.map(...)` → O(V × T). Pire, le `SELECT` de la ligne
  372 charge **toute la table `terms` sans limite** : la taxonomie entière est
  lue, désérialisée et sérialisée à chaque appel.
- `index.ts:258-261` (`GET /api/types?expand=fields`) : `defs.filter(...)` dans
  `types.map(...)` → O(T × F).

Le commentaire de la ligne 247 revendique justement d'avoir évité le N+1 SQL —
c'est vrai, mais le regroupement en mémoire qui le remplace est quadratique.

**Correctif** : regroupement par `Map` en O(n), et un plafond explicite sur le
nombre de termes retournés (ou une pagination, comme les médias en ont déjà une).

### P1-5 · `/login` : oracle temporel d'énumération des comptes

`apps/auth-worker/src/index.ts:94-97` : si l'e-mail n'existe pas, la fonction
retourne **sans exécuter PBKDF2**. Or `derive()` fait 100 000 itérations
(`crypto.ts:7`), soit plusieurs dizaines de millisecondes de CPU. L'écart de
temps entre « compte inconnu » et « mot de passe faux » est massif et
trivialement mesurable : on énumère les e-mails valides du back-office.

**Correctif** : quand l'utilisateur est absent, dériver quand même contre un
hash factice constant avant de répondre.

### P1-6 · Le jeton de bootstrap ne s'auto-désactive jamais

`apps/auth-worker/src/index.ts:52-56` :

- `setupToken === c.env.SETUP_TOKEN` — comparaison de chaînes **non constante
  en temps** ;
- surtout, aucune vérification que la table `users` est vide. Le jeton reste
  valable **pour toujours**, bien après la création du premier admin. Un secret
  destiné à un usage unique devient une porte permanente vers la création de
  comptes administrateurs.

**Correctif** : n'accepter la voie bootstrap que si `SELECT COUNT(*) FROM users`
vaut 0, et comparer le jeton à temps constant (la fonction de comparaison existe
déjà dans `crypto.ts:49-54`, il suffit de l'extraire).

### P1-7 · Les JWT ne sont jamais révocables

TTL de 8 h (`auth-worker/src/index.ts:23`), aucune liste de révocation, aucune
version de jeton. `PUT /users/:id/role` (`:141`) et `DELETE /users/:id` (`:169`)
n'ont **aucun effet sur les sessions en cours** : un compte supprimé ou
rétrogradé conserve tous ses droits jusqu'à 8 heures.

L'ironie : `apps/admin/src/lib/session.ts:15` appelle déjà l'auth-worker **à
chaque requête**. Le coût réseau d'une vérification en base est donc déjà payé —
mais `/validate` (`auth-worker:118-124`) se contente de vérifier la signature
sans jamais consulter la table `users`.

**Correctif** : dans `/validate`, relire l'utilisateur en base (existence + rôle
courant) et renvoyer le rôle de la base, pas celui du jeton. Une requête D1
indexée sur la clé primaire, pour une révocation immédiate.

### P1-8 · Fuite d'informations internes par `onError`

Les quatre workers exposent le message d'erreur brut :

- `content-worker/src/index.ts:667` et `:558` (`(error as Error).message`)
- `auth-worker/src/index.ts:186`
- `gateway-worker/src/index.ts:181`
- `media-worker/src/index.ts:281`

Un message SQLite (nom de table, contrainte violée, fragment de requête) remonte
jusqu'au client — y compris au client **public** via le gateway, qui repropage
tel quel. Combiné à P1-9 ci-dessous, une contrainte de clé étrangère devient une
carte du schéma.

**Correctif** : message générique côté client, `console.error` structuré côté
serveur avec un identifiant de corrélation renvoyé au client. Ce qui suppose
d'activer Workers Logs (voir P3).

### P1-9 · Suppression d'un type : contrôle incomplet, et deux stratégies contradictoires

`DELETE /api/types/:id` (`content-worker/src/index.ts:311-334`) vérifie que
`content_nodes` ne référence plus le type, mais **pas `node_paragraphs`**, dont
la clé étrangère `paragraph_type` (`migrations/0002_paragraphs.sql`) n'a pas de
clause `ON DELETE`. Supprimer un type de paragraphe encore instancié lève une
erreur de contrainte → **500 avec un message SQLite** (cf. P1-8) au lieu du 409
« Des contenus utilisent encore ce type » qui existe déjà juste au-dessus.

Symétriquement, `DELETE /api/nodes/:id` (`:621-633`) supprime `node_terms`
**à la main** mais laisse `node_paragraphs` à la cascade FK. Deux stratégies
opposées dans la même fonction, ce qui rend le comportement réel dépendant de
l'application effective des contraintes FK par D1 — un détail qui ne devrait
pas être implicite.

**Correctif** : choisir une stratégie (cascade déclarative de préférence, elle
est déjà dans les migrations) et l'appliquer partout ; ajouter le contrôle
`node_paragraphs` dans la suppression de type.

### P1-10 · Gateway : le KV est interrogé avant toute limitation de débit

`apps/gateway-worker/src/index.ts:60` fait une lecture KV pour valider la clé
API, **puis** le middleware de rate limiting s'exécute (`:71-80`). Une clé
invalide déclenche donc une lecture KV facturée à chaque requête, sans aucun
plafond, sur un worker exposé en `workers_dev = true`.

C'est une amplification de coût triviale à exploiter : quelques milliers de
requêtes par seconde avec une clé bidon, aucune n'est comptabilisée par le
limiteur.

**Correctif** : inverser l'ordre. Un premier `limit()` large sur
`cf-connecting-ip` (ou une règle WAF de zone) avant la validation de clé, puis
le limiteur fin par clé API une fois celle-ci reconnue.

### P1-11 · Gateway : le CORS ne fonctionne pas depuis un navigateur

`passthrough()` (`gateway-worker/src/index.ts:41-45`) pose
`Access-Control-Allow-Origin: *` — mais uniquement sur les réponses de succès.
Il manque :

- tout handler `OPTIONS` (préflight) ;
- `Access-Control-Allow-Headers: x-api-key` ;
- les en-têtes CORS sur les réponses 401 / 403 / 429 émises par les middlewares.

Or `x-api-key` est un en-tête « non simple » : **tout appel cross-origin depuis
un navigateur déclenche un préflight, qui échoue**. Une API REST headless
« pour apps mobiles, autres front-ends, intégrations tierces » (commentaire du
`wrangler.toml`) n'est donc pas consommable depuis un navigateur.

**Correctif** : middleware `cors()` de Hono monté avant tout le reste, avec
`allowHeaders: ['x-api-key']` et `maxAge`.

### P1-12 · Le cache de page du front annule la granularité du back

`apps/frontend/src/middleware.ts:18` fait entrer **les cinq tags** dans la
signature de **toutes** les pages. Modifier le texte alternatif d'un média
(tag `media`) purge donc l'intégralité du site, y compris les pages qui
n'affichent aucun média.

Tout le travail de granularité du content-worker (`cache.ts:39-48`,
`tagsForRead` par famille) est annulé au dernier étage. Sur un site éditorial
actif, le taux de succès du cache de pages s'effondre.

**Correctif** : composer la signature à partir des tags réellement utilisés par
la route (`/` et `/[slug]` dépendent de `content`, `taxonomy`, `settings`,
`media` ; une page de liste par type dépend en plus de `types`). La signature
étant déjà calculée dans le middleware, il suffit d'y injecter le pathname.

---

## 4. P2 — Moyen

### P2-1 · Le front bufferise tout le HTML et attend l'écriture du cache

`apps/frontend/src/middleware.ts:71` : `const html = await res.text()` détruit
le streaming SSR d'Astro — le premier octet ne part qu'une fois la page
entièrement rendue. Ligne 75, `await cache.put(...)` est **attendu** avant de
répondre : le TTFB inclut aussi l'écriture dans le cache edge.

**Correctif** : `res.clone()` pour la copie à stocker, `ctx.waitUntil(cache.put(...))`
pour ne pas bloquer, et laisser le flux original passer intact.

### P2-2 · ETag identique pour toutes les pages

`middleware.ts:45` : `W/"<signature globale>"`. Le navigateur indexe par URL,
donc ça fonctionne en pratique, mais tout intermédiaire qui déduplique par ETag
se trompera, et `Vary` est absent. Ajouter le pathname à l'ETag ne coûte rien
et supprime toute la classe de problème.

### P2-3 · `cache.put` non protégé contre `Set-Cookie`

`middleware.ts:72-75` recopie **tous** les en-têtes de la réponse SSR. La Cache
API refuse (par exception) une réponse portant `Set-Cookie`. Le front est
anonyme aujourd'hui ; le jour où une route pose un cookie, on obtient une 500
non gérée dans le middleware, sur toutes les pages. Filtrer `Set-Cookie` ou
entourer d'un `try`.

### P2-4 · `validateParagraphs` : requêtes en série et schémas Zod reconstruits

`content-worker/src/index.ts:148-174` :

- boucle `for … await` : une requête D1 par type de paragraphe distinct, **en
  série** ;
- `buildFieldValuesSchema(defs)` est appelé **à chaque itération** (ligne 167),
  y compris quand le type est déjà dans `defsCache`. Sur 30 paragraphes du même
  type, c'est 30 constructions de schéma Zod pour rien — du CPU pur, sur le
  chemin d'écriture.

**Correctif** : collecter les types distincts en amont, une seule requête
`inArray`, et mémoïser le **schéma compilé** et non seulement les `defs`.

### P2-5 · `/api/stats` : quatre requêtes là où une suffit

`content-worker/src/index.ts:270-275`. Le `Promise.all` donne l'illusion du
parallélisme, mais **une base D1 est mono-thread et traite les requêtes une à
une** : les quatre `COUNT` sont sérialisés côté base, et consomment quatre
sous-requêtes. Un seul `SELECT COUNT(*) …, SUM(CASE WHEN status THEN 1 END) …`
par table suffit (deux requêtes au total, agrégeables en une avec un `UNION ALL`).

### P2-6 · Pagination par `OFFSET`

`content-worker/src/index.ts:470`, `packages/shared-types/src/index.ts:220-221`.
`OFFSET n` fait parcourir puis jeter n lignes — et D1 facture au `rows_read`.
Acceptable à quelques milliers de nœuds, coûteux au-delà. Le media-worker fait
déjà de la pagination par curseur (`media-worker:100-115`) : le motif est
disponible dans le projet, autant l'appliquer aux nœuds.

### P2-7 · `s-maxage=60` bride inutilement le taux de succès du cache

`content-worker/src/index.ts:225`, `gateway-worker/src/index.ts:116`. La clé de
cache contient déjà la signature des tags : une entrée devient inatteignable dès
qu'un tag avance. Le TTL de 60 s ne protège de rien et force une revalidation
complète toutes les minutes même quand rien n'a changé. Une valeur longue
(`s-maxage=31536000`) est cohérente avec un cache versionné par clé.

### P2-8 · `buildKey` : 32 bits d'entropie et écrasement silencieux

`media-worker/src/index.ts:59` : `crypto.randomUUID().slice(0, 8)`. Deux
fichiers au même nom slugifié dans le même mois entrent en collision avec une
probabilité non négligeable (paradoxe des anniversaires : ~50 % vers 77 000
fichiers pour un même préfixe). Une collision fait un `R2.put` sur une clé
existante — **l'ancien fichier est écrasé sans le moindre signal**, et tous les
contenus qui le référençaient affichent désormais autre chose.

**Correctif** : 16 caractères hexadécimaux, ou un `head()` préalable, ou un
`put` conditionnel.

### P2-9 · Range HTTP incomplet

`media-worker/src/index.ts:266-275` (`parseRange`) ne gère que
`bytes=<début>-<fin?>`. Manquent :

- le 416 quand `offset >= meta.size` (R2 lève, on tombe dans le `onError` → 500) ;
- le suffix-range `bytes=-500` (dernier N octets), utilisé par plusieurs
  lecteurs vidéo ;
- `If-Range`, ignoré : une revalidation conditionnelle peut renvoyer un
  fragment d'une version différente du fichier ;
- le multi-range (acceptable de ne pas le gérer, mais il faudrait alors répondre
  200 avec le corps complet plutôt que de mal interpréter l'en-tête).

### P2-10 · `DELETE /api/media/:key` répond toujours « succès »

`media-worker/src/index.ts:256-259` : `R2.delete` ne dit pas si l'objet
existait. L'admin affiche « supprimé » pour une clé inexistante ou mal saisie.
Faire un `head()` d'abord, ou assumer et documenter l'idempotence.

### P2-11 · SVG uploadables et servis en ligne sur l'origine publique

`image/svg+xml` est dans la liste blanche (`shared-types:280`) et servi via
`/media/*` du front public, donc **sur la même origine que le site**. Les
garde-fous existent et sont bien vus (`media-worker:82-91` : `nosniff` + CSP
`default-src 'none'`), mais un SVG ouvert directement reste un document capable
de porter du script.

**Correctif** : au choix — servir les médias depuis un domaine distinct,
forcer `Content-Disposition: attachment` sur `image/svg+xml`, ou assainir le
SVG à l'upload.

### P2-12 · Recopie non filtrée de la query dans le proxy admin

`apps/admin/src/pages/api/nodes.ts:25-27` :

```ts
const query: Record<string, string> = { all: '1', limit: '100' };
for (const [key, value] of url.searchParams) query[key] = value;
```

La boucle **écrase** les valeurs par défaut posées juste au-dessus avec des
valeurs client arbitraires, et transmet n'importe quelle clé au worker. Le
content-worker revalide via Zod, donc pas d'exploitation directe — mais toute
politique décidée côté admin (« l'admin voit les brouillons », « plafond de
100 ») devient un simple défaut contournable. Passer par une liste blanche
explicite.

### P2-13 · Une validation d'auth par requête d'îlot

`apps/admin/src/lib/session.ts:15` : chaque appel `/api/*` déclenche un
aller-retour vers l'auth-worker. Une page qui monte trois îlots Preact fait
trois validations du même cookie. C'est le prix à payer si l'on corrige P1-7
(vérification en base) — mais on peut alors mutualiser : mettre le résultat en
cache quelques secondes par jeton, ou valider en une fois côté page et propager
le contexte utilisateur aux îlots.

### P2-14 · `fields_json` sans borne face à la limite de 2 Mo par ligne D1

`content_nodes.fields_json` et `node_paragraphs.fields_json` agrègent tous les
champs personnalisés, dont les `richtext` déclarés `z.string()` **sans `.max()`**
(`shared-types:120-122`). D1 refuse toute ligne dépassant 2 000 000 octets. Un
éditeur qui colle un document volumineux obtient une erreur brute au moment de
l'enregistrement, après avoir tout saisi.

**Correctif** : borne explicite côté Zod (par exemple 256 Ko par champ
`richtext`), avec un message clair.

### P2-15 · Le contenu `richtext` n'est jamais rendu comme du HTML

`apps/frontend/src/components/FieldValue.astro:62` rend tout via
`String(item)` dans un `<span>`, donc échappé. C'est **sûr** — aucune XSS — mais
cela signifie qu'un champ `richtext` (`shared-types:23-33`) s'affiche avec ses
balises visibles. Soit le type est fonctionnellement inutilisable, soit il faut
un rendu HTML assaini. À trancher explicitement plutôt que de le laisser dans
cet entre-deux.

---

## 5. P3 — Hygiène, outillage, configuration plateforme

### Tests et déploiement

- **Aucun test dans le monorepo.** Ni `vitest`, ni `@cloudflare/vitest-pool-workers`
  (qui exécute les tests dans workerd, avec de vrais bindings D1/KV/R2). La CI
  fait `tsc --noEmit` puis déploie en production. Entre un `git push` sur `main`
  et le site public, il n'y a **aucune barrière fonctionnelle**. Les six P0 de
  ce rapport auraient pour la plupart été attrapés par une poignée de tests
  d'intégration (créer un nœud à 25 paragraphes, supprimer un vocabulaire à
  150 termes, uploader un fichier de 40 Mo).
- **Pas d'environnement de pré-production.** Une seule cible, `main` →
  production. Pas de `wrangler versions upload` + déploiement progressif, pas de
  procédure de rollback documentée.
- **Migrations D1 sans sauvegarde préalable.** Le workflow applique les
  migrations avant le déploiement (bon ordre), mais sans `wrangler d1 export`
  ni mention de Time Travel (rétention 30 jours en Paid). Une migration
  malheureuse n'a pas de plan de retour écrit.
- Le `concurrency: cancel-in-progress: false` est en revanche bien vu : il évite
  d'interrompre une migration en cours.

### Observabilité

- **Aucun `[observability] enabled = true`** dans les six `wrangler.toml` →
  Workers Logs désactivé. Or le code repose sur des chemins muets par
  construction : le `waitUntil` de `bumpTags` (P1-2), le `catch {}` de
  `getActiveTheme` (`frontend/src/lib/api.ts:36`), le `catch` de `versionedUrl`
  (`FieldValue.astro:32`), le `catch` de `extractUser` (`auth-worker:37`). Ces
  échecs se produisent **silencieusement** en production.
- Aucun point de mesure sur le taux de succès des caches, alors que
  `X-Edge-Cache` / `x-page-cache` sont déjà posés — il ne manque que la collecte
  (Analytics Engine, ou simplement les logs).

### Configuration Workers

- **`[[unsafe.bindings]]` est obsolète** (`gateway-worker/wrangler.toml`). La
  configuration stable du rate limiting est `[[ratelimits]]` depuis
  wrangler 4.36 ; le projet épingle 4.114. Migrer, et supprimer par la même
  occasion l'interface `RateLimitBinding` réécrite à la main
  (`gateway-worker/src/index.ts:9-11`).
- **Le rate limiting est local à un POP.** Le commentaire du `wrangler.toml`
  (« 100 req / 60s par clé API ») laisse croire à une limite globale ; c'est
  100 requêtes **par centre de données Cloudflare**. À reformuler pour ne pas
  induire en erreur le jour où quelqu'un dimensionnera dessus.
- **`workers_dev = true` sur le gateway** : l'API publique est joignable sur
  `*.workers.dev`, donc hors zone — pas de WAF, pas de règles de cache de zone,
  pas d'analytics de zone. Basculer sur un domaine personnalisé.
- **ID de namespace KV codé en dur et dupliqué** dans quatre configurations
  (`a8b2d2ae…`). Aucun mécanisme d'environnement : le jour où l'un diverge, le
  cache s'invalide à moitié, en silence. Utiliser `[env.production]` /
  `[env.staging]`.
- **`compatibility_date = "2025-06-01"`** sur les six workers, soit ~14 mois de
  retard. Les dates de compatibilité corrigent des comportements du runtime ;
  les laisser figer indéfiniment est une dette qui se paie d'un coup.
- **`wrangler types` non utilisé.** Le projet dépend de
  `@cloudflare/workers-types@^4.20250101.0` — antérieur à la date de
  compatibilité déclarée. La pratique actuelle est de générer
  `worker-configuration.d.ts` avec `wrangler types`, qui type **les bindings
  réellement déclarés**. Cela aurait évité deux contorsions :
  `as unknown as R2ListOptions` (`media-worker:109`, pour `include`) et
  l'interface `RateLimitBinding` manuelle — deux endroits où le « zéro `any` »
  est respecté à la lettre mais contourné dans l'esprit.
- **`[placement] mode = "smart"` absent.** Toute la lecture passe par D1, qui
  est mono-région. L'admin fait plusieurs allers-retours par requête (session +
  content + media) : c'est le profil type où le placement intelligent est
  rentable.
- **`[limits] cpu_ms` non configuré** alors que `derive()` fait 100 000
  itérations PBKDF2 par tentative de connexion. À mesurer : sur le plan Free
  (10 ms de CPU), c'est probablement déjà hors budget.

### Le levier de performance non exploité

**D1 read replication.** Une base D1 vit dans une seule région ; chaque lecture
depuis un POP éloigné paie le RTT. La réplication en lecture (`withSession()` +
bookmarks, cohérence séquentielle garantie) est disponible, **sans surcoût de
stockage ni de calcul** — la facturation reste au `rows_read`/`rows_written`.

Pour un CMS à dominante lecture déployé « 100 % Edge », c'est le levier de
latence le plus important du projet, et il est aujourd'hui inutilisé. Le
content-worker est le candidat évident : ses lectures tolèrent parfaitement la
cohérence séquentielle, et ses écritures continueraient d'aller vers la
primaire.

### Sécurité de surface

- Aucun en-tête de sécurité sur le HTML public : pas de CSP, pas de
  `Referrer-Policy`, pas de `frame-ancestors`, pas de HSTS
  (`frontend/src/layouts/Base.astro`, `frontend/src/middleware.ts`).
- Les clés API du gateway sont stockées **en clair comme nom de clé KV**
  (`apikey:<clé>`, `gateway-worker/src/index.ts:60`). Stocker le SHA-256 de la
  clé plutôt que la clé elle-même : le listing du namespace ne suffirait plus à
  usurper un consommateur.

### Documentation

`docs/design/03-cache.md:30` documente correctement la cohérence éventuelle de
KV (~60 s inter-POP) — bon point. En revanche, **la limite d'une écriture par
seconde et par clé n'y figure nulle part**, alors que c'est elle qui casse
réellement le modèle (P1-2). À ajouter, avec la conclusion qui s'impose sur le
choix du substrat.

---

## 6. Correspondance limites plateforme ↔ code

| Limite Cloudflare | Valeur | Où le code la heurte |
|---|---|---|
| Paramètres liés par requête D1 | **100** | P0-1 (3 emplacements) |
| Transactions interactives D1 | **inexistantes** (`batch()` seulement) | P0-2 |
| Écritures KV sur une même clé | **1/seconde** (Free et Paid) | P1-2 |
| Mémoire par isolat | **128 Mo** | P0-6 |
| Sous-requêtes par invocation | 50 (Free) / 10 000 (Paid) | P1-1 |
| Connexions simultanées | **6**, partagées avec les Service Bindings | P1-1 |
| Taille max d'une ligne D1 | **2 Mo** | P2-14 |
| Appels Cache API par requête | 50 (Free) / 1 000 (Paid), sur le même quota que les sous-requêtes | P1-1 |
| CPU par requête | 10 ms (Free) / 30 s par défaut (Paid) | PBKDF2 100k, P3 |
| Concurrence D1 | mono-thread par base, mise en file puis erreur « overloaded » | P2-5 |

---

## 7. Plan d'action proposé

**Lot 1 — arrêter l'hémorragie (avant tout autre développement)**

1. P0-1 + P0-2 ensemble : réécrire les écritures composées en `db.batch()`
   avec découpage en lots. Une seule modification traite les deux.
2. P0-3 : `Cache-Control` sur `toStore` uniquement, `private, no-store` forcé
   dans `proxyResponse`.
3. P0-5 : créer le namespace KV, ajouter `--dry-run` en CI.
4. P0-6 : streaming des uploads de bout en bout.
5. P0-4 + P1-5 + P1-6 : le paquet « authentification » — rate limiting, hash
   factice, bootstrap à usage unique.

**Lot 2 — rendre le système observable et testable**

6. `[observability] enabled = true` partout, `catch` explicites sur les
   `waitUntil`.
7. `@cloudflare/vitest-pool-workers` + tests d'intégration sur les six scénarios
   P0.
8. P1-8 : messages d'erreur génériques + journalisation corrélée (dépend de 6).

**Lot 3 — performance**

9. P1-3 : migration d'index (mesurer avec `EXPLAIN QUERY PLAN`).
10. P1-1 : figer la version des médias à l'écriture.
11. P1-12 + P2-1 : cache de page granulaire et non bloquant.
12. P1-2 : versions de tags sur Durable Object.
13. D1 read replication (`withSession`) sur le content-worker.

**Lot 4 — le reste**, par ordre de gêne constatée.

---

## Sources

- [Workers — Limits](https://developers.cloudflare.com/workers/platform/limits/)
- [Workers KV — Limits](https://developers.cloudflare.com/kv/platform/limits/)
- [D1 — Limits](https://developers.cloudflare.com/d1/platform/limits/)
- [D1 — Global read replication](https://developers.cloudflare.com/d1/best-practices/read-replication/)
- [Workers — Rate Limiting binding](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/)
