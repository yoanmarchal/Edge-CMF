import { useEffect, useState } from 'preact/hooks';
import { Plus, Trash2 } from 'lucide-preact';
import { adminApi } from './lib/adminApi';
import { ActionButton, ActionLink, Loading, Notice, RemoveButton } from './lib/ui';

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

  const deleteTerm = async (id: string, label: string) => {
    // Suppression immédiate côté serveur : elle se confirme, comme celle du
    // vocabulaire. Seul le retrait d'un paragraphe reste sans confirmation —
    // il n'est persisté qu'à l'enregistrement du formulaire de contenu.
    if (!confirm(`Supprimer le terme « ${label} » ?`)) return;
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
        <ActionLink icon={Plus} href="/taxonomy/new">
          Nouveau vocabulaire
        </ActionLink>
      </p>

      {vocabularies === null ? (
        <Loading />
      ) : (
        vocabularies.map((v) => (
          <VocabSection key={v.id} v={v} onDeleteVocab={deleteVocab} onDeleteTerm={deleteTerm} />
        ))
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
  onDeleteTerm: (id: string, label: string) => void;
}) {
  return (
    <section>
      <div class="section-head">
        <h2>
          {v.label} <code class="muted">{v.id}</code>
        </h2>
        <ActionButton icon={Trash2} badge danger onClick={() => onDeleteVocab(v.id)}>
          Supprimer le vocabulaire
        </ActionButton>
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
            <tr key={t.id}>
              <td>{t.label}</td>
              <td class="muted">{t.slug}</td>
              <td>
                <RemoveButton title="Supprimer ce terme" onClick={() => onDeleteTerm(t.id, t.label)} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <p class="action-row">
        <ActionLink icon={Plus} href={`/taxonomy/${v.id}/new`}>
          Nouveau terme
        </ActionLink>
      </p>
    </section>
  );
}
