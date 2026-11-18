// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { definePowerFlow, PowerFlowElement } from './index';

afterEach(() => {
  document.body.innerHTML = '';
});

function mount(setup?: (el: PowerFlowElement) => void) {
  const el = document.createElement('power-flow') as PowerFlowElement;
  setup?.(el);
  document.body.append(el);
  return {
    el,
    text: (id: string) => el.shadowRoot?.getElementById(id)?.textContent,
  };
}

describe('registration', () => {
  it('registers <power-flow> on import', () => {
    expect(customElements.get('power-flow')).toBe(PowerFlowElement);
  });

  it('is idempotent and supports a custom tag name', () => {
    expect(() => definePowerFlow()).not.toThrow();
    definePowerFlow('energy-flow');
    const Custom = customElements.get('energy-flow')!;
    expect(Custom.prototype).toBeInstanceOf(PowerFlowElement);
    definePowerFlow('energy-flow');
    expect(customElements.get('energy-flow')).toBe(Custom);

    const el = document.createElement('energy-flow') as PowerFlowElement;
    el.data = { solar: 1500, grid: 0, load: 1500 };
    document.body.append(el);
    expect(el.shadowRoot?.getElementById('t-solar-val')?.textContent).toBe(
      '1.5 kW',
    );
  });
});

describe('properties', () => {
  it('renders data set before and after connecting', () => {
    const { el, text } = mount((e) => {
      e.data = { solar: 1500, grid: 0, load: 1500 };
    });
    expect(text('t-solar-val')).toBe('1.5 kW');
    el.data = { solar: 2500, grid: 0, load: 2500 };
    expect(text('t-solar-val')).toBe('2.5 kW');
  });

  it('replaces options as a whole — omitted fields return to their defaults', () => {
    const { el, text } = mount((e) => {
      e.data = { solar: 3249, grid: 0, load: 0 };
    });
    el.options = { locale: 'de-DE', labels: { home: 'Haus' } };
    expect(text('t-solar-val')).toBe('3,2 kW');
    expect(text('t-home-lbl')).toBe('Haus');

    el.options = { nodeStyle: 'filled' };
    expect(text('t-solar-val')).toBe('3.2 kW');
    expect(text('t-home-lbl')).toBe('Home');
  });

  it('resets when a property is set to undefined', () => {
    const { el, text } = mount((e) => {
      e.data = { solar: 3249, grid: 0, load: 0 };
      e.options = { locale: 'de-DE' };
    });
    el.options = undefined;
    expect(text('t-solar-val')).toBe('3.2 kW');
    el.data = undefined;
    expect(text('t-home-val')).toBe('0 W');
  });
});

describe('attributes', () => {
  it('accepts JSON for data and options', () => {
    const { text } = mount((e) => {
      e.setAttribute('data', '{"solar":3249,"grid":0,"load":0}');
      e.setAttribute('options', '{"locale":"de-DE"}');
    });
    expect(text('t-solar-val')).toBe('3,2 kW');
  });

  it('ignores malformed JSON, keeping the previous value', () => {
    const { el, text } = mount((e) => {
      e.setAttribute('data', '{"solar":3249,"grid":0,"load":0}');
    });
    el.setAttribute('data', '{not json');
    expect(text('t-solar-val')).toBe('3.2 kW');
  });

  it('resets data and options when their attribute is removed', () => {
    const { el, text } = mount((e) => {
      e.setAttribute('data', '{"solar":3249,"grid":0,"load":2000}');
      e.setAttribute('options', '{"locale":"de-DE"}');
    });
    el.removeAttribute('options');
    expect(text('t-solar-val')).toBe('3.2 kW');
    el.removeAttribute('data');
    expect(text('t-home-val')).toBe('0 W');
  });
});

describe('lifecycle', () => {
  it('tears down on disconnect and renders again on reconnect', () => {
    const { el, text } = mount((e) => {
      e.data = { solar: 1500, grid: 0, load: 1500 };
    });
    el.remove();
    expect(el.shadowRoot!.innerHTML).toBe('');
    document.body.append(el);
    expect(text('t-solar-val')).toBe('1.5 kW');
  });
});
