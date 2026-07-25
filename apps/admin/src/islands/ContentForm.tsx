import { useEffect, useState } from 'preact/hooks';
import type { FieldDef } from '@edge-cmf/shared-types';
import { Trash2 } from 'lucide-preact';
import {
  api,
  type AdminNode,
  type ContentTypeSummary,
  type ContentTypeWithFields,
  type VocabularyWithTerms,
} from './lib/contract';
import { useMutation, useResource } from './lib/hooks';
import { ActionButton, AsyncView, Field, Notice, SubmitButton } from './lib/ui';
import FieldInput from './FieldInput';
import ParagraphsEditor, { toEntries, toValues, type ParagraphEntry } from './ParagraphsEditor';

const SITE_URL = import.meta.env.PUBLIC_SITE_URL ?? '';

interface Props {
  mode: 'new' | 'edit';
  typeId?: string;
  nodeId?: string;
}

/** Tout ce qu'il faut charger avant de pouvoir afficher le formulaire. */
interface FormData {
  readonly bundle: { readonly type: ContentTypeSummary; readonly fields: FieldDef[] };
  readonly vocabularies: VocabularyWithTerms[];
  readonly paragraphTypes: ContentTypeWithFields[];
  readonly node: AdminNode | null;
}

async function loadFormData(mode: 'new' | 'edit', typeId?: string, nodeId?: string): Promise<FormData> {
  // Les trois lectures indépendantes partent ensemble ; seul le bundle du
  // nœud édité doit attendre de savoir de quel type il est.
  // `listWithFields` évite le 1 + N d'un appel de détail par type de bloc.
  const [vocabularies, paragraphTypes, node] = await Promise.all([
    api.taxonomy.list(),
    api.types.listWithFields('paragraph'),
    mode === 'edit' && nodeId !== undefined ? api.nodes.detail(nodeId) : Promise.resolve(null),
  ]);
  const bundle = await api.types.detail(node !== null ? node.contentType : (typeId ?? 'page'));
  return { bundle, vocabularies, paragraphTypes, node };
}

export default function ContentForm({ mode, typeId, nodeId }: Props) {
  const form = useResource(() => loadFormData(mode, typeId, nodeId), [mode, typeId, nodeId]);
  const mutation = useMutation();

  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [body, setBody] = useState('');
  const [status, setStatus] = useState(true);
  const [fieldValues, setFieldValues] = useState<Record<string, unknown>>({});
  const [termIds, setTermIds] = useState<Set<string>>(new Set());
  const [paragraphs, setParagraphs] = useState<ParagraphEntry[]>([]);

  // Initialisation de l'état de saisie dès que le nœud est chargé. En mode
  // création il n'y a rien à reprendre : les valeurs par défaut suffisent.
  const node = form.data?.node ?? null;
  useEffect(() => {
    if (node === null) return;
    setTitle(node.title);
    setSlug(node.slug);
    setBody(node.body);
    setStatus(node.status);
    setFieldValues(node.fields);
    setTermIds(new Set(node.terms.map((t) => t.id)));
    setParagraphs(toEntries(node.paragraphs));
  }, [node]);

  const toggleTerm = (id: string) => {
    setTermIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const submit = (e: Event, bundleId: string) => {
    e.preventDefault();
    const payload = {
      title,
      slug,
      body,
      contentType: bundleId,
      status,
      fields: fieldValues,
      termIds: [...termIds],
      paragraphs: toValues(paragraphs),
    };
    void mutation.run(
      () => (node !== null ? api.nodes.update(node.id, payload) : api.nodes.create(payload)),
      {
        redirect: { to: '/content', flash: node !== null ? 'contenu-modifie' : 'contenu-cree' },
      },
    );
  };

  const remove = () => {
    if (node === null) return;
    void mutation.run(() => api.nodes.remove(node.id), {
      confirm: `Supprimer le contenu « ${node.title} » ?`,
      redirect: { to: '/content', flash: 'contenu-supprime' },
    });
  };

  return (
    <>
      {mutation.error !== null && <Notice kind="error">Erreur : {mutation.error}</Notice>}

      <AsyncView resource={form}>
        {({ bundle, vocabularies, paragraphTypes, node: loaded }) => (
          <>
            {/* Titre rendu en SSR par la page ; ici, seul le contexte que
                l'îlot est le seul à connaître. */}
            {loaded !== null ? (
              <p class="muted">
                Type : {loaded.contentType} — <a href={`${SITE_URL}/${loaded.slug}`}>voir la page</a>
              </p>
            ) : (
              <p class="muted">Type : {bundle.type.label}</p>
            )}

            <form class="stack" onSubmit={(e) => submit(e, bundle.type.id)}>
              <Field label="Titre">
                <input
                  value={title}
                  minLength={3}
                  maxLength={255}
                  required
                  onInput={(e) => setTitle((e.currentTarget as HTMLInputElement).value)}
                />
              </Field>
              <Field label="Slug" hint="(a-z, 0-9, tirets)">
                <input
                  value={slug}
                  pattern="[a-z0-9-]+"
                  required
                  onInput={(e) => setSlug((e.currentTarget as HTMLInputElement).value)}
                />
              </Field>
              <Field label="Corps">
                <textarea
                  rows={8}
                  value={body}
                  onInput={(e) => setBody((e.currentTarget as HTMLTextAreaElement).value)}
                />
              </Field>

              {bundle.fields.length > 0 && <h2>Champs personnalisés</h2>}
              {bundle.fields.map((def) => (
                <FieldInput
                  key={def.id}
                  def={def}
                  value={fieldValues[def.name]}
                  onChange={(name, v) => setFieldValues((prev) => ({ ...prev, [name]: v }))}
                />
              ))}

              {paragraphTypes.length > 0 && (
                <ParagraphsEditor
                  paragraphTypes={paragraphTypes}
                  value={paragraphs}
                  onChange={setParagraphs}
                />
              )}

              {vocabularies.some((v) => v.terms.length > 0) && <h2>Taxonomie</h2>}
              {vocabularies.map((v) =>
                v.terms.length === 0 ? null : (
                  <fieldset key={v.id}>
                    <legend>{v.label}</legend>
                    <div class="checkbox-group">
                      {v.terms.map((t) => (
                        <label class="field-inline" key={t.id}>
                          <input
                            type="checkbox"
                            checked={termIds.has(t.id)}
                            onChange={() => toggleTerm(t.id)}
                          />{' '}
                          {t.label}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                ),
              )}

              <label class="field-inline">
                <input
                  type="checkbox"
                  checked={status}
                  onChange={(e) => setStatus((e.currentTarget as HTMLInputElement).checked)}
                />{' '}
                Publié
              </label>

              <SubmitButton saving={mutation.busy}>{loaded !== null ? 'Enregistrer' : 'Créer'}</SubmitButton>
            </form>

            {loaded !== null && (
              <ActionButton icon={Trash2} danger disabled={mutation.busy} onClick={remove}>
                Supprimer ce contenu
              </ActionButton>
            )}
          </>
        )}
      </AsyncView>
    </>
  );
}
