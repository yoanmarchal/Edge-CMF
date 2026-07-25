---
name: admin-screen
description: Ajouter un écran ou une fonctionnalité à l'admin Edge CMF (apps/admin) selon le pattern page Astro + garde de session + îlot Preact client:only + proxy /api/*. Utiliser pour toute nouvelle page/section d'administration.
---

# Nouvel écran admin

## Pattern imposé (aucun SSR de données dans l'admin)

```
src/pages/<section>/index.astro   ← garde session + AdminShell + <Island client:only="preact" />
src/islands/<Island>.tsx          ← toute la logique/données, via fetch /api/*
src/pages/api/<section>.ts        ← proxy JSON : requireApiSession() puis RPC worker
```

## Étapes

1. **Proxy API** — `src/pages/api/<section>.ts` : exporter `GET`/`POST`/… ; commencer par `const s = await requireApiSession(cookies, { writeOnly: true })` (ou `adminOnly: true` pour types/users/settings) et `if (s instanceof Response) return s;` puis relayer vers le worker via `contentClient()`/`authClient()`/`mediaClient()` (`src/lib/api.ts`).
2. **Îlot Preact** — `src/islands/<Name>.tsx` : hooks Preact, appels via `src/islands/lib/adminApi.ts`, composants UI communs dans `src/islands/lib/ui.tsx`. Pas d'accès direct aux bindings ici (code client).
3. **Page Astro** — copier la structure d'une page existante (ex. `src/pages/taxonomy/index.astro`) : `getSessionUser`, redirection login si null, layout `AdminShell`, montage de l'îlot en `client:only="preact"`.
4. **Navigation** — ajouter l'entrée dans `src/layouts/AdminShell.astro`.

## Règles

- Le cookie `cmf_session` est httpOnly : les îlots ne voient jamais le JWT, tout passe par le proxy same-origin.
- RBAC : `writeOnly` = admin+editor ; `adminOnly` = admin seul (voir `docs/design/04-auth.md`).
- Textes UI en français, format d'erreur `{ success: false, error }`.
- Zéro `any` ; typer les réponses avec les types de `@edge-cmf/shared-types`.

## Vérification

`npm run typecheck` puis `npm run dev:admin` (ou `npm run dev`) → http://localhost:4322 : tester en admin, en editor (droits), et déconnecté (redirection login, 401 sur l'API).
