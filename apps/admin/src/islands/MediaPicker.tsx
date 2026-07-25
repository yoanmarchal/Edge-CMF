import { useRef, useState } from 'preact/hooks';
import { ImagePlus, Pencil, X } from 'lucide-preact';
import type { MediaItem, MediaListResult } from '@edge-cmf/shared-types';
import { adminApi } from './lib/adminApi';
import { ActionButton, Loading, LoadMoreButton, Notice } from './lib/ui';

const IMAGE_RE = /\.(jpe?g|png|webp|avif|gif|svg)$/i;

/** `/media/<clé>` → URL d'aperçu authentifiée côté admin. */
function previewUrl(publicPath: string): string {
  return `/api/media/file/${publicPath.replace(/^\/media\//, '')}`;
}

interface Props {
  value: string;
  clearable: boolean;
  onValue: (v: string | undefined) => void;
}

/**
 * Sélecteur de média pour les champs `media` de la Field API.
 * La bibliothèque s'ouvre dans un <dialog> natif (showModal) : grande
 * modale centrée, fermeture Échap/clic hors cadre gérée par le navigateur,
 * animation d'entrée en CSS pur (@starting-style).
 */
export default function MediaPicker({ value, clearable, onValue }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [items, setItems] = useState<MediaItem[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = (after: string | null = null) => {
    const qs = after !== null ? `&cursor=${encodeURIComponent(after)}` : '';
    adminApi
      .get<MediaListResult>(`/api/media?limit=100${qs}`)
      .then((res) => {
        setItems((prev) => (after !== null && prev !== null ? [...prev, ...res.data] : res.data));
        setCursor(res.cursor);
      })
      .catch((e: Error) => setError(e.message));
  };

  const openModal = () => {
    dialogRef.current?.showModal();
    if (items === null) load();
  };
  const close = () => dialogRef.current?.close();

  const pick = (key: string) => {
    onValue(`/media/${key}`);
    close();
  };

  return (
    <div class="media-picker">
      {value !== '' ? (
        <div class="media-picker-current">
          {IMAGE_RE.test(value) ? (
            <img src={previewUrl(value)} alt="" />
          ) : (
            <span class="badge">Fichier</span>
          )}
          <code>{value}</code>
          <ActionButton icon={Pencil} badge onClick={openModal}>
            Changer
          </ActionButton>
          {clearable && (
            <ActionButton icon={X} badge danger onClick={() => onValue(undefined)}>
              Retirer
            </ActionButton>
          )}
        </div>
      ) : (
        <ActionButton icon={ImagePlus} badge onClick={openModal}>
          Choisir un média
        </ActionButton>
      )}

      <dialog
        ref={dialogRef}
        class="media-modal"
        onClick={(e) => {
          // Clic sur le backdrop (le dialog lui-même, pas son contenu) → fermer.
          if (e.target === dialogRef.current) close();
        }}
      >
        <header class="media-modal-head">
          <h2>Bibliothèque de médias</h2>
          <ActionButton icon={X} badge onClick={close}>
            Fermer
          </ActionButton>
        </header>

        <div class="media-modal-body">
          {error !== null && <Notice kind="error">Erreur : {error}</Notice>}
          {items === null ? (
            <Loading />
          ) : items.length === 0 ? (
            <p class="muted">
              Bibliothèque vide — <a href="/media">téléverser des fichiers</a>.
            </p>
          ) : (
            <div class="media-picker-grid">
              {items.map((m) => (
                <button type="button" class="media-picker-item" key={m.key} title={m.originalName} onClick={() => pick(m.key)}>
                  {m.kind === 'image' ? (
                    <img src={`/api/media/file/${m.key}?v=${encodeURIComponent(m.uploaded)}`} alt={m.alt} loading="lazy" />
                  ) : (
                    <span class="media-picker-kind">{m.kind}</span>
                  )}
                  <span class="media-picker-name">{m.originalName}</span>
                </button>
              ))}
            </div>
          )}
          {cursor !== null && <LoadMoreButton onClick={() => load(cursor)} />}
        </div>
      </dialog>
    </div>
  );
}
