/**
 * Régressions des constats P0-1, P0-2 et P1-9 du rapport d'audit.
 *
 * Chacun de ces tests ÉCHOUE sur le code d'avant le lot 1. Ce n'est pas une
 * couverture de confort : ce sont les six scénarios qui cassaient en
 * production sur des volumes parfaitement ordinaires (un article un peu long,
 * un vocabulaire qui a grossi), et qu'aucune relecture n'avait attrapés parce
 * que les limites en cause sont celles de la plateforme, pas du langage.
 *
 * Voir docs/audit/2026-07-26-algorithmie-et-workers.md
 */
import { exports } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

const BASE = 'http://content.test';

async function api(method: string, path: string, body?: unknown): Promise<Response> {
  return exports.default.fetch(
    `${BASE}${path}`,
    body === undefined
      ? { method }
      : { method, body: JSON.stringify(body), headers: { 'content-type': 'application/json' } },
  );
}

/** Crée un nœud minimal valide et renvoie son identifiant. */
interface NodeOverrides {
  readonly termIds?: string[];
  readonly paragraphs?: { type: string; fields: Record<string, unknown>; weight?: number }[];
  readonly slug?: string;
}

async function createNode(overrides: NodeOverrides = {}): Promise<{ id: string; res: Response }> {
  const id = crypto.randomUUID();
  const res = await api('POST', '/api/nodes', {
    id,
    title: 'Contenu de test',
    slug: overrides.slug ?? `n-${id.slice(0, 8)}`,
    body: '',
    contentType: 'article',
    status: true,
    fields: {},
    termIds: overrides.termIds ?? [],
    paragraphs: overrides.paragraphs ?? [],
  });
  return { id, res };
}

/** Crée `count` termes dans le vocabulaire `tags` (semé par la migration). */
async function createTerms(count: number, prefix: string): Promise<string[]> {
  const ids: string[] = [];
  for (let i = 0; i < count; i++) {
    const id = crypto.randomUUID();
    const res = await api('POST', '/api/terms', {
      id,
      vocabularyId: 'tags',
      label: `${prefix} ${i}`,
      slug: `${prefix}-${i}`,
      parentId: null,
    });
    expect(res.status, `création du terme ${i}`).toBe(201);
    ids.push(id);
  }
  return ids;
}

describe('P0-1 — limite D1 de 100 paramètres liés', () => {
  it('accepte un nœud avec 60 termes (l’INSERT unique cassait au-delà de 50)', async () => {
    const termIds = await createTerms(60, 'gros');

    const { id, res } = await createNode({ termIds });
    expect(res.status).toBe(201);

    const detail = await api('GET', `/api/node/${id}`);
    expect(detail.status).toBe(200);
    const { data } = (await detail.json()) as { data: { terms: { id: string }[] } };
    expect(data.terms).toHaveLength(60);
    expect(new Set(data.terms.map((t) => t.id))).toEqual(new Set(termIds));
  });

  it('accepte un nœud de 25 paragraphes et conserve leur ordre (cassait dès 21)', async () => {
    const paragraphs = Array.from({ length: 25 }, (_, i) => ({
      type: 'text_block',
      fields: { texte: `Bloc numéro ${i}` },
    }));

    const { id, res } = await createNode({ paragraphs });
    expect(res.status).toBe(201);

    const detail = await api('GET', `/api/node/${id}`);
    const { data } = (await detail.json()) as {
      data: { paragraphs: { weight: number; fields: { texte: string } }[] };
    };
    expect(data.paragraphs).toHaveLength(25);
    // Le découpage en lots ne doit PAS réordonner : les poids sont calculés
    // sur l'index global, pas sur celui du lot.
    expect(data.paragraphs.map((p) => p.fields.texte)).toEqual(
      Array.from({ length: 25 }, (_, i) => `Bloc numéro ${i}`),
    );
  });

  it('supprime un vocabulaire de 150 termes (la suppression dépassait la limite)', async () => {
    const vocabularyId = 'volumineux';
    expect(
      (await api('POST', '/api/vocabularies', { id: vocabularyId, label: 'Volumineux' })).status,
    ).toBe(201);

    for (let i = 0; i < 150; i++) {
      const res = await api('POST', '/api/terms', {
        id: crypto.randomUUID(),
        vocabularyId,
        label: `Terme ${i}`,
        slug: `terme-${i}`,
        parentId: null,
      });
      expect(res.status).toBe(201);
    }

    const deleted = await api('DELETE', `/api/vocabularies/${vocabularyId}`);
    expect(deleted.status).toBe(200);

    const list = await api('GET', '/api/vocabularies');
    const { data } = (await list.json()) as { data: { id: string }[] };
    expect(data.map((v) => v.id)).not.toContain(vocabularyId);
  });
});

