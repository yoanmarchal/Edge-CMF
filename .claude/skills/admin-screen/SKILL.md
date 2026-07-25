---
name: admin-screen
description: Ajouter un écran ou une fonctionnalité à l'admin Edge CMF (apps/admin) selon le pattern page Astro + garde de session + îlot Preact client:only + proxy /api/*. Utiliser pour toute nouvelle page/section d'administration.
---

# Nouvel écran admin

## Pattern imposé (aucun SSR de données dans l'admin)

```
src/pages/<section>/index.astro   ← garde session + AdminShell (titre, description, fil d'Ariane) + <Island client:only="preact" />
src/islands/<Island>.tsx          ← UNIQUEMENT la zone de données : hooks + primitives
src/islands/lib/contract.ts       ← forme des données + appel nommé (jamais d'URL dans un îlot)
src/pages/api/<section>.ts        ← proxy déclaratif : read() / mutations()
```

## Étapes

1. **Contrat** — `src/islands/lib/contract.ts` : ajouter les types (DÉRIVÉS des
   lignes Drizzle du worker via `Serialized<T>`, jamais réécrits à la main) et
   une méthode par endpoint dans l'objet `api`. C'est le seul fichier où une
   URL `/api/…` est écrite.
2. **Proxy API** — `src/pages/api/<section>.ts` :
   ```ts
   export const GET = read('session', async ({ url }) => proxyResponse(await contentClient().api.x.$get()));
   export const POST = mutations('write', {
     create: mutation(insertXSchema, (input) => contentClient().api.x.$post({ json: input })),
   });
   ```
   Niveaux : `'session'` (tout compte connecté), `'write'` (admin + editor),
   `'admin'`. Ne jamais réintroduire de `if (action === …)` à la main.
3. **Îlot Preact** — `src/islands/<Name>.tsx` :
   ```ts
   const rows = useResource(() => api.x.list());
   const mutation = useMutation();
   ...
   <AsyncView resource={rows} empty="Aucun élément.">
     {(data) => <DataTable rows={data} rowKey={(r) => r.id} columns={[…]} />}
   </AsyncView>
   ```
   Pas de `useState` de chargement/erreur à la main, pas de `fetch`, pas de
   `try/catch` : `useMutation` gère confirmation, `busy`, erreur et redirection.
4. **Page Astro** — copier `src/pages/taxonomy/index.astro` : `getSessionUser`,
   redirection si `null`, puis `<AdminShell title=… description=… breadcrumb=…>`.
   **Le titre et le fil d'Ariane vivent ici, pas dans l'îlot.**
5. **Navigation** — ajouter l'entrée dans `src/layouts/AdminShell.astro`.

## Règles

- **Aucun `<h1>` dans un îlot** : les îlots sont `client:only`, la page
  resterait blanche jusqu'au démarrage du JS. `AdminShell` rend le titre en SSR.
- **Aucune URL `/api/…` hors de `contract.ts`** et aucun import de `adminApi`
  dans un îlot. Ces deux invariants se vérifient au `grep`.
- **Aucune interface de données déclarée dans un îlot** : elle vit dans
  `contract.ts`, dérivée du worker.
- `DataTable` exige `rowKey` : la clé de liste ne peut plus être oubliée.
- Le cookie `cmf_session` est httpOnly : les îlots ne voient jamais le JWT.
- RBAC : voir `docs/design/04-auth.md`. Le proxy est la seule barrière.
- Les erreurs des workers sont **propagées telles quelles** (statut + message).
  Ne pas les masquer derrière une chaîne générique.
- Après une mutation avec redirection, passer un code flash
  (`redirect: { to: '/x', flash: 'x-cree' }`) et le déclarer dans
  `src/lib/flash.ts`.
- Textes UI en français, format d'erreur `{ success: false, error }`.
- Zéro `any`.

## Vérification

`npm run typecheck` puis `npm run dev:admin` → http://localhost:4322 : tester en
admin, en editor (droits) et déconnecté (redirection login, 401 sur l'API).

Architecture détaillée et historique des décisions : `docs/design/05-ui.md`.
