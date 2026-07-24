import { useEffect, useRef, useState } from 'preact/hooks';
import type { MediaItem } from '@edge-cmf/shared-types';
import { adminApi } from './lib/adminApi';
import { Loading, Notice } from './lib/ui';

const KIND_LABEL = { image: 'Image', document: 'Document', audio: 'Audio', video: 'Vidéo' } as const;

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / 1024 / 1024).toFixed(1)} Mo`;
}

export default function MediaDetail({ mediaKey, canWrite }: { mediaKey: string; canWrite: boolean }) {
  const [item, setItem] = useState<MediaItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [alt, setAlt] = useState('');
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const replaceInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    adminApi
      .get<{ data: MediaItem }>(`/api/media?key=${encodeURIComponent(mediaKey)}`)
      .then((res) => {
        setItem(res.data);
        setAlt(res.data.alt);
      })
      .catch((e: Error) => setError(e.message));
  }, [mediaKey]);

  // `?v=<date d'upload>` : URL unique par version → l'aperçu admin reflète
  // immédiatement un remplacement, sans attendre l'expiration du cache.
  const fileUrl = `/api/media/file/${mediaKey}${item !== null ? `?v=${encodeURIComponent(item.uploaded)}` : ''}`;
  const publicUrl = `/media/${mediaKey}`;

  const replace = async (e: Event) => {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (file === undefined) return;
    setReplacing(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await adminApi.postForm<{ success: true; data: MediaItem }>(
        `/api/media?key=${encodeURIComponent(mediaKey)}`,
        form,
      );
      setItem(res.data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setReplacing(false);
      input.value = '';
    }
  };

  const saveAlt = async () => {
    setSaving(true);
    try {
      await adminApi.put('/api/media', { key: mediaKey, alt });
      setItem((prev) => (prev === null ? prev : { ...prev, alt }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!confirm('Supprimer ce média ? Les contenus qui l’utilisent perdront le fichier.')) return;
    try {
      await adminApi.delete(`/api/media?key=${encodeURIComponent(mediaKey)}`);
      window.location.href = '/media';
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const copy = () => {
    void navigator.clipboard.writeText(publicUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  if (error !== null && item === null) {
    return (
      <>
        <h1>Média</h1>
        <p class="muted">
          <a href="/media">← Retour à la bibliothèque</a>
        </p>
        <Notice kind="error">Erreur : {error}</Notice>
      </>
    );
  }
  if (item === null) return <Loading />;

  return (
    <>
      <h1>{item.originalName}</h1>
      <p class="muted">
        <a href="/media">← Retour à la bibliothèque</a>
      </p>
      {error !== null && <Notice kind="error">Erreur : {error}</Notice>}

      <div class="media-detail">
        <div class="media-detail-preview">
          {item.kind === 'image' && <img src={fileUrl} alt={item.alt} />}
          {item.kind === 'video' && <video src={fileUrl} controls />}
          {item.kind === 'audio' && <audio src={fileUrl} controls />}
          {item.kind === 'document' && (
            <a class="badge" href={fileUrl} target="_blank" rel="noopener">
              Ouvrir le document ↗
            </a>
          )}
        </div>

        <div class="stack">
          <dl class="media-meta">
            <dt>Type</dt>
            <dd>
              {KIND_LABEL[item.kind]} — <code>{item.contentType}</code>
            </dd>
            <dt>Poids</dt>
            <dd>{humanSize(item.size)}</dd>
            <dt>Téléversé le</dt>
            <dd>{new Date(item.uploaded).toLocaleString('fr-FR')}</dd>
            <dt>URL publique</dt>
            <dd>
              <code>{publicUrl}</code>
            </dd>
          </dl>

          <p class="action-row">
            <button type="button" class="badge" onClick={copy}>
              {copied ? 'Copié ✓' : "Copier l'URL"}
            </button>
            {canWrite && (
              <>
                <button type="button" class="badge" disabled={replacing} onClick={() => replaceInput.current?.click()}>
                  {replacing ? 'Remplacement…' : 'Remplacer le fichier'}
                </button>
                <input ref={replaceInput} type="file" hidden onChange={replace} />
                <button type="button" class="badge danger" onClick={remove}>
                  Supprimer
                </button>
              </>
            )}
          </p>
          {canWrite && (
            <p class="muted">
              Le remplacement garde la même URL publique : les contenus qui référencent ce média affichent
              automatiquement le nouveau fichier (même type requis).
            </p>
          )}

          {canWrite && item.kind === 'image' && (
            <label class="field">
              Texte alternatif
              <input
                value={alt}
                maxLength={512}
                placeholder="Description de l'image pour l'accessibilité"
                onInput={(e) => setAlt((e.currentTarget as HTMLInputElement).value)}
              />
            </label>
          )}
          {canWrite && item.kind === 'image' && alt !== item.alt && (
            <p class="action-row">
              <button type="button" disabled={saving} onClick={() => void saveAlt()}>
                Enregistrer
              </button>
            </p>
          )}
        </div>
      </div>
    </>
  );
}
