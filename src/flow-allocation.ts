import type { FlowData, FlowTopology } from './types';

/** Every individual flow leg (in watts), decomposed from a `FlowData`
 *  snapshot — see `computeFlowAllocation`. */
export interface FlowAllocation {
  solarToBattery: number;
  gridToBattery: number;
  solarToHome: number;
  solarToGrid: number;
  batToHome: number;
  batToGrid: number;
  gridToHome: number;
}

/**
 * Decomposes the net readings in `data` into the individual flow legs, by
 * priority — every source is split across the sinks it feeds, with nothing
 * double-counted. See the "How the flows are computed" section of the
 * README for the full rationale, including the tricky case this priority
 * order is designed for (charge the battery before serving the house) and
 * how `topology` and `batteryLoad1`/`batteryLoad2` affect it. Pure function,
 * no rendering side effects — used by `PowerFlow.update()` and directly
 * unit-testable.
 */
export function computeFlowAllocation(
  data: FlowData,
  topology: FlowTopology,
): FlowAllocation {
  const solarWatts = data.solar ?? 0;
  const loadWatts = data.load ?? 0;
  const batteryWatts = data.battery ?? 0;
  const batteryLoad1Watts = data.batteryLoad1 ?? 0;
  const batteryLoad2Watts = data.batteryLoad2 ?? 0;

  const solarP = Math.max(solarWatts, 0);
  const load = Math.max(loadWatts, 0);
  // batteryLoad1/batteryLoad2 are sub-consumers of the battery's discharge —
  // but since `battery` is only ever a single NET reading, a direct load
  // pulling power out of the battery pulls that net reading toward
  // discharge, so MORE gross charging (from solar/grid) is actually needed
  // to still land on the reported net. E.g. battery netting -100W (charging)
  // while also feeding 1150W of direct loads needs 1250W of gross charge,
  // not 100W. `chargeNeed`/`dischargeAvailable` fold directLoads in up
  // front so every formula below already accounts for it — they reduce to
  // the plain battery charge/discharge split whenever batteryLoad1/
  // batteryLoad2 are both 0.
  const directLoads =
    Math.max(batteryLoad1Watts, 0) + Math.max(batteryLoad2Watts, 0);
  const chargeNeed = Math.max(directLoads - batteryWatts, 0);
  const dischargeAvailable = Math.max(batteryWatts - directLoads, 0);

  // Each leg additionally honours `topology`: a disabled connection is
  // forced to 0 and whatever power it would have carried is not drawn on
  // that leg — e.g. a PV source wired only to the battery (`solarToHome`/
  // `solarToGrid` both false) never shows a solar→home/grid flow. It is NOT
  // simply discarded, though: if solar has nowhere to go but the battery,
  // the panel must push all of it in — any amount beyond what's actually
  // needed is simultaneously leaving the battery again (to home/grid),
  // which we reconstruct as extra battery discharge (see
  // `impliedExtraDischarge` below). Otherwise that surplus would vanish
  // from the diagram even though it's really being delivered to the house.
  const solarOnlyToBattery =
    topology.solarToBattery && !topology.solarToHome && !topology.solarToGrid;
  const solarToBattery = solarOnlyToBattery
    ? solarP
    : topology.solarToBattery
      ? Math.min(chargeNeed, solarP)
      : 0;
  const impliedExtraDischarge = Math.max(solarToBattery - chargeNeed, 0);
  // Whatever the battery still needs to charge comes from the grid; it
  // shares the battery↔grid path, drawn in reverse (grid → battery), so it's
  // gated by `batteryToGrid` too rather than being independently toggleable.
  const gridToBattery = topology.batteryToGrid
    ? Math.max(chargeNeed - solarToBattery, 0)
    : 0;

  const solarLeft = solarP - solarToBattery;
  const solarToHome = topology.solarToHome ? Math.min(solarLeft, load) : 0;
  const solarToGrid = topology.solarToGrid ? solarLeft - solarToHome : 0;

  const batteryDischargeRemaining = dischargeAvailable + impliedExtraDischarge;

  const homeRemaining = load - solarToHome;
  const batToHome = topology.batteryToHome
    ? Math.min(batteryDischargeRemaining, homeRemaining)
    : 0;
  const batToGrid = topology.batteryToGrid
    ? batteryDischargeRemaining - batToHome
    : 0;

  const gridToHome = homeRemaining - batToHome;

  return {
    solarToBattery,
    gridToBattery,
    solarToHome,
    solarToGrid,
    batToHome,
    batToGrid,
    gridToHome,
  };
}
