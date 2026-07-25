import { useRef } from 'preact/hooks';
import { ImagePlus, Pencil, X } from 'lucide-preact';
import { api, type MediaItem } from './lib/contract';
import { useCursorList } from './lib/hooks';
import { ActionButton, EmptyState, Loading, LoadMoreButton, Notice } from './lib/ui';
import { isImagePath, mediaFileUrl, publicMediaUrl } from './lib/media';

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

  // `auto: false` : rien n'est chargé tant que la modale n'a pas été ouverte.
  // Un formulaire de contenu peut porter plusieurs champs média, il ne doit
  // pas déclencher autant de listings R2 au montage.
  const media = useCursorList<MediaItem>((cursor) => api.media.list(100, cursor ?? undefined), {
    auto: false,
  });

  const openModal = () => {
    dialogRef.current?.showModal();
    media.ensureLoaded();
  };
  const close = () => dialogRef.current?.close();

  const pick = (key: string) => {
    onValue(publicMediaUrl(key));
    close();
  };

  return (
    <div class="media-picker">
      {value !== '' ? (
        <div class="media-picker-current">
          {isImagePath(value) ? <img src={mediaFileUrl(value)} alt="" /> : <span class="badge">Fichier</span>}
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
          {media.error !== null && <Notice kind="error">Erreur : {media.error}</Notice>}
          {media.loading && <Loading />}
          {media.items !== null &&
            (media.items.length === 0 ? (
              <EmptyState>
                Bibliothèque vide — <a href="/media">téléverser des fichiers</a>.
              </EmptyState>
            ) : (
              <div class="media-picker-grid">
                {media.items.map((m) => (
                  <button
                    type="button"
                    class="media-picker-item"
                    key={m.key}
                    title={m.originalName}
                    onClick={() => pick(m.key)}
                  >
                    {m.kind === 'image' ? (
                      <img src={mediaFileUrl(m.key, m.uploaded)} alt={m.alt} loading="lazy" />
                    ) : (
                      <span class="media-picker-kind">{m.kind}</span>
                    )}
                    <span class="media-picker-name">{m.originalName}</span>
                  </button>
                ))}
              </div>
            ))}
          {media.cursor !== null && <LoadMoreButton onClick={media.loadMore} />}
        </div>
      </dialog>
    </div>
  );
}
