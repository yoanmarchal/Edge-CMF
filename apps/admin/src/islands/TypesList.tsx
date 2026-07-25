import { Plus } from 'lucide-preact';
import { api, type ContentTypeSummary } from './lib/contract';
import { useResource } from './lib/hooks';
import { ActionLink, AsyncView, DataTable } from './lib/ui';

interface Props {
  kind: 'node' | 'paragraph';
}

/** Titre, description et fil d'Ariane sont rendus en SSR par la page. */
const COPY = {
  node: {
    newHref: '/types/new',
    newLabel: 'Nouveau type de contenu',
    empty: 'Aucun type de contenu — créez-en un pour commencer à saisir des contenus.',
  },
  paragraph: {
    newHref: '/paragraphs/new',
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
        <ActionLink icon={Plus} href={copy.newHref}>
          {copy.newLabel}
        </ActionLink>
      </p>

      <AsyncView resource={types} empty={copy.empty}>
        {(rows: ContentTypeSummary[]) => (
          <DataTable
            rows={rows}
            rowKey={(t) => t.id}
            columns={[
              { header: 'Libellé', cell: (t) => <a href={`/types/${t.id}`}>{t.label}</a> },
              { header: 'Nom machine', cell: (t) => <code>{t.id}</code> },
              { header: 'Description', cell: (t) => t.description, muted: true },
              { cell: (t) => <a href={`/types/${t.id}`}>Gérer les champs →</a> },
            ]}
          />
        )}
      </AsyncView>
    </>
  );
}
