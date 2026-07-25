import { useEffect, useState } from 'preact/hooks';
import { Blocks, FileText, Shapes } from 'lucide-preact';
import type { ContentStats } from '@edge-cmf/shared-types';
import { adminApi } from './lib/adminApi';
import { IconLabel, Loading, Notice } from './lib/ui';

export default function Dashboard() {
  const [stats, setStats] = useState<ContentStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Comptage en SQL côté worker : trois listes chargées puis mesurées en
  // `.length` donnaient un total faux dès 100 contenus (limite de la route).
  useEffect(() => {
    adminApi
      .get<{ data: ContentStats }>('/api/stats')
      .then((res) => setStats(res.data))
      .catch((e: Error) => setError(e.message));
  }, []);

  if (error !== null) return <Notice kind="error">Erreur : {error}</Notice>;
  if (stats === null) return <Loading />;

  return (
    <>
      <ul>
        <li>
          <a href="/content">
            <IconLabel icon={FileText} size={16}>
              {stats.nodes} contenu(s) — dont {stats.publishedNodes} publié(s)
            </IconLabel>
          </a>
        </li>
        <li>
          <a href="/types">
            <IconLabel icon={Shapes} size={16}>
              {stats.types} type(s) de contenu
            </IconLabel>
          </a>
        </li>
        <li>
          <a href="/paragraphs">
            <IconLabel icon={Blocks} size={16}>
              {stats.paragraphTypes} type(s) de paragraphe
            </IconLabel>
          </a>
        </li>
      </ul>
      <p class="muted">
        API headless publique : déployer le gateway-worker puis consommer <code>/v1/nodes</code> avec une clé API
        (header <code>x-api-key</code>).
      </p>
    </>
  );
}
