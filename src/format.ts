import type { FlowData, FlowLabels } from './types.js';

/** Formats a non-negative power value for display. */
export type PowerFormatter = (watts: number) => string;

interface LocaleFormats {
  kw: Intl.NumberFormat;
  w: Intl.NumberFormat;
}

// Intl.NumberFormat construction isn't free, and update() may run several
// times per second — cache one pair per locale. `null` marks a locale tag
// Intl rejected, so we warn once and fall back instead of retrying.
const localeCache = new Map<string, LocaleFormats | null>();

function localeFormats(locale: string): LocaleFormats | null {
  if (!localeCache.has(locale)) {
    try {
      localeCache.set(locale, {
        kw: new Intl.NumberFormat(locale, {
          minimumFractionDigits: 1,
          maximumFractionDigits: 1,
        }),
        w: new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }),
      });
    } catch {
      console.warn(
        `[powerflow] Unsupported \`locale\` "${locale}" — falling back to the default number format.`,
      );
      localeCache.set(locale, null);
    }
  }
  return localeCache.get(locale) ?? null;
}

/** `1234` → `"1.2 kW"`, `800` → `"800 W"`. Without a `locale` this is the
 *  original fixed format (dot as decimal separator, no grouping); with one,
 *  separators follow that locale (e.g. `'de-DE'` → `"1,2 kW"`). */
export function formatWatts(watts: number, locale?: string): string {
  const kw = Math.abs(watts) >= 1000;
  const f = locale !== undefined ? localeFormats(locale) : null;
  if (!f) {
    return kw ? `${(watts / 1000).toFixed(1)} kW` : `${Math.round(watts)} W`;
  }
  return kw
    ? `${f.kw.format(watts / 1000)} kW`
    : `${f.w.format(Math.round(watts))} W`;
}

/** Battery state of charge, e.g. `"72 %"`. */
export function formatPercent(pct: number, locale?: string): string {
  const f = locale !== undefined ? localeFormats(locale) : null;
  const rounded = Math.round(pct);
  return `${f ? f.w.format(rounded) : rounded} %`;
}

/** Plain-text summary of the current readings, used as the diagram's
 *  accessible name (screen readers can't make sense of the animated SVG
 *  itself). Mirrors which nodes are actually drawn: optional nodes only
 *  appear when set, battery loads only alongside a battery, and the
 *  consumer2/batteryLoad2 slot conflict omits both values. */
export function describeFlow(
  data: FlowData,
  labels: FlowLabels,
  formatPower: PowerFormatter,
  formatSoc: (pct: number) => string,
): string {
  const parts: string[] = [];
  const directional = (
    value: number,
    positive: string,
    negative: string,
  ): string =>
    value > 0
      ? `${positive} ${formatPower(value)}`
      : value < 0
        ? `${negative} ${formatPower(-value)}`
        : formatPower(0);

  if (data.solar != null)
    parts.push(`${labels.solar}: ${formatPower(data.solar)}`);
  parts.push(
    `${labels.grid}: ${directional(data.grid ?? 0, 'importing', 'exporting')}`,
  );
  parts.push(`${labels.home}: ${formatPower(data.load ?? 0)}`);

  const hasBattery = data.battery != null;
  if (hasBattery) {
    let battery = `${labels.battery}: ${directional(data.battery!, 'charging', 'discharging')}`;
    if (data.batterySoc != null)
      battery += `, ${formatSoc(Math.max(0, Math.min(100, data.batterySoc)))}`;
    parts.push(battery);
  }

  const slotConflict =
    data.consumer2 != null && hasBattery && data.batteryLoad2 != null;
  const optional: [keyof FlowData & keyof FlowLabels, boolean][] = [
    ['consumer1', true],
    ['consumer2', !slotConflict],
    ['consumer3', true],
    ['consumer4', true],
    ['batteryLoad1', hasBattery],
    ['batteryLoad2', hasBattery && !slotConflict],
  ];
  for (const [key, shown] of optional) {
    const value = data[key];
    if (shown && value != null)
      parts.push(`${labels[key]}: ${formatPower(value)}`);
  }

  return `Power flow. ${parts.join('; ')}.`;
}
