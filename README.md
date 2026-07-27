<div align="center">

# ⚡ powerflow

**Animated, framework-agnostic SVG energy-flow diagram.**

Live power flow between **solar, grid, home, battery and configurable
consumer slots** — with dots whose speed is proportional to the actual power.

[![npm](https://img.shields.io/npm/v/powerflow?color=cb3837&logo=npm)](https://www.npmjs.com/package/powerflow)
[![bundle size](https://img.shields.io/bundlephobia/minzip/powerflow?label=min%2Bgzip)](https://bundlephobia.com/package/powerflow)
[![zero deps](https://img.shields.io/badge/dependencies-0%20runtime-brightgreen)](#)
[![license](https://img.shields.io/npm/l/powerflow?color=blue)](./LICENSE)

<br />

<img src="https://raw.githubusercontent.com/mihaitom/power-flow/main/docs/preview.gif" alt="powerflow — animated energy-flow diagram" width="460" />

<br />

### [▶ Try the live playground](https://mihaitom.github.io/power-flow/)

<br />

---

Same component, four looks — all just an <a href="#nodestyle"><code>options.nodeStyle</code></a> away:

<img src="https://raw.githubusercontent.com/mihaitom/power-flow/main/docs/preview-outline.gif" alt="powerflow — outline node style, showing all four consumer slots plus a battery-fed load at once" height="420" />

<sub><code>outline</code> — the extra column only appears because this scenario actually uses <code>consumer3</code>/<code>consumer4</code>.</sub>

<br /><br />

<img src="https://raw.githubusercontent.com/mihaitom/power-flow/main/docs/preview-filled.gif" alt="powerflow — filled node style with full-size background icons and arrowhead flow dots, a balcony PV setup wired to charge only the battery" height="420" />

<sub><code>filled</code> — a balcony-PV <a href="#flowtopology"><code>topology</code></a> where solar can only reach the battery, plus <a href="#iconstyle"><code>iconStyle: 'full'</code></a> and <a href="#dotshape"><code>dotShape: 'triangle'</code></a> on top.</sub>

<br /><br />

<img src="https://raw.githubusercontent.com/mihaitom/power-flow/main/docs/preview-tonal.gif" alt="powerflow — tonal node style" height="420" />

<sub><code>tonal</code> — an opaque, muted fill with no ring.</sub>

</div>

---

It ships as a `<power-flow>` **Web Component**, so it works natively in **React,
Angular, Vue, Svelte or plain HTML** — plus a tiny vanilla API. No canvas, just
crisp scalable vectors; no runtime framework dependency.

- **Optional nodes** — solar, battery, up to four home consumer slots and two
  battery-fed direct loads appear automatically when you pass their values;
  empty rows are trimmed so there's no dead space.
- **Configurable topology** — disable individual built-in connections (e.g. a
  PV source wired only to the battery, never to the house/grid) via
  `topology`, without touching anything else.
- **Power-proportional animation** — dot speed scales with watts and stays
  smooth (no jumping) as values update live.
- **Active-leg highlighting** — the thin track a dot travels on lights up in
  the dot's own color while it's carrying power, fading back to a dim outline
  once the flow stops.
- **Consistent flow math** — each source is split across its sinks with no
  double-counting, modelled after Home Assistant's
  [power-flow-card-plus](https://github.com/flixlix/power-flow-card-plus).
- **Coverage rings** — home ring shows load sources (solar / battery / grid);
  grid ring shows export sources; battery ring shows state of charge.
- **Themeable** — every node colour (including separate charge/discharge colours
  for battery and grid), every label, and every node icon is overridable.
- **Four node styles** — soft, tonal, outline or filled, switchable live via
  `options.nodeStyle` (see the examples above).
- **Adjustable animation** — dot speed multiplier lets you slow down or speed up
  the flow independently of the power values.
- **Configurable look** — full-size background icons, arrow-shaped flow dots,
  and adjustable curve bend are all opt-in via `options.iconStyle`/`options.dotShape`/`options.curveBend`.
- **Tiny & isolated** — ~11 kB min+gzip, zero runtime deps, shadow DOM so its
  styles never leak into your app.

## Install

```bash
npm install powerflow
```

…or straight from a CDN, no build step:

```html
<script type="module" src="https://unpkg.com/powerflow"></script>
```

## Quick start (any framework / plain HTML)

```html
<script type="module">
  import 'powerflow'; // registers the <power-flow> element
</script>

<power-flow id="pf"></power-flow>

<script type="module">
  const pf = document.getElementById('pf');
  pf.data = {
    solar: 3000, // PV production (W); omit/null hides the node
    grid: -600, // grid power: positive = import, negative = export
    load: 2400, // total house consumption (W)
    battery: 500, // positive = charging, negative = discharging; omit/null hides
    batterySoc: 72, // state of charge in % (optional, shows SoC ring)
    consumer1: 3600, // generic house consumer, drawn above the house (optional)
    consumer2: 3600, // second house consumer, drawn below the house (optional)
  };
</script>
```

`data` and `options` (colors, labels, icons, topology and the presentation
tuning knobs — see [API](#api)) are set as JS **properties**. In plain HTML
you can also pass both as JSON attributes:
`<power-flow data='{"solar":2400,"grid":-600,"load":1800}' options='{"colors":{"solar":"#f90"}}'></power-flow>`.

## Framework usage

<details open>
<summary><b>React</b></summary>

```tsx
import 'powerflow';
import { useRef, useEffect } from 'react';

export function Energy({ data }) {
  const ref = useRef(null);
  useEffect(() => {
    ref.current.data = data;
  }, [data]);
  return <power-flow ref={ref} />;
}
```

React ≥ 19 also lets you pass `data={data}` directly.

</details>

<details>
<summary><b>Angular</b></summary>

Add `CUSTOM_ELEMENTS_SCHEMA` to your module/component, `import "powerflow";`
once, then:

```html
<power-flow [data]="data" [options]="options"></power-flow>
```

</details>

<details>
<summary><b>Vue 3</b></summary>

`import "powerflow";` once, tell Vue the tag is a custom element
(`compilerOptions.isCustomElement`), then (Options API):

```vue
<template>
  <power-flow :data="data" :options="options" />
</template>

<script>
import 'powerflow';

export default {
  props: ['data'],
  data() {
    return {
      options: { labels: { home: 'Haus' } },
    };
  },
};
</script>
```

</details>

<details>
<summary><b>Vanilla (no custom element)</b></summary>

```ts
import { createPowerFlow } from 'powerflow';

const pf = createPowerFlow(document.getElementById('box'), { data });
pf.update({ data: nextData }); // cheap, call as often as you like
pf.destroy();
```

The diagram renders into a shadow root on the host element, so its styles never
leak into your app.

</details>

## API

`<power-flow>` takes just two properties: `data` (live readings) and `options`
(everything about how the diagram looks/behaves).

| Property | Type                    | Description                     |
| -------- | ----------------------- | -------------------------------- |
| `data`   | `FlowData`               | Live power readings (watts).    |
| `options`| `Partial<PowerFlowSettings>` | Colors, labels, icons, topology and presentation tuning — see below. |

### `PowerFlowSettings` (the `options` object)

| Field        | Type                     | Description                                               |
| ------------ | ------------------------ | ----------------------------------------------------------- |
| `colors`     | `Partial<FlowColors>`    | Override any accent colour.                                |
| `labels`     | `Partial<FlowLabels>`    | Override node labels (i18n).                               |
| `icons`      | `Partial<FlowIcons>`     | Override node icons (any SVG `<path d="">` string).        |
| `topology`   | `Partial<FlowTopology>`  | Enable/disable individual built-in connections. All default `true`. |
| `speedScale` | `number`                 | Dot speed multiplier. `1` = default, `2` = twice as fast.  |
| `nodeStyle`  | `'soft' \| 'tonal' \| 'outline' \| 'filled'` | How each node's background/ring/icon/text are painted. Default `'soft'`. |
| `iconStyle`  | `'default' \| 'full'`    | `'full'` draws each icon large behind its value/label text. Default `'default'`. |
| `dotShape`   | `'circle' \| 'triangle'` | `'triangle'` draws flow dots as arrowheads pointing in their direction of travel. Default `'circle'`. |
| `curveBend`  | `number`                 | Shape of the diagram's curved connections. `0` = straight lines, `1` = the standard curve (default), up to `2` = straighter departure/arrival with a sharper turn. |

`options` is set as a whole (`pf.options = { iconStyle: 'full' }`) rather than
merged automatically — pass along whatever previous fields you want to keep,
e.g. `pf.options = { ...pf.options, iconStyle: 'full' }`.

### `FlowData`

| Field        | Type             | Description                                              |
| ------------ | ---------------- | -------------------------------------------------------- |
| `solar`      | `number \| null` | Solar / PV production (≥ 0). Optional.                   |
| `grid`       | `number`         | Grid power. Positive = import, negative = export.        |
| `load`       | `number`         | Total house consumption (≥ 0).                           |
| `battery`    | `number \| null` | Positive = charging, negative = discharging. Optional.   |
| `batterySoc` | `number \| null` | Battery state of charge in percent. Optional.            |
| `consumer1`  | `number \| null` | Home consumer 1, drawn top-left of the house. Optional.     |
| `consumer2`  | `number \| null` | Home consumer 2, drawn bottom-left of the house. Optional.  |
| `consumer3`  | `number \| null` | Home consumer 3, drawn top-right of the house. Optional.    |
| `consumer4`  | `number \| null` | Home consumer 4, drawn bottom-right of the house. Optional. |
| `batteryLoad1`  | `number \| null` | Load fed directly from a battery output port, bypassing the house (e.g. an AC unit wired straight to the battery). Optional. |
| `batteryLoad2` | `number \| null` | Second battery-fed direct load, same as `batteryLoad1`. Optional. |

> Only `grid` and `load` are required. Omitting (or passing `null` for) `solar`
> / `battery` / `consumer1` / `consumer2` / `consumer3` / `consumer4` /
> `batteryLoad1` / `batteryLoad2` hides that node, and the diagram trims the
> now-empty row so there's no dead space. All four `consumer*` fields are
> generic — not necessarily EV chargers, use `labels`/`icons` to relabel one
> for whatever appliance it actually is — and are sub-consumers of `load`,
> not extra load on top of it. Likewise, `batteryLoad1`
> and `batteryLoad2` are sub-consumers of `battery`'s discharge — already
> included in it, drawn as a separate leg, not extra discharge on top.
> `batteryLoad1`/`batteryLoad2` only render when `battery` is also set. See
> [Consumer slot layout](#consumer-slot-layout) below for exact positions and
> a caveat about `consumer2` and `batteryLoad2` sharing a grid cell.

### Consumer slot layout

The diagram sits on a 3×4 grid (columns 1–4, rows 1–3). Home and battery each
get their own configurable consumer slots within it:

| Position | Field          | Notes                                                                   |
| -------- | -------------- | ------------------------------------------------------------------------ |
| (3,1)    | `consumer1`    | Home consumer 1, top-left                                              |
| (4,1)    | `consumer3`    | Home consumer 3, top-right                                             |
| (3,3)    | `consumer2`    | Home consumer 2, bottom-left — **shares this cell with `batteryLoad2`** |
| (4,3)    | `consumer4`    | Home consumer 4, bottom-right                                          |
| (1,3)    | `batteryLoad1`  | Battery-fed direct load 1                                               |
| (3,3)    | `batteryLoad2` | Battery-fed direct load 2 — **shares this cell with `consumer2`**       |

Home has four slots and battery has two, but the grid only has room for five
distinct positions between them, so `consumer2` and `batteryLoad2` are pinned to
the same cell (3,3). This is deliberate: which one you actually use depends on
your wiring (a load hanging off the house vs. one wired straight to the
battery), so in practice at most one of them is ever set for a given
installation. If your data ever sets **both** at once — e.g. two independent
data sources feeding the same `pf.data` object — that's a misconfiguration
`powerflow` can't resolve on your behalf, so instead of guessing it renders a
red conflict indicator at (3,3) in place of either value, and logs a
`console.warn` once. Fix it by ensuring only one of `consumer2` /
`batteryLoad2` is set (non-`null`) at a time.

### `FlowTopology`

Some installations don't have every connection the default layout assumes —
e.g. a balcony/plug-in PV system wired so it can only ever charge the battery,
never feed the house or grid directly. `topology` lets you disable individual
built-in connections; everything defaults to `true`, so a fully-connected
system needs no `topology` at all:

```ts
pf.options = {
  ...pf.options,
  topology: {
    solarToHome: true,
    solarToGrid: true,
    solarToBattery: true,
    batteryToHome: true,
    batteryToGrid: true,
  },
};
```

A disabled connection's power is simply not drawn further (curtailed) rather
than rerouted — e.g. with `solarToHome`/`solarToGrid` both `false`, any solar
production left over after charging the battery just isn't shown going
anywhere else. `battery` ↔ `grid` is a single shared physical path in both
directions, so `batteryToGrid: false` also hides the grid → battery charging
dot.

Balcony-PV example — a PV source with no direct link to the house/grid:

```ts
pf.data = { solar: 600, grid: 200, load: 900, battery: 300 };
pf.options = { ...pf.options, topology: { solarToHome: false, solarToGrid: false } };
```

### `colors`

```ts
pf.options = {
  ...pf.options,
  colors: {
    solar:      "#fcd34d", // amber-yellow
    home:       "#818cf8", // periwinkle
    gridIn:     "#60a5fa", // sky blue  — importing from grid
    gridOut:    "#f472b6", // pink      — exporting to grid
    batteryIn:  "#4ade80", // lime green — charging
    batteryOut: "#fb923c", // orange    — discharging
    consumer1: "#22d3ee", // cyan
    consumer2: "#2dd4bf", // teal
    consumer3: "#38bdf8", // sky blue
    consumer4: "#0d9488", // deep teal
    batteryLoad1:  "#a78bfa", // violet — battery-fed direct load 1
    batteryLoad2: "#c084fc", // purple — battery-fed direct load 2
  },
};
```

### `labels` (i18n)

Defaults are English. Override per language, e.g.
`pf.options = { ...pf.options, labels: { grid: "Netz", home: "Haus", battery: "Akku" } }`.

### `icons`

Each value is a valid SVG `<path d="…">` string. The defaults use
[Material Design Icons](https://github.com/Templarian/MaterialDesign), but any
SVG path drawn in a 24×24 viewBox works:

```ts
import { mdiSolarPanel, mdiFlash } from '@mdi/js';

pf.options = {
  ...pf.options,
  icons: {
    solar: mdiSolarPanel, // swap the default solar-power-variant icon
    grid: mdiFlash, // swap the transmission tower
    // home / battery / consumer1 / consumer2 / consumer3 / consumer4 / batteryLoad1 / batteryLoad2 — all optional
  },
};
```

### `speedScale`

Multiplies the base dot speed for all animated legs. The base speed is already
proportional to power, so `speedScale` lets you tune the visual intensity
without changing the underlying data:

```ts
pf.options = { ...pf.options, speedScale: 0.5 }; // half speed — calmer animation
pf.options = { ...pf.options, speedScale: 2 }; // twice as fast — more energetic feel
```

### `nodeStyle`

How every node's background/ring/icon/text are painted, from a soft tint up
to a fully-colored badge:

```ts
pf.options = { ...pf.options, nodeStyle: 'soft' }; // light tint + colored ring (the default)
pf.options = { ...pf.options, nodeStyle: 'tonal' }; // opaque, muted fill, no ring
pf.options = { ...pf.options, nodeStyle: 'outline' }; // transparent, just a colored ring
pf.options = { ...pf.options, nodeStyle: 'filled' }; // accent-colored background, white icon/text
```

`filled` always paints icon/text a uniform white — never a different color
per node — and relies on a drop shadow (not a per-node contrast pick) to
stay legible against whatever accent color that node happens to have.

### `iconStyle`

```ts
pf.options = { ...pf.options, iconStyle: 'full' }; // large, dimmed icon behind the value/label text
pf.options = { ...pf.options, iconStyle: 'default' }; // small icon above the text (the default)
```

### `dotShape`

```ts
pf.options = { ...pf.options, dotShape: 'triangle' }; // small arrowheads that point in their flow direction
pf.options = { ...pf.options, dotShape: 'circle' }; // plain circles (the default)
```

### `curveBend`

Scales the diagram's curved connections (e.g. solar/battery's fan-out to home
and grid) by stretching or shrinking how far each curve travels in its fixed
departure/arrival direction before turning — not by bulging the whole arc
further from a straight line:

```ts
pf.options = { ...pf.options, curveBend: 0 }; // straightens every curve into a direct line
pf.options = { ...pf.options, curveBend: 1 }; // the standard curve (the default)
pf.options = { ...pf.options, curveBend: 2 }; // longer straight run out of/into each node, with a
// sharper turn in between (the maximum — kept at 2 so curves don't cross
// neighboring nodes)
```

## How the flows are computed

Meters only tell you the net at each node, so `powerflow` decomposes them into
the individual legs by priority — every source is split across the sinks it
feeds, with nothing double-counted:

1. `batteryLoad1`/`batteryLoad2` (direct loads on the battery, not the house)
   are folded into the battery's charge/discharge need first — since
   `battery` is only ever a single net reading, a direct load pulls that
   reading toward discharge, so more gross charging may actually be needed
   than the net figure alone suggests (e.g. a battery netting +100 W while
   also feeding 1150 W of direct loads needs 1250 W of gross charge in, not
   100 W),
2. a **charging battery** is fed from solar first (the rest from the grid),
3. remaining **solar** serves the house, then exports,
4. any **battery discharge** left over after step 1 covers the house's
   remaining demand, then exports,
5. the **grid** covers whatever the house still needs.

Each of these legs additionally honours `topology`: a disabled connection is
forced to zero and whatever power it would have carried is not drawn on that
leg. It isn't simply discarded, though — e.g. if solar's only enabled route
is the battery, all of it is pushed in, and any excess beyond what's needed
is reconstructed as extra battery discharge rather than vanishing.

This mirrors the priority order
[power-flow-card-plus](https://github.com/flixlix/power-flow-card-plus) uses
(its exact sign convention for `battery` differs — see `FlowData` above), so
e.g. `solar 1000 W, load 1000 W, battery charging 100 W, grid +100 W` correctly
shows solar→battery 100, solar→home 900 and grid→home 100 — not a single
solar→home line.

## Development

```bash
npm install
npm run dev           # playground at localhost:5173 — sliders, test cases, simulate day
npm test               # unit tests (vitest) for the flow-allocation math
npm run test:watch     # same, in watch mode

npm run build         # build:lib + build:site
npm run build:lib     # → dist/      publishable library (JS bundles + .d.ts)
npm run build:site    # → dist-site/ static playground (GitHub Pages)

npm run capture:gif   # re-generate all docs/preview*.gif shown above (requires ffmpeg + chromium)
                        # -- --test "<label>" --node-style <style> --out <path>  for a one-off capture
```

## Credits

Inspired by
[**power-flow-card-plus**](https://github.com/flixlix/power-flow-card-plus) by
[@flixlix](https://github.com/flixlix) — the excellent Home Assistant card.
`powerflow` reuses its flow-allocation conventions but is a standalone,
framework-agnostic Web Component with no Home Assistant dependency.

## License

[MIT](./LICENSE) © Thomas Mihailovits
