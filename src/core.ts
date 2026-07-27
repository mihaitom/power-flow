import type {
  FlowColors,
  FlowLabels,
  FlowIcons,
  FlowTopology,
  PowerFlowOptions,
} from './types';
import { DEFAULT_COLORS, DEFAULT_LABELS, DEFAULT_ICONS, DEFAULT_TOPOLOGY } from './defaults';
import { computeFlowAllocation } from './flow-allocation';
import { CSS, SKELETON, DOTS, DOT_CLS_TO_COLOR_VAR, trackIdFor } from './skeleton';

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
  private root: ShadowRoot;
  private svg!: SVGSVGElement;
  private el: Record<string, Element> = {};
  private colors: FlowColors = DEFAULT_COLORS;
  private labels: FlowLabels = DEFAULT_LABELS;
  private icons: FlowIcons = { ...DEFAULT_ICONS };
  private topology: FlowTopology = DEFAULT_TOPOLOGY;
  private speedScale = 1;

  // Per-dot animation state. We drive the dots ourselves (requestAnimationFrame)
  // instead of SMIL so a speed change keeps each dot's position continuous —
  // SMIL would restart the motion from the path start on every `dur` change,
  // making the dots jump while a value is being dragged.
  private dots: Record<
    string,
    {
      circle: SVGCircleElement;
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
      circle.style.display = 'none';
      this.dots[d.id] = {
        circle,
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

  // Position along the path for a dot's current progress, honouring `reverse`.
  private placeDot(s: PowerFlow['dots'][string]) {
    const at = s.reverse ? 1 - s.prog : s.prog;
    const p = s.path.getPointAtLength(at * s.length);
    s.circle.setAttribute('cx', String(p.x));
    s.circle.setAttribute('cy', String(p.y));
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
    const { colors, labels, icons, topology: topo } = this;

    this.setIconPath('solar-icon', icons.solar);
    this.setIconPath('grid-icon', icons.grid);
    this.setIconPath('home-icon', icons.home);
    this.setIconPath('bat-icon', icons.battery);
    this.setIconPath('wb-icon', icons.wallbox);
    this.setIconPath('wb4-icon', icons.wallbox);
    this.setIconPath('wb2-icon', icons.wallbox2);
    this.setIconPath('bl-icon', icons.batteryLoad);
    this.setIconPath('bl2-icon', icons.batteryLoad2);

    const solarWatts = data.solar ?? 0;
    const gridWatts = data.grid ?? 0;
    const loadWatts = data.load ?? 0;
    const batteryWatts = data.battery ?? 0;
    const wallboxWatts = data.wallbox ?? 0;
    const wallbox2Watts = data.wallbox2 ?? 0;
    const batteryLoadWatts = data.batteryLoad ?? 0;
    const batteryLoad2Watts = data.batteryLoad2 ?? 0;
    const hasSolar = data.solar != null;
    const hasBattery = data.battery != null;
    const hasWallbox = data.wallbox != null;
    const hasWallbox2 = data.wallbox2 != null;
    const hasBatteryLoad = data.batteryLoad != null;
    const hasBatteryLoad2 = data.batteryLoad2 != null;

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

    // ViewBox: include the top row (solar / wallbox 2, edge y=8) and/or the
    // bottom row (battery / wallbox / batteryLoad / batteryLoad2, edge y=362)
    // only when something occupies it, with an 8px margin. Absent rows are
    // trimmed so the diagram never has a large empty band — e.g.
    // grid+home+battery starts at the middle row.
    //
    // batteryLoad and batteryLoad2 always have a permanent slot in the
    // bottom row — never a new row. If wallbox would otherwise collide with
    // batteryLoad2's slot (345,310), wallbox moves to a 4th column (490,310)
    // instead, widening the viewBox rather than heightening it.
    const hasTop = hasSolar || hasWallbox2;
    const hasBottom = hasBattery || hasWallbox;
    const wallboxNeedsColumn4 = hasWallbox && hasBattery && hasBatteryLoad2;
    const minY = hasTop ? 0 : 125; // middle row (cy 185, edge 133) − 8 margin
    const maxY = hasBottom ? 370 : 245; // battery edge 362 + 8 / home edge 237 + 8
    const width = wallboxNeedsColumn4 ? 545 : 400; // 4th column edge 542 (490+52) + 3, matching the existing 400 = 397 (345+52) + 3
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
    style.setProperty('--sfd-wallbox', colors.wallbox);
    style.setProperty('--sfd-wallbox2', colors.wallbox2);
    style.setProperty('--sfd-battery-load', colors.batteryLoad);
    style.setProperty('--sfd-battery-load2', colors.batteryLoad2);

    // Topology: show/hide the optional nodes (each tagged with a matching
    // data-topo attribute).
    this.setTopo('solar', hasSolar);
    this.setTopo('battery', hasBattery);
    // batteryLoad/batteryLoad2 are sub-consumers of the battery's discharge,
    // so they're meaningless (and hidden) without a battery, even if a
    // caller sets a batteryLoad value without a battery value.
    this.setTopo('batteryLoad', hasBattery && hasBatteryLoad);
    this.setTopo('batteryLoad2', hasBattery && hasBatteryLoad2);
    // Wallbox normally sits at (345,310); it yields that slot to batteryLoad2
    // and moves to a 4th column instead when both are active.
    this.setTopo('wallbox', hasWallbox && !wallboxNeedsColumn4);
    this.setTopo('wallbox4', wallboxNeedsColumn4);
    this.setTopo('wallbox2', hasWallbox2);

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
      'home-wallbox',
      hasWallbox && !wallboxNeedsColumn4 && wallboxWatts > 0,
      wallboxWatts,
    );
    this.setDot(
      'home-wallbox4',
      wallboxNeedsColumn4 && wallboxWatts > 0,
      wallboxWatts,
    );
    this.setDot(
      'home-wallbox2',
      hasWallbox2 && wallbox2Watts > 0,
      wallbox2Watts,
    );
    this.setDot(
      'bat-batteryload',
      hasBattery && hasBatteryLoad && batteryLoadWatts > 0,
      batteryLoadWatts,
    );
    this.setDot(
      'bat-batteryload2',
      hasBattery && hasBatteryLoad2 && batteryLoad2Watts > 0,
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

    // ── Wallbox node — render both static variants (default + 4th-column
    // fallback); setTopo above decides which one is actually visible. ──
    if (hasWallbox) {
      this.el['n-wallbox'].classList.toggle('dim', wallboxWatts === 0);
      this.fill('wb-bg', tint(colors.wallbox));
      this.stroke('wb-ring', colors.wallbox);
      this.fill('wb-icon', colors.wallbox);
      this.text('t-wb-val', formatWatts(wallboxWatts));
      this.labelText('t-wb-lbl', labels.wallbox);

      this.el['n-wallbox4'].classList.toggle('dim', wallboxWatts === 0);
      this.fill('wb4-bg', tint(colors.wallbox));
      this.stroke('wb4-ring', colors.wallbox);
      this.fill('wb4-icon', colors.wallbox);
      this.text('t-wb4-val', formatWatts(wallboxWatts));
      this.labelText('t-wb4-lbl', labels.wallbox);
    }

    // ── Wallbox 2 node (above the house) ──
    if (hasWallbox2) {
      this.el['n-wallbox2'].classList.toggle('dim', wallbox2Watts === 0);
      this.fill('wb2-bg', tint(colors.wallbox2));
      this.stroke('wb2-ring', colors.wallbox2);
      this.fill('wb2-icon', colors.wallbox2);
      this.text('t-wb2-val', formatWatts(wallbox2Watts));
      this.labelText('t-wb2-lbl', labels.wallbox2);
    }

    // ── Battery load 1 node ──
    if (hasBatteryLoad) {
      this.el['n-batteryload'].classList.toggle('dim', batteryLoadWatts === 0);
      this.fill('bl-bg', tint(colors.batteryLoad));
      this.stroke('bl-ring', colors.batteryLoad);
      this.fill('bl-icon', colors.batteryLoad);
      this.text('t-bl-val', formatWatts(batteryLoadWatts));
      this.labelText('t-bl-lbl', labels.batteryLoad);
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
  // for wallbox/wallbox2/batteryLoad/batteryLoad2, its non-configurable track
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
    if (visible) {
      s.speed = this.flowSpeed(watts, s.length);
      if (!s.visible) {
        // Pop in: position first, show at scale(0), force reflow, then spring to full size.
        if (s.hideTimer) { clearTimeout(s.hideTimer); s.hideTimer = undefined; }
        s.visible = true;
        s.shrinking = false;
        this.placeDot(s);
        s.circle.classList.add('shrunk');
        s.circle.style.display = '';
        requestAnimationFrame(() => requestAnimationFrame(() => {
          if (s.visible) s.circle.classList.remove('shrunk');
        }));
      }
    } else if (s.visible) {
      // Shrink out: keep moving while scaling to 0, then hide after the transition.
      s.visible = false;
      s.shrinking = true;
      s.circle.classList.add('shrunk');
      s.hideTimer = setTimeout(() => {
        s.circle.style.display = 'none';
        s.circle.classList.remove('shrunk');
        s.shrinking = false;
        s.hideTimer = undefined;
      }, 200);
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
