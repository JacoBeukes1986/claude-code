// Array geometry in the vertical plane through the hang's axis.
// x: horizontal distance forward from the front face of the top box. z: height above the floor.
// Tilts are degrees below horizontal (positive = aimed down). Boxes hinge at their front
// corners, so each box's front face starts where the one above ends.

export const DEG = Math.PI / 180;

/** @typedef {{x: number, z: number}} Point */

/** Acoustic centre (middle of the front face) of a box hanging from `pivot` (its top front corner). */
export function centreOf(pivot, tiltDeg, heightM) {
  const t = tiltDeg * DEG;
  return { x: pivot.x - (heightM / 2) * Math.sin(t), z: pivot.z - (heightM / 2) * Math.cos(t) };
}

/** Bottom front corner of a box: the next box's pivot, and the lowest point of the box. */
export function pivotBelow(pivot, tiltDeg, heightM) {
  const t = tiltDeg * DEG;
  return { x: pivot.x - heightM * Math.sin(t), z: pivot.z - heightM * Math.cos(t) };
}

/** Tilt that points a box hanging from `pivot` at floor distance `targetX` on the listening plane. */
export function solveTilt(pivot, heightM, targetX, listenerZ) {
  let tilt = 0;
  // The centre moves slightly as the box tilts; a few fixed-point passes converge to < 1e-9°.
  for (let i = 0; i < 8; i++) {
    const c = centreOf(pivot, tilt, heightM);
    tilt = Math.atan2(c.z - listenerZ, targetX - c.x) / DEG;
  }
  return tilt;
}

/** Where a box's axis meets the listening plane; Infinity when it points at or above the horizon. */
export function aimDistance(centre, tiltDeg, listenerZ) {
  if (tiltDeg <= 0) return Infinity;
  return centre.x + (centre.z - listenerZ) / Math.tan(tiltDeg * DEG);
}

/** The presets either side of `angle` (equal when it hits one or falls outside the range). */
export function bracketPresets(presets, angle) {
  let lo = presets[0];
  let hi = presets[presets.length - 1];
  if (angle <= lo) return [lo, lo];
  if (angle >= hi) return [hi, hi];
  for (const p of presets) {
    if (p <= angle) lo = p;
    if (p >= angle) {
      hi = p;
      break;
    }
  }
  return [lo, hi];
}

/**
 * Hang the array top-down and pin every junction to an available preset.
 *
 * The top box takes its exact tilt (set by the fly-bar pick point). At each junction below, the
 * geometry asks for some splay; the junction gets one of the two presets either side of it,
 * whichever brings the box's absolute tilt closer to the tilt that would hit its own floor
 * target. Because that comparison starts from where the box above actually ended up, rounding
 * error carries into the next junction instead of piling up: the presets dither (0.2°, 1°,
 * 0.2°, 1° ... to average 0.6°) and the cumulative drift stays within half a preset step while
 * the wanted splay is inside the preset range. On a tie the smaller angle wins.
 *
 * Boxes whose bottom edge would hang below the listening plane cannot aim down at it; the hang
 * stops there and `truncated` reports how many targets were dropped.
 *
 * @param {object} p
 * @param {number} p.heightM
 * @param {number[]} p.presets   sorted ascending
 * @param {number} p.trimHeightM height of the top of the array
 * @param {number} p.listenerZ
 * @param {number[]} p.targets   floor aim distances, top box first
 */
export function hangArray({ heightM, presets, trimHeightM, listenerZ, targets }) {
  const minPreset = presets[0];
  const maxPreset = presets[presets.length - 1];
  const rows = [];
  let pivot = { x: 0, z: trimHeightM };
  let prevTilt = 0;
  let prevIdeal = 0;
  for (let k = 0; k < targets.length; k++) {
    const idealTiltDeg = solveTilt(pivot, heightM, targets[k], listenerZ);
    let tiltDeg = idealTiltDeg;
    let splayDeg = null;
    let wantedSplayDeg = null;
    if (k > 0) {
      wantedSplayDeg = idealTiltDeg - prevIdeal;
      const [lo, hi] = bracketPresets(presets, wantedSplayDeg);
      const needed = idealTiltDeg - prevTilt;
      splayDeg = Math.abs(needed - lo) <= Math.abs(needed - hi) + 1e-9 ? lo : hi;
      tiltDeg = prevTilt + splayDeg;
    }
    const bottom = pivotBelow(pivot, tiltDeg, heightM);
    if (bottom.z < listenerZ) break;
    const centre = centreOf(pivot, tiltDeg, heightM);
    rows.push({
      index: k + 1,
      splayDeg,
      wantedSplayDeg,
      tiltDeg,
      driftDeg: tiltDeg - idealTiltDeg,
      targetM: targets[k],
      aimM: aimDistance(centre, tiltDeg, listenerZ),
      centre,
      bottomZ: bottom.z,
      atMaxSplay: k > 0 && wantedSplayDeg > maxPreset,
      atMinSplay: k > 0 && wantedSplayDeg < minPreset,
    });
    pivot = bottom;
    prevTilt = tiltDeg;
    prevIdeal = idealTiltDeg;
  }
  return { rows, truncated: targets.length - rows.length };
}

/**
 * Splay each junction needs to hold floor spacing `s` at distance x, for boxes `dh` above the
 * listening plane (small-angle form). Moving one box down shifts the aim point by
 * splay·r²/dh (more tilt) plus h·x/dh (the box sits h lower), so
 *   splay = (s − h·x/dh)·dh/r².
 * Negative means even parallel boxes already land further apart than s.
 */
export function requiredSplayDeg(x, spacingM, dh, heightM) {
  const r2 = x * x + dh * dh;
  return (((spacingM - (heightM * x) / dh) * dh) / r2) / DEG;
}

/**
 * Angle-resolution limit: the distance beyond which even dithering cannot hold the spacing.
 *
 * Scanning outward from the front row, the spacing fails at the first distance where either
 *  - the wanted splay drops below the smallest preset (the rigging cannot go flatter, so the
 *    error can no longer average out), or
 *  - dithering between the two presets either side of the wanted splay leaves an aim error
 *    (half the preset gap, projected onto the floor as gap/2·r²/dh) larger than
 *    tolerance × spacing.
 * Uses the top box's height above the plane, since the boxes aimed furthest hang highest.
 *
 * @returns {{limitM: number, reason: 'min-splay'|'resolution'|null}}
 */
export function holdLimit({ dh, spacingM, presets, heightM, tolerance, fromM }) {
  const step = 0.05;
  for (let x = Math.max(fromM, step); x <= 500; x += step) {
    const wanted = requiredSplayDeg(x, spacingM, dh, heightM);
    if (wanted < presets[0]) return { limitM: x, reason: 'min-splay' };
    const [lo, hi] = bracketPresets(presets, wanted);
    const aimErrorM = ((hi - lo) / 2) * DEG * ((x * x + dh * dh) / dh);
    if (aimErrorM > tolerance * spacingM) return { limitM: x, reason: 'resolution' };
  }
  return { limitM: Infinity, reason: null };
}
