import type {
  FlowColors,
  FlowLabels,
  FlowIcons,
  FlowTopology,
  PowerFlowOptions,
} from './types';
import { DEFAULT_COLORS, DEFAULT_LABELS, DEFAULT_ICONS, DEFAULT_TOPOLOGY } from './defaults';
import { computeFlowAllocation } from './flow-allocation';
import { CSS, SKELETON, DOTS, DOT_CLS_TO_COLOR_VAR, CURVES, trackIdFor } from './skeleton';

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

// Home arc: circumference for r=47 (inner ring of the home circle, r=52).
const ARC_LENGTH = 2 * Math.PI * 47; // ≈ 295.31

function formatWatts(watts: number): string {
  return Math.abs(watts) >= 1000
    ? `${(watts / 1000).toFixed(1)} kW`
    : `${Math.round(watts)} W`;
}

/** Translucent fill derived from a node's accent color. */
function tint(color: string): string {
  return `color-mix(in srgb, ${color} 15%, transparent)`;
}

/**
 * Framework-agnostic renderer for the energy-flow diagram. Renders into a
 * shadow root attached to the given host element, so its styles never leak.
 */
export class PowerFlow {
  // Fixed color for the consumer2/batteryLoad2 slot-conflict indicator — not
  // themable via FlowColors, since it signals a data misconfiguration
  // rather than a flow.
  private static readonly CONFLICT_COLOR = '#ef4444';

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
    { prefix: 'conflict', icon: 'conflict-icon', texts: ['t-conflict-lbl'] },
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
  private iconStyle: 'default' | 'full' = 'default';
  private dotShape: 'circle' | 'triangle' = 'circle';
  private curveBend = 1;
  // Tracks whether the consumer2/batteryLoad2 slot conflict was already active
  // last render, so the console warning fires once per transition into the
  // conflicting state rather than on every `update()` call.
  private hadSlotConflict = false;

  // Per-dot animation state. We drive the dots ourselves (requestAnimationFrame)
  // instead of SMIL so a speed change keeps each dot's position continuous —
  // SMIL would restart the motion from the path start on every `dur` change,
  // making the dots jump while a value is being dragged.
  private dots: Record<
    string,
    {
      circle: SVGCircleElement;
      // Triangle-shape variant of the same dot (dotShape: 'triangle') — the
      // <g> carries position+rotation (JS-set transform attribute), while
      // the polygon inside carries the shrink pop-in/out CSS transition (see
      // skeleton.ts's CSS comment on why these can't be the same element).
      triangleGroup: SVGGElement;
      trianglePolygon: SVGPolygonElement;
      path: SVGPathElement;
      length: number;
      speed: number; // px/s
      visible: boolean;
      shrinking: boolean; // true while the shrink-out CSS transition plays
      prog: number; // 0..1 along the path
      reverse: boolean; // travel from path end to start
      hideTimer?: ReturnType<typeof setTimeout>;
    }
  > = {};
  private raf = 0;
  private lastTime = 0;

