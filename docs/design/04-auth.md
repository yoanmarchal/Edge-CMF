# Design 04 — Authentification & RBAC

## Chaîne de confiance

```
Navigateur admin ──cookie httpOnly `cmf_session` (JWT)──▶ apps/admin (Astro)
    └─ pages /api/* : requireApiSession() ──Bearer──▶ auth-worker GET /validate
                                                └──▶ { sub, email, role }
```

- Le JWT n'est **jamais** exposé au JavaScript client : cookie httpOnly posé par `/api/login`, effacé par `/api/logout`. Les îlots Preact appellent `/api/*` en `same-origin`, le serveur admin relaie avec `Authorization: Bearer`.
- `auth-worker` est le seul à connaître `JWT_SECRET` (HMAC). Payload validé par `jwtPayloadSchema` (sub UUID, email, role, iat/exp).
- Mots de passe : **PBKDF2** (WebCrypto, `apps/auth-worker/src/crypto.ts`), stockage `saltHex:hashHex`. Pas de bcrypt/argon2 : indisponibles nativement dans workerd.

## RBAC

| Capacité | admin | editor | viewer |
|---|---|---|---|
| Lire l'admin | ✔ | ✔ | ✔ |
| Créer/modifier contenu, taxo, médias (`canWrite`) | ✔ | ✔ | ✖ |
| Types & champs, utilisateurs, réglages (`adminOnly`) | ✔ | ✖ | ✖ |

L'application des droits se fait dans les **pages proxy `/api/*` de l'admin** (`requireApiSession(cookies, { adminOnly?, writeOnly? })` → 401/403) et dans l'auth-worker pour ses propres routes. Les workers internes, eux, font confiance à leurs appelants (topologie fermée — voir design 01).

## Bootstrap

Premier admin créé par `POST /register` avec header `x-setup-token` = secret `SETUP_TOKEN` (`.dev.vars` en local, `wrangler secret put` en prod). Ensuite `/register` exige un JWT admin.

## Surfaces publiques et leurs gardes

- **frontend** : aucune session, contenu publié uniquement (jamais `all=1`).
- **gateway** : clé API en KV (`apikey:<clé>` → nom client), header `x-api-key`, rate-limit 100/60 s par clé ; lecture seule par construction (seules des routes GET proxifiées existent).
- **admin** : session ci-dessus ; le paramètre `all=1` du content-worker n'est atteignable que par ce chemin.

## Invariants à préserver

1. Ne jamais ajouter de SSR de données dans l'admin ni de binding AUTH au front public.
2. Ne jamais renvoyer `passwordHash` dans une réponse ; ne jamais logger de token.
3. Toute nouvelle route mutation côté admin passe par `requireApiSession` avec le bon flag.
4. Secrets uniquement via `wrangler secret` / `.dev.vars` (jamais commités — `.dev.vars.example` sert de gabarit).
