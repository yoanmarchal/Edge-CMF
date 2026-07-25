import { useEffect, useState } from 'preact/hooks';
import { Trash2, UserPlus } from 'lucide-preact';
import type { Role } from '@edge-cmf/shared-types';
import { adminApi } from './lib/adminApi';
import { ActionButton, ActionLink, Loading, Notice } from './lib/ui';

interface UserRow {
  id: string;
  email: string;
  role: Role;
}

const ROLES: Role[] = ['admin', 'editor', 'viewer'];

export default function Users({ selfId }: { selfId: string }) {
  const [users, setUsers] = useState<UserRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = () => {
    adminApi
      .get<{ success: true; data: UserRow[] }>('/api/users')
      .then((res) => setUsers(res.data))
      .catch((e: Error) => setError(e.message));
  };

  useEffect(reload, []);

  const setUserRole = async (id: string, newRole: Role) => {
    try {
      await adminApi.post('/api/users', { _action: 'set-role', id, role: newRole });
      reload();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const remove = async (id: string) => {
    if (!confirm('Supprimer cet utilisateur ?')) return;
    try {
      await adminApi.post('/api/users', { _action: 'delete', id });
      reload();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <>
      <h1>Utilisateurs</h1>
      {error !== null && <Notice kind="error">Erreur : {error}</Notice>}

      <p class="action-row">
        <ActionLink icon={UserPlus} href="/users/new">
          Nouvel utilisateur
        </ActionLink>
      </p>

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
              <tr key={u.id}>
                <td>{u.email}</td>
                <td>
                  {u.id === selfId ? (
                    u.role
                  ) : (
                    <select value={u.role} onChange={(e) => setUserRole(u.id, (e.currentTarget as HTMLSelectElement).value as Role)}>
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  )}
                </td>
                <td>
                  {u.id !== selfId && (
                    <ActionButton icon={Trash2} danger onClick={() => remove(u.id)}>
                      Supprimer
                    </ActionButton>
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
