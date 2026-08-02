import type {
  FlowColors,
  FlowLabels,
  FlowIcons,
  FlowTopology,
  PowerFlowOptions,
  NodeStyle,
  NodeShape,
  DotShape,
} from './types';
import { DEFAULT_COLORS, DEFAULT_LABELS, DEFAULT_ICONS, DEFAULT_TOPOLOGY } from './defaults';
import { computeFlowAllocation } from './flow-allocation';
import type { RowLayout, ColumnLayout } from './skeleton';
import {
  CSS,
  SKELETON,
  DOTS,
  DOT_CLS_TO_COLOR_VAR,
  curvesForLayout,
  rowLayout,
  columnLayout,
  iconTransform,
  MID_ROW_Y,
  DEFAULT_ROW_GAP,
  DEFAULT_COLUMN_GAP,
  trackIdFor,
  MAX_DOTS_PER_TRACK,
  ARC_LENGTH,
  RING_PERIMETER_SQUARE,
  RING_PERIMETER_HEX,
  BATTERY_COMET_LAYERS,
  ORIENTED_DOT_SHAPES,
  hexagonPoints,
  NODE_HEX_CIRCUMRADIUS,
  HEX_HOME_PULLBACK,
  squareRingPoints,
  hexagonRingPoints,
} from './skeleton';

export type {
  FlowData,
  FlowTopology,
  FlowColors,
  FlowLabels,
  FlowIcons,
  PowerFlowOptions,
} from './types';
export type { FlowAllocation } from './flow-allocation';
export { computeFlowAllocation } from './flow-allocation';

// One "oriented" (non-'circle') marker shape's pair of elements — the <g>
// carries position+rotation (JS-set transform attribute every frame), while
// `shrinkEl` (the shape inside it) carries the shrink pop-in/out CSS
// transition (see skeleton.ts's CSS comment on why these can't be the same
// element — a CSS transform on the <g> would win over its JS-set attribute
// transform and silently break the positioning).
interface OrientedMarker {
  group: SVGGElement;
  shrinkEl: Element;
}

// One marker element (rendered as a circle or one of the oriented shapes —
// see dotShape) at a fixed index along a flow's evenly-spaced dot lineup.
// `active` mirrors whether this index is within the current `dotCount` for a
// currently-visible flow; `shrinking` covers the 200ms after it drops out of
// that range (or the flow itself hides) while its pop-out CSS transition
// still plays.
interface DotMarker {
  circle: SVGCircleElement;
  // Every non-'circle' shape's elements, pre-rendered and always present
  // (like `circle` itself) so switching dotShape is just a display/position
  // swap — see ORIENTED_DOT_SHAPES in skeleton.ts for the shape list.
  oriented: Record<Exclude<DotShape, 'circle'>, OrientedMarker>;
  active: boolean;
  shrinking: boolean;
  hideTimer?: ReturnType<typeof setTimeout>;
  // Lap-boundary pop state (see applyLapPop()) — independent of the
  // visibility-driven `shrinking` above, this reuses the same shrink/grow CSS
  // transition at each end of the *path* while the marker stays continuously
  // active, instead of just once when the whole flow toggles on/off.
  prevFrac: number; // last frame's 0..1 lap fraction, to detect a lap wrap
  lapPopped: boolean; // true once this lap's near-end pop-out has fired
}

interface DotFlowState {
  path: SVGPathElement;
  length: number;
  speed: number; // px/s
  visible: boolean; // whether this flow currently carries power
  reverse: boolean; // travel from path end to start
  phase: number; // 0..1, shared travel position before per-marker spacing
  maxDots: number; // this leg's own cap on top of options.dotCount — see DOTS
  markers: DotMarker[];
}

function formatWatts(watts: number): string {
  return Math.abs(watts) >= 1000
    ? `${(watts / 1000).toFixed(1)} kW`
    : `${Math.round(watts)} W`;
}

/** Translucent fill derived from a node's accent color. `pct` is how much of
 *  the mix is the accent color itself — the rest lets whatever's behind the
 *  SVG show through, which is why this stays theme-adaptive without the
 *  component needing to know the host page's light/dark background. */
function tint(color: string, pct = 15): string {
  return `color-mix(in srgb, ${color} ${pct}%, transparent)`;
}

// `nodeStyle: 'filled'` always paints icon/text in this one color, the same
// for every node regardless of its own accent color — a per-node computed
// ink (dark on light accents, white on dark ones) reads as inconsistent
// across a diagram with several differently-colored nodes. Legibility across
// arbitrary accent colors instead comes from the `.node-filled-ink` drop
// shadow (see CSS) rather than from picking a matching text color.
const FILLED_INK = '#fff';

/**
 * Framework-agnostic renderer for the energy-flow diagram. Renders into a
 * shadow root attached to the given host element, so its styles never leak.
 */
export class PowerFlow {
  // Fixed color for the consumer2/batteryLoad2 slot-conflict indicator — not
  // themable via FlowColors, since it signals a data misconfiguration
  // rather than a flow.
  private static readonly CONFLICT_COLOR = '#ef4444';

  // options.trackPulse: an active track's own animation-duration (see the
  // "Track coloring" pass in update()) is BASE_PX / speed seconds, clamped
  // to [MIN_S, MAX_S] — a higher-load flow visibly pulses faster, using the
  // same speed flowSpeed() already computes for the traveling dot, without
  // needing a second per-frame animation loop (this is a plain CSS
  // `@keyframes` animation — see the `.track-pulse .track.active` rule in
  // skeleton.ts — so the duration only needs setting once per data update,
  // not every rAF tick).
  private static readonly TRACK_PULSE_BASE_PX = 260;
  private static readonly TRACK_PULSE_MIN_S = 0.35;
  private static readonly TRACK_PULSE_MAX_S = 2.2;

  // Every node's icon + its 1-3 text lines below it, for iconStyle: 'full'
  // (see applyIconStyle()). Read from the skeleton rather than duplicated
  // here: each entry's *default*-mode transform/y values are cached once from
  // the static SVG at construction time, not hardcoded a second time.
  private static readonly ICON_LAYOUT_NODES: { prefix: string; icon: string; texts: string[] }[] = [
    { prefix: 'solar', icon: 'solar-icon', texts: ['t-solar-val', 't-solar-lbl'] },
    { prefix: 'grid', icon: 'grid-icon', texts: ['t-grid-val', 't-grid-lbl'] },
    { prefix: 'home', icon: 'home-icon', texts: ['t-home-val', 't-home-lbl'] },
    { prefix: 'bat', icon: 'bat-icon', texts: ['t-bat-soc', 't-bat-watts', 't-bat-lbl'] },
    { prefix: 'c1', icon: 'c1-icon', texts: ['t-c1-val', 't-c1-lbl'] },
    { prefix: 'c2', icon: 'c2-icon', texts: ['t-c2-val', 't-c2-lbl'] },
    { prefix: 'c3', icon: 'c3-icon', texts: ['t-c3-val', 't-c3-lbl'] },
    { prefix: 'c4', icon: 'c4-icon', texts: ['t-c4-val', 't-c4-lbl'] },
    { prefix: 'bl1', icon: 'bl1-icon', texts: ['t-bl1-val', 't-bl1-lbl'] },
    { prefix: 'bl2', icon: 'bl2-icon', texts: ['t-bl2-val', 't-bl2-lbl'] },
    { prefix: 'conflict', icon: 'conflict-icon', texts: ['t-conflict-val', 't-conflict-desc'] },
  ];
  // Populated once in cacheIconLayouts(), keyed by prefix — the exact
  // transform/y values the static skeleton shipped with, so 'default' mode
  // can restore them verbatim instead of re-deriving them.
  private iconLayoutCache: Record<
    string,
    { iconTransform: string; textY: string[]; textFontSize: string[] }
  > = {};

  private root: ShadowRoot;
  private svg!: SVGSVGElement;
  private el: Record<string, Element> = {};
  private colors: FlowColors = DEFAULT_COLORS;
  private labels: FlowLabels = DEFAULT_LABELS;
  private icons: FlowIcons = { ...DEFAULT_ICONS };
  private topology: FlowTopology = DEFAULT_TOPOLOGY;
  private speedScale = 1;
  private nodeStyle: NodeStyle = 'soft';
  private nodeShape: NodeShape = 'circle';
  // The coverage/SoC/comet rings' current perimeter — ARC_LENGTH (a
  // circle's, 2·π·47), RING_PERIMETER_SQUARE (4×94), or RING_PERIMETER_HEX
  // (6× a regular hexagon's own side length), matching `nodeShape`. Kept as
  // its own field (set alongside `nodeShape`, see applyRingShape()) rather
  // than recomputed inline at every dasharray/dashoffset call site, since
  // several of those run every animation frame (tick()'s comet loop).
  private ringPerimeter = ARC_LENGTH;
  // Extra dashoffset (as a fraction of `ringPerimeter`) needed to land a
  // ring's 0%-progress point at 12 o'clock — 0.25 for the circle variant
  // (a <rect rx=ry=47>, whose own implicit path start isn't already there),
  // 0 for square/hexagon (both explicit <polygon>s built with a vertex
  // placed exactly at top-center, so they need no correction — see
  // applyRingShape() and skeleton.ts's squareRingPoints()/
  // hexagonRingPoints()).
  private ringStartFraction = 0.25;
  private iconStyle: 'default' | 'full' = 'default';
  private dotShape: DotShape = 'circle';
  private dotCount = 1;
  private curveBend = 1;
  private rowGap = DEFAULT_ROW_GAP;
  private columnGap = DEFAULT_COLUMN_GAP;
  private batteryChargeHighlight = true;
  private trackPulse = false;
  // Tracks whether the consumer2/batteryLoad2 slot conflict was already active
  // last render, so the console warning fires once per transition into the
  // conflicting state rather than on every `update()` call.
  private hadSlotConflict = false;

