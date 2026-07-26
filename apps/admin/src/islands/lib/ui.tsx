/**
 * Composants UI partagés des îlots admin — LA source unique pour tout
 * élément d'interface récurrent (boutons d'action, liens retour, états
 * de chargement, notices, tableaux…).
 *
 * Règles :
 * 1. Icône + texte ne se posent JAMAIS à la main : le reset met les svg en
 *    `display: block`, un svg nu à côté d'un texte part seul sur sa ligne.
 *    Passer par IconLabel ou Button.
 * 2. Un pattern qui apparaît dans 2 îlots ou plus se factorise ici,
 *    pas en copier-coller.
 * 2 bis. **Toute action passe par `Button`.** Pas de `<button>` ni de `<a>`
 *    d'action écrit à la main, et pas de nouvelle variante : si un écran a
 *    besoin d'une apparence qui n'existe pas, c'est l'intention qu'il faut
 *    revoir, pas ajouter un booléen.
 * 3. Les icônes viennent de lucide-preact (type LucideIcon), taille 14
 *    par défaut (16 pour les éléments de premier niveau).
 * 4. Le TITRE d'écran ne vit pas ici : il est rendu en SSR par AdminShell
 *    (les îlots sont `client:only`, un <h1> à l'intérieur laisserait la
 *    page vide jusqu'au démarrage du JS).
 */
import type { ComponentChildren, JSX } from 'preact';
import type { LucideIcon } from 'lucide-preact';
import { ArrowLeft, ChevronDown, CircleAlert, CircleCheck, Inbox, LoaderCircle, Save, X } from 'lucide-preact';
import type { Resource } from './hooks';

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

// ---------------------------------------------------------------------------
// Bouton — LE composant d'action, unique.
// ---------------------------------------------------------------------------

/**
 * Hiérarchie visuelle. C'est une INTENTION, pas une apparence : l'appelant
 * déclare l'importance de l'action, pas la façon de la dessiner.
 *
 * - `primary`   : l'action principale de l'écran ou du formulaire. Une seule
 *                 par zone. Plein, couleur d'accent.
 * - `secondary` : tout le reste. Contour discret.
 */
export type ButtonVariant = 'primary' | 'secondary';

/** Sémantique. `danger` = action destructive ou irréversible. */
export type ButtonTone = 'neutral' | 'danger';

interface ButtonBase {
  icon?: IconComponent;
  variant?: ButtonVariant;
  tone?: ButtonTone;
  /** `sm` : densité de tableau, où un bouton pleine taille écrase la ligne. */
  size?: 'md' | 'sm';
  disabled?: boolean;
  /** Rendu en `<a>` au lieu de `<button>` — apparence strictement identique. */
  href?: string;
  /** Ouvre dans un nouvel onglet (implique `rel="noopener"`). */
  external?: boolean;
  type?: 'button' | 'submit';
  onClick?: () => void;
}

/**
 * `iconOnly` exige une icône ET un libellé en texte brut : celui-ci part en
 * `title` + `aria-label`. Le type l'impose, on ne peut pas produire un bouton
 * icône sans nom accessible.
 */
type ButtonProps = ButtonBase &
  (
    | { iconOnly: true; icon: IconComponent; children: string }
    | { iconOnly?: false; children: ComponentChildren }
  );

/**
 * Bouton d'action unique de l'admin.
 *
 * Il rend un `<a>` quand `href` est fourni, un `<button>` sinon — c'est le
 * point central : « Nouveau type » (un lien) et « Enregistrer » (un bouton)
 * sont deux actions principales et doivent se ressembler. Avant, les liens
 * étaient forcément des pilules et les boutons forcément pleins : l'apparence
 * dépendait de la balise HTML, pas de l'importance de l'action.
 */
export function Button({
  icon: Icon,
  variant = 'secondary',
  tone = 'neutral',
  size = 'md',
  iconOnly = false,
  disabled = false,
  href,
  external = false,
  type = 'button',
  onClick,
  children,
}: ButtonProps): JSX.Element {
  const cls = [
    'btn',
    `btn--${variant}`,
    tone === 'danger' ? 'btn--danger' : null,
    size === 'sm' ? 'btn--sm' : null,
    iconOnly ? 'btn--icon' : null,
  ]
    .filter((c): c is string => c !== null)
    .join(' ');

  const label = iconOnly && typeof children === 'string' ? children : undefined;
  const inner = (
    <>
      {Icon !== undefined && <Icon size={size === 'sm' ? 13 : 14} aria-hidden={true} />}
      {iconOnly ? null : children}
    </>
  );

  if (href !== undefined) {
    return (
      <a
        class={cls}
        href={disabled ? undefined : href}
        aria-disabled={disabled ? 'true' : undefined}
        title={label}
        aria-label={label}
        target={external ? '_blank' : undefined}
        rel={external ? 'noopener' : undefined}
      >
        {inner}
      </a>
    );
  }

  return (
    <button
      type={type}
      class={cls}
      disabled={disabled}
      title={label}
      aria-label={label}
      onClick={onClick}
    >
      {inner}
    </button>
  );
}

/**
 * Retrait d'une ligne — préréglage, pas une variante de plus : toutes les
 * suppressions en contexte dense (ligne de tableau, valeur multiple) doivent
 * se ressembler. Le libellé part en `title` + `aria-label`.
 */
