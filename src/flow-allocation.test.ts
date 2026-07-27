import { describe, expect, it } from 'vitest';
import { computeFlowAllocation } from './flow-allocation';
import type { FlowData, FlowTopology } from './types';

const ALL_ON: FlowTopology = {
  solarToHome: true,
  solarToGrid: true,
  solarToBattery: true,
  batteryToHome: true,
  batteryToGrid: true,
};

function allocate(data: FlowData, topology: FlowTopology = ALL_ON) {
  return computeFlowAllocation(data, topology);
}

describe('computeFlowAllocation — default topology, no direct loads', () => {
  it('handles the documented tricky case: battery charges from solar before home does', () => {
    // solar 1000, load 1000, battery charging 100, grid +100 → solar→battery
    // 100, solar→home 900, grid→home 100 (not a lone solar→home 1000).
    const r = allocate({ solar: 1000, load: 1000, battery: -100, grid: 100 });
    expect(r.solarToBattery).toBe(100);
    expect(r.solarToHome).toBe(900);
    expect(r.solarToGrid).toBe(0);
    expect(r.gridToBattery).toBe(0);
    expect(r.gridToHome).toBe(100);
    expect(r.batToHome).toBe(0);
    expect(r.batToGrid).toBe(0);
  });

  it('splits solar across battery charge, home, then export', () => {
    // "Solar day": solar 5000, load 1500, battery charging 1500.
    const r = allocate({ solar: 5000, load: 1500, battery: -1500, grid: 0 });
    expect(r.solarToBattery).toBe(1500);
    expect(r.solarToHome).toBe(1500);
    expect(r.solarToGrid).toBe(2000);
    expect(r.gridToBattery).toBe(0);
    expect(r.gridToHome).toBe(0);
  });

  it('lets a discharging battery cover the house before exporting', () => {
    // "Night: bat + grid": solar 0, load 2000, battery discharging 800.
    const r = allocate({ solar: 0, load: 2000, battery: 800, grid: 0 });
    expect(r.batToHome).toBe(800);
    expect(r.batToGrid).toBe(0);
    expect(r.gridToHome).toBe(1200);
  });

  it('lets a discharging battery cover the house and export the rest', () => {
    // "Battery covers & exports": solar 0, load 800, battery discharging 1800.
    const r = allocate({ solar: 0, load: 800, battery: 1800, grid: 0 });
    expect(r.batToHome).toBe(800);
    expect(r.batToGrid).toBe(1000);
    expect(r.gridToHome).toBe(0);
  });

  it('charges the battery from the grid when there is no solar', () => {
    // "Grid→Battery": solar 0, load 1000, battery charging 500.
    const r = allocate({ solar: 0, load: 1000, battery: -500, grid: 0 });
    expect(r.solarToBattery).toBe(0);
    expect(r.gridToBattery).toBe(500);
    expect(r.gridToHome).toBe(1000);
  });

  it('is all zero when solar, battery and direct loads are all absent/idle', () => {
    const r = allocate({ solar: 0, load: 1200, battery: 0, grid: 1200 });
    expect(r).toEqual({
      solarToBattery: 0,
      gridToBattery: 0,
      solarToHome: 0,
      solarToGrid: 0,
      batToHome: 0,
      batToGrid: 0,
      gridToHome: 1200,
    });
  });

  it('is unaffected by wallbox/wallbox2 — they are already included in `load`', () => {
    const withoutWallbox = allocate({ solar: 3000, load: 8000, battery: 1000, grid: 0 });
    const withWallbox = allocate({
      solar: 3000,
      load: 8000,
      battery: 1000,
      grid: 0,
      wallbox: 6400,
      wallbox2: 300,
    });
    expect(withWallbox).toEqual(withoutWallbox);
  });
});

describe('computeFlowAllocation — batteryLoad/batteryLoad2 (direct battery ports)', () => {
  it('subtracts direct loads from discharge before the house/grid split', () => {
    // "Battery-fed AC": solar 0, load 900, battery discharging 2200, batteryLoad 1400.
    const r = allocate({
      solar: 0,
      load: 900,
      battery: 2200,
      grid: 0,
      batteryLoad: 1400,
    });
    expect(r.batToHome).toBe(800);
    expect(r.batToGrid).toBe(0);
    expect(r.gridToHome).toBe(100);
  });

  it('subtracts both direct loads at once', () => {
    // "Dual battery-fed loads": battery discharging 2600, two 1000/900 direct loads.
    const r = allocate({
      solar: 0,
      load: 900,
      battery: 2600,
      grid: 0,
      batteryLoad: 1000,
      batteryLoad2: 900,
    });
    expect(r.batToHome).toBe(700);
    expect(r.gridToHome).toBe(200);
  });

  it('requires extra grid charging when direct loads exceed a charging battery\'s net reading', () => {
    // The bug report: battery nets -100W (charging) while feeding 1150W of
    // direct loads — that needs 1250W of gross charge in total; solar only
    // supplies 600W (forced fully in — see the topology test below), so the
    // grid must supply the remaining 650W into the battery.
    const r = allocate(
      {
        solar: 600,
        load: 3600,
        battery: -100,
        grid: 4250,
        batteryLoad: 300,
        batteryLoad2: 850,
      },
      { ...ALL_ON, solarToHome: false, solarToGrid: false },
    );
    expect(r.solarToBattery).toBe(600);
    expect(r.gridToBattery).toBe(650);
    expect(r.batToHome).toBe(0);
    expect(r.batToGrid).toBe(0);
  });

  it('requires grid charging when direct loads exceed a discharging battery\'s net reading', () => {
    // "Battery ports exceed discharge (grid tops up)": battery nets +500W
    // discharge, but 700W of direct loads are drawn — the grid must
    // simultaneously top up the battery by 200W for the net to still read 500.
    const r = allocate({
      solar: 0,
      load: 900,
      battery: 500,
      grid: 1100,
      batteryLoad: 400,
      batteryLoad2: 300,
    });
    expect(r.gridToBattery).toBe(200);
    expect(r.batToHome).toBe(0);
    expect(r.batToGrid).toBe(0);
    expect(r.gridToHome).toBe(900);
  });

  it('reduces to the plain charge/discharge split when direct loads are 0', () => {
    const withZero = allocate({
      solar: 200,
      load: 1000,
      battery: -300,
      grid: 0,
      batteryLoad: 0,
      batteryLoad2: 0,
    });
    const withoutField = allocate({ solar: 200, load: 1000, battery: -300, grid: 0 });
    expect(withZero).toEqual(withoutField);
  });
});