  // Per-flow animation state. We drive the dots ourselves (requestAnimationFrame)
  // instead of SMIL so a speed change keeps each dot's position continuous —
  // SMIL would restart the motion from the path start on every `dur` change,
  // making the dots jump while a value is being dragged. Each flow can show
  // several evenly-spaced dots (options.dotCount): `phase` is the shared 0..1
  // travel position, and marker `i` sits at `(phase + i/dotCount) % 1` — see
  // markerFraction().
  private dots: Record<string, DotFlowState> = {};
  private raf = 0;
  private lastTime = 0;

  // Battery charge/discharge comet — the exact same continuously-
  // accumulated-phase technique as `dots` above (see that comment) and for
  // the same reason: driven from tick() rather than a CSS animation, so a
  // charge-rate change (which changes speed) never snaps the comet to a
  // different position — see the .bat-charge-* CSS comment in skeleton.ts
  // for the full "why". `delay` (a 0..1 fraction of a lap) is copied from
  // BATTERY_COMET_LAYERS once in initBatteryComet(); everything else here
  // changes every frame/update. Re-derived (not just cached once) whenever
  // `nodeShape` changes — see applyRingShape() — since each layer has three
  // shape variants (see batteryCometMarkup() in skeleton.ts) and only one
  // is ever the live element tick() should be animating.
  private batteryCometLayers: { el: SVGGraphicsElement; delay: number }[] = [];
  private batteryCometPhase = 0;
  private batteryCometSpeed = 0; // px/s along ARC_LENGTH; 0 while inactive
  private batteryCometDirection = 1; // +1 charging, -1 discharging

  constructor(host: HTMLElement, options: PowerFlowOptions) {
    this.root = host.shadowRoot ?? host.attachShadow({ mode: 'open' });
    this.root.innerHTML = `<style>${CSS}</style>${SKELETON}`;
    this.svg = this.root.querySelector('svg')!;
    this.cacheRefs();
    this.initDots();
    this.initBatteryComet();
    this.cacheIconLayouts();
    this.update(options);
    this.lastTime = performance.now();
    this.raf = requestAnimationFrame(this.tick);
  }

  private cacheRefs() {
    this.svg.querySelectorAll<Element>('[id]').forEach((node) => {
      this.el[node.id] = node;
    });
  }

  private initDots() {
    for (const d of DOTS) {
      const path = this.svg.querySelector<SVGPathElement>(`#${d.path}`)!;
      const markers: DotMarker[] = [];
      for (let i = 0; i < MAX_DOTS_PER_TRACK; i++) {
        const circle = this.el[`dot-${d.id}-${i}`] as SVGCircleElement;
        circle.style.display = 'none';
        const oriented = {} as DotMarker['oriented'];
        for (const { shape, idPrefix } of ORIENTED_DOT_SHAPES) {
          const group = this.el[`dot-${idPrefix}-${d.id}-${i}`] as SVGGElement;
          group.style.display = 'none';
          oriented[shape] = { group, shrinkEl: group.firstElementChild! };
        }
        markers.push({
          circle,
          oriented,
          active: false,
          shrinking: false,
          prevFrac: 0,
          lapPopped: false,
        });
      }
      this.dots[d.id] = {
        path,
        length: path.getTotalLength(),
        speed: 0,
        visible: false,
        reverse: d.reverse ?? false,
        phase: Math.random(), // stagger start positions
        maxDots: d.maxDots ?? MAX_DOTS_PER_TRACK,
        markers,
      };
    }
  }

  // Lookup of each battery comet layer's *currently active shape variant*
  // element (see the `batteryCometLayers` field comment) — dasharray is
  // already baked into each variant as a static attribute (see
  // cometDasharray() in skeleton.ts), so all that's cached here is the
  // element ref itself plus its fixed `delay`. Called both from the
  // constructor and from applyRingShape() (whenever `nodeShape` changes),
  // since which variant is "active" changes there.
  private initBatteryComet() {
    const suffix = this.ringShapeSuffix();
    this.batteryCometLayers = BATTERY_COMET_LAYERS.map(({ id, delay }) => ({
      el: this.el[`${id}${suffix}`] as SVGGraphicsElement,
      delay,
    })).filter((l) => l.el);
  }

  // The marker element currently shown for a dot (its `display` is toggled
  // in setDot()), depending on the active dotShape.
  private activeMarker(m: DotMarker): SVGGraphicsElement {
    return this.dotShape === 'circle' ? m.circle : m.oriented[this.dotShape].group;
  }

  // The element that actually gets the `.shrunk` pop-in/out class — for the
  // oriented shapes that's the inner shape, not the position/rotation-
  // carrying <g> (see the `OrientedMarker` comment above for why).
  private shrinkTarget(m: DotMarker): Element {
    return this.dotShape === 'circle' ? m.circle : m.oriented[this.dotShape].shrinkEl;
  }

  // Snapshots each node's *default*-mode icon transform and text y positions
  // straight from the static skeleton, once, before iconStyle ever touches
  // them — so 'default' mode can restore them exactly without re-deriving
  // (and re-hardcoding) the same offsets a second time.
  private cacheIconLayouts() {
    for (const { prefix, icon, texts } of PowerFlow.ICON_LAYOUT_NODES) {
      const iconEl = this.el[icon];
      this.iconLayoutCache[prefix] = {
        iconTransform: iconEl?.getAttribute('transform') ?? '',
        textY: texts.map((id) => this.el[id]?.getAttribute('y') ?? '0'),
        textFontSize: texts.map(
          (id) => (this.el[id] as SVGTextElement | undefined)?.style.fontSize ?? '',
        ),
      };
    }
  }

  // iconStyle: 'default' restores the cached original layout; 'full' enlarges
  // the icon to fill most of the node (dimmed via the node-icon-full CSS
  // class) and centers the text block over it. Node center/radius are read
  // from the node's own `${prefix}-bg` circle rather than hardcoded, so this
  // works uniformly for every node regardless of its position or size.
  // Text elements don't all share one base font-size (val-text is 14px,
  // lbl-text 11px, and t-bat-watts overrides its own val-text down to 11px
  // inline) — read each one's own cached size (or its CSS-class default) so
  // the 'full'-mode bump scales *from whatever that element actually is*,
  // not a single hardcoded number.
  private static bumpedFontSize(el: SVGTextElement, cachedSize: string): string {
    const base = parseFloat(cachedSize) || (el.classList.contains('val-text') ? 14 : 11);
    return `${(base * 1.15).toFixed(1)}px`;
  }

  private applyIconStyle() {
    for (const { prefix, icon, texts } of PowerFlow.ICON_LAYOUT_NODES) {
      const iconEl = this.el[icon];
      const textEls = texts.map((id) => this.el[id] as SVGTextElement | undefined);
      const cached = this.iconLayoutCache[prefix];
      if (this.iconStyle === 'default') {
        iconEl?.setAttribute('transform', cached.iconTransform);
        iconEl?.classList.remove('node-icon-full');
        textEls.forEach((t, i) => {
          t?.setAttribute('y', cached.textY[i]);
          if (t) t.style.fontSize = cached.textFontSize[i];
          t?.classList.remove('text-on-full');
        });
        continue;
      }
      const bg = this.el[`${prefix}-bg`] as SVGRectElement | undefined;
      if (!bg) continue;
      const width = Number(bg.getAttribute('width'));
      const cx = Number(bg.getAttribute('x')) + width / 2;
      const cy = Number(bg.getAttribute('y')) + width / 2;
      const size = (width / 2) * 1.5;
      iconEl?.setAttribute(
        'transform',
        `translate(${cx - size / 2} ${cy - size / 2}) scale(${size / 24})`,
      );
      iconEl?.classList.add('node-icon-full');
      const lineGap = 13;
      const startY = cy - ((textEls.length - 1) * lineGap) / 2 + 4;
      textEls.forEach((t, i) => {
        t?.setAttribute('y', String(startY + i * lineGap));
        if (t) t.style.fontSize = PowerFlow.bumpedFontSize(t, cached.textFontSize[i]);
        t?.classList.add('text-on-full');
      });
    }
  }

  // Every node prefix's (cx, cy), given the current row/column layout. Grid
  // sits on the fixed middle row but a `columnGap`-moved column; home (and
  // consumer1/consumer2/batteryLoad2/conflict, which share its column) sits
  // on both a fixed row *and* fixed column — it never moves at all.
  private static nodeXY(prefix: string, rows: RowLayout, cols: ColumnLayout): [number, number] {
    const cy = PowerFlow.TOP_ROW_PREFIXES.includes(prefix)
      ? rows.topY
      : PowerFlow.BOTTOM_ROW_PREFIXES.includes(prefix)
        ? rows.botY
        : MID_ROW_Y;
    const cx: Record<string, number> = {
      grid: cols.col1,
      solar: cols.col2,
      home: cols.col3,
      c1: cols.col3,
      c2: cols.col3,
      c3: cols.col4,
      c4: cols.col4,
      bat: cols.col2,
      bl1: cols.col1,
      bl2: cols.col3,
      conflict: cols.col3,
    };
    return [cx[prefix] ?? cols.col3, cy];
  }
  private static readonly TOP_ROW_PREFIXES = ['solar', 'c1', 'c3'];
  private static readonly BOTTOM_ROW_PREFIXES = ['bat', 'c2', 'c4', 'bl1', 'bl2', 'conflict'];

