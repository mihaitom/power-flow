import {
  el,
  inp,
  hasSolar,
  hasBat,
  hasC1,
  hasC2,
  hasC3,
  hasC4,
  hasBl1,
  hasBl2,
  topoInp,
  TOPOLOGY_KEYS,
  fmt,
  notifyStateChange,
} from './playground-dom';

export function apply() {
  (document.getElementById('v-solar') as HTMLElement).textContent = fmt(
    +inp.solar.value,
  );
  (document.getElementById('v-grid') as HTMLElement).textContent = fmt(
    +inp.grid.value,
  );
  (document.getElementById('v-load') as HTMLElement).textContent = fmt(
    +inp.load.value,
  );
  (document.getElementById('v-battery') as HTMLElement).textContent = fmt(
    +inp.battery.value,
  );
  (document.getElementById('v-soc') as HTMLElement).textContent =
    inp.soc.value + ' %';
  (document.getElementById('v-consumer1') as HTMLElement).textContent = fmt(
    +inp.consumer1.value,
  );
  (document.getElementById('v-consumer2') as HTMLElement).textContent = fmt(
    +inp.consumer2.value,
  );
  (document.getElementById('v-consumer3') as HTMLElement).textContent = fmt(
    +inp.consumer3.value,
  );
  (document.getElementById('v-consumer4') as HTMLElement).textContent = fmt(
    +inp.consumer4.value,
  );
  (document.getElementById('v-batteryLoad1') as HTMLElement).textContent = fmt(
    +inp.batteryLoad1.value,
  );
  (document.getElementById('v-batteryLoad2') as HTMLElement).textContent =
    fmt(+inp.batteryLoad2.value);
  (document.getElementById('solar-ctrls') as HTMLElement).style.opacity =
    hasSolar.checked ? '1' : '0.4';
  (document.getElementById('battery-ctrls') as HTMLElement).style.opacity =
    hasBat.checked ? '1' : '0.4';
  // Meaningless without a battery (applyBatteryHighlight() in core.ts is
  // already a no-op then) — dim it the same way battery-ctrls dims, so it
  // reads as "currently irrelevant" rather than a live, independent toggle.
  (document.getElementById('battery-charge-highlight-ctrl') as HTMLElement).style.opacity =
    hasBat.checked ? '1' : '0.4';
  (document.getElementById('consumer1-ctrls') as HTMLElement).style.opacity =
    hasC1.checked ? '1' : '0.4';
  (document.getElementById('consumer2-ctrls') as HTMLElement).style.opacity =
    hasC2.checked ? '1' : '0.4';
  (document.getElementById('consumer3-ctrls') as HTMLElement).style.opacity =
    hasC3.checked ? '1' : '0.4';
  (document.getElementById('consumer4-ctrls') as HTMLElement).style.opacity =
    hasC4.checked ? '1' : '0.4';
  (document.getElementById('batteryLoad1-ctrls') as HTMLElement).style.opacity =
    hasBl1.checked ? '1' : '0.4';
  (document.getElementById('batteryLoad2-ctrls') as HTMLElement).style.opacity =
    hasBl2.checked ? '1' : '0.4';

  el.data = {
    solar: hasSolar.checked ? +inp.solar.value : null,
    grid: +inp.grid.value,
    load: +inp.load.value,
    battery: hasBat.checked ? +inp.battery.value : null,
    batterySoc: hasBat.checked ? +inp.soc.value : null,
    consumer1: hasC1.checked ? +inp.consumer1.value : null,
    consumer2: hasC2.checked ? +inp.consumer2.value : null,
    consumer3: hasC3.checked ? +inp.consumer3.value : null,
    consumer4: hasC4.checked ? +inp.consumer4.value : null,
    batteryLoad1: hasBl1.checked ? +inp.batteryLoad1.value : null,
    batteryLoad2: hasBl2.checked ? +inp.batteryLoad2.value : null,
  };
  el.options = {
    ...el.options,
    topology: Object.fromEntries(
      TOPOLOGY_KEYS.map((k) => [k, topoInp[k].checked]),
    ),
  };
}

Object.values(topoInp).forEach((i) => i.addEventListener('input', apply));

inp.soc.addEventListener('input', apply);

// ── Speed ─────────────────────────────────────────────────────────────────────
const speedInp = document.getElementById('speed') as HTMLInputElement;
const vSpeed = document.getElementById('v-speed') as HTMLElement;
vSpeed.textContent = `${speedInp.value}×`;
speedInp.addEventListener('input', () => {
  vSpeed.textContent = `${speedInp.value}×`;
  el.options = { ...el.options, speedScale: Number(speedInp.value) };
});
export { speedInp, vSpeed };

