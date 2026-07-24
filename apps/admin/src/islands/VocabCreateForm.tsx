import { useState } from 'preact/hooks';
import { adminApi } from './lib/adminApi';
import { Notice } from './lib/ui';

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
      window.location.href = '/taxonomy';
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  };

  return (
    <>
      <h1>Nouveau vocabulaire</h1>
      <p class="muted">
        <a href="/taxonomy">← Retour à la taxonomie</a>
      </p>
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
        <button type="submit" disabled={saving}>
          Créer
        </button>
      </form>
    </>
  );
}
