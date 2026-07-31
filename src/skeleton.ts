import {
  mdiSolarPowerVariant,
  mdiTransmissionTower,
  mdiHome,
  mdiBatteryMedium,
  mdiPowerSocket,
  mdiAlertCircle,
} from '@mdi/js';

const SVGNS = 'http://www.w3.org/2000/svg';

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
// The tangent handle length (38, giving p1/p2 their offset from p0/p3) is a
// fixed visual choice independent of `rowGap`/`columnGap` — see the
// curveBend comment on this function's usage for why that's fine even as
// the travel distance changes with either gap.
export function curvesForLayout(
  rowGap: number,
  columnGap: number,
): { id: string; p0: [number, number]; p1: [number, number]; p2: [number, number]; p3: [number, number] }[] {
  const { topInner, botInner } = rowLayout(rowGap);
  const { col1, col2, col3, col4 } = columnLayout(columnGap);
  return [
    {
      id: 'p-solar-home',
      p0: [col2 + 12, topInner],
      p1: [col2 + 12, topInner + 38],
      p2: [col3 - 89, 173],
      p3: [col3 - 51, 173],
    },
    {
      id: 'p-solar-grid',
      p0: [col2 - 12, topInner],
      p1: [col2 - 12, topInner + 38],
      p2: [col1 + 89, 173],
      p3: [col1 + 51, 173],
    },
    {
      id: 'p-bat-home',
      p0: [col2 + 12, botInner],
      p1: [col2 + 12, botInner - 38],
      p2: [col3 - 89, 197],
      p3: [col3 - 51, 197],
    },
    {
      id: 'p-bat-grid',
      p0: [col2 - 12, botInner],
      p1: [col2 - 12, botInner - 38],
      p2: [col1 + 89, 197],
      p3: [col1 + 51, 197],
    },
    {
      id: 'p-home-consumer4',
      p0: [col3 + 51, 197],
      p1: [col3 + 89, 197],
      p2: [col4 - 12, botInner - 38],
      p3: [col4 - 12, botInner],
    },
    {
      id: 'p-home-consumer3',
      p0: [col3 + 51, 173],
      p1: [col3 + 89, 173],
      p2: [col4 - 12, topInner + 38],
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

/* Triangle dot variant (dotShape: 'triangle') — a filled arrowhead instead of
   a stroked circle; the surrounding <g> carries position+rotation as a JS-set
   transform attribute every frame, so the pop-in/out shrink transition below
   lives on the polygon itself (a CSS transform on the <g> would win over
   its attribute and silently break the positioning). */
.dot.dot-tri { stroke: none; stroke-width: 0; }
.dot-tri {
  transform: scale(1);
  transition: transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.dot-tri.shrunk {
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

.val-text { font-size: 14px; text-anchor: middle; fill: currentColor; font-weight: 700; }
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
    <text x="${C.col1}" y="${MID_ROW_Y + 16}" class="val-text" id="t-grid-val"></text>
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
    <circle cx="${C.col2}" cy="${L.botY}" r="52" class="node-ring" id="bat-ring" />
    <path id="bat-icon" class="node-icon" transform="${iconTransform(C.col2, L.botY - 27, 28)}" d="${mdiBatteryMedium}" />
    <text x="${C.col2}" y="${L.botY + 5}" class="val-text" id="t-bat-soc"></text>
    <text x="${C.col2}" y="${L.botY + 18}" class="val-text" id="t-bat-watts" style="font-size: 11px; opacity: 0.75"></text>
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
       worst for the triangle shape, whose pointed tip leads into the node
       and so is the first (and most visible) part clipped away. -->
  ${DOTS.map((d) =>
    Array.from(
      { length: MAX_DOTS_PER_TRACK },
      (_, i) =>
        `<circle id="dot-${d.id}-${i}" r="2" class="dot ${d.cls}" vector-effect="non-scaling-stroke" />
  <g id="dot-tri-${d.id}-${i}" class="dot-tri-wrap">
    <polygon points="-4,-3.5 -4,3.5 6,0" class="dot dot-tri ${d.cls}" vector-effect="non-scaling-stroke" />
  </g>`,
    ).join('\n  '),
  ).join('\n  ')}
</svg>
`;
