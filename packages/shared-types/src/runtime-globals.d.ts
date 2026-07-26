/**
 * Globaux runtime utilisés par `errors.ts`.
 *
 * Ce paquet est compilé avec `lib: ["ES2022"]` seulement — délibérément, pour
 * qu'il reste agnostique du runtime : il est consommé par les workers (workerd)
 * ET par les deux applications Astro. Tirer `DOM` ou `@cloudflare/workers-types`
 * ici ouvrirait une surface d'API qui n'a rien à faire dans un paquet de
 * contrats.
 *
 * On déclare donc STRICTEMENT ce qui est utilisé, et rien de plus. Toute
 * nouvelle dépendance à un global devra être ajoutée ici consciemment — ce qui
 * est exactement le garde-fou recherché. Même approche que les
 * `cloudflare-shim.d.ts` des apps Astro.
 */

declare const console: {
  error(...data: unknown[]): void;
  warn(...data: unknown[]): void;
  log(...data: unknown[]): void;
};

declare const crypto: {
  randomUUID(): string;
};
