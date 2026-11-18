// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPowerFlow, PowerFlow } from './core.js';
import type { FlowData, PowerFlowSettings } from './types.js';

const instances: PowerFlow[] = [];

function render(data: FlowData, options?: Partial<PowerFlowSettings>) {
  const host = document.createElement('div');
  document.body.append(host);
  const pf = createPowerFlow(host, { data, options });
  instances.push(pf);
  const root = host.shadowRoot!;
  const svg = root.querySelector('svg')!;
  return {
    host,
    pf,
    svg,
    text: (id: string) => root.getElementById(id)?.textContent,
    // Every element of an optional node shares its `data-topo` key; the
    // node counts as shown when none of them is display:none.
    shown: (key: string) =>
      [...svg.querySelectorAll<SVGElement>(`[data-topo="${key}"]`)].every(
        (n) => n.style.display !== 'none',
      ),
  };
}

afterEach(() => {
  instances.splice(0).forEach((pf) => pf.destroy());
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('rendering', () => {
  it('renders an SVG into a shadow root', () => {
    const { host, svg } = render({ solar: 0, grid: 0, load: 0 });
    expect(host.shadowRoot).not.toBeNull();
    expect(svg).not.toBeNull();
    expect(svg.getAttribute('viewBox')).toMatch(
      /^[-\d.]+ [-\d.]+ [\d.]+ [\d.]+$/,
    );
  });

  it('shows formatted values with direction arrows for grid and battery', () => {
    const { text } = render({
      solar: 3249,
      grid: -800,
      load: 2449,
      battery: 500,
      batterySoc: 71.6,
    });
    expect(text('t-solar-val')).toBe('3.2 kW');
    expect(text('t-home-val')).toBe('2.4 kW');
    expect(text('t-grid-val')).toBe('← 800 W');
    expect(text('t-bat-watts')).toBe('↓ 500 W');
    expect(text('t-bat-soc')).toBe('72 %');
  });

  it('shows import and discharge arrows the other way round', () => {
    const { text } = render({ grid: 1200, load: 1500, battery: -300 });
    expect(text('t-grid-val')).toBe('→ 1.2 kW');
    expect(text('t-bat-watts')).toBe('↑ 300 W');
  });

  it('uses custom labels', () => {
    const { text } = render(
      { grid: 0, load: 0 },
      { labels: { home: 'Haus', grid: 'Netz' } },
    );
    expect(text('t-home-lbl')).toBe('Haus');
    expect(text('t-grid-lbl')).toBe('Netz');
  });
});

describe('optional nodes', () => {
  it('hides every optional node that is omitted', () => {
    const { shown } = render({ grid: 0, load: 0 });
    for (const key of [
      'solar',
      'battery',
      'consumer1',
      'consumer2',
      'consumer3',
      'consumer4',
      'batteryLoad1',
    ])
      expect(shown(key), key).toBe(false);
  });

  it('shows optional nodes once they are set, and hides them again', () => {
    const { pf, shown } = render({ grid: 0, load: 0 });
    pf.update({ data: { solar: 100, grid: 0, load: 100, consumer3: 50 } });
    expect(shown('solar')).toBe(true);
    expect(shown('consumer3')).toBe(true);
    pf.update({ data: { grid: 0, load: 100 } });
    expect(shown('solar')).toBe(false);
    expect(shown('consumer3')).toBe(false);
  });

  it('only shows battery loads alongside a battery', () => {
    const { pf, shown } = render({ grid: 0, load: 0, batteryLoad1: 100 });
    expect(shown('batteryLoad1')).toBe(false);
    pf.update({ data: { grid: 0, load: 0, battery: -100, batteryLoad1: 100 } });
    expect(shown('batteryLoad1')).toBe(true);
  });

  it('shows a conflict indicator instead of consumer2/batteryLoad2, warning once', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const data = {
      grid: 0,
      load: 100,
      battery: -200,
      consumer2: 100,
      batteryLoad2: 200,
    };
    const { pf, shown } = render(data);
    pf.update({ data });
    expect(shown('slotConflict')).toBe(true);
    expect(shown('consumer2')).toBe(false);
    expect(warn).toHaveBeenCalledTimes(1);
  });
});

describe('number formatting', () => {
  it('follows `locale`', () => {
    const { text } = render(
      { solar: 3249, grid: 0, load: 0, battery: 0, batterySoc: 50 },
      { locale: 'de-DE' },
    );
    expect(text('t-solar-val')).toBe('3,2 kW');
    expect(text('t-bat-soc')).toBe('50 %');
  });

  it('lets `formatPower` override everything, including `locale`', () => {
    const { text } = render(
      { solar: 3249, grid: -800, load: 0 },
      { locale: 'de-DE', formatPower: (w) => `${w}W` },
    );
    expect(text('t-solar-val')).toBe('3249W');
    expect(text('t-grid-val')).toBe('← 800W');
  });

  it('keeps options that a later update() leaves out', () => {
    const { pf, text } = render(
      { solar: 3249, grid: 0, load: 0 },
      { locale: 'de-DE' },
    );
    pf.update({ data: { solar: 4321, grid: 0, load: 0 } });
    expect(text('t-solar-val')).toBe('4,3 kW');
    pf.update({
      data: { solar: 4321, grid: 0, load: 0 },
      options: { locale: undefined },
    });
    expect(text('t-solar-val')).toBe('4.3 kW');
  });
});

describe('accessibility', () => {
  it('exposes the diagram as one image with a summary of the readings', () => {
    const { svg } = render({ solar: 3200, grid: -800, load: 2400 });
    expect(svg.getAttribute('role')).toBe('img');
    expect(svg.getAttribute('aria-label')).toBe(
      'Power flow. Solar: 3.2 kW; Grid: exporting 800 W; Home: 2.4 kW.',
    );
  });

  it('updates the summary with new data', () => {
    const { pf, svg } = render({ grid: 0, load: 0 });
    pf.update({ data: { grid: 500, load: 500 } });
    expect(svg.getAttribute('aria-label')).toBe(
      'Power flow. Grid: importing 500 W; Home: 500 W.',
    );
  });

  it('accepts a fixed or computed `ariaLabel`', () => {
    const { pf, svg } = render({ grid: 0, load: 0 }, { ariaLabel: 'Energie' });
    expect(svg.getAttribute('aria-label')).toBe('Energie');
    pf.update({
      data: { grid: 0, load: 700 },
      options: { ariaLabel: (d) => `Haus ${d.load} W` },
    });
    expect(svg.getAttribute('aria-label')).toBe('Haus 700 W');
  });
});

describe('layout', () => {
  const width = (svg: SVGSVGElement) =>
    Number(svg.getAttribute('viewBox')!.split(' ')[2]);

  it('widens the viewBox for hexagon nodes', () => {
    const { pf, svg } = render({ grid: 0, load: 0 });
    const circle = width(svg);
    pf.update({
      data: { grid: 0, load: 0 },
      options: { nodeShape: 'hexagon' },
    });
    expect(width(svg)).toBeGreaterThan(circle);
  });

  it('widens the viewBox for the fourth column only when it is used', () => {
    const { pf, svg } = render({ grid: 0, load: 0 });
    const narrow = width(svg);
    pf.update({ data: { grid: 0, load: 0, consumer3: 10 } });
    expect(width(svg)).toBeGreaterThan(narrow);
  });
});

describe('off-screen pausing', () => {
  function stubObserver() {
    let callback: IntersectionObserverCallback | undefined;
    const disconnect = vi.fn();
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(cb: IntersectionObserverCallback) {
          callback = cb;
        }
        observe() {}
        disconnect = disconnect;
      },
    );
    const fire = (isIntersecting: boolean) =>
      callback!(
        [{ isIntersecting } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      );
    return { fire, disconnect };
  }

  it('stops the animation loop while off screen and resumes afterwards', () => {
    const { fire } = stubObserver();
    const raf = vi.spyOn(globalThis, 'requestAnimationFrame');
    const cancel = vi.spyOn(globalThis, 'cancelAnimationFrame');
    const { svg } = render({ solar: 3000, grid: -500, load: 2500 });
    // update() may schedule unrelated one-off frames (dot grow-in); the
    // animation loop is started last, so its callback is the latest call.
    const tick = raf.mock.calls.at(-1)![0];
    const calls = () => raf.mock.calls.filter(([cb]) => cb === tick).length;
    expect(calls()).toBe(1);
    tick(performance.now()); // a running loop schedules its next frame
    expect(calls()).toBe(2);

    fire(false);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(svg.classList.contains('paused')).toBe(true);
    tick(performance.now()); // an already-queued frame doesn't reschedule
    expect(calls()).toBe(2);

    fire(false); // already paused — no double cancel
    expect(cancel).toHaveBeenCalledTimes(1);

    fire(true);
    expect(calls()).toBe(3);
    expect(svg.classList.contains('paused')).toBe(false);
  });

  it('disconnects the observer on destroy', () => {
    const { disconnect } = stubObserver();
    const { pf, host } = render({ grid: 0, load: 0 });
    pf.destroy();
    expect(disconnect).toHaveBeenCalled();
    expect(host.shadowRoot!.innerHTML).toBe('');
  });

  it('still animates without IntersectionObserver', () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    const raf = vi.spyOn(globalThis, 'requestAnimationFrame');
    render({ grid: 0, load: 0 });
    expect(raf).toHaveBeenCalledTimes(1);
  });
});
