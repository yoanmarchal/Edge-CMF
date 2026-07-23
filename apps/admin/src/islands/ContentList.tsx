import { useEffect, useState } from 'preact/hooks';
import { adminApi } from './lib/adminApi';
import { Loading, Notice } from './lib/ui';

interface NodeRow {
  id: string;
  title: string;
  slug: string;
  contentType: string;
  status: boolean;
}
interface TypeRow {
  id: string;
  label: string;
}

export default function ContentList({ canWrite }: { canWrite: boolean }) {
  const [nodes, setNodes] = useState<NodeRow[] | null>(null);
  const [types, setTypes] = useState<TypeRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const reload = () => {
    Promise.all([
      adminApi.get<{ data: NodeRow[] }>('/api/nodes'),
      adminApi.get<{ data: TypeRow[] }>('/api/types?kind=node'),
    ])
      .then(([n, t]) => {
        setNodes(n.data);
        setTypes(t.data);
      })
      .catch((e: Error) => setError(e.message));
  };

  useEffect(reload, []);

  const remove = async (id: string) => {
    if (!confirm('Supprimer ce contenu ?')) return;
    try {
      await adminApi.post('/api/nodes', { _action: 'delete', id });
      reload();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <>
      <h1>Contenu</h1>
      {error !== null && <Notice kind="error">Erreur : {error}</Notice>}

      {canWrite && types.length > 0 && (
        <p class="action-row">
          <span>Créer :</span>
          {types.map((t) => (
            <a class="badge" href={`/content/new?type=${t.id}`}>
              + {t.label}
            </a>
          ))}
        </p>
      )}

      {nodes === null ? (
        <Loading />
      ) : (
        <>
          <table>
            <thead>
              <tr>
                <th>Titre</th>
                <th>Type</th>
                <th>Statut</th>
                <th>Slug</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {nodes.map((n) => (
                <tr>
                  <td>
                    <a href={`/content/edit/${n.id}`}>{n.title}</a>
                  </td>
                  <td>{n.contentType}</td>
                  <td>{n.status ? 'Publié' : 'Brouillon'}</td>
                  <td class="muted">/{n.slug}</td>
                  <td>
                    {canWrite && (
                      <button type="button" class="danger" onClick={() => remove(n.id)}>
                        Supprimer
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {nodes.length === 0 && <p>Aucun contenu.</p>}
        </>
      )}
    </>
  );
}
