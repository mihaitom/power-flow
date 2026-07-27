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
} from './playground-dom';
import { updateGrid } from './playground-state';

let timer: ReturnType<typeof setInterval> | null = null;
const btn = document.getElementById('simulate') as HTMLElement;
const simTimeEl = document.getElementById('sim-time') as HTMLElement;

const STEP_MINUTES = 30;
const STEPS_PER_DAY = (24 * 60) / STEP_MINUTES; // 48 — a full day at half-hour resolution
const TICK_MS = 1000;
const START_HOUR = 6; // start right as the sun comes up, not in the middle of the night

// Each slot switches on for a couple of plausible run windows across the day
// at a modest wattage. These are generic consumer slots — whatever the
// appliance shuffle picked (a dishwasher, a freezer, ...), not necessarily an
// EV charger — so none of them spike to EV-charger-scale power.
const SLOTS = [
  {
    has: hasC1,
    input: inp.consumer1,
    battery: false,
    windows: [
      { fromHour: 6.5, toHour: 9, watts: 800 },
      { fromHour: 18, toHour: 22.5, watts: 900 },
    ],
  },
  {
    has: hasC2,
    input: inp.consumer2,
    battery: false,
    windows: [
      { fromHour: 8, toHour: 8.5, watts: 1200 },
      { fromHour: 12, toHour: 17, watts: 1600 },
    ],
  },
  {
    has: hasC3,
    input: inp.consumer3,
    battery: false,
    windows: [
      { fromHour: 10, toHour: 18, watts: 1400 },
      { fromHour: 20, toHour: 22.5, watts: 1000 },
    ],
  },
  {
    has: hasC4,
    input: inp.consumer4,
    battery: false,
    windows: [
      { fromHour: 14, toHour: 18.5, watts: 1500 },
      { fromHour: 19, toHour: 20, watts: 1800 },
    ],
  },
  {
    has: hasBl1,
    input: inp.batteryLoad1,
    battery: true,
    windows: [
      { fromHour: 11, toHour: 12, watts: 900 },
      { fromHour: 16, toHour: 16.5, watts: 800 },
    ],
  },
  {
    has: hasBl2,
    input: inp.batteryLoad2,
    battery: true,
    windows: [
      { fromHour: 11.5, toHour: 14, watts: 700 },
      { fromHour: 21, toHour: 21.5, watts: 1100 },
    ],
  },
];

btn.addEventListener('click', () => {
  if (timer) {
    clearInterval(timer);
    timer = null;
    btn.classList.remove('on');
    btn.textContent = '▶ Simulate day';
    simTimeEl.textContent = '';
    return;
  }
  btn.classList.add('on');
  btn.textContent = '⏸ Stop';
  let step = (START_HOUR * 60) / STEP_MINUTES;
  let soc = 30;
  timer = setInterval(() => {
    const hour = (step * STEP_MINUTES) / 60;

    // Daylight from 06:00 to 20:00 (14h), peaking at solar noon.
    const daylight = hour > 6 && hour < 20 ? Math.sin((Math.PI * (hour - 6)) / 14) : 0;
    const solar = hasSolar.checked ? Math.round(7000 * daylight ** 1.4) : 0;

    // Smooth background house load: a bit higher in the afternoon, lower overnight.
    const baseLoad = Math.round(700 + 300 * Math.cos((2 * Math.PI * (hour - 15)) / 24));

    let consumersSum = 0;
    let directBatteryLoad = 0;
    for (const slot of SLOTS) {
      const active = slot.windows.find((w) => hour >= w.fromHour && hour < w.toHour);
      const watts = slot.has.checked && active ? active.watts : 0;
      slot.input.value = String(watts);
      if (slot.battery) directBatteryLoad += watts;
      else consumersSum += watts;
    }
    const load = baseLoad + consumersSum;

    let battery = 0;
    if (hasBat.checked) {
      const net = solar - load;
      if (net > 0 && soc < 100) battery = -Math.min(net, 4000);
      else if (net < 0 && soc > 0) battery = Math.min(-net, 4000);
      // The battery must discharge at least enough to cover its own direct
      // loads — but only bump it up, never force a charging (negative)
      // reading toward zero when no direct load is active.
      if (directBatteryLoad > 0) battery = Math.max(battery, directBatteryLoad);
      soc = Math.max(0, Math.min(100, soc - battery * 0.005));
    }

    inp.solar.value = String(solar);
    inp.battery.value = String(battery);
    inp.soc.value = String(Math.round(soc));
    inp.load.min = String(consumersSum);
    inp.load.max = String(consumersSum + 4000);
    inp.load.value = String(load);
    updateGrid();

    simTimeEl.textContent = `${String(Math.floor(hour)).padStart(2, '0')}:${String(Math.round((hour % 1) * 60)).padStart(2, '0')}`;

    step = (step + 1) % STEPS_PER_DAY;
    if (step === 0) soc = 30; // new day starts partially depleted from the night
  }, TICK_MS);
});

export const stopSim = () => {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
  btn.classList.remove('on');
  simTimeEl.textContent = '';
  btn.textContent = '▶ Simulate day';
};
