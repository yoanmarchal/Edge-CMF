import { useEffect, useState } from 'preact/hooks';
import { adminApi } from './lib/adminApi';
import { Loading, Notice } from './lib/ui';

interface Term {
  id: string;
  label: string;
  slug: string;
}
interface Vocabulary {
  id: string;
  label: string;
  terms: Term[];
}

export default function Taxonomy() {
  const [vocabularies, setVocabularies] = useState<Vocabulary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [vid, setVid] = useState('');
  const [vlabel, setVlabel] = useState('');

  const reload = () => {
    adminApi
      .get<{ data: Vocabulary[] }>('/api/taxonomy')
      .then((res) => setVocabularies(res.data))
      .catch((e: Error) => setError(e.message));
  };

  useEffect(reload, []);

  const createVocab = async (e: Event) => {
    e.preventDefault();
    try {
      await adminApi.post('/api/taxonomy', { _action: 'create-vocab', id: vid, label: vlabel });
      setVid('');
      setVlabel('');
      reload();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const deleteVocab = async (id: string) => {
    if (!confirm('Supprimer ce vocabulaire et tous ses termes ?')) return;
    try {
      await adminApi.post('/api/taxonomy', { _action: 'delete-vocab', id });
      reload();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const deleteTerm = async (id: string) => {
    try {
      await adminApi.post('/api/taxonomy', { _action: 'delete-term', id });
      reload();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const createTerm = async (vocabularyId: string, label: string, slug: string) => {
    try {
      await adminApi.post('/api/taxonomy', { _action: 'create-term', vocabularyId, label, slug });
      reload();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <>
      <h1>Taxonomie</h1>
      {error !== null && <Notice kind="error">Erreur : {error}</Notice>}

      <form class="stack" onSubmit={createVocab}>
        <h2>Nouveau vocabulaire</h2>
        <label class="field">
          Nom machine
          <input
            value={vid}
            pattern="[a-z][a-z0-9_]*"
            maxLength={64}
            required
            onInput={(e) => setVid((e.currentTarget as HTMLInputElement).value)}
          />
        </label>
        <label class="field">
          Libellé
          <input value={vlabel} maxLength={255} required onInput={(e) => setVlabel((e.currentTarget as HTMLInputElement).value)} />
        </label>
        <button type="submit">Créer</button>
      </form>

      {vocabularies === null ? (
        <Loading />
      ) : (
        vocabularies.map((v) => <VocabSection v={v} onDeleteVocab={deleteVocab} onDeleteTerm={deleteTerm} onCreateTerm={createTerm} />)
      )}
    </>
  );
}

function VocabSection({
  v,
  onDeleteVocab,
  onDeleteTerm,
  onCreateTerm,
}: {
  v: Vocabulary;
  onDeleteVocab: (id: string) => void;
  onDeleteTerm: (id: string) => void;
  onCreateTerm: (vocabularyId: string, label: string, slug: string) => void;
}) {
  const [label, setLabel] = useState('');
  const [slug, setSlug] = useState('');

  return (
    <section>
      <h2>
        {v.label} <code class="muted">{v.id}</code>{' '}
        <button type="button" class="danger" onClick={() => onDeleteVocab(v.id)}>
          Supprimer
        </button>
      </h2>

      <table>
        <thead>
          <tr>
            <th>Terme</th>
            <th>Slug</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {v.terms.map((t) => (
            <tr>
              <td>{t.label}</td>
              <td class="muted">{t.slug}</td>
              <td>
                <button type="button" class="danger" onClick={() => onDeleteTerm(t.id)}>
                  ×
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <form
        class="stack"
        onSubmit={(e) => {
          e.preventDefault();
          onCreateTerm(v.id, label, slug);
          setLabel('');
          setSlug('');
        }}
      >
        <label class="field">
          Nouveau terme
          <input value={label} maxLength={255} required onInput={(e) => setLabel((e.currentTarget as HTMLInputElement).value)} />
        </label>
        <label class="field">
          Slug
          <input value={slug} pattern="[a-z0-9-]+" required onInput={(e) => setSlug((e.currentTarget as HTMLInputElement).value)} />
        </label>
        <button type="submit">Ajouter</button>
      </form>
    </section>
  );
}
