import type { FieldDef } from '@edge-cmf/shared-types';

/**
 * Convertit les valeurs d'un formulaire HTML (tout est string) vers les types
 * attendus par la validation Zod dynamique du content-worker.
 * Les inputs de champs personnalisés sont nommés `field_<name>`.
 */
export function parseFieldValues(
  form: FormData,
  defs: readonly FieldDef[],
  prefix = '',
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const def of defs) {
    const raw = form.get(`${prefix}field_${def.name}`);
    if (def.fieldType === 'boolean') {
      out[def.name] = raw === 'on';
      continue;
    }
    if (raw === null || raw === '') continue; // champ optionnel non renseigné
    if (def.fieldType === 'number') {
      out[def.name] = Number(raw);
    } else {
      out[def.name] = String(raw);
    }
  }
  return out;
}