  constructor(host: HTMLElement, options: PowerFlowOptions) {
    this.root = host.shadowRoot ?? host.attachShadow({ mode: 'open' });
    this.root.innerHTML = `<style>${CSS}</style>${SKELETON}`;
    this.svg = this.root.querySelector('svg')!;
    this.cacheRefs();
    this.initDots();
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
      const circle = this.el[`dot-${d.id}`] as SVGCircleElement;
      const triangleGroup = this.el[`dot-tri-${d.id}`] as SVGGElement;
      const trianglePolygon = triangleGroup.querySelector('polygon')!;
      circle.style.display = 'none';
      triangleGroup.style.display = 'none';
      this.dots[d.id] = {
        circle,
        triangleGroup,
        trianglePolygon,
        path,
        length: path.getTotalLength(),
        speed: 0,
        visible: false,
        shrinking: false,
        prog: Math.random(), // stagger start positions
        reverse: d.reverse ?? false,
      };
    }
  }

  // The marker element currently shown for a dot (its `display` is toggled
  // in setDot()), depending on the active dotShape.
  private activeMarker(s: PowerFlow['dots'][string]): SVGGraphicsElement {
    return this.dotShape === 'triangle' ? s.triangleGroup : s.circle;
  }

  // The element that actually gets the `.shrunk` pop-in/out class — for
  // triangles that's the inner polygon, not the position/rotation-carrying
  // <g> (see the `dots` field comment above for why).
  private shrinkTarget(s: PowerFlow['dots'][string]): Element {
    return this.dotShape === 'triangle' ? s.trianglePolygon : s.circle;
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
      const bg = this.el[`${prefix}-bg`] as SVGCircleElement | undefined;
      if (!bg) continue;
      const cx = Number(bg.getAttribute('cx'));
      const cy = Number(bg.getAttribute('cy'));
      const r = Number(bg.getAttribute('r'));
      const size = r * 1.5;
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

  // Scales each of the 6 curved tracks' *tangent handles* — P1 relative to
  // P0, P2 relative to P3 — by `bend`, keeping their direction fixed. This
  // keeps the departure/arrival directions exactly as designed (e.g. "leaves
  // solar straight down, arrives at home straight across") at every bend
  // level, only changing how long the curve holds that direction before
  // turning: bend=0 collapses both handles onto their anchor point, which
  // degenerates the cubic bezier into the straight P0→P3 line; bend=1
  // reproduces today's static `d` values exactly (the handles are already at
  // that today's exact length); bend>1 stretches the handles further out,
  // reading as a straighter departure/arrival with a sharper turn in the
  // middle, rather than one continuously bulging arc.
  private applyCurveBend() {
    const bend = this.curveBend;
    for (const { id, p0, p1, p2, p3 } of CURVES) {
      const path = this.el[id] as SVGPathElement | undefined;
      if (!path) continue;
      const b1x = p0[0] + bend * (p1[0] - p0[0]);
      const b1y = p0[1] + bend * (p1[1] - p0[1]);
      const b2x = p3[0] + bend * (p2[0] - p3[0]);
      const b2y = p3[1] + bend * (p2[1] - p3[1]);
      path.setAttribute('d', `M${p0[0]},${p0[1]} C${b1x},${b1y} ${b2x},${b2y} ${p3[0]},${p3[1]}`);
    }
    // Changing `d` changes each affected path's total length — every dot's
    // cached `length` (measured once in initDots()) would otherwise go stale
    // and skew its speed/position math. `s.prog` is a 0..1 fraction, so
    // refreshing `length` here doesn't cause any jump.
    for (const id in this.dots) {
      const s = this.dots[id];
      s.length = s.path.getTotalLength();
    }
  }

  // How far (in px along the path) placeDot() samples on either side of a
  // triangle dot's position to find its direction of travel.
  private static readonly TANGENT_SAMPLE_PX = 0.5;

  // Position along the path for a dot's current progress, honouring `reverse`.
  // For triangle dots, also orients the arrowhead along its direction of
  // travel — found via a central-difference sample around the current
  // position, so it's correct for both `reverse` and non-`reverse` dots (and
  // for paths shared by both directions, like p-bat-grid) without needing to
  // special-case `reverse` itself.
  private placeDot(s: PowerFlow['dots'][string]) {
    const at = s.reverse ? 1 - s.prog : s.prog;
    const currentLen = at * s.length;
    const p = s.path.getPointAtLength(currentLen);
    if (this.dotShape === 'triangle') {
      const dir = s.reverse ? -1 : 1;
      const d = PowerFlow.TANGENT_SAMPLE_PX;
      const ahead = s.path.getPointAtLength(
        Math.max(0, Math.min(s.length, currentLen + dir * d)),
      );
      const behind = s.path.getPointAtLength(
        Math.max(0, Math.min(s.length, currentLen - dir * d)),
      );
      const angle = (Math.atan2(ahead.y - behind.y, ahead.x - behind.x) * 180) / Math.PI;
      s.triangleGroup.setAttribute('transform', `translate(${p.x} ${p.y}) rotate(${angle})`);
    } else {
      s.circle.setAttribute('cx', String(p.x));
      s.circle.setAttribute('cy', String(p.y));
    }
  }

  // Single animation loop for all dots. Advances each visible dot along its path
  // by speed·dt, wrapping at the end. dt is capped so returning from a
  // background tab doesn't teleport the dots.
  private tick = (now: number) => {
    const dt = Math.min((now - this.lastTime) / 1000, 0.05);
    this.lastTime = now;
    for (const id in this.dots) {
      const s = this.dots[id];
      if ((!s.visible && !s.shrinking) || s.length === 0) continue;
      s.prog += (s.speed * dt) / s.length;
      s.prog -= Math.floor(s.prog); // wrap into [0, 1)
      this.placeDot(s);
    }
    this.raf = requestAnimationFrame(this.tick);
  };

  /** Re-render with new data / colors / labels / icons / speedScale. Cheap to call frequently. */
  update(options: PowerFlowOptions) {
    const data = options.data;
    if (options.colors !== undefined) {
      this.colors = { ...DEFAULT_COLORS, ...options.colors };
    }
    if (options.labels !== undefined) {
      this.labels = { ...DEFAULT_LABELS, ...options.labels };
    }
    if (options.icons !== undefined) {
      this.icons = { ...DEFAULT_ICONS, ...options.icons };
    }
    if (options.speedScale !== undefined) {
      this.speedScale = options.speedScale;
    }
    if (options.topology !== undefined) {
      this.topology = { ...DEFAULT_TOPOLOGY, ...options.topology };
    }
    if (options.iconStyle !== undefined) {
      this.iconStyle = options.iconStyle;
    }
    if (options.curveBend !== undefined) {
      this.curveBend = Math.max(0, Math.min(2.0, options.curveBend));
    }
    if (options.dotShape !== undefined && options.dotShape !== this.dotShape) {
      this.swapDotShape(options.dotShape);
    }
    this.applyIconStyle();
    this.applyCurveBend();
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

    // ViewBox: include the top row (solar / consumer1 / consumer3, edge y=8)
    // and/or the bottom row (battery / consumer2 / consumer4 / batteryLoad1 /
    // batteryLoad2, edge y=362) only when something occupies it, with an 8px
    // margin. Absent rows are trimmed so the diagram never has a large empty
    // band — e.g. grid+home+battery starts at the middle row. The 4th
    // column (consumer3/consumer4, at x=490) only widens the viewBox when
    // actually used.
    const hasTop = hasSolar || hasConsumer1 || hasConsumer3;
    const hasBottom = hasBattery || hasConsumer2 || hasConsumer4;
    const minY = hasTop ? 0 : 125; // middle row (cy 185, edge 133) − 8 margin
    const maxY = hasBottom ? 370 : 245; // battery edge 362 + 8 / home edge 237 + 8
    const width = hasConsumer3 || hasConsumer4 ? 545 : 400; // 4th column edge 542 (490+52) + 3, matching the existing 400 = 397 (345+52) + 3
    const height = maxY - minY;
    this.svg.setAttribute('viewBox', `0 ${minY} ${width} ${height}`);

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
    // one dot's `setDot` call clobbering the state the other just set.
    const trackActive: Record<string, string | null> = {};
    for (const d of DOTS) {
      const id = trackIdFor(d.path);
      const dotState = this.dots[d.id];
      if (dotState.visible) trackActive[id] = DOT_CLS_TO_COLOR_VAR[d.cls] ?? d.cls;
      else if (!(id in trackActive)) trackActive[id] = null;
    }
    for (const id in trackActive) {
      const colorVar = trackActive[id];
      const el = this.el[id] as SVGElement | undefined;
      if (!el) continue;
      el.classList.toggle('active', colorVar !== null);
      if (colorVar) el.style.setProperty('--track-color', `var(--sfd-${colorVar})`);
    }

    // ── Solar node ──
    if (hasSolar) {
      this.el['n-solar'].classList.toggle('dim', solarWatts === 0);
      this.fill('solar-bg', tint(colors.solar));
      this.stroke('solar-ring', colors.solar);
      this.fill('solar-icon', colors.solar);
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
    this.fill('grid-bg', tint(gridColor));
    this.stroke('grid-ring', gridColor);
    this.fill('grid-icon', gridColor);
    const gridVal = this.el['t-grid-val'] as SVGTextElement;
    gridVal.style.fill = gridColor;
    gridVal.textContent = `${gridWatts >= 0 ? '→' : '←'} ${formatWatts(Math.abs(gridWatts))}`;
    this.labelText('t-grid-lbl', labels.grid);

    // ── Home node ──
    this.fill('home-bg', tint(colors.home));
    this.stroke('home-ring', colors.home);
    this.fill('home-icon', colors.home);
    this.text('t-home-val', formatWatts(loadWatts));
    this.labelText('t-home-lbl', labels.home);

    // ── Battery node ── (colour follows charge/discharge, like the grid node)
    if (hasBattery) {
      const batteryColor =
        batteryWatts < 0 ? colors.batteryIn : colors.batteryOut;
      this.fill('bat-bg', tint(batteryColor));
      this.stroke('bat-ring', batteryColor);
      this.fill('bat-icon', batteryColor);
      const soc = this.el['t-bat-soc'] as SVGTextElement;
      soc.style.display = data.batterySoc != null ? '' : 'none';
      if (data.batterySoc != null)
        soc.textContent = `${Math.round(data.batterySoc)} %`;
      const watts = this.el['t-bat-watts'] as SVGTextElement;
      watts.style.fill = batteryColor;
      watts.textContent = `${batteryWatts >= 0 ? '↑' : '↓'} ${formatWatts(Math.abs(batteryWatts))}`;
      this.labelText('t-bat-lbl', labels.battery);
      // SoC inner ring — progress arc from 12 o'clock clockwise.
      const socArc = this.el['bat-soc-arc'] as SVGCircleElement;
      socArc.style.stroke = batteryColor;
      const pct =
        data.batterySoc != null
          ? Math.max(0, Math.min(100, data.batterySoc)) / 100
          : 0;
      socArc.style.strokeDasharray = `${pct * ARC_LENGTH} ${ARC_LENGTH}`;
    }

    // ── Consumer 1 node (home consumer, top-left of its 2×2) ──
    if (hasConsumer1) {
      this.el['n-consumer1'].classList.toggle('dim', consumer1Watts === 0);
      this.fill('c1-bg', tint(colors.consumer1));
      this.stroke('c1-ring', colors.consumer1);
      this.fill('c1-icon', colors.consumer1);
      this.text('t-c1-val', formatWatts(consumer1Watts));
      this.labelText('t-c1-lbl', labels.consumer1);
    }

    // ── Consumer 2 node (home consumer, bottom-left of its 2×2) ──
    if (hasConsumer2) {
      this.el['n-consumer2'].classList.toggle('dim', consumer2Watts === 0);
      this.fill('c2-bg', tint(colors.consumer2));
      this.stroke('c2-ring', colors.consumer2);
      this.fill('c2-icon', colors.consumer2);
      this.text('t-c2-val', formatWatts(consumer2Watts));
      this.labelText('t-c2-lbl', labels.consumer2);
    }

    // ── Consumer 3 node (home consumer, top-right of its 2×2) ──
    if (hasConsumer3) {
      this.el['n-consumer3'].classList.toggle('dim', consumer3Watts === 0);
      this.fill('c3-bg', tint(colors.consumer3));
      this.stroke('c3-ring', colors.consumer3);
      this.fill('c3-icon', colors.consumer3);
      this.text('t-c3-val', formatWatts(consumer3Watts));
      this.labelText('t-c3-lbl', labels.consumer3);
    }

    // ── Consumer 4 node (home consumer, bottom-right of its 2×2) ──
    if (hasConsumer4) {
      this.el['n-consumer4'].classList.toggle('dim', consumer4Watts === 0);
      this.fill('c4-bg', tint(colors.consumer4));
      this.stroke('c4-ring', colors.consumer4);
      this.fill('c4-icon', colors.consumer4);
      this.text('t-c4-val', formatWatts(consumer4Watts));
      this.labelText('t-c4-lbl', labels.consumer4);
    }

    // ── Battery load 1 node ──
    if (hasBatteryLoad) {
      this.el['n-batteryload1'].classList.toggle('dim', batteryLoad1Watts === 0);
      this.fill('bl1-bg', tint(colors.batteryLoad1));
      this.stroke('bl1-ring', colors.batteryLoad1);
      this.fill('bl1-icon', colors.batteryLoad1);
      this.text('t-bl1-val', formatWatts(batteryLoad1Watts));
      this.labelText('t-bl1-lbl', labels.batteryLoad1);
    }

    // ── Battery load 2 node ──
    if (hasBatteryLoad2) {
      this.el['n-batteryload2'].classList.toggle(
        'dim',
        batteryLoad2Watts === 0,
      );
      this.fill('bl2-bg', tint(colors.batteryLoad2));
      this.stroke('bl2-ring', colors.batteryLoad2);
      this.fill('bl2-icon', colors.batteryLoad2);
      this.text('t-bl2-val', formatWatts(batteryLoad2Watts));
      this.labelText('t-bl2-lbl', labels.batteryLoad2);
    }

    // ── Slot conflict indicator — fixed colors, not user-configurable, since
    // it signals a data misconfiguration rather than a themable flow. ──
    if (hasSlotConflict) {
      this.fill('conflict-bg', tint(PowerFlow.CONFLICT_COLOR));
      this.stroke('conflict-ring', PowerFlow.CONFLICT_COLOR);
      this.fill('conflict-icon', PowerFlow.CONFLICT_COLOR);
    }
  }

  /** Remove the rendered diagram from its host and stop the animation loop. */
  destroy() {
    cancelAnimationFrame(this.raf);
    for (const s of Object.values(this.dots)) {
      if (s.hideTimer) clearTimeout(s.hideTimer);
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

  // Show/hide a dot and set its speed. Only the speed changes on a value update
  // — the rAF loop keeps the position continuous, so dragging a slider never
  // makes the dot jump back to the start.
  private setDot(id: string, visible: boolean, watts: number) {
    const s = this.dots[id];
    const marker = this.activeMarker(s);
    const shrinkEl = this.shrinkTarget(s);
    if (visible) {
      s.speed = this.flowSpeed(watts, s.length);
      if (!s.visible) {
        // Pop in: position first, show at scale(0), force reflow, then spring to full size.
        if (s.hideTimer) { clearTimeout(s.hideTimer); s.hideTimer = undefined; }
        s.visible = true;
        s.shrinking = false;
        this.placeDot(s);
        shrinkEl.classList.add('shrunk');
        marker.style.display = '';
        requestAnimationFrame(() => requestAnimationFrame(() => {
          if (s.visible) shrinkEl.classList.remove('shrunk');
        }));
      }
    } else if (s.visible) {
      // Shrink out: keep moving while scaling to 0, then hide after the transition.
      s.visible = false;
      s.shrinking = true;
      shrinkEl.classList.add('shrunk');
      s.hideTimer = setTimeout(() => {
        marker.style.display = 'none';
        shrinkEl.classList.remove('shrunk');
        s.shrinking = false;
        s.hideTimer = undefined;
      }, 200);
    }
  }

  // Live-swaps which marker shape is shown for every currently visible or
  // shrinking dot, so toggling dotShape mid-animation doesn't leave a dot
  // stuck invisible (old shape hidden, new shape never shown) or duplicated
  // (both shapes visible at once).
  private swapDotShape(newShape: 'circle' | 'triangle') {
    for (const id in this.dots) {
      const s = this.dots[id];
      if (!s.visible && !s.shrinking) continue;
      this.activeMarker(s).style.display = 'none';
      this.shrinkTarget(s).classList.remove('shrunk');
    }
    this.dotShape = newShape;
    for (const id in this.dots) {
      const s = this.dots[id];
      if (!s.visible && !s.shrinking) continue;
      this.activeMarker(s).style.display = '';
      this.placeDot(s);
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

  // Render a share (0..1) as a dash arc on the home ring, offset by the share
  // already drawn before it.
  private arc(id: string, share: number, dash: number, offsetShare: number) {
    const node = this.el[id] as SVGCircleElement;
    if (share <= 0) {
      node.style.display = 'none';
      return;
    }
    node.style.display = '';
    node.setAttribute(
      'stroke-dasharray',
      `${dash * ARC_LENGTH} ${ARC_LENGTH - dash * ARC_LENGTH}`,
    );
    node.setAttribute(
      'stroke-dashoffset',
      `${ARC_LENGTH * 0.25 - offsetShare * ARC_LENGTH}`,
    );
  }
}

/** Render the diagram into `host` (a shadow root is attached to it). */
export function createPowerFlow(
  host: HTMLElement,
  options: PowerFlowOptions,
): PowerFlow {
  return new PowerFlow(host, options);
}
