import { PowerFlow } from './core.js';
import { DEFAULT_SETTINGS } from './defaults.js';
import type { FlowData, PowerFlowSettings } from './types.js';

// `class X extends HTMLElement` evaluates `HTMLElement` the moment this
// module loads — which throws in any environment without a DOM (Node
// without jsdom, SSR frameworks before hydration), even if nothing there
// ever tries to render a <power-flow>. Falling back to a plain stand-in
// class means importing this module never crashes; definePowerFlow() below
// already no-ops when `customElements` is unavailable, so the class simply
// never gets registered (or usefully instantiated) in that environment.
const HTMLElementBase: typeof HTMLElement =
  typeof HTMLElement !== 'undefined'
    ? HTMLElement
    : (class {} as typeof HTMLElement);

/**
 * `<power-flow>` custom element — a framework-agnostic energy-flow diagram.
 *
 * Set rich values as JS properties (objects), e.g. from React/Angular/Vue:
 *
 *   const el = document.querySelector("power-flow");
 *   el.data = { solar: 3200, grid: -800, load: 2400, battery: -1200 };
 *   el.options = { colors: { solar: "#f90" }, labels: { home: "Haus" } };
 *   el.options = { iconStyle: "full", dotShape: "triangle" };
 *
 * For plain HTML you can also pass JSON via attributes:
 *
 *   <power-flow data='{"solar":3200,"grid":-800,"load":2400}'></power-flow>
 *
 * `options` is applied as a whole: a field missing from a new `options`
 * value goes back to its default rather than keeping an earlier value.
 * Removing the `data`/`options` attribute (or setting the property to
 * `undefined`) resets it to its default.
 */
export class PowerFlowElement extends HTMLElementBase {
  static get observedAttributes() {
    return ['data', 'options'];
  }

  private pf: PowerFlow | null = null;
  private _data: FlowData = emptyData();
  private _options: Partial<PowerFlowSettings> | undefined;

  set data(value: FlowData | undefined) {
    this._data = value ?? emptyData();
    this.render();
  }
  get data(): FlowData {
    return this._data;
  }

  set options(value: Partial<PowerFlowSettings> | undefined) {
    this._options = value;
    this.render();
  }
  get options(): Partial<PowerFlowSettings> | undefined {
    return this._options;
  }

  connectedCallback() {
    this.render();
  }

  disconnectedCallback() {
    this.pf?.destroy();
    this.pf = null;
  }

  attributeChangedCallback(
    name: string,
    _old: string | null,
    value: string | null,
  ) {
    if (value == null) {
      // Attribute removed — fall back to defaults rather than silently
      // keeping the last value it held.
      if (name === 'data') this._data = emptyData();
      else if (name === 'options') this._options = undefined;
      this.render();
      return;
    }
    try {
      const parsed = JSON.parse(value);
      if (name === 'data') this._data = parsed;
      else if (name === 'options') this._options = parsed;
      this.render();
    } catch {
      // Ignore malformed JSON in attributes — property setters are the main API.
    }
  }

  private render() {
    if (!this.isConnected) return;
    // Spread over the full defaults so that anything the current `options`
    // leaves out is reset — PowerFlow.update() itself only touches the
    // fields it's given.
    const options = {
      data: this._data,
      options: { ...DEFAULT_SETTINGS, ...this._options },
    };
    if (this.pf) {
      this.pf.update(options);
    } else {
      this.pf = new PowerFlow(this, options);
    }
  }
}

function emptyData(): FlowData {
  return { solar: 0, grid: 0, load: 0 };
}

let baseClassRegistered = false;

/** Register the element under `tagName` (default `<power-flow>`).
 *  Idempotent — safe to call multiple times. Also works for additional tag
 *  names next to the automatically registered `<power-flow>`. */
export function definePowerFlow(tagName = 'power-flow'): void {
  if (typeof customElements === 'undefined') return;
  if (customElements.get(tagName)) return;
  // A constructor can only be registered under one name, so every name after
  // the first gets its own trivial subclass.
  customElements.define(
    tagName,
    baseClassRegistered ? class extends PowerFlowElement {} : PowerFlowElement,
  );
  baseClassRegistered = true;
}
