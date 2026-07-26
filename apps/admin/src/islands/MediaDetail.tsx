import { useEffect, useRef, useState } from 'preact/hooks';
import { Check, Copy, ExternalLink, RefreshCw, Save, Trash2 } from 'lucide-preact';
import { api } from './lib/contract';
import { useMutation, useResource } from './lib/hooks';
import { AsyncView, Button, Notice } from './lib/ui';
import { humanSize, mediaFileUrl, publicMediaUrl } from './lib/media';
import { routes } from '../lib/routes';

const KIND_LABEL = { image: 'Image', document: 'Document', audio: 'Audio', video: 'Vidéo' } as const;

export default function MediaDetail({ mediaKey, canWrite }: { mediaKey: string; canWrite: boolean }) {
  const media = useResource(() => api.media.detail(mediaKey), [mediaKey]);
  const mutation = useMutation();

  const [alt, setAlt] = useState('');
  const [copied, setCopied] = useState(false);
  const replaceInput = useRef<HTMLInputElement>(null);

  // Le champ d'alternative textuelle se recale sur la valeur chargée, sans
  // écraser une saisie en cours (le rechargement suit un enregistrement).
  const loadedAlt = media.data?.alt;
  useEffect(() => {
    if (loadedAlt !== undefined) setAlt(loadedAlt);
  }, [loadedAlt]);

  const replace = (e: Event) => {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (file === undefined) return;
    const form = new FormData();
    form.append('file', file);
    void mutation
      .run(() => api.media.replace(mediaKey, form), { onDone: media.reload })
      .finally(() => {
        input.value = '';
      });
  };

  const saveAlt = () => void mutation.run(() => api.media.setAlt(mediaKey, alt), { onDone: media.reload });

  const remove = () =>
    void mutation.run(() => api.media.remove(mediaKey), {
      confirm: 'Supprimer ce média ? Les contenus qui l’utilisent perdront le fichier.',
      redirect: { to: routes.media.list, flash: 'media-supprime' },
    });

  const copy = () => {
    void navigator.clipboard.writeText(publicMediaUrl(mediaKey));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <>
      {/* Titre et fil d'Ariane : rendus en SSR par la page (AdminShell). */}
      {mutation.error !== null && <Notice kind="error">Erreur : {mutation.error}</Notice>}

      <AsyncView resource={media}>
        {(item) => {
          // URL versionnée : un remplacement change l'URL, donc l'aperçu
          // reflète le nouveau fichier sans attendre l'expiration du cache.
          const fileUrl = mediaFileUrl(mediaKey, item.uploaded);
          return (
            <>
              <p>
                <strong>{item.originalName}</strong>
              </p>

              <div class="media-detail">
                <div class="media-detail-preview">
                  {item.kind === 'image' && <img src={fileUrl} alt={item.alt} />}
                  {item.kind === 'video' && <video src={fileUrl} controls />}
                  {item.kind === 'audio' && <audio src={fileUrl} controls />}
                  {item.kind === 'document' && (
                    <Button icon={ExternalLink} href={fileUrl} external>
                      Ouvrir le document
                    </Button>
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
                      <code>{publicMediaUrl(mediaKey)}</code>
                    </dd>
                  </dl>

                  <p class="action-row">
                    <Button icon={copied ? Check : Copy} onClick={copy}>
                      {copied ? 'Copié' : "Copier l'URL"}
                    </Button>
                    {canWrite && (
                      <>
                        <Button
                          icon={RefreshCw}
                          disabled={mutation.busy}
                          onClick={() => replaceInput.current?.click()}
                        >
                          {mutation.busy ? 'Opération en cours…' : 'Remplacer le fichier'}
                        </Button>
                        <input ref={replaceInput} type="file" hidden onChange={replace} />
                        <Button icon={Trash2} tone="danger" disabled={mutation.busy} onClick={remove}>
                          Supprimer
                        </Button>
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
                      <Button variant="primary" icon={Save} disabled={mutation.busy} onClick={saveAlt}>
                        Enregistrer
                      </Button>
                    </p>
                  )}
                </div>
              </div>
            </>
          );
        }}
      </AsyncView>
    </>
  );
}