  private setPathD(id: string, d: string) {
    (this.el[id] as SVGPathElement | undefined)?.setAttribute('d', d);
  }

  // Repositions all three shape variants of one coverage/SoC/comet ring
  // element (see applyRingShape()'s own comment) to the given center —
  // whether or not each is the currently-visible one, so nodeShape can be
  // switched later without anything being stale. The circle variant is a
  // <rect>, moved via x/y (plus the same rotate() it's always used, to
  // land its own native start point at 12 o'clock — see ringRect() in
  // skeleton.ts); square/hexagon are <polygon>s, moved by regenerating
  // their `points` outright (cheap — six or so numbers — and simpler than
  // trying to translate a polygon's existing points).
  private repositionRingVariants(id: string, cx: number, cy: number) {
    const circle = this.el[id] as SVGRectElement | undefined;
    circle?.setAttribute('x', String(cx - 47));
    circle?.setAttribute('y', String(cy - 47));
    circle?.setAttribute('transform', `rotate(-90 ${cx} ${cy})`);
    const square = this.el[`${id}-square`] as SVGPolygonElement | undefined;
    square?.setAttribute('points', squareRingPoints(cx, cy));
    const hex = this.el[`${id}-hex`] as SVGPolygonElement | undefined;
    hex?.setAttribute('points', hexagonRingPoints(cx, cy));
  }

  // Repositions every node for the current `rowGap`/`columnGap`, plus the
  // straight tracks, coverage rings and SoC ring that touch those rows/
  // columns directly (the 6 curved tracks are handled by applyCurveBend(),
  // which needs the same layout combined with `curveBend`).
  //
  // Each node's `cx`/`cy` are set together (see nodeXY()) rather than a row
  // pass and a column pass separately — an icon's cached 'default'-mode
  // transform (see below) encodes both in one string, so computing it from
  // only one freshly-known coordinate while reading the other back from a
  // possibly-stale DOM attribute would risk combining an old cx with a new
  // cy (or vice versa) if rowGap and columnGap ever change in the same
  // update() call.
  private applyLayout() {
    const rows = rowLayout(this.rowGap);
    const cols = columnLayout(this.columnGap);
    for (const { prefix, texts } of PowerFlow.ICON_LAYOUT_NODES) {
      const [cx, cy] = PowerFlow.nodeXY(prefix, rows, cols);
      const bg = this.el[`${prefix}-bg`] as SVGRectElement | undefined;
      bg?.setAttribute('x', String(cx - 52));
      bg?.setAttribute('y', String(cy - 52));
      const ring = this.el[`${prefix}-ring`] as SVGRectElement | undefined;
      ring?.setAttribute('x', String(cx - 52));
      ring?.setAttribute('y', String(cy - 52));
      // The hexagon nodeShape variant (see applyNodeShape()) — repositioned
      // here too, whether or not it's the currently-visible one, so it's
      // never stale if the caller switches to 'hexagon' after a rowGap/
      // columnGap change.
      const hexPts = hexagonPoints(cx, cy);
      (this.el[`${prefix}-bg-hex`] as SVGPolygonElement | undefined)?.setAttribute('points', hexPts);
      (this.el[`${prefix}-ring-hex`] as SVGPolygonElement | undefined)?.setAttribute('points', hexPts);
      for (const id of texts) (this.el[id] as SVGTextElement | undefined)?.setAttribute('x', String(cx));

      // Refreshes `iconLayoutCache` (icon/text offsets from the node's own
      // cx/cy are fixed — -18/+16/+29 for a 2-line node, -27/+5/+18/+31 for
      // the battery's 3 lines; see skeleton.ts's original static values,
      // only the position itself moves). This matters because
      // applyIconStyle()'s 'default' branch restores from this cache rather
      // than re-deriving it — without the refresh, switching iconStyle back
      // to 'default' after a layout change would snap the icon back to its
      // *construction-time* position.
      const cached = this.iconLayoutCache[prefix];
      if (!cached) continue;
      const isBattery = prefix === 'bat';
      const iconOffset = isBattery ? 27 : 18;
      const textOffsets = isBattery ? [5, 18, 31] : [16, 29];
      this.iconLayoutCache[prefix] = {
        ...cached,
        iconTransform: iconTransform(cx, cy - iconOffset, 28),
        textY: textOffsets.map((o) => String(cy + o)),
      };
    }

    // Grid's own export coverage rings — home's (arc-*) never move, since
    // home sits on both a fixed row and column.
    for (const id of ['garc-solar', 'garc-bat']) {
      this.repositionRingVariants(id, cols.col1, MID_ROW_Y);
    }
    // bat-soc-arc itself, its mask (bat-soc-mask-arc) and every layer of the
    // charge/discharge comet (BATTERY_COMET_LAYERS — see skeleton.ts) all sit
    // concentric on the same ring, so they all move together here.
    for (const id of [
      'bat-soc-arc',
      'bat-soc-mask-arc',
      ...BATTERY_COMET_LAYERS.map((l) => l.id),
    ]) {
      this.repositionRingVariants(id, cols.col2, rows.botY);
    }

    // Pull-back for tracks that run dead-horizontal through a node's own
    // vertical center — the widest point of every shape except hexagon,
    // whose vertex-to-vertex width there is NODE_HEX_CIRCUMRADIUS (~60px),
    // not the usual 52. p-solar-bat/p-home-consumer1/p-home-consumer2 don't
    // need this: they pull back *vertically* instead, where every shape
    // (hexagon included — its apothem is still 52, only its width differs)
    // has the same 52px half-size.
    const hPull = this.nodeShape === 'hexagon' ? NODE_HEX_CIRCUMRADIUS : 52;
    this.setPathD('p-grid-home', `M${cols.col1 + hPull},${MID_ROW_Y} H${cols.col3 - hPull}`);
    this.setPathD('p-solar-bat', `M${cols.col2},${rows.topInner} V${rows.botInner}`);
    this.setPathD('p-home-consumer1', `M${cols.col3},${MID_ROW_Y - 52} V${rows.topInner}`);
    this.setPathD('p-home-consumer2', `M${cols.col3},${MID_ROW_Y + 52} V${rows.botInner}`);
    this.setPathD('p-bat-batteryload1', `M${cols.col2 - hPull},${rows.botY} H${cols.col1 + hPull}`);
    this.setPathD('p-bat-batteryload2', `M${cols.col2 + hPull},${rows.botY} H${cols.col3 - hPull}`);
  }

  // `curveBend` behaves like a corner *radius*: `0` is a sharp, un-rounded
  // right-angle elbow — two straight segments meeting at a point — and
  // `CURVE_BEND_MAX` is a plain direct line (so large a "radius" the corner
  // disappears entirely). Getting from one to the other is a two-phase
  // blend of a single quadratic bezier's own three points (S = start, E =
  // end, C = control) — chosen so *neither* extreme needs special-casing:
  // both fall out of the same continuous formula as `u` (bend/CURVE_BEND_MAX)
  // sweeps 0→1, so there's no jump anywhere, including right at the
  // direct-line end (a flat special case there previously meant the curve
  // stayed a large, fully-formed bulge all the way up to bend=CURVE_BEND_MAX
  // and only snapped flat exactly at the max value).
  //
  // Phase 1 (u: 0→0.5) — S and E slide from the fixed right-angle `corner`
  // point *out* to p0/p3, while C stays pinned at that same corner the
  // whole time. Since p0's own fixed departure direction (curvesForLayout()
  // built it that way) points exactly at `corner`, a control point sitting
  // there can never introduce a new tangent at S — so every value in this
  // phase keeps the "straight out of the node, into a corner-anchored
  // curve" character with no kink, from a zero-length curve at a sharp
  // corner (u=0) growing into a full corner-anchored arc spanning the
  // entire p0-p3 path (u=0.5).
  //
  // Phase 2 (u: 0.5→1) — S and E now stay fixed at p0/p3 (the "straight
  // stub" has fully vanished), and instead C itself slides from `corner`
  // toward the p0-p3 diagonal's own midpoint. A quadratic bezier whose
  // control point is exactly the midpoint of its two endpoints is provably
  // just the straight line between them (the weighted-average formula
  // degenerates algebraically), so this phase asymptotically *flattens*
  // the phase-1 arc into a plain diagonal, reaching it exactly at u=1 —
  // the direct line is this formula's natural limit, not a separate case.
  private static readonly CURVE_BEND_MAX = 2.5;
  private applyCurveBend() {
    const u = this.curveBend / PowerFlow.CURVE_BEND_MAX;
    // The home/grid-side fan-out pull-back assumes a uniform 52px node
    // boundary — true for circle/square, but a regular hexagon's actual
    // (slanted) edge at that fan-out offset sits further out (see
    // HEX_HOME_PULLBACK in skeleton.ts) — using the circle/square value
    // there would land these 6 curves' own endpoints inside the wider
    // hexagon, clipping into it.
    const homePullback = this.nodeShape === 'hexagon' ? HEX_HOME_PULLBACK : undefined;
    for (const { id, p0, p1, p3 } of curvesForLayout(this.rowGap, this.columnGap, homePullback)) {
      const path = this.el[id] as SVGPathElement | undefined;
      if (!path) continue;
      // p1 sits purely in p0's own fixed departure direction (curvesForLayout()
      // built it that way) — whichever axis p1 shares with p0 tells us
      // whether that departure is vertical or horizontal, and the corner
      // is simply where a line continuing in that direction from p0
      // crosses the line p3 arrives along (the other axis).
      const exitsVertically = p0[0] === p1[0];
      const corner: [number, number] = exitsVertically ? [p0[0], p3[1]] : [p3[0], p0[1]];
      const mid: [number, number] = [(p0[0] + p3[0]) / 2, (p0[1] + p3[1]) / 2];
      let s: [number, number];
      let e: [number, number];
      let ctrl: [number, number];
      if (u <= 0.5) {
        const f = u / 0.5;
        s = [corner[0] + f * (p0[0] - corner[0]), corner[1] + f * (p0[1] - corner[1])];
        e = [corner[0] + f * (p3[0] - corner[0]), corner[1] + f * (p3[1] - corner[1])];
        ctrl = corner;
      } else {
        const f = (u - 0.5) / 0.5;
        s = p0;
        e = p3;
        ctrl = [corner[0] + f * (mid[0] - corner[0]), corner[1] + f * (mid[1] - corner[1])];
      }
      const d = `M${p0[0]},${p0[1]} L${s[0]},${s[1]} Q${ctrl[0]},${ctrl[1]} ${e[0]},${e[1]} L${p3[0]},${p3[1]}`;
      path.setAttribute('d', d);
    }
    // Changing `d` changes each affected path's total length — every flow's
    // cached `length` (measured once in initDots()) would otherwise go stale
    // and skew its speed/position math. `s.phase` is a 0..1 fraction, so
    // refreshing `length` here doesn't cause any jump.
    for (const id in this.dots) {
      const s = this.dots[id];
      s.length = s.path.getTotalLength();
    }
  }

