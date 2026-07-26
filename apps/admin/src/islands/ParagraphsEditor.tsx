import { Plus, X } from 'lucide-preact';
import type { FieldDef } from '@edge-cmf/shared-types';
import { Button } from './lib/ui';
import FieldInput from './FieldInput';

export interface ParagraphTypeDef {
  readonly id: string;
  readonly label: string;
  readonly fields: readonly FieldDef[];
}
/** Forme envoyée à l'API — pas d'identité, l'ordre fait foi (champ `weight`). */
export interface ParagraphValue {
  type: string;
  fields: Record<string, unknown>;
}

/**
 * Même paragraphe, doté d'une identité stable côté client. Sans elle, la clé
 * de liste serait l'index : retirer un bloc ferait glisser tous les suivants
 * d'un cran et Preact réutiliserait leurs composants — l'état INTERNE d'un
 * champ (bibliothèque déjà chargée d'un MediaPicker, position du curseur,
 * focus) se retrouverait sur le bloc voisin. `uid` est purement local et
 * retiré avant l'envoi (voir `toValues`).
 */
export interface ParagraphEntry extends ParagraphValue {
  readonly uid: string;
}

let uidSeq = 0;
const nextUid = (): string => `p${++uidSeq}`;

/** Paragraphes venant de l'API → entrées éditables (identité attribuée). */
export function toEntries(values: readonly ParagraphValue[]): ParagraphEntry[] {
  return values.map((p) => ({ ...p, uid: nextUid() }));
}

/** Entrées éditables → payload API (identité retirée). */
export function toValues(entries: readonly ParagraphEntry[]): ParagraphValue[] {
  return entries.map(({ uid: _uid, ...p }) => p);
}

interface Props {
  paragraphTypes: readonly ParagraphTypeDef[];
  value: readonly ParagraphEntry[];
  onChange: (next: ParagraphEntry[]) => void;
}

/** Équivalent Preact de components/ParagraphsEditor.astro — état contrôlé par le parent. */
export default function ParagraphsEditor({ paragraphTypes, value, onChange }: Props) {
  const typeById = new Map(paragraphTypes.map((t) => [t.id, t]));

  const add = (type: string) => onChange([...value, { uid: nextUid(), type, fields: {} }]);
  const remove = (uid: string) => onChange(value.filter((p) => p.uid !== uid));
  const setField = (uid: string, name: string, v: unknown) => {
    onChange(value.map((p) => (p.uid === uid ? { ...p, fields: { ...p.fields, [name]: v } } : p)));
  };

  return (
    <div>
      <h2>Paragraphes</h2>
      <p class="muted">Compose le contenu par blocs structurés, réordonnables à la création.</p>

      <div>
        {value.map((p) => {
          const t = typeById.get(p.type);
          if (t === undefined) return null;
          return (
            <div class="paragraph-item" key={p.uid}>
              <p>
                <strong>{t.label}</strong>{' '}
                <Button icon={X} tone="danger" size="sm" onClick={() => remove(p.uid)}>
                  Retirer
                </Button>
              </p>
              {t.fields.map((def) => (
                <FieldInput
                  key={def.id}
                  def={def}
                  value={p.fields[def.name]}
                  onChange={(name, v) => setField(p.uid, name, v)}
                />
              ))}
            </div>
          );
        })}
      </div>

      <p class="action-row">
        <span>Ajouter :</span>
        {paragraphTypes.map((t) => (
          <Button key={t.id} icon={Plus} onClick={() => add(t.id)}>
            {t.label}
          </Button>
        ))}
      </p>
    </div>
  );
}
