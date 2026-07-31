import {
  mdiSolarPowerVariant,
  mdiTransmissionTower,
  mdiHome,
  mdiBatteryMedium,
  mdiPowerSocket,
  mdiAlertCircle,
} from '@mdi/js';

const SVGNS = 'http://www.w3.org/2000/svg';

// Circumference of the r=47 coverage/SoC/charge-highlight rings (home/grid
// coverage arcs, battery SoC arc, battery charge-highlight comet) — shared
// so core.ts doesn't hardcode its own copy of 2·π·47.
export const ARC_LENGTH = 2 * Math.PI * 47; // ≈ 295.31

// Angular length of the comet head's dash, converted to the px length
// stroke-dasharray needs — short relative to ARC_LENGTH so the comet reads
// as a localized highlight, not a second progress arc. Baked into each
// band's stroke-dasharray directly in the markup since it's a constant —
// only stroke-dashoffset changes at runtime, and it's driven from core.ts's
// own animation loop rather than a CSS animation (see BATTERY_COMET_LAYERS
// below for why).
const BAT_COMET_HEAD_DEG = 5;
const BAT_COMET_DASH = (ARC_LENGTH * BAT_COMET_HEAD_DEG) / 360;
const BAT_COMET_DASHARRAY = `${BAT_COMET_DASH} ${ARC_LENGTH - BAT_COMET_DASH}`;
const BAT_COMET_TAIL_SEGMENTS = 5;
const BAT_COMET_TAIL_STEP_DEG = 2.2; // successive bands are 2.2° further behind the head

// Every layer batteryCometMarkup() below generates, each with how far behind
// the head it trails as a 0..1 fraction of one full lap — exported so
// core.ts's tick loop can position every layer's stroke-dashoffset itself
// (see the .bat-charge-* CSS comment for why a plain CSS animation can't
// drive this) without duplicating this module's tail geometry, and so
// applyLayout() can reposition all of them (along with bat-soc-mask-arc)
// when rowGap/columnGap move the battery node, the same way it already
// repositions bat-soc-arc itself.
export const BATTERY_COMET_LAYERS: { id: string; delay: number }[] = [
  { id: 'bat-charge-bloom', delay: 0 },
  { id: 'bat-charge-glow', delay: 0 },
  { id: 'bat-charge-core', delay: 0 },
  ...Array.from({ length: BAT_COMET_TAIL_SEGMENTS }, (_, i) => {
    const n = i + 1;
    return { id: `bat-charge-tail-${n}`, delay: (n * BAT_COMET_TAIL_STEP_DEG) / 360 };
  }),
];

// Builds the battery charge/discharge "comet": a three-layer bright head
// (bloom/glow/core — three different blur radii stacked for visual depth,
// the way a real bloom/glow render is layered rather than a single blurred
// shape) followed by a smoothly tapering tail of many thin trailing bands.
// SVG has no conic-gradient, and a stroke gradient can't stay attached to a
// shape animated via stroke-dashoffset (its coordinates don't travel with
// the dash), so the fade is approximated by generating enough discrete tail
// bands that the eye reads it as continuous — see the .bat-charge-tail CSS
// comment for how they stay attached to the head via BATTERY_COMET_LAYERS'
// `delay` instead. Each band's opacity/width/blur follow an eased (squared)
// falloff rather than a linear one so the tail thins out gradually near the
// head and disappears quickly toward its faint end, closer to how a real
// glow actually falls off than a straight ramp would look.
function batteryCometMarkup(cx: number, cy: number): string {
  const arc = (id: string, extraAttrs: string) =>
    `<circle id="${id}" cx="${cx}" cy="${cy}" r="47" stroke-dasharray="${BAT_COMET_DASHARRAY}" transform="rotate(-90 ${cx} ${cy})" ${extraAttrs} />`;

  const tail = BATTERY_COMET_LAYERS.filter((l) => l.delay > 0)
    .map(({ id }, i) => {
      const n = i + 1;
      const t = n / BAT_COMET_TAIL_SEGMENTS; // 0 (nearest the head) .. 1 (tail's faint end)
      const fade = (1 - t) ** 2;
      const opacity = (0.4 * fade).toFixed(3);
      const width = (9 - t * 5.5).toFixed(1);
      const blur = (3 + t * 8).toFixed(1);
      return arc(
        id,
        `class="bat-charge-tail" style="opacity: ${opacity}; stroke-width: ${width}; filter: blur(${blur}px)"`,
      );
    })
    .reverse() // paint the faintest/furthest band first so the head stays on top
    .join('\n      ');

  const head = [
    arc('bat-charge-bloom', 'class="bat-charge-bloom"'),
    arc('bat-charge-glow', 'class="bat-charge-glow"'),
    arc('bat-charge-core', 'class="bat-charge-core"'),
  ].join('\n      ');

  return `${tail}\n      ${head}`;
}

// MDI paths live in a 24×24 box. We draw native SVG paths instead of
// foreignObject because Safari/WebKit mis-positions foreignObject inside
// scaled SVGs. Centers the icon at (centerX, centerY) and scales it to size.
export function iconTransform(centerX: number, centerY: number, size: number): string {
  return `translate(${centerX - size / 2} ${centerY - size / 2}) scale(${size / 24})`;
}

// The diagram's row/column layout. Columns sit a fixed 145px apart
// (x=55/200/345/490 below); rows are laid out around the fixed middle row
// (grid/home, always at MID_ROW_Y) with the top and bottom rows each
// `rowGap` px above/below it — configurable via `options.rowGap` (see
// core.ts's applyRowGap()). DEFAULT_ROW_GAP (125) is the original, always-
// shipped spacing; it's slightly tighter than the 145px column gap. Pass
// `rowGap: 145` to make vertical and horizontal spacing match exactly.
export const MID_ROW_Y = 185;
export const DEFAULT_ROW_GAP = 125;

