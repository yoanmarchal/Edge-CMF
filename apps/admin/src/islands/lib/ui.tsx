/**
 * Composants UI partagés des îlots admin — LA source unique pour tout
 * élément d'interface récurrent (boutons d'action, liens retour, états
 * de chargement, notices…).
 *
 * Règles :
 * 1. Icône + texte ne se posent JAMAIS à la main : le reset met les svg en
 *    `display: block`, un svg nu à côté d'un texte part seul sur sa ligne.
 *    Passer par IconLabel / ActionButton / ActionLink / SubmitButton.
 * 2. Un pattern qui apparaît dans 2 îlots ou plus se factorise ici,
 *    pas en copier-coller.
 * 3. Les icônes viennent de lucide-preact (type LucideIcon), taille 14
 *    par défaut (16 pour les éléments de premier niveau).
 */
import type { ComponentChildren } from 'preact';
import type { LucideIcon } from 'lucide-preact';
import { ArrowLeft, ChevronDown, CircleAlert, CircleCheck, LoaderCircle, Save, X } from 'lucide-preact';

/** Signature commune des composants d'icône lucide-preact. */
export type IconComponent = LucideIcon;

/** Icône + texte alignés horizontalement (classe .icon-label, voir admin.css). */
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

/** Lien d'action (pilule .badge) avec icône. `external` → nouvel onglet. */
export function ActionLink({
  icon: Icon,
  href,
  external = false,
  children,
}: {
  icon: IconComponent;
  href: string;
  external?: boolean;
  children: ComponentChildren;
}) {
  return (
    <a class="badge" href={href} target={external ? '_blank' : undefined} rel={external ? 'noopener' : undefined}>
      <Icon size={14} aria-hidden={true} />
      {children}
    </a>
  );
}

/** Bouton de soumission de formulaire — désactivé pendant l'envoi. */
export function SubmitButton({
  icon: Icon = Save,
  saving = false,
  children,
}: {
  icon?: IconComponent;
  saving?: boolean;
  children: ComponentChildren;
}) {
  return (
    <button type="submit" disabled={saving}>
      <Icon size={14} aria-hidden={true} />
      {children}
    </button>
  );
}

/** Petit bouton « × » de retrait (lignes de table, valeurs multiples).
 *  Le libellé passe en title + aria-label : accessible sans encombrer. */
export function RemoveButton({ title, onClick }: { title: string; onClick: () => void }) {
  return (
    <button type="button" class="danger icon-only" title={title} aria-label={title} onClick={onClick}>
      <X size={14} aria-hidden={true} />
    </button>
  );
}

/** Lien retour vers la liste parente — en tête de toute page de détail/création. */
export function BackLink({ href, children }: { href: string; children: ComponentChildren }) {
  return (
    <p class="muted">
      <a href={href} class="icon-label">
        <ArrowLeft size={14} aria-hidden={true} />
        {children}
      </a>
    </p>
  );
}

/** Pagination par curseur — bouton « Charger plus » standard. */
export function LoadMoreButton({ onClick }: { onClick: () => void }) {
  return (
    <p class="action-row">
      <ActionButton icon={ChevronDown} onClick={onClick}>
        Charger plus
      </ActionButton>
    </p>
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
