/** Live energy readings driving the diagram. All power values are in watts. */
export interface FlowData {
  /** Solar / PV production (>= 0). Omit/null hides the solar node. */
  solar?: number | null;
  /** Grid power. Positive = importing from grid, negative = exporting. */
  grid: number;
  /** House consumption (>= 0). */
  load: number;
  /** Battery power. Positive = discharging (to house), negative = charging. Omit/null hides the battery node. */
  battery?: number | null;
  /** Battery state of charge in percent (0–100). */
  batterySoc?: number | null;
  /** Wallbox / EV charger consumption (below the house). Omit/null hides the node. */
  wallbox?: number | null;
  /** Second wallbox / EV charger consumption (above the house). Omit/null hides the node. */
  wallbox2?: number | null;
  /** Load fed directly from a battery output port, bypassing the house circuit
   *  entirely (e.g. an AC unit wired straight to the battery). A sub-consumer
   *  of `battery`'s discharge — already included in it, drawn as a separate
   *  leg, not extra discharge on top. Only shown when `battery` is also set.
   *  Omit/null hides the node. */
  batteryLoad?: number | null;
  /** Second battery-fed direct load, structurally identical to `batteryLoad`. */
  batteryLoad2?: number | null;
}

/** Toggles individual built-in connections on/off to match wiring that
 *  doesn't allow a given flow (e.g. a PV source with no direct link to the
 *  house/grid, only to the battery). All default to `true` (today's
 *  behavior). Power that a disabled connection would have carried is simply
 *  not drawn further (curtailed) — no spill/overflow is modeled elsewhere.
 *  `battery` ↔ `grid` is a single shared physical path in both directions,
 *  so `batteryToGrid: false` also hides the grid → battery charging dot. */
export interface FlowTopology {
  solarToHome: boolean;
  solarToGrid: boolean;
  solarToBattery: boolean;
  batteryToHome: boolean;
  batteryToGrid: boolean;
}

/** Color for each node and flow direction. Any CSS color string. */
export interface FlowColors {
  solar: string;
  home: string;
  /** Grid node + dots while importing from the grid. */
  gridIn: string;
  /** Grid node + dots while exporting to the grid. */
  gridOut: string;
  /** Battery node + dots while charging (energy into the battery). */
  batteryIn: string;
  /** Battery node + dots while discharging (energy out of the battery). */
  batteryOut: string;
  wallbox: string;
  wallbox2: string;
  batteryLoad: string;
  batteryLoad2: string;
}

/** Text label under each node. */
export interface FlowLabels {
  solar: string;
  grid: string;
  home: string;
  battery: string;
  wallbox: string;
  wallbox2: string;
  batteryLoad: string;
  batteryLoad2: string;
}

/** SVG path string (`mdi*` from @mdi/js or any valid `<path d="">`) for each node icon. */
export interface FlowIcons {
  solar: string;
  grid: string;
  home: string;
  battery: string;
  wallbox: string;
  wallbox2: string;
  batteryLoad: string;
  batteryLoad2: string;
}

export interface PowerFlowOptions {
  data: FlowData;
  colors?: Partial<FlowColors>;
  labels?: Partial<FlowLabels>;
  icons?: Partial<FlowIcons>;
  /** Dot speed multiplier. 1 = default, 2 = twice as fast, 0.5 = half speed. */
  speedScale?: number;
  /** Enable/disable individual built-in connections. Defaults to all `true`. */
  topology?: Partial<FlowTopology>;
}
