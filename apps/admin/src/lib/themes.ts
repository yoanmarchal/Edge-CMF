export interface ThemeInfo {
  readonly id: string;
  readonly label: string;
  readonly description: string;
}

/**
 * Registre des thèmes front installés (façon Drupal : thème de base +
 * thèmes enfants). Reflète apps/frontend/src/lib/themes.ts — l'admin n'a
 * pas besoin de résoudre le thème actif (pas de SSR de contenu), seulement
 * de connaître la liste pour l'écran Apparence.
 */
export const THEMES: readonly ThemeInfo[] = [
  {
    id: 'base',
    label: 'Natif (base)',
    description: 'Thème par défaut du CMF — clair/sombre automatique selon le système.',
  },
  {
    id: 'midnight',
    label: 'Midnight',
    description: 'Thème enfant sombre, surcharge de "base" — exemple d’overridabilité.',
  },
];

export const DEFAULT_THEME_ID = 'base';
export const THEME_SETTING_KEY = 'active_theme';

export function isValidTheme(id: string): boolean {
  return THEMES.some((t) => t.id === id);
}