  // The home/grid coverage rings (drawn on top of those node bodies — see
  // the comment in skeleton.ts) and the battery SoC ring (drawn inside its
  // own node, already on top of that node's body) all get the same
  // `nodeStyle: 'filled'` drop shadow as the icon/text painted in paintNode().
  private static readonly COVERAGE_RING_IDS = [
    'arc-solar',
    'arc-bat',
    'arc-grid',
    'garc-solar',
    'garc-bat',
    'bat-soc-arc',
  ];
  private applyRingShadow() {
    const on = this.nodeStyle === 'filled';
    // Applied to all three shape variants regardless of which is currently
    // visible (cheap, and simpler than tracking "just the active one" here
    // too) — matches paintNode()'s own -hex node treatment.
    for (const id of PowerFlow.COVERAGE_RING_IDS) {
      for (const variant of ['', '-square', '-hex']) this.el[`${id}${variant}`]?.classList.toggle('node-filled-ink', on);
    }
  }

  // Every node's `-bg`/`-ring` is a <rect>; `'circle'`<->`'square'` is a
  // corner-radius switch (see nodeShapeRect() in skeleton.ts): rx=ry=52
  // (half its own 104 width/height) reads as a circle, rx=ry=0 as a sharp
  // square — CSS-animatable (see the `.node-bg`/`.node-ring` transition in
  // skeleton.ts), so toggling between these two morphs smoothly. `'hexagon'`
  // is a genuinely different element — a pre-rendered `<polygon>` (see
  // nodeShapeHexagon() in skeleton.ts, ids `${prefix}-bg-hex`/`-ring-hex`),
  // swapped in via `display` the same way dotShape's non-circle marker
  // shapes are (see ORIENTED_DOT_SHAPES) — a stroked rect clipped to a
  // hexagon comes out as disconnected fragments rather than a clean
  // outline (clip-path clips the rendered stroke, it doesn't re-route it),
  // so unlike circle<->square this switch snaps rather than morphs.
  private applyNodeShape() {
    const radius = this.nodeShape === 'circle' ? '52' : '0';
    const hexActive = this.nodeShape === 'hexagon';
    for (const { prefix } of PowerFlow.ICON_LAYOUT_NODES) {
      for (const suffix of ['bg', 'ring']) {
        const rect = this.el[`${prefix}-${suffix}`] as SVGRectElement | undefined;
        rect?.setAttribute('rx', radius);
        rect?.setAttribute('ry', radius);
        if (rect) rect.style.display = hexActive ? 'none' : '';
        const hex = this.el[`${prefix}-${suffix}-hex`] as SVGElement | undefined;
        if (hex) hex.style.display = hexActive ? '' : 'none';
      }
    }
  }

  // The home/grid coverage rings, the battery SoC ring + its mask, and the
  // battery charge/discharge comet (see ringRect()/ringSquarePolygon()/
  // ringHexPolygon()/batteryCometMarkup() in skeleton.ts) each have three
  // pre-rendered variants — a circle (<rect rx=ry=47>, unchanged from
  // before nodeShape existed), a square, and a hexagon (both <polygon>s,
  // *not* another rx/ry state of that same rect: a plain rect's own
  // implicit path start point turned out not to land at 12 o'clock the way
  // the fully-rounded circle rect's does, so square/hexagon instead use an
  // explicit polygon with a vertex placed exactly at top-center — see
  // squareRingPoints()/hexagonRingPoints() in skeleton.ts). Exactly one
  // variant is shown at a time, the same `display`-swap pattern node bg/
  // ring's hexagon variant already uses.
  //
  // Besides which element is visible, each shape's own *perimeter* differs
  // (circle: 2·π·47; square: plain 4×94; hexagon: 6× its own side, which
  // for a regular hexagon equals its circumradius) — `this.ringPerimeter`
  // (read by arc()/applyBatteryHighlight()/tick()'s comet loop) and
  // `this.ringStartFraction` (the extra dashoffset the *circle* variant
  // alone needs to land its native start point at 12 o'clock — 0 for
  // square/hexagon, whose native start already *is* 12 o'clock by
  // construction) are both updated here. The comet's dasharray, baked into
  // the markup per-shape already (see cometDasharray() in skeleton.ts),
  // needs no runtime recompute — only which layer's *elements*
  // initBatteryComet() points tick() at changes, so that's re-run here too.
  private static readonly RING_IDS = [
    'arc-solar',
    'arc-bat',
    'arc-grid',
    'garc-solar',
    'garc-bat',
    'bat-soc-arc',
    'bat-soc-mask-arc',
  ];
  private ringShapeSuffix(): '' | '-square' | '-hex' {
    return this.nodeShape === 'square' ? '-square' : this.nodeShape === 'hexagon' ? '-hex' : '';
  }
  private applyRingShape() {
    const suffix = this.ringShapeSuffix();
    this.ringPerimeter =
      this.nodeShape === 'square' ? RING_PERIMETER_SQUARE : this.nodeShape === 'hexagon' ? RING_PERIMETER_HEX : ARC_LENGTH;
    this.ringStartFraction = this.nodeShape === 'circle' ? 0.25 : 0;
    for (const id of PowerFlow.RING_IDS) {
      for (const variant of ['', '-square', '-hex']) {
        const el = this.el[`${id}${variant}`] as SVGElement | undefined;
        if (el) el.style.display = variant === suffix ? '' : 'none';
      }
    }
    for (const { id } of BATTERY_COMET_LAYERS) {
      for (const variant of ['', '-square', '-hex']) {
        const el = this.el[`${id}${variant}`] as SVGElement | undefined;
        if (el) el.style.display = variant === suffix ? '' : 'none';
      }
    }
    this.initBatteryComet();
  }

  // How far (in px along the path) placeMarker() samples on either side of a
  // triangle dot's position to find its direction of travel.
  private static readonly TANGENT_SAMPLE_PX = 0.5;

  // How many dots this particular flow actually shows right now — the global
  // `dotCount` setting, further capped by the leg's own `maxDots` (short
  // direct connections between grid-adjacent nodes cap lower; see DOTS).
  private effectiveDotCount(s: DotFlowState): number {
    return Math.max(1, Math.min(this.dotCount, s.maxDots));
  }

  // Marker `i`'s 0..1 position along the path: the flow's shared travel
  // phase, offset by `i / count` and wrapped — so a flow's dots are always
  // spaced evenly around the full path regardless of `phase`.
  private markerFraction(s: DotFlowState, i: number): number {
    const count = this.effectiveDotCount(s);
    const f = s.phase + i / count;
    return f - Math.floor(f);
  }

  // Pull-back from each path endpoint, in px, so a marker never visually
  // overlaps the node it's arriving at or departing from. Tracks run
  // edge-to-edge between node circles, so without this a marker centered
  // exactly at frac 0/1 sits right on the node's boundary — the triangle
  // shape pokes noticeably past it, since its tip leads 6px ahead of its own
  // center point in the direction of travel.
  private static readonly MARKER_END_INSET_PX = 4;

