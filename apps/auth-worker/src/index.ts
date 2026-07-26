import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { sign, verify } from 'hono/jwt';
import { drizzle } from 'drizzle-orm/d1';
import { asc, count, eq } from 'drizzle-orm';
import {
  loginSchema,
  registerSchema,
  jwtPayloadSchema,
  idParamSchema,
  updateRoleSchema,
  roleEnum,
  reportServerError,
  serverErrorMessage,
  type UserContext,
} from '@edge-cmf/shared-types';
import { users } from './schema';
import { burnPasswordTime, constantTimeEquals, hashPassword, verifyPassword } from './crypto';

/** Binding natif Cloudflare de rate limiting (voir `[[ratelimits]]`). */
interface RateLimitBinding {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

type Bindings = {
  DB: D1Database;
  JWT_SECRET: string;
  SETUP_TOKEN: string;
  /** Optionnel : absent en dev local sans configuration de rate limiting. */
  LOGIN_RL?: RateLimitBinding;
};

const TOKEN_TTL_SECONDS = 60 * 60 * 8; // 8 heures

const app = new Hono<{ Bindings: Bindings }>();

/**
 * Freine les tentatives d'authentification sur deux axes : le compte visé et
 * l'origine réseau. Le premier protège un compte précis d'un bruteforce ciblé,
 * le second empêche le balayage de nombreux comptes depuis une même source.
 *
 * ATTENTION : le rate limiting Workers est LOCAL À UN POP Cloudflare. C'est un
 * ralentisseur sérieux, pas une garantie globale — un attaquant distribué
 * multiplie la limite par le nombre de POP qu'il atteint. À compléter par un
 * compteur d'échecs persistant par compte si le modèle de menace l'exige.
 */
async function loginAllowed(
  limiter: RateLimitBinding | undefined,
  email: string,
  ip: string,
): Promise<boolean> {
  if (limiter === undefined) return true;
  const [byAccount, bySource] = await Promise.all([
    limiter.limit({ key: `login:${email}` }),
    limiter.limit({ key: `login-ip:${ip}` }),
  ]);
  return byAccount.success && bySource.success;
}

async function extractUser(
  authorization: string | undefined,
  secret: string,
): Promise<UserContext | null> {
  if (authorization === undefined || !authorization.startsWith('Bearer ')) return null;
  try {
    const payload = await verify(authorization.slice(7), secret, 'HS256');
    const parsed = jwtPayloadSchema.parse(payload);
    return { sub: parsed.sub, email: parsed.email, role: parsed.role };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Routes chaînées : exportées pour le client RPC (hono/client)
// ---------------------------------------------------------------------------
const routes = app
  /**
   * Création d'utilisateur.
   * Autorisée si : JWT admin valide, OU jeton de bootstrap (x-setup-token)
   * pour créer le tout premier compte admin.
   */
  .post('/register', zValidator('json', registerSchema), async (c) => {
    const caller = await extractUser(c.req.header('Authorization'), c.env.JWT_SECRET);
    const { email, password, role } = c.req.valid('json');
    const db = drizzle(c.env.DB);

    if (caller?.role !== 'admin') {
      // Voie de bootstrap. Deux durcissements par rapport à la version
      // précédente :
      //
      // 1. Comparaison à temps constant du jeton (un `===` sur un secret
      //    s'arrête au premier octet différent et fuit donc son préfixe).
      // 2. Elle ne s'ouvre QUE sur une base vide. Auparavant le SETUP_TOKEN
      //    restait valable indéfiniment : un secret pensé pour un usage unique
      //    devenait une porte permanente vers la création de comptes admin,
      //    longtemps après l'installation.
      const setupToken = c.req.header('x-setup-token');
      const tokenValid =
        typeof c.env.SETUP_TOKEN === 'string' &&
        c.env.SETUP_TOKEN.length > 0 &&
        setupToken !== undefined &&
        constantTimeEquals(setupToken, c.env.SETUP_TOKEN);
      if (!tokenValid) {
        return c.json({ success: false as const, error: 'Non autorisé' }, 403);
      }

      const [existingUsers] = await db.select({ n: count() }).from(users);
      if ((existingUsers?.n ?? 0) > 0) {
        return c.json(
          {
            success: false as const,
            error: "Le compte initial existe déjà : connectez-vous pour créer d'autres comptes",
          },
          403,
        );
      }
    }

    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    if (existing !== undefined) {
      return c.json({ success: false as const, error: 'Email déjà utilisé' }, 409);
    }

    const id = crypto.randomUUID();
    await db
      .insert(users)
      .values({
        id,
        email,
        passwordHash: await hashPassword(password),
        role,
        createdAt: new Date(),
      })
      .run();

    return c.json({ success: true as const, id }, 201);
  })

  /** Login : vérifie le mot de passe et signe un JWT. */
  .post('/login', zValidator('json', loginSchema), async (c) => {
    const { email, password } = c.req.valid('json');

    // Le freinage passe AVANT la lecture en base : sans lui, chaque tentative
    // — y compris la millionième d'un bruteforce — coûtait une requête D1 et
    // 100 000 itérations PBKDF2, aux frais du service.
    const source = c.req.header('cf-connecting-ip') ?? 'inconnue';
    if (!(await loginAllowed(c.env.LOGIN_RL, email, source))) {
      return c.json(
        { success: false as const, error: 'Trop de tentatives — réessayez dans une minute' },
        429,
      );
    }

    const db = drizzle(c.env.DB);
    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);

    // Compte inconnu : on dérive quand même un hachage factice avant de
    // répondre. Sans ça, l'écart de temps entre « e-mail inconnu » (réponse
    // immédiate) et « mot de passe faux » (100 000 itérations) énumérait les
    // comptes du back-office au chronomètre.
    if (user === undefined) {
      await burnPasswordTime(password);
      return c.json({ success: false as const, error: 'Identifiants invalides' }, 401);
    }
    if (!(await verifyPassword(password, user.passwordHash))) {
      return c.json({ success: false as const, error: 'Identifiants invalides' }, 401);
    }

    const now = Math.floor(Date.now() / 1000);
    const payload = jwtPayloadSchema.parse({
      sub: user.id,
      email: user.email,
      role: user.role,
      iat: now,
      exp: now + TOKEN_TTL_SECONDS,
    });
    const token = await sign(payload, c.env.JWT_SECRET);

    const userContext: UserContext = {
      sub: payload.sub,
      email: payload.email,
      role: payload.role,
    };
    return c.json({ success: true as const, token, user: userContext });
  })

  /**
   * Validation de session : hydrate un UserContext fortement typé.
   *
   * La signature ne suffit pas. Un JWT vit 8 heures et n'est pas révocable :
   * supprimer un compte ou rétrograder un rôle n'avait AUCUN effet sur les
   * sessions en cours — l'utilisateur gardait ses droits jusqu'à expiration.
   *
   * On relit donc l'utilisateur en base et on renvoie le rôle de LA BASE, pas
   * celui gravé dans le jeton. Le coût réseau était déjà payé : l'admin appelle
   * cette route à chaque requête (`src/lib/session.ts`), elle se contentait de
   * vérifier la signature. Une lecture indexée sur la clé primaire en échange
   * d'une révocation immédiate est un bon marché.
   */
  .get('/validate', async (c) => {
    const claims = await extractUser(c.req.header('Authorization'), c.env.JWT_SECRET);
    if (claims === null) {
      return c.json({ success: false as const, error: 'Token invalide ou manquant' }, 401);
    }

    const db = drizzle(c.env.DB);
    const [current] = await db
      .select({ id: users.id, email: users.email, role: users.role })
      .from(users)
      .where(eq(users.id, claims.sub))
      .limit(1);
    if (current === undefined) {
      return c.json({ success: false as const, error: 'Compte supprimé ou désactivé' }, 401);
    }

    const parsedRole = roleEnum.safeParse(current.role);
    if (!parsedRole.success) {
      // Rôle inconnu en base : on refuse plutôt que de deviner.
      console.error({ event: 'auth.unknown_role', sub: current.id, role: current.role });
      return c.json({ success: false as const, error: 'Rôle invalide' }, 401);
    }

    const user: UserContext = {
      sub: current.id,
      email: current.email,
      role: parsedRole.data,
    };
    return c.json({ success: true as const, user });
  })

  /** Liste des utilisateurs (admin uniquement). */
  .get('/users', async (c) => {
    const caller = await extractUser(c.req.header('Authorization'), c.env.JWT_SECRET);
    if (caller?.role !== 'admin') {
      return c.json({ success: false as const, error: 'Non autorisé' }, 403);
    }
    const db = drizzle(c.env.DB);
    const data = await db
      .select({ id: users.id, email: users.email, role: users.role, createdAt: users.createdAt })
      .from(users)
      .orderBy(asc(users.email));
    return c.json({ success: true as const, data });
  })

  /** Changement de rôle (admin uniquement). */
  .put(
    '/users/:id/role',
    zValidator('param', idParamSchema),
    zValidator('json', updateRoleSchema),
    async (c) => {
      const caller = await extractUser(c.req.header('Authorization'), c.env.JWT_SECRET);
      if (caller?.role !== 'admin') {
        return c.json({ success: false as const, error: 'Non autorisé' }, 403);
      }
      const { id } = c.req.valid('param');
      const { role } = c.req.valid('json');
      if (id === caller.sub) {
        return c.json({ success: false as const, error: 'Impossible de modifier son propre rôle' }, 400);
      }
      const db = drizzle(c.env.DB);
      const updated = await db
        .update(users)
        .set({ role })
        .where(eq(users.id, id))
        .returning({ id: users.id });
      if (updated.length === 0) {
        return c.json({ success: false as const, error: 'Utilisateur introuvable' }, 404);
      }
      return c.json({ success: true as const, id });
    },
  )

  /** Suppression d'utilisateur (admin uniquement, pas soi-même). */
  .delete('/users/:id', zValidator('param', idParamSchema), async (c) => {
    const caller = await extractUser(c.req.header('Authorization'), c.env.JWT_SECRET);
    if (caller?.role !== 'admin') {
      return c.json({ success: false as const, error: 'Non autorisé' }, 403);
    }
    const { id } = c.req.valid('param');
    if (id === caller.sub) {
      return c.json({ success: false as const, error: 'Impossible de se supprimer soi-même' }, 400);
    }
    const db = drizzle(c.env.DB);
    const deleted = await db.delete(users).where(eq(users.id, id)).returning({ id: users.id });
    if (deleted.length === 0) {
      return c.json({ success: false as const, error: 'Utilisateur introuvable' }, 404);
    }
    return c.json({ success: true as const, id });
  });

app.onError((err, c) => {
  const ref = reportServerError(err, {
    service: 'auth-worker',
    method: c.req.method,
    path: new URL(c.req.url).pathname,
  });
  return c.json({ success: false as const, error: serverErrorMessage(ref) }, 500);
});

// Exportation vitale pour le Front-End (cahier v3 §4.1)
export type AuthAPI = typeof routes;
export default app;
