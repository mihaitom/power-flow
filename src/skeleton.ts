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
function iconTransform(centerX: number, centerY: number, size: number): string {
  return `translate(${centerX - size / 2} ${centerY - size / 2}) scale(${size / 24})`;
}

// One entry per animated dot. `cls` selects the dot color via CSS — always
// the color of the leg's *source*, never its destination, so e.g. solar→grid
// and battery→grid (both exports) are colored solar/battery respectively,
// not a shared "export" color, and solar→battery and grid→battery (both
// charging) are colored solar/grid respectively, not a shared "charging"
// color. `reverse` animates the dot from the path's end to its start (used
// to send a dot the opposite way along a path that is shared by two flow
// directions).
export const DOTS: { id: string; cls: string; path: string; reverse?: boolean }[] = [
  { id: 'solar-home', cls: 'solar', path: 'p-solar-home' },
  { id: 'solar-grid', cls: 'solar', path: 'p-solar-grid' },
  { id: 'grid-home', cls: 'grid', path: 'p-grid-home' },
  { id: 'bat-home', cls: 'battery-out', path: 'p-bat-home' },
  { id: 'bat-grid', cls: 'battery-out', path: 'p-bat-grid' },
  { id: 'solar-bat', cls: 'solar', path: 'p-solar-bat' },
  // Grid → battery shares the battery↔grid path, run in reverse (grid to battery).
  { id: 'grid-bat', cls: 'grid', path: 'p-bat-grid', reverse: true },
  { id: 'home-consumer1', cls: 'consumer1', path: 'p-home-consumer1' },
  { id: 'home-consumer2', cls: 'consumer2', path: 'p-home-consumer2' },
  { id: 'home-consumer3', cls: 'consumer3', path: 'p-home-consumer3' },
  { id: 'home-consumer4', cls: 'consumer4', path: 'p-home-consumer4' },
  { id: 'bat-batteryload1', cls: 'battery-load1', path: 'p-bat-batteryload1' },
  { id: 'bat-batteryload2', cls: 'battery-load2', path: 'p-bat-batteryload2' },
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
// lines). Control points are exactly the static `d` values below, so
// `curveBend = 1` (the default) reproduces the current geometry precisely —
// see applyCurveBend() in core.ts, which blends each point toward the
// straight P0→P3 line as `curveBend` drops toward 0.
export const CURVES: {
  id: string;
  p0: [number, number];
  p1: [number, number];
  p2: [number, number];
  p3: [number, number];
}[] = [
  { id: 'p-solar-home', p0: [212, 112], p1: [212, 150], p2: [256, 173], p3: [294, 173] },
  { id: 'p-solar-grid', p0: [188, 112], p1: [188, 150], p2: [144, 173], p3: [106, 173] },
  { id: 'p-bat-home', p0: [212, 258], p1: [212, 220], p2: [256, 197], p3: [294, 197] },
  { id: 'p-bat-grid', p0: [188, 258], p1: [188, 220], p2: [144, 197], p3: [106, 197] },
  { id: 'p-home-consumer4', p0: [396, 197], p1: [434, 197], p2: [478, 220], p3: [478, 258] },
  { id: 'p-home-consumer3', p0: [396, 173], p1: [434, 173], p2: [478, 150], p3: [478, 112] },
];

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

// Static SVG skeleton. Every node, track and dot is present from the start;
// topology (battery/consumer1) is toggled via `display`, so path lengths only
// have to be measured once and SMIL animations never restart on toggle.
//
// Diagonal paths fan out at the grid/home side by ±12 (y=173/197), mirroring
// the fan-out at the solar/battery side (x=188/212).
export const SKELETON = `
<svg class="flow-svg" xmlns="${SVGNS}">
  <defs>
    <path id="p-solar-home" d="M212,112 C212,150 256,173 294,173" />
    <path id="p-solar-grid" d="M188,112 C188,150 144,173 106,173" />
    <path id="p-grid-home" d="M107,185 H293" />
    <path id="p-bat-home" d="M212,258 C212,220 256,197 294,197" />
    <path id="p-bat-grid" d="M188,258 C188,220 144,197 106,197" />
    <path id="p-solar-bat" d="M200,112 V258" />
    <!-- consumer1 is the top-left slot (345,60), consumer2 the bottom-left
         slot (345,310) — swapped from a naive 1=bottom/2=top numbering so
         consumer1/2 read top-to-bottom like consumer3/4 do. -->
    <path id="p-home-consumer1" d="M345,133 V112" />
    <path id="p-home-consumer2" d="M345,237 V258" />
    <!-- Home's 4th consumer, bottom-right (490,310). Home and this node sit
         exactly (145,125) apart — the same offset as grid and battery — so
         this is literally the p-bat-grid curve, reversed (that one runs
         battery→grid, we need the grid→battery direction) and translated by
         (290,0), the grid→home / battery→consumer4 offset. Every control
         point stays at y ≤ 258 (consumer2/batteryLoad2's own top edge at
         345,310), so the curve's convex hull stays entirely clear of that
         node. -->
    <path id="p-home-consumer4" d="M396,197 C434,197 478,220 478,258" />
    <!-- Home's 3rd consumer, top-right (490,60) — the same curve as
         p-home-consumer4, mirrored vertically around home's own row (y=185:
         y' = 370 − y), so it stays clear of consumer1 (345,60) the same way
         consumer4's curve stays clear of consumer2/batteryLoad2 (345,310). -->
    <path id="p-home-consumer3" d="M396,173 C434,173 478,150 478,112" />
    <!-- batteryLoad1 always sits in the always-free (55,310) slot beside the
         battery. batteryLoad2 shares the (345,310) slot with consumer2 — see
         the slot-conflict indicator below. -->
    <path id="p-bat-batteryload1" d="M148,310 H107" />
    <path id="p-bat-batteryload2" d="M252,310 H293" />
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

  ${DOTS.map(
    (d) =>
      `<circle id="dot-${d.id}" r="2" class="dot ${d.cls}" vector-effect="non-scaling-stroke" />
  <g id="dot-tri-${d.id}" class="dot-tri-wrap">
    <polygon points="-4,-3.5 -4,3.5 6,0" class="dot dot-tri ${d.cls}" vector-effect="non-scaling-stroke" />
  </g>`,
  ).join('\n  ')}

  <!-- ── Solar (top, optional) ── -->
  <g id="n-solar" class="node" data-topo="solar">
    <circle cx="200" cy="60" r="52" class="node-bg" id="solar-bg" />
    <circle cx="200" cy="60" r="52" class="node-ring" id="solar-ring" />
    <path id="solar-icon" class="node-icon" transform="${iconTransform(200, 42, 28)}" d="${mdiSolarPowerVariant}" />
    <text x="200" y="76" class="val-text" id="t-solar-val"></text>
    <text x="200" y="89" class="lbl-text" id="t-solar-lbl"></text>
  </g>

  <!-- ── Grid (left) ── -->
  <g class="node">
    <circle cx="55" cy="185" r="52" class="node-bg" id="grid-bg" />
    <circle cx="55" cy="185" r="52" class="node-ring" id="grid-ring" />
    <path id="grid-icon" class="node-icon" transform="${iconTransform(55, 167, 28)}" d="${mdiTransmissionTower}" />
    <text x="55" y="201" class="val-text" id="t-grid-val"></text>
    <text x="55" y="214" class="lbl-text" id="t-grid-lbl"></text>
  </g>

  <!-- ── Home (right) ── -->
  <g class="node">
    <circle cx="345" cy="185" r="52" class="node-bg" id="home-bg" />
    <circle cx="345" cy="185" r="52" class="node-ring" id="home-ring" />
    <path id="home-icon" class="node-icon" transform="${iconTransform(345, 167, 28)}" d="${mdiHome}" />
    <text x="345" y="201" class="val-text" id="t-home-val"></text>
    <text x="345" y="214" class="lbl-text" id="t-home-lbl"></text>
  </g>

  <!-- Coverage rings for home/grid, drawn *after* (on top of) those two node
       bodies rather than inside either one — on top so nodeStyle: 'filled's
       opaque background doesn't blend/mute their color, and in their own
       group (not nested in any dimmable node) so a node's "dim" state can't
       fade them. The home ring shows how the load is sourced
       (solar/battery/grid); the grid ring shows how an export is sourced
       (solar/battery). Positioned at home/grid's own centers, so document
       order relative to nodes elsewhere on the diagram doesn't matter. -->
  <g>
    <circle id="arc-solar" cx="345" cy="185" r="47" class="home-arc solar-arc" transform="rotate(-90 345 185)" />
    <circle id="arc-bat" cx="345" cy="185" r="47" class="home-arc bat-arc" transform="rotate(-90 345 185)" />
    <circle id="arc-grid" cx="345" cy="185" r="47" class="home-arc grid-arc" transform="rotate(-90 345 185)" />
    <circle id="garc-solar" cx="55" cy="185" r="47" class="home-arc solar-arc" transform="rotate(-90 55 185)" />
    <circle id="garc-bat" cx="55" cy="185" r="47" class="home-arc bat-arc" transform="rotate(-90 55 185)" />
  </g>

  <!-- ── House consumer 1 (above the house, optional) ── -->
  <g id="n-consumer1" class="node" data-topo="consumer1">
    <circle cx="345" cy="60" r="52" class="node-bg" id="c1-bg" />
    <circle cx="345" cy="60" r="52" class="node-ring" id="c1-ring" />
    <path id="c1-icon" class="node-icon" transform="${iconTransform(345, 42, 28)}" d="${mdiPowerSocket}" />
    <text x="345" y="76" class="val-text" id="t-c1-val"></text>
    <text x="345" y="89" class="lbl-text" id="t-c1-lbl"></text>
  </g>

  <!-- ── House consumer 3 (top-right, optional) ── -->
  <g id="n-consumer3" class="node" data-topo="consumer3">
    <circle cx="490" cy="60" r="52" class="node-bg" id="c3-bg" />
    <circle cx="490" cy="60" r="52" class="node-ring" id="c3-ring" />
    <path id="c3-icon" class="node-icon" transform="${iconTransform(490, 42, 28)}" d="${mdiPowerSocket}" />
    <text x="490" y="76" class="val-text" id="t-c3-val"></text>
    <text x="490" y="89" class="lbl-text" id="t-c3-lbl"></text>
  </g>

  <!-- ── Battery (bottom, optional) ── -->
  <g id="n-battery" class="node" data-topo="battery">
    <circle cx="200" cy="310" r="52" class="node-bg" id="bat-bg" />
    <circle id="bat-soc-arc" cx="200" cy="310" r="47" class="home-arc" transform="rotate(-90 200 310)" />
    <circle cx="200" cy="310" r="52" class="node-ring" id="bat-ring" />
    <path id="bat-icon" class="node-icon" transform="${iconTransform(200, 283, 28)}" d="${mdiBatteryMedium}" />
    <text x="200" y="315" class="val-text" id="t-bat-soc"></text>
    <text x="200" y="328" class="val-text" id="t-bat-watts" style="font-size: 11px; opacity: 0.75"></text>
    <text x="200" y="341" class="lbl-text" id="t-bat-lbl"></text>
  </g>

  <!-- ── House consumer 2 (below the house, optional) ── -->
  <g id="n-consumer2" class="node" data-topo="consumer2">
    <circle cx="345" cy="310" r="52" class="node-bg" id="c2-bg" />
    <circle cx="345" cy="310" r="52" class="node-ring" id="c2-ring" />
    <path id="c2-icon" class="node-icon" transform="${iconTransform(345, 292, 28)}" d="${mdiPowerSocket}" />
    <text x="345" y="326" class="val-text" id="t-c2-val"></text>
    <text x="345" y="339" class="lbl-text" id="t-c2-lbl"></text>
  </g>

  <!-- ── House consumer 4 (bottom-right, optional) ── -->
  <g id="n-consumer4" class="node" data-topo="consumer4">
    <circle cx="490" cy="310" r="52" class="node-bg" id="c4-bg" />
    <circle cx="490" cy="310" r="52" class="node-ring" id="c4-ring" />
    <path id="c4-icon" class="node-icon" transform="${iconTransform(490, 292, 28)}" d="${mdiPowerSocket}" />
    <text x="490" y="326" class="val-text" id="t-c4-val"></text>
    <text x="490" y="339" class="lbl-text" id="t-c4-lbl"></text>
  </g>

  <!-- ── Battery load 1 (beside the battery, optional) — always fits in the
       bottom row, no matter which other optional nodes are shown. ── -->
  <g id="n-batteryload1" class="node" data-topo="batteryLoad1">
    <circle cx="55" cy="310" r="52" class="node-bg" id="bl1-bg" />
    <circle cx="55" cy="310" r="52" class="node-ring" id="bl1-ring" />
    <path id="bl1-icon" class="node-icon" transform="${iconTransform(55, 292, 28)}" d="${mdiPowerSocket}" />
    <text x="55" y="326" class="val-text" id="t-bl1-val"></text>
    <text x="55" y="339" class="lbl-text" id="t-bl1-lbl"></text>
  </g>

  <!-- ── Battery load 2 (optional) — shares its slot (345,310) with consumer2;
       see the slot-conflict indicator below. ── -->
  <g id="n-batteryload2" class="node" data-topo="batteryLoad2">
    <circle cx="345" cy="310" r="52" class="node-bg" id="bl2-bg" />
    <circle cx="345" cy="310" r="52" class="node-ring" id="bl2-ring" />
    <path id="bl2-icon" class="node-icon" transform="${iconTransform(345, 292, 28)}" d="${mdiPowerSocket}" />
    <text x="345" y="326" class="val-text" id="t-bl2-val"></text>
    <text x="345" y="339" class="lbl-text" id="t-bl2-lbl"></text>
  </g>

  <!-- ── Slot conflict indicator (345,310) — shown instead of both consumer2
       and batteryLoad2 when a caller sets both at once (they share this
       position; see update()'s hasSlotConflict). Styled directly with fixed
       colors in JS rather than a FlowColors entry, since it signals a data
       misconfiguration rather than a themable flow. ── -->
  <g id="n-slot-conflict" class="node" data-topo="slotConflict">
    <circle cx="345" cy="310" r="52" class="node-bg" id="conflict-bg" />
    <circle cx="345" cy="310" r="52" class="node-ring" id="conflict-ring" />
    <path id="conflict-icon" class="node-icon" transform="${iconTransform(345, 292, 28)}" d="${mdiAlertCircle}" />
    <text x="345" y="326" class="val-text" id="t-conflict-val">Conflict</text>
    <text x="345" y="339" class="lbl-text" id="t-conflict-desc">Hover for details</text>
    <title id="conflict-title">consumer2 and batteryLoad2 cannot both be set — they share the same position. See the "Consumer slot layout" section of the README.</title>
  </g>
</svg>
`;
