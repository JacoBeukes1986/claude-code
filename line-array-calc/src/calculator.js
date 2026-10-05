// Line array calculator: both modes, limit caps, SPL estimates and warnings.
//
// Mode A: box count + genre -> coverage depth, SPL front / mix / back, splay list.
// Mode B: room depth + genre -> recommended box count, splay list, rigging check.

import { BOX_LIST, findBox } from './boxes.js';
import { GENRES } from './genres.js';
import { DEFAULTS, MODEL } from './model.js';
import { DEG, hangArray, holdLimit } from './geometry.js';
import { A_WEIGHTING_OFFSET_DB, airLossFn, hangPeakDb, systemPeakDb } from './acoustics.js';

const CONFIDENCE = ['low', 'medium', 'high'];

/**
 * @typedef {object} CalcInput
 * @property {'A'|'B'} [mode]
 * @property {string} [genre]          key of GENRES
 * @property {string} [boxId]          key of BOXES
 * @property {import('./boxes.js').BoxProfile} [box]  overrides boxId
 * @property {number} [boxCount]       mode A
 * @property {number} [roomDepthM]     mode B: distance from the array to the last listeners
 * @property {number} [trimHeightM]    top of the array
 * @property {number} [listenerHeightM]
 * @property {number} [frontRowM]
 * @property {number|null} [fohM]
 * @property {number} [hangs]          1 = single hang, 2 = L/R pair
 * @property {number} [hangSpacingM]
 * @property {number|null} [noiseLimitDbA]
 * @property {number|null} [spacingM]  overrides the genre spacing
 * @property {number} [holdTolerance]  overrides MODEL.holdTolerance
 */

/** @param {CalcInput} raw */
export function calculate(raw = {}) {
  const input = resolveInput(raw);
  const spacingM = input.spacingM ?? input.genre.spacingM;
  const first = layout(input, spacingM);
  // Distance mode tries to reach the back. When the genre spacing hits a cap, widen it (unless
  // the spacing was set by hand); the level check then decides whether that still meets the spec.
  if (input.mode === 'B' && first.binding && input.spacingM == null) {
    const wider = widenToReach(input, spacingM);
    return solve(input, wider ? layout(input, wider) : first, {
      fromM: spacingM,
      toM: wider,
      triedUpToM: spacingM * MODEL.maxSpacingFactor,
    });
  }
  return solve(input, first, null);
}

/**
 * Geometry only (limits, aim targets, the hung array) for one spacing: cheap enough to search
 * over. `quick` stops the hold-limit scan at the room depth, which is all a reach check needs.
 */
function layout(input, spacingM, quick = false) {
  const { box } = input;
  const presets = [...box.splayPresetsDeg].sort((a, b) => a - b);
  const listenerZ = input.listenerHeightM;
  const holdAt = (s) =>
    holdLimit({
      dh: input.trimHeightM - box.heightM / 2 - listenerZ,
      spacingM: s,
      presets,
      heightM: box.heightM,
      tolerance: input.holdTolerance,
      fromM: input.frontRowM,
      untilM: quick ? input.roomDepthM + 0.1 : undefined,
    });
  const plan = input.mode === 'A' ? planModeA(input, spacingM, holdAt) : planModeB(input, spacingM, holdAt);
  const hang = hangArray({ heightM: box.heightM, presets, trimHeightM: input.trimHeightM, listenerZ, targets: plan.targets });
  const binding = hang.truncated > 0 && input.mode === 'B' ? 'trim' : plan.binding;
  return { presets, listenerZ, plan, hang, binding };
}

/**
 * Smallest spacing from `fromM` up to MODEL.maxSpacingFactor × it that reaches the back
 * uncapped. A stepped search rather than bisection, because the hold limit is not monotonic in
 * spacing: 5 % steps find the first spacing that reaches, then 1 % steps back from it refine it.
 */
function widenToReach(input, fromM) {
  const reaches = (s) => !layout(input, s, true).binding;
  const coarse = fromM * 0.05;
  for (let s = fromM + coarse; s <= fromM * MODEL.maxSpacingFactor + 1e-9; s += coarse) {
    if (!reaches(s)) continue;
    let best = s;
    for (let f = s - fromM * 0.01; f > s - coarse + 1e-9; f -= fromM * 0.01) {
      if (reaches(f)) best = f;
      else break;
    }
    return best;
  }
  return null;
}

