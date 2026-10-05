import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculate, HDL_30_A, GENRES } from '../src/index.js';
import { aimDistance, bracketPresets, centreOf, hangArray, holdLimit, solveTilt } from '../src/geometry.js';
import { A_WEIGHTING_OFFSET_DB, airAbsorptionDbPerM } from '../src/acoustics.js';

const near = (actual, expected, tol, msg) =>
  assert.ok(Math.abs(actual - expected) <= tol, `${msg ?? ''} expected ${expected} ± ${tol}, got ${actual}`);

test('solveTilt points the box axis at its floor target', () => {
  for (const [pivotZ, target] of [[9, 3], [9, 40], [14, 12], [6, 25]]) {
    const pivot = { x: 0, z: pivotZ };
    const tilt = solveTilt(pivot, 0.293, target, 1.7);
    near(aimDistance(centreOf(pivot, tilt, 0.293), tilt, 1.7), target, 1e-6, `trim ${pivotZ}, target ${target}`);
  }
});

test('bracketPresets returns the presets either side', () => {
  const p = [0.2, 1, 2, 3, 5, 10];
  assert.deepEqual(bracketPresets(p, 0.6), [0.2, 1]);
  assert.deepEqual(bracketPresets(p, 2), [2, 2]);
  assert.deepEqual(bracketPresets(p, 4), [3, 5]);
  assert.deepEqual(bracketPresets(p, 0.1), [0.2, 0.2]);
  assert.deepEqual(bracketPresets(p, 12), [10, 10]);
});

test('presets dither 0/1 to average 0.5° and drift stays within half a step', () => {
  // Aim points of an ideal array splayed at exactly 0.5° per junction...
  const ideal = hangArray({ heightM: 0.293, presets: [0.5], trimHeightM: 9, listenerZ: 1.7, targets: Array(12).fill(40) });
  const targets = ideal.rows.map((r) => r.aimM);
  // ...rebuilt with only 0° and 1° available.
  const { rows } = hangArray({ heightM: 0.293, presets: [0, 1], trimHeightM: 9, listenerZ: 1.7, targets });
  const splays = rows.slice(1).map((r) => r.splayDeg);
  assert.ok(splays.every((s) => s === 0 || s === 1), `splays ${splays}`);
  // Exact ties can flip either way, but the pattern never sticks on one preset.
  for (let i = 2; i < splays.length; i++) {
    assert.ok(!(splays[i] === splays[i - 1] && splays[i] === splays[i - 2]), `no runs of three: ${splays}`);
  }
  near(splays.reduce((a, b) => a + b, 0) / splays.length, 0.5, 1 / splays.length, 'average splay');
  for (const r of rows) assert.ok(Math.abs(r.driftDeg) <= 0.5 + 1e-3, `drift ${r.driftDeg}`);
});

test('bottom boxes get bigger splays than top boxes', () => {
  for (const genre of Object.keys(GENRES)) {
    const r = calculate({ mode: 'A', genre, boxCount: 12 });
    const splays = r.rows.slice(1).map((x) => x.splayDeg);
    const third = Math.floor(splays.length / 3);
    const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
    assert.ok(mean(splays.slice(-third)) > 3 * mean(splays.slice(0, third)), `${genre}: ${splays}`);
  }
});

test('mode A anchors the bottom box on the front row and steps back one spacing per box', () => {
  const r = calculate({ mode: 'A', genre: 'rock', boxCount: 10, frontRowM: 4 });
  assert.equal(r.boxCount, 10);
  near(r.rows[9].targetM, 4, 1e-9);
  near(r.rows[0].targetM, 4 + 9 * GENRES.rock.spacingM, 1e-9);
  near(r.coverage.depthM, r.rows[0].aimM, 1e-9);
  near(r.rows[0].aimM, r.rows[0].targetM, 1e-6, 'top box tilt is exact');
});

