import { Plus } from 'lucide-preact';
import { api, type ContentTypeSummary } from './lib/contract';
import { useResource } from './lib/hooks';
import { AsyncView, Button, DataTable } from './lib/ui';
import { routes } from '../lib/routes';

interface Props {
  kind: 'node' | 'paragraph';
}

/** Titre, description et fil d'Ariane sont rendus en SSR par la page. */
const COPY = {
  node: {
    newHref: routes.types.new,
    newLabel: 'Nouveau type de contenu',
    empty: 'Aucun type de contenu — créez-en un pour commencer à saisir des contenus.',
  },
  paragraph: {
    newHref: routes.paragraphs.new,
    newLabel: 'Nouveau type de paragraphe',
    empty: "Aucun type de paragraphe — l'éditeur de contenu n'affichera donc aucun bloc à ajouter.",
  },
} as const;

export default function TypesList({ kind }: Props) {
  const types = useResource(() => api.types.list(kind), [kind]);
  const copy = COPY[kind];

  return (
    <>
      <p class="action-row">
        <Button variant="primary" icon={Plus} href={copy.newHref}>
          {copy.newLabel}
        </Button>
      </p>

      <AsyncView resource={types} empty={copy.empty}>
        {(rows: ContentTypeSummary[]) => (
          <DataTable
            rows={rows}
            rowKey={(t) => t.id}
            columns={[
              { header: 'Libellé', cell: (t) => <a href={routes.types.detail(t.id)}>{t.label}</a> },
              { header: 'Nom machine', cell: (t) => <code>{t.id}</code> },
              { header: 'Description', cell: (t) => t.description, muted: true },
              { cell: (t) => <a href={routes.types.detail(t.id)}>Gérer les champs →</a> },
            ]}
          />
        )}
      </AsyncView>
    </>
  );
}
