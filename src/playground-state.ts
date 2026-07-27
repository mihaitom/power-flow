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
  el.topology = Object.fromEntries(
    TOPOLOGY_KEYS.map((k) => [k, topoInp[k].checked]),
  );
}

Object.values(topoInp).forEach((i) => i.addEventListener('input', apply));

inp.soc.addEventListener('input', apply);

// ── Speed ─────────────────────────────────────────────────────────────────────
const speedInp = document.getElementById('speed') as HTMLInputElement;
const vSpeed = document.getElementById('v-speed') as HTMLElement;
vSpeed.textContent = `${speedInp.value}×`;
speedInp.addEventListener('input', () => {
  vSpeed.textContent = `${speedInp.value}×`;
  el.speedScale = Number(speedInp.value);
});
export { speedInp, vSpeed };

// ── Appearance ────────────────────────────────────────────────────────────────
const iconStyleInp = document.getElementById('icon-style-full') as HTMLInputElement;
iconStyleInp.addEventListener('input', () => {
  el.iconStyle = iconStyleInp.checked ? 'full' : 'default';
});
const dotShapeInp = document.getElementById('dot-shape-triangle') as HTMLInputElement;
dotShapeInp.addEventListener('input', () => {
  el.dotShape = dotShapeInp.checked ? 'triangle' : 'circle';
});
const curveBendInp = document.getElementById('curve-bend') as HTMLInputElement;
const vCurveBend = document.getElementById('v-curve-bend') as HTMLElement;
vCurveBend.textContent = `${curveBendInp.value}×`;
curveBendInp.addEventListener('input', () => {
  vCurveBend.textContent = `${curveBendInp.value}×`;
  el.curveBend = Number(curveBendInp.value);
});

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
      solarVal -
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
