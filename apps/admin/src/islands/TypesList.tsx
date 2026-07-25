import { useEffect, useState } from 'preact/hooks';
import { Plus } from 'lucide-preact';
import { adminApi } from './lib/adminApi';
import { ActionLink, Loading, Notice } from './lib/ui';

interface TypeRow {
  id: string;
  label: string;
  description: string;
}

interface Props {
  kind: 'node' | 'paragraph';
}

const COPY = {
  node: {
    title: 'Types de contenu',
    intro: (
      <p class="muted">
        Les bundles de nœuds (pages, articles…). Les composants réutilisables sont dans{' '}
        <a href="/paragraphs">Paragraphes</a>.
      </p>
    ),
    newHref: '/types/new',
    newLabel: 'Nouveau type de contenu',
  },
  paragraph: {
    title: 'Types de paragraphes',
    intro: (
      <p class="muted">
        Composants structurés réutilisables dans tous les contenus (équivalent Paragraphs de Drupal). Chaque type
        défini ici apparaît comme bloc ajoutable dans l'éditeur.
      </p>
    ),
    newHref: '/paragraphs/new',
    newLabel: 'Nouveau type de paragraphe',
  },
} as const;

export default function TypesList({ kind }: Props) {
  const [types, setTypes] = useState<TypeRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const copy = COPY[kind];

  const reload = () => {
    adminApi
      .get<{ data: TypeRow[] }>(`/api/types?kind=${kind}`)
      .then((res) => setTypes(res.data))
      .catch((e: Error) => setError(e.message));
  };

  useEffect(reload, [kind]);

  return (
    <>
      <h1>{copy.title}</h1>
      {copy.intro}
      {error !== null && <Notice kind="error">Erreur : {error}</Notice>}

      <p class="action-row">
        <ActionLink icon={Plus} href={copy.newHref}>
          {copy.newLabel}
        </ActionLink>
      </p>

      {types === null ? (
        <Loading />
      ) : (
        <table>
          <thead>
            <tr>
              <th>Libellé</th>
              <th>Nom machine</th>
              <th>Description</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {types.map((t) => (
              <tr>
                <td>
                  <a href={`/types/${t.id}`}>{t.label}</a>
                </td>
                <td>
                  <code>{t.id}</code>
                </td>
                <td class="muted">{t.description}</td>
                <td>
                  <a href={`/types/${t.id}`}>Gérer les champs →</a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