describe('P0-2 — atomicité des écritures composées', () => {
  it("laisse les termes existants intacts quand la mise à jour échoue", async () => {
    const termIds = await createTerms(3, 'atomique');
    const { id } = await createNode({ termIds });

    // Un identifiant de terme inexistant viole la clé étrangère de
    // `node_terms`. Sans transaction, le DELETE des anciens termes était déjà
    // parti quand l'INSERT échouait : le nœud se retrouvait SANS AUCUN terme.
    const res = await api('PUT', `/api/nodes/${id}`, {
      termIds: [...termIds, crypto.randomUUID()],
    });
    expect(res.ok).toBe(false);

    const detail = await api('GET', `/api/node/${id}`);
    const { data } = (await detail.json()) as { data: { terms: { id: string }[] } };
    expect(data.terms, 'les 3 termes d’origine doivent survivre à l’échec').toHaveLength(3);
  });

  it("ne laisse aucun paragraphe orphelin quand la création échoue", async () => {
    const { id: premier } = await createNode({ slug: 'slug-en-conflit' });
    expect(premier).toBeTruthy();

    // Même slug → violation de la contrainte UNIQUE. Rien de ce qui suit dans
    // le batch ne doit être écrit.
    const doublon = crypto.randomUUID();
    const res = await api('POST', '/api/nodes', {
      id: doublon,
      title: 'Doublon de slug',
      slug: 'slug-en-conflit',
      body: '',
      contentType: 'article',
      status: true,
      fields: {},
      termIds: [],
      paragraphs: [{ type: 'text_block', fields: { texte: 'ne doit pas exister' } }],
    });
    expect(res.ok).toBe(false);

    const detail = await api('GET', `/api/node/${doublon}`);
    expect(detail.status, 'le nœud ne doit pas exister du tout').toBe(404);
  });

  it('ne divulgue pas le message SQLite brut sur une 500 (P1-8)', async () => {
    await createNode({ slug: 'fuite-sql' });
    const res = await api('POST', '/api/nodes', {
      id: crypto.randomUUID(),
      title: 'Doublon',
      slug: 'fuite-sql',
      body: '',
      contentType: 'article',
      status: true,
      fields: {},
      termIds: [],
      paragraphs: [],
    });
    expect(res.ok).toBe(false);
    const { error } = (await res.json()) as { error: string };
    expect(error).not.toMatch(/UNIQUE|constraint|SQLITE|content_nodes/i);
    expect(error).toMatch(/référence [0-9a-f]{8}/);
  });
});

describe('P1-9 — suppression d’un type encore utilisé', () => {
  it('refuse en 409 un type de paragraphe encore instancié (au lieu d’une 500)', async () => {
    await createNode({ paragraphs: [{ type: 'quote', fields: { citation: 'Utilisé.' } }] });

    const res = await api('DELETE', '/api/types/quote');
    expect(res.status).toBe(409);
    const { error } = (await res.json()) as { error: string };
    expect(error).toContain('utilisent encore ce type');
  });

  it('accepte la suppression d’un type de paragraphe inutilisé', async () => {
    expect(
      (
        await api('POST', '/api/types', {
          id: 'bloc_inutilise',
          label: 'Bloc inutilisé',
          description: '',
          kind: 'paragraph',
        })
      ).status,
    ).toBe(201);

    expect((await api('DELETE', '/api/types/bloc_inutilise')).status).toBe(200);
  });
});
