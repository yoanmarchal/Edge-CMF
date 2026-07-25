---
name: add-field-type
description: Ajouter un nouveau type de champ (fieldType) à la Field API dynamique d'Edge CMF, de la validation Zod jusqu'au rendu front et au formulaire admin. Utiliser quand on demande d'ajouter/étendre un type de champ (ex. "champ email", "champ couleur", "champ géoloc").
---

# Ajouter un type de champ

La Field API est dynamique : un nouveau `fieldType` ne demande **aucune migration D1** (valeurs stockées en JSON), mais la chaîne complète ci-dessous doit être traitée — s'arrêter à mi-chemin casse la validation ou l'affichage.

## Étapes (ordre imposé)

1. **`packages/shared-types/src/index.ts`**
   - Ajouter la valeur dans `fieldTypeEnum`.
   - Si le champ a des réglages propres, les ajouter (optionnels) dans `fieldSettingsSchema`.
   - Ajouter le `case` dans `buildFieldValuesSchema` : schéma Zod de la valeur (penser à `settings.multiple` — déjà géré générativement en aval du `switch`).

2. **`apps/admin/src/islands/FieldInput.tsx`** — rendu du widget de saisie pour ce type (valeur simple ET multiple).

3. **`apps/admin/src/islands/TypeDetail.tsx` / `TypeCreateForm.tsx`** — vérifier que le nouveau type apparaît dans le sélecteur de types de champ et que ses réglages (`settings`) sont éditables si besoin.

4. **`apps/frontend/src/components/FieldValue.astro`** — rendu public de la valeur (échapper/formater correctement ; gérer le cas tableau si `multiple`).

5. **Rien à faire** côté content-worker (validation générée) ni côté BDD — sauf si le type introduit une nouvelle dépendance de données (ex. référence à une nouvelle entité) : dans ce cas voir `docs/design/03-cache.md` pour les tags.

## Vérification

```bash
npm run typecheck   # doit passer sans any
npm run dev         # créer un champ du nouveau type dans l'admin (4322),
                    # saisir une valeur, vérifier le rendu sur le front (4321)
```

Tester aussi : valeur invalide rejetée en 400 par le content-worker, champ `required`, champ `multiple`.
