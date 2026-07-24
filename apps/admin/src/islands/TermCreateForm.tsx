import { useEffect, useState } from 'preact/hooks';
import { adminApi } from './lib/adminApi';
import { Notice } from './lib/ui';

interface Vocabulary {
  id: string;
  label: string;
}

export default function TermCreateForm({ vid }: { vid: string }) {
  const [vocabLabel, setVocabLabel] = useState<string | null>(null);
  const [label, setLabel] = useState('');
  const [slug, setSlug] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    adminApi
      .get<{ data: Vocabulary[] }>('/api/taxonomy')
      .then((res) => {
        const vocab = res.data.find((v) => v.id === vid);
        if (vocab === undefined) {
          setError(`Vocabulaire inconnu : ${vid}`);
        } else {
          setVocabLabel(vocab.label);
        }
      })
      .catch((e: Error) => setError(e.message));
  }, [vid]);

  const create = async (e: Event) => {
    e.preventDefault();
    setSaving(true);
    try {
      await adminApi.post('/api/taxonomy', { _action: 'create-term', vocabularyId: vid, label, slug });
      window.location.href = '/taxonomy';
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  };

  return (
    <>
      <h1>
        Nouveau terme — {vocabLabel ?? vid} <code class="muted">{vid}</code>
      </h1>
      <p class="muted">
        <a href="/taxonomy">← Retour à la taxonomie</a>
      </p>
      {error !== null && <Notice kind="error">Erreur : {error}</Notice>}

      <form class="stack" onSubmit={create}>
        <label class="field">
          Terme
          <input value={label} maxLength={255} required onInput={(e) => setLabel((e.currentTarget as HTMLInputElement).value)} />
        </label>
        <label class="field">
          Slug
          <input value={slug} pattern="[a-z0-9-]+" required onInput={(e) => setSlug((e.currentTarget as HTMLInputElement).value)} />
        </label>
        <button type="submit" disabled={saving}>
          Ajouter
        </button>
      </form>
    </>
  );
}
