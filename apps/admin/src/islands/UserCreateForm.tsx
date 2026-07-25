import { useState } from 'preact/hooks';
import { api, type Role } from './lib/contract';
import { useMutation } from './lib/hooks';
import { Field, FormScreen } from './lib/ui';

const ROLES: Role[] = ['admin', 'editor', 'viewer'];

export default function UserCreateForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>('viewer');
  const mutation = useMutation();

  const create = (e: Event) => {
    e.preventDefault();
    void mutation.run(() => api.users.create({ email, password, role }), {
      redirect: { to: '/users', flash: 'utilisateur-cree' },
    });
  };

  return (
    <FormScreen onSubmit={create} saving={mutation.busy} error={mutation.error} submitLabel="Créer">
      <Field label="Email">
        <input
          type="email"
          value={email}
          required
          onInput={(e) => setEmail((e.currentTarget as HTMLInputElement).value)}
        />
      </Field>
      <Field label="Mot de passe" hint="(8 caractères minimum)">
        <input
          type="password"
          value={password}
          minLength={8}
          required
          onInput={(e) => setPassword((e.currentTarget as HTMLInputElement).value)}
        />
      </Field>
      <Field label="Rôle">
        <select value={role} onChange={(e) => setRole((e.currentTarget as HTMLSelectElement).value as Role)}>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </Field>
    </FormScreen>
  );
}