  // Position along the path for marker `i`'s current progress, honouring
  // `reverse`. For the oriented shapes (triangle/bolt/chevron/spark),
  // also orients the marker along its direction of travel — found via a
  // central-difference sample around the current position, so it's correct
  // for both `reverse` and non-`reverse` dots (and for paths shared by both
  // directions, like p-bat-grid) without needing to special-case `reverse`
  // itself.
  private placeMarker(s: DotFlowState, i: number) {
    const m = s.markers[i];
    const frac = this.markerFraction(s, i);
    const at = s.reverse ? 1 - frac : frac;
    // Clamp the inset to at most half the path so it can't invert on an
    // extremely short leg (none currently are shorter than ~25px, but this
    // keeps the math sane regardless).
    const inset = Math.min(PowerFlow.MARKER_END_INSET_PX, s.length / 2);
    const currentLen = inset + at * (s.length - 2 * inset);
    const p = s.path.getPointAtLength(currentLen);
    if (this.dotShape === 'circle') {
      m.circle.setAttribute('cx', String(p.x));
      m.circle.setAttribute('cy', String(p.y));
    } else {
      const dir = s.reverse ? -1 : 1;
      const d = PowerFlow.TANGENT_SAMPLE_PX;
      const ahead = s.path.getPointAtLength(
        Math.max(0, Math.min(s.length, currentLen + dir * d)),
      );
      const behind = s.path.getPointAtLength(
        Math.max(0, Math.min(s.length, currentLen - dir * d)),
      );
      const angle = (Math.atan2(ahead.y - behind.y, ahead.x - behind.x) * 180) / Math.PI;
      m.oriented[this.dotShape].group.setAttribute(
        'transform',
        `translate(${p.x} ${p.y}) rotate(${angle})`,
      );
    }
  }

  // How long (ms) before a dot completes a lap it starts shrinking out —
  // matches the `.dot.shrunk` / `.dot-tri.shrunk` CSS transition duration
  // (see applyLapPop()), so by the time it visually reaches the end of the
  // path it's already at scale 0, ready to pop back in at the start.
  private static readonly LAP_POP_OUT_MS = 180;

  // Fraction of a flow's full lap that LAP_POP_OUT_MS of travel covers at its
  // current speed — capped so a very short/fast leg (see DOTS' `maxDots`)
  // never spends more than a fifth of its lap shrunk.
  private lapPopOutFraction(s: DotFlowState): number {
    if (s.speed <= 0 || s.length <= 0) return 0;
    return Math.min(0.2, (s.speed * (PowerFlow.LAP_POP_OUT_MS / 1000)) / s.length);
  }

  // Reuses the same shrink/grow CSS transition as setDot's visibility pop-in/
  // out for every lap a marker completes while its flow stays continuously
  // active: shrinks it just before it reaches the end of the path, then pops
  // it back in the instant it wraps to the start, edge-triggered off its own
  // `frac` — so a looping dot fades out/in at each end of its track instead
  // of just vanishing at one end and reappearing at the other. Only called
  // for markers that are `active`; a marker being retired by setDot (flow
  // gone, or dotCount dropped) owns `shrunk` itself via `shrinking` instead.
  private applyLapPop(s: DotFlowState, m: DotMarker, i: number) {
    const frac = this.markerFraction(s, i);
    const shrinkAt = 1 - this.lapPopOutFraction(s);
    if (!m.lapPopped && frac >= shrinkAt) {
      this.shrinkTarget(m).classList.add('shrunk');
      m.lapPopped = true;
    } else if (m.lapPopped && frac < m.prevFrac) {
      this.shrinkTarget(m).classList.remove('shrunk');
      m.lapPopped = false;
    }
    m.prevFrac = frac;
  }

  // Single animation loop for all dots. Advances each visible flow's shared
  // phase by speed·dt, wrapping at the end, then repositions every one of its
  // active/shrinking markers (and pops active ones at each lap boundary —
  // see applyLapPop()). dt is capped so returning from a background tab
  // doesn't teleport the dots.
  private tick = (now: number) => {
    const dt = Math.min((now - this.lastTime) / 1000, 0.05);
    this.lastTime = now;
    for (const id in this.dots) {
      const s = this.dots[id];
      const animating = s.visible || s.markers.some((m) => m.active || m.shrinking);
      if (!animating || s.length === 0) continue;
      s.phase += (s.speed * dt) / s.length;
      s.phase -= Math.floor(s.phase); // wrap into [0, 1)
      s.markers.forEach((m, i) => {
        if (!m.active && !m.shrinking) return;
        if (m.active) this.applyLapPop(s, m, i);
        this.placeMarker(s, i);
      });
    }
    if (this.batteryCometSpeed > 0) {
      this.batteryCometPhase += (this.batteryCometSpeed * dt) / this.ringPerimeter;
      this.batteryCometPhase -= Math.floor(this.batteryCometPhase); // wrap into [0, 1)
      for (const { el, delay } of this.batteryCometLayers) {
        // A trailing layer shows where the head was `delay` (a fraction of
        // one lap) ago — see the batteryCometLayers field comment for why
        // this, unlike the old CSS animation-delay, never snaps when speed
        // changes.
        let layerPhase = this.batteryCometPhase - delay;
        layerPhase -= Math.floor(layerPhase); // wrap into [0, 1)
        el.setAttribute(
          'stroke-dashoffset',
          String(this.batteryCometDirection * -layerPhase * this.ringPerimeter),
        );
      }
    }
    this.raf = requestAnimationFrame(this.tick);
  };

