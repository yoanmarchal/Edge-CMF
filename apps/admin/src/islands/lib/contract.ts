/**
 * Contrat d'API des îlots admin — LA source unique de la forme des données
 * échangées avec `/api/*`.
 *
 * Pourquoi ce fichier existe : le RPC typé (`hono/client`) s'arrête au proxy
 * Astro. Passé cette frontière, chaque îlot redéclarait à la main les formes
 * dont il avait besoin (`NodeRow`, `TypeRow`, `Term`, `TypeDetail`…), avec
 * des divergences silencieuses d'un îlot à l'autre : ajouter une colonne ne
 * cassait aucune compilation. Ici, les types sont DÉRIVÉS des lignes Drizzle
 * du content-worker — renommer une colonne casse le typecheck de l'admin.
 *
 * Règles :
 * 1. Aucune interface de données ne se déclare dans un îlot. Elle vit ici.
 * 2. Aucun îlot n'écrit d'URL `/api/…` : il appelle une méthode de `api`.
 * 3. Les fonctions renvoient la donnée utile, pas l'enveloppe `{ data }`.
 *
 * Les imports de types du content-worker sont `import type` : entièrement
 * effacés à la compilation, rien du code back n'atteint le bundle client
 * (cahier v3 §4.2).
 */
import type {
  ContentNode,
  ContentTypeRow,
  TermRow,
  VocabularyRow,
} from '@edge-cmf/content-worker';
import type {
  ContentStats,
  FieldDef,
  MediaItem,
  MediaListResult,
  Role,
} from '@edge-cmf/shared-types';
import { adminApi } from './adminApi';

// ---------------------------------------------------------------------------
// Formes de données
// ---------------------------------------------------------------------------

/**
 * Vue JSON d'une ligne Drizzle. Les colonnes `mode: 'timestamp'` sont des
 * `Date` dans le worker mais des chaînes ISO une fois sérialisées : sans
 * cette transformation, un `new Date(row.createdAt)` compilerait alors que
 * `createdAt` est déjà une chaîne.
 */
type Serialized<T> = { [K in keyof T]: T[K] extends Date ? string : T[K] };

/** Type de contenu ou de paragraphe (bundle). */
export type ContentTypeSummary = Serialized<ContentTypeRow>;

/** Bundle + sa Field API — réponse de `?expand=fields` et du détail. */
export interface ContentTypeWithFields extends ContentTypeSummary {
  readonly fields: FieldDef[];
}

export type TermSummary = Serialized<TermRow>;

export interface VocabularyWithTerms extends Serialized<VocabularyRow> {
  readonly terms: TermSummary[];
}

/** Instance de paragraphe attachée à un nœud (hydratée par le worker). */
export interface NodeParagraph {
  readonly id: string;
  readonly type: string;
  readonly fields: Record<string, unknown>;
  readonly weight: number;
}

/**
 * Nœud tel que renvoyé par le worker : `fieldsJson` est remplacé par les
 * valeurs déjà parsées, et les relations sont hydratées (`hydrateNode`).
 * Les listes renvoient la même forme avec `terms`/`paragraphs` vides.
 */
export type AdminNode = Omit<Serialized<ContentNode>, 'fieldsJson'> & {
  readonly fields: Record<string, unknown>;
  readonly terms: TermSummary[];
  readonly paragraphs: NodeParagraph[];
};

/**
 * Compte utilisateur. `role` est stocké en `text` côté auth-worker : le
 * rétrécissement vers `Role` est assumé ici, à la frontière, plutôt que
 * répété dans chaque îlot.
 */
export interface AdminUser {
  readonly id: string;
  readonly email: string;
  readonly role: Role;
  readonly createdAt: string;
}

export type { ContentStats, MediaItem, MediaListResult, Role };

/** Réponse standard d'une mutation du proxy. */
export interface MutationResult {
  readonly success: true;
  readonly id?: string;
}

// ---------------------------------------------------------------------------
// Appels
// ---------------------------------------------------------------------------

const unwrap = <T>(p: Promise<{ data: T }>): Promise<T> => p.then((r) => r.data);
const qs = (params: Record<string, string | undefined>): string => {
  const entries = Object.entries(params).filter((e): e is [string, string] => e[1] !== undefined);
  return entries.length === 0 ? '' : `?${new URLSearchParams(entries).toString()}`;
};

