import {
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
  batterySoc?: number | null;
  consumer1: number | null;
  consumer2: number | null;
  consumer3: number | null;
  consumer4: number | null;
  batteryLoad1: number | null;
  batteryLoad2: number | null;
  topology?: Partial<Record<TopologyKey, boolean>>;
  // Overrides the auto-computed grid value (load - solar - battery +
  // batteryLoad1 + batteryLoad2). Only needed for cases where a disabled
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
        battery: 1500,
        consumer1: null,
        consumer2: null,
        consumer3: null,
        consumer4: null,
        batteryLoad1: null,
        batteryLoad2: null,
      },
      {
        label: 'Solar export',
        solar: 6000,
        load: 1200,
        battery: null,
        consumer1: null,
        consumer2: null,
        consumer3: null,
        consumer4: null,
        batteryLoad1: null,
        batteryLoad2: null,
      },
      {
        label: 'Solar net-zero',
        solar: 2000,
        load: 2000,
        battery: null,
        consumer1: null,
        consumer2: null,
        consumer3: null,
        consumer4: null,
        batteryLoad1: null,
        batteryLoad2: null,
      },
      {
        label: 'Cloudy day',
        solar: 400,
        load: 1800,
        battery: null,
        consumer1: null,
        consumer2: null,
        consumer3: null,
        consumer4: null,
        batteryLoad1: null,
        batteryLoad2: null,
      },
      {
        label: 'Full sun, battery full',
        solar: 4000,
        load: 1000,
        battery: 0,
        batterySoc: 100,
        consumer1: null,
        consumer2: null,
        consumer3: null,
        consumer4: null,
        batteryLoad1: null,
        batteryLoad2: null,
      },
      {
        label: 'Low sun, battery covers the gap',
        solar: 800,
        load: 2100,
        battery: -1200,
        consumer1: null,
        consumer2: null,
        consumer3: null,
        consumer4: null,
        batteryLoad1: null,
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
        battery: -800,
        consumer1: null,
        consumer2: null,
        consumer3: null,
        consumer4: null,
        batteryLoad1: null,
        batteryLoad2: null,
      },
      {
        label: 'Grid→Battery',
        solar: 0,
        load: 1000,
        battery: 500,
        consumer1: null,
        consumer2: null,
        consumer3: null,
        consumer4: null,
        batteryLoad1: null,
        batteryLoad2: null,
      },
      {
        label: 'Battery covers & exports',
        solar: 0,
        load: 800,
        battery: -1800,
        consumer1: null,
        consumer2: null,
        consumer3: null,
        consumer4: null,
        batteryLoad1: null,
        batteryLoad2: null,
      },
      {
        label: 'Battery idle, fully charged',
        solar: null,
        load: 1200,
        battery: 0,
        batterySoc: 100,
        consumer1: null,
        consumer2: null,
        consumer3: null,
        consumer4: null,
        batteryLoad1: null,
        batteryLoad2: null,
      },
      {
        label: 'Deep discharge, grid tops up',
        solar: null,
        load: 3000,
        battery: -900,
        batterySoc: 8,
        consumer1: null,
        consumer2: null,
        consumer3: null,
        consumer4: null,
        batteryLoad1: null,
        batteryLoad2: null,
      },
      {
        label: 'Heavy off-peak charging',
        solar: null,
        load: 600,
        battery: 3000,
        consumer1: null,
        consumer2: null,
        consumer3: null,
        consumer4: null,
        batteryLoad1: null,
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
        consumer1: null,
        consumer2: null,
        consumer3: null,
        consumer4: null,
        batteryLoad1: null,
        batteryLoad2: null,
      },
      {
        label: 'Evening peak',
        solar: null,
        load: 3800,
        battery: null,
        consumer1: null,
        consumer2: null,
        consumer3: null,
        consumer4: null,
        batteryLoad1: null,
        batteryLoad2: null,
      },
      {
        label: 'Minimal draw',
        solar: null,
        load: 250,
        battery: null,
        consumer1: null,
        consumer2: null,
        consumer3: null,
        consumer4: null,
        batteryLoad1: null,
        batteryLoad2: null,
      },
    ],
  },
  {
    // Consumer slots are generic (whatever the appliance shuffle picked —
    // a dishwasher, a freezer, ...), not necessarily EV chargers, so these
    // cases are framed around "how many slots" and "what's powering them"
    // rather than any specific appliance.
    name: 'Home consumers (1–4)',
    cases: [
      {
        label: 'Single consumer, grid-only',
        solar: null,
        load: 2200,
        battery: null,
        consumer1: 1800,
        consumer2: null,
        consumer3: null,
        consumer4: null,
        batteryLoad1: null,
        batteryLoad2: null,
      },
      {
        label: 'Single consumer at night, battery assists',
        solar: 0,
        load: 3000,
        battery: -500,
        consumer1: 2200,
        consumer2: null,
        consumer3: null,
        consumer4: null,
        batteryLoad1: null,
        batteryLoad2: null,
      },
      {
        label: 'Two consumers, solar-covered',
        solar: 8000,
        load: 7000,
        battery: null,
        consumer1: 4000,
        consumer2: 2000,
        consumer3: null,
        consumer4: null,
        batteryLoad1: null,
        batteryLoad2: null,
      },
      {
        label: 'Two large consumers, grid-only',
        solar: null,
        load: 17500,
        battery: null,
        consumer1: 9000,
        consumer2: 8000,
        consumer3: null,
        consumer4: null,
        batteryLoad1: null,
        batteryLoad2: null,
      },
      {
        label: 'All four consumers',
        solar: 6000,
        load: 8200,
        battery: null,
        consumer1: 3000,
        consumer2: 1200,
        consumer3: 900,
        consumer4: 1600,
        batteryLoad1: null,
        batteryLoad2: null,
      },
      {
        label: 'All four consumers + battery-fed loads',
        solar: 9000,
        load: 8200,
        battery: 500,
        consumer1: 3000,
        consumer2: 1200,
        consumer3: 900,
        consumer4: 1600,
        batteryLoad1: 800,
        batteryLoad2: null,
      },
      {
        label: 'Consumers + battery, midday',
        solar: 6000,
        load: 9500,
        battery: -1500,
        consumer1: 4000,
        consumer2: 1500,
        consumer3: null,
        consumer4: null,
        batteryLoad1: null,
        batteryLoad2: null,
      },
      {
        label: 'Consumers + night battery discharge',
        solar: 0,
        load: 8500,
        battery: -2000,
        consumer1: 5000,
        consumer2: 1000,
        consumer3: null,
        consumer4: null,
        batteryLoad1: null,
        batteryLoad2: null,
      },
    ],
  },
  {
    name: 'Battery-fed loads (1–2)',
    cases: [
      {
        label: 'Single battery-fed load',
        solar: 0,
        load: 900,
        battery: -2200,
        consumer1: null,
        consumer2: null,
        consumer3: null,
        consumer4: null,
        batteryLoad1: 1400,
        batteryLoad2: null,
      },
      {
        label: 'Two battery-fed loads',
        solar: 0,
        load: 900,
        battery: -2600,
        consumer1: null,
        consumer2: null,
        consumer3: null,
        consumer4: null,
        batteryLoad1: 1000,
        batteryLoad2: 900,
      },
      {
        label: 'Battery loads exceed reported discharge',
        solar: null,
        load: 900,
        battery: -500,
        consumer1: null,
        consumer2: null,
        consumer3: null,
        consumer4: null,
        batteryLoad1: 400,
        batteryLoad2: 300,
        // batteryLoad1 + batteryLoad2 (700W) exceed the battery's reported
        // 500W discharge — since `battery` is only a net reading, the grid
        // must be simultaneously topping the battery up by 200W (700W out
        // to the direct loads, 200W in from the grid, netting to the
        // reported 500W discharge) for the numbers to add up.
      },
    ],
  },
  {
    name: 'Topology',
    cases: [
      {
        label: 'Balcony PV (battery-only)',
        solar: 600,
        load: 900,
        battery: 300,
        consumer1: null,
        consumer2: null,
        consumer3: null,
        consumer4: null,
        batteryLoad1: null,
        batteryLoad2: null,
        topology: { solarToHome: false, solarToGrid: false },
      },
      {
        label: 'Balcony PV + battery-fed load',
        solar: 600,
        load: 800,
        battery: 100,
        consumer1: null,
        consumer2: null,
        consumer3: null,
        consumer4: null,
        batteryLoad1: 300,
        batteryLoad2: null,
        topology: { solarToHome: false, solarToGrid: false },
      },
      {
        label: 'No grid export allowed (curtailed)',
        solar: 5000,
        load: 1500,
        battery: 1000,
        consumer1: null,
        consumer2: null,
        consumer3: null,
        consumer4: null,
        batteryLoad1: null,
        batteryLoad2: null,
        topology: { solarToGrid: false, batteryToGrid: false },
        // The naive load−solar−battery formula would show a 2.5kW export
        // that's actually curtailed (solar has nowhere left to go once the
        // battery and house are both saturated and export is disabled) — the
        // true grid reading here is 0.
        gridOverride: 0,
      },
    ],
  },
  {
    name: 'Slot conflict (3,3)',
    cases: [
      {
        label: 'Slot conflict at (3,3)',
        solar: null,
        load: 2500,
        battery: -1800,
        consumer1: null,
        consumer2: 900,
        consumer3: null,
        consumer4: null,
        batteryLoad1: null,
        // `consumer2` and `batteryLoad2` share the same grid position (3,3) —
        // setting both at once demonstrates the red conflict indicator
        // (see core.ts's hasSlotConflict) instead of either value drawing.
        batteryLoad2: 700,
      },
    ],
  },
];

