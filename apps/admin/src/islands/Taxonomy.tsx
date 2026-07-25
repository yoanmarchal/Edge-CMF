import { Plus, Trash2 } from 'lucide-preact';
import { api, type VocabularyWithTerms } from './lib/contract';
import { useMutation, useResource } from './lib/hooks';
import { ActionButton, ActionLink, AsyncView, DataTable, EmptyState, Notice, RemoveButton } from './lib/ui';

export default function Taxonomy() {
  const vocabularies = useResource(() => api.taxonomy.list());
  const mutation = useMutation();

  const removeVocabulary = (v: VocabularyWithTerms) =>
    void mutation.run(() => api.taxonomy.removeVocabulary(v.id), {
      confirm: `Supprimer le vocabulaire « ${v.label} » et ses ${v.terms.length} terme(s) ?`,
      onDone: vocabularies.reload,
    });

  // Suppression immédiate côté serveur : elle se confirme, comme celle du
  // vocabulaire. La confirmation passe par `useMutation` — seul endroit à
  // modifier le jour où l'on remplacera `confirm()` par un <dialog>.
  const removeTerm = (id: string, label: string) =>
    void mutation.run(() => api.taxonomy.removeTerm(id), {
      confirm: `Supprimer le terme « ${label} » ?`,
      onDone: vocabularies.reload,
    });

  return (
    <>
      {mutation.error !== null && <Notice kind="error">Erreur : {mutation.error}</Notice>}

      <p class="action-row">
        <ActionLink icon={Plus} href="/taxonomy/new">
          Nouveau vocabulaire
        </ActionLink>
      </p>

      <AsyncView
        resource={vocabularies}
        empty="Aucun vocabulaire — créez-en un pour pouvoir classer les contenus."
      >
        {(rows: VocabularyWithTerms[]) => (
          <>
            {rows.map((v) => (
              <section key={v.id}>
                <div class="section-head">
                  <h2>
                    {v.label} <code class="muted">{v.id}</code>
                  </h2>
                  <ActionButton
                    icon={Trash2}
                    badge
                    danger
                    disabled={mutation.busy}
                    onClick={() => removeVocabulary(v)}
                  >
                    Supprimer le vocabulaire
                  </ActionButton>
                </div>

                {v.terms.length === 0 ? (
                  <EmptyState>Aucun terme dans ce vocabulaire.</EmptyState>
                ) : (
                  <DataTable
                    rows={v.terms}
                    rowKey={(t) => t.id}
                    columns={[
                      { header: 'Terme', cell: (t) => t.label },
                      { header: 'Slug', cell: (t) => t.slug, muted: true },
                      {
                        cell: (t) => (
                          <RemoveButton title="Supprimer ce terme" onClick={() => removeTerm(t.id, t.label)} />
                        ),
                      },
                    ]}
                  />
                )}

                <p class="action-row">
                  <ActionLink icon={Plus} href={`/taxonomy/${v.id}/new`}>
                    Nouveau terme
                  </ActionLink>
                </p>
              </section>
            ))}
          </>
        )}
      </AsyncView>
    </>
  );
}