export interface RowLayout {
  topY: number; // top row cy (solar / consumer1 / consumer3)
  botY: number; // bottom row cy (battery / consumer2 / consumer4 / batteryLoad1 / batteryLoad2 / conflict)
  topInner: number; // top row nodes' bottom edge, facing the middle row — topY + 52
  botInner: number; // bottom row nodes' top edge, facing the middle row — botY − 52
  topOuter: number; // top row nodes' top edge — topY − 52 (viewBox trimming)
  botOuter: number; // bottom row nodes' bottom edge — botY + 52 (viewBox trimming)
}

export function rowLayout(rowGap: number): RowLayout {
  const topY = MID_ROW_Y - rowGap;
  const botY = MID_ROW_Y + rowGap;
  return { topY, botY, topInner: topY + 52, botInner: botY - 52, topOuter: topY - 52, botOuter: botY + 52 };
}

// Columns, analogous to rows above — but unlike the row layout (symmetric
// around a fixed middle), columns form a left-to-right chain of 4, each
// `columnGap` px apart. Home's column (HOME_COL_X) is the fixed anchor —
// home/consumer1/consumer2/batteryLoad2/conflict all sit on it and never
// move horizontally, the same way grid/home's shared row never moves
// vertically — so `columnGap` only shifts grid/solar/battery/batteryLoad1
// (left of home) and consumer3/consumer4 (right of home).
export const HOME_COL_X = 345;
export const DEFAULT_COLUMN_GAP = 145;

export interface ColumnLayout {
  col1: number; // grid / batteryLoad1
  col2: number; // solar / battery
  col3: number; // home / consumer1 / consumer2 / batteryLoad2 / conflict — always HOME_COL_X
  col4: number; // consumer3 / consumer4
  minX: number; // col1's own outer edge minus a small margin (viewBox trimming)
}

export function columnLayout(columnGap: number): ColumnLayout {
  const col3 = HOME_COL_X;
  const col2 = col3 - columnGap;
  const col1 = col2 - columnGap;
  const col4 = col3 + columnGap;
  return { col1, col2, col3, col4, minX: col1 - 52 - 3 };
}

// One entry per animated dot. `cls` selects the dot color via CSS — always
// the color of the leg's *source*, never its destination, so e.g. solar→grid
// and battery→grid (both exports) are colored solar/battery respectively,
// not a shared "export" color, and solar→battery and grid→battery (both
// charging) are colored solar/grid respectively, not a shared "charging"
// color. `reverse` animates the dot from the path's end to its start (used
// to send a dot the opposite way along a path that is shared by two flow
// directions). `maxDots` caps how many of `options.dotCount`'s dots this
// particular leg ever shows — used for the four short direct connections
// between grid-adjacent nodes (home↔consumer1/2, battery↔batteryload1/2),
// where their path is too short for more than a couple of evenly-spaced dots
// to read as separate rather than overlapping; unset means no extra cap
// beyond `options.dotCount` itself.
export const DOTS: {
  id: string;
  cls: string;
  path: string;
  reverse?: boolean;
  maxDots?: number;
}[] = [
  { id: 'solar-home', cls: 'solar', path: 'p-solar-home' },
  { id: 'solar-grid', cls: 'solar', path: 'p-solar-grid' },
  { id: 'grid-home', cls: 'grid', path: 'p-grid-home' },
  { id: 'bat-home', cls: 'battery-out', path: 'p-bat-home' },
  { id: 'bat-grid', cls: 'battery-out', path: 'p-bat-grid' },
  { id: 'solar-bat', cls: 'solar', path: 'p-solar-bat' },
  // Grid → battery shares the battery↔grid path, run in reverse (grid to battery).
  { id: 'grid-bat', cls: 'grid', path: 'p-bat-grid', reverse: true },
  { id: 'home-consumer1', cls: 'consumer1', path: 'p-home-consumer1', maxDots: 2 },
  { id: 'home-consumer2', cls: 'consumer2', path: 'p-home-consumer2', maxDots: 2 },
  { id: 'home-consumer3', cls: 'consumer3', path: 'p-home-consumer3' },
  { id: 'home-consumer4', cls: 'consumer4', path: 'p-home-consumer4' },
  { id: 'bat-batteryload1', cls: 'battery-load1', path: 'p-bat-batteryload1', maxDots: 2 },
  { id: 'bat-batteryload2', cls: 'battery-load2', path: 'p-bat-batteryload2', maxDots: 2 },
];

// Upper bound on `options.dotCount` — how many evenly-spaced marker elements
// are pre-rendered per flow in the static skeleton below. Markers beyond the
// current `dotCount` just stay hidden (same pattern as topology's `display`
// toggling), so path lengths still only need to be measured once and dots
// never need to be created/destroyed at runtime.
export const MAX_DOTS_PER_TRACK = 8;

