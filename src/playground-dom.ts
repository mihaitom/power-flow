// Shared DOM element references and small constants used across the
// playground modules. Every other playground-*.ts file reads its inputs
// from here instead of re-querying the document.

export const TOPOLOGY_KEYS = [
  'solarToHome',
  'solarToGrid',
  'solarToBattery',
  'batteryToHome',
  'batteryToGrid',
] as const;
export type TopologyKey = (typeof TOPOLOGY_KEYS)[number];

export const el = document.getElementById('diagram') as any;

const ids = [
  'solar',
  'grid',
  'load',
  'battery',
  'soc',
  'wallbox',
  'wallbox2',
  'batteryLoad',
  'batteryLoad2',
];
export const inp = Object.fromEntries(
  ids.map((id) => [id, document.getElementById(id) as HTMLInputElement]),
);

export const hasSolar = document.getElementById('has-solar') as HTMLInputElement;
export const hasBat = document.getElementById('has-battery') as HTMLInputElement;
export const hasWb = document.getElementById('has-wallbox') as HTMLInputElement;
export const hasWb2 = document.getElementById('has-wallbox2') as HTMLInputElement;
export const hasBl = document.getElementById('has-batteryLoad') as HTMLInputElement;
export const hasBl2 = document.getElementById('has-batteryLoad2') as HTMLInputElement;

export const topoInp = Object.fromEntries(
  TOPOLOGY_KEYS.map((k) => [
    k,
    document.getElementById(`topo-${k}`) as HTMLInputElement,
  ]),
) as Record<TopologyKey, HTMLInputElement>;

export const fmt = (w: number) =>
  Math.abs(w) >= 1000 ? (w / 1000).toFixed(3) + ' kW' : Math.round(w) + ' W';

// A few modules (colors, test cases) need to trigger a URL-state resync
// after a one-off action (reset colors, pick a test case) without depending
// on playground-share.ts directly — that would create an import cycle, since
// playground-share.ts itself reads colors/test-case-adjacent state. They
// dispatch this event instead; playground-share.ts is the sole listener.
export function notifyStateChange() {
  document.dispatchEvent(new CustomEvent('pf:statechange'));
}
