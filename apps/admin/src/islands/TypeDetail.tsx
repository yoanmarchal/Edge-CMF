import { useState } from 'preact/hooks';
import { Plus, Trash2 } from 'lucide-preact';
import type { FieldDef, FieldType } from '@edge-cmf/shared-types';
import { api } from './lib/contract';
import { useMutation, useResource } from './lib/hooks';
import {
  ActionButton,
  AsyncView,
  BackLink,
  DataTable,
  EmptyState,
  Field,
  Notice,
  RemoveButton,
  SubmitButton,
} from './lib/ui';
import { bundleSection } from '../lib/routes';

const FIELD_TYPES: { value: FieldType; label: string }[] = [
  { value: 'text', label: 'Texte court' },
  { value: 'textarea', label: 'Texte long' },
  { value: 'richtext', label: 'Texte riche' },
  { value: 'number', label: 'Nombre' },
  { value: 'boolean', label: 'Booléen' },
  { value: 'date', label: 'Date' },
  { value: 'select', label: 'Sélection (options)' },
  { value: 'reference', label: 'Référence (UUID)' },
  { value: 'media', label: 'Média (bibliothèque)' },
];

export default function TypeDetail({ id }: { id: string }) {
  const detail = useResource(() => api.types.detail(id), [id]);
  const mutation = useMutation();

  const [name, setName] = useState('');
  const [label, setLabel] = useState('');
  const [fieldType, setFieldType] = useState<FieldType>('text');
  const [options, setOptions] = useState('');
  const [required, setRequired] = useState(false);
  const [multiple, setMultiple] = useState(false);
  const [weight, setWeight] = useState(0);

  const resetForm = () => {
    setName('');
    setLabel('');
    setOptions('');
    setRequired(false);
    setMultiple(false);
    setWeight(0);
  };

  const addField = (e: Event) => {
    e.preventDefault();
    void mutation.run(
      () => api.types.createField({ contentTypeId: id, name, label, fieldType, options, required, multiple, weight }),
      {
        onDone: () => {
          resetForm();
          detail.reload();
        },
      },
    );
  };

  const removeField = (field: FieldDef) =>
    void mutation.run(() => api.types.removeField(field.id), {
      // Destructif : les valeurs déjà saisies dans ce champ sur les contenus
      // existants deviennent inaccessibles.
      confirm: `Supprimer le champ « ${field.label} » ? Les valeurs déjà saisies seront perdues.`,
      onDone: detail.reload,
    });

  const removeType = (isParagraph: boolean) =>
    void mutation.run(() => api.types.remove(id), {
      confirm: 'Supprimer ce type ?',
      redirect: { to: bundleSection(isParagraph).href, flash: 'type-supprime' },
    });

  return (
    <>
      {mutation.error !== null && <Notice kind="error">Erreur : {mutation.error}</Notice>}

      <AsyncView resource={detail}>
        {({ type, fields }) => {
          const isParagraph = type.kind === 'paragraph';
          return (
            <>
              {/* Le titre (nom machine) est rendu en SSR par la page. Le lien
                  retour reste ici : la section parente dépend du `kind`, que
                  seul l'îlot connaît une fois le type chargé. */}
              <BackLink href={bundleSection(isParagraph).href}>
                {bundleSection(isParagraph).label}
              </BackLink>
              <p>
                <strong>{type.label}</strong>{' '}
                <span class="badge">{isParagraph ? 'Paragraphe' : 'Nœud'}</span>
              </p>
              {type.description !== '' && <p class="muted">{type.description}</p>}

              <h2>Champs</h2>
              {fields.length === 0 ? (
                <EmptyState>Aucun champ — ce type ne portera que le titre, le slug et le corps.</EmptyState>
              ) : (
                <DataTable
                  rows={fields}
                  rowKey={(f) => f.id}
                  columns={[
                    { header: 'Champ', cell: (f) => <code>{f.name}</code> },
                    { header: 'Libellé', cell: (f) => f.label },
                    {
                      header: 'Type',
                      cell: (f) => (
                        <>
                          {f.fieldType}
                          {f.settings.multiple === true && <span class="badge">multiple</span>}
                        </>
                      ),
                    },
                    { header: 'Requis', cell: (f) => (f.required ? 'oui' : 'non') },
                    { header: 'Options', cell: (f) => f.settings.options?.join(', ') ?? '', muted: true },
                    { header: 'Poids', cell: (f) => f.weight },
                    {
                      cell: (f) => <RemoveButton title="Supprimer ce champ" onClick={() => removeField(f)} />,
                    },
                  ]}
                />
              )}

              <details open={fields.length === 0}>
                <summary>Ajouter un champ</summary>
                <form class="stack" onSubmit={addField}>
                  <Field label="Nom machine" hint="(a-z, 0-9, _)">
                    <input
                      value={name}
                      pattern="[a-z][a-z0-9_]*"
                      maxLength={64}
                      required
                      onInput={(e) => setName((e.currentTarget as HTMLInputElement).value)}
                    />
                  </Field>
                  <Field label="Libellé">
                    <input
                      value={label}
                      maxLength={255}
                      required
                      onInput={(e) => setLabel((e.currentTarget as HTMLInputElement).value)}
                    />
                  </Field>
                  <Field label="Type de champ">
                    <select
                      value={fieldType}
                      onChange={(e) => setFieldType((e.currentTarget as HTMLSelectElement).value as FieldType)}
                    >
                      {FIELD_TYPES.map((ft) => (
                        <option key={ft.value} value={ft.value}>
                          {ft.label}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Options" hint="(pour « Sélection », séparées par des virgules)">
                    <input
                      value={options}
                      placeholder="rouge, vert, bleu"
                      onInput={(e) => setOptions((e.currentTarget as HTMLInputElement).value)}
                    />
                  </Field>
                  <label class="field-inline">
                    <input
                      type="checkbox"
                      checked={required}
                      onChange={(e) => setRequired((e.currentTarget as HTMLInputElement).checked)}
                    />{' '}
                    Requis
                  </label>
                  <label class="field-inline">
                    <input
                      type="checkbox"
                      checked={multiple}
                      onChange={(e) => setMultiple((e.currentTarget as HTMLInputElement).checked)}
                    />{' '}
                    Multiple — plusieurs valeurs itérables (liste)
                  </label>
                  <Field label="Poids">
                    <input
                      type="number"
                      value={weight}
                      onInput={(e) => setWeight(Number((e.currentTarget as HTMLInputElement).value))}
                    />
                  </Field>
                  <SubmitButton icon={Plus} saving={mutation.busy}>
                    Ajouter
                  </SubmitButton>
                </form>
              </details>

              <ActionButton icon={Trash2} danger disabled={mutation.busy} onClick={() => removeType(isParagraph)}>
                Supprimer ce type
              </ActionButton>
            </>
          );
        }}
      </AsyncView>
    </>
  );
}
