/** Live energy readings driving the diagram. All power values are in watts. */
export interface FlowData {
  /** Solar / PV production (>= 0). Omit/null hides the solar node. */
  solar?: number | null;
  /** Grid power. Positive = importing from grid, negative = exporting. */
  grid: number;
  /** House consumption (>= 0). */
  load: number;
  /** Battery power. Positive = charging, negative = discharging (to house). Omit/null hides the battery node. */
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
 *  house/grid, only to the battery). All default to `true` (fully
 *  connected). Power that a disabled connection would have carried is simply
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

/** How a node's background/ring/icon/text are painted:
 *  - `'soft'` (default) — a light tint of the accent color as background,
 *    plus a colored ring.
 *  - `'tonal'` — an opaque, muted (pastel) fill in the accent color, no ring.
 *  - `'outline'` — transparent background, just a colored ring.
 *  - `'filled'` — the node's full accent color as background, icon/text
 *    switched to a uniform white with a drop shadow for contrast. */
export type NodeStyle = 'soft' | 'tonal' | 'outline' | 'filled';

/** Shape of the animated flow dots — see `PowerFlowSettings.dotShape`. */
export type DotShape = 'circle' | 'triangle' | 'bolt' | 'chevron' | 'spark';

/** Everything about the diagram other than the live `data` itself: colors,
 *  labels, icons, topology, and presentation/behavior tuning knobs. */
export interface PowerFlowSettings {
  colors: Partial<FlowColors>;
  labels: Partial<FlowLabels>;
  icons: Partial<FlowIcons>;
  /** Enable/disable individual built-in connections. Defaults to all `true`. */
  topology: Partial<FlowTopology>;
  /** Dot speed multiplier. 1 = default, 2 = twice as fast, 0.5 = half speed. */
  speedScale: number;
  /** How each node's background/ring/icon/text are painted. Default `'soft'`. */
  nodeStyle: NodeStyle;
  /** `'full'` draws each node's icon large behind the value/label text
   *  (dimmed, as a background) instead of small above it. Default `'default'`. */
  iconStyle: 'default' | 'full';
  /** Shape of the animated flow dots. `'circle'` (default) is a plain dot.
   *  `'triangle'` draws small arrowheads pointing in their direction of
   *  travel. `'bolt'` draws a small lightning bolt. `'chevron'` draws a
   *  slim "›" pointing in the direction of travel. `'spark'` draws a small
   *  4-point sparkle/star. `'triangle'`, `'bolt'` and `'chevron'` all
   *  orient themselves along their direction of travel; `'spark'` doesn't
   *  need to (it's symmetric) but rotates along too, for no visual
   *  difference. */
  dotShape: DotShape;
  /** Number of dots animated per active flow line, evenly spaced along the
   *  path. `1` (the default) is the classic single traveling dot. Clamped
   *  internally to `1–8`. The four short direct connections between
   *  grid-adjacent nodes (home↔consumer1/2, battery↔batteryLoad1/2) always
   *  cap at 2 regardless of this value — their path is too short for more
   *  dots to read as distinct. */
  dotCount: number;
  /** Scales the diagram's curved connections by stretching/shrinking how far
   *  each one travels in its fixed departure/arrival direction before
   *  turning. `0` collapses them into direct lines, `1` (the default) is
   *  the standard curve, values above `1` hold the straight direction longer
   *  with a sharper turn in between. Clamped to `0–2.5` internally to keep
   *  curves from crossing neighboring nodes. */
  curveBend: number;
  /** Vertical center-to-center distance (in px) between the middle row
   *  (grid/home) and the top/bottom rows (solar/consumer1/consumer3 and
   *  battery/consumer2/consumer4/batteryLoad1/batteryLoad2). Default `125` —
   *  the diagram's original spacing, slightly tighter than the fixed 145px
   *  horizontal column gap. Set to `145` to match the column gap exactly, or
   *  any other value. Clamped internally to `110–180` (below 110 the top/
   *  bottom rows would crowd the middle row; above 180 the diagram reads as
   *  overly stretched-out). */
  rowGap: number;
  /** Horizontal center-to-center distance (in px) between adjacent columns —
   *  grid/batteryLoad1, solar/battery, home (fixed anchor — never moves),
   *  and consumer3/consumer4, each `columnGap` px from the next. Default
   *  `145` — the diagram's original, always-shipped spacing. Clamped
   *  internally to `110–180`, for the same reason as `rowGap`. */
  columnGap: number;
  /** Whether the battery's SoC ring shows an animated highlight (a bright
   *  comet that spins around the charged portion of the ring) while
   *  charging/discharging. Default `true`. Set `false` for a plain static
   *  ring with no motion. */
  batteryChargeHighlight: boolean;
}

export interface PowerFlowOptions {
  data: FlowData;
  /** Colors, labels, icons, topology and presentation tuning — see `PowerFlowSettings`. */
  options?: Partial<PowerFlowSettings>;
}
