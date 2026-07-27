import {
  el,
  inp,
  hasSolar,
  hasBat,
  hasWb,
  hasWb2,
  hasBl,
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
  (document.getElementById('v-wallbox') as HTMLElement).textContent = fmt(
    +inp.wallbox.value,
  );
  (document.getElementById('v-wallbox2') as HTMLElement).textContent = fmt(
    +inp.wallbox2.value,
  );
  (document.getElementById('v-batteryLoad') as HTMLElement).textContent = fmt(
    +inp.batteryLoad.value,
  );
  (document.getElementById('v-batteryLoad2') as HTMLElement).textContent =
    fmt(+inp.batteryLoad2.value);
  (document.getElementById('solar-ctrls') as HTMLElement).style.opacity =
    hasSolar.checked ? '1' : '0.4';
  (document.getElementById('battery-ctrls') as HTMLElement).style.opacity =
    hasBat.checked ? '1' : '0.4';
  (document.getElementById('wallbox-ctrls') as HTMLElement).style.opacity =
    hasWb.checked ? '1' : '0.4';
  (document.getElementById('wallbox2-ctrls') as HTMLElement).style.opacity =
    hasWb2.checked ? '1' : '0.4';
  (document.getElementById('batteryLoad-ctrls') as HTMLElement).style.opacity =
    hasBl.checked ? '1' : '0.4';
  (document.getElementById('batteryLoad2-ctrls') as HTMLElement).style.opacity =
    hasBl2.checked ? '1' : '0.4';

  el.data = {
    solar: hasSolar.checked ? +inp.solar.value : null,
    grid: +inp.grid.value,
    load: +inp.load.value,
    battery: hasBat.checked ? +inp.battery.value : null,
    batterySoc: hasBat.checked ? +inp.soc.value : null,
    wallbox: hasWb.checked ? +inp.wallbox.value : null,
    wallbox2: hasWb2.checked ? +inp.wallbox2.value : null,
    batteryLoad: hasBl.checked ? +inp.batteryLoad.value : null,
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

// ── Slider logic ──────────────────────────────────────────────────────────────
const wallboxInp = document.getElementById('wallbox') as HTMLInputElement;
const wallbox2Inp = document.getElementById('wallbox2') as HTMLInputElement;
const loadInp = document.getElementById('load') as HTMLInputElement;
const gridInp = document.getElementById('grid') as HTMLInputElement;
const batteryInp = document.getElementById('battery') as HTMLInputElement;
const solarInp = document.getElementById('solar') as HTMLInputElement;
const batteryLoadInp = document.getElementById(
  'batteryLoad',
) as HTMLInputElement;
const batteryLoad2Inp = document.getElementById(
  'batteryLoad2',
) as HTMLInputElement;

export function updateLoadMin() {
  const newMin =
    (hasWb.checked ? Number(wallboxInp.value) : 0) +
    (hasWb2.checked ? Number(wallbox2Inp.value) : 0);
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
  // batteryLoad/batteryLoad2 are sub-consumers of `battery`'s discharge that
  // never reach the grid/home meters — they must be added back so the
  // auto-computed grid value stays physically consistent with the internal
  // flow-allocation math (see flow-allocation.ts: dischargeAvailable).
  const batteryLoadVal = hasBl.checked ? Number(batteryLoadInp.value) : 0;
  const batteryLoad2Val = hasBl2.checked ? Number(batteryLoad2Inp.value) : 0;
  gridInp.value = String(
    Number(loadInp.value) -
      solarVal -
      batteryVal +
      batteryLoadVal +
      batteryLoad2Val,
  );
  apply();
}

[wallboxInp, wallbox2Inp, hasWb, hasWb2].forEach((e) =>
  e.addEventListener('input', updateLoadMin),
);
[loadInp, solarInp, batteryInp, hasSolar, hasBat].forEach((e) =>
  e.addEventListener('input', updateGrid),
);
// batteryLoad/batteryLoad2 don't affect the load slider's min/max bounds (they
// aren't sub-consumers of `load`), but they do shift the auto-computed grid
// value (see updateGrid), so they go through updateGrid rather than apply.
[batteryLoadInp, batteryLoad2Inp, hasBl, hasBl2].forEach((e) =>
  e.addEventListener('input', updateGrid),
);

updateLoadMin();