// ── Appearance ────────────────────────────────────────────────────────────────
const NODE_STYLES = ['soft', 'tonal', 'outline', 'filled'] as const;
export let currentNodeStyle: (typeof NODE_STYLES)[number] = 'soft';
const nodeStyleTabsEl = document.getElementById('node-style-tabs') as HTMLElement;
export function setNodeStyle(style: (typeof NODE_STYLES)[number]) {
  currentNodeStyle = style;
  nodeStyleTabsEl.querySelectorAll('button').forEach((b) => {
    b.classList.toggle('on', (b as HTMLElement).dataset.nodeStyle === style);
  });
  el.options = { ...el.options, nodeStyle: style };
}
nodeStyleTabsEl.querySelectorAll('button').forEach((b) => {
  b.addEventListener('click', () => {
    setNodeStyle((b as HTMLElement).dataset.nodeStyle as (typeof NODE_STYLES)[number]);
    notifyStateChange();
  });
});

const NODE_SHAPES = ['circle', 'square', 'hexagon'] as const;
export let currentNodeShape: (typeof NODE_SHAPES)[number] = 'circle';
const nodeShapeTabsEl = document.getElementById('node-shape-tabs') as HTMLElement;
export function setNodeShape(shape: (typeof NODE_SHAPES)[number]) {
  currentNodeShape = shape;
  nodeShapeTabsEl.querySelectorAll('button').forEach((b) => {
    b.classList.toggle('on', (b as HTMLElement).dataset.nodeShape === shape);
  });
  el.options = { ...el.options, nodeShape: shape };
}
nodeShapeTabsEl.querySelectorAll('button').forEach((b) => {
  b.addEventListener('click', () => {
    setNodeShape((b as HTMLElement).dataset.nodeShape as (typeof NODE_SHAPES)[number]);
    notifyStateChange();
  });
});

const iconStyleInp = document.getElementById('icon-style-full') as HTMLInputElement;
iconStyleInp.addEventListener('input', () => {
  el.options = { ...el.options, iconStyle: iconStyleInp.checked ? 'full' : 'default' };
});
const DOT_SHAPES = ['circle', 'triangle', 'bolt', 'chevron', 'spark'] as const;
export let currentDotShape: (typeof DOT_SHAPES)[number] = 'circle';
const dotShapeTabsEl = document.getElementById('dot-shape-tabs') as HTMLElement;
export function setDotShape(shape: (typeof DOT_SHAPES)[number]) {
  currentDotShape = shape;
  dotShapeTabsEl.querySelectorAll('button').forEach((b) => {
    b.classList.toggle('on', (b as HTMLElement).dataset.dotShape === shape);
  });
  el.options = { ...el.options, dotShape: shape };
}
dotShapeTabsEl.querySelectorAll('button').forEach((b) => {
  b.addEventListener('click', () => {
    setDotShape((b as HTMLElement).dataset.dotShape as (typeof DOT_SHAPES)[number]);
    notifyStateChange();
  });
});
const batteryChargeHighlightInp = document.getElementById(
  'battery-charge-highlight',
) as HTMLInputElement;
batteryChargeHighlightInp.addEventListener('input', () => {
  el.options = {
    ...el.options,
    batteryChargeHighlight: batteryChargeHighlightInp.checked,
  };
});
const trackPulseInp = document.getElementById('track-pulse') as HTMLInputElement;
trackPulseInp.addEventListener('input', () => {
  el.options = { ...el.options, trackPulse: trackPulseInp.checked };
});
// curveBend behaves like a corner radius (0 = sharp 90° corner, 2.5 = a
// plain direct line — see core.ts's applyCurveBend()) — the *slider*
// itself, though, holds a plain 0..1 position, not curveBend directly (see
// index.html's own comment on the input element). A quadratic mapping
// (exponent 2) gives noticeably finer drag resolution near curveBend=0
// (small slider movements there change curveBend only a little) than near
// its direct-line max (the same slider movement there sweeps a much larger
// curveBend range) — close to what's normally meant by a "logarithmic"
// control for this kind of bounded 0..max parameter.
export const CURVE_BEND_MAX = 2.5;
const CURVE_BEND_SLIDER_EXPONENT = 2;
export function sliderToCurveBend(x: number): number {
  return CURVE_BEND_MAX * Math.pow(x, CURVE_BEND_SLIDER_EXPONENT);
}
export function curveBendToSlider(bend: number): number {
  return Math.pow(bend / CURVE_BEND_MAX, 1 / CURVE_BEND_SLIDER_EXPONENT);
}

