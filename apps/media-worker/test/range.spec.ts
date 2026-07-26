/**
 * Régression du constat P2-9 : l'analyse de l'en-tête `Range`.
 *
 * Chaque cas marqué « 500 avant » correspond à une requête parfaitement
 * légitime — émise par des lecteurs vidéo courants — qui faisait lever R2 et
 * remontait en erreur serveur.
 */
import { describe, expect, it } from 'vitest';
import { parseRange } from '../src/index';

const SIZE = 1000;

/** Réduit le résultat à une forme lisible pour les assertions. */
function describeResult(header: string | undefined): string {
  const r = parseRange(header, SIZE);
  if (r.kind !== 'range') return r.kind;
  const { offset, length } = r.range;
  const end = length !== undefined ? offset + length - 1 : SIZE - 1;
  return `${offset}..${end}`;
}

describe('parseRange', () => {
  it('traite une plage explicite', () => {
    expect(describeResult('bytes=0-99')).toBe('0..99');
    expect(describeResult('bytes=999-999')).toBe('999..999');
  });

  it('traite une plage ouverte à droite', () => {
    expect(describeResult('bytes=500-')).toBe('500..999');
  });

  it('traite un suffixe `bytes=-N` (500 avant)', () => {
    expect(describeResult('bytes=-200')).toBe('800..999');
  });

  it('tronque un suffixe plus grand que le fichier (500 avant)', () => {
    expect(describeResult('bytes=-5000')).toBe('0..999');
  });

  it('tronque une borne de fin au-delà du fichier, sans rejeter (RFC 9110)', () => {
    expect(describeResult('bytes=0-99999')).toBe('0..999');
  });

  it('signale 416 quand le début dépasse la taille (500 avant)', () => {
    expect(describeResult('bytes=1000-')).toBe('unsatisfiable');
    expect(describeResult('bytes=1500-1600')).toBe('unsatisfiable');
  });

  it('signale 416 sur une plage inversée ou vide', () => {
    expect(describeResult('bytes=300-200')).toBe('unsatisfiable');
    expect(describeResult('bytes=-0')).toBe('unsatisfiable');
  });

  it('ignore ce qu’il ne sait pas traiter plutôt que de mal l’interpréter', () => {
    expect(describeResult(undefined)).toBe('none');
    // Multi-range : la spécification autorise à répondre 200 avec tout le corps.
    expect(describeResult('bytes=0-99,200-299')).toBe('none');
    expect(describeResult('octets=0-99')).toBe('none');
  });

  it('ne produit jamais de bornes hors du fichier', () => {
    const headers = ['bytes=0-99', 'bytes=500-', 'bytes=-200', 'bytes=-5000', 'bytes=0-99999'];
    for (const h of headers) {
      const r = parseRange(h, SIZE);
      if (r.kind !== 'range') continue;
      const { offset, length } = r.range;
      const end = length !== undefined ? offset + length - 1 : SIZE - 1;
      expect(offset, h).toBeGreaterThanOrEqual(0);
      expect(end, h).toBeLessThan(SIZE);
      expect(end, h).toBeGreaterThanOrEqual(offset);
    }
  });
});
