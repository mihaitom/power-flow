import {
  mdiSolarPowerVariant,
  mdiTransmissionTower,
  mdiHome,
  mdiBatteryMedium,
  mdiEvStation,
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
  wallbox: '#22d3ee', // cyan — EV charger 1
  wallbox2: '#2dd4bf', // teal — EV charger 2
  batteryLoad: '#a78bfa', // violet — battery-fed direct load 1
  batteryLoad2: '#c084fc', // purple — battery-fed direct load 2
};

export const DEFAULT_LABELS: FlowLabels = {
  solar: 'Solar',
  grid: 'Grid',
  home: 'Home',
  battery: 'Battery',
  wallbox: 'Wallbox',
  wallbox2: 'Wallbox 2',
  batteryLoad: 'Battery Load',
  batteryLoad2: 'Battery Load 2',
};

export const DEFAULT_ICONS: FlowIcons = {
  solar: mdiSolarPowerVariant,
  grid: mdiTransmissionTower,
  home: mdiHome,
  battery: mdiBatteryMedium,
  wallbox: mdiEvStation,
  wallbox2: mdiEvStation,
  batteryLoad: mdiPowerSocket,
  batteryLoad2: mdiPowerSocket,
};

export const DEFAULT_TOPOLOGY: FlowTopology = {
  solarToHome: true,
  solarToGrid: true,
  solarToBattery: true,
  batteryToHome: true,
  batteryToGrid: true,
};
