import {
  mdiAirConditioner,
  mdiHeatPump,
  mdiPool,
  mdiHotTub,
  mdiServer,
  mdiServerNetwork,
  mdiDesktopTower,
  mdiEvStation,
  mdiWashingMachine,
  mdiTumbleDryer,
  mdiDishwasher,
  mdiWaterBoiler,
  mdiToolbox,
  mdiFridgeIndustrial,
} from '@mdi/js';
import { el } from './playground-dom';
import { currentIcons } from './playground-icons';

// Demonstrates that wallbox/wallbox2/batteryLoad/batteryLoad2 aren't
// specifically about EV charging — they're generic "direct consumer" slots.
// A pool of common large, individually-monitored household loads, each with
// a matching icon.
interface Appliance {
  label: string;
  icon: string;
}
const APPLIANCES: Appliance[] = [
  { label: 'AC Unit', icon: mdiAirConditioner },
  { label: 'Heat Pump', icon: mdiHeatPump },
  { label: 'Pool Pump', icon: mdiPool },
  { label: 'Hot Tub', icon: mdiHotTub },
  { label: 'Home Server', icon: mdiServer },
  { label: 'Server Rack', icon: mdiServerNetwork },
  { label: 'Gaming PC', icon: mdiDesktopTower },
  { label: 'EV Charger', icon: mdiEvStation },
  { label: 'Washer', icon: mdiWashingMachine },
  { label: 'Dryer', icon: mdiTumbleDryer },
  { label: 'Dishwasher', icon: mdiDishwasher },
  { label: 'Water Heater', icon: mdiWaterBoiler },
  { label: 'Workshop', icon: mdiToolbox },
  { label: 'Freezer', icon: mdiFridgeIndustrial },
];

const SLOTS = ['wallbox', 'wallbox2', 'batteryLoad', 'batteryLoad2'] as const;

// So playground-share.ts's snippet generator can emit a clean `mdiXxx` import
// for these too, instead of falling back to an inline raw path string.
export const APPLIANCE_ICON_NAMES: Record<string, string> = {
  [mdiAirConditioner]: 'mdiAirConditioner',
  [mdiHeatPump]: 'mdiHeatPump',
  [mdiPool]: 'mdiPool',
  [mdiHotTub]: 'mdiHotTub',
  [mdiServer]: 'mdiServer',
  [mdiServerNetwork]: 'mdiServerNetwork',
  [mdiDesktopTower]: 'mdiDesktopTower',
  [mdiEvStation]: 'mdiEvStation',
  [mdiWashingMachine]: 'mdiWashingMachine',
  [mdiTumbleDryer]: 'mdiTumbleDryer',
  [mdiDishwasher]: 'mdiDishwasher',
  [mdiWaterBoiler]: 'mdiWaterBoiler',
  [mdiToolbox]: 'mdiToolbox',
  [mdiFridgeIndustrial]: 'mdiFridgeIndustrial',
};

/** `null` until the button has been clicked at least once — lets
 *  playground-share.ts's snippet generator know whether to include labels
 *  at all. */
export let currentLabels: Record<string, string> | null = null;

const appliancesBtn = document.getElementById('shuffle-appliances') as HTMLElement;
appliancesBtn.addEventListener('click', () => {
  // Pick 4 distinct appliances (partial Fisher-Yates over a copy of the pool).
  const pool = [...APPLIANCES];
  const picks = SLOTS.map(
    () => pool.splice(Math.floor(Math.random() * pool.length), 1)[0],
  );

  const labels: Record<string, string> = {};
  SLOTS.forEach((slot, i) => {
    labels[slot] = picks[i].label;
    currentIcons[slot] = picks[i].icon;
  });
  currentLabels = labels;
  el.labels = labels;
  el.icons = currentIcons;
});
