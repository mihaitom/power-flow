import {
  mdiSolarPowerVariant,
  mdiSolarPanel,
  mdiWeatherSunny,
  mdiTransmissionTower,
  mdiPowerPlug,
  mdiFlash,
  mdiHome,
  mdiHomeOutline,
  mdiHomeModern,
  mdiBatteryMedium,
  mdiBatteryCharging60,
  mdiHomeBattery,
  mdiEvStation,
  mdiCarElectric,
  mdiEvPlugType2,
  mdiPowerSocket,
} from '@mdi/js';
import { el } from './playground-dom';

// Only the four structural nodes shuffle here. consumer1-4/batteryLoad1/
// batteryLoad2 are owned by playground-appliances.ts instead (see
// `currentIcons` below, which both modules share) — keeping them out of this
// pool avoids the two shuffle features fighting over the same keys.
export const ICON_OPTIONS: Record<string, string[]> = {
  solar: [mdiSolarPowerVariant, mdiSolarPanel, mdiWeatherSunny],
  grid: [mdiTransmissionTower, mdiPowerPlug, mdiFlash],
  home: [mdiHome, mdiHomeOutline, mdiHomeModern],
  battery: [mdiBatteryMedium, mdiBatteryCharging60, mdiHomeBattery],
};
const STRUCTURAL_DEFAULT_ICONS = Object.fromEntries(
  Object.entries(ICON_OPTIONS).map(([k, opts]) => [k, opts[0]]),
);
// Full default set, matching core.ts's own DEFAULT_ICONS for the
// consumer-slot keys — the starting point before any appliance is shuffled.
export const DEFAULT_ICONS: Record<string, string> = {
  ...STRUCTURAL_DEFAULT_ICONS,
  consumer1: mdiPowerSocket,
  consumer2: mdiPowerSocket,
  consumer3: mdiPowerSocket,
  consumer4: mdiPowerSocket,
  batteryLoad1: mdiPowerSocket,
  batteryLoad2: mdiPowerSocket,
};
export const ICON_NAMES: Record<string, string> = {
  [mdiSolarPowerVariant]: 'mdiSolarPowerVariant',
  [mdiSolarPanel]: 'mdiSolarPanel',
  [mdiWeatherSunny]: 'mdiWeatherSunny',
  [mdiTransmissionTower]: 'mdiTransmissionTower',
  [mdiPowerPlug]: 'mdiPowerPlug',
  [mdiFlash]: 'mdiFlash',
  [mdiHome]: 'mdiHome',
  [mdiHomeOutline]: 'mdiHomeOutline',
  [mdiHomeModern]: 'mdiHomeModern',
  [mdiBatteryMedium]: 'mdiBatteryMedium',
  [mdiBatteryCharging60]: 'mdiBatteryCharging60',
  [mdiHomeBattery]: 'mdiHomeBattery',
  [mdiEvStation]: 'mdiEvStation',
  [mdiCarElectric]: 'mdiCarElectric',
  [mdiEvPlugType2]: 'mdiEvPlugType2',
  [mdiPowerSocket]: 'mdiPowerSocket',
};

// Shared with playground-appliances.ts, which mutates the consumer-slot
// keys directly (object mutation, not reassignment — reassigning an
// imported binding isn't allowed, but writing its properties is) and then
// re-sets `el.icons` itself. Kept as one object so neither module's
// `el.icons = ...` call ever clobbers the other's choices.
export const currentIcons: Record<string, string> = { ...DEFAULT_ICONS };

(document.getElementById('shuffle-icons') as HTMLElement).addEventListener(
  'click',
  () => {
    for (const [k, opts] of Object.entries(ICON_OPTIONS)) {
      currentIcons[k] = opts[Math.floor(Math.random() * opts.length)];
    }
    el.icons = currentIcons;
  },
);
(document.getElementById('reset-icons') as HTMLElement).addEventListener(
  'click',
  () => {
    Object.assign(currentIcons, STRUCTURAL_DEFAULT_ICONS);
    el.icons = currentIcons;
  },
);
