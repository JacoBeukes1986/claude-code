// SPL model.
//
// Each box is treated as a point source at its acoustic centre: the 1 m peak spec, a Gaussian
// vertical pattern around its own tilt, inverse-square distance loss and air absorption. The
// boxes are summed on an energy basis (incoherently).
//
// Why not "single box + coupling gain, then 3 dB per doubling near and 6 dB far"? Taken from
// 1 m, that rule puts every box's output on one axis and overstates a curved array by about
// 15-20 dB, and it cannot see spacing or trim height. An energy sum conserves the radiated
// power: it still gives cylindrical spreading along a straight section, and level along the
// floor then follows spacing, trim height and distance together.
// It ignores interference (comb ripple averages out over a band) and the extra coherent gain
// below roughly 300 Hz, so it suits A-weighted estimates, not LF/dBC.

import { DEG } from './geometry.js';

const OCTAVES_HZ = [63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
const A_WEIGHT_DB = [-26.2, -16.1, -8.6, -3.2, 0, 1.2, 1.0, -1.1, -6.6];
const A_WEIGHT_POWER = A_WEIGHT_DB.map((a) => 10 ** (a / 10));
const A_WEIGHT_SUM = A_WEIGHT_POWER.reduce((s, w) => s + w, 0);

// The 137 dB max SPL is unweighted. A pink-noise-like programme through a 50 Hz-20 kHz box reads
// this much lower A-weighted (about -2.4 dB).
export const A_WEIGHTING_OFFSET_DB = 10 * Math.log10(A_WEIGHT_SUM / OCTAVES_HZ.length);

/** Atmospheric absorption in dB/m (ISO 9613-1). */
export function airAbsorptionDbPerM(freqHz, temperatureC = 20, humidityPct = 50, pressureKPa = 101.325) {
  const T = temperatureC + 273.15;
  const T0 = 293.15;
  const T01 = 273.16;
  const pa = pressureKPa / 101.325;
  const psat = 10 ** (-6.8346 * (T01 / T) ** 1.261 + 4.6151);
  const h = (humidityPct * psat) / pa;
  const frO = pa * (24 + (4.04e4 * h * (0.02 + h)) / (0.391 + h));
  const frN = pa * (T / T0) ** -0.5 * (9 + 280 * h * Math.exp(-4.17 * ((T / T0) ** (-1 / 3) - 1)));
  const f2 = freqHz * freqHz;
  return (
    8.686 *
    f2 *
    ((1.84e-11 / pa) * Math.sqrt(T / T0) +
      (T / T0) ** -2.5 *
        ((0.01275 * Math.exp(-2239.1 / T)) / (frO + f2 / frO) +
          (0.1068 * Math.exp(-3352 / T)) / (frN + f2 / frN)))
  );
}

/** Returns r -> broadband A-weighted air loss in dB over r metres (pink-noise band weighting). */
export function airLossFn({ temperatureC, humidityPct }) {
  const alphas = OCTAVES_HZ.map((f) => airAbsorptionDbPerM(f, temperatureC, humidityPct));
  return (r) => {
    let s = 0;
    for (let i = 0; i < alphas.length; i++) s += A_WEIGHT_POWER[i] * 10 ** ((-alphas[i] * r) / 10);
    return -10 * Math.log10(s / A_WEIGHT_SUM);
  };
}

/** Gaussian pattern: 0 dB on axis, -6 dB at +/- coverage/2, clamped to floorDb. */
export function patternDb(offAxisDeg, coverageDeg, floorDb) {
  const u = offAxisDeg / (coverageDeg / 2);
  return Math.max(-6 * u * u, floorDb);
}

/**
 * Peak SPL (unweighted, before calibration) of one hang at floor distance x on its own axis.
 * @param {Array<{centre: {x:number,z:number}, tiltDeg: number}>} rows
 */
export function hangPeakDb(rows, box, x, listenerZ, airLoss, floorDb) {
  let energy = 0;
  for (const row of rows) {
    const dx = x - row.centre.x;
    const dz = row.centre.z - listenerZ;
    const r = Math.max(1, Math.hypot(dx, dz));
    const offAxis = Math.atan2(dz, dx) / DEG - row.tiltDeg;
    const level = box.maxSplDb + patternDb(offAxis, box.coverageVDeg, floorDb) - 20 * Math.log10(r) - airLoss(r);
    energy += 10 ** (level / 10);
  }
  return 10 * Math.log10(energy);
}

/**
 * Peak SPL at a point on the room's centre line, summing both hangs of an L/R pair.
 * Each hang is evaluated at the true horizontal range to the point, less its horizontal
 * off-axis loss; with one hang the point is on that hang's axis.
 */
export function systemPeakDb(rows, box, x, listenerZ, airLoss, floorDb, { hangs, hangSpacingM }) {
  if (hangs < 2) return hangPeakDb(rows, box, x, listenerZ, airLoss, floorDb);
  const half = hangSpacingM / 2;
  const range = Math.hypot(x, half);
  const offAxis = Math.atan2(half, x) / DEG;
  const oneHang = hangPeakDb(rows, box, range, listenerZ, airLoss, floorDb) + patternDb(offAxis, box.coverageHDeg, floorDb);
  return oneHang + 10 * Math.log10(2);
}