test('mode B spans front row to back at no more than the genre spacing', () => {
  const r = calculate({ mode: 'B', genre: 'rock', roomDepthM: 30, frontRowM: 3 });
  assert.equal(r.binding, null);
  assert.equal(r.boxCount, Math.ceil(27 / 3) + 1);
  assert.ok(r.spacing.usedM <= GENRES.rock.spacingM);
  near(r.rows[0].targetM, 30, 1e-9);
  near(r.rows.at(-1).targetM, 3, 1e-9);
});

test('mode B caps at the angle-resolution limit and says what to do with the rest', () => {
  const r = calculate({ mode: 'B', genre: 'rock', roomDepthM: 70 });
  assert.equal(r.binding, 'resolution');
  assert.equal(r.boxCount, r.limits.boxesWithinHold);
  assert.ok(r.boxCount < r.neededBoxes);
  assert.ok(r.rows.every((row) => row.targetM <= r.limits.holdLimitM + 1e-9));
  assert.ok(r.warnings.some((w) => w.code === 'CAPPED' && /delays/.test(w.message)));
});

test('mode B caps at the fly-bar rating when resolution is not the limit', () => {
  const fine = { ...HDL_30_A, splayPresetsDeg: Array.from({ length: 101 }, (_, i) => i / 10), unverified: {} };
  const r = calculate({ mode: 'B', genre: 'classical', roomDepthM: 120, box: fine });
  assert.equal(r.binding, 'rigging');
  assert.equal(r.boxCount, 20);
  assert.ok(r.warnings.some((w) => w.code === 'CAPPED' && /stretch/.test(w.message)));
});

test('mode A over the fly-bar rating is an error', () => {
  const r = calculate({ mode: 'A', genre: 'classical', boxCount: 22 });
  assert.ok(r.warnings.some((w) => w.code === 'RIGGING_LIMIT' && w.level === 'error'));
  assert.equal(r.rigging.withinRating, false);
  near(r.rigging.hangWeightKg, 22 * 25 + 21.2, 1e-9);
});

test('boxes that would hang below ear height are dropped', () => {
  const r = calculate({ mode: 'A', genre: 'rock', boxCount: 16, trimHeightM: 5 });
  assert.ok(r.boxCount < 16);
  assert.ok(r.rows.every((row) => row.bottomZ >= 1.7));
  assert.ok(r.warnings.some((w) => w.code === 'TRIM_LIMIT' && w.level === 'error'));
});

test('the hold limit grows with wider spacing and finer presets', () => {
  const base = { dh: 7, presets: [0.2, 1, 2, 3, 5, 10], heightM: 0.293, tolerance: 0.5, fromM: 3 };
  const tight = holdLimit({ ...base, spacingM: 2 }).limitM;
  const wide = holdLimit({ ...base, spacingM: 5 }).limitM;
  const fine = holdLimit({ ...base, spacingM: 2, presets: [0, 0.25, 0.5, 1, 2, 3, 5, 10] }).limitM;
  assert.ok(wide > tight && fine > tight, `${tight} ${wide} ${fine}`);
});

test('tighter spacing raises the level at the mix position (about 3 dB per halving)', () => {
  const a = calculate({ mode: 'B', genre: 'rock', roomDepthM: 25, hangs: 1 });
  const b = calculate({ mode: 'B', genre: 'rock', roomDepthM: 25, hangs: 1, spacingM: 1.5 });
  const expected = 10 * Math.log10(a.spacing.usedM / b.spacing.usedM);
  near(b.spl.foh.peakDbA - a.spl.foh.peakDbA, expected, 1);
});

