import { describe, expect, it, vi } from 'vitest';
import { describeFlow, formatPercent, formatWatts } from './format.js';
import { DEFAULT_LABELS } from './defaults.js';

describe('formatWatts', () => {
  it('keeps the original fixed format without a locale', () => {
    expect(formatWatts(800)).toBe('800 W');
    expect(formatWatts(999.4)).toBe('999 W');
    expect(formatWatts(1000)).toBe('1.0 kW');
    expect(formatWatts(3249)).toBe('3.2 kW');
    expect(formatWatts(1234567)).toBe('1234.6 kW');
  });

  it("uses the locale's separators when one is given", () => {
    expect(formatWatts(3249, 'de-DE')).toBe('3,2 kW');
    expect(formatWatts(800, 'de-DE')).toBe('800 W');
    expect(formatWatts(3249, 'en-US')).toBe('3.2 kW');
    expect(formatWatts(1234567, 'en-US')).toBe('1,234.6 kW');
  });

  it('falls back to the default format for an invalid locale, warning once', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(formatWatts(3249, 'not a locale!')).toBe('3.2 kW');
    expect(formatWatts(500, 'not a locale!')).toBe('500 W');
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});

describe('formatPercent', () => {
  it('rounds and appends a spaced percent sign', () => {
    expect(formatPercent(71.6)).toBe('72 %');
    expect(formatPercent(71.6, 'de-DE')).toBe('72 %');
  });
});

describe('describeFlow', () => {
  const fmt = (w: number) => formatWatts(w);
  const pct = (p: number) => formatPercent(p);

  it('summarizes the core nodes with flow directions', () => {
    expect(
      describeFlow(
        { solar: 3200, grid: -800, load: 2400 },
        DEFAULT_LABELS,
        fmt,
        pct,
      ),
    ).toBe('Power flow. Solar: 3.2 kW; Grid: exporting 800 W; Home: 2.4 kW.');
  });

  it('includes battery direction and state of charge', () => {
    expect(
      describeFlow(
        { grid: 300, load: 1500, battery: -1200, batterySoc: 64 },
        DEFAULT_LABELS,
        fmt,
        pct,
      ),
    ).toBe(
      'Power flow. Grid: importing 300 W; Home: 1.5 kW; Battery: discharging 1.2 kW, 64 %.',
    );
  });

  it('uses custom labels and formatter', () => {
    expect(
      describeFlow(
        { grid: 0, load: 400 },
        { ...DEFAULT_LABELS, grid: 'Netz', home: 'Haus' },
        (w) => `${w} Watt`,
        pct,
      ),
    ).toBe('Power flow. Netz: 0 Watt; Haus: 400 Watt.');
  });

  it('omits battery loads without a battery, and both values on a slot conflict', () => {
    expect(
      describeFlow(
        { grid: 0, load: 0, consumer1: 100, batteryLoad1: 200 },
        DEFAULT_LABELS,
        fmt,
        pct,
      ),
    ).toBe('Power flow. Grid: 0 W; Home: 0 W; Consumer 1: 100 W.');
    expect(
      describeFlow(
        { grid: 0, load: 0, battery: 0, consumer2: 100, batteryLoad2: 200 },
        DEFAULT_LABELS,
        fmt,
        pct,
      ),
    ).toBe('Power flow. Grid: 0 W; Home: 0 W; Battery: 0 W.');
  });
});
