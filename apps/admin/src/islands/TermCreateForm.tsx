import { useState } from 'preact/hooks';
import { api } from './lib/contract';
import { useMutation, useResource } from './lib/hooks';
import { Field, FormScreen, Notice } from './lib/ui';

export default function TermCreateForm({ vid }: { vid: string }) {
  const [label, setLabel] = useState('');
  const [slug, setSlug] = useState('');
  const mutation = useMutation();

  // Le vocabulaire n'est chargé que pour vérifier qu'il existe et en afficher
  // le libellé : la page a déjà rendu le titre et le nom machine en SSR.
  const vocabularies = useResource(() => api.taxonomy.list());
  const vocabulary = vocabularies.data?.find((v) => v.id === vid) ?? null;
  const unknownVocabulary = vocabularies.data !== null && vocabulary === null;

  const create = (e: Event) => {
    e.preventDefault();
    void mutation.run(() => api.taxonomy.createTerm({ vocabularyId: vid, label, slug }), {
      redirect: { to: '/taxonomy', flash: 'terme-cree' },
    });
  };

  if (unknownVocabulary) return <Notice kind="error">Vocabulaire inconnu : {vid}</Notice>;

  return (
    <>
      {vocabulary !== null && <p class="muted">Vocabulaire : {vocabulary.label}</p>}
      <FormScreen
        onSubmit={create}
        saving={mutation.busy}
        error={mutation.error ?? vocabularies.error}
        submitLabel="Ajouter"
      >
        <Field label="Terme">
          <input
            value={label}
            maxLength={255}
            required
            onInput={(e) => setLabel((e.currentTarget as HTMLInputElement).value)}
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
      </FormScreen>
    </>
  );
}
