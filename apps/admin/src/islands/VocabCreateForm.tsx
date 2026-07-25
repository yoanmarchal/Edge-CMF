import { useState } from 'preact/hooks';
import { adminApi } from './lib/adminApi';
import { BackLink, Notice, SubmitButton } from './lib/ui';

export default function VocabCreateForm() {
  const [id, setId] = useState('');
  const [label, setLabel] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const create = async (e: Event) => {
    e.preventDefault();
    setSaving(true);
    try {
      await adminApi.post('/api/taxonomy', { _action: 'create-vocab', id, label });
      window.location.href = '/taxonomy?ok=vocabulaire-cree';
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  };

  return (
    <>
      <h1>Nouveau vocabulaire</h1>
      <BackLink href="/taxonomy">Retour à la taxonomie</BackLink>
      {error !== null && <Notice kind="error">Erreur : {error}</Notice>}

      <form class="stack" onSubmit={create}>
        <label class="field">
          Nom machine
          <input
            value={id}
            pattern="[a-z][a-z0-9_]*"
            maxLength={64}
            required
            onInput={(e) => setId((e.currentTarget as HTMLInputElement).value)}
          />
        </label>
        <label class="field">
          Libellé
          <input value={label} maxLength={255} required onInput={(e) => setLabel((e.currentTarget as HTMLInputElement).value)} />
        </label>
        <SubmitButton saving={saving}>Créer</SubmitButton>
      </form>
    </>
  );
}
