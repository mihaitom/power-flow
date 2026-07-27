import {
  mdiLanguageHtml5,
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
  hasWb,
  hasWb2,
  hasBl,
  hasBl2,
  topoInp,
  TOPOLOGY_KEYS,
} from './playground-dom';
import { cinp, DEFAULT_COLORS, applyColors } from './playground-colors';
import { currentIcons, DEFAULT_ICONS, ICON_NAMES } from './playground-icons';
import { currentLabels, APPLIANCE_ICON_NAMES } from './playground-appliances';

const ALL_ICON_NAMES = { ...ICON_NAMES, ...APPLIANCE_ICON_NAMES };
import { updateLoadMin, updateGrid, speedInp, vSpeed } from './playground-state';

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

const FW_TABS = [
  { fw: 'html', label: 'HTML', icon: mdiLanguageHtml5 },
  { fw: 'react', label: 'React', icon: mdiReact },
  { fw: 'angular', label: 'Angular', icon: mdiAngular },
  { fw: 'vue', label: 'Vue 3', icon: mdiVuejs },
  { fw: 'svelte', label: 'Svelte', icon: mdiCodeBraces },
];
const FW_LANG: Record<string, string> = {
  html: 'html',
  react: 'javascript',
  angular: 'typescript',
  vue: 'html',
  svelte: 'html',
};

