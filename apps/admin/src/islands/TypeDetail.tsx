import { useEffect, useState } from 'preact/hooks';
import type { FieldDef, FieldType } from '@edge-cmf/shared-types';
import { adminApi } from './lib/adminApi';
import { Loading, Notice } from './lib/ui';

interface TypeDetailData {
  type: { id: string; label: string; description: string; kind: 'node' | 'paragraph' };
  fields: FieldDef[];
}

const FIELD_TYPES: { value: FieldType; label: string }[] = [
  { value: 'text', label: 'Texte court' },
  { value: 'textarea', label: 'Texte long' },
  { value: 'richtext', label: 'Texte riche' },
  { value: 'number', label: 'Nombre' },
  { value: 'boolean', label: 'Booléen' },
  { value: 'date', label: 'Date' },
  { value: 'select', label: 'Liste (options)' },
  { value: 'reference', label: 'Référence (UUID)' },
];

export default function TypeDetail({ id }: { id: string }) {
  const [detail, setDetail] = useState<TypeDetailData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [flabel, setFlabel] = useState('');
  const [fieldType, setFieldType] = useState<FieldType>('text');
  const [options, setOptions] = useState('');
  const [required, setRequired] = useState(false);
  const [weight, setWeight] = useState(0);

  const reload = () => {
    adminApi
      .get<{ success: true; data: TypeDetailData }>(`/api/types?id=${id}`)
      .then((res) => setDetail(res.data))
      .catch((e: Error) => setError(e.message));
  };

  useEffect(reload, [id]);

  const addField = async (e: Event) => {
    e.preventDefault();
    try {
      await adminApi.post('/api/types', {
        _action: 'create-field',
        contentTypeId: id,
        name,
        label: flabel,
        fieldType,
        options,
        required,
        weight,
      });
      setName('');
      setFlabel('');
      setOptions('');
      setRequired(false);
      setWeight(0);
      reload();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const deleteField = async (fieldId: string) => {
    try {
      await adminApi.post('/api/types', { _action: 'delete-field', id: fieldId });
      reload();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const deleteType = async () => {
    if (detail === null || !confirm('Supprimer ce type ?')) return;
    try {
      await adminApi.post('/api/types', { _action: 'delete-type', id: detail.type.id });
      window.location.href = detail.type.kind === 'paragraph' ? '/paragraphs' : '/types';
    } catch (e) {
      setError((e as Error).message);
    }
  };

  if (error !== null && detail === null) return <Notice kind="error">Erreur : {error}</Notice>;
  if (detail === null) return <Loading />;

  const isParagraph = detail.type.kind === 'paragraph';
  const backUrl = isParagraph ? '/paragraphs' : '/types';

  return (
    <>
      <p>
        <a href={backUrl}>← {isParagraph ? 'Types de paragraphes' : 'Types de contenu'}</a>
      </p>
      <h1>
        {detail.type.label} <code class="muted">{detail.type.id}</code>{' '}
        <span class="badge">{isParagraph ? 'Paragraphe' : 'Nœud'}</span>
      </h1>
      {detail.type.description !== '' && <p class="muted">{detail.type.description}</p>}
      {error !== null && <Notice kind="error">Erreur : {error}</Notice>}

      <h2>Champs</h2>
      {detail.fields.length === 0 && <p class="muted">Aucun champ pour le moment.</p>}
      {detail.fields.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Champ</th>
              <th>Libellé</th>
              <th>Type</th>
              <th>Requis</th>
              <th>Options</th>
              <th>Poids</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {detail.fields.map((f) => (
              <tr>
                <td>
                  <code>{f.name}</code>
                </td>
                <td>{f.label}</td>
                <td>{f.fieldType}</td>
                <td>{f.required ? 'oui' : 'non'}</td>
                <td class="muted">{f.settings.options?.join(', ') ?? ''}</td>
                <td>{f.weight}</td>
                <td>
                  <button type="button" class="danger" onClick={() => deleteField(f.id)}>
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <details open={detail.fields.length === 0}>
        <summary>Ajouter un champ</summary>
        <form class="stack" onSubmit={addField}>
          <label class="field">
            Nom machine
            <input
              value={name}
              pattern="[a-z][a-z0-9_]*"
              maxLength={64}
              required
              onInput={(e) => setName((e.currentTarget as HTMLInputElement).value)}
            />
          </label>
          <label class="field">
            Libellé
            <input value={flabel} maxLength={255} required onInput={(e) => setFlabel((e.currentTarget as HTMLInputElement).value)} />
          </label>
          <label class="field">
            Type de champ
            <select value={fieldType} onChange={(e) => setFieldType((e.currentTarget as HTMLSelectElement).value as FieldType)}>
              {FIELD_TYPES.map((ft) => (
                <option value={ft.value}>{ft.label}</option>
              ))}
            </select>
          </label>
          <label class="field">
            Options (pour « Liste », séparées par des virgules)
            <input
              value={options}
              placeholder="rouge, vert, bleu"
              onInput={(e) => setOptions((e.currentTarget as HTMLInputElement).value)}
            />
          </label>
          <label class="field-inline">
            <input type="checkbox" checked={required} onChange={(e) => setRequired((e.currentTarget as HTMLInputElement).checked)} />{' '}
            Requis
          </label>
          <label class="field">
            Poids
            <input type="number" value={weight} onInput={(e) => setWeight(Number((e.currentTarget as HTMLInputElement).value))} />
          </label>
          <button type="submit">Ajouter</button>
        </form>
      </details>

      <hr />
      <button type="button" class="danger" onClick={deleteType}>
        Supprimer ce type
      </button>
    </>
  );
}
