#!/usr/bin/env node
// Command-line runner. With no --mode/--genre it runs every genre in both modes.
//
//   node cli.js
//   node cli.js --mode A --genre rock --boxes 12
//   node cli.js --mode B --genre edm --depth 45 --trim 10 --noise-limit 100
//   node cli.js --mode B --genre pop --depth 35 --json

import { parseArgs } from 'node:util';
import { calculate, GENRES } from './src/index.js';

const { values: args } = parseArgs({
  options: {
    mode: { type: 'string' },
    genre: { type: 'string' },
    boxes: { type: 'string' },
    depth: { type: 'string' },
    trim: { type: 'string' },
    listener: { type: 'string' },
    front: { type: 'string' },
    foh: { type: 'string' },
    hangs: { type: 'string' },
    'hang-spacing': { type: 'string' },
    'noise-limit': { type: 'string' },
    spacing: { type: 'string' },
    tolerance: { type: 'string' },
    json: { type: 'boolean' },
    help: { type: 'boolean', short: 'h' },
  },
});

if (args.help) {
  console.log(`Usage: node cli.js [options]

  --mode A|B          A: box count -> coverage. B: room depth -> box count. Default: both.
  --genre NAME        ${Object.keys(GENRES).join(' | ')}. Default: all.
  --boxes N           Mode A box count (default 12).
  --depth M           Mode B distance from the array to the last listeners (default 40).
  --trim M            Height of the top of the array (default 9).
  --listener M        Listening plane / ear height (default 1.7).
  --front M           Distance from the array to the front row (default 3).
  --foh M             Mix position distance (default 2/3 of the way to the back).
  --hangs 1|2         Single hang or L/R pair (default 2).
  --hang-spacing M    Distance between the L and R hangs (default 12).
  --noise-limit DBA   Licence limit that caps the genre target.
  --spacing M         Override the genre's floor spacing.
  --tolerance F       Aim-point tolerance as a fraction of spacing (default 0.5).
  --json              Print the raw result objects.`);
  process.exit(0);
}

const num = (v) => (v === undefined ? undefined : Number(v));
const modes = args.mode ? [args.mode.toUpperCase()] : ['A', 'B'];
const genres = args.genre ? [args.genre.toLowerCase()] : Object.keys(GENRES);
const results = [];
try {
  for (const mode of modes) {
    for (const genre of genres) {
      results.push(
        calculate({
          mode,
          genre,
          boxCount: num(args.boxes),
          roomDepthM: num(args.depth),
          trimHeightM: num(args.trim),
          listenerHeightM: num(args.listener),
          frontRowM: num(args.front),
          fohM: num(args.foh),
          hangs: num(args.hangs),
          hangSpacingM: num(args['hang-spacing']),
          noiseLimitDbA: num(args['noise-limit']),
          spacingM: num(args.spacing),
          holdTolerance: num(args.tolerance),
        }),
      );
    }
  }
} catch (err) {
  console.error(`Error: ${err.message}`);
  process.exit(1);
}

if (args.json) {
  console.log(JSON.stringify(results.length === 1 ? results[0] : results, null, 2));
} else {
  console.log(results.map(report).join('\n\n'));
}

function report(r) {
  const i = r.input;
  const m = (v, d = 1) => (Number.isFinite(v) ? `${v.toFixed(d)} m` : '∞');
  const db = (v) => v.toFixed(1);
  // Signed, without printing "-0.0" for values that round to zero.
  const signed = (v, d) => {
    const s = Math.abs(v).toFixed(d);
    return Number(s) === 0 ? `+${s}` : `${v < 0 ? '-' : '+'}${s}`;
  };
  const head =
    r.mode === 'A'
      ? `Mode A: ${i.boxCount} boxes -> coverage`
      : `Mode B: ${i.roomDepthM} m room -> ${r.boxCount} boxes` + (r.binding ? ` (${r.neededBoxes} needed, capped by ${r.binding})` : '');
  const lines = [
    `${r.box.name} · ${r.genre.label} · ${head}`,
    `Venue     trim ${m(i.trimHeightM)} (top of array) · ears ${m(i.listenerHeightM)} · front row ${m(i.frontRowM)} · mix ${m(r.spl.foh.distanceM)} · ` +
      (i.hangs > 1 ? `L/R hangs ${m(i.hangSpacingM, 0)} apart` : 'single hang'),
    `Target    ${r.target.laeqDbA} dBA LAeq at mix, ${r.target.headroomDb} dB headroom (${r.target.requiredPeakDbA} dBA peak)` +
      `${r.target.cappedByNoiseLimit ? ' [noise-limited]' : ''} · spacing ${m(r.spacing.usedM, 2)}`,
    `Coverage  ${m(r.coverage.startM)} -> ${m(r.coverage.endM)} (pattern edge from ${m(r.coverage.firstCoveredM)}) · hold limit ${m(r.limits.holdLimitM)} · max useful boxes ${r.limits.maxUsefulBoxes}`,
    `Rigging   ${r.rigging.boxCount}/${r.rigging.maxBoxes} on ${r.rigging.flyBar} · ${r.rigging.hangWeightKg.toFixed(0)} kg incl. fly bar · ` +
      `array ${m(r.rigging.arrayLengthM)}, bottom ${m(r.rigging.bottomEdgeM)} · top tilt ${r.rigging.topTiltDeg.toFixed(1)}°`,
    '',
    `SPL (dBA)        distance  max LAeq  at target   peak  confidence`,
  ];
  for (const p of [r.spl.front, r.spl.foh, r.spl.back]) {
    lines.push(
      `${p.label.padEnd(15)} ${m(p.distanceM).padStart(9)} ${db(p.capabilityDbA).padStart(9)} ${db(p.atTargetDbA).padStart(10)} ` +
        `${db(p.peakDbA).padStart(6)}  ${p.confidence.padEnd(7)} (${p.where})`,
    );
  }
  lines.push(`max LAeq = peak capability − headroom · at target = levels when the mix position runs at the target`);
  lines.push('', `Box  splay    tilt   target      aim   error   drift`);
  for (const row of r.rows) {
    const flags = [row.atMaxSplay && 'max splay', row.beyondHoldLimit && 'past hold limit', row.missesSpacing && !row.beyondHoldLimit && 'misses'].filter(Boolean);
    lines.push(
      `${String(row.index).padStart(3)} ${(row.splayDeg == null ? '—' : `${row.splayDeg}°`).padStart(6)} ${`${row.tiltDeg.toFixed(1)}°`.padStart(7)} ` +
        `${m(row.targetM).padStart(8)} ${m(row.aimM).padStart(8)} ${signed(row.aimErrorM, 1).padStart(7)} ` +
        `${`${signed(row.driftDeg, 2)}°`.padStart(7)}${flags.length ? `  ${flags.join(', ')}` : ''}`,
    );
  }
  if (r.warnings.length) {
    lines.push('', 'Warnings');
    const mark = { error: '✖', warn: '!', info: '·' };
    for (const w of r.warnings) lines.push(`  ${mark[w.level]} ${w.message}`);
  }
  return lines.join('\n');
}
