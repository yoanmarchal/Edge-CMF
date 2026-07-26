/**
 * Hachage de mot de passe via Web Crypto (PBKDF2-SHA256).
 * bcrypt/argon2 natifs ne sont pas disponibles dans le runtime Workers ;
 * PBKDF2 est fourni par crypto.subtle sans dépendance externe.
 */

const ITERATIONS = 100_000;

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function fromHex(hex: string): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

async function derive(password: string, salt: Uint8Array<ArrayBuffer>): Promise<string> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    256,
  );
  return toHex(new Uint8Array(bits));
}

/** Retourne la chaîne "saltHex:hashHex" à stocker en base. */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derive(password, salt);
  return `${toHex(salt)}:${hash}`;
}

/**
 * Comparaison de deux chaînes en temps constant.
 *
 * Un `===` sur un secret fuit sa longueur et son préfixe : la comparaison
 * s'arrête au premier octet différent, et l'écart est mesurable. Utilisé pour
 * les hachages comme pour les jetons.
 */
export function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/** Comparaison à temps constant du hash recalculé. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [saltHex, expected] = stored.split(':');
  if (saltHex === undefined || expected === undefined) return false;
  const actual = await derive(password, fromHex(saltHex));
  return constantTimeEquals(actual, expected);
}

/**
 * Hachage factice, à dériver quand le compte demandé n'existe pas.
 *
 * `derive()` fait 100 000 itérations PBKDF2, soit plusieurs dizaines de
 * millisecondes. Répondre « identifiants invalides » sans l'exécuter créait un
 * écart de temps énorme entre « e-mail inconnu » et « mot de passe faux » :
 * un attaquant énumérait les comptes du back-office au chronomètre.
 *
 * Le sel est constant et le résultat jeté — seul le temps passé compte.
 */
const DUMMY_SALT = new Uint8Array(16);

export async function burnPasswordTime(password: string): Promise<void> {
  await derive(password, DUMMY_SALT);
}
