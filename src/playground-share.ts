import {
  mdiLanguageHtml5,
  mdiLanguageTypescript,
  mdiReact,
  mdiAngular,
  mdiVuejs,
  mdiCodeBraces,
} from '@mdi/js';
import {
  el,
  inp,
  hasSolar,
  hasBat,
  hasC1,
  hasC2,
  hasC3,
  hasC4,
  hasBl1,
  hasBl2,
  topoInp,
  TOPOLOGY_KEYS,
} from './playground-dom';
import { cinp, DEFAULT_COLORS, applyColors } from './playground-colors';
import { currentIcons, DEFAULT_ICONS, ICON_NAMES } from './playground-icons';
import { currentLabels, APPLIANCE_ICON_NAMES } from './playground-appliances';
import {
  updateLoadMin,
  updateGrid,
  speedInp,
  vSpeed,
  iconStyleInp,
  batteryChargeHighlightInp,
  trackPulseInp,
  curveBendInp,
  vCurveBend,
  sliderToCurveBend,
  curveBendToSlider,
  dotCountInp,
  vDotCount,
  rowGapInp,
  vRowGap,
  columnGapInp,
  vColumnGap,
  currentNodeStyle,
  setNodeStyle,
  currentNodeShape,
  setNodeShape,
  currentDotShape,
  setDotShape,
} from './playground-state';

// Consumer-slot keys whose icon/label are only meaningful while the slot's
// own checkbox is on — used to keep the generated `icons`/`labels` snippets
// (and the shuffle results they draw from) from listing entries for
// currently-disabled consumers.
const SLOT_HAS: Record<string, HTMLInputElement> = {
  consumer1: hasC1,
  consumer2: hasC2,
  consumer3: hasC3,
  consumer4: hasC4,
  batteryLoad1: hasBl1,
  batteryLoad2: hasBl2,
};

const ALL_ICON_NAMES = { ...ICON_NAMES, ...APPLIANCE_ICON_NAMES };

declare const hljs: {
  highlight: (code: string, opts: { language: string }) => { value: string };
};

// ── Install section ───────────────────────────────────────────────────────────
const PKG_MANAGERS = [
  { id: "npm",  cmd: "npm install powerflow" },
  { id: "pnpm", cmd: "pnpm add powerflow"    },
  { id: "bun",  cmd: "bun add powerflow"     },
  { id: "yarn", cmd: "yarn add powerflow"    },
];
let activePm = PKG_MANAGERS[0].id;
const pmTabsEl    = document.getElementById("pm-tabs")      as HTMLElement;
const installCmdEl = document.getElementById("install-cmd") as HTMLElement;

PKG_MANAGERS.forEach(({ id, cmd }, i) => {
  const b = document.createElement("button");
  b.textContent = id;
  if (i === 0) b.classList.add("on");
  b.addEventListener("click", () => {
    pmTabsEl.querySelectorAll("button").forEach(x => x.classList.remove("on"));
    b.classList.add("on");
    activePm = id;
    installCmdEl.textContent = cmd;
  });
  pmTabsEl.appendChild(b);
});
installCmdEl.textContent = PKG_MANAGERS[0].cmd;

(document.getElementById("copy-install") as HTMLElement).addEventListener("click", () => {
  const copyInstallBtn = document.getElementById("copy-install") as HTMLElement;
  const pm = PKG_MANAGERS.find(p => p.id === activePm)!;
  navigator.clipboard.writeText(pm.cmd).then(() => {
    copyInstallBtn.textContent = "Copied!";
    setTimeout(() => { copyInstallBtn.textContent = "Copy"; }, 1500);
  });
});

// ── Code modal ────────────────────────────────────────────────────────────────
const codeDialog = document.getElementById('code-dialog') as HTMLDialogElement;
let activeFw = 'html';