function selectTestCase(tc: TestCase) {
  stopSim();
  hasSolar.checked = tc.solar !== null;
  hasBat.checked = tc.battery !== null;
  hasC1.checked = tc.consumer1 !== null;
  hasC2.checked = tc.consumer2 !== null;
  hasC3.checked = tc.consumer3 !== null;
  hasC4.checked = tc.consumer4 !== null;
  hasBl1.checked = tc.batteryLoad1 !== null;
  hasBl2.checked = tc.batteryLoad2 !== null;
  inp.solar.value = String(tc.solar ?? 0);
  inp.battery.value = String(tc.battery ?? 0);
  inp.soc.value = String(tc.batterySoc ?? 69);
  inp.consumer1.value = String(tc.consumer1 ?? 0);
  inp.consumer2.value = String(tc.consumer2 ?? 0);
  inp.consumer3.value = String(tc.consumer3 ?? 0);
  inp.consumer4.value = String(tc.consumer4 ?? 0);
  inp.batteryLoad1.value = String(tc.batteryLoad1 ?? 0);
  inp.batteryLoad2.value = String(tc.batteryLoad2 ?? 0);
  for (const k of TOPOLOGY_KEYS) topoInp[k].checked = tc.topology?.[k] ?? true;
  updateLoadMin();
  inp.load.value = String(tc.load);
  updateGrid();
  // A few cases involve a disabled topology edge that curtails power the
  // naive load−solar−battery(+batteryLoad1+batteryLoad2) formula can't see —
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
