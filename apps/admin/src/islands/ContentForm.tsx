import { useEffect, useState } from 'preact/hooks';
import type { FieldDef } from '@edge-cmf/shared-types';
import { Trash2 } from 'lucide-preact';
import { adminApi } from './lib/adminApi';
import { ActionButton, Loading, Notice, SubmitButton } from './lib/ui';
import FieldInput from './FieldInput';
import ParagraphsEditor, {
  toEntries,
  toValues,
  type ParagraphEntry,
  type ParagraphTypeDef,
  type ParagraphValue,
} from './ParagraphsEditor';

interface TypeDetail {
  type: { id: string; label: string };
  fields: FieldDef[];
}
interface Term {
  id: string;
  label: string;
}
interface Vocabulary {
  id: string;
  label: string;
  terms: Term[];
}
interface NodeDetail {
  id: string;
  title: string;
  slug: string;
  body: string;
  contentType: string;
  status: boolean;
  fields: Record<string, unknown>;
  terms: Term[];
  paragraphs: ParagraphValue[];
}

const SITE_URL = import.meta.env.PUBLIC_SITE_URL ?? '';

/**
 * Palette de blocs de l'éditeur. `expand=fields` joint la Field API de chaque
 * type à la liste : UN appel, là où la boucle séquentielle précédente en
 * faisait 1 + N (donc 11 allers-retours pour 10 types de paragraphe, à chaque
 * ouverture du formulaire).
 */
async function loadParagraphTypes(): Promise<ParagraphTypeDef[]> {
  const { data } = await adminApi.get<{ data: ParagraphTypeDef[] }>(
    '/api/types?kind=paragraph&expand=fields',
  );
  return data;
}

interface Props {
  mode: 'new' | 'edit';
  typeId?: string;
  nodeId?: string;
}

export default function ContentForm({ mode, typeId, nodeId }: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [typeDetail, setTypeDetail] = useState<TypeDetail | null>(null);
  const [vocabularies, setVocabularies] = useState<Vocabulary[]>([]);
  const [paragraphTypes, setParagraphTypes] = useState<ParagraphTypeDef[]>([]);
  const [node, setNode] = useState<NodeDetail | null>(null);

  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [body, setBody] = useState('');
  const [status, setStatus] = useState(true);
  const [fieldValues, setFieldValues] = useState<Record<string, unknown>>({});
  const [termIds, setTermIds] = useState<Set<string>>(new Set());
  const [paragraphs, setParagraphs] = useState<ParagraphEntry[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const [vocabRes, pTypes] = await Promise.all([
          adminApi.get<{ data: Vocabulary[] }>('/api/taxonomy'),
          loadParagraphTypes(),
        ]);
        setVocabularies(vocabRes.data);
        setParagraphTypes(pTypes);

        if (mode === 'edit' && nodeId !== undefined) {
          const nodeRes = await adminApi.get<{ success: true; data: NodeDetail }>(`/api/nodes?id=${nodeId}`);
          const n = nodeRes.data;
          setNode(n);
          setTitle(n.title);
          setSlug(n.slug);
          setBody(n.body);
          setStatus(n.status);
          setFieldValues(n.fields);
          setTermIds(new Set(n.terms.map((t) => t.id)));
          setParagraphs(toEntries(n.paragraphs));
          const typeRes = await adminApi.get<{ success: true; data: TypeDetail }>(
            `/api/types?id=${n.contentType}`,
          );
          setTypeDetail(typeRes.data);
        } else {
          const id = typeId ?? 'page';
          const typeRes = await adminApi.get<{ success: true; data: TypeDetail }>(`/api/types?id=${id}`);
          setTypeDetail(typeRes.data);
          setStatus(true);
        }
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, typeId, nodeId]);

  const toggleTerm = (id: string) => {
    setTermIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const submit = async (e: Event) => {
    e.preventDefault();
    if (typeDetail === null) return;
    setSaving(true);
    setError(null);
    try {
      const payload = {
        title,
        slug,
        body,
        contentType: typeDetail.type.id,
        status,
        fields: fieldValues,
        termIds: [...termIds],
        paragraphs: toValues(paragraphs),
      };
      if (mode === 'edit' && node !== null) {
        await adminApi.post('/api/nodes', { _action: 'update', id: node.id, ...payload });
      } else {
        await adminApi.post('/api/nodes', { _action: 'create', ...payload });
      }
      window.location.href = mode === 'edit' ? '/content?ok=contenu-modifie' : '/content?ok=contenu-cree';
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  };

  const remove = async () => {
    if (node === null || !confirm('Supprimer ce contenu ?')) return;
    try {
      await adminApi.post('/api/nodes', { _action: 'delete', id: node.id });
      window.location.href = '/content?ok=contenu-supprime';
    } catch (e) {
      setError((e as Error).message);
    }
  };

  if (loading) return <Loading />;
  if (error !== null && typeDetail === null) return <Notice kind="error">Erreur : {error}</Notice>;
  if (typeDetail === null) return null;

  return (
    <>
      <h1>{mode === 'edit' ? `Éditer : ${title}` : `Nouveau : ${typeDetail.type.label}`}</h1>
      {mode === 'edit' && node !== null && (
        <p class="muted">
          Type : {node.contentType} — <a href={`${SITE_URL}/${node.slug}`}>voir la page</a>
        </p>
      )}
      {error !== null && <Notice kind="error">Erreur : {error}</Notice>}

      <form class="stack" onSubmit={submit}>
        <label class="field">
          Titre
          <input value={title} minLength={3} maxLength={255} required onInput={(e) => setTitle(e.currentTarget.value)} />
        </label>
        <label class="field">
          Slug (a-z, 0-9, tirets)
          <input
            value={slug}
            pattern="[a-z0-9-]+"
            required
            onInput={(e) => setSlug((e.currentTarget as HTMLInputElement).value)}
          />
        </label>
        <label class="field">
          Corps
          <textarea rows={8} value={body} onInput={(e) => setBody((e.currentTarget as HTMLTextAreaElement).value)} />
        </label>

        {typeDetail.fields.length > 0 && <h2>Champs personnalisés</h2>}
        {typeDetail.fields.map((def) => (
          <FieldInput
            key={def.id}
            def={def}
            value={fieldValues[def.name]}
            onChange={(name, v) => setFieldValues((prev) => ({ ...prev, [name]: v }))}
          />
        ))}

        {paragraphTypes.length > 0 && (
          <ParagraphsEditor paragraphTypes={paragraphTypes} value={paragraphs} onChange={setParagraphs} />
        )}

        {vocabularies.some((v) => v.terms.length > 0) && <h2>Taxonomie</h2>}
        {vocabularies.map((v) =>
          v.terms.length === 0 ? null : (
            <fieldset key={v.id}>
              <legend>{v.label}</legend>
              <div class="checkbox-group">
                {v.terms.map((t) => (
                  <label class="field-inline" key={t.id}>
                    <input type="checkbox" checked={termIds.has(t.id)} onChange={() => toggleTerm(t.id)} /> {t.label}
                  </label>
                ))}
              </div>
            </fieldset>
          ),
        )}

        <label class="field-inline">
          <input type="checkbox" checked={status} onChange={(e) => setStatus((e.currentTarget as HTMLInputElement).checked)} />{' '}
          Publié
        </label>

        <SubmitButton saving={saving}>{mode === 'edit' ? 'Enregistrer' : 'Créer'}</SubmitButton>
      </form>

      {mode === 'edit' && (
        <ActionButton icon={Trash2} danger onClick={() => void remove()}>
          Supprimer ce contenu
        </ActionButton>
      )}
    </>
  );
}
