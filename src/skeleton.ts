import {
  mdiSolarPowerVariant,
  mdiTransmissionTower,
  mdiHome,
  mdiBatteryMedium,
  mdiEvStation,
  mdiPowerSocket,
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
  { id: 'home-wallbox', cls: 'wallbox', path: 'p-home-wallbox' },
  // Wallbox's 4th-column fallback, used when it must make room for
  // batteryLoad2 in its usual slot (see `wallboxNeedsColumn4` in `update()`).
  { id: 'home-wallbox4', cls: 'wallbox', path: 'p-home-wallbox4' },
  { id: 'home-wallbox2', cls: 'wallbox2', path: 'p-home-wallbox2' },
  { id: 'bat-batteryload', cls: 'battery-load', path: 'p-bat-batteryload' },
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
  wallbox: 'wallbox',
  wallbox2: 'wallbox2',
  'battery-load': 'battery-load',
  'battery-load2': 'battery-load2',
};

// A track's element id, derived from its path id ("p-solar-home" → "use-solar-home").
export function trackIdFor(pathId: string): string {
  return 'use-' + pathId.slice(2);
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
.dot.wallbox { fill: var(--sfd-wallbox); stroke: var(--sfd-wallbox); }
.dot.wallbox2 { fill: var(--sfd-wallbox2); stroke: var(--sfd-wallbox2); }
.dot.battery-load { fill: var(--sfd-battery-load); stroke: var(--sfd-battery-load); }
.dot.battery-load2 { fill: var(--sfd-battery-load2); stroke: var(--sfd-battery-load2); }

.node { transition: opacity 0.35s ease; }
.node-bg { stroke: none; transition: fill 0.35s ease; }
.node-ring { fill: none; stroke-width: 2.5; transition: stroke 0.35s ease; }
.node-icon { transition: fill 0.35s ease; }
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
  opacity: 0.55;
  font-weight: 500;
  letter-spacing: 0.04em;
}
`;

// Static SVG skeleton. Every node, track and dot is present from the start;
// topology (battery/wallbox) is toggled via `display`, so path lengths only
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
    <path id="p-home-wallbox" d="M345,237 V258" />
    <!-- Wallbox's 4th-column fallback (490,310), used only when it must
         yield its usual slot to batteryLoad2 (which sits at 345,310, right
         in between home and the 4th column). Home and wallbox4 sit exactly
         (145,125) apart — the same offset as grid and battery — so this is
         literally the p-bat-grid curve, reversed (that one runs battery→grid,
         we need the grid→battery direction) and translated by (290,0), the
         grid→home / battery→wallbox4 offset. Every control point stays at
         y ≤ 258 (batteryLoad2's own top edge), so the curve's convex hull
         stays entirely above batteryLoad2 and can never touch it. -->
    <path id="p-home-wallbox4" d="M396,197 C434,197 478,220 478,258" />
    <path id="p-home-wallbox2" d="M345,133 V112" />
    <!-- batteryLoad always sits in the always-free (55,310) slot beside the
         battery; batteryLoad2 always sits at (345,310) — wallbox moves to
         the 4th column instead when both wallbox and batteryLoad2 are
         active (see wallboxNeedsColumn4 in update()). No extra row ever
         needed. -->
    <path id="p-bat-batteryload" d="M148,310 H107" />
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
  <use id="use-home-wallbox" href="#p-home-wallbox" class="track" data-topo="wallbox" />
  <use id="use-home-wallbox4" href="#p-home-wallbox4" class="track" data-topo="wallbox4" />
  <use id="use-home-wallbox2" href="#p-home-wallbox2" class="track" data-topo="wallbox2" />
  <use id="use-bat-batteryload" href="#p-bat-batteryload" class="track" data-topo="batteryLoad" />
  <use id="use-bat-batteryload2" href="#p-bat-batteryload2" class="track" data-topo="batteryLoad2" />

  ${DOTS.map(
    (d) =>
      `<circle id="dot-${d.id}" r="2" class="dot ${d.cls}" vector-effect="non-scaling-stroke" />`,
  ).join('\n  ')}

  <!-- Coverage rings, drawn under the node bodies. The home ring shows how
       the load is sourced (solar/battery/grid); the grid ring shows how an
       export is sourced (solar/battery). In their own group so the solar
       node's "dim" state can't fade them. -->
  <g>
    <circle id="arc-solar" cx="345" cy="185" r="47" class="home-arc solar-arc" transform="rotate(-90 345 185)" />
    <circle id="arc-bat" cx="345" cy="185" r="47" class="home-arc bat-arc" transform="rotate(-90 345 185)" />
    <circle id="arc-grid" cx="345" cy="185" r="47" class="home-arc grid-arc" transform="rotate(-90 345 185)" />
    <circle id="garc-solar" cx="55" cy="185" r="47" class="home-arc solar-arc" transform="rotate(-90 55 185)" />
    <circle id="garc-bat" cx="55" cy="185" r="47" class="home-arc bat-arc" transform="rotate(-90 55 185)" />
  </g>

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

  <!-- ── Wallbox 2 (above the house, optional) ── -->
  <g id="n-wallbox2" class="node" data-topo="wallbox2">
    <circle cx="345" cy="60" r="52" class="node-bg" id="wb2-bg" />
    <circle cx="345" cy="60" r="52" class="node-ring" id="wb2-ring" />
    <path id="wb2-icon" class="node-icon" transform="${iconTransform(345, 42, 28)}" d="${mdiEvStation}" />
    <text x="345" y="76" class="val-text" id="t-wb2-val"></text>
    <text x="345" y="89" class="lbl-text" id="t-wb2-lbl"></text>
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

  <!-- ── Wallbox (below the house, optional) ── -->
  <g id="n-wallbox" class="node" data-topo="wallbox">
    <circle cx="345" cy="310" r="52" class="node-bg" id="wb-bg" />
    <circle cx="345" cy="310" r="52" class="node-ring" id="wb-ring" />
    <path id="wb-icon" class="node-icon" transform="${iconTransform(345, 290, 28)}" d="${mdiEvStation}" />
    <text x="345" y="328" class="val-text" id="t-wb-val"></text>
    <text x="345" y="341" class="lbl-text" id="t-wb-lbl"></text>
  </g>

  <!-- ── Wallbox, 4th-column fallback (optional) — used instead of the node
       above when batteryLoad2 needs the (345,310) slot. ── -->
  <g id="n-wallbox4" class="node" data-topo="wallbox4">
    <circle cx="490" cy="310" r="52" class="node-bg" id="wb4-bg" />
    <circle cx="490" cy="310" r="52" class="node-ring" id="wb4-ring" />
    <path id="wb4-icon" class="node-icon" transform="${iconTransform(490, 290, 28)}" d="${mdiEvStation}" />
    <text x="490" y="328" class="val-text" id="t-wb4-val"></text>
    <text x="490" y="341" class="lbl-text" id="t-wb4-lbl"></text>
  </g>

  <!-- ── Battery load 1 (beside the battery, optional) — always fits in the
       bottom row, no matter which other optional nodes are shown. ── -->
  <g id="n-batteryload" class="node" data-topo="batteryLoad">
    <circle cx="55" cy="310" r="52" class="node-bg" id="bl-bg" />
    <circle cx="55" cy="310" r="52" class="node-ring" id="bl-ring" />
    <path id="bl-icon" class="node-icon" transform="${iconTransform(55, 290, 28)}" d="${mdiPowerSocket}" />
    <text x="55" y="328" class="val-text" id="t-bl-val"></text>
    <text x="55" y="341" class="lbl-text" id="t-bl-lbl"></text>
  </g>

  <!-- ── Battery load 2 (optional) — always at (345,310); wallbox moves to
       its 4th-column fallback instead of the other way around, so this node
       never needs to relocate. ── -->
  <g id="n-batteryload2" class="node" data-topo="batteryLoad2">
    <circle cx="345" cy="310" r="52" class="node-bg" id="bl2-bg" />
    <circle cx="345" cy="310" r="52" class="node-ring" id="bl2-ring" />
    <path id="bl2-icon" class="node-icon" transform="${iconTransform(345, 290, 28)}" d="${mdiPowerSocket}" />
    <text x="345" y="328" class="val-text" id="t-bl2-val"></text>
    <text x="345" y="341" class="lbl-text" id="t-bl2-lbl"></text>
  </g>
</svg>
`;