  /** Re-render with new data / colors / labels / icons / speedScale. Cheap to call frequently. */
  update(options: PowerFlowOptions) {
    const data = options.data;
    const settings = options.options;
    if (settings?.colors !== undefined) {
      this.colors = { ...DEFAULT_COLORS, ...settings.colors };
    }
    if (settings?.labels !== undefined) {
      this.labels = { ...DEFAULT_LABELS, ...settings.labels };
    }
    if (settings?.icons !== undefined) {
      this.icons = { ...DEFAULT_ICONS, ...settings.icons };
    }
    if (settings?.topology !== undefined) {
      this.topology = { ...DEFAULT_TOPOLOGY, ...settings.topology };
    }
    if (settings?.speedScale !== undefined) {
      this.speedScale = settings.speedScale;
    }
    if (settings?.nodeStyle !== undefined) {
      this.nodeStyle = settings.nodeStyle;
    }
    if (settings?.nodeShape !== undefined) {
      this.nodeShape = settings.nodeShape;
    }
    if (settings?.iconStyle !== undefined) {
      this.iconStyle = settings.iconStyle;
    }
    if (settings?.curveBend !== undefined) {
      this.curveBend = Math.max(0, Math.min(2.5, settings.curveBend));
    }
    if (settings?.dotShape !== undefined && settings.dotShape !== this.dotShape) {
      this.swapDotShape(settings.dotShape);
    }
    if (settings?.dotCount !== undefined) {
      this.dotCount = Math.max(1, Math.min(MAX_DOTS_PER_TRACK, Math.round(settings.dotCount)));
    }
    if (settings?.rowGap !== undefined) {
      // Floor of 110 keeps the top/bottom rows comfortably clear of the
      // middle row; 180 is a ceiling against an overly stretched-out diagram.
      this.rowGap = Math.max(110, Math.min(180, settings.rowGap));
    }
    if (settings?.columnGap !== undefined) {
      // Same bounds as rowGap, for the same reason.
      this.columnGap = Math.max(110, Math.min(180, settings.columnGap));
    }
    if (settings?.batteryChargeHighlight !== undefined) {
      this.batteryChargeHighlight = settings.batteryChargeHighlight;
    }
    if (settings?.trackPulse !== undefined) {
      this.trackPulse = settings.trackPulse;
    }
    this.svg.classList.toggle('track-pulse', this.trackPulse);
    this.applyLayout();
    this.applyNodeShape();
    this.applyRingShape();
    this.applyIconStyle();
    this.applyCurveBend();
    this.applyRingShadow();
    const { colors, labels, icons, topology: topo } = this;

    this.setIconPath('solar-icon', icons.solar);
    this.setIconPath('grid-icon', icons.grid);
    this.setIconPath('home-icon', icons.home);
    this.setIconPath('bat-icon', icons.battery);
    this.setIconPath('c1-icon', icons.consumer1);
    this.setIconPath('c2-icon', icons.consumer2);
    this.setIconPath('c3-icon', icons.consumer3);
    this.setIconPath('c4-icon', icons.consumer4);
    this.setIconPath('bl1-icon', icons.batteryLoad1);
    this.setIconPath('bl2-icon', icons.batteryLoad2);

    const solarWatts = data.solar ?? 0;
    const gridWatts = data.grid ?? 0;
    const loadWatts = data.load ?? 0;
    const batteryWatts = data.battery ?? 0;
    const consumer1Watts = data.consumer1 ?? 0;
    const consumer2Watts = data.consumer2 ?? 0;
    const consumer3Watts = data.consumer3 ?? 0;
    const consumer4Watts = data.consumer4 ?? 0;
    const batteryLoad1Watts = data.batteryLoad1 ?? 0;
    const batteryLoad2Watts = data.batteryLoad2 ?? 0;
    const hasSolar = data.solar != null;
    const hasBattery = data.battery != null;
    const hasConsumer1 = data.consumer1 != null;
    const hasConsumer2 = data.consumer2 != null;
    const hasConsumer3 = data.consumer3 != null;
    const hasConsumer4 = data.consumer4 != null;
    const hasBatteryLoad = data.batteryLoad1 != null;
    const hasBatteryLoad2 = data.batteryLoad2 != null;
    // consumer2 and batteryLoad2 share the same physical position (345,310) —
    // if a caller sets both at once, we can't render both without one
    // silently overlapping the other or moving somewhere unrelated, so a
    // conflict indicator is shown there instead of either value (see the
    // "Consumer slot layout" section of the README).
    const hasSlotConflict = hasConsumer2 && hasBattery && hasBatteryLoad2;
    if (hasSlotConflict && !this.hadSlotConflict) {
      console.warn(
        '[powerflow] `consumer2` and `batteryLoad2` cannot both be set — they share the same node position. Showing a conflict indicator instead of either value.',
      );
    }
    this.hadSlotConflict = hasSlotConflict;

    // ── Flow allocation ──────────────────────────────────────────────
    // See `computeFlowAllocation` for the full priority rationale (also
    // covered in the README's "How the flows are computed" section) and its
    // unit tests in flow-allocation.test.ts for the specific tricky cases it
    // handles.
    const {
      solarToBattery,
      gridToBattery,
      solarToHome,
      solarToGrid,
      batToHome,
      batToGrid,
      gridToHome,
    } = computeFlowAllocation(data, topo);
    const load = Math.max(loadWatts, 0);

    // ViewBox: include the top row (solar / consumer1 / consumer3) and/or the
    // bottom row (battery / consumer2 / consumer4 / batteryLoad1 /
    // batteryLoad2) only when something occupies it, with an 8px margin
    // beyond that row's own outer edge (which moves with `rowGap`). Absent
    // rows are trimmed so the diagram never has a large empty band — e.g.
    // grid+home+battery starts at the middle row, whose own edge (133,
    // independent of `rowGap`) provides the margin instead. The 4th column
    // (consumer3/consumer4) only widens the viewBox when actually used;
    // `minX`/the 4th column's position both move with `columnGap`.
    const { topOuter, botOuter } = rowLayout(this.rowGap);
    const { col3, col4, minX: baseMinX } = columnLayout(this.columnGap);
    const hasTop = hasSolar || hasConsumer1 || hasConsumer3;
    const hasBottom = hasBattery || hasConsumer2 || hasConsumer4;
    const minY = hasTop ? topOuter - 8 : MID_ROW_Y - 52 - 8;
    const maxY = hasBottom ? botOuter + 8 : MID_ROW_Y + 52 + 8;
    // A hexagon node is wider than every other shape's 104px footprint (see
    // NodeShape's own doc comment — a regular hexagon can't fit equal-length
    // sides into that box) — the left/rightmost columns' own hexagons would
    // otherwise get clipped at the diagram's own edge, so both sides of the
    // viewBox widen by the same extra margin every hexagon already needs.
    const hexExtra = this.nodeShape === 'hexagon' ? NODE_HEX_CIRCUMRADIUS - 52 : 0;
    const minX = baseMinX - hexExtra;
    const maxX = (hasConsumer3 || hasConsumer4 ? col4 : col3) + 52 + 3 + hexExtra;
    const width = maxX - minX;
    const height = maxY - minY;
    this.svg.setAttribute('viewBox', `${minX} ${minY} ${width} ${height}`);

    // Give the host a natural aspect-ratio matching the current viewBox. When
    // the consumer sets an explicit height (e.g. a resizable container), that
    // wins and the diagram fits inside it; otherwise the height follows width.
    (this.root.host as HTMLElement).style.aspectRatio = `${width} / ${height}`;

    // Expose colors to the CSS (dots, tracks and arcs) as custom properties.
    // gridOut/batteryIn aren't included — every dot/track is colored by its
    // source (see DOTS), and those two colors are only ever used for the
    // grid/battery nodes' own import/export and charge/discharge styling.
    const style = this.svg.style;
    style.setProperty('--sfd-solar', colors.solar);
    style.setProperty('--sfd-grid-in', colors.gridIn);
    style.setProperty('--sfd-battery-out', colors.batteryOut);
    style.setProperty('--sfd-consumer1', colors.consumer1);
    style.setProperty('--sfd-consumer2', colors.consumer2);
    style.setProperty('--sfd-consumer3', colors.consumer3);
    style.setProperty('--sfd-consumer4', colors.consumer4);
    style.setProperty('--sfd-battery-load1', colors.batteryLoad1);
    style.setProperty('--sfd-battery-load2', colors.batteryLoad2);

    // Topology: show/hide the optional nodes (each tagged with a matching
    // data-topo attribute).
    this.setTopo('solar', hasSolar);
    this.setTopo('battery', hasBattery);
    // batteryLoad1/batteryLoad2 are sub-consumers of the battery's discharge,
    // so they're meaningless (and hidden) without a battery, even if a
    // caller sets a batteryLoad1 value without a battery value. batteryLoad2
    // additionally hides during a slot conflict (see hasSlotConflict above).
    this.setTopo('batteryLoad1', hasBattery && hasBatteryLoad);
    this.setTopo('batteryLoad2', hasBattery && hasBatteryLoad2 && !hasSlotConflict);
    // consumer2 hides during a slot conflict too — see hasSlotConflict above.
    this.setTopo('consumer1', hasConsumer1);
    this.setTopo('consumer2', hasConsumer2 && !hasSlotConflict);
    this.setTopo('consumer3', hasConsumer3);
    this.setTopo('consumer4', hasConsumer4);
    this.setTopo('slotConflict', hasSlotConflict);

    // Edges: the five built-in connections gated by FlowTopology combine node
    // presence with the matching topology flag.
    this.setEdge('use-solar-home', hasSolar && topo.solarToHome);
    this.setEdge('use-solar-grid', hasSolar && topo.solarToGrid);
    this.setEdge(
      'use-solar-bat',
      hasSolar && hasBattery && topo.solarToBattery,
    );
    this.setEdge('use-bat-home', hasBattery && topo.batteryToHome);
    this.setEdge('use-bat-grid', hasBattery && topo.batteryToGrid);

    // ── Dots ──
    this.setDot('solar-home', solarToHome > 0, solarToHome);
    this.setDot('solar-grid', solarToGrid > 0, solarToGrid);
    this.setDot('grid-home', gridToHome > 0, gridToHome);
    this.setDot('bat-home', hasBattery && batToHome > 0, batToHome);
    this.setDot('bat-grid', hasBattery && batToGrid > 0, batToGrid);
    this.setDot('solar-bat', hasBattery && solarToBattery > 0, solarToBattery);
    this.setDot('grid-bat', hasBattery && gridToBattery > 0, gridToBattery);
    this.setDot(
      'home-consumer1',
      hasConsumer1 && consumer1Watts > 0,
      consumer1Watts,
    );
    this.setDot(
      'home-consumer2',
      hasConsumer2 && !hasSlotConflict && consumer2Watts > 0,
      consumer2Watts,
    );
    this.setDot(
      'home-consumer3',
      hasConsumer3 && consumer3Watts > 0,
      consumer3Watts,
    );
    this.setDot(
      'home-consumer4',
      hasConsumer4 && consumer4Watts > 0,
      consumer4Watts,
    );
    this.setDot(
      'bat-batteryload1',
      hasBattery && hasBatteryLoad && batteryLoad1Watts > 0,
      batteryLoad1Watts,
    );
    this.setDot(
      'bat-batteryload2',
      hasBattery && hasBatteryLoad2 && !hasSlotConflict && batteryLoad2Watts > 0,
      batteryLoad2Watts,
    );

    // ── Track coloring ── Highlight each track in the color of the dot
    // currently traveling along it, once `setDot` above has updated
    // `this.dots[*].visible`. A handful of tracks (e.g. battery↔grid) are
    // shared by two dots that travel in opposite directions — they're always
    // mutually exclusive (never both carry flow at once), so aggregating "is
    // any dot on this track visible" per track, rather than per dot, avoids
    // one dot's `setDot` call clobbering the state the other just set. Also
    // carries the active dot's own `speed` along, purely for
    // `options.trackPulse` below — a track pulses in step with how fast its
    // own dot is traveling, so a higher-load flow visibly pulses faster.
    const trackActive: Record<string, { colorVar: string | null; speed: number }> = {};
    for (const d of DOTS) {
      const id = trackIdFor(d.path);
      const dotState = this.dots[d.id];
      if (dotState.visible) {
        trackActive[id] = { colorVar: DOT_CLS_TO_COLOR_VAR[d.cls] ?? d.cls, speed: dotState.speed };
      } else if (!(id in trackActive)) {
        trackActive[id] = { colorVar: null, speed: 0 };
      }
    }
    for (const id in trackActive) {
      const { colorVar, speed } = trackActive[id];
      const el = this.el[id] as SVGElement | undefined;
      if (!el) continue;
      el.classList.toggle('active', colorVar !== null);
      if (colorVar) {
        el.style.setProperty('--track-color', `var(--sfd-${colorVar})`);
        if (this.trackPulse) {
          const duration = Math.max(
            PowerFlow.TRACK_PULSE_MIN_S,
            Math.min(PowerFlow.TRACK_PULSE_MAX_S, PowerFlow.TRACK_PULSE_BASE_PX / Math.max(speed, 1)),
          );
          el.style.setProperty('animation-duration', `${duration.toFixed(2)}s`);
        }
      }
    }

    // ── Solar node ──
    if (hasSolar) {
      this.el['n-solar'].classList.toggle('dim', solarWatts === 0);
      this.paintNode('solar', colors.solar);
      this.text('t-solar-val', formatWatts(solarWatts));
      this.labelText('t-solar-lbl', labels.solar);
    }

    // Home arc: the fraction of the house load covered by solar, battery and
    // grid — the same allocation as the dots, so the ring closes to a full
    // circle and the segments agree with the flows.
    const solarShare = load > 0 ? solarToHome / load : 0;
    const batteryShare = load > 0 ? batToHome / load : 0;
    const gridShare = load > 0 ? gridToHome / load : 0;
    this.arc('arc-solar', solarShare, solarShare, 0);
    this.arc('arc-bat', batteryShare, batteryShare, solarShare);
    this.arc('arc-grid', gridShare, gridShare, solarShare + batteryShare);

    // Grid arc: when exporting, what the export is made of (solar vs. battery).
    const gridExport = solarToGrid + batToGrid;
    const exportSolarShare = gridExport > 0 ? solarToGrid / gridExport : 0;
    const exportBatShare = gridExport > 0 ? batToGrid / gridExport : 0;
    this.arc('garc-solar', exportSolarShare, exportSolarShare, 0);
    this.arc('garc-bat', exportBatShare, exportBatShare, exportSolarShare);

    // ── Grid node ──
    const gridColor = gridWatts >= 0 ? colors.gridIn : colors.gridOut;
    this.paintNode('grid', gridColor);
    const gridVal = this.el['t-grid-val'] as SVGTextElement;
    // Normally colored with the accent itself (unlike other nodes' neutral
    // value text) to make the import/export direction pop — but that would
    // blend into `filled`'s same-hue background, so it switches to the
    // uniform filled ink there too (paintNode already put the shadow class
    // on this element via ICON_LAYOUT_NODES' 'grid' texts entry).
    gridVal.style.fill = this.nodeStyle === 'filled' ? FILLED_INK : gridColor;
    gridVal.textContent = `${gridWatts >= 0 ? '→' : '←'} ${formatWatts(Math.abs(gridWatts))}`;
    this.labelText('t-grid-lbl', labels.grid);

    // ── Home node ──
    this.paintNode('home', colors.home);
    this.text('t-home-val', formatWatts(loadWatts));
    this.labelText('t-home-lbl', labels.home);

    // ── Battery node ── (colour follows charge/discharge, like the grid node)
    if (hasBattery) {
      const batteryColor =
        batteryWatts > 0 ? colors.batteryIn : colors.batteryOut;
      this.paintNode('bat', batteryColor);
      const soc = this.el['t-bat-soc'] as SVGTextElement;
      soc.style.display = data.batterySoc != null ? '' : 'none';
      if (data.batterySoc != null)
        soc.textContent = `${Math.round(data.batterySoc)} %`;
      const watts = this.el['t-bat-watts'] as SVGTextElement;
      // Same accent-colored-value pattern (and same `filled`-mode fixup) as
      // the grid node's value text above.
      watts.style.fill = this.nodeStyle === 'filled' ? FILLED_INK : batteryColor;
      watts.textContent = `${batteryWatts > 0 ? '↓' : '↑'} ${formatWatts(Math.abs(batteryWatts))}`;
      this.labelText('t-bat-lbl', labels.battery);
      // SoC inner ring — progress arc from 12 o'clock clockwise. Same
      // `filled`-mode fixup as the value texts above: unlike the home/grid
      // coverage rings (a different accent color than their node's own bg),
      // this ring's stroke is `batteryColor` — the *same* color `paintNode`
      // just gave the background, so at `filled`'s full opacity it would
      // otherwise vanish into it entirely, not just blend.
      const socArc = this.el[`bat-soc-arc${this.ringShapeSuffix()}`] as SVGGraphicsElement;
      socArc.style.stroke = this.nodeStyle === 'filled' ? FILLED_INK : batteryColor;
      const pct =
        data.batterySoc != null
          ? Math.max(0, Math.min(100, data.batterySoc)) / 100
          : 0;
      socArc.style.strokeDasharray = `${pct * this.ringPerimeter} ${this.ringPerimeter}`;
      this.applyBatteryHighlight(batteryWatts, pct);
    }

    // ── Consumer 1 node (home consumer, top-left of its 2×2) ──
    if (hasConsumer1) {
      this.el['n-consumer1'].classList.toggle('dim', consumer1Watts === 0);
      this.paintNode('c1', colors.consumer1);
      this.text('t-c1-val', formatWatts(consumer1Watts));
      this.labelText('t-c1-lbl', labels.consumer1);
    }

    // ── Consumer 2 node (home consumer, bottom-left of its 2×2) ──
    if (hasConsumer2) {
      this.el['n-consumer2'].classList.toggle('dim', consumer2Watts === 0);
      this.paintNode('c2', colors.consumer2);
      this.text('t-c2-val', formatWatts(consumer2Watts));
      this.labelText('t-c2-lbl', labels.consumer2);
    }

    // ── Consumer 3 node (home consumer, top-right of its 2×2) ──
    if (hasConsumer3) {
      this.el['n-consumer3'].classList.toggle('dim', consumer3Watts === 0);
      this.paintNode('c3', colors.consumer3);
      this.text('t-c3-val', formatWatts(consumer3Watts));
      this.labelText('t-c3-lbl', labels.consumer3);
    }

    // ── Consumer 4 node (home consumer, bottom-right of its 2×2) ──
    if (hasConsumer4) {
      this.el['n-consumer4'].classList.toggle('dim', consumer4Watts === 0);
      this.paintNode('c4', colors.consumer4);
      this.text('t-c4-val', formatWatts(consumer4Watts));
      this.labelText('t-c4-lbl', labels.consumer4);
    }

    // ── Battery load 1 node ──
    if (hasBatteryLoad) {
      this.el['n-batteryload1'].classList.toggle('dim', batteryLoad1Watts === 0);
      this.paintNode('bl1', colors.batteryLoad1);
      this.text('t-bl1-val', formatWatts(batteryLoad1Watts));
      this.labelText('t-bl1-lbl', labels.batteryLoad1);
    }

    // ── Battery load 2 node ──
    if (hasBatteryLoad2) {
      this.el['n-batteryload2'].classList.toggle(
        'dim',
        batteryLoad2Watts === 0,
      );
      this.paintNode('bl2', colors.batteryLoad2);
      this.text('t-bl2-val', formatWatts(batteryLoad2Watts));
      this.labelText('t-bl2-lbl', labels.batteryLoad2);
    }

    // ── Slot conflict indicator — fixed colors, not user-configurable, since
    // it signals a data misconfiguration rather than a themable flow. ──
    if (hasSlotConflict) {
      this.paintNode('conflict', PowerFlow.CONFLICT_COLOR);
    }
  }

