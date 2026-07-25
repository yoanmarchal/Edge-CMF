import { Blocks, FileText, Shapes } from 'lucide-preact';
import { api } from './lib/contract';
import { useResource } from './lib/hooks';
import { IconLabel, Loading, Notice } from './lib/ui';

export default function Dashboard() {
  // Comptage en SQL côté worker : trois listes chargées puis mesurées en
  // `.length` donnaient un total faux dès 100 contenus (limite de la route).
  const stats = useResource(() => api.stats());

  if (stats.error !== null) return <Notice kind="error">Erreur : {stats.error}</Notice>;
  if (stats.data === null) return <Loading />;

  const { nodes, publishedNodes, types, paragraphTypes } = stats.data;

  return (
    <>
      <ul>
        <li>
          <a href="/content">
            <IconLabel icon={FileText} size={16}>
              {nodes} contenu(s) — dont {publishedNodes} publié(s)
            </IconLabel>
          </a>
        </li>
        <li>
          <a href="/types">
            <IconLabel icon={Shapes} size={16}>
              {types} type(s) de contenu
            </IconLabel>
          </a>
        </li>
        <li>
          <a href="/paragraphs">
            <IconLabel icon={Blocks} size={16}>
              {paragraphTypes} type(s) de paragraphe
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