/** Everything else: flags, coverage, SPL, rigging and warnings for one laid-out array. */
function solve(input, { presets, listenerZ, plan, hang, binding }, widen) {
  const { box, genre } = input;
  const { hold, boxesWithinHold } = plan;
  const warnings = [];
  const rows = hang.rows;
  const boxCount = rows.length;
  if (boxCount === 0) {
    throw new Error('No box fits between the trim height and the listening plane.');
  }

  // Per-box flags.
  const tolM = input.holdTolerance * plan.spacingM;
  for (const row of rows) {
    row.aimErrorM = row.aimM - row.targetM;
    row.missesSpacing = !Number.isFinite(row.aimM) || Math.abs(row.aimErrorM) > tolM;
    row.beyondHoldLimit = row.targetM > hold.limitM + 1e-9;
  }

  const top = rows[0];
  const bottom = rows[boxCount - 1];
  const lowerEdgeTilt = bottom.tiltDeg + box.coverageVDeg / 2;
  const firstCoveredM =
    lowerEdgeTilt >= 90 ? 0 : Math.max(0, bottom.centre.x + (bottom.centre.z - listenerZ) / Math.tan(lowerEdgeTilt * DEG));
  const coverage = {
    startM: bottom.aimM,
    endM: top.aimM,
    firstCoveredM,
    depthM: top.aimM,
  };
  const backM = input.mode === 'A' ? top.targetM : input.roomDepthM;
  const fohM = input.fohM ?? round1(Math.max(input.frontRowM, (2 / 3) * backM));

  // SPL.
  const airLoss = airLossFn(MODEL.air);
  const floorDb = MODEL.directivityFloorDb;
  const calibration = box.splCalibration ?? { offsetDb: 0, source: null };
  const aWeighted = (peakDb) => peakDb + calibration.offsetDb + A_WEIGHTING_OFFSET_DB;
  const pair = { hangs: input.hangs, hangSpacingM: input.hangSpacingM };
  const effectiveTarget = input.noiseLimitDbA != null ? Math.min(genre.targetLAeqDbA, input.noiseLimitDbA) : genre.targetLAeqDbA;

  const fohPeakA = aWeighted(systemPeakDb(rows, box, fohM, listenerZ, airLoss, floorDb, pair));
  const point = (label, distanceM, peakA, where) => {
    const capabilityDbA = peakA - genre.headroomDb;
    return {
      label,
      distanceM,
      where,
      peakDbA: peakA,
      capabilityDbA,
      atTargetDbA: effectiveTarget + (peakA - fohPeakA),
    };
  };
  const grazingDeg = Math.atan2(top.centre.z - listenerZ, backM - top.centre.x) / DEG;
  const spl = {
    front: point('Front row', input.frontRowM, aWeighted(hangPeakDb(rows, box, input.frontRowM, listenerZ, airLoss, floorDb)), 'in line with a hang'),
    foh: point('Mix position', fohM, fohPeakA, input.hangs > 1 ? 'centre, L+R' : 'on axis'),
    back: point('Back', backM, aWeighted(systemPeakDb(rows, box, backM, listenerZ, airLoss, floorDb, pair)), input.hangs > 1 ? 'centre, L+R' : 'on axis'),
  };
  const calibrated = Boolean(calibration.source);
  const bump = (level) => CONFIDENCE[Math.min(2, CONFIDENCE.indexOf(level) + (calibrated ? 1 : 0))];
  const basis = calibrated
    ? `Modelled from the ${box.maxSplDb} dB spec, calibrated against ${calibration.source}.`
    : `Modelled from the ${box.maxSplDb} dB single-box spec; not calibrated against a prediction or measurement.`;
  spl.front.confidence = bump('low');
  spl.front.why = 'Near field and the bottom edge of the pattern: the point-source model is least reliable here.';
  const fohInside = fohM >= firstCoveredM && fohM <= coverage.endM + tolM;
  spl.foh.confidence = bump(fohInside ? 'medium' : 'low');
  spl.foh.why = fohInside ? basis : 'Mix position is outside the array’s aimed coverage.';
  const backInside = backM <= coverage.endM + tolM && grazingDeg >= MODEL.deepRoom.minGrazingDeg;
  spl.back.confidence = bump(backInside ? 'medium' : 'low');
  spl.back.why = backInside
    ? basis
    : 'Back is beyond the aimed coverage or at a grazing angle where crowd absorption (not modelled) adds loss.';

  // Level along the floor every metre, in line with one hang and on the room's centre line.
  const profile = [];
  for (let x = Math.max(1, Math.floor(input.frontRowM)); x <= Math.ceil(backM); x += 1) {
    profile.push({
      x,
      hangPeakDbA: aWeighted(hangPeakDb(rows, box, x, listenerZ, airLoss, floorDb)),
      centrePeakDbA: aWeighted(systemPeakDb(rows, box, x, listenerZ, airLoss, floorDb, pair)),
    });
  }

  // Rigging.
  const rigging = {
    flyBar: box.rigging.flyBar,
    maxBoxes: box.rigging.maxBoxes,
    boxCount,
    withinRating: boxCount <= box.rigging.maxBoxes,
    hangWeightKg: boxCount * box.weightKg + (box.rigging.flyBarWeightKg ?? 0),
    flyBarWeightKnown: box.rigging.flyBarWeightKg != null,
    arrayLengthM: boxCount * box.heightM,
    bottomEdgeM: bottom.bottomZ,
    topTiltDeg: top.tiltDeg,
    note: box.rigging.note,
  };

  // Warnings, most severe first.
  const unverified = Object.entries(box.unverified ?? {});
  if (unverified.length) {
    warnings.push({
      level: 'warn',
      code: 'UNVERIFIED_DATA',
      message: `Not yet checked against the ${box.name} rigging manual: ${listText(unverified.map(([, v]) => v.label))}. Results that depend on them are indicative only.`,
    });
  }
  if (!rigging.withinRating) {
    warnings.push({
      level: 'error',
      code: 'RIGGING_LIMIT',
      message: `${boxCount} boxes exceed the ${box.rigging.flyBar} limit of ${box.rigging.maxBoxes}. Do not fly this.`,
    });
  }
  if (hang.truncated > 0) {
    warnings.push({
      level: input.mode === 'A' ? 'error' : 'warn',
      code: 'TRIM_LIMIT',
      message: `Only ${boxCount} boxes fit above the listening plane at ${input.trimHeightM} m trim; ${hang.truncated} more would hang below ear height. Raise the trim or use fewer boxes.`,
    });
  } else if (bottom.bottomZ < listenerZ + MODEL.lowArrayClearanceM) {
    warnings.push({
      level: 'warn',
      code: 'LOW_ARRAY',
      message: `Array bottom at ${bottom.bottomZ.toFixed(1)} m, less than ${MODEL.lowArrayClearanceM} m above ear height: check sightlines and front-row exposure.`,
    });
  }
  const beyond = rows.filter((r) => r.beyondHoldLimit);
  if (beyond.length) {
    warnings.push({
      level: 'warn',
      code: 'RESOLUTION_LIMIT',
      message:
        `${holdReasonText(hold)} beyond ${round1(hold.limitM)} m at ${round1(plan.spacingM)} m spacing. ` +
        `Box${beyond.length > 1 ? 'es' : ''} ${rangeText(beyond)} aim past it, so at most ${boxesWithinHold} boxes hold the spacing from the front row.`,
    });
  }
  if (plan.notes) warnings.push(...plan.notes);
  if (widen?.toM) {
    warnings.push({
      level: 'info',
      code: 'WIDENED',
      message:
        `${round1(widen.fromM)} m spacing cannot reach ${input.roomDepthM} m with this box, so it was widened to ` +
        `${round1(plan.spacingM)} m: about ${(10 * Math.log10(plan.spacingM / widen.fromM)).toFixed(1)} dB less level than the genre spacing gives.`,
    });
  } else if (widen) {
    warnings.push({
      level: 'info',
      code: 'WIDEN_FAILED',
      message: `Widening the spacing up to ${round1(widen.triedUpToM)} m does not reach ${input.roomDepthM} m either.`,
    });
  }
  const clamped = rows.filter((r) => r.atMaxSplay);
  const frontGap = bottom.aimM - input.frontRowM;
  if (frontGap > tolM) {
    warnings.push({
      level: 'warn',
      code: 'FRONT_GAP',
      message:
        `Bottom box lands at ${round1(bottom.aimM)} m, not the front row at ${input.frontRowM} m` +
        (clamped.length ? ` (box${clamped.length > 1 ? 'es' : ''} ${rangeText(clamped)} already at the ${presets[presets.length - 1]}° maximum splay)` : '') +
        `. The pattern's -6 dB lower edge reaches ${round1(firstCoveredM)} m; use front fills closer than that.`,
    });
  }
  const misses = rows.filter((r) => r.missesSpacing && !r.beyondHoldLimit && r !== bottom);
  if (misses.length) {
    warnings.push({
      level: 'info',
      code: 'SPACING_MISS',
      message: `Box${misses.length > 1 ? 'es' : ''} ${rangeText(misses)} miss their aim point by more than ${round1(tolM)} m after preset rounding.`,
    });
  }
  const fohMargin = spl.foh.capabilityDbA - effectiveTarget;
  if (fohMargin < 0) {
    const neededSpacing = plan.spacingM * 10 ** (fohMargin / 10);
    warnings.push({
      level: 'warn',
      code: 'HEADROOM',
      message:
        `Mix position falls ${(-fohMargin).toFixed(1)} dB short of ${effectiveTarget} dBA with ${genre.headroomDb} dB headroom. ` +
        (binding === 'trim'
          ? 'The trim height already limits the box count: raise the trim or use a larger box.'
          : binding
          ? 'Tighter spacing would shorten the reach of an already capped array: consider delays or a larger box.'
          : fohMargin < -6
            ? 'Too far short to fix with spacing: check the mix position is inside the coverage, or use a larger system.'
            : `About ${round1(neededSpacing)} m spacing (more boxes) would close it.`),
    });
  }
  if (input.noiseLimitDbA != null && input.noiseLimitDbA < genre.targetLAeqDbA) {
    warnings.push({
      level: 'info',
      code: 'NOISE_LIMIT',
      message: `Noise limit caps the ${genre.label} target from ${genre.targetLAeqDbA} to ${input.noiseLimitDbA} dBA.`,
    });
  }
  const dropDb = spl.foh.peakDbA - spl.back.peakDbA;
  const deepReasons = [];
  if (dropDb > MODEL.deepRoom.maxDropDb) deepReasons.push(`level falls ${dropDb.toFixed(1)} dB from the mix position to the back`);
  if (grazingDeg < MODEL.deepRoom.minGrazingDeg) {
    deepReasons.push(`the top box grazes the back row at ${grazingDeg.toFixed(1)}°, where crowd absorption adds loss this model leaves out`);
  }
  if (deepReasons.length) {
    warnings.push({
      level: 'warn',
      code: 'DEEP_ROOM',
      message: `Deep room: ${deepReasons.join('; ')}. Expect more front-to-back drop than even spacing suggests; consider delays (tapered spacing is a later mode).`,
    });
  }
  if (genre.lfTargetDbC != null) {
    warnings.push({
      level: 'info',
      code: 'LF_NOT_EVALUATED',
      message: `${genre.label} LF target of ${genre.lfTargetDbC} dBC needs subs (HDL 38-AS); not evaluated in v1.`,
    });
  }
  if (boxCount < MODEL.shortArrayBoxes) {
    warnings.push({
      level: 'info',
      code: 'SHORT_ARRAY',
      message: `Only ${boxCount} box${boxCount > 1 ? 'es' : ''}: too short for real line-array pattern control in the low mids.`,
    });
  }
  const order = { error: 0, warn: 1, info: 2 };
  warnings.sort((a, b) => order[a.level] - order[b.level]);

  return {
    mode: input.mode,
    box: {
      id: box.id,
      name: box.name,
      heightM: box.heightM,
      depthM: box.depthM,
      coverageVDeg: box.coverageVDeg,
      unverified: box.unverified ?? {},
    },
    genre,
    input,
    target: {
      laeqDbA: effectiveTarget,
      headroomDb: genre.headroomDb,
      requiredPeakDbA: effectiveTarget + genre.headroomDb,
      fohMarginDb: fohMargin,
      cappedByNoiseLimit: effectiveTarget < genre.targetLAeqDbA,
    },
    spacing: { genreM: genre.spacingM, usedM: plan.spacingM, widenedFromM: widen?.toM ? widen.fromM : null },
    boxCount,
    neededBoxes: plan.neededBoxes,
    binding,
    limits: {
      riggingMaxBoxes: box.rigging.maxBoxes,
      holdLimitM: hold.limitM,
      holdLimitReason: hold.reason,
      boxesWithinHold,
      maxUsefulBoxes: Math.min(box.rigging.maxBoxes, boxesWithinHold),
    },
    coverage,
    spl,
    splBasis: basis,
    geometryConfidence: box.unverified?.splayPresetsDeg || box.unverified?.heightM ? 'medium' : 'high',
    grazingDeg,
    profile,
    rigging,
    rows: rows.map(({ centre, ...rest }) => ({ ...rest, centreX: centre.x, centreHeightM: centre.z })),
    warnings,
  };
}

