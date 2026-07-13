import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { sign, verify } from 'hono/jwt';
import { drizzle } from 'drizzle-orm/d1';
import { asc, eq } from 'drizzle-orm';
import {
  loginSchema,
  registerSchema,
  jwtPayloadSchema,
  idParamSchema,
  updateRoleSchema,
  type UserContext,
} from '@edge-cmf/shared-types';
import { users } from './schema';
import { hashPassword, verifyPassword } from './crypto';

type Bindings = {
  DB: D1Database;
  JWT_SECRET: string;
  SETUP_TOKEN: string;
};

const TOKEN_TTL_SECONDS = 60 * 60 * 8; // 8 heures

const app = new Hono<{ Bindings: Bindings }>();

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
    const setupToken = c.req.header('x-setup-token');
    const isBootstrap =
      typeof c.env.SETUP_TOKEN === 'string' &&
      c.env.SETUP_TOKEN.length > 0 &&
      setupToken === c.env.SETUP_TOKEN;

    if (caller?.role !== 'admin' && !isBootstrap) {
      return c.json({ success: false as const, error: 'Non autorisé' }, 403);
    }

    const { email, password, role } = c.req.valid('json');
    const db = drizzle(c.env.DB);

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
    const db = drizzle(c.env.DB);

    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (user === undefined || !(await verifyPassword(password, user.passwordHash))) {
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

  /** Validation de session : hydrate un UserContext fortement typé. */
  .get('/validate', async (c) => {
    const user = await extractUser(c.req.header('Authorization'), c.env.JWT_SECRET);
    if (user === null) {
      return c.json({ success: false as const, error: 'Token invalide ou manquant' }, 401);
    }
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

app.onError((err, c) => c.json({ success: false as const, error: err.message }, 500));

// Exportation vitale pour le Front-End (cahier v3 §4.1)
export type AuthAPI = typeof routes;
export default app;
