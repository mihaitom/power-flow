import {
  inp,
  hasSolar,
  hasBat,
  hasWb,
  hasWb2,
  hasBl,
  hasBl2,
  topoInp,
  TOPOLOGY_KEYS,
  notifyStateChange,
  type TopologyKey,
} from './playground-dom';
import { updateLoadMin, updateGrid, apply } from './playground-state';
import { stopSim } from './playground-simulate';

interface TestCase {
  label: string;
  solar: number | null;
  load: number;
  battery: number | null;
  wallbox: number | null;
  wallbox2: number | null;
  batteryLoad: number | null;
  batteryLoad2: number | null;
  topology?: Partial<Record<TopologyKey, boolean>>;
  // Overrides the auto-computed grid value (load - solar - battery +
  // batteryLoad + batteryLoad2). Only needed for cases where a disabled
  // topology edge curtails power the naive formula doesn't know about, so
  // the demo's grid reading stays physically consistent with what's drawn.
  gridOverride?: number;
}
const TEST_CATEGORIES: { name: string; cases: TestCase[] }[] = [
  {
    name: 'Solar',
    cases: [
      {
        label: 'Solar day',
        solar: 5000,
        load: 1500,
        battery: -1500,
        wallbox: null,
        wallbox2: null,
        batteryLoad: null,
        batteryLoad2: null,
      },
      {
        label: 'Solar export',
        solar: 6000,
        load: 1200,
        battery: null,
        wallbox: null,
        wallbox2: null,
        batteryLoad: null,
        batteryLoad2: null,
      },
      {
        label: 'Solar net-zero',
        solar: 2000,
        load: 2000,
        battery: null,
        wallbox: null,
        wallbox2: null,
        batteryLoad: null,
        batteryLoad2: null,
      },
      {
        label: 'Cloudy day',
        solar: 400,
        load: 1800,
        battery: null,
        wallbox: null,
        wallbox2: null,
        batteryLoad: null,
        batteryLoad2: null,
      },
      {
        label: 'Full sun, battery full',
        solar: 4000,
        load: 1000,
        battery: 0,
        wallbox: null,
        wallbox2: null,
        batteryLoad: null,
        batteryLoad2: null,
      },
      {
        label: 'Low sun, battery tops up',
        solar: 800,
        load: 2100,
        battery: 1200,
        wallbox: null,
        wallbox2: null,
        batteryLoad: null,
        batteryLoad2: null,
      },
    ],
  },
  {
    name: 'Battery',
    cases: [
      {
        label: 'Night: bat + grid',
        solar: 0,
        load: 2000,
        battery: 800,
        wallbox: null,
        wallbox2: null,
        batteryLoad: null,
        batteryLoad2: null,
      },
      {
        label: 'Grid→Battery',
        solar: 0,
        load: 1000,
        battery: -500,
        wallbox: null,
        wallbox2: null,
        batteryLoad: null,
        batteryLoad2: null,
      },
      {
        label: 'Battery covers & exports',
        solar: 0,
        load: 800,
        battery: 1800,
        wallbox: null,
        wallbox2: null,
        batteryLoad: null,
        batteryLoad2: null,
      },
      {
        label: 'Battery idle, fully charged',
        solar: null,
        load: 1200,
        battery: 0,
        wallbox: null,
        wallbox2: null,
        batteryLoad: null,
        batteryLoad2: null,
      },
      {
        label: 'Deep discharge, grid tops up',
        solar: null,
        load: 3000,
        battery: 900,
        wallbox: null,
        wallbox2: null,
        batteryLoad: null,
        batteryLoad2: null,
      },
      {
        label: 'Heavy off-peak charging',
        solar: null,
        load: 600,
        battery: -3000,
        wallbox: null,
        wallbox2: null,
        batteryLoad: null,
        batteryLoad2: null,
      },
    ],
  },
  {
    name: 'Grid',
    cases: [
      {
        label: 'Grid only',
        solar: null,
        load: 1500,
        battery: null,
        wallbox: null,
        wallbox2: null,
        batteryLoad: null,
        batteryLoad2: null,
      },
      {
        label: 'Evening peak',
        solar: null,
        load: 3800,
        battery: null,
        wallbox: null,
        wallbox2: null,
        batteryLoad: null,
        batteryLoad2: null,
      },
      {
        label: 'Minimal draw',
        solar: null,
        load: 250,
        battery: null,
        wallbox: null,
        wallbox2: null,
        batteryLoad: null,
        batteryLoad2: null,
      },
    ],
  },
  {
    name: 'Wallbox / EV charging',
    cases: [
      {
        label: 'Solar + EV',
        solar: 8000,
        load: 7000,
        battery: null,
        wallbox: 6400,
        wallbox2: null,
        batteryLoad: null,
        batteryLoad2: null,
      },
      {
        label: '2 EVs',
        solar: 3000,
        load: 8000,
        battery: 1000,
        wallbox: 6400,
        wallbox2: 300,
        batteryLoad: null,
        batteryLoad2: null,
      },
      {
        label: 'Night EV',
        solar: 0,
        load: 3000,
        battery: 500,
        wallbox: 2200,
        wallbox2: null,
        batteryLoad: null,
        batteryLoad2: null,
      },
      {
        label: 'EV fully solar-powered',
        solar: 7000,
        load: 6400,
        battery: null,
        wallbox: 6400,
        wallbox2: null,
        batteryLoad: null,
        batteryLoad2: null,
      },
      {
        label: 'Wallbox only, no solar/battery',
        solar: null,
        load: 7200,
        battery: null,
        wallbox: 6900,
        wallbox2: null,
        batteryLoad: null,
        batteryLoad2: null,
      },
      {
        label: 'Both wallboxes maxed',
        solar: null,
        load: 17500,
        battery: null,
        wallbox: 9000,
        wallbox2: 8000,
        batteryLoad: null,
        batteryLoad2: null,
      },
    ],
  },
  {
    name: 'Balcony PV & battery ports',
    cases: [
      {
        label: 'Balcony PV (battery-only)',
        solar: 600,
        load: 900,
        battery: -300,
        wallbox: null,
        wallbox2: null,
        batteryLoad: null,
        batteryLoad2: null,
        topology: { solarToHome: false, solarToGrid: false },
      },
      {
        label: 'Battery-fed AC',
        solar: 0,
        load: 900,
        battery: 2200,
        wallbox: null,
        wallbox2: null,
        batteryLoad: 1400,
        batteryLoad2: null,
      },
      {
        label: 'Dual battery-fed loads',
        solar: 0,
        load: 900,
        battery: 2600,
        wallbox: null,
        wallbox2: null,
        batteryLoad: 1000,
        batteryLoad2: 900,
      },
      {
        label: 'Balcony PV + battery-fed AC',
        solar: 600,
        load: 800,
        battery: -100,
        wallbox: null,
        wallbox2: null,
        batteryLoad: 300,
        batteryLoad2: null,
        topology: { solarToHome: false, solarToGrid: false },
      },
      {
        label: 'No grid export allowed (curtailed)',
        solar: 5000,
        load: 1500,
        battery: -1000,
        wallbox: null,
        wallbox2: null,
        batteryLoad: null,
        batteryLoad2: null,
        topology: { solarToGrid: false, batteryToGrid: false },
        // The naive load−solar−battery formula would show a 2.5kW export
        // that's actually curtailed (solar has nowhere left to go once the
        // battery and house are both saturated and export is disabled) — the
        // true grid reading here is 0.
        gridOverride: 0,
      },
      {
        label: 'Battery ports exceed discharge (grid tops up)',
        solar: null,
        load: 900,
        battery: 500,
        wallbox: null,
        wallbox2: null,
        batteryLoad: 400,
        batteryLoad2: 300,
        // batteryLoad + batteryLoad2 (700W) exceed the battery's reported
        // 500W discharge — since `battery` is only a net reading, the grid
        // must be simultaneously topping the battery up by 200W (700W out
        // to the direct loads, 200W in from the grid, netting to the
        // reported 500W discharge) for the numbers to add up.
      },
    ],
  },
  {
    name: 'Mixed scenarios',
    cases: [
      {
        label: 'Full house, midday',
        solar: 6000,
        load: 9500,
        battery: 1500,
        wallbox: 4000,
        wallbox2: 1500,
        batteryLoad: null,
        batteryLoad2: null,
      },
      {
        label: 'Full house, night charging',
        solar: 0,
        load: 8500,
        battery: 2000,
        wallbox: 5000,
        wallbox2: 1000,
        batteryLoad: null,
        batteryLoad2: null,
      },
    ],
  },
];