/**
 * Run the same job on every box and say which ones meet the spec. In mode B that means reaching
 * the room depth at the genre spacing without hitting a cap, and giving the mix position the
 * genre LAeq with its headroom. Mode A has no depth to reach, so only the level and the hard
 * limits count there.
 *
 * @param {CalcInput} raw
 * @returns {Array<{box: import('./boxes.js').BoxProfile, result: ReturnType<typeof calculate>|null, meetsSpec: boolean, reasons: string[]}>}
 */
export function compareBoxes(raw = {}) {
  return BOX_LIST.map((box) => {
    let result;
    try {
      result = calculate({ ...raw, box, boxId: box.id });
    } catch (err) {
      return { box, result: null, meetsSpec: false, reasons: [err.message] };
    }
    const reasons = [];
    if (result.binding === 'rigging') {
      reasons.push(`needs ${result.neededBoxes} boxes; the fly bar takes ${result.limits.riggingMaxBoxes}`);
    } else if (result.binding === 'resolution') {
      reasons.push(`holds the spacing only to ${round1(result.limits.holdLimitM)} m`);
    } else if (result.binding === 'trim') {
      reasons.push(`only ${result.boxCount} boxes fit above the audience at this trim`);
    }
    for (const w of result.warnings) {
      if (w.level === 'error') reasons.push(w.message);
    }
    if (result.target.fohMarginDb < 0) {
      reasons.push(`${(-result.target.fohMarginDb).toFixed(1)} dB short at the mix position`);
    }
    return { box, result, meetsSpec: reasons.length === 0, reasons };
  });
}