// The three non-'circle' dot shapes (see DotShape in types.ts) — each drawn
// as a small shape pointing along +x (its own "forward"), wrapped in a <g>
// so core.ts's placeMarker() can position *and* rotate it every frame with a
// single `transform` attribute (translate to the current path point, rotate
// to the current direction of travel — exactly like the long-standing
// 'triangle' shape). The inner shape carries the shrink pop-in/out CSS
// transition instead of the wrapper (see the CSS comment below for why
// those can't be the same element) — `idPrefix` is that inner element's id
// prefix (`dot-${idPrefix}-${trackId}-${i}`), and `inner(cls)` builds it,
// `cls` being the same per-track color class every other dot shape uses.
// Exported so core.ts's initDots() can look up the same three shapes by the
// same ids without a second hardcoded list to keep in sync.
export const ORIENTED_DOT_SHAPES: {
  shape: 'triangle' | 'bolt' | 'chevron' | 'spark';
  idPrefix: string;
  wrapClass: string;
  inner: (cls: string) => string;
}[] = [
  {
    shape: 'triangle',
    idPrefix: 'tri',
    wrapClass: 'dot-tri-wrap',
    inner: (cls) =>
      `<polygon points="-4,-3.5 -4,3.5 6,0" class="dot dot-tri ${cls}" vector-effect="non-scaling-stroke" />`,
  },
  // A small lightning bolt, tip leading in the direction of travel (same
  // "forward = +x" convention as the triangle) — the classic zigzag glyph
  // (mdiLightningBolt's own outline, just rotated 90° and rescaled to this
  // module's -6..6 marker envelope instead of a straight arrowhead).
  {
    shape: 'bolt',
    idPrefix: 'bolt',
    wrapClass: 'dot-bolt-wrap',
    inner: (cls) =>
      `<polygon points="1.7,0.6 1.7,3.3 -6,-0.6 -1.7,-0.6 -1.7,-3.3 6,0.6" class="dot dot-bolt ${cls}" vector-effect="non-scaling-stroke" />`,
  },
  // A slim "›" — a lighter, less "arrow-like" alternative to the solid
  // triangle. Stroked (open path, unclosed), with a sharp miter/round-cap
  // treatment (see the CSS comment below) so its point stays crisp. Scaled
  // to the same rough ±3.5 vertical envelope as the triangle rather than
  // the marker module's usual ±6 — a "›" that wide reads oversized next to
  // the other shapes, since unlike them its two open arms are its *whole*
  // silhouette (nothing filling the space between).
  {
    shape: 'chevron',
    idPrefix: 'chevron',
    wrapClass: 'dot-chevron-wrap',
    inner: (cls) =>
      `<path d="M-3,-3.5 L3,0 L-3,3.5" class="dot dot-chevron ${cls}" vector-effect="non-scaling-stroke" fill="none" />`,
  },
  // A small 4-point sparkle/star — symmetric, so it doesn't *need* to orient
  // with travel direction the way the others do, but rotates along anyway
  // (via the same shared machinery) since a symmetric shape looks identical
  // either way — no special-casing needed. Outer tips at N/E/S/W, concave
  // inner points at the diagonals, the classic "✦" silhouette.
  {
    shape: 'spark',
    idPrefix: 'spark',
    wrapClass: 'dot-spark-wrap',
    inner: (cls) =>
      `<polygon points="0,-6 1.3,-1.3 6,0 1.3,1.3 0,6 -1.3,1.3 -6,0 -1.3,-1.3" class="dot dot-spark ${cls}" vector-effect="non-scaling-stroke" />`,
  },
];

// Maps a dot's `cls` to the `--sfd-*` custom property holding its color, so a
// track can be recolored to match the dot currently traveling along it (see
// the track-coloring pass in `update()`). Only `grid` doesn't match its CSS
// custom property name directly.
export const DOT_CLS_TO_COLOR_VAR: Record<string, string> = {
  solar: 'solar',
  grid: 'grid-in',
  'battery-out': 'battery-out',
  consumer1: 'consumer1',
  consumer2: 'consumer2',
  consumer3: 'consumer3',
  consumer4: 'consumer4',
  'battery-load1': 'battery-load1',
  'battery-load2': 'battery-load2',
};

// A track's element id, derived from its path id ("p-solar-home" → "use-solar-home").
export function trackIdFor(pathId: string): string {
  return 'use-' + pathId.slice(2);
}

// The 6 tracks that are true cubic bezier curves (the rest are straight H/V
// lines), as a function of the current `rowGap` and `columnGap` (see
// rowLayout()/columnLayout() above). `curveBend = 1` (the default)
// reproduces this geometry precisely — see applyCurveBend() in core.ts,
// which blends each point toward the straight P0→P3 line as `curveBend`
// drops toward 0. Each curve leaves its solar/battery-side node straight
// (vertical) and arrives at its grid/home-side node straight (horizontal),
// fanned out ±12 from that node's own center — 51 short of the node's edge
// (radius 52) so the fan-out reads as a deliberate offset, not a stray gap.
// The tangent handle length (38 at the default rowGap/columnGap, giving p1/
// p2 their offset from p0/p3) scales with whichever gap governs that leg's
// travel distance — vertical handles with rowGap, horizontal handles with
// columnGap — so curveBend's "straight run, then a sharp turn" character
// (see applyCurveBend()'s own comment) stays proportionally the same shape
// as the diagram is stretched, instead of a fixed-length handle shrinking
// to a sliver of the total travel (and the curve reverting to one plain
// bulging arc, barely responding to curveBend) at larger gaps.
export function curvesForLayout(
  rowGap: number,
  columnGap: number,
): { id: string; p0: [number, number]; p1: [number, number]; p2: [number, number]; p3: [number, number] }[] {
  const { topInner, botInner } = rowLayout(rowGap);
  const { col1, col2, col3, col4 } = columnLayout(columnGap);
  const vHandle = (38 * rowGap) / DEFAULT_ROW_GAP;
  const hHandle = 51 + (38 * columnGap) / DEFAULT_COLUMN_GAP;
  return [
    {
      id: 'p-solar-home',
      p0: [col2 + 12, topInner],
      p1: [col2 + 12, topInner + vHandle],
      p2: [col3 - hHandle, 173],
      p3: [col3 - 51, 173],
    },
    {
      id: 'p-solar-grid',
      p0: [col2 - 12, topInner],
      p1: [col2 - 12, topInner + vHandle],
      p2: [col1 + hHandle, 173],
      p3: [col1 + 51, 173],
    },
    {
      id: 'p-bat-home',
      p0: [col2 + 12, botInner],
      p1: [col2 + 12, botInner - vHandle],
      p2: [col3 - hHandle, 197],
      p3: [col3 - 51, 197],
    },
    {
      id: 'p-bat-grid',
      p0: [col2 - 12, botInner],
      p1: [col2 - 12, botInner - vHandle],
      p2: [col1 + hHandle, 197],
      p3: [col1 + 51, 197],
    },
    {
      id: 'p-home-consumer4',
      p0: [col3 + 51, 197],
      p1: [col3 + hHandle, 197],
      p2: [col4 - 12, botInner - vHandle],
      p3: [col4 - 12, botInner],
    },
    {
      id: 'p-home-consumer3',
      p0: [col3 + 51, 173],
      p1: [col3 + hHandle, 173],
      p2: [col4 - 12, topInner + vHandle],
      p3: [col4 - 12, topInner],
    },
  ];
}

