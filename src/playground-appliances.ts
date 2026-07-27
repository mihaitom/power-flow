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

// Demonstrates that consumer1/consumer2/consumer3/consumer4/batteryLoad1/
// batteryLoad2 aren't specifically about EV charging — they're generic
// "direct consumer" slots. A pool of common large, individually-monitored
// household loads, each with a matching icon.
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
  { label: 'Wallbox', icon: mdiEvStation },
  { label: 'Washer', icon: mdiWashingMachine },
  { label: 'Dryer', icon: mdiTumbleDryer },
  { label: 'Dishwasher', icon: mdiDishwasher },
  { label: 'Water Heater', icon: mdiWaterBoiler },
  { label: 'Workshop', icon: mdiToolbox },
  { label: 'Freezer', icon: mdiFridgeIndustrial },
];

const SLOTS = [
  'consumer1',
  'consumer2',
  'consumer3',
  'consumer4',
  'batteryLoad1',
  'batteryLoad2',
] as const;

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

/** Set as soon as appliances are shuffled (which now happens once up front,
 *  so this is non-null from load onward) — lets playground-share.ts's
 *  snippet generator know whether to include labels at all. */
export let currentLabels: Record<string, string> | null = null;

function shuffleAppliances() {
  // Pick 6 distinct appliances (partial Fisher-Yates over a copy of the pool).
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
}

const appliancesBtn = document.getElementById('shuffle-appliances') as HTMLElement;
appliancesBtn.addEventListener('click', shuffleAppliances);

// Shuffle once up front so the playground opens with varied, realistic
// appliance names/icons in the consumer slots instead of the generic
// "Consumer 1"/"Consumer 2" defaults.
shuffleAppliances();
