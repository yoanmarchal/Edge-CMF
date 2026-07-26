/**
 * Gestion des erreurs 500 — commune aux quatre micro-workers.
 *
 * Les workers renvoyaient `err.message` tel quel au client. Un message SQLite
 * brut (« FOREIGN KEY constraint failed », nom de table, fragment de requête)
 * remontait donc jusqu'à l'appelant — y compris jusqu'au client PUBLIC via le
 * gateway, qui repropage les réponses telles quelles. Une contrainte violée
 * devenait une carte du schéma.
 *
 * Le compromis habituel — masquer l'erreur — rend le débogage impossible. On
 * fait donc les deux : un identifiant de corrélation court part au client, le
 * détail complet part dans les journaux (Workers Logs, activé via
 * `[observability]` dans chaque wrangler.toml). L'utilisateur qui signale
 * « erreur réf. a3f9c1b2 » donne de quoi retrouver la trace exacte.
 *
 * Les réponses 4xx ne passent PAS par ici : leurs messages sont écrits pour
 * l'utilisateur (« Des contenus utilisent encore ce type ») et doivent rester
 * intacts — c'est une décision assumée de `apps/admin/src/lib/handler.ts`.
 */

export interface ErrorContext {
  /** Nom du worker, pour distinguer les traces d'un service à l'autre. */
  readonly service: string;
  readonly method: string;
  readonly path: string;
}

/**
 * Journalise l'erreur complète et retourne la référence à montrer au client.
 *
 * 8 caractères hexadécimaux suffisent : la référence n'a besoin d'être unique
 * que parmi les erreurs récentes, pas globalement.
 */
export function reportServerError(error: unknown, context: ErrorContext): string {
  const ref = crypto.randomUUID().slice(0, 8);
  console.error({
    event: 'unhandled_error',
    ref,
    ...context,
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  });
  return ref;
}

/** Message générique porteur de la référence de corrélation. */
export function serverErrorMessage(ref: string): string {
  return `Erreur interne du serveur (référence ${ref})`;
}
