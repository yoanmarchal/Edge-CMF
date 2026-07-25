import { useState } from 'preact/hooks';
import { api } from './lib/contract';
import { useMutation } from './lib/hooks';
import { Field, FormScreen } from './lib/ui';
import { routes } from '../lib/routes';

export default function VocabCreateForm() {
  const [id, setId] = useState('');
  const [label, setLabel] = useState('');
  const mutation = useMutation();

  const create = (e: Event) => {
    e.preventDefault();
    void mutation.run(() => api.taxonomy.createVocabulary({ id, label }), {
      redirect: { to: routes.taxonomy.list, flash: 'vocabulaire-cree' },
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
          placeholder="tags"
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
    </FormScreen>
  );
}
