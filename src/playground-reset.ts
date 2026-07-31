// Wires the "Reset" button — puts every playground control (data sliders,
// topology, speed, appearance, colors, icons/appliance labels) back to its
// as-shipped default, in one action. Each concern's own reset logic still
// lives in its owning module (resetColors(), resetStructuralIcons(),
// resetAppliances()) or is reused via its existing `input`-event listener
// (dispatched here rather than duplicated) — this module only orchestrates.
import {
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
  notifyStateChange,
} from './playground-dom';
import {
  updateLoadMin,
  updateGrid,
  setNodeStyle,
  setDotShape,
  speedInp,
  iconStyleInp,
  batteryChargeHighlightInp,
  curveBendInp,
  dotCountInp,
  rowGapInp,
  columnGapInp,
} from './playground-state';
import { stopSim } from './playground-simulate';
import { resetColors } from './playground-colors';
import { resetStructuralIcons } from './playground-icons';
import { resetAppliances } from './playground-appliances';

// Fires each control's own `input` listener rather than re-deriving what it
// does to `el.options`/text labels — keeps this module from drifting out of
// sync with playground-state.ts as sliders are added/changed.
function resetInput(input: HTMLInputElement) {
  input.value = input.defaultValue;
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

function resetCheckbox(input: HTMLInputElement) {
  input.checked = input.defaultChecked;
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

(document.getElementById('reset-all') as HTMLElement).addEventListener('click', () => {
  stopSim();

  // Data sliders/toggles and topology — same direct-set + recompute pattern
  // as playground-testcases.ts's selectTestCase().
  for (const cb of [hasSolar, hasBat, hasC1, hasC2, hasC3, hasC4, hasBl1, hasBl2]) {
    cb.checked = cb.defaultChecked;
  }
  for (const input of Object.values(inp)) input.value = input.defaultValue;
  for (const k of TOPOLOGY_KEYS) topoInp[k].checked = topoInp[k].defaultChecked;
  updateLoadMin();
  // updateLoadMin() shifts `load` to preserve its *relative* position within
  // the new min/max bounds — since those bounds may have drifted from their
  // page-load values (consumer sliders were just reset above, but `load`'s
  // own min/max attributes only get recomputed, not restored), re-assert the
  // true default explicitly afterward, same as selectTestCase() does.
  inp.load.value = inp.load.defaultValue;
  updateGrid();

  // Speed and appearance — reuse each control's own listener.
  resetInput(speedInp);
  setNodeStyle('soft');
  resetCheckbox(iconStyleInp);
  setDotShape('circle');
  resetCheckbox(batteryChargeHighlightInp);
  resetInput(curveBendInp);
  resetInput(dotCountInp);
  resetInput(rowGapInp);
  resetInput(columnGapInp);

  // Colors, structural icons, and appliance labels/icons.
  resetColors();
  resetStructuralIcons();
  resetAppliances();

  notifyStateChange();
});