const curveBendInp = document.getElementById('curve-bend') as HTMLInputElement;
const vCurveBend = document.getElementById('v-curve-bend') as HTMLElement;
vCurveBend.textContent = `${sliderToCurveBend(Number(curveBendInp.value)).toFixed(2)}×`;
curveBendInp.addEventListener('input', () => {
  const bend = sliderToCurveBend(Number(curveBendInp.value));
  vCurveBend.textContent = `${bend.toFixed(2)}×`;
  el.options = { ...el.options, curveBend: bend };
});
const dotCountInp = document.getElementById('dot-count') as HTMLInputElement;
const vDotCount = document.getElementById('v-dot-count') as HTMLElement;
vDotCount.textContent = dotCountInp.value;
dotCountInp.addEventListener('input', () => {
  vDotCount.textContent = dotCountInp.value;
  el.options = { ...el.options, dotCount: Number(dotCountInp.value) };
});
const rowGapInp = document.getElementById('row-gap') as HTMLInputElement;
const vRowGap = document.getElementById('v-row-gap') as HTMLElement;
vRowGap.textContent = `${rowGapInp.value}px`;
rowGapInp.addEventListener('input', () => {
  vRowGap.textContent = `${rowGapInp.value}px`;
  el.options = { ...el.options, rowGap: Number(rowGapInp.value) };
});
const columnGapInp = document.getElementById('column-gap') as HTMLInputElement;
const vColumnGap = document.getElementById('v-column-gap') as HTMLElement;
vColumnGap.textContent = `${columnGapInp.value}px`;
columnGapInp.addEventListener('input', () => {
  vColumnGap.textContent = `${columnGapInp.value}px`;
  el.options = { ...el.options, columnGap: Number(columnGapInp.value) };
});
export {
  iconStyleInp,
  batteryChargeHighlightInp,
  trackPulseInp,
  curveBendInp,
  vCurveBend,
  dotCountInp,
  vDotCount,
  rowGapInp,
  vRowGap,
  columnGapInp,
  vColumnGap,
};

// ── Slider logic ──────────────────────────────────────────────────────────────
const consumer1Inp = document.getElementById('consumer1') as HTMLInputElement;
const consumer2Inp = document.getElementById('consumer2') as HTMLInputElement;
const consumer3Inp = document.getElementById('consumer3') as HTMLInputElement;
const consumer4Inp = document.getElementById('consumer4') as HTMLInputElement;
const loadInp = document.getElementById('load') as HTMLInputElement;
const gridInp = document.getElementById('grid') as HTMLInputElement;
const batteryInp = document.getElementById('battery') as HTMLInputElement;
const solarInp = document.getElementById('solar') as HTMLInputElement;
const batteryLoad1Inp = document.getElementById(
  'batteryLoad1',
) as HTMLInputElement;
const batteryLoad2Inp = document.getElementById(
  'batteryLoad2',
) as HTMLInputElement;

export function updateLoadMin() {
  const newMin =
    (hasC1.checked ? Number(consumer1Inp.value) : 0) +
    (hasC2.checked ? Number(consumer2Inp.value) : 0) +
    (hasC3.checked ? Number(consumer3Inp.value) : 0) +
    (hasC4.checked ? Number(consumer4Inp.value) : 0);
  const maxLoad = newMin + 4000;
  const oldMin = Number(loadInp.min || 0);
  const shifted = Number(loadInp.value) - oldMin + newMin;
  loadInp.min = String(newMin);
  loadInp.max = String(maxLoad);
  loadInp.value = String(Math.min(maxLoad, Math.max(newMin, shifted)));
  updateGrid();
}

export function updateGrid() {
  const solarVal = hasSolar.checked ? Number(solarInp.value) : 0;
  const batteryVal = hasBat.checked ? Number(batteryInp.value) : 0;
  // batteryLoad1/batteryLoad2 are sub-consumers of `battery`'s discharge that
  // never reach the grid/home meters — they must be added back so the
  // auto-computed grid value stays physically consistent with the internal
  // flow-allocation math (see flow-allocation.ts: dischargeAvailable).
  const batteryLoad1Val = hasBl1.checked ? Number(batteryLoad1Inp.value) : 0;
  const batteryLoad2Val = hasBl2.checked ? Number(batteryLoad2Inp.value) : 0;
  gridInp.value = String(
    Number(loadInp.value) -
      solarVal +
      batteryVal +
      batteryLoad1Val +
      batteryLoad2Val,
  );
  apply();
}

[consumer1Inp, consumer2Inp, consumer3Inp, consumer4Inp, hasC1, hasC2, hasC3, hasC4].forEach(
  (e) => e.addEventListener('input', updateLoadMin),
);
[loadInp, solarInp, batteryInp, hasSolar, hasBat].forEach((e) =>
  e.addEventListener('input', updateGrid),
);
// batteryLoad1/batteryLoad2 don't affect the load slider's min/max bounds (they
// aren't sub-consumers of `load`), but they do shift the auto-computed grid
// value (see updateGrid), so they go through updateGrid rather than apply.
[batteryLoad1Inp, batteryLoad2Inp, hasBl1, hasBl2].forEach((e) =>
  e.addEventListener('input', updateGrid),
);

updateLoadMin();
