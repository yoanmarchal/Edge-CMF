import type { ComponentChildren } from 'preact';

export function Notice({ kind, children }: { kind: 'error' | 'ok'; children: ComponentChildren }) {
  return <p class={`notice ${kind}`}>{children}</p>;
}

export function Loading() {
  return <p class="muted">Chargement…</p>;
}