export const CSS = `
:host { display: block; }
/* Fill the host box in both dimensions; preserveAspectRatio="meet" (the SVG
   default) keeps the diagram centered and uncropped. The host gets a natural
   aspect-ratio (set from the viewBox) so that, when no explicit height is
   given, the height still follows the width as before. */
.flow-svg { width: 100%; height: 100%; display: block; }

.track {
  fill: none;
  stroke: currentColor;
  stroke-width: 1;
  opacity: 0.15;
  transition: stroke 0.35s ease, opacity 0.35s ease;
}
/* Highlighted while its leg is actively carrying power — same color as the
   dot traveling along it, at a lower opacity so the dot still stands out. */
.track.active {
  stroke: var(--track-color, currentColor);
  opacity: 0.5;
}

.dot {
  stroke-width: 4;
  transition: r 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.dot.shrunk {
  r: 0;
  transition: r 0.18s ease-in;
}
.dot.solar { fill: var(--sfd-solar); stroke: var(--sfd-solar); }
.dot.grid { fill: var(--sfd-grid-in); stroke: var(--sfd-grid-in); }
.dot.battery-out { fill: var(--sfd-battery-out); stroke: var(--sfd-battery-out); }
.dot.consumer1 { fill: var(--sfd-consumer1); stroke: var(--sfd-consumer1); }
.dot.consumer2 { fill: var(--sfd-consumer2); stroke: var(--sfd-consumer2); }
.dot.consumer3 { fill: var(--sfd-consumer3); stroke: var(--sfd-consumer3); }
.dot.consumer4 { fill: var(--sfd-consumer4); stroke: var(--sfd-consumer4); }
.dot.battery-load1 { fill: var(--sfd-battery-load1); stroke: var(--sfd-battery-load1); }
.dot.battery-load2 { fill: var(--sfd-battery-load2); stroke: var(--sfd-battery-load2); }

/* Oriented dot variants (dotShape: 'triangle' | 'bolt' | 'chevron' |
   'spark') — a shaped marker instead of a plain stroked circle; the
   surrounding <g> carries position+rotation as a JS-set transform attribute
   every frame, so the pop-in/out shrink transition below lives on the shape
   itself (a CSS transform on the <g> would win over its attribute and
   silently break the positioning). All four share the same shrink
   transition, differing only in whether the shape itself is filled
   (triangle/bolt/spark) or stroked (chevron — a thin "›" reads better
   stroked than as a sliver of fill). "miter" (not the usual "round") on
   chevron's join keeps its point crisp instead of blunting it into a soft
   bump that reads as a scribble at this size — "round" stays on its
   open-path caps, so those ends still taper off gently. */
.dot.dot-tri, .dot.dot-bolt, .dot.dot-spark { stroke: none; stroke-width: 0; }
.dot.dot-chevron { fill: none; stroke-width: 2; stroke-linecap: round; stroke-linejoin: miter; }
.dot-tri, .dot-bolt, .dot-chevron, .dot-spark {
  transform: scale(1);
  transition: transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.dot-tri.shrunk, .dot-bolt.shrunk, .dot-chevron.shrunk, .dot-spark.shrunk {
  transform: scale(0);
  transition: transform 0.18s ease-in;
}

.node { transition: opacity 0.35s ease; }
.node-bg { stroke: none; transition: fill 0.35s ease; }
.node-ring { fill: none; stroke-width: 2.5; transition: stroke 0.35s ease; }
.node-icon { transition: fill 0.35s ease; }
/* iconStyle: 'full' — the icon fills most of the node as a dimmed background
   so the value/label text stays legible on top. */
.node-icon.node-icon-full { opacity: 0.22; }
.node.dim { opacity: 0.3; }

.home-arc {
  fill: none;
  stroke-width: 4;
  transition: stroke-dasharray 0.4s, stroke-dashoffset 0.4s;
}
.home-arc.solar-arc { stroke: var(--sfd-solar); }
/* The battery arcs show the battery feeding the home / an export — discharging. */
.home-arc.bat-arc { stroke: var(--sfd-battery-out); }
.home-arc.grid-arc { stroke: var(--sfd-grid-in); }

/* Battery charge/discharge highlight — a bright white "comet" (a three-blur-
   radius head — bloom/glow/core — with a smoothly tapering tail, see
   batteryCometMarkup() above) that spins around the same ring as
   bat-soc-arc, masked to its drawn extent (see the battery node markup and
   applyBatteryHighlight() in core.ts). Modeled on the classic conic-gradient
   spinner pattern (a rotating sliver that fades smoothly into transparent,
   duplicated with blur for glow) — SVG has no conic-gradient, and a stroke
   gradient can't easily stay attached to a shape animated via
   stroke-dashoffset (the gradient's own coordinates don't travel with it),
   so the fade is approximated instead by many thin trailing bands (see
   BATTERY_COMET_LAYERS above).
   The spin itself is driven from core.ts's own rAF loop (tick()), setting
   each layer's stroke-dashoffset directly every frame from a continuously
   advancing phase — deliberately *not* a plain CSS animation (as this used
   to be): a CSS animation's speed can only change via its animation-
   duration, and rebinding that custom property on a *running* animation
   makes the browser reinterpret the already-elapsed time against the new
   duration, snapping the comet to a different position the instant the
   charge/discharge rate changes (exactly the SMIL-restart problem the flow
   dots avoid the same way — see the "dots" field comment in core.ts). A
   continuously-accumulated phase has no such snap: a speed change just
   changes how fast it climbs from here, same as the dots.
   Deliberately near-white rather than the battery's own accent color — an
   overlay in the *same* hue as the ring it travels over reads as a dim
   smudge more than a highlight; a near-white pops against any accent color
   and against both themes, the same way a light-sweep glint would. Charging
   and discharging use two different near-white tints (cool vs. warm — see
   --bat-comet-color below) rather than literally the same white, so the
   highlight itself also reads as "energy in" vs. "energy out" at a glance,
   not just the ring color underneath it. */
.bat-charge-highlight-group {
  --bat-comet-color: #eef6ff; /* charging: cool white-blue, like an electric spark */
  opacity: 0;
  transition: opacity 0.3s ease;
}
.bat-charge-highlight-group.active { opacity: 1; }
.bat-charge-highlight-group.discharging {
  --bat-comet-color: #ffe0ad; /* discharging: warm amber-white, like heat leaving */
}
.bat-charge-bloom, .bat-charge-glow, .bat-charge-core, .bat-charge-tail {
  fill: none;
  stroke: var(--bat-comet-color);
  stroke-linecap: round;
}
/* Three stacked blur radii at the head (wide/faint → narrow/sharp) read as
   a much richer bloom than a single blurred layer would — closer to how a
   real glow actually falls off with distance. */
.bat-charge-bloom {
  stroke-width: 20;
  opacity: 0.16;
  filter: blur(8px);
}
.bat-charge-glow {
  stroke-width: 11;
  opacity: 0.55;
  filter: blur(3px);
}
.bat-charge-core {
  stroke-width: 4;
  opacity: 1;
}

.val-text { font-size: 14px; text-anchor: middle; fill: currentColor; font-weight: 700; }
/* t-grid-val/t-bat-watts are colored with their own live accent (import/
   export, charge/discharge — see core.ts) rather than the neutral
   currentColor every other value text uses, so they can blend into a
   same-hue background (their own node's tint in 'soft'/'tonal', or a
   similarly-colored track/dot passing behind them in 'outline'). A soft
   dark shadow (the same technique as .text-on-full, just lighter — this
   text sits on a much less busy background than full-size icon mode does)
   keeps them legible without depending on nodeStyle or theme. Applied
   unconditionally in the markup below rather than toggled in JS, since it's
   a permanent property of *which* text this is, not a mode-dependent state
   — it stays alongside .node-filled-ink's own drop-shadow in 'filled' mode
   without conflicting (different CSS mechanism, and imperceptible next to
   that stronger shadow). */
.val-text-accent { text-shadow: 0 1px 2px rgba(0, 0, 0, 0.45), 0 1px 4px rgba(0, 0, 0, 0.3); }
.lbl-text {
  font-size: 11px;
  text-anchor: middle;
  fill: currentColor;
  opacity: 0.75;
  font-weight: 500;
  letter-spacing: 0.04em;
}
/* iconStyle: 'full' — sits over a large dimmed icon instead of plain
   background, so a drop shadow helps it stay legible. Font-size itself is
   set directly in JS (applyIconStyle()), not here, since t-bat-watts already
   carries its own inline font-size that a CSS rule couldn't override. */
.text-on-full { text-shadow: 0 1px 3px rgba(0, 0, 0, 0.7), 0 1px 6px rgba(0, 0, 0, 0.5); }
/* nodeStyle: 'filled' — icon/text are painted one uniform color (not a
   per-node contrast pick) regardless of the node's own accent color, so
   legibility against that arbitrary accent comes from this shadow instead.
   Uses the drop-shadow filter rather than text-shadow so one class works on
   both the icon path and the value/label text elements. */
.node-filled-ink { filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.55)) drop-shadow(0 1px 5px rgba(0, 0, 0, 0.35)); }
`;

