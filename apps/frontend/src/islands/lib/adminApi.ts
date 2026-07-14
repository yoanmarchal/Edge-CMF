/**
 * Client fetch pour l'API JSON /api/admin/* consommée par les îlots Preact.
 * L'admin n'a plus besoin de SSR (cahier) : ces îlots sont montés en
 * client:only et parlent au proxy Astro authentifié par cookie httpOnly
 * (envoyé automatiquement par le navigateur en same-origin).
 */
async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    ...init,
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
  });
  const body: unknown = await res.json().catch(() => null);
  const record = body !== null && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  if (!res.ok || record.success === false) {
    const message = typeof record.error === 'string' ? record.error : `Erreur ${res.status}`;
    throw new Error(message);
  }
  return body as T;
}

export const adminApi = {
  get: <T>(path: string): Promise<T> => request<T>(path),
  post: <T>(path: string, json: unknown): Promise<T> =>
    request<T>(path, { method: 'POST', body: JSON.stringify(json) }),
  put: <T>(path: string, json: unknown): Promise<T> =>
    request<T>(path, { method: 'PUT', body: JSON.stringify(json) }),
  delete: <T>(path: string): Promise<T> => request<T>(path, { method: 'DELETE' }),
};
