export interface ThemeInfo {
  readonly id: string;
  readonly label: string;
  readonly description: string;
}

/**
 * Registre des thèmes front installés (façon Drupal : thème de base +
 * thèmes enfants). Chaque entrée correspond à public/themes/<id>/theme.css.
 * 'base' est le thème natif, toujours chargé en premier ; les autres ne
 * redéfinissent que les tokens qu'ils changent (@layer theme-override).
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

export function resolveTheme(id: string | null | undefined): string {
  return id !== null && id !== undefined && isValidTheme(id) ? id : DEFAULT_THEME_ID;
}
