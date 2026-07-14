import type { FieldDef } from '@edge-cmf/shared-types';
import type { JSX } from 'preact';

interface Props {
  def: FieldDef;
  value: unknown;
  onChange: (name: string, value: unknown) => void;
}

/** Équivalent Preact de components/FieldInput.astro — champ dynamique de la Field API. */
export default function FieldInput({ def, value, onChange }: Props) {
  const str = value === undefined || value === null ? '' : String(value);
  const id = `field_${def.name}`;

  let control: JSX.Element;
  switch (def.fieldType) {
    case 'textarea':
    case 'richtext':
      control = (
        <textarea
          id={id}
          rows={5}
          required={def.required}
          value={str}
          onInput={(e) => onChange(def.name, (e.currentTarget as HTMLTextAreaElement).value)}
        />
      );
      break;
    case 'boolean':
      control = (
        <input
          id={id}
          type="checkbox"
          checked={value === true}
          onChange={(e) => onChange(def.name, (e.currentTarget as HTMLInputElement).checked)}
        />
      );
      break;
    case 'number':
      control = (
        <input
          id={id}
          type="number"
          step="any"
          value={str}
          required={def.required}
          min={def.settings.min}
          max={def.settings.max}
          onInput={(e) => onChange(def.name, Number((e.currentTarget as HTMLInputElement).value))}
        />
      );
      break;
    case 'date':
      control = (
        <input
          id={id}
          type="date"
          value={str}
          required={def.required}
          onInput={(e) => onChange(def.name, (e.currentTarget as HTMLInputElement).value)}
        />
      );
      break;
    case 'select':
      control = (
        <select
          id={id}
          required={def.required}
          value={str}
          onChange={(e) => onChange(def.name, (e.currentTarget as HTMLSelectElement).value)}
        >
          {!def.required && <option value="">—</option>}
          {(def.settings.options ?? []).map((opt) => (
            <option value={opt}>{opt}</option>
          ))}
        </select>
      );
      break;
    case 'reference':
      control = (
        <input
          id={id}
          value={str}
          placeholder="UUID du nœud référencé"
          required={def.required}
          onInput={(e) => onChange(def.name, (e.currentTarget as HTMLInputElement).value)}
        />
      );
      break;
    default:
      control = (
        <input
          id={id}
          value={str}
          maxLength={255}
          required={def.required}
          onInput={(e) => onChange(def.name, (e.currentTarget as HTMLInputElement).value)}
        />
      );
  }

  return (
    <label class="field">
      <span>
        {def.label}
        {def.required && <span class="muted"> (requis)</span>}
      </span>
      {control}
    </label>
  );
}