function selectTestCase(tc: TestCase) {
  stopSim();
  hasSolar.checked = tc.solar !== null;
  hasBat.checked = tc.battery !== null;
  hasWb.checked = tc.wallbox !== null;
  hasWb2.checked = tc.wallbox2 !== null;
  hasBl.checked = tc.batteryLoad !== null;
  hasBl2.checked = tc.batteryLoad2 !== null;
  inp.solar.value = String(tc.solar ?? 0);
  inp.battery.value = String(tc.battery ?? 0);
  inp.wallbox.value = String(tc.wallbox ?? 0);
  inp.wallbox2.value = String(tc.wallbox2 ?? 0);
  inp.batteryLoad.value = String(tc.batteryLoad ?? 0);
  inp.batteryLoad2.value = String(tc.batteryLoad2 ?? 0);
  for (const k of TOPOLOGY_KEYS) topoInp[k].checked = tc.topology?.[k] ?? true;
  updateLoadMin();
  inp.load.value = String(tc.load);
  updateGrid();
  // A few cases involve a disabled topology edge that curtails power the
  // naive load−solar−battery(+batteryLoad+batteryLoad2) formula can't see —
  // updateGrid()'s auto-computed value is overridden with the true reading.
  if (tc.gridOverride !== undefined) {
    inp.grid.value = String(tc.gridOverride);
    apply();
  }
  notifyStateChange();
}

const tcRow = document.getElementById('testcases') as HTMLElement;
for (const { name, cases } of TEST_CATEGORIES) {
  const heading = document.createElement('div');
  heading.className = 'section-title tc-category';
  heading.textContent = name;
  tcRow.appendChild(heading);

  const row = document.createElement('div');
  row.className = 'row';
  for (const tc of cases) {
    const b = document.createElement('button');
    b.textContent = tc.label;
    b.addEventListener('click', () => selectTestCase(tc));
    row.appendChild(b);
  }
  tcRow.appendChild(row);
}
