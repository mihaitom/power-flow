import { definePowerFlow } from './element.js';

export { PowerFlow, createPowerFlow } from './core.js';
export type {
  FlowData,
  FlowColors,
  FlowLabels,
  FlowIcons,
  FlowTopology,
  PowerFlowOptions,
  PowerFlowSettings,
  NodeStyle,
  NodeShape,
  DotShape,
} from './types.js';
export { PowerFlowElement, definePowerFlow } from './element.js';

// Auto-register <power-flow> on import in the browser, so dropping the tag in
// just works. Calling definePowerFlow() again later is a harmless no-op.
definePowerFlow();
