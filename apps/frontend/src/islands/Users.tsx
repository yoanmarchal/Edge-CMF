import { useEffect, useState } from 'preact/hooks';
import type { Role } from '@edge-cmf/shared-types';
import { adminApi } from './lib/adminApi';
import { Loading, Notice } from './lib/ui';

interface UserRow {
  id: string;
  email: string;
  role: Role;
}

const ROLES: Role[] = ['admin', 'editor', 'viewer'];

export default function Users({ selfId }: { selfId: string }) {
  const [users, setUsers] = useState<UserRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>('viewer');

  const reload = () => {
    adminApi
      .get<{ success: true; data: UserRow[] }>('/api/admin/users')
      .then((res) => setUsers(res.data))
      .catch((e: Error) => setError(e.message));
  };

  useEffect(reload, []);

  const create = async (e: Event) => {
    e.preventDefault();
    try {
      await adminApi.post('/api/admin/users', { _action: 'create', email, password, role });
      setEmail('');
      setPassword('');
      setRole('viewer');
      reload();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const setUserRole = async (id: string, newRole: Role) => {
    try {
      await adminApi.post('/api/admin/users', { _action: 'set-role', id, role: newRole });
      reload();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const remove = async (id: string) => {
    if (!confirm('Supprimer cet utilisateur ?')) return;
    try {
      await adminApi.post('/api/admin/users', { _action: 'delete', id });
      reload();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <>
      <h1>Utilisateurs</h1>
      {error !== null && <Notice kind="error">Erreur : {error}</Notice>}

      <form class="stack" onSubmit={create}>
        <h2>Nouvel utilisateur</h2>
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
        <button type="submit">Créer</button>
      </form>

      {users === null ? (
        <Loading />
      ) : (
        <table>
          <thead>
            <tr>
              <th>Email</th>
              <th>Rôle</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr>
                <td>{u.email}</td>
                <td>
                  {u.id === selfId ? (
                    u.role
                  ) : (
                    <select value={u.role} onChange={(e) => setUserRole(u.id, (e.currentTarget as HTMLSelectElement).value as Role)}>
                      {ROLES.map((r) => (
                        <option value={r}>{r}</option>
                      ))}
                    </select>
                  )}
                </td>
                <td>
                  {u.id !== selfId && (
                    <button type="button" class="danger" onClick={() => remove(u.id)}>
                      Supprimer
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