export const api = {
  /** Compteurs du tableau de bord (comptés en SQL, pas en `.length`). */
  stats: (): Promise<ContentStats> => unwrap(adminApi.get<{ data: ContentStats }>('/api/stats')),

  types: {
    list: (kind?: 'node' | 'paragraph'): Promise<ContentTypeSummary[]> =>
      unwrap(adminApi.get<{ data: ContentTypeSummary[] }>(`/api/types${qs({ kind })}`)),

    /** Liste + Field API de chaque type, en UNE requête (voir `expand`). */
    listWithFields: (kind?: 'node' | 'paragraph'): Promise<ContentTypeWithFields[]> =>
      unwrap(
        adminApi.get<{ data: ContentTypeWithFields[] }>(
          `/api/types${qs({ kind, expand: 'fields' })}`,
        ),
      ),

    detail: (id: string): Promise<{ type: ContentTypeSummary; fields: FieldDef[] }> =>
      unwrap(
        adminApi.get<{ data: { type: ContentTypeSummary; fields: FieldDef[] } }>(
          `/api/types${qs({ id })}`,
        ),
      ),

    create: (input: {
      id: string;
      label: string;
      description: string;
      kind: 'node' | 'paragraph';
    }): Promise<MutationResult> =>
      adminApi.post<MutationResult>('/api/types', { _action: 'create-type', ...input }),

    remove: (id: string): Promise<MutationResult> =>
      adminApi.post<MutationResult>('/api/types', { _action: 'delete-type', id }),

    createField: (input: {
      contentTypeId: string;
      name: string;
      label: string;
      fieldType: FieldDef['fieldType'];
      options: string;
      required: boolean;
      multiple: boolean;
      weight: number;
    }): Promise<MutationResult> =>
      adminApi.post<MutationResult>('/api/types', { _action: 'create-field', ...input }),

    removeField: (id: string): Promise<MutationResult> =>
      adminApi.post<MutationResult>('/api/types', { _action: 'delete-field', id }),
  },

  nodes: {
    list: (): Promise<AdminNode[]> => unwrap(adminApi.get<{ data: AdminNode[] }>('/api/nodes')),

    detail: (id: string): Promise<AdminNode> =>
      unwrap(adminApi.get<{ data: AdminNode }>(`/api/nodes${qs({ id })}`)),

    create: (input: Record<string, unknown>): Promise<MutationResult> =>
      adminApi.post<MutationResult>('/api/nodes', { _action: 'create', ...input }),

    update: (id: string, input: Record<string, unknown>): Promise<MutationResult> =>
      adminApi.post<MutationResult>('/api/nodes', { _action: 'update', id, ...input }),

    remove: (id: string): Promise<MutationResult> =>
      adminApi.post<MutationResult>('/api/nodes', { _action: 'delete', id }),
  },

  taxonomy: {
    list: (): Promise<VocabularyWithTerms[]> =>
      unwrap(adminApi.get<{ data: VocabularyWithTerms[] }>('/api/taxonomy')),

    createVocabulary: (input: { id: string; label: string }): Promise<MutationResult> =>
      adminApi.post<MutationResult>('/api/taxonomy', { _action: 'create-vocab', ...input }),

    removeVocabulary: (id: string): Promise<MutationResult> =>
      adminApi.post<MutationResult>('/api/taxonomy', { _action: 'delete-vocab', id }),

    createTerm: (input: {
      vocabularyId: string;
      label: string;
      slug: string;
    }): Promise<MutationResult> =>
      adminApi.post<MutationResult>('/api/taxonomy', { _action: 'create-term', ...input }),

    removeTerm: (id: string): Promise<MutationResult> =>
      adminApi.post<MutationResult>('/api/taxonomy', { _action: 'delete-term', id }),
  },

  users: {
    list: (): Promise<AdminUser[]> => unwrap(adminApi.get<{ data: AdminUser[] }>('/api/users')),

    create: (input: { email: string; password: string; role: Role }): Promise<MutationResult> =>
      adminApi.post<MutationResult>('/api/users', { _action: 'create', ...input }),

    setRole: (id: string, role: Role): Promise<MutationResult> =>
      adminApi.post<MutationResult>('/api/users', { _action: 'set-role', id, role }),

    remove: (id: string): Promise<MutationResult> =>
      adminApi.post<MutationResult>('/api/users', { _action: 'delete', id }),
  },

  media: {
    list: (limit: number, cursor?: string): Promise<MediaListResult> =>
      adminApi.get<MediaListResult>(`/api/media${qs({ limit: String(limit), cursor })}`),

    detail: (key: string): Promise<MediaItem> =>
      unwrap(adminApi.get<{ data: MediaItem }>(`/api/media${qs({ key })}`)),

    upload: (form: FormData): Promise<{ data: MediaItem }> =>
      adminApi.postForm<{ data: MediaItem }>('/api/media', form),

    /** Remplace le binaire d'un média existant — la clé publique ne change pas. */
    replace: (key: string, form: FormData): Promise<{ data: MediaItem }> =>
      adminApi.postForm<{ data: MediaItem }>(`/api/media${qs({ key })}`, form),

    setAlt: (key: string, alt: string): Promise<MutationResult> =>
      adminApi.put<MutationResult>('/api/media', { key, alt }),

    remove: (key: string): Promise<MutationResult> =>
      adminApi.delete<MutationResult>(`/api/media${qs({ key })}`),
  },

  settings: {
    get: (key: string): Promise<{ key: string; value: string | null }> =>
      unwrap(adminApi.get<{ data: { key: string; value: string | null } }>(`/api/settings${qs({ key })}`)),

    set: (key: string, value: string): Promise<MutationResult> =>
      adminApi.put<MutationResult>('/api/settings', { key, value }),
  },
} as const;
