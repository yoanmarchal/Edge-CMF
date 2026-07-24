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

  const reload = () => {
    adminApi
      .get<{ data: Vocabulary[] }>('/api/taxonomy')
      .then((res) => setVocabularies(res.data))
      .catch((e: Error) => setError(e.message));
  };

  useEffect(reload, []);

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


  return (
    <>
      <h1>Taxonomie</h1>
      {error !== null && <Notice kind="error">Erreur : {error}</Notice>}

      <p class="action-row">
        <a class="badge" href="/taxonomy/new">
          + Nouveau vocabulaire
        </a>
      </p>

      {vocabularies === null ? (
        <Loading />
      ) : (
        vocabularies.map((v) => <VocabSection v={v} onDeleteVocab={deleteVocab} onDeleteTerm={deleteTerm} />)
      )}
    </>
  );
}

function VocabSection({
  v,
  onDeleteVocab,
  onDeleteTerm,
}: {
  v: Vocabulary;
  onDeleteVocab: (id: string) => void;
  onDeleteTerm: (id: string) => void;
}) {
  return (
    <section>
      <div class="section-head">
        <h2>
          {v.label} <code class="muted">{v.id}</code>
        </h2>
        <button type="button" class="badge danger" onClick={() => onDeleteVocab(v.id)}>
          Supprimer le vocabulaire
        </button>
      </div>

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

      <p class="action-row">
        <a class="badge" href={`/taxonomy/${v.id}/new`}>
          + Nouveau terme
        </a>
      </p>
    </section>
  );
}
