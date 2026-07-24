import { useEffect, useRef, useState } from 'preact/hooks';
import type { MediaItem, MediaListResult } from '@edge-cmf/shared-types';
import { adminApi } from './lib/adminApi';
import { Loading, Notice } from './lib/ui';

const KIND_LABEL = { image: 'Image', document: 'Document', audio: 'Audio', video: 'Vidéo' } as const;

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / 1024 / 1024).toFixed(1)} Mo`;
}

export default function MediaLibrary({ canWrite }: { canWrite: boolean }) {
  const [items, setItems] = useState<MediaItem[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = (after: string | null = null) => {
    const qs = after !== null ? `&cursor=${encodeURIComponent(after)}` : '';
    adminApi
      .get<MediaListResult>(`/api/media?limit=60${qs}`)
      .then((res) => {
        setItems((prev) => (after !== null && prev !== null ? [...prev, ...res.data] : res.data));
        setCursor(res.cursor);
      })
      .catch((e: Error) => setError(e.message));
  };

  useEffect(() => load(), []);

  const upload = async (e: Event) => {
    const input = e.currentTarget as HTMLInputElement;
    const files = input.files;
    if (files === null || files.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      for (const file of Array.from(files)) {
        const form = new FormData();
        form.append('file', file);
        await adminApi.postForm('/api/media', form);
      }
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      input.value = '';
    }
  };

  return (
    <>
      <h1>Médias</h1>
      <p class="muted">
        Fichiers stockés sur R2 et servis par le front sous <code>/media/…</code>. « Copier l'URL » colle le chemin
        public à utiliser dans les contenus.
      </p>
      {error !== null && <Notice kind="error">Erreur : {error}</Notice>}

      {canWrite && (
        <p class="action-row">
          <button type="button" class="badge" disabled={busy} onClick={() => fileInput.current?.click()}>
            {busy ? 'Envoi en cours…' : '+ Téléverser des fichiers'}
          </button>
          <input ref={fileInput} type="file" multiple hidden onChange={upload} />
        </p>
      )}

      {items === null ? (
        <Loading />
      ) : items.length === 0 ? (
        <p>Aucun média.</p>
      ) : (
        <div class="card-grid media-grid">
          {items.map((m) => (
            <a class="media-card" href={`/media/${m.key}`} key={m.key} title={m.key}>
              {m.kind === 'image' ? (
                <img class="media-thumb" src={`/api/media/file/${m.key}?v=${encodeURIComponent(m.uploaded)}`} alt={m.alt} loading="lazy" />
              ) : (
                <div class="media-thumb media-tile" data-kind={m.kind}>
                  {KIND_LABEL[m.kind]}
                </div>
              )}
              <strong class="media-name">{m.originalName}</strong>
              <span class="muted">
                {m.contentType} · {humanSize(m.size)}
              </span>
            </a>
          ))}
        </div>
      )}

      {cursor !== null && (
        <p class="action-row">
          <button type="button" onClick={() => load(cursor)}>
            Charger plus
          </button>
        </p>
      )}
    </>
  );
}
