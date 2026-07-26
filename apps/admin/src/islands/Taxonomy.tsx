import { Plus, Trash2 } from 'lucide-preact';
import { api, type VocabularyWithTerms } from './lib/contract';
import { useMutation, useResource } from './lib/hooks';
import { AsyncView, Button, DataTable, EmptyState, Notice, RemoveButton } from './lib/ui';
import { routes } from '../lib/routes';

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
        <Button variant="primary" icon={Plus} href={routes.taxonomy.new}>
          Nouveau vocabulaire
        </Button>
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
                  <Button
                    icon={Trash2}
                    tone="danger"
                    size="sm"
                    disabled={mutation.busy}
                    onClick={() => removeVocabulary(v)}
                  >
                    Supprimer le vocabulaire
                  </Button>
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
                  <Button icon={Plus} href={routes.taxonomy.newTerm(v.id)}>
                    Nouveau terme
                  </Button>
                </p>
              </section>
            ))}
          </>
        )}
      </AsyncView>
    </>
  );
}
