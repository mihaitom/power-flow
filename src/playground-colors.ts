import { el, notifyStateChange } from './playground-dom';

export const colorIds: Record<string, string> = {
  solar: 'c-solar',
  home: 'c-home',
  gridIn: 'c-grid-in',
  gridOut: 'c-grid-out',
  batteryIn: 'c-battery-in',
  batteryOut: 'c-battery-out',
  consumer1: 'c-consumer1',
  consumer2: 'c-consumer2',
  consumer3: 'c-consumer3',
  consumer4: 'c-consumer4',
  batteryLoad1: 'c-batteryLoad1',
  batteryLoad2: 'c-batteryLoad2',
};
export const cinp = Object.fromEntries(
  Object.entries(colorIds).map(([k, id]) => [
    k,
    document.getElementById(id) as HTMLInputElement,
  ]),
);
export const DEFAULT_COLORS = Object.fromEntries(
  Object.entries(cinp).map(([k, i]) => [k, i.defaultValue]),
);

export function applyColors() {
  el.options = {
    ...el.options,
    colors: Object.fromEntries(Object.entries(cinp).map(([k, i]) => [k, i.value])),
  };
}
Object.values(cinp).forEach((i) => i.addEventListener('input', applyColors));
applyColors();

(document.getElementById('reset-colors') as HTMLElement).addEventListener(
  'click',
  () => {
    for (const [k, i] of Object.entries(cinp)) i.value = DEFAULT_COLORS[k];
    applyColors();
    notifyStateChange();
  },
);
