import { useRef } from 'preact/hooks';
import { FileText, Music, Upload, Video } from 'lucide-preact';
import { api, type MediaItem } from './lib/contract';
import { useCursorList, useMutation } from './lib/hooks';
import { ActionButton, EmptyState, Loading, LoadMoreButton, Notice } from './lib/ui';
import { humanSize, mediaFileUrl } from './lib/media';

const KIND_LABEL = { image: 'Image', document: 'Document', audio: 'Audio', video: 'Vidéo' } as const;
const KIND_ICON = { image: FileText, document: FileText, audio: Music, video: Video } as const;

/** Tuile de remplacement pour les médias sans aperçu (document, audio, vidéo). */
function MediaTile({ kind }: { kind: MediaItem['kind'] }) {
  const KindIcon = KIND_ICON[kind];
  return (
    <div class="media-thumb media-tile" data-kind={kind}>
      <KindIcon size={28} aria-hidden={true} />
      {KIND_LABEL[kind]}
    </div>
  );
}

export default function MediaLibrary({ canWrite }: { canWrite: boolean }) {
  const media = useCursorList<MediaItem>((cursor) => api.media.list(60, cursor ?? undefined));
  const upload = useMutation();
  const fileInput = useRef<HTMLInputElement>(null);

  const send = (e: Event) => {
    const input = e.currentTarget as HTMLInputElement;
    const files = input.files;
    if (files === null || files.length === 0) return;
    void upload
      .run(
        async () => {
          // Envoi séquentiel : R2 encaisse mal une rafale de PUT concurrents
          // depuis un seul isolate, et l'ordre d'affichage reste prévisible.
          for (const file of Array.from(files)) {
            const form = new FormData();
            form.append('file', file);
            await api.media.upload(form);
          }
        },
        { onDone: media.reload },
      )
      .finally(() => {
        input.value = '';
      });
  };

  const error = media.error ?? upload.error;

  return (
    <>
      {/* Titre et description : rendus en SSR par la page (AdminShell). */}
      {error !== null && <Notice kind="error">Erreur : {error}</Notice>}

      {canWrite && (
        <p class="action-row">
          <ActionButton icon={Upload} badge disabled={upload.busy} onClick={() => fileInput.current?.click()}>
            {upload.busy ? 'Envoi en cours…' : 'Téléverser des fichiers'}
          </ActionButton>
          <input ref={fileInput} type="file" multiple hidden onChange={send} />
        </p>
      )}

      {media.loading && <Loading />}
      {media.items !== null &&
        (media.items.length === 0 ? (
          <EmptyState>
            {canWrite
              ? 'Bibliothèque vide — téléversez un premier fichier.'
              : 'Bibliothèque vide.'}
          </EmptyState>
        ) : (
          <div class="card-grid media-grid">
            {media.items.map((m) => (
              <a class="media-card" href={`/media/${m.key}`} key={m.key} title={m.key}>
                {m.kind === 'image' ? (
                  <img class="media-thumb" src={mediaFileUrl(m.key, m.uploaded)} alt={m.alt} loading="lazy" />
                ) : (
                  <MediaTile kind={m.kind} />
                )}
                <strong class="media-name">{m.originalName}</strong>
                <span class="muted">
                  {m.contentType} · {humanSize(m.size)}
                </span>
              </a>
            ))}
          </div>
        ))}

      {media.cursor !== null && <LoadMoreButton onClick={media.loadMore} />}
    </>
  );
}