describe('computeFlowAllocation — topology restrictions', () => {
  it('forces all solar into the battery when both other routes are disabled, and reconstructs the surplus as extra discharge', () => {
    // "Balcony PV (battery-only)": solar 600, load 900, battery charging 300.
    // Solar has nowhere to go but the battery, so all 600W enters; the 300W
    // beyond what the net charge (-300) needs must be leaving again toward
    // home, reconstructed as extra discharge.
    const r = allocate(
      { solar: 600, load: 900, battery: -300, grid: 0 },
      { ...ALL_ON, solarToHome: false, solarToGrid: false },
    );
    expect(r.solarToBattery).toBe(600);
    expect(r.gridToBattery).toBe(0);
    expect(r.solarToHome).toBe(0);
    expect(r.solarToGrid).toBe(0);
    expect(r.batToHome).toBe(300);
    expect(r.gridToHome).toBe(600);
  });

  it('combines the solar-forced-through-battery case with a direct battery load', () => {
    // "Balcony PV + battery-fed AC": solar 600 (forced fully into the
    // battery), battery nets -100W (charging), batteryLoad 300W.
    const r = allocate(
      { solar: 600, load: 800, battery: -100, grid: 0, batteryLoad: 300 },
      { ...ALL_ON, solarToHome: false, solarToGrid: false },
    );
    expect(r.solarToBattery).toBe(600);
    expect(r.gridToBattery).toBe(0);
    expect(r.batToHome).toBe(200);
    expect(r.gridToHome).toBe(600);
  });

  it('curtails solar that has no enabled route at all, rather than rerouting it', () => {
    // No grid export allowed: solar 5000, load 1500, battery charging 1000.
    // solarToHome is still enabled, so this is NOT the "solo battery path"
    // case — solar fills the battery need (1000) and the house (1500), and
    // the remaining 2500W is curtailed (solarToGrid disabled), not drawn
    // anywhere.
    const r = allocate(
      { solar: 5000, load: 1500, battery: -1000, grid: 0 },
      { ...ALL_ON, solarToGrid: false, batteryToGrid: false },
    );
    expect(r.solarToBattery).toBe(1000);
    expect(r.solarToHome).toBe(1500);
    expect(r.solarToGrid).toBe(0);
    expect(r.batToHome).toBe(0);
    expect(r.batToGrid).toBe(0);
    expect(r.gridToHome).toBe(0);
  });

  it('keeps solar capped at the charge need when only one of home/grid is disabled (an escape route still exists)', () => {
    const withHomeDisabled = allocate(
      { solar: 5000, load: 1500, battery: -1000, grid: 0 },
      { ...ALL_ON, solarToHome: false },
    );
    // Home is disabled but grid export is still enabled, so this is not the
    // "solo battery path" case — solar is capped at the charge need (1000)
    // and the rest exports.
    expect(withHomeDisabled.solarToBattery).toBe(1000);
    expect(withHomeDisabled.solarToHome).toBe(0);
    expect(withHomeDisabled.solarToGrid).toBe(4000);
  });

  it('blocks battery→home, forcing the grid to cover the house and the battery to export instead', () => {
    const r = allocate(
      { solar: 0, load: 800, battery: 1500, grid: 0 },
      { ...ALL_ON, batteryToHome: false },
    );
    expect(r.batToHome).toBe(0);
    expect(r.batToGrid).toBe(1500);
    expect(r.gridToHome).toBe(800);
  });

  it('blocks the shared battery↔grid path in both directions via batteryToGrid', () => {
    const exportBlocked = allocate(
      { solar: 0, load: 100, battery: 1500, grid: 0 },
      { ...ALL_ON, batteryToGrid: false },
    );
    expect(exportBlocked.batToHome).toBe(100);
    expect(exportBlocked.batToGrid).toBe(0); // would otherwise export 1400

    const chargeBlocked = allocate(
      { solar: 0, load: 100, battery: -500, grid: 0 },
      { ...ALL_ON, batteryToGrid: false },
    );
    expect(chargeBlocked.gridToBattery).toBe(0); // would otherwise be 500
  });
});
