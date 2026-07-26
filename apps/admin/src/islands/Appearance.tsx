import { Check, CircleCheck } from 'lucide-preact';
import { api } from './lib/contract';
import { useMutation, useResource } from './lib/hooks';
import { AsyncView, Button, IconLabel, Notice } from './lib/ui';
import { THEMES, THEME_SETTING_KEY, DEFAULT_THEME_ID } from '../lib/themes';

export default function Appearance() {
  const setting = useResource(() => api.settings.get(THEME_SETTING_KEY));
  const mutation = useMutation();

  const activate = (id: string) =>
    void mutation.run(() => api.settings.set(THEME_SETTING_KEY, id), { onDone: setting.reload });

  return (
    <>
      {/* Titre et description : rendus en SSR par la page (AdminShell). */}
      <p class="muted">
        Les tokens par défaut vivent dans <code>public/themes/base/theme.css</code> (côté apps/frontend) ; un thème
        enfant ne redéfinit que ce qu'il change, via <code>@layer theme-override</code>.
      </p>
      {mutation.error !== null && <Notice kind="error">Erreur : {mutation.error}</Notice>}

      <AsyncView resource={setting}>
        {(current) => {
          const active = current.value ?? DEFAULT_THEME_ID;
          return (
            <div class="card-grid">
              {THEMES.map((t) => (
                <div class="theme-card" key={t.id} data-active={String(t.id === active)}>
                  <strong>{t.label}</strong>
                  <p class="muted">{t.description}</p>
                  {t.id === active ? (
                    <IconLabel icon={CircleCheck} class="theme-active">
                      Thème actif
                    </IconLabel>
                  ) : (
                    <Button variant="primary" icon={Check} disabled={mutation.busy} onClick={() => activate(t.id)}>
                      Activer
                    </Button>
                  )}
                </div>
              ))}
            </div>
          );
        }}
      </AsyncView>
    </>
  );
}