// The skeleton ships with `DEFAULT_ROW_GAP`/`DEFAULT_COLUMN_GAP`'s geometry
// baked in — a caller requesting different `options.rowGap`/`columnGap`
// values gets them applied immediately by core.ts's applyLayout()/
// applyCurveBend() as part of the very first update(), before anything is
// ever painted.
const L = rowLayout(DEFAULT_ROW_GAP);
const C = columnLayout(DEFAULT_COLUMN_GAP);
const curveD = (c: ReturnType<typeof curvesForLayout>[number]) =>
  `M${c.p0[0]},${c.p0[1]} C${c.p1[0]},${c.p1[1]} ${c.p2[0]},${c.p2[1]} ${c.p3[0]},${c.p3[1]}`;
const [cSolarHome, cSolarGrid, cBatHome, cBatGrid, cHomeConsumer4, cHomeConsumer3] = curvesForLayout(
  DEFAULT_ROW_GAP,
  DEFAULT_COLUMN_GAP,
);

// Static SVG skeleton. Every node, track and dot is present from the start;
// topology (battery/consumer1) is toggled via `display`, so path lengths only
// have to be measured once and SMIL animations never restart on toggle.
//
// Row/column layout: columns form a left-to-right chain `columnGap` px apart
// (DEFAULT_COLUMN_GAP, ${DEFAULT_COLUMN_GAP}), anchored on home's own fixed
// column (HOME_COL_X); rows sit around the fixed middle row (grid/home,
// y=${MID_ROW_Y}) with the top/bottom rows `rowGap` px above/below it —
// DEFAULT_ROW_GAP (${DEFAULT_ROW_GAP}) is slightly tighter than the default
// column gap. Both are configurable via `options.rowGap`/`options.columnGap`
// — see rowLayout()/columnLayout() above.
//
// Diagonal paths fan out at the grid/home side by ±12 (y=173/197), mirroring
// the fan-out at the solar/battery side (±12 from col2).
export const SKELETON = `
<svg class="flow-svg" xmlns="${SVGNS}">
  <defs>
    <path id="p-solar-home" d="${curveD(cSolarHome)}" />
    <path id="p-solar-grid" d="${curveD(cSolarGrid)}" />
    <path id="p-grid-home" d="M${C.col1 + 52},${MID_ROW_Y} H${C.col3 - 52}" />
    <path id="p-bat-home" d="${curveD(cBatHome)}" />
    <path id="p-bat-grid" d="${curveD(cBatGrid)}" />
    <path id="p-solar-bat" d="M${C.col2},${L.topInner} V${L.botInner}" />
    <!-- consumer1 is the top-left slot (${C.col3},${L.topY}), consumer2 the
         bottom-left slot (${C.col3},${L.botY}) — swapped from a naive
         1=bottom/2=top numbering so consumer1/2 read top-to-bottom like
         consumer3/4 do. Both always share home's own column (HOME_COL_X),
         so this track is unaffected by columnGap. -->
    <path id="p-home-consumer1" d="M${C.col3},${MID_ROW_Y - 52} V${L.topInner}" />
    <path id="p-home-consumer2" d="M${C.col3},${MID_ROW_Y + 52} V${L.botInner}" />
    <!-- Home's 4th consumer, bottom-right (${C.col4},${L.botY}). Home and
         this node sit exactly (${C.col4 - C.col3},${L.botY - MID_ROW_Y})
         apart — the same offset as grid and battery — so this is literally
         the p-bat-grid curve, reversed (that one runs battery→grid, we need
         the grid→battery direction) and translated to the grid→home /
         battery→consumer4 offset. Every control point stays at
         y ≤ ${L.botInner} (consumer2/batteryLoad2's own top edge at
         ${C.col3},${L.botY}), so the curve's convex hull stays entirely
         clear of that node. -->
    <path id="p-home-consumer4" d="${curveD(cHomeConsumer4)}" />
    <!-- Home's 3rd consumer, top-right (${C.col4},${L.topY}) — the same
         curve as p-home-consumer4, mirrored vertically around home's own row
         (y=${MID_ROW_Y}: y' = ${2 * MID_ROW_Y} − y), so it stays clear of
         consumer1 (${C.col3},${L.topY}) the same way consumer4's curve stays
         clear of consumer2/batteryLoad2 (${C.col3},${L.botY}). -->
    <path id="p-home-consumer3" d="${curveD(cHomeConsumer3)}" />
    <!-- batteryLoad1 always sits in the always-free (${C.col1},${L.botY})
         slot beside the battery. batteryLoad2 shares the
         (${C.col3},${L.botY}) slot with consumer2 — see the slot-conflict
         indicator below. -->
    <path id="p-bat-batteryload1" d="M${C.col2 - 52},${L.botY} H${C.col1 + 52}" />
    <path id="p-bat-batteryload2" d="M${C.col2 + 52},${L.botY} H${C.col3 - 52}" />
    <!-- Masks the battery charge/discharge highlight (see the battery node
         below) to bat-soc-arc's own drawn extent — its dasharray is kept in
         sync with bat-soc-arc's every update (see applyBatteryHighlight() in
         core.ts), so the highlight only ever shows over the charged portion
         of the ring. stroke-width is wider than the highlight's own widest
         layer (the blurred glow) so that blur isn't clipped radially, and
         the mask itself is blurred so the angular (start/end) cutoff is a
         soft fade rather than a hard edge slicing through the comet's own
         blur whenever it passes near either end of the charged arc. -->
    <mask id="bat-soc-mask" maskUnits="userSpaceOnUse">
      <circle id="bat-soc-mask-arc" cx="${C.col2}" cy="${L.botY}" r="47" fill="none" stroke="#fff" stroke-width="34" style="filter: blur(7px)" transform="rotate(-90 ${C.col2} ${L.botY})" />
    </mask>
  </defs>

  <!-- Every track has an id (derived as "use-" + its path id minus the "p-"
       prefix) so it can be looked up and recolored when actively carrying
       flow (see the track-coloring pass in update()). The five below also
       carry a configurable topology edge (see FlowTopology) — their
       visibility is driven entirely in code via setEdge(), combining node
       presence with the matching topology flag, so they deliberately carry
       no data-topo grouping attribute. -->
  <use id="use-solar-home" href="#p-solar-home" class="track" />
  <use id="use-solar-grid" href="#p-solar-grid" class="track" />
  <use id="use-grid-home" href="#p-grid-home" class="track" />
  <use id="use-bat-home" href="#p-bat-home" class="track" />
  <use id="use-bat-grid" href="#p-bat-grid" class="track" />
  <use id="use-solar-bat" href="#p-solar-bat" class="track" />
  <use id="use-home-consumer1" href="#p-home-consumer1" class="track" data-topo="consumer1" />
  <use id="use-home-consumer2" href="#p-home-consumer2" class="track" data-topo="consumer2" />
  <use id="use-home-consumer3" href="#p-home-consumer3" class="track" data-topo="consumer3" />
  <use id="use-home-consumer4" href="#p-home-consumer4" class="track" data-topo="consumer4" />
  <use id="use-bat-batteryload1" href="#p-bat-batteryload1" class="track" data-topo="batteryLoad1" />
  <use id="use-bat-batteryload2" href="#p-bat-batteryload2" class="track" data-topo="batteryLoad2" />

  <!-- ── Solar (top, optional) ── -->
  <g id="n-solar" class="node" data-topo="solar">
    <circle cx="${C.col2}" cy="${L.topY}" r="52" class="node-bg" id="solar-bg" />
    <circle cx="${C.col2}" cy="${L.topY}" r="52" class="node-ring" id="solar-ring" />
    <path id="solar-icon" class="node-icon" transform="${iconTransform(C.col2, L.topY - 18, 28)}" d="${mdiSolarPowerVariant}" />
    <text x="${C.col2}" y="${L.topY + 16}" class="val-text" id="t-solar-val"></text>
    <text x="${C.col2}" y="${L.topY + 29}" class="lbl-text" id="t-solar-lbl"></text>
  </g>

  <!-- ── Grid (left) ── -->
  <g class="node">
    <circle cx="${C.col1}" cy="${MID_ROW_Y}" r="52" class="node-bg" id="grid-bg" />
    <circle cx="${C.col1}" cy="${MID_ROW_Y}" r="52" class="node-ring" id="grid-ring" />
    <path id="grid-icon" class="node-icon" transform="${iconTransform(C.col1, MID_ROW_Y - 18, 28)}" d="${mdiTransmissionTower}" />
    <text x="${C.col1}" y="${MID_ROW_Y + 16}" class="val-text val-text-accent" id="t-grid-val"></text>
    <text x="${C.col1}" y="${MID_ROW_Y + 29}" class="lbl-text" id="t-grid-lbl"></text>
  </g>

  <!-- ── Home (right) ── -->
  <g class="node">
    <circle cx="${C.col3}" cy="${MID_ROW_Y}" r="52" class="node-bg" id="home-bg" />
    <circle cx="${C.col3}" cy="${MID_ROW_Y}" r="52" class="node-ring" id="home-ring" />
    <path id="home-icon" class="node-icon" transform="${iconTransform(C.col3, MID_ROW_Y - 18, 28)}" d="${mdiHome}" />
    <text x="${C.col3}" y="${MID_ROW_Y + 16}" class="val-text" id="t-home-val"></text>
    <text x="${C.col3}" y="${MID_ROW_Y + 29}" class="lbl-text" id="t-home-lbl"></text>
  </g>

  <!-- Coverage rings for home/grid, drawn *after* (on top of) those two node
       bodies rather than inside either one — on top so nodeStyle: 'filled's
       opaque background doesn't blend/mute their color, and in their own
       group (not nested in any dimmable node) so a node's "dim" state can't
       fade them. The home ring shows how the load is sourced
       (solar/battery/grid); the grid ring shows how an export is sourced
       (solar/battery). Positioned at home/grid's own centers, so document
       order relative to nodes elsewhere on the diagram doesn't matter. Only
       the grid-side rings (garc-*) move with columnGap — home's column is
       fixed, so arc-*'s never need repositioning. -->
  <g>
    <circle id="arc-solar" cx="${C.col3}" cy="${MID_ROW_Y}" r="47" class="home-arc solar-arc" transform="rotate(-90 ${C.col3} ${MID_ROW_Y})" />
    <circle id="arc-bat" cx="${C.col3}" cy="${MID_ROW_Y}" r="47" class="home-arc bat-arc" transform="rotate(-90 ${C.col3} ${MID_ROW_Y})" />
    <circle id="arc-grid" cx="${C.col3}" cy="${MID_ROW_Y}" r="47" class="home-arc grid-arc" transform="rotate(-90 ${C.col3} ${MID_ROW_Y})" />
    <circle id="garc-solar" cx="${C.col1}" cy="${MID_ROW_Y}" r="47" class="home-arc solar-arc" transform="rotate(-90 ${C.col1} ${MID_ROW_Y})" />
    <circle id="garc-bat" cx="${C.col1}" cy="${MID_ROW_Y}" r="47" class="home-arc bat-arc" transform="rotate(-90 ${C.col1} ${MID_ROW_Y})" />
  </g>

  <!-- ── House consumer 1 (above the house, optional) ── -->
  <g id="n-consumer1" class="node" data-topo="consumer1">
    <circle cx="${C.col3}" cy="${L.topY}" r="52" class="node-bg" id="c1-bg" />
    <circle cx="${C.col3}" cy="${L.topY}" r="52" class="node-ring" id="c1-ring" />
    <path id="c1-icon" class="node-icon" transform="${iconTransform(C.col3, L.topY - 18, 28)}" d="${mdiPowerSocket}" />
    <text x="${C.col3}" y="${L.topY + 16}" class="val-text" id="t-c1-val"></text>
    <text x="${C.col3}" y="${L.topY + 29}" class="lbl-text" id="t-c1-lbl"></text>
  </g>

  <!-- ── House consumer 3 (top-right, optional) ── -->
  <g id="n-consumer3" class="node" data-topo="consumer3">
    <circle cx="${C.col4}" cy="${L.topY}" r="52" class="node-bg" id="c3-bg" />
    <circle cx="${C.col4}" cy="${L.topY}" r="52" class="node-ring" id="c3-ring" />
    <path id="c3-icon" class="node-icon" transform="${iconTransform(C.col4, L.topY - 18, 28)}" d="${mdiPowerSocket}" />
    <text x="${C.col4}" y="${L.topY + 16}" class="val-text" id="t-c3-val"></text>
    <text x="${C.col4}" y="${L.topY + 29}" class="lbl-text" id="t-c3-lbl"></text>
  </g>

  <!-- ── Battery (bottom, optional) ── -->
  <g id="n-battery" class="node" data-topo="battery">
    <circle cx="${C.col2}" cy="${L.botY}" r="52" class="node-bg" id="bat-bg" />
    <circle id="bat-soc-arc" cx="${C.col2}" cy="${L.botY}" r="47" class="home-arc" transform="rotate(-90 ${C.col2} ${L.botY})" />
    <!-- Charge/discharge highlight — a glowing comet built by
         batteryCometMarkup() above (a three-blur-radius bloom/glow/core head
         plus a smoothly tapering multi-band tail) that travels around the
         same ring as bat-soc-arc, masked to bat-soc-arc's own drawn extent
         (bat-soc-mask mirrors its dasharray every update — see
         applyBatteryHighlight() in core.ts) so the comet is only ever
         visible over the charged portion of the ring, not the undrawn
         remainder. Same start angle (12 o'clock) and winding direction as
         bat-soc-arc, so "clockwise" means the same thing for both. -->
    <g id="bat-charge-highlight-group" class="bat-charge-highlight-group" mask="url(#bat-soc-mask)">
      ${batteryCometMarkup(C.col2, L.botY)}
    </g>
    <circle cx="${C.col2}" cy="${L.botY}" r="52" class="node-ring" id="bat-ring" />
    <path id="bat-icon" class="node-icon" transform="${iconTransform(C.col2, L.botY - 27, 28)}" d="${mdiBatteryMedium}" />
    <text x="${C.col2}" y="${L.botY + 5}" class="val-text" id="t-bat-soc"></text>
    <text x="${C.col2}" y="${L.botY + 18}" class="val-text val-text-accent" id="t-bat-watts" style="font-size: 11px; opacity: 0.75"></text>
    <text x="${C.col2}" y="${L.botY + 31}" class="lbl-text" id="t-bat-lbl"></text>
  </g>

  <!-- ── House consumer 2 (below the house, optional) ── -->
  <g id="n-consumer2" class="node" data-topo="consumer2">
    <circle cx="${C.col3}" cy="${L.botY}" r="52" class="node-bg" id="c2-bg" />
    <circle cx="${C.col3}" cy="${L.botY}" r="52" class="node-ring" id="c2-ring" />
    <path id="c2-icon" class="node-icon" transform="${iconTransform(C.col3, L.botY - 18, 28)}" d="${mdiPowerSocket}" />
    <text x="${C.col3}" y="${L.botY + 16}" class="val-text" id="t-c2-val"></text>
    <text x="${C.col3}" y="${L.botY + 29}" class="lbl-text" id="t-c2-lbl"></text>
  </g>

  <!-- ── House consumer 4 (bottom-right, optional) ── -->
  <g id="n-consumer4" class="node" data-topo="consumer4">
    <circle cx="${C.col4}" cy="${L.botY}" r="52" class="node-bg" id="c4-bg" />
    <circle cx="${C.col4}" cy="${L.botY}" r="52" class="node-ring" id="c4-ring" />
    <path id="c4-icon" class="node-icon" transform="${iconTransform(C.col4, L.botY - 18, 28)}" d="${mdiPowerSocket}" />
    <text x="${C.col4}" y="${L.botY + 16}" class="val-text" id="t-c4-val"></text>
    <text x="${C.col4}" y="${L.botY + 29}" class="lbl-text" id="t-c4-lbl"></text>
  </g>

  <!-- ── Battery load 1 (beside the battery, optional) — always fits in the
       bottom row, no matter which other optional nodes are shown. ── -->
  <g id="n-batteryload1" class="node" data-topo="batteryLoad1">
    <circle cx="${C.col1}" cy="${L.botY}" r="52" class="node-bg" id="bl1-bg" />
    <circle cx="${C.col1}" cy="${L.botY}" r="52" class="node-ring" id="bl1-ring" />
    <path id="bl1-icon" class="node-icon" transform="${iconTransform(C.col1, L.botY - 18, 28)}" d="${mdiPowerSocket}" />
    <text x="${C.col1}" y="${L.botY + 16}" class="val-text" id="t-bl1-val"></text>
    <text x="${C.col1}" y="${L.botY + 29}" class="lbl-text" id="t-bl1-lbl"></text>
  </g>

  <!-- ── Battery load 2 (optional) — shares its slot (${C.col3},${L.botY})
       with consumer2; see the slot-conflict indicator below. ── -->
  <g id="n-batteryload2" class="node" data-topo="batteryLoad2">
    <circle cx="${C.col3}" cy="${L.botY}" r="52" class="node-bg" id="bl2-bg" />
    <circle cx="${C.col3}" cy="${L.botY}" r="52" class="node-ring" id="bl2-ring" />
    <path id="bl2-icon" class="node-icon" transform="${iconTransform(C.col3, L.botY - 18, 28)}" d="${mdiPowerSocket}" />
    <text x="${C.col3}" y="${L.botY + 16}" class="val-text" id="t-bl2-val"></text>
    <text x="${C.col3}" y="${L.botY + 29}" class="lbl-text" id="t-bl2-lbl"></text>
  </g>

  <!-- ── Slot conflict indicator (${C.col3},${L.botY}) — shown instead of
       both consumer2 and batteryLoad2 when a caller sets both at once (they
       share this position; see update()'s hasSlotConflict). Styled directly
       with fixed colors in JS rather than a FlowColors entry, since it
       signals a data misconfiguration rather than a themable flow. ── -->
  <g id="n-slot-conflict" class="node" data-topo="slotConflict">
    <circle cx="${C.col3}" cy="${L.botY}" r="52" class="node-bg" id="conflict-bg" />
    <circle cx="${C.col3}" cy="${L.botY}" r="52" class="node-ring" id="conflict-ring" />
    <path id="conflict-icon" class="node-icon" transform="${iconTransform(C.col3, L.botY - 18, 28)}" d="${mdiAlertCircle}" />
    <text x="${C.col3}" y="${L.botY + 16}" class="val-text" id="t-conflict-val">Conflict</text>
    <text x="${C.col3}" y="${L.botY + 29}" class="lbl-text" id="t-conflict-desc">Hover for details</text>
    <title id="conflict-title">consumer2 and batteryLoad2 cannot both be set — they share the same position. See the "Consumer slot layout" section of the README.</title>
  </g>

  <!-- Dots are drawn last (on top of every node) — a track's path runs all
       the way to its endpoint node's own edge, so a marker sitting at either
       end of its travel is centered right on that edge. Painted earlier (as
       these used to be, before the node bodies), the opaque node background
       would cover the half of the marker that overlaps the node's circle —
       worst for the oriented shapes (triangle/bolt/chevron/spark),
       whose leading edge points into the node and so is the first (and most
       visible) part clipped away. -->
  ${DOTS.map((d) =>
    Array.from(
      { length: MAX_DOTS_PER_TRACK },
      (_, i) =>
        `<circle id="dot-${d.id}-${i}" r="2" class="dot ${d.cls}" vector-effect="non-scaling-stroke" />
  ${ORIENTED_DOT_SHAPES.map(
    (s) => `<g id="dot-${s.idPrefix}-${d.id}-${i}" class="${s.wrapClass}">
    ${s.inner(d.cls)}
  </g>`,
  ).join('\n  ')}`,
    ).join('\n  '),
  ).join('\n  ')}
</svg>
`;