const fwTabsEl = document.getElementById('fw-tabs') as HTMLElement;
FW_TABS.forEach(({ fw, label, icon }, i) => {
  const b = document.createElement('button');
  b.dataset.fw = fw;
  b.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" style="vertical-align:-2px;margin-right:4px;"><path d="${icon}" fill="currentColor"/></svg>${label}`;
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
  if (hasWb.checked) data.wallbox = +inp.wallbox.value;
  if (hasWb2.checked) data.wallbox2 = +inp.wallbox2.value;
  if (hasBl.checked) data.batteryLoad = +inp.batteryLoad.value;
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
    ([k, v]) => v !== DEFAULT_ICONS[k],
  );
  const hasIcons = changedIconEntries.length > 0;
  const iconConstNames = changedIconEntries.map(([, v]) => ALL_ICON_NAMES[v]).filter(Boolean);
  const iconObjStr = (pad: string) => {
    const inner = changedIconEntries
      .map(([k, v]) => `${pad}  ${k}: ${ALL_ICON_NAMES[v] ?? JSON.stringify(v)}`)
      .join(',\n');
    return `{\n${inner},\n${pad}}`;
  };

  const assign = (pfVar: string, pad: string): string => {
    const r = [`${pad}${pfVar}.data = ${jsObj(data, pad)};`];
    if (Object.keys(changedColors).length)
      r.push(`${pad}${pfVar}.colors = ${jsObj(changedColors, pad)};`);
    if (hasIcons)
      r.push(`${pad}${pfVar}.icons = ${iconObjStr(pad)};`);
    if (currentLabels) r.push(`${pad}${pfVar}.labels = ${jsObj(currentLabels, pad)};`);
    if (+speedInp.value !== 1)
      r.push(`${pad}${pfVar}.speedScale = ${+speedInp.value};`);
    if (Object.keys(changedTopology).length)
      r.push(`${pad}${pfVar}.topology = ${jsObj(changedTopology, pad)};`);
    return r.join('\n');
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

  if (fw === 'angular')
    return `import "powerflow";
${mdiImport}import { Component, ElementRef, ViewChild, AfterViewInit } from "@angular/core";

@Component({
  selector: "app-power-flow",
  template: \`<power-flow #pf></power-flow>\`,
})
export class PowerFlowComponent implements AfterViewInit {
  @ViewChild("pf") pf!: ElementRef;

  ngAfterViewInit() {
${assign('this.pf.nativeElement', '    ')}
  }
}`;

  if (fw === 'vue')
    return `<template>
  <power-flow ref="pf" />
</template>

<script setup>
import "powerflow";
${mdiImport}import { ref, onMounted } from "vue";

const pf = ref(null);
onMounted(() => {
${assign('pf.value', '  ')}
});
<\/script>`;

  if (fw === 'svelte')
    return `<script>
  import "powerflow";
${mdiImport ? '  ' + mdiImport.trimEnd() + '\n' : ''}  import { onMount } from "svelte";
  let pf;
  onMount(() => {
${assign('pf', '    ')}
  });
<\/script>

<power-flow bind:this={pf} />`;

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
function encodeState(): URLSearchParams {
  const p = new URLSearchParams();
  p.set('hasSolar', hasSolar.checked ? '1' : '0');
  p.set('hasBat', hasBat.checked ? '1' : '0');
  p.set('hasWb', hasWb.checked ? '1' : '0');
  p.set('hasWb2', hasWb2.checked ? '1' : '0');
  p.set('hasBl', hasBl.checked ? '1' : '0');
  p.set('hasBl2', hasBl2.checked ? '1' : '0');
  p.set('solar', inp.solar.value);
  p.set('load', inp.load.value);
  p.set('battery', inp.battery.value);
  p.set('soc', inp.soc.value);
  p.set('wallbox', inp.wallbox.value);
  p.set('wallbox2', inp.wallbox2.value);
  p.set('batteryLoad', inp.batteryLoad.value);
  p.set('batteryLoad2', inp.batteryLoad2.value);
  p.set('speed', speedInp.value);
  for (const [k, i] of Object.entries(cinp)) {
    if (i.value.toLowerCase() !== DEFAULT_COLORS[k].toLowerCase())
      p.set('c_' + k, i.value.slice(1));
  }
  for (const k of TOPOLOGY_KEYS) {
    if (!topoInp[k].checked) p.set('topo_' + k, '0');
  }
  return p;
}

function syncUrl() {
  history.replaceState(null, '', '?' + encodeState());
}

// Fired by playground-colors.ts (reset colors) and playground-testcases.ts
// (pick a test case) after a one-off action that changes several inputs at
// once — see `notifyStateChange` in playground-dom.ts.
document.addEventListener('pf:statechange', syncUrl);

[
  ...Object.values(inp),
  hasSolar,
  hasBat,
  hasWb,
  hasWb2,
  hasBl,
  hasBl2,
  speedInp,
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
  if (!location.search) return;
  const p = new URLSearchParams(location.search);
  if (p.has('hasSolar')) hasSolar.checked = p.get('hasSolar') === '1';
  if (p.has('hasBat')) hasBat.checked = p.get('hasBat') === '1';
  if (p.has('hasWb')) hasWb.checked = p.get('hasWb') === '1';
  if (p.has('hasWb2')) hasWb2.checked = p.get('hasWb2') === '1';
  if (p.has('hasBl')) hasBl.checked = p.get('hasBl') === '1';
  if (p.has('hasBl2')) hasBl2.checked = p.get('hasBl2') === '1';
  if (p.has('solar')) inp.solar.value = p.get('solar')!;
  if (p.has('battery')) inp.battery.value = p.get('battery')!;
  if (p.has('soc')) inp.soc.value = p.get('soc')!;
  if (p.has('wallbox')) inp.wallbox.value = p.get('wallbox')!;
  if (p.has('wallbox2')) inp.wallbox2.value = p.get('wallbox2')!;
  if (p.has('batteryLoad')) inp.batteryLoad.value = p.get('batteryLoad')!;
  if (p.has('batteryLoad2')) inp.batteryLoad2.value = p.get('batteryLoad2')!;
  if (p.has('speed')) {
    speedInp.value = p.get('speed')!;
    vSpeed.textContent = `${p.get('speed')}×`;
    el.speedScale = Number(p.get('speed'));
  }
  for (const [k, i] of Object.entries(cinp)) {
    const v = p.get('c_' + k);
    if (v) i.value = '#' + v;
  }
  for (const k of TOPOLOGY_KEYS) {
    if (p.has('topo_' + k)) topoInp[k].checked = p.get('topo_' + k) !== '0';
  }
  applyColors();
  updateLoadMin();
  if (p.has('load')) {
    inp.load.value = p.get('load')!;
    updateGrid();
  }
  syncUrl();
})();
