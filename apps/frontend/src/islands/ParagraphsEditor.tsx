import type { FieldDef } from '@edge-cmf/shared-types';
import FieldInput from './FieldInput';

export interface ParagraphTypeDef {
  readonly id: string;
  readonly label: string;
  readonly fields: readonly FieldDef[];
}
export interface ParagraphValue {
  type: string;
  fields: Record<string, unknown>;
}

interface Props {
  paragraphTypes: readonly ParagraphTypeDef[];
  value: readonly ParagraphValue[];
  onChange: (next: ParagraphValue[]) => void;
}

/** Équivalent Preact de components/ParagraphsEditor.astro — état contrôlé par le parent. */
export default function ParagraphsEditor({ paragraphTypes, value, onChange }: Props) {
  const typeById = new Map(paragraphTypes.map((t) => [t.id, t]));

  const add = (type: string) => onChange([...value, { type, fields: {} }]);
  const remove = (i: number) => onChange(value.filter((_, idx) => idx !== i));
  const setField = (i: number, name: string, v: unknown) => {
    const next = value.map((p, idx) => (idx === i ? { ...p, fields: { ...p.fields, [name]: v } } : p));
    onChange(next);
  };

  return (
    <div>
      <h2>Paragraphes</h2>
      <p class="muted">Compose le contenu par blocs structurés, réordonnables à la création.</p>

      <div>
        {value.map((p, i) => {
          const t = typeById.get(p.type);
          if (t === undefined) return null;
          return (
            <div class="paragraph-item">
              <p>
                <strong>{t.label}</strong>{' '}
                <button type="button" class="danger" onClick={() => remove(i)}>
                  Retirer
                </button>
              </p>
              {t.fields.map((def) => (
                <FieldInput def={def} value={p.fields[def.name]} onChange={(name, v) => setField(i, name, v)} />
              ))}
            </div>
          );
        })}
      </div>

      <p class="action-row">
        <span>Ajouter :</span>
        {paragraphTypes.map((t) => (
          <button type="button" class="badge" onClick={() => add(t.id)}>
            + {t.label}
          </button>
        ))}
      </p>
    </div>
  );
}
