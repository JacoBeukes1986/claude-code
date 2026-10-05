// Box profiles. Anything a splay or rigging decision depends on lists its source, and any field
// not yet checked against the manufacturer's rigging manual is listed in `unverified`. The
// calculator prints those fields as a warning on every result, so remove an entry only after
// checking the number against the manual.

/**
 * @typedef {object} BoxProfile
 * @property {string} id
 * @property {string} name
 * @property {number} maxSplDb          Peak SPL of one box at 1 m (unweighted).
 * @property {number} coverageHDeg      Nominal horizontal coverage (-6 dB).
 * @property {number} coverageVDeg      Nominal vertical coverage (-6 dB) of a single box.
 * @property {number} heightM           Front height of the enclosure, i.e. hinge-to-hinge pitch.
 * @property {number} depthM            Enclosure depth (drawing only).
 * @property {number} weightKg
 * @property {number[]} splayPresetsDeg Inter-box angles the rigging can be pinned at.
 * @property {{flyBar: string, flyBarWeightKg: number, maxBoxes: number, note: string}} rigging
 * @property {{offsetDb: number, source: string|null}} splCalibration
 *   Added to every modelled SPL. Derive it from an RCF Shape prediction or a measured show
 *   (predicted minus modelled at the same position) and name that reference in `source`.
 * @property {Record<string, {label: string, note: string}>} unverified
 *   Fields not yet checked against the manual, with a readable label and why.
 * @property {string[]} sources
 */

/** @type {BoxProfile} */
export const HDL_30_A = {
  id: 'rcf-hdl-30-a',
  name: 'RCF HDL 30-A',
  maxSplDb: 137,
  coverageHDeg: 100,
  coverageVDeg: 15,
  heightM: 0.293,
  depthM: 0.502,
  weightKg: 25,
  // Rear suspension bracket positions, HDL 30-A owner manual p. 26.
  splayPresetsDeg: [0.2, 0.7, 1.7, 2.7, 3.7, 5, 7, 10, 14],
  rigging: {
    flyBar: 'FL-B HDL 30',
    flyBarWeightKg: 21.2,
    maxBoxes: 20,
    note:
      'RCF rates the fly bar for up to 20 modules, but the safety factor depends on the ' +
      'configuration (tilt and splays). Check every hang in RCF Easy Shape Designer before ' +
      'quoting or flying it. This calculator does not compute rigging loads.',
  },
  splCalibration: { offsetDb: 0, source: null },
  unverified: {
    heightM: {
      label: 'hinge pitch',
      note: '293 mm is the catalogue cabinet height; confirm the hinge pitch in the manual.',
    },
    maxBoxes: {
      label: 'fly-bar limit',
      note:
        '20 modules is from RCF product listings; confirm the safety factor and any tilt ' +
        'limits in the manual / Easy Shape Designer.',
    },
  },
  sources: [
    'RCF HDL 30-A product page (max SPL 137 dB, 100° x 15°, 50 Hz-20 kHz, 2200 W, 293 x 705 x 502 mm, 25 kg)',
    'RCF FL-B HDL 30 fly bar listing (up to 20 x HDL 30-A or HDL 38-AS, 21.2 kg)',
    'HDL 30-A owner manual p. 26: splay presets 0.2, 0.7, 1.7, 2.7, 3.7, 5, 7, 10, 14°',
    'HDL 30-A owner manual excerpts (safety factor configuration-dependent)',
  ],
};

export const BOXES = { [HDL_30_A.id]: HDL_30_A };
