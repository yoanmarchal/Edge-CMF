/**
 * Registre des routes de l'admin — LA source unique des chemins et des
 * libellés de section.
 *
 * Avant : `nav[]` dans AdminShell ne couvrait que les 8 entrées de premier
 * niveau, et les URLs de détail, de création et de retour étaient écrites à
 * la main dans une quinzaine de fichiers (`/content/edit/${id}`,
 * `/taxonomy/${v.id}/new`, `copy.backTo`…). Renommer une section demandait un
 * `grep` et un peu de foi. Les libellés de retour, eux, étaient réinventés à
 * chaque écran (« Retour à la liste », « Retour à la taxonomie »…).
 *
 * Ce module est volontairement pur (aucun import serveur) : il est consommé
 * autant par les pages Astro que par les îlots Preact.
 */

export const routes = {
  dashboard: '/',

  content: {
    list: '/content',
    new: (typeId: string) => `/content/new?type=${encodeURIComponent(typeId)}`,
    edit: (id: string) => `/content/edit/${id}`,
  },

  media: {
    list: '/media',
    detail: (key: string) => `/media/${key}`,
  },

  types: {
    list: '/types',
    new: '/types/new',
    detail: (id: string) => `/types/${id}`,
  },

  /** Types de paragraphe : mêmes écrans de détail que les types de contenu. */
  paragraphs: {
    list: '/paragraphs',
    new: '/paragraphs/new',
  },

  taxonomy: {
    list: '/taxonomy',
    new: '/taxonomy/new',
    newTerm: (vocabularyId: string) => `/taxonomy/${vocabularyId}/new`,
  },

  users: {
    list: '/users',
    new: '/users/new',
  },

  appearance: '/appearance',
} as const;

/** Libellés de section — nav, fils d'Ariane et liens retour parlent pareil. */
export const SECTIONS = {
  dashboard: 'Tableau de bord',
  content: 'Contenu',
  media: 'Médias',
  types: 'Types de contenu',
  paragraphs: 'Types de paragraphes',
  taxonomy: 'Taxonomie',
  users: 'Utilisateurs',
  appearance: 'Apparence',
} as const;

export interface Crumb {
  readonly label: string;
  readonly href: string;
}

/** Miettes de fil d'Ariane prêtes à l'emploi, pour les écrans de second niveau. */
export const crumbs: Readonly<Record<'content' | 'media' | 'types' | 'paragraphs' | 'taxonomy' | 'users', Crumb>> = {
  content: { label: SECTIONS.content, href: routes.content.list },
  media: { label: SECTIONS.media, href: routes.media.list },
  types: { label: SECTIONS.types, href: routes.types.list },
  paragraphs: { label: SECTIONS.paragraphs, href: routes.paragraphs.list },
  taxonomy: { label: SECTIONS.taxonomy, href: routes.taxonomy.list },
  users: { label: SECTIONS.users, href: routes.users.list },
};

/**
 * Un bundle vit dans « Types de contenu » ou « Types de paragraphes » selon
 * son `kind`. Cette bascule était recopiée à trois endroits (lien retour,
 * redirection après suppression, libellé).
 */
export function bundleSection(isParagraph: boolean): Crumb {
  return isParagraph ? crumbs.paragraphs : crumbs.types;
}
