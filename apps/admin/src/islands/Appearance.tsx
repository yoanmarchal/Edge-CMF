import { useEffect, useState } from 'preact/hooks';
import { Check, CircleCheck } from 'lucide-preact';
import { adminApi } from './lib/adminApi';
import { ActionButton, IconLabel, Loading, Notice } from './lib/ui';
import { THEMES, THEME_SETTING_KEY, DEFAULT_THEME_ID } from '../lib/themes';

export default function Appearance() {
  const [active, setActive] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    adminApi
      .get<{ data: { value: string | null } }>(`/api/settings?key=${THEME_SETTING_KEY}`)
      .then((res) => setActive(res.data.value ?? DEFAULT_THEME_ID))
      .catch((e: Error) => setError(e.message));
  }, []);

  const activate = async (id: string) => {
    setSaving(true);
    setError(null);
    try {
      await adminApi.put('/api/settings', { key: THEME_SETTING_KEY, value: id });
      setActive(id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <h1>Apparence</h1>
      <p class="muted">
        Thème natif du front, overridable : "Natif (base)" définit les tokens par défaut (
        <code>public/themes/base/theme.css</code>, côté apps/frontend), les autres thèmes ne redéfinissent que ce
        qu'ils changent (<code>@layer theme-override</code>) — aucune surcharge à l'aveugle.
      </p>
      {error !== null && <Notice kind="error">Erreur : {error}</Notice>}

      {active === null ? (
        <Loading />
      ) : (
        <div class="card-grid">
          {THEMES.map((t) => (
            <div class="theme-card" data-active={String(t.id === active)}>
              <strong>{t.label}</strong>
              <p class="muted">{t.description}</p>
              {t.id === active ? (
                <IconLabel icon={CircleCheck} class="theme-active">
                  Thème actif
                </IconLabel>
              ) : (
                <ActionButton icon={Check} disabled={saving} onClick={() => void activate(t.id)}>
                  Activer
                </ActionButton>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