// `viewBox` defaults to the icon's native 24×24 box; a few MDI glyphs (the
// TypeScript "TS" badge) are drawn
// inset within that box — at a shared render size it'd look noticeably
// smaller than the edge-to-edge logos, so those crop to their own ink
// bounds (both happen to sit at 3,3–21,21) to fill the same visual size.
const FW_TABS = [
  { fw: 'html', label: 'HTML', icon: mdiLanguageHtml5 },
  { fw: 'ts', label: 'TypeScript', icon: mdiLanguageTypescript, viewBox: '3 3 18 18' },
  { fw: 'react', label: 'React', icon: mdiReact },
  { fw: 'angular', label: 'Angular', icon: mdiAngular },
  { fw: 'vue', label: 'Vue 3', icon: mdiVuejs },
  { fw: 'svelte', label: 'Svelte', icon: mdiCodeBraces },
];
const FW_LANG: Record<string, string> = {
  html: 'html',
  ts: 'typescript',
  react: 'javascript',
  angular: 'typescript',
  vue: 'html',
  svelte: 'html',
};

const fwTabsEl = document.getElementById('fw-tabs') as HTMLElement;
FW_TABS.forEach(({ fw, label, icon, viewBox }, i) => {
  const b = document.createElement('button');
  b.dataset.fw = fw;
  b.innerHTML = `<svg viewBox="${viewBox ?? '0 0 24 24'}" width="18" height="18" style="vertical-align:-4px;margin-right:4px;"><path d="${icon}" fill="currentColor"/></svg>${label}`;
  if (i === 0) b.classList.add('on');
  b.addEventListener('click', () => {
    fwTabsEl
      .querySelectorAll('button')
      .forEach((x) => x.classList.remove('on'));
    b.classList.add('on');
    activeFw = fw;
    refreshCode();
  });
  fwTabsEl.appendChild(b);
});

function jsObj(obj: Record<string, unknown>, pad: string): string {
  const inner = Object.entries(obj)
    .map(([k, v]) => `${pad}  ${k}: ${JSON.stringify(v)}`)
    .join(',\n');
  return `{\n${inner},\n${pad}}`;
}

