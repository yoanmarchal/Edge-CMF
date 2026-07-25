import type { FieldDef } from '@edge-cmf/shared-types';
import type { JSX } from 'preact';
import { Plus } from 'lucide-preact';
import { ActionButton, RemoveButton } from './lib/ui';
import MediaPicker from './MediaPicker';

interface Props {
  def: FieldDef;
  value: unknown;
  onChange: (name: string, value: unknown) => void;
}

/** Valeur par défaut d'un item ajouté à un champ multiple. */
function emptyItem(def: FieldDef): unknown {
  if (def.fieldType === 'boolean') return false;
  if (def.fieldType === 'number') return 0;
  return '';
}

/** Contrôle d'une valeur UNITAIRE — réutilisé tel quel par le mode multiple. */
function SingleControl({
  def,
  id,
  label,
  value,
  onValue,
}: {
  def: FieldDef;
  id: string;
  /** Nom accessible du contrôle. Fourni en cardinalité multiple, où chaque
   *  valeur a besoin d'être distinguée (« Auteurs — valeur 2 »). En valeur
   *  unique, le <label> englobant suffit et `label` reste indéfini. */
  label?: string;
  value: unknown;
  onValue: (v: unknown) => void;
}): JSX.Element {
  const str = value === undefined || value === null ? '' : String(value);

  switch (def.fieldType) {
    case 'textarea':
    case 'richtext':
      return (
        <textarea
          id={id}
          aria-label={label}
          rows={5}
          required={def.required}
          value={str}
          onInput={(e) => onValue((e.currentTarget as HTMLTextAreaElement).value)}
        />
      );
    case 'boolean':
      return (
        <input
          id={id}
          aria-label={label}
          type="checkbox"
          checked={value === true}
          onChange={(e) => onValue((e.currentTarget as HTMLInputElement).checked)}
        />
      );
    case 'number':
      return (
        <input
          id={id}
          aria-label={label}
          type="number"
          step="any"
          value={str}
          required={def.required}
          min={def.settings.min}
          max={def.settings.max}
          onInput={(e) => onValue(Number((e.currentTarget as HTMLInputElement).value))}
        />
      );
    case 'date':
      return (
        <input
          id={id}
          aria-label={label}
          type="date"
          value={str}
          required={def.required}
          onInput={(e) => onValue((e.currentTarget as HTMLInputElement).value)}
        />
      );
    case 'select':
      return (
        <select
          id={id}
          aria-label={label}
          required={def.required}
          value={str}
          onChange={(e) => onValue((e.currentTarget as HTMLSelectElement).value)}
        >
          {!def.required && <option value="">—</option>}
          {(def.settings.options ?? []).map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      );
    case 'reference':
      return (
        <input
          id={id}
          aria-label={label}
          value={str}
          placeholder="UUID du nœud référencé"
          required={def.required}
          onInput={(e) => onValue((e.currentTarget as HTMLInputElement).value)}
        />
      );
    case 'media':
      return <MediaPicker value={str} clearable={!def.required} onValue={onValue} />;
    default:
      return (
        <input
          id={id}
          aria-label={label}
          value={str}
          maxLength={255}
          required={def.required}
          onInput={(e) => onValue((e.currentTarget as HTMLInputElement).value)}
        />
      );
  }
}

/** Équivalent Preact de components/FieldInput.astro — champ dynamique de la Field API. */
export default function FieldInput({ def, value, onChange }: Props) {
  const id = `field_${def.name}`;

  // Cardinalité multiple : la valeur est un tableau du type de base,
  // avec ajout/retrait d'items (équivalent "unlimited values" de Drupal).
  if (def.settings.multiple === true) {
    const items: unknown[] = Array.isArray(value) ? value : [];
    const setItems = (next: unknown[]) => onChange(def.name, next.length > 0 ? next : undefined);

    // `role="group"` + `aria-labelledby` : l'équivalent ARIA d'un
    // <fieldset>/<legend>, sans hériter du style encadré des fieldsets.
    // Avant, le libellé était un <span> orphelin et les `id` générés
    // n'étaient reliés à rien : les champs multiples n'avaient aucun nom.
    return (
      <div class="field" role="group" aria-labelledby={`${id}_label`}>
        <span id={`${id}_label`}>
          {def.label}
          {def.required && <span class="muted"> (requis)</span>} <span class="badge">multiple</span>
        </span>
        {items.map((item, i) => (
          <div class="field-multi-item" key={i}>
            <SingleControl
              def={def}
              id={`${id}_${i}`}
              label={`${def.label} — valeur ${i + 1}`}
              value={item}
              onValue={(v) => {
                if (v === undefined) {
                  setItems(items.filter((_, idx) => idx !== i));
                } else {
                  setItems(items.map((it, idx) => (idx === i ? v : it)));
                }
              }}
            />
            <RemoveButton title={`Retirer la valeur ${i + 1} de ${def.label}`} onClick={() => setItems(items.filter((_, idx) => idx !== i))} />
          </div>
        ))}
        <p class="action-row">
          <ActionButton icon={Plus} badge onClick={() => setItems([...items, emptyItem(def)])}>
            Ajouter une valeur
          </ActionButton>
        </p>
      </div>
    );
  }

  return (
    <label class="field">
      <span>
        {def.label}
        {def.required && <span class="muted"> (requis)</span>}
      </span>
      <SingleControl def={def} id={id} value={value} onValue={(v) => onChange(def.name, v)} />
    </label>
  );
}
