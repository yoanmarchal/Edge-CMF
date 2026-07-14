import { useEffect, useState } from 'preact/hooks';
import { adminApi } from './lib/adminApi';
import { Loading, Notice } from './lib/ui';

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
        <a href="/admin/paragraphs">Paragraphes</a>.
      </p>
    ),
    idPlaceholder: 'tid',
    backTo: '/admin/types',
  },
  paragraph: {
    title: 'Types de paragraphes',
    intro: (
      <p class="muted">
        Composants structurés réutilisables dans tous les contenus (équivalent Paragraphs de Drupal). Chaque type
        défini ici apparaît comme bloc ajoutable dans l'éditeur.
      </p>
    ),
    idPlaceholder: 'pid',
    backTo: '/admin/paragraphs',
  },
} as const;

export default function TypesList({ kind }: Props) {
  const [types, setTypes] = useState<TypeRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [id, setId] = useState('');
  const [label, setLabel] = useState('');
  const [description, setDescription] = useState('');
  const [open, setOpen] = useState(false);

  const copy = COPY[kind];

  const reload = () => {
    adminApi
      .get<{ data: TypeRow[] }>(`/api/admin/types?kind=${kind}`)
      .then((res) => setTypes(res.data))
      .catch((e: Error) => setError(e.message));
  };

  useEffect(reload, [kind]);

  const create = async (e: Event) => {
    e.preventDefault();
    try {
      await adminApi.post('/api/admin/types', { _action: 'create-type', id, label, description, kind });
      setId('');
      setLabel('');
      setDescription('');
      setOpen(false);
      reload();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <>
      <h1>{copy.title}</h1>
      {copy.intro}
      {error !== null && <Notice kind="error">Erreur : {error}</Notice>}

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
                  <a href={`/admin/types/${t.id}`}>{t.label}</a>
                </td>
                <td>
                  <code>{t.id}</code>
                </td>
                <td class="muted">{t.description}</td>
                <td>
                  <a href={`/admin/types/${t.id}`}>Gérer les champs →</a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <details open={open} onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}>
        <summary>Nouveau {kind === 'node' ? 'type de contenu' : 'type de paragraphe'}</summary>
        <form class="stack" onSubmit={create}>
          <label class="field">
            Nom machine (a-z, 0-9, _)
            <input
              value={id}
              pattern="[a-z][a-z0-9_]*"
              maxLength={64}
              required
              placeholder={copy.idPlaceholder}
              onInput={(e) => setId((e.currentTarget as HTMLInputElement).value)}
            />
          </label>
          <label class="field">
            Libellé
            <input value={label} maxLength={255} required onInput={(e) => setLabel((e.currentTarget as HTMLInputElement).value)} />
          </label>
          <label class="field">
            Description
            <input
              value={description}
              maxLength={1024}
              onInput={(e) => setDescription((e.currentTarget as HTMLInputElement).value)}
            />
          </label>
          <button type="submit">Créer</button>
        </form>
      </details>
    </>
  );
}