function buildSnippet(fw: string): string {
  const data: Record<string, unknown> = {
    grid: +inp.grid.value,
    load: +inp.load.value,
  };
  if (hasSolar.checked) data.solar = +inp.solar.value;
  if (hasBat.checked) {
    data.battery = +inp.battery.value;
    data.batterySoc = +inp.soc.value;
  }
  if (hasC1.checked) data.consumer1 = +inp.consumer1.value;
  if (hasC2.checked) data.consumer2 = +inp.consumer2.value;
  if (hasC3.checked) data.consumer3 = +inp.consumer3.value;
  if (hasC4.checked) data.consumer4 = +inp.consumer4.value;
  if (hasBl1.checked) data.batteryLoad1 = +inp.batteryLoad1.value;
  if (hasBl2.checked) data.batteryLoad2 = +inp.batteryLoad2.value;

  const changedTopology = Object.fromEntries(
    TOPOLOGY_KEYS.filter((k) => !topoInp[k].checked).map((k) => [k, false]),
  );

  const changedColors = Object.fromEntries(
    Object.entries(cinp)
      .filter(
        ([k, i]) => i.value.toLowerCase() !== DEFAULT_COLORS[k].toLowerCase(),
      )
      .map(([k, i]) => [k, i.value]),
  );

  const changedIconEntries = Object.entries(currentIcons).filter(
    ([k, v]) => v !== DEFAULT_ICONS[k] && (SLOT_HAS[k]?.checked ?? true),
  );
  const hasIcons = changedIconEntries.length > 0;
  const iconConstNames = changedIconEntries.map(([, v]) => ALL_ICON_NAMES[v]).filter(Boolean);
  const iconObjStr = (pad: string) => {
    const inner = changedIconEntries
      .map(([k, v]) => `${pad}  ${k}: ${ALL_ICON_NAMES[v] ?? JSON.stringify(v)}`)
      .join(',\n');
    return `{\n${inner},\n${pad}}`;
  };

  const activeLabels = currentLabels
    ? Object.fromEntries(
        Object.entries(currentLabels).filter(([k]) => SLOT_HAS[k]?.checked ?? true),
      )
    : null;

  // The `data`/`options` object literals shared by every framework's
  // snippet — `pad` is the indent level the *contents* of each literal sit
  // at (i.e. what `jsObj` expects: entries one level deeper, closing brace
  // at `pad`). `optionsLiteral` is `null` when nothing needs overriding, so
  // callers can skip the field/binding entirely rather than emit `options: {}`.
  const buildParts = (pad: string): { dataLiteral: string; optionsLiteral: string | null } => {
    const dataLiteral = jsObj(data, pad);

    // Everything besides `data` — colors, labels, icons, topology and the
    // presentation tuning knobs — nests under a single `options` object.
    const optInner = pad + '  ';
    const optFields: string[] = [];
    if (Object.keys(changedColors).length)
      optFields.push(`${optInner}colors: ${jsObj(changedColors, optInner)}`);
    if (hasIcons)
      optFields.push(`${optInner}icons: ${iconObjStr(optInner)}`);
    if (activeLabels && Object.keys(activeLabels).length)
      optFields.push(`${optInner}labels: ${jsObj(activeLabels, optInner)}`);
    if (Object.keys(changedTopology).length)
      optFields.push(`${optInner}topology: ${jsObj(changedTopology, optInner)}`);
    if (+speedInp.value !== 1)
      optFields.push(`${optInner}speedScale: ${+speedInp.value}`);
    if (currentNodeStyle !== 'soft')
      optFields.push(`${optInner}nodeStyle: "${currentNodeStyle}"`);
    if (currentNodeShape !== 'circle')
      optFields.push(`${optInner}nodeShape: "${currentNodeShape}"`);
    if (iconStyleInp.checked) optFields.push(`${optInner}iconStyle: "full"`);
    if (currentDotShape !== 'circle')
      optFields.push(`${optInner}dotShape: "${currentDotShape}"`);
    if (!batteryChargeHighlightInp.checked)
      optFields.push(`${optInner}batteryChargeHighlight: false`);
    if (trackPulseInp.checked) optFields.push(`${optInner}trackPulse: true`);
    const curveBendVal = sliderToCurveBend(+curveBendInp.value);
    // Epsilon, not strict equality — the slider<->curveBend mapping is a
    // sqrt()/pow() round-trip (see sliderToCurveBend()), which can leave the
    // default a hair off exactly 1 in floating point even when untouched.
    if (Math.abs(curveBendVal - 1) > 1e-6) optFields.push(`${optInner}curveBend: ${curveBendVal}`);
    if (+dotCountInp.value !== 1)
      optFields.push(`${optInner}dotCount: ${+dotCountInp.value}`);
    if (+rowGapInp.value !== 125)
      optFields.push(`${optInner}rowGap: ${+rowGapInp.value}`);
    if (+columnGapInp.value !== 145)
      optFields.push(`${optInner}columnGap: ${+columnGapInp.value}`);
    const optionsLiteral = optFields.length
      ? `{\n${optFields.join(',\n')},\n${pad}}`
      : null;

    return { dataLiteral, optionsLiteral };
  };

  const buildFields = (pad: string): string[] => {
    const { dataLiteral, optionsLiteral } = buildParts(pad);
    const fields = [`${pad}data: ${dataLiteral}`];
    if (optionsLiteral) fields.push(`${pad}options: ${optionsLiteral}`);
    return fields;
  };

  // One combined Object.assign(...) call instead of a separate `pfVar.x = y;`
  // line per option — Object.assign still invokes each property's own setter
  // in order (same runtime effect), just as one statement. Used for HTML and
  // React, which (unlike Angular/Svelte/Vue) can't bind object-valued props
  // to a custom element declaratively — React < 19's JSX only sets string
  // attributes on unknown tags, and plain HTML has no binding system at all.
  const assign = (pfVar: string, pad: string): string => {
    const fields = buildFields(pad + '  ');
    return `${pad}Object.assign(${pfVar}, {\n${fields.join(',\n')},\n${pad}});`;
  };

  // Same fields, but as the object literal returned from Vue's Options-API
  // `data()` — `pad` is the indent level of the `return {`/`}` lines.
  const dataObj = (pad: string): string => {
    const fields = buildFields(pad + '  ');
    return `{\n${fields.join(',\n')},\n${pad}}`;
  };

  const mdiImport = hasIcons ? `import { ${iconConstNames.join(', ')} } from '@mdi/js';\n` : '';
  const mdiImportHtml = hasIcons ? `  import { ${iconConstNames.join(', ')} } from 'https://esm.sh/@mdi/js';\n` : '';

  if (fw === 'html')
    return `<script type="module" src="https://unpkg.com/powerflow"><\/script>

<power-flow id="pf"><\/power-flow>

<script type="module">
${mdiImportHtml}  const pf = document.getElementById("pf");
${assign('pf', '  ')}
<\/script>`;

  if (fw === 'ts') {
    // No custom element at all — `createPowerFlow` renders straight into a
    // host element's shadow root, fully typed (`FlowData`/`PowerFlowOptions`).
    const fields = buildFields('  ');
    return `import { createPowerFlow } from "powerflow";
${mdiImport}
const pf = createPowerFlow(document.getElementById("box")!, {
${fields.join(',\n')},
});

// pf.update({ data: nextData }); // cheap, call as often as you like
// pf.destroy();`;
  }

  if (fw === 'react')
    return `import "powerflow";
${mdiImport}import { useRef, useEffect } from "react";

export function PowerFlowWidget() {
  const ref = useRef(null);
  useEffect(() => {
    const pf = ref.current;
${assign('pf', '    ')}
  }, []);
  return <power-flow ref={ref} />;
}`;

  if (fw === 'angular') {
    // Angular's template compiler can bind object-valued properties straight
    // onto a custom element (`[prop]="expr"`) once it knows to allow unknown
    // tags — no ViewChild/nativeElement detour needed.
    const { dataLiteral, optionsLiteral } = buildParts('  ');
    const optionsBinding = optionsLiteral ? ' [options]="options"' : '';
    const optionsField = optionsLiteral ? `\n  options = ${optionsLiteral};` : '';
    return `import "powerflow";
${mdiImport}import { Component, CUSTOM_ELEMENTS_SCHEMA } from "@angular/core";

@Component({
  selector: "app-power-flow",
  template: \`<power-flow [data]="data"${optionsBinding}></power-flow>\`,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class PowerFlowComponent {
  data = ${dataLiteral};${optionsField}
}`;
  }

  if (fw === 'vue')
    return `<template>
  <power-flow :data="data" :options="options" />
</template>

<script>
import "powerflow";
${mdiImport}
export default {
  data() {
    return ${dataObj('    ')};
  },
};
<\/script>`;

  if (fw === 'svelte') {
    // Svelte's compiler treats hyphenated tags as custom elements and sets
    // non-string prop values as DOM properties, so `{data}` binds directly
    // — no `bind:this`/`onMount` detour needed.
    const { dataLiteral, optionsLiteral } = buildParts('  ');
    const optionsDecl = optionsLiteral ? `\n  const options = ${optionsLiteral};` : '';
    const optionsBinding = optionsLiteral ? ' {options}' : '';
    return `<script>
  import "powerflow";
${mdiImport ? '  ' + mdiImport.trimEnd() + '\n' : ''}  const data = ${dataLiteral};${optionsDecl}
<\/script>

<power-flow {data}${optionsBinding} />`;
  }

  return '';
}

