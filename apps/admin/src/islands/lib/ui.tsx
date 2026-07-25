import type { ComponentChildren } from 'preact';
import type { LucideIcon } from 'lucide-preact';
import { CircleAlert, CircleCheck, LoaderCircle } from 'lucide-preact';

/** Signature commune des composants d'icône lucide-preact. */
export type IconComponent = LucideIcon;

/**
 * Icône + texte alignés horizontalement (classe .icon-label, voir admin.css).
 * Toujours passer par ce composant (ou ActionButton/ActionLink) pour mélanger
 * icône et texte : le reset met les svg en `display: block`, un svg posé nu
 * à côté d'un texte se retrouve seul sur sa ligne.
 */
export function IconLabel({
  icon: Icon,
  size = 14,
  class: cls,
  children,
}: {
  icon: IconComponent;
  size?: number;
  class?: string;
  children: ComponentChildren;
}) {
  return (
    <span class={cls !== undefined ? `icon-label ${cls}` : 'icon-label'}>
      <Icon size={size} aria-hidden={true} />
      {children}
    </span>
  );
}

/** Bouton d'action avec icône — variantes badge (contour) et danger. */
export function ActionButton({
  icon: Icon,
  danger = false,
  badge = false,
  disabled = false,
  onClick,
  children,
}: {
  icon: IconComponent;
  danger?: boolean;
  badge?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ComponentChildren;
}) {
  const cls = `${badge ? 'badge ' : ''}${danger ? 'danger' : ''}`.trim();
  return (
    <button type="button" class={cls.length > 0 ? cls : undefined} disabled={disabled} onClick={onClick}>
      <Icon size={14} aria-hidden={true} />
      {children}
    </button>
  );
}

/** Lien d'action (pilule .badge) avec icône. */
export function ActionLink({
  icon: Icon,
  href,
  children,
}: {
  icon: IconComponent;
  href: string;
  children: ComponentChildren;
}) {
  return (
    <a class="badge" href={href}>
      <Icon size={14} aria-hidden={true} />
      {children}
    </a>
  );
}

export function Notice({ kind, children }: { kind: 'error' | 'ok'; children: ComponentChildren }) {
  const Icon = kind === 'error' ? CircleAlert : CircleCheck;
  return (
    <p class={`notice ${kind}`}>
      <Icon size={16} aria-hidden={true} />
      {children}
    </p>
  );
}

export function Loading() {
  return (
    <p class="muted loading">
      <LoaderCircle size={16} aria-hidden={true} />
      Chargement…
    </p>
  );
}
