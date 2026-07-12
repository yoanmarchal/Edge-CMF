import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

/** Table Users — BDD D1 dédiée à l'Auth Service (cahier v2 §2.2) */
export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(), // format "saltHex:hashHex" (PBKDF2)
  role: text('role').notNull().default('viewer'), // 'admin' | 'editor' | 'viewer'
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