function refreshCode() {
  const code = buildSnippet(activeFw);
  const pre = document.getElementById('code-pre') as HTMLElement;
  pre.innerHTML = hljs.highlight(code, { language: FW_LANG[activeFw] }).value;
}

(document.getElementById('get-code') as HTMLElement).addEventListener(
  'click',
  () => {
    refreshCode();
    codeDialog.showModal();
  },
);
(document.getElementById('close-code') as HTMLElement).addEventListener(
  'click',
  () => codeDialog.close(),
);
codeDialog.addEventListener('click', (e) => {
  if (e.target === codeDialog) codeDialog.close();
});

(document.getElementById('copy-code') as HTMLElement).addEventListener(
  'click',
  () => {
    const copyBtn = document.getElementById('copy-code') as HTMLElement;
    navigator.clipboard
      .writeText(
        (document.getElementById('code-pre') as HTMLElement).textContent ?? '',
      )
      .then(() => {
        copyBtn.textContent = 'Copied!';
        setTimeout(() => {
          copyBtn.textContent = 'Copy code';
        }, 1500);
      });
  },
);

// ── URL state ─────────────────────────────────────────────────────────────────
// The whole playground state lives behind one `s` query param — a base64url
// JSON blob — instead of one query param per control, so shared links stay
// short and readable rather than accumulating a new key every time a control
// gets added.
interface ShareState {
  hasSolar: boolean;
  hasBat: boolean;
  hasC1: boolean;
  hasC2: boolean;
  hasC3: boolean;
  hasC4: boolean;
  hasBl1: boolean;
  hasBl2: boolean;
  solar: number;
  load: number;
  battery: number;
  soc: number;
  consumer1: number;
  consumer2: number;
  consumer3: number;
  consumer4: number;
  batteryLoad1: number;
  batteryLoad2: number;
  speed: number;
  // Everything below is omitted when it's still at its default, to keep the
  // common case (nobody touched the appearance controls) short.
  nodeStyle?: string;
  nodeShape?: string;
  iconStyle?: true;
  dotShape?: string;
  batteryChargeHighlight?: false;
  trackPulse?: true;
  curveBend?: number;
  dotCount?: number;
  rowGap?: number;
  columnGap?: number;
  colors?: Record<string, string>;
  topology?: Record<string, false>;
}

