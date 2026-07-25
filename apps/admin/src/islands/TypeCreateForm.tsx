import { useState } from 'preact/hooks';
import { api } from './lib/contract';
import { useMutation } from './lib/hooks';
import { Field, FormScreen } from './lib/ui';

interface Props {
  kind: 'node' | 'paragraph';
}

/** Titre et fil d'Ariane sont rendus en SSR par la page. */
const COPY = {
  node: { idPlaceholder: 'article', backTo: '/types' },
  paragraph: { idPlaceholder: 'hero_banner', backTo: '/paragraphs' },
} as const;

export default function TypeCreateForm({ kind }: Props) {
  const [id, setId] = useState('');
  const [label, setLabel] = useState('');
  const [description, setDescription] = useState('');
  const mutation = useMutation();

  const copy = COPY[kind];

  const create = (e: Event) => {
    e.preventDefault();
    void mutation.run(() => api.types.create({ id, label, description, kind }), {
      redirect: { to: copy.backTo, flash: 'type-cree' },
    });
  };

  return (
    <FormScreen onSubmit={create} saving={mutation.busy} error={mutation.error} submitLabel="Créer">
      <Field label="Nom machine" hint="(a-z, 0-9, _)">
        <input
          value={id}
          pattern="[a-z][a-z0-9_]*"
          maxLength={64}
          required
          placeholder={copy.idPlaceholder}
          onInput={(e) => setId((e.currentTarget as HTMLInputElement).value)}
        />
      </Field>
      <Field label="Libellé">
        <input
          value={label}
          maxLength={255}
          required
          onInput={(e) => setLabel((e.currentTarget as HTMLInputElement).value)}
        />
      </Field>
      <Field label="Description">
        <input
          value={description}
          maxLength={1024}
          onInput={(e) => setDescription((e.currentTarget as HTMLInputElement).value)}
        />
      </Field>
    </FormScreen>
  );
}
