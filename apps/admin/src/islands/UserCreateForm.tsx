import { useState } from 'preact/hooks';
import type { Role } from '@edge-cmf/shared-types';
import { adminApi } from './lib/adminApi';
import { Notice } from './lib/ui';

const ROLES: Role[] = ['admin', 'editor', 'viewer'];

export default function UserCreateForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>('viewer');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const create = async (e: Event) => {
    e.preventDefault();
    setSaving(true);
    try {
      await adminApi.post('/api/users', { _action: 'create', email, password, role });
      window.location.href = '/users';
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  };

  return (
    <>
      <h1>Nouvel utilisateur</h1>
      <p class="muted">
        <a href="/users">← Retour à la liste</a>
      </p>
      {error !== null && <Notice kind="error">Erreur : {error}</Notice>}

      <form class="stack" onSubmit={create}>
        <label class="field">
          Email
          <input type="email" value={email} required onInput={(e) => setEmail((e.currentTarget as HTMLInputElement).value)} />
        </label>
        <label class="field">
          Mot de passe
          <input
            type="password"
            value={password}
            minLength={8}
            required
            onInput={(e) => setPassword((e.currentTarget as HTMLInputElement).value)}
          />
        </label>
        <label class="field">
          Rôle
          <select value={role} onChange={(e) => setRole((e.currentTarget as HTMLSelectElement).value as Role)}>
            {ROLES.map((r) => (
              <option value={r}>{r}</option>
            ))}
          </select>
        </label>
        <button type="submit" disabled={saving}>
          Créer
        </button>
      </form>
    </>
  );
}