// btoa/atob work on a byte string, not UTF-16, hence the TextEncoder/Decoder
// round-trip — not currently load-bearing (every field we encode is ASCII),
// but keeps this safe if a future field (e.g. custom labels) isn't.
function toBase64Url(json: string): string {
  const bytes = new TextEncoder().encode(json);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function fromBase64Url(s: string): string {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

function encodeState(): ShareState {
  const state: ShareState = {
    hasSolar: hasSolar.checked,
    hasBat: hasBat.checked,
    hasC1: hasC1.checked,
    hasC2: hasC2.checked,
    hasC3: hasC3.checked,
    hasC4: hasC4.checked,
    hasBl1: hasBl1.checked,
    hasBl2: hasBl2.checked,
    solar: +inp.solar.value,
    load: +inp.load.value,
    battery: +inp.battery.value,
    soc: +inp.soc.value,
    consumer1: +inp.consumer1.value,
    consumer2: +inp.consumer2.value,
    consumer3: +inp.consumer3.value,
    consumer4: +inp.consumer4.value,
    batteryLoad1: +inp.batteryLoad1.value,
    batteryLoad2: +inp.batteryLoad2.value,
    speed: +speedInp.value,
  };
  if (currentNodeStyle !== 'soft') state.nodeStyle = currentNodeStyle;
  if (currentNodeShape !== 'circle') state.nodeShape = currentNodeShape;
  if (iconStyleInp.checked) state.iconStyle = true;
  if (currentDotShape !== 'circle') state.dotShape = currentDotShape;
  if (!batteryChargeHighlightInp.checked) state.batteryChargeHighlight = false;
  if (trackPulseInp.checked) state.trackPulse = true;
  const curveBendState = sliderToCurveBend(+curveBendInp.value);
  if (Math.abs(curveBendState - 1) > 1e-6) state.curveBend = curveBendState;
  if (+dotCountInp.value !== 1) state.dotCount = +dotCountInp.value;
  if (+rowGapInp.value !== 125) state.rowGap = +rowGapInp.value;
  if (+columnGapInp.value !== 145) state.columnGap = +columnGapInp.value;

  const changedColors = Object.fromEntries(
    Object.entries(cinp).filter(
      ([k, i]) => i.value.toLowerCase() !== DEFAULT_COLORS[k].toLowerCase(),
    ),
  );
  if (Object.keys(changedColors).length)
    state.colors = Object.fromEntries(
      Object.entries(changedColors).map(([k, i]) => [k, (i as HTMLInputElement).value]),
    );

  const changedTopology = Object.fromEntries(
    TOPOLOGY_KEYS.filter((k) => !topoInp[k].checked).map((k) => [k, false as const]),
  );
  if (Object.keys(changedTopology).length) state.topology = changedTopology;

  return state;
}

function syncUrl() {
  history.replaceState(null, '', '?s=' + toBase64Url(JSON.stringify(encodeState())));
}

// Fired by playground-colors.ts (reset colors) and playground-testcases.ts
// (pick a test case) after a one-off action that changes several inputs at
// once — see `notifyStateChange` in playground-dom.ts.
document.addEventListener('pf:statechange', syncUrl);

[
  ...Object.values(inp),
  hasSolar,
  hasBat,
  hasC1,
  hasC2,
  hasC3,
  hasC4,
  hasBl1,
  hasBl2,
  speedInp,
  iconStyleInp,
  batteryChargeHighlightInp,
  curveBendInp,
  dotCountInp,
  rowGapInp,
  columnGapInp,
  ...Object.values(cinp),
  ...Object.values(topoInp),
].forEach((i) => i.addEventListener('input', syncUrl));

const copyLinkBtn = document.getElementById('copy-link') as HTMLElement;
copyLinkBtn.addEventListener('click', () => {
  navigator.clipboard.writeText(location.href).then(() => {
    copyLinkBtn.textContent = 'Copied!';
    setTimeout(() => {
      copyLinkBtn.textContent = 'Copy link';
    }, 1500);
  });
});

(function loadFromURL() {
  const raw = new URLSearchParams(location.search).get('s');
  if (!raw) return;
  let s: ShareState;
  try {
    s = JSON.parse(fromBase64Url(raw));
  } catch {
    return; // malformed (or pre-single-param) link — fall back to defaults
  }

  hasSolar.checked = s.hasSolar;
  hasBat.checked = s.hasBat;
  hasC1.checked = s.hasC1;
  hasC2.checked = s.hasC2;
  hasC3.checked = s.hasC3;
  hasC4.checked = s.hasC4;
  hasBl1.checked = s.hasBl1;
  hasBl2.checked = s.hasBl2;
  inp.solar.value = String(s.solar);
  inp.battery.value = String(s.battery);
  inp.soc.value = String(s.soc);
  inp.consumer1.value = String(s.consumer1);
  inp.consumer2.value = String(s.consumer2);
  inp.consumer3.value = String(s.consumer3);
  inp.consumer4.value = String(s.consumer4);
  inp.batteryLoad1.value = String(s.batteryLoad1);
  inp.batteryLoad2.value = String(s.batteryLoad2);

  speedInp.value = String(s.speed);
  vSpeed.textContent = `${s.speed}×`;
  el.options = { ...el.options, speedScale: s.speed };

  if (s.nodeStyle === 'soft' || s.nodeStyle === 'tonal' || s.nodeStyle === 'outline' || s.nodeStyle === 'filled')
    setNodeStyle(s.nodeStyle);
  if (s.nodeShape === 'circle' || s.nodeShape === 'square' || s.nodeShape === 'hexagon')
    setNodeShape(s.nodeShape);
  iconStyleInp.checked = s.iconStyle ?? false;
  el.options = { ...el.options, iconStyle: iconStyleInp.checked ? 'full' : 'default' };
  if (
    s.dotShape === 'circle' ||
    s.dotShape === 'triangle' ||
    s.dotShape === 'bolt' ||
    s.dotShape === 'chevron' ||
    s.dotShape === 'spark'
  )
    setDotShape(s.dotShape);
  else setDotShape('circle');
  batteryChargeHighlightInp.checked = s.batteryChargeHighlight ?? true;
  el.options = {
    ...el.options,
    batteryChargeHighlight: batteryChargeHighlightInp.checked,
  };
  trackPulseInp.checked = s.trackPulse ?? false;
  el.options = { ...el.options, trackPulse: trackPulseInp.checked };
  const restoredCurveBend = s.curveBend ?? 1;
  curveBendInp.value = String(curveBendToSlider(restoredCurveBend));
  vCurveBend.textContent = `${restoredCurveBend.toFixed(2)}×`;
  el.options = { ...el.options, curveBend: restoredCurveBend };
  dotCountInp.value = String(s.dotCount ?? 1);
  vDotCount.textContent = dotCountInp.value;
  el.options = { ...el.options, dotCount: +dotCountInp.value };
  rowGapInp.value = String(s.rowGap ?? 125);
  vRowGap.textContent = `${rowGapInp.value}px`;
  el.options = { ...el.options, rowGap: +rowGapInp.value };
  columnGapInp.value = String(s.columnGap ?? 145);
  vColumnGap.textContent = `${columnGapInp.value}px`;
  el.options = { ...el.options, columnGap: +columnGapInp.value };

  for (const [k, i] of Object.entries(cinp)) {
    const v = s.colors?.[k];
    if (v) i.value = v;
  }
  for (const k of TOPOLOGY_KEYS) {
    topoInp[k].checked = s.topology?.[k] !== false;
  }

  applyColors();
  updateLoadMin();
  inp.load.value = String(s.load);
  updateGrid();
  syncUrl();
})();
