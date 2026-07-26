/**
 * Écritures composées sur D1 — atomicité et limites de la plateforme.
 *
 * Deux contraintes que D1 impose et qu'aucune abstraction ne masque :
 *
 * 1. **Pas de transaction interactive.** `db.transaction()` de Drizzle n'existe
 *    pas sur D1. La seule primitive atomique est `db.batch([...])`, qui exécute
 *    toutes ses instructions dans une transaction implicite : soit tout passe,
 *    soit rien. Une suite de `await db.insert(...)` séparés n'offre AUCUNE
 *    garantie — un échec au milieu laisse la base à moitié écrite.
 *
 * 2. **100 paramètres liés au maximum par instruction.** Drizzle compile
 *    `INSERT … VALUES (?,?),(?,?)…` : le nombre de paramètres vaut
 *    `lignes × colonnes`. Une insertion en lot doit donc être découpée AVANT
 *    d'atteindre le plafond. Cette limite s'applique à chaque instruction
 *    prise isolément, y compris à l'intérieur d'un batch — le découpage et le
 *    batch sont complémentaires, pas alternatifs.
 *
 * Voir `docs/audit/2026-07-26-algorithmie-et-workers.md` (P0-1, P0-2).
 */
import type { BatchItem } from 'drizzle-orm/batch';
import type { DrizzleD1Database } from 'drizzle-orm/d1';

export type DB = DrizzleD1Database<Record<string, never>>;

/** Une instruction Drizzle exécutable dans un `db.batch()`. */
export type Statement = BatchItem<'sqlite'>;

/** Limite D1 documentée : 100 paramètres liés par instruction SQL. */
export const D1_MAX_BOUND_PARAMS = 100;

/**
 * Découpe des lignes en paquets qui tiennent sous la limite de paramètres.
 *
 * Une marge est conservée (90 au lieu de 100) : le `WHERE` ou les valeurs par
 * défaut d'une future colonne ne doivent pas faire basculer un lot déjà calé
 * pile sur le plafond.
 */
export function chunkRows<T>(rows: readonly T[], columnsPerRow: number): T[][] {
  const perChunk = Math.max(1, Math.floor((D1_MAX_BOUND_PARAMS - 10) / columnsPerRow));
  const chunks: T[][] = [];
  for (let i = 0; i < rows.length; i += perChunk) {
    chunks.push(rows.slice(i, i + perChunk));
  }
  return chunks;
}

/**
 * Exécute les instructions dans une transaction implicite unique.
 *
 * `db.batch()` exige un tuple non vide (`[T, ...T[]]`) : la déstructuration
 * ci-dessous le construit sans cast, contrairement à un `as` qui masquerait le
 * cas de la liste vide.
 */
export async function runBatch(db: DB, statements: readonly Statement[]): Promise<void> {
  const [first, ...rest] = statements;
  if (first === undefined) return;
  await db.batch([first, ...rest]);
}