  /** Remove the rendered diagram from its host and stop the animation loop. */
  destroy() {
    cancelAnimationFrame(this.raf);
    for (const s of Object.values(this.dots)) {
      for (const m of s.markers) if (m.hideTimer) clearTimeout(m.hideTimer);
    }
    this.root.innerHTML = '';
    this.el = {};
    this.dots = {};
  }

  // ── helpers ──

  // Show/hide every element belonging to an optional node (its node group and,
  // for consumer1/consumer2/batteryLoad1/batteryLoad2, its non-configurable track
  // share the same data-topo key).
  private setTopo(key: string, visible: boolean) {
    this.svg
      .querySelectorAll<SVGElement>(`[data-topo="${key}"]`)
      .forEach((n) => (n.style.display = visible ? '' : 'none'));
  }

  // Show/hide a single configurable-topology track by id (combines node
  // presence and the matching FlowTopology flag — see `update()`).
  private setEdge(id: string, visible: boolean) {
    (this.el[id] as SVGElement | undefined)?.style.setProperty(
      'display',
      visible ? '' : 'none',
    );
  }

  private fill(id: string, color: string) {
    (this.el[id] as SVGElement | undefined)?.style.setProperty('fill', color);
  }

  private stroke(id: string, color: string) {
    (this.el[id] as SVGElement | undefined)?.style.setProperty('stroke', color);
  }

  // Paints one node's background/ring/icon/text for the current `nodeStyle`,
  // replacing the fill/stroke triple every node used to repeat inline.
  // `prefix` must match an entry in ICON_LAYOUT_NODES — its `-bg`/`-ring`/
  // `-icon` ids and text ids are derived/looked up from there.
  private paintNode(prefix: string, color: string) {
    const texts = PowerFlow.ICON_LAYOUT_NODES.find((n) => n.prefix === prefix)?.texts ?? [];
    const isFilled = this.nodeStyle === 'filled';
    const bg =
      isFilled
        ? color
        : this.nodeStyle === 'tonal'
          ? tint(color, 55)
          : this.nodeStyle === 'outline'
            ? 'none'
            : tint(color);
    const ringHidden = this.nodeStyle === 'tonal' || isFilled;

    this.fill(`${prefix}-bg`, bg);
    // The hexagon nodeShape variant (see applyNodeShape()) is a separate
    // element, painted identically here regardless of which one is
    // currently visible — cheap (`fill()`/`stroke()` no-op on a missing
    // id), and means a nodeShape switch never needs to re-run this.
    this.fill(`${prefix}-bg-hex`, bg);
    this.stroke(`${prefix}-ring`, ringHidden ? 'none' : color);
    this.stroke(`${prefix}-ring-hex`, ringHidden ? 'none' : color);
    this.fill(`${prefix}-icon`, isFilled ? FILLED_INK : color);
    this.filledShadow(`${prefix}-icon`, isFilled);
    for (const id of texts) {
      this.textFill(id, isFilled ? FILLED_INK : null);
      this.filledShadow(id, isFilled);
    }
  }

  // `null` clears a previous override, falling back to the CSS default
  // (`fill: currentColor`) — needed so switching *away* from `filled` (the
  // only style that overrides text color) doesn't leave a stale inline fill.
  private textFill(id: string, color: string | null) {
    const node = (this.el[id] as SVGElement | undefined)?.style;
    if (!node) return;
    if (color) node.setProperty('fill', color);
    else node.removeProperty('fill');
  }

  // Toggles the drop-shadow that keeps `FILLED_INK` legible regardless of
  // the node's own accent color — see `.node-filled-ink` in CSS.
  private filledShadow(id: string, on: boolean) {
    this.el[id]?.classList.toggle('node-filled-ink', on);
  }

