/**
 * Messages one-shot passés d'un écran à l'autre par l'URL (`?ok=` / `?error=`).
 *
 * Pourquoi par l'URL : après une mutation, les îlots naviguent en dur
 * (`window.location.href`), ce qui détruit tout état client. Le code de
 * message voyage donc dans la query string, et le rendu se fait côté serveur
 * dans AdminShell — donc visible AVANT l'hydratation de l'îlot.
 *
 * Un code inconnu n'est jamais affiché tel quel : on retombe sur un libellé
 * générique plutôt que d'exposer une chaîne technique à l'utilisateur.
 */

export type FlashKind = 'ok' | 'error';

export interface Flash {
  readonly kind: FlashKind;
  readonly text: string;
}

/** Codes de succès — passés en `?ok=<code>` par les redirections des îlots. */
const OK_MESSAGES: Record<string, string> = {
  'contenu-cree': 'Contenu créé.',
  'contenu-modifie': 'Contenu enregistré.',
  'contenu-supprime': 'Contenu supprimé.',
  'type-cree': 'Type créé.',
  'type-supprime': 'Type supprimé.',
  'vocabulaire-cree': 'Vocabulaire créé.',
  'terme-cree': 'Terme ajouté.',
  'utilisateur-cree': 'Utilisateur créé.',
  'media-supprime': 'Média supprimé.',
};

/** Codes d'erreur — gardes de page (`droits`) et échecs de connexion. */
const ERROR_MESSAGES: Record<string, string> = {
  droits: "Droits insuffisants : vous n'avez pas accès à cette section.",
  identifiants: 'Email ou mot de passe incorrect.',
  validation: 'Email ou mot de passe au format invalide.',
};

const FALLBACK: Record<FlashKind, string> = {
  ok: 'Opération effectuée.',
  error: "L'opération a échoué.",
};

/** Lit le message flash porté par l'URL courante, ou `null`. */
export function readFlash(url: URL): Flash | null {
  const error = url.searchParams.get('error');
  if (error !== null) {
    return { kind: 'error', text: ERROR_MESSAGES[error] ?? FALLBACK.error };
  }
  const ok = url.searchParams.get('ok');
  if (ok !== null) {
    return { kind: 'ok', text: OK_MESSAGES[ok] ?? FALLBACK.ok };
  }
  return null;
}
