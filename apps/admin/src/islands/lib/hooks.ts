/**
 * Hooks de données des îlots admin.
 *
 * Ils remplacent le motif recopié dans une dizaine d'îlots : deux `useState`,
 * une fonction `reload`, un `useEffect`, un `.catch(e => setError(e.message))`
 * et un ternaire `data === null ? <Loading/> : …`. Un écran de liste ne
 * devrait pas coûter quarante lignes de cérémonie avant sa première ligne
 * utile.
 *
 * Voir `docs/design/05-ui.md` §3.3.
 */
import { useCallback, useEffect, useRef, useState } from 'preact/hooks';

// ---------------------------------------------------------------------------
// Lecture
// ---------------------------------------------------------------------------

export interface Resource<T> {
  /** Donnée chargée, `null` tant que le premier chargement n'a pas abouti. */
  readonly data: T | null;
  readonly error: string | null;
  readonly loading: boolean;
  /** Relance le chargement (après une mutation, typiquement). */
  readonly reload: () => void;
}

/**
 * Charge une ressource et suit son état.
 *
 * `load` est lue par référence : elle peut être une lambda redéfinie à chaque
 * rendu sans provoquer de boucle. Ce sont les `deps` qui décident du
 * rechargement, comme pour `useEffect`.
 *
 * Deux garde-fous que le code manuel n'avait pas :
 * - une réponse arrivée après démontage ou après un rechargement plus récent
 *   est ignorée (plus d'écrasement par une réponse obsolète) ;
 * - une erreur de RECHARGEMENT conserve les données déjà affichées au lieu de
 *   vider l'écran.
 */
export function useResource<T>(load: () => Promise<T>, deps: readonly unknown[] = []): Resource<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    let current = true;
    setError(null);
    loadRef.current()
      .then((value) => {
        if (current) setData(value);
      })
      .catch((e: Error) => {
        if (current) setError(e.message);
      });
    return () => {
      current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);

  return { data, error, loading: data === null && error === null, reload };
}

// ---------------------------------------------------------------------------
// Lecture paginée (curseur)
// ---------------------------------------------------------------------------

export interface CursorList<T> {
  /** Toutes les pages chargées, concaténées. `null` avant le 1er chargement. */
  readonly items: T[] | null;
  readonly error: string | null;
  readonly loading: boolean;
  /** `true` pendant n'importe quel chargement, y compris « charger plus ». */
  readonly busy: boolean;
  /** Non-`null` s'il reste des pages à charger. */
  readonly cursor: string | null;
  readonly loadMore: () => void;
  /** Repart de la première page (après un ajout, par exemple). */
  readonly reload: () => void;
  /** Charge la première page si ce n'est pas déjà fait (montage différé). */
  readonly ensureLoaded: () => void;
}

/**
 * Liste paginée par curseur, façon R2 : la bibliothèque de médias et le
 * sélecteur de médias recopiaient la même mécanique d'accumulation.
 *
 * `auto: false` diffère le premier chargement — le sélecteur ne doit pas
 * interroger R2 tant que sa modale n'a pas été ouverte.
 */
export function useCursorList<T>(
  load: (cursor: string | null) => Promise<{ readonly data: T[]; readonly cursor: string | null }>,
  opts: { readonly auto?: boolean } = {},
): CursorList<T> {
  const auto = opts.auto ?? true;
  const [items, setItems] = useState<T[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loadRef = useRef(load);
  loadRef.current = load;

  /** Numéro de génération : invalide les réponses d'un cycle abandonné. */
  const generation = useRef(0);
  const started = useRef(false);

  const fetchPage = useCallback((after: string | null, append: boolean) => {
    const gen = generation.current;
    setBusy(true);
    setError(null);
    loadRef
      .current(after)
      .then((res) => {
        if (gen !== generation.current) return;
        setItems((prev) => (append && prev !== null ? [...prev, ...res.data] : [...res.data]));
        setCursor(res.cursor);
      })
      .catch((e: Error) => {
        if (gen === generation.current) setError(e.message);
      })
      .finally(() => {
        if (gen === generation.current) setBusy(false);
      });
  }, []);

  const reload = useCallback(() => {
    generation.current += 1;
    started.current = true;
    setItems(null);
    setCursor(null);
    fetchPage(null, false);
  }, [fetchPage]);

  const loadMore = useCallback(() => {
    if (cursor !== null) fetchPage(cursor, true);
  }, [cursor, fetchPage]);

  const ensureLoaded = useCallback(() => {
    if (started.current) return;
    started.current = true;
    fetchPage(null, false);
  }, [fetchPage]);

  useEffect(() => {
    if (auto) ensureLoaded();
  }, [auto, ensureLoaded]);

  return {
    items,
    cursor,
    error,
    loading: items === null && error === null,
    busy,
    loadMore,
    reload,
    ensureLoaded,
  };
}

// ---------------------------------------------------------------------------
// Écriture
// ---------------------------------------------------------------------------

export interface MutationOptions {
  /** Message de confirmation — l'action est annulée si l'utilisateur refuse. */
  readonly confirm?: string;
  /** Rechargement à déclencher après succès (typiquement `resource.reload`). */
  readonly onDone?: () => void;
  /**
   * Navigation après succès. Le code de message flash y est concaténé et
   * affiché en SSR par AdminShell à l'arrivée (voir `src/lib/flash.ts`).
   */
  readonly redirect?: { readonly to: string; readonly flash?: string };
}

export interface Mutation {
  /** `true` pendant l'exécution — à câbler sur `disabled`. */
  readonly busy: boolean;
  readonly error: string | null;
  readonly clearError: () => void;
  /** Exécute l'action en gérant confirmation, état d'occupation et erreur. */
  readonly run: (action: () => Promise<unknown>, opts?: MutationOptions) => Promise<void>;
}

/**
 * Enveloppe les appels d'écriture. Le `try/catch` + `setSaving` + `setError`
 * que chaque handler recopiait vit désormais ici, à un seul endroit.
 *
 * En cas de redirection réussie, `busy` reste volontairement à `true` : la
 * page est en train d'être remplacée, réactiver les boutons inviterait à un
 * double envoi.
 */
export function useMutation(): Mutation {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async (action: () => Promise<unknown>, opts: MutationOptions = {}) => {
    if (opts.confirm !== undefined && !confirm(opts.confirm)) return;
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      // Échec : on réactive l'interface pour laisser corriger et réessayer,
      // y compris quand une redirection était prévue.
      setError((e as Error).message);
      setBusy(false);
      return;
    }
    if (opts.redirect !== undefined) {
      const { to, flash } = opts.redirect;
      window.location.href = flash === undefined ? to : `${to}?ok=${flash}`;
      return; // busy reste vrai : la page est en cours de remplacement
    }
    setBusy(false);
    opts.onDone?.();
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return { busy, error, clearError, run };
}