  private text(id: string, value: string) {
    const node = this.el[id];
    if (node) node.textContent = value;
  }

  // Node labels are arbitrary caller-supplied strings (e.g. a custom
  // appliance name), unlike the fixed-format value text — so unlike `text()`
  // above, this squeezes the text horizontally (SVG `textLength` +
  // `lengthAdjust="spacingAndGlyphs"`) if it would otherwise run past the
  // node's circle. Short strings skip the check entirely (cheap, since
  // `getComputedTextLength()` forces a layout reflow) — LABEL_SAFE_CHARS is a
  // conservative "definitely fits" bound; anything longer (including the
  // built-in "Battery Load"/"Battery Load 2") is actually measured.
  private static readonly LABEL_SAFE_CHARS = 10;
  private static readonly LABEL_MAX_WIDTH = 92; // node circles are 104 wide (r=52)
  private labelText(id: string, value: string) {
    const node = this.el[id] as SVGTextElement | undefined;
    if (!node) return;
    node.textContent = value;
    // getComputedTextLength() reflects any textLength constraint already on
    // the element, so a previously-compressed label would otherwise measure
    // as exactly LABEL_MAX_WIDTH forever after (never re-triggering
    // compression, since it's not > the budget) — clear both attributes
    // first so every measurement is against the natural, unconstrained width.
    node.removeAttribute('textLength');
    node.removeAttribute('lengthAdjust');
    if (value.length <= PowerFlow.LABEL_SAFE_CHARS) return;
    if (node.getComputedTextLength() > PowerFlow.LABEL_MAX_WIDTH) {
      node.setAttribute('lengthAdjust', 'spacingAndGlyphs');
      node.setAttribute('textLength', String(PowerFlow.LABEL_MAX_WIDTH));
    }
  }

  private setIconPath(id: string, path: string) {
    this.el[id]?.setAttribute('d', path);
  }

  // Show/hide a flow's dots (markers 0..dotCount-1) and set its speed. Only
  // the speed changes on a value update while a marker stays active — the
  // rAF loop keeps `phase` continuous, so dragging a slider never makes the
  // dots jump back to the start. Called on every update() regardless of
  // whether `visible` actually changed, so a `dotCount` change alone (flow
  // staying visible throughout) still pops in/out exactly the markers whose
  // index crossed the new count.
  // `marker`/`shrinkEl` are deliberately *not* captured once up front and
  // reused in the deferred callbacks below — `activeMarker`/`shrinkTarget`
  // depend on `this.dotShape`, and a dotShape change (swapDotShape()) can
  // land while a marker is mid-shrink (the 200ms hideTimer, or even the
  // pop-in rAF, hasn't fired yet). A stale closure would then hide/unshrink
  // the *old* shape's element while swapDotShape has already switched the
  // new shape's element to visible, leaving that one stuck on-screen forever
  // at its last position — visible but attached to no active track. Each
  // callback re-resolves the marker/shrink target at fire time instead, so
  // it always acts on whatever shape is current by then.
  private setDot(id: string, visible: boolean, watts: number) {
    const s = this.dots[id];
    s.visible = visible;
    if (visible) s.speed = this.flowSpeed(watts, s.length);
    const count = this.effectiveDotCount(s);
    s.markers.forEach((m, i) => {
      const wantActive = visible && i < count;
      if (wantActive && !m.active) {
        // Pop in: position first, show at scale(0), force reflow, then spring to full size.
        if (m.hideTimer) { clearTimeout(m.hideTimer); m.hideTimer = undefined; }
        m.active = true;
        m.shrinking = false;
        // Fresh lap-pop bookkeeping (see applyLapPop()) — starts wherever
        // this marker's shared phase currently puts it, not necessarily at
        // the path start (e.g. a higher dotCount activating a new marker
        // mid-animation), so tick() doesn't mistake this for a lap wrap.
        m.prevFrac = this.markerFraction(s, i);
        m.lapPopped = false;
        this.placeMarker(s, i);
        this.shrinkTarget(m).classList.add('shrunk');
        this.activeMarker(m).style.display = '';
        requestAnimationFrame(() => requestAnimationFrame(() => {
          if (m.active) this.shrinkTarget(m).classList.remove('shrunk');
        }));
      } else if (!wantActive && m.active) {
        // Shrink out: keep moving while scaling to 0, then hide after the transition.
        m.active = false;
        m.shrinking = true;
        this.shrinkTarget(m).classList.add('shrunk');
        m.hideTimer = setTimeout(() => {
          this.activeMarker(m).style.display = 'none';
          this.shrinkTarget(m).classList.remove('shrunk');
          m.shrinking = false;
          m.hideTimer = undefined;
        }, 200);
      }
    });
  }

  // Live-swaps which marker shape is shown for every currently active or
  // shrinking dot, so toggling dotShape mid-animation doesn't leave a dot
  // stuck invisible (old shape hidden, new shape never shown) or duplicated
  // (both shapes visible at once).
  private swapDotShape(newShape: DotShape) {
    for (const id in this.dots) {
      for (const m of this.dots[id].markers) {
        if (!m.active && !m.shrinking) continue;
        this.activeMarker(m).style.display = 'none';
        this.shrinkTarget(m).classList.remove('shrunk');
        // The new shape's element always starts unshrunk (just reset above),
        // so clear any in-progress lap-pop bookkeeping (see applyLapPop()) —
        // otherwise a marker mid lap-shrink at swap time would never
        // re-trigger the shrink on its new shape's element for this lap.
        m.lapPopped = false;
      }
    }
    this.dotShape = newShape;
    for (const id in this.dots) {
      const s = this.dots[id];
      s.markers.forEach((m, i) => {
        if (!m.active && !m.shrinking) return;
        this.activeMarker(m).style.display = '';
        this.placeMarker(s, i);
      });
    }
  }

  // Dot speed in px/s, (nearly) proportional to power so the speed difference
  // matches the power difference (330 W vs 1300 W ≈ 4× slower/faster). We clamp
  // the implied traversal time to [0.4s, 14s] — derived back into a speed — so
  // very small/large flows stay readable on any path length.
  private flowSpeed(watts: number, length: number): number {
    const raw = (20 + Math.sqrt(Math.abs(watts)) * 4) * this.speedScale;
    const seconds = Math.max(0.04, Math.min(length / raw, 14));
    return length / seconds;
  }

  // Drives the battery charge/discharge comet (see batteryCometMarkup() in
  // skeleton.ts) — a near-white highlight that spins around the same ring
  // as the SoC arc, masked to that arc's own drawn extent (`pct`) so it
  // only shows over the charged portion — see the battery node markup for
  // the mask itself and skeleton.ts's CSS comment for why it's near-white
  // rather than the battery's own accent color. This function only ever
  // sets `batteryCometSpeed`/`batteryCometDirection` (consumed by tick(),
  // which owns the actual per-frame motion — see that field's comment for
  // why) and the .active/.discharging classes.
  // Speed reuses flowSpeed() (the same px/s curve the flow dots use) so a
  // given wattage feels equally fast here as it does traveling a track
  // elsewhere in the diagram.
  // Direction encodes charge vs discharge: charging spins clockwise (the
  // same winding direction the SoC arc fills in), discharging reverses it.
  // `this.batteryChargeHighlight` (settings.batteryChargeHighlight, default
  // true) is the escape hatch for a plain, motionless SoC ring — gating it
  // here (rather than skipping the call site) still keeps the mask's
  // dasharray in sync, so re-enabling it later doesn't show a stale extent.
  private applyBatteryHighlight(batteryWatts: number, pct: number) {
    const group = this.el['bat-charge-highlight-group'] as SVGGElement | undefined;
    const mask = this.el[`bat-soc-mask-arc${this.ringShapeSuffix()}`] as SVGGraphicsElement | undefined;
    if (!group || !mask) return;
    mask.setAttribute('stroke-dasharray', `${pct * this.ringPerimeter} ${this.ringPerimeter}`);
    const rate = Math.abs(batteryWatts);
    const active = this.batteryChargeHighlight && rate > 0;
    group.classList.toggle('active', active);
    if (!active) {
      this.batteryCometSpeed = 0;
      return;
    }
    group.classList.toggle('discharging', batteryWatts < 0);
    this.batteryCometSpeed = this.flowSpeed(rate, this.ringPerimeter);
    this.batteryCometDirection = batteryWatts < 0 ? -1 : 1;
  }

  // Render a share (0..1) as a dash arc on the home ring, offset by the
  // share already drawn before it. Targets whichever of `id`'s three shape
  // variants applyRingShape() most recently made active (always run first
  // in update(), before any of this function's own callers) — the other
  // two stay hidden regardless of `share`, since applyRingShape() already
  // hid them unconditionally.
  private arc(id: string, share: number, dash: number, offsetShare: number) {
    const node = this.el[`${id}${this.ringShapeSuffix()}`] as SVGGraphicsElement;
    if (share <= 0) {
      node.style.display = 'none';
      return;
    }
    node.style.display = '';
    const len = this.ringPerimeter;
    node.setAttribute('stroke-dasharray', `${dash * len} ${len - dash * len}`);
    node.setAttribute('stroke-dashoffset', `${len * this.ringStartFraction - offsetShare * len}`);
  }
}

/** Render the diagram into `host` (a shadow root is attached to it). */
export function createPowerFlow(
  host: HTMLElement,
  options: PowerFlowOptions,
): PowerFlow {
  return new PowerFlow(host, options);
}
