import { useState } from 'preact/hooks';
import { adminApi } from './lib/adminApi';
import { BackLink, Notice, SubmitButton } from './lib/ui';

interface Props {
  kind: 'node' | 'paragraph';
}

const COPY = {
  node: { title: 'Nouveau type de contenu', idPlaceholder: 'tid', backTo: '/types' },
  paragraph: { title: 'Nouveau type de paragraphe', idPlaceholder: 'pid', backTo: '/paragraphs' },
} as const;

export default function TypeCreateForm({ kind }: Props) {
  const [id, setId] = useState('');
  const [label, setLabel] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const copy = COPY[kind];

  const create = async (e: Event) => {
    e.preventDefault();
    setSaving(true);
    try {
      await adminApi.post('/api/types', { _action: 'create-type', id, label, description, kind });
      window.location.href = `${copy.backTo}?ok=type-cree`;
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  };

  return (
    <>
      <h1>{copy.title}</h1>
      <BackLink href={copy.backTo}>Retour à la liste</BackLink>
      {error !== null && <Notice kind="error">Erreur : {error}</Notice>}

      <form class="stack" onSubmit={create}>
        <label class="field">
          Nom machine (a-z, 0-9, _)
          <input
            value={id}
            pattern="[a-z][a-z0-9_]*"
            maxLength={64}
            required
            placeholder={copy.idPlaceholder}
            onInput={(e) => setId((e.currentTarget as HTMLInputElement).value)}
          />
        </label>
        <label class="field">
          Libellé
          <input value={label} maxLength={255} required onInput={(e) => setLabel((e.currentTarget as HTMLInputElement).value)} />
        </label>
        <label class="field">
          Description
          <input
            value={description}
            maxLength={1024}
            onInput={(e) => setDescription((e.currentTarget as HTMLInputElement).value)}
          />
        </label>
        <SubmitButton saving={saving}>Créer</SubmitButton>
      </form>
    </>
  );
}
