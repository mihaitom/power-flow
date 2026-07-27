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
  /** House consumer 1 (top-left). Omit/null hides the node. A sub-consumer
   *  of `load` (drawn as a separate leg), not extra load on top. Generic —
   *  not necessarily an EV charger; use `labels`/`icons` to relabel it for
   *  whatever appliance it actually is. */
  consumer1?: number | null;
  /** House consumer 2 (bottom-left). Omit/null hides the node. A sub-consumer
   *  of `load`, like `consumer1`.
   *  Note: `consumer2` shares its position with `batteryLoad2` — if both are
   *  set at once, a conflict indicator is shown there instead of either
   *  value; see the "Consumer slot layout" section of the README. */
  consumer2?: number | null;
  /** House consumer 3 (top-right). Omit/null hides the node. A
   *  sub-consumer of `load`, like `consumer1`. */
  consumer3?: number | null;
  /** House consumer 4 (bottom-right). Omit/null hides the node. A
   *  sub-consumer of `load`, like `consumer1`. */
  consumer4?: number | null;
  /** Load fed directly from a battery output port, bypassing the house circuit
   *  entirely (e.g. an AC unit wired straight to the battery). A sub-consumer
   *  of `battery`'s discharge — already included in it, drawn as a separate
   *  leg, not extra discharge on top. Only shown when `battery` is also set.
   *  Omit/null hides the node. */
  batteryLoad1?: number | null;
  /** Second battery-fed direct load, structurally identical to `batteryLoad1`.
   *  Note: shares its position with `consumer2` — see `consumer2` above. */
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
  consumer1: string;
  consumer2: string;
  consumer3: string;
  consumer4: string;
  batteryLoad1: string;
  batteryLoad2: string;
}

/** Text label under each node. */
export interface FlowLabels {
  solar: string;
  grid: string;
  home: string;
  battery: string;
  consumer1: string;
  consumer2: string;
  consumer3: string;
  consumer4: string;
  batteryLoad1: string;
  batteryLoad2: string;
}

/** SVG path string (`mdi*` from @mdi/js or any valid `<path d="">`) for each node icon. */
export interface FlowIcons {
  solar: string;
  grid: string;
  home: string;
  battery: string;
  consumer1: string;
  consumer2: string;
  consumer3: string;
  consumer4: string;
  batteryLoad1: string;
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
