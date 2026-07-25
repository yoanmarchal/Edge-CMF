/**
 * Helpers médias partagés — bibliothèque, fiche et sélecteur les recopiaient
 * chacun de leur côté (formatage de taille, construction d'URL d'aperçu,
 * détection d'image).
 */

const IMAGE_RE = /\.(jpe?g|png|webp|avif|gif|svg)$/i;

/** Le chemin pointe-t-il vers une image affichable dans une balise <img> ? */
export function isImagePath(path: string): boolean {
  return IMAGE_RE.test(path);
}

/** Taille lisible : 812 o, 4.2 Ko, 1.7 Mo. */
export function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / 1024 / 1024).toFixed(1)} Mo`;
}

/** `/media/<clé>` → `<clé>`. Tolère une clé déjà nue. */
export function mediaKeyOf(publicPath: string): string {
  return publicPath.replace(/^\/media\//, '');
}

/** Chemin public servi par le front — c'est lui qu'on stocke dans un champ. */
export function publicMediaUrl(key: string): string {
  return `/media/${key}`;
}

/**
 * URL d'aperçu côté admin (proxy authentifié vers R2).
 *
 * `uploaded` ajoute `?v=<date d'upload>` : l'URL change à chaque
 * remplacement de fichier, donc l'aperçu reflète immédiatement le nouveau
 * binaire sans attendre l'expiration du cache navigateur.
 */
export function mediaFileUrl(key: string, uploaded?: string): string {
  const base = `/api/media/file/${mediaKeyOf(key)}`;
  return uploaded === undefined ? base : `${base}?v=${encodeURIComponent(uploaded)}`;
}
