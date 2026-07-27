import { inp, hasSolar, hasBat, hasWb, hasWb2 } from './playground-dom';
import { updateGrid } from './playground-state';

let timer: ReturnType<typeof setInterval> | null = null;
const btn = document.getElementById('simulate') as HTMLElement;
const simTimeEl = document.getElementById('sim-time') as HTMLElement;
const DAY_SECONDS = 60;
const TICK_MS = 1000;
const tInc = Math.PI / ((DAY_SECONDS * 1000) / TICK_MS);

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
  let t = 0;
  let soc = 20;
  timer = setInterval(() => {
    t += tInc;
    const sun = Math.max(0, Math.sin(t)) ** 1.4;
    const solar = hasSolar.checked ? Math.round(7000 * sun) : 0;
    const p = t / Math.PI;
    const wallbox = hasWb.checked && p > 0.25 && p < 0.55 ? 7400 : 0;
    const wallbox2 = hasWb2.checked && p > 0.58 && p < 0.78 ? 3600 : 0;
    const baseLoad = Math.round(700 + 500 * Math.abs(Math.sin(t)));
    const load = baseLoad + wallbox + wallbox2;
    const net = solar - load;

    let battery = 0;
    if (hasBat.checked) {
      if (net > 0 && soc < 100) battery = -Math.min(net, 4000);
      else if (net < 0 && soc > 0) battery = Math.min(-net, 4000);
      soc = Math.max(0, Math.min(100, soc + (-battery / 4000) * 2));
    }

    inp.solar.value = String(solar);
    inp.wallbox.value = String(wallbox);
    inp.wallbox2.value = String(wallbox2);
    inp.battery.value = String(battery);
    inp.soc.value = String(Math.round(soc));
    inp.load.min = String(wallbox + wallbox2);
    inp.load.max = String(Number(inp.load.min) + 4000);
    inp.load.value = String(load);
    updateGrid();

    const hour = 6 + p * 14;
    simTimeEl.textContent = `${String(Math.floor(hour)).padStart(2, '0')}:${String(Math.round((hour % 1) * 60)).padStart(2, '0')}`;
    if (t > Math.PI) {
      t = 0;
      soc = 20;
    }
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