export function RemoveButton({ title, onClick }: { title: string; onClick: () => void }) {
  return (
    <Button icon={X} tone="danger" size="sm" iconOnly onClick={onClick}>
      {title}
    </Button>
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

/** Pagination par curseur — préréglage « Charger plus ». */
export function LoadMoreButton({ onClick }: { onClick: () => void }) {
  return (
    <p class="action-row">
      <Button icon={ChevronDown} onClick={onClick}>
        Charger plus
      </Button>
    </p>
  );
}

/**
 * Notice. `role` fait annoncer le message par les lecteurs d'écran sans
 * déplacer le focus : une erreur apparue après une action passait sinon
 * totalement inaperçue pour un utilisateur non voyant.
 * `alert` (assertif) pour une erreur, `status` (poli) pour un succès.
 */
export function Notice({ kind, children }: { kind: 'error' | 'ok'; children: ComponentChildren }) {
  const Icon = kind === 'error' ? CircleAlert : CircleCheck;
  return (
    <p class={`notice ${kind}`} role={kind === 'error' ? 'alert' : 'status'}>
      <Icon size={16} aria-hidden={true} />
      {children}
    </p>
  );
}

export function Loading() {
  return (
    <p class="muted loading" role="status">
      <LoaderCircle size={16} aria-hidden={true} />
      Chargement…
    </p>
  );
}

// ---------------------------------------------------------------------------
// Primitives d'écran
// ---------------------------------------------------------------------------

/**
 * État vide d'une liste. Chaque écran formulait le sien différemment — ou
 * n'en affichait aucun, laissant un tableau réduit à ses en-têtes.
 */
export function EmptyState({ children }: { children: ComponentChildren }) {
  return (
    <p class="empty-state">
      <Inbox size={18} aria-hidden={true} />
      {children}
    </p>
  );
}

/**
 * Rend une ressource : chargement, erreur, vide, ou données. Remplace le
 * `data === null ? <Loading/> : …` recopié dans dix îlots — et garantit que
 * les trois états secondaires ne sont plus oubliés au cas par cas.
 *
 * L'erreur reste affichée AU-DESSUS des données quand il y en a déjà :
 * l'échec d'un rechargement ne doit pas vider l'écran.
 */
export function AsyncView<T>({
  resource,
  empty,
  isEmpty,
  children,
}: {
  resource: Resource<T>;
  /** Message affiché quand la donnée est « vide » au sens de `isEmpty`. */
  empty?: ComponentChildren;
  /** Par défaut : un tableau de longueur nulle. */
  isEmpty?: (data: T) => boolean;
  children: (data: T) => JSX.Element;
}): JSX.Element {
  const blank = (data: T): boolean =>
    isEmpty !== undefined ? isEmpty(data) : Array.isArray(data) && data.length === 0;

  return (
    <>
      {resource.error !== null && <Notice kind="error">Erreur : {resource.error}</Notice>}
      {resource.loading && <Loading />}
      {resource.data !== null &&
        (blank(resource.data) && empty !== undefined ? (
          <EmptyState>{empty}</EmptyState>
        ) : (
          children(resource.data)
        ))}
    </>
  );
}

export interface Column<Row> {
  /** En-tête ; vide pour la colonne d'actions. */
  readonly header?: string;
  readonly cell: (row: Row) => ComponentChildren;
  /** Applique `.muted` à la cellule (métadonnées secondaires). */
  readonly muted?: boolean;
}

/**
 * Tableau de liste. Cinq écrans en construisaient un à la main, avec des
 * en-têtes et des cellules recopiés ; la clé de ligne y était systématiquement
 * oubliée — d'où le paramètre `rowKey`, obligatoire.
 */
export function DataTable<Row>({
  columns,
  rows,
  rowKey,
}: {
  columns: readonly Column<Row>[];
  rows: readonly Row[];
  rowKey: (row: Row) => string;
}) {
  return (
    <table>
      <thead>
        <tr>
          {/* `scope="col"` : sans lui, un lecteur d'écran ne rattache pas
              les cellules à leur en-tête dans un tableau de données. */}
          {columns.map((c, i) => (
            <th key={c.header ?? `col${i}`} scope="col">
              {c.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={rowKey(row)}>
            {columns.map((c, i) => (
              <td key={c.header ?? `col${i}`} class={c.muted === true ? 'muted' : undefined}>
                {c.cell(row)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * Formulaire de création : les cinq écrans « Nouveau … » ne différaient que
 * par leurs champs. Le titre et le fil d'Ariane sont rendus en SSR par la
 * page, il ne reste ici que l'erreur, les champs et le bouton d'envoi.
 */
export function FormScreen({
  onSubmit,
  saving,
  error,
  submitLabel,
  submitIcon = Save,
  children,
}: {
  onSubmit: (e: Event) => void;
  saving: boolean;
  error: string | null;
  submitLabel: string;
  submitIcon?: IconComponent;
  children: ComponentChildren;
}) {
  return (
    <>
      {error !== null && <Notice kind="error">Erreur : {error}</Notice>}
      <form class="stack" onSubmit={onSubmit}>
        {children}
        {/* Soumettre est l'action principale du formulaire, par définition. */}
        <Button type="submit" variant="primary" icon={submitIcon} disabled={saving}>
          {submitLabel}
        </Button>
      </form>
    </>
  );
}

/** Champ de formulaire étiqueté — `<label>` englobant, donc lié sans `for`. */
export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ComponentChildren;
}) {
  return (
    <label class="field">
      <span>
        {label}
        {hint !== undefined && <span class="muted"> {hint}</span>}
      </span>
      {children}
    </label>
  );
}
