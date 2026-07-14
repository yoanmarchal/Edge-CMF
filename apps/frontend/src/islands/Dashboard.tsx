import { useEffect, useState } from 'preact/hooks';
import { adminApi } from './lib/adminApi';
import { Loading, Notice } from './lib/ui';

interface Stats {
  nodes: number;
  types: number;
  paragraphTypes: number;
}

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      adminApi.get<{ data: unknown[] }>('/api/admin/nodes'),
      adminApi.get<{ data: unknown[] }>('/api/admin/types?kind=node'),
      adminApi.get<{ data: unknown[] }>('/api/admin/types?kind=paragraph'),
    ])
      .then(([nodes, types, paragraphTypes]) =>
        setStats({ nodes: nodes.data.length, types: types.data.length, paragraphTypes: paragraphTypes.data.length }),
      )
      .catch((e: Error) => setError(e.message));
  }, []);

  if (error !== null) return <Notice kind="error">Erreur : {error}</Notice>;
  if (stats === null) return <Loading />;

  return (
    <>
      <ul>
        <li>
          <a href="/admin/content">{stats.nodes} contenu(s)</a>
        </li>
        <li>
          <a href="/admin/types">{stats.types} type(s) de contenu</a>
        </li>
        <li>
          <a href="/admin/paragraphs">{stats.paragraphTypes} type(s) de paragraphe</a>
        </li>
      </ul>
      <p class="muted">
        API headless publique : déployer le gateway-worker puis consommer <code>/v1/nodes</code> avec une clé API
        (header <code>x-api-key</code>).
      </p>
    </>
  );
}
