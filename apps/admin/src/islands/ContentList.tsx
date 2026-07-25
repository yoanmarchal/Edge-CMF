import { CircleCheck, CircleDashed, Plus, Trash2 } from 'lucide-preact';
import { api, type AdminNode, type ContentTypeSummary } from './lib/contract';
import { useMutation, useResource } from './lib/hooks';
import { ActionButton, ActionLink, AsyncView, DataTable, IconLabel, Notice } from './lib/ui';
import { routes } from '../lib/routes';

export default function ContentList({ canWrite }: { canWrite: boolean }) {
  const nodes = useResource(() => api.nodes.list());
  const types = useResource(() => api.types.list('node'));
  const mutation = useMutation();

  const remove = (node: AdminNode) =>
    void mutation.run(() => api.nodes.remove(node.id), {
      confirm: `Supprimer le contenu « ${node.title} » ?`,
      onDone: nodes.reload,
    });

  const typeList: ContentTypeSummary[] = types.data ?? [];

  return (
    <>
      {mutation.error !== null && <Notice kind="error">Erreur : {mutation.error}</Notice>}

      {canWrite && typeList.length > 0 && (
        <p class="action-row">
          <span>Créer :</span>
          {typeList.map((t) => (
            <ActionLink key={t.id} icon={Plus} href={routes.content.new(t.id)}>
              {t.label}
            </ActionLink>
          ))}
        </p>
      )}

      <AsyncView
        resource={nodes}
        empty={
          typeList.length === 0
            ? "Aucun contenu, et aucun type de contenu défini : commencez par en créer un dans « Types de contenu »."
            : 'Aucun contenu pour le moment.'
        }
      >
        {(rows: AdminNode[]) => (
          <DataTable
            rows={rows}
            rowKey={(n) => n.id}
            columns={[
              { header: 'Titre', cell: (n) => <a href={routes.content.edit(n.id)}>{n.title}</a> },
              { header: 'Type', cell: (n) => n.contentType },
              {
                header: 'Statut',
                cell: (n) =>
                  n.status ? (
                    <IconLabel icon={CircleCheck} class="status-ok">
                      Publié
                    </IconLabel>
                  ) : (
                    <IconLabel icon={CircleDashed} class="muted">
                      Brouillon
                    </IconLabel>
                  ),
              },
              { header: 'Slug', cell: (n) => `/${n.slug}`, muted: true },
              {
                cell: (n) =>
                  canWrite ? (
                    <ActionButton icon={Trash2} danger disabled={mutation.busy} onClick={() => remove(n)}>
                      Supprimer
                    </ActionButton>
                  ) : null,
              },
            ]}
          />
        )}
      </AsyncView>
    </>
  );
}
