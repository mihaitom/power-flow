import {
  mdiSolarPowerVariant,
  mdiTransmissionTower,
  mdiHome,
  mdiBatteryMedium,
  mdiPowerSocket,
} from '@mdi/js';
import type { FlowColors, FlowLabels, FlowIcons, FlowTopology } from './types';

export const DEFAULT_COLORS: FlowColors = {
  solar: '#fcd34d', // warm amber-yellow — sun
  home: '#818cf8', // periwinkle — modern consumption hub
  gridIn: '#60a5fa', // sky blue — drawing from the grid
  gridOut: '#f472b6', // pink-magenta — feeding back to grid
  batteryIn: '#4ade80', // lime green — charging (positive)
  batteryOut: '#fb923c', // orange — discharging (warm energy out)
  consumer1: '#22d3ee', // cyan — house consumer 1
  consumer2: '#2dd4bf', // teal — house consumer 2
  consumer3: '#38bdf8', // sky blue — house consumer 3
  consumer4: '#0d9488', // deep teal — house consumer 4
  batteryLoad1: '#a78bfa', // violet — battery-fed direct load 1
  batteryLoad2: '#c084fc', // purple — battery-fed direct load 2
};

export const DEFAULT_LABELS: FlowLabels = {
  solar: 'Solar',
  grid: 'Grid',
  home: 'Home',
  battery: 'Battery',
  consumer1: 'Consumer 1',
  consumer2: 'Consumer 2',
  consumer3: 'Consumer 3',
  consumer4: 'Consumer 4',
  batteryLoad1: 'Battery Load 1',
  batteryLoad2: 'Battery Load 2',
};

// Generic — these slots aren't specifically EV chargers, so the default icon
// is a plain power socket, same as batteryLoad1/batteryLoad2. Callers relabel
// via `icons`/`labels` for whatever appliance a slot actually represents.
export const DEFAULT_ICONS: FlowIcons = {
  solar: mdiSolarPowerVariant,
  grid: mdiTransmissionTower,
  home: mdiHome,
  battery: mdiBatteryMedium,
  consumer1: mdiPowerSocket,
  consumer2: mdiPowerSocket,
  consumer3: mdiPowerSocket,
  consumer4: mdiPowerSocket,
  batteryLoad1: mdiPowerSocket,
  batteryLoad2: mdiPowerSocket,
};

export const DEFAULT_TOPOLOGY: FlowTopology = {
  solarToHome: true,
  solarToGrid: true,
  solarToBattery: true,
  batteryToHome: true,
  batteryToGrid: true,
};