/** Mode A: anchor the bottom box on the front row and step back one spacing per box. */
function planModeA(input, spacingM, holdAt) {
  const n = input.boxCount;
  const targets = Array.from({ length: n }, (_, k) => input.frontRowM + (n - 1 - k) * spacingM);
  const hold = holdAt(spacingM);
  return { targets, spacingM, neededBoxes: null, binding: null, notes: [], hold, boxesWithinHold: boxesWithin(input, hold, spacingM) };
}

/**
 * Mode B: enough boxes to span front row to back at no more than the requested spacing (tightened
 * so the aim points land exactly on both ends), capped by the fly-bar rating and the
 * angle-resolution limit. When capped, the spacing is kept and the array is anchored on the
 * front row, leaving the back uncovered rather than thinning the whole floor. Delays are only
 * suggested when more than two spacings are left over; closer than that the top boxes' upper
 * pattern still reaches.
 */
function planModeB(input, spacingM, holdAt) {
  const span = input.roomDepthM - input.frontRowM;
  const needed = span <= 0 ? 1 : Math.ceil(span / spacingM - 1e-9) + 1;
  const used = needed > 1 ? span / (needed - 1) : spacingM;
  const rigMax = input.box.rigging.maxBoxes;
  const holdUsed = holdAt(used);
  if (needed <= rigMax && input.roomDepthM <= holdUsed.limitM) {
    const targets = Array.from({ length: needed }, (_, k) => input.roomDepthM - k * used);
    return { targets, spacingM: used, neededBoxes: needed, binding: null, notes: [], hold: holdUsed, boxesWithinHold: boxesWithin(input, holdUsed, used) };
  }
  const hold = holdAt(spacingM);
  const withinHold = boxesWithin(input, hold, spacingM);
  const n = Math.max(1, Math.min(needed - 1, rigMax, withinHold));
  const binding = rigMax <= Math.min(needed - 1, withinHold) ? 'rigging' : 'resolution';
  const reach = input.frontRowM + (n - 1) * spacingM;
  const remainder = input.roomDepthM - reach;
  const fitSpacing = span / (Math.min(rigMax, needed) - 1);
  const cap = binding === 'rigging' ? `fly-bar rating (${rigMax})` : 'angle-resolution limit';
  const notes = [
    remainder <= 2 * spacingM
      ? {
          level: 'info',
          code: 'CAPPED',
          message:
            `Capped at ${n} boxes by the ${cap}; the top box aims at ${round1(reach)} m and the last ` +
            `${round1(remainder)} m rely on the top boxes' upper pattern. Check the level at the back.`,
        }
      : {
          level: 'warn',
          code: 'CAPPED',
          message:
            `${needed} boxes would cover ${input.roomDepthM} m at ${round1(spacingM)} m spacing; capped at ${n} by the ${cap}. ` +
            `Coverage ends near ${round1(reach)} m: cover the remaining ${round1(remainder)} m with delays` +
            (binding === 'rigging'
              ? `, or stretch to ${round1(fitSpacing)} m spacing (about ${(10 * Math.log10(fitSpacing / spacingM)).toFixed(1)} dB less level).`
              : '.'),
        },
  ];
  const targets = Array.from({ length: n }, (_, k) => input.frontRowM + (n - 1 - k) * spacingM);
  return { targets, spacingM, neededBoxes: needed, binding, notes, hold, boxesWithinHold: withinHold };
}