test('mid-floor level matches the energy-density formula Lmax + 10log(0.754·θv / (s·Δh))', () => {
  const r = calculate({ mode: 'B', genre: 'rock', roomDepthM: 30, hangs: 1 });
  const x = Math.round((r.coverage.startM + r.coverage.endM) / 2);
  const box = r.rows.reduce((a, b) => (Math.abs(b.aimM - x) < Math.abs(a.aimM - x) ? b : a));
  const analytic = HDL_30_A.maxSplDb + 10 * Math.log10((0.754 * 15 * (Math.PI / 180)) / (r.spacing.usedM * (box.centreHeightM - 1.7)));
  const modelled = r.profile.find((p) => p.x === x).hangPeakDbA - A_WEIGHTING_OFFSET_DB;
  near(modelled, analytic, 1.5);
});

test('an L/R pair adds up to 3 dB at the mix position', () => {
  const one = calculate({ mode: 'A', genre: 'rock', boxCount: 12, hangs: 1 });
  const two = calculate({ mode: 'A', genre: 'rock', boxCount: 12, hangs: 2 });
  const gain = two.spl.foh.peakDbA - one.spl.foh.peakDbA;
  assert.ok(gain > 0 && gain <= 3.01, `gain ${gain}`);
});

test('a noise limit caps the genre target', () => {
  const r = calculate({ mode: 'A', genre: 'edm', boxCount: 14, noiseLimitDbA: 100 });
  assert.equal(r.target.laeqDbA, 100);
  assert.equal(r.target.cappedByNoiseLimit, true);
  near(r.spl.foh.atTargetDbA, 100, 1e-9);
  assert.ok(r.warnings.some((w) => w.code === 'NOISE_LIMIT'));
});

test('LF targets are flagged as needing subs only where the genre has one', () => {
  for (const [genre, hasLf] of [['classical', false], ['rock', false], ['pop', true], ['edm', true]]) {
    const r = calculate({ mode: 'A', genre, boxCount: 12 });
    assert.equal(r.warnings.some((w) => w.code === 'LF_NOT_EVALUATED'), hasLf, genre);
  }
});

test('every SPL estimate carries a confidence level', () => {
  const r = calculate({ mode: 'B', genre: 'pop', roomDepthM: 35 });
  for (const p of Object.values(r.spl)) assert.ok(['low', 'medium', 'high'].includes(p.confidence) && p.why);
  assert.equal(r.spl.front.confidence, 'low');
});

test('a calibration source raises confidence one level', () => {
  const box = { ...HDL_30_A, splCalibration: { offsetDb: -1.5, source: 'RCF Shape, 12 x HDL 30-A' } };
  const plain = calculate({ mode: 'A', genre: 'rock', boxCount: 12 });
  const cal = calculate({ mode: 'A', genre: 'rock', boxCount: 12, box });
  assert.equal(cal.spl.foh.confidence, 'high');
  near(cal.spl.foh.peakDbA - plain.spl.foh.peakDbA, -1.5, 1e-9);
});

test('unverified box data is always flagged', () => {
  const r = calculate({ mode: 'A', genre: 'rock', boxCount: 8 });
  assert.ok(r.warnings.some((w) => w.code === 'UNVERIFIED_DATA'));
  assert.equal(r.geometryConfidence, 'medium');
});

test('air absorption matches ISO 9613-2 Table 2 (20 °C, 70 % RH)', () => {
  for (const [f, dbPerKm] of [[1000, 5.0], [2000, 9.0], [4000, 22.9], [8000, 76.6]]) {
    near(airAbsorptionDbPerM(f, 20, 70) * 1000, dbPerKm, dbPerKm * 0.03, `${f} Hz`);
  }
  near(A_WEIGHTING_OFFSET_DB, -2.37, 0.01);
});

test('bad input is rejected with a clear message', () => {
  assert.throws(() => calculate({ mode: 'C' }), /mode/);
  assert.throws(() => calculate({ genre: 'jazz' }), /genre/);
  assert.throws(() => calculate({ mode: 'A', boxCount: 2.5 }), /boxCount/);
  assert.throws(() => calculate({ mode: 'B', roomDepthM: 2, frontRowM: 3 }), /Room depth/);
  assert.throws(() => calculate({ trimHeightM: 1.8 }), /Trim height/);
});
