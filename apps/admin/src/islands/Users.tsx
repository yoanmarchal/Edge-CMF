import { Trash2, UserPlus } from 'lucide-preact';
import { api, type AdminUser, type Role } from './lib/contract';
import { useMutation, useResource } from './lib/hooks';
import { ActionButton, ActionLink, AsyncView, DataTable, Notice } from './lib/ui';
import { routes } from '../lib/routes';

const ROLES: Role[] = ['admin', 'editor', 'viewer'];

export default function Users({ selfId }: { selfId: string }) {
  const users = useResource(() => api.users.list());
  const mutation = useMutation();

  const setRole = (id: string, role: Role) =>
    void mutation.run(() => api.users.setRole(id, role), { onDone: users.reload });

  const remove = (id: string, email: string) =>
    void mutation.run(() => api.users.remove(id), {
      confirm: `Supprimer le compte ${email} ?`,
      onDone: users.reload,
    });

  return (
    <>
      {mutation.error !== null && <Notice kind="error">Erreur : {mutation.error}</Notice>}

      <p class="action-row">
        <ActionLink icon={UserPlus} href={routes.users.new}>
          Nouvel utilisateur
        </ActionLink>
      </p>

      <AsyncView resource={users}>
        {(rows: AdminUser[]) => (
          <DataTable
            rows={rows}
            rowKey={(u) => u.id}
            columns={[
              { header: 'Email', cell: (u) => u.email },
              {
                header: 'Rôle',
                // Son propre compte n'est ni modifiable ni supprimable :
                // un admin ne peut pas se retirer ses propres droits.
                cell: (u) =>
                  u.id === selfId ? (
                    u.role
                  ) : (
                    <select
                      value={u.role}
                      disabled={mutation.busy}
                      onChange={(e) => setRole(u.id, (e.currentTarget as HTMLSelectElement).value as Role)}
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  ),
              },
              {
                cell: (u) =>
                  u.id === selfId ? null : (
                    <ActionButton icon={Trash2} danger disabled={mutation.busy} onClick={() => remove(u.id, u.email)}>
                      Supprimer
                    </ActionButton>
                  ),
              },
            ]}
          />
        )}
      </AsyncView>
    </>
  );
}