/** How many boxes, from the front row back, aim inside the hold limit at this spacing. */
function boxesWithin(input, hold, spacingM) {
  return Number.isFinite(hold.limitM) ? Math.max(1, Math.floor((hold.limitM - input.frontRowM) / spacingM + 1e-9) + 1) : Infinity;
}

function resolveInput(raw) {
  const input = { ...DEFAULTS, holdTolerance: MODEL.holdTolerance };
  for (const [k, v] of Object.entries(raw)) if (v !== undefined) input[k] = v;
  input.mode = String(input.mode).toUpperCase();
  if (input.mode !== 'A' && input.mode !== 'B') throw new Error(`Unknown mode "${raw.mode}" (use A or B).`);
  input.genre = typeof input.genre === 'string' ? GENRES[input.genre.toLowerCase()] : input.genre;
  if (!input.genre) throw new Error(`Unknown genre "${raw.genre}" (use ${Object.keys(GENRES).join(', ')}).`);
  input.box = input.box ?? findBox(input.boxId);
  if (!input.box) throw new Error(`Unknown box "${input.boxId}" (use ${BOX_LIST.map((b) => b.name).join(', ')}).`);
  const positive = ['trimHeightM', 'listenerHeightM', 'frontRowM', 'holdTolerance'];
  if (input.mode === 'B') positive.push('roomDepthM');
  for (const k of positive) {
    if (!(Number(input[k]) > 0)) throw new Error(`${k} must be a positive number.`);
    input[k] = Number(input[k]);
  }
  if (input.mode === 'A') {
    input.boxCount = Number(input.boxCount);
    if (!Number.isInteger(input.boxCount) || input.boxCount < 1) throw new Error('boxCount must be a whole number of at least 1.');
  }
  if (input.trimHeightM - input.box.heightM <= input.listenerHeightM) {
    throw new Error('Trim height must leave at least one box above the listening plane.');
  }
  if (input.mode === 'B' && input.roomDepthM <= input.frontRowM) {
    throw new Error('Room depth must be greater than the front-row distance.');
  }
  for (const k of ['fohM', 'noiseLimitDbA', 'spacingM']) {
    if (input[k] === '' || input[k] == null) input[k] = null;
    else if (!(Number(input[k]) > 0)) throw new Error(`${k} must be a positive number when set.`);
    else input[k] = Number(input[k]);
  }
  input.hangs = Number(input.hangs) >= 2 ? 2 : 1;
  input.hangSpacingM = Number(input.hangSpacingM) || 0;
  return input;
}

function holdReasonText(hold) {
  return hold.reason === 'min-splay'
    ? 'Even the smallest splay spreads aim points wider than the target spacing'
    : 'Splay presets are too coarse to hold the spacing, even dithered,';
}

function listText(items) {
  return items.length > 1 ? `${items.slice(0, -1).join(', ')} and ${items.at(-1)}` : items.join('');
}

function rangeText(rows) {
  const idx = rows.map((r) => r.index);
  return idx.length > 2 && idx[idx.length - 1] - idx[0] === idx.length - 1
    ? `${idx[0]}–${idx[idx.length - 1]}`
    : idx.join(', ');
}

function round1(v) {
  return Math.round(v * 10) / 10;
}
