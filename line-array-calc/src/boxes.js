// Box profiles. Anything a splay or rigging decision depends on lists its source, and any field
// not yet checked against the manufacturer's rigging manual is listed in `unverified`. The
// calculator prints those fields as a warning on every result, so remove an entry only after
// checking the number against the manual.

/**
 * @typedef {object} BoxProfile
 * @property {string} id
 * @property {string} name
 * @property {string} family            Product line, for grouping in the UI.
 * @property {number} maxSplDb          Peak SPL of one box at 1 m (unweighted).
 * @property {number} coverageHDeg      Nominal horizontal coverage (-6 dB).
 * @property {number} coverageVDeg      Nominal vertical coverage (-6 dB) of a single box.
 * @property {number} heightM           Front height of the enclosure, i.e. hinge-to-hinge pitch.
 * @property {number} depthM            Enclosure depth (drawing only).
 * @property {number} weightKg
 * @property {number[]} splayPresetsDeg Inter-box angles the rigging can be pinned at.
 * @property {{flyBar: string, flyBarWeightKg: number|null, maxBoxes: number, note: string}} rigging
 * @property {{offsetDb: number, source: string|null}} splCalibration
 *   Added to every modelled SPL. Derive it from an RCF Shape prediction or a measured show
 *   (predicted minus modelled at the same position) and name that reference in `source`.
 * @property {Record<string, {label: string, note: string}>} unverified
 *   Fields not yet checked against the manual, with a readable label and why.
 * @property {string[]} sources
 */

// Rear-bracket angle positions read off the owner manuals.
const HDL_30_BRACKET = [0.2, 0.7, 1.7, 2.7, 3.7, 5, 7, 10, 14];
const HDL_50_BRACKET = [0.2, 0.7, 1.4, 2.2, 3, 4, 5, 6, 7, 10];

const RIGGING_NOTE =
  'The safety factor depends on the configuration (fly-bar tilt and splays). Check every hang in ' +
  'the manufacturer’s prediction software before quoting or flying it. This calculator does not ' +
  'compute rigging loads.';

const placeholderPresets = (standIn) => ({
  label: 'splay presets',
  note: `Not found online; the ${standIn} bracket is used as a stand-in. Copy the real list from the rigging manual.`,
});

const listingOnly = (what) => ({
  label: what,
  note: `${what[0].toUpperCase()}${what.slice(1)} is from product listings only; confirm in the manual.`,
});

/** @type {BoxProfile} */
export const HDL_26_A = {
  id: 'rcf-hdl-26-a',
  name: 'RCF HDL 26-A',
  family: 'RCF HDL',
  maxSplDb: 133,
  coverageHDeg: 100,
  coverageVDeg: 10,
  heightM: 0.237,
  depthM: 0.377,
  weightKg: 13.5,
  // RCF's description says arrays start at 1°; the rest of the list is unknown.
  splayPresetsDeg: [1, 2, 3, 4, 5, 6, 7, 8, 10],
  rigging: { flyBar: 'HDL 26 fly bar', flyBarWeightKg: null, maxBoxes: 16, note: RIGGING_NOTE },
  splCalibration: { offsetDb: 0, source: null },
  unverified: {
    splayPresetsDeg: {
      label: 'splay presets',
      note: 'Only the 1° minimum is known (RCF product text); whole degrees to 10° are a stand-in. Copy the real list from the rigging manual.',
    },
    maxBoxes: listingOnly('fly-bar limit (16)'),
    heightM: listingOnly('cabinet height'),
  },
  sources: ['Product listings: 133 dB, 100° x 10°, 237 x 470 x 377 mm, 13.5 kg, up to 16 per fly bar'],
};

/** @type {BoxProfile} */
export const HDL_28_A = {
  id: 'rcf-hdl-28-a',
  name: 'RCF HDL 28-A',
  family: 'RCF HDL',
  maxSplDb: 135,
  coverageHDeg: 100,
  coverageVDeg: 15,
  heightM: 0.294,
  depthM: 0.491,
  weightKg: 20.6,
  splayPresetsDeg: HDL_30_BRACKET,
  rigging: { flyBar: 'FL-B HDL 28', flyBarWeightKg: null, maxBoxes: 20, note: RIGGING_NOTE },
  splCalibration: { offsetDb: 0, source: null },
  unverified: {
    splayPresetsDeg: placeholderPresets('HDL 30-A'),
    maxBoxes: listingOnly('fly-bar limit (20)'),
    heightM: listingOnly('cabinet height'),
    coverageVDeg: listingOnly('vertical coverage (15°)'),
  },
  sources: ['Product listings: 135 dB, 100° x 15°, 294 x 569 x 491 mm, 20.6 kg; FL-B HDL 28 for up to 20'],
};

/** @type {BoxProfile} */
export const HDL_30_A = {
  id: 'rcf-hdl-30-a',
  name: 'RCF HDL 30-A',
  family: 'RCF HDL',
  maxSplDb: 137,
  coverageHDeg: 100,
  coverageVDeg: 10,
  heightM: 0.293,
  depthM: 0.502,
  weightKg: 25,
  splayPresetsDeg: HDL_30_BRACKET,
  rigging: {
    flyBar: 'FL-B HDL 30',
    flyBarWeightKg: 21.2,
    maxBoxes: 20,
    note: `${RIGGING_NOTE} RCF suggests a single pick point for up to 8 boxes.`,
  },
  splCalibration: { offsetDb: 0, source: null },
  unverified: {
    coverageVDeg: {
      label: 'vertical coverage',
      note: 'The owner manual (2017) gives 10°, product listings give 15°. 10° is used; 15° would raise every level by about 1.8 dB.',
    },
  },
  sources: [
    'HDL 30-A owner manual (2017): 137 dB, 100° x 10°, 293 x 705 x 502 mm, 25 kg, FLYBAR HDL 30-A for up to 20 (p/n 13360380)',
    'HDL 30-A owner manual p. 26 (newer edition) and p. 22 (2017): splay presets 0.2-14°',
    'Fly-bar weight 21.2 kg from product listings',
  ],
};

/** @type {BoxProfile} */
export const HDL_50_A = {
  id: 'rcf-hdl-50-a',
  name: 'RCF HDL 50-A',
  family: 'RCF HDL',
  maxSplDb: 140,
  coverageHDeg: 90,
  coverageVDeg: 10,
  heightM: 0.366,
  depthM: 0.502,
  weightKg: 56,
  splayPresetsDeg: HDL_50_BRACKET,
  rigging: {
    flyBar: 'FLYBAR HDL 50-A',
    flyBarWeightKg: null,
    maxBoxes: 20,
    note: `${RIGGING_NOTE} RCF suggests a single pick point for up to 8 boxes.`,
  },
  splCalibration: { offsetDb: 0, source: null },
  unverified: {},
  sources: ['HDL 50-A owner manual (2017): 140 dB, 90° x 10°, 366 x 1171 x 502 mm, 56 kg, splay presets 0.2-10°, FLYBAR HDL 50-A for up to 20 (p/n 13360334)'],
};

/** @type {BoxProfile} */
export const HDL_50_A_4K = {
  id: 'rcf-hdl-50-a-4k',
  name: 'RCF HDL 50-A 4K',
  family: 'RCF HDL',
  maxSplDb: 143,
  coverageHDeg: 90,
  coverageVDeg: 10,
  heightM: 0.366,
  depthM: 0.502,
  weightKg: 58.4,
  splayPresetsDeg: HDL_50_BRACKET,
  rigging: { flyBar: 'FL-B HDL 50', flyBarWeightKg: null, maxBoxes: 20, note: RIGGING_NOTE },
  splCalibration: { offsetDb: 0, source: null },
  unverified: {
    splayPresetsDeg: {
      label: 'splay presets',
      note: 'Assumed to match the HDL 50-A bracket (same cabinet); confirm in the 4K manual.',
    },
    maxBoxes: listingOnly('fly-bar limit (20)'),
  },
  sources: ['Product listings: 143 dB, 90° x 10°, 366 x 1171 x 502 mm, 58.4 kg, up to 20 per fly bar'],
};

/** @type {BoxProfile} */
export const GTX_7C = {
  id: 'tt-gtx-7c',
  name: 'TT+ GTX 7C',
  family: 'TT+ Audio GTX',
  maxSplDb: 140,
  coverageHDeg: 120,
  coverageVDeg: 10,
  heightM: 0.248,
  depthM: 0.433,
  weightKg: 24.5,
  splayPresetsDeg: HDL_30_BRACKET,
  rigging: {
    flyBar: 'FLB60721',
    flyBarWeightKg: null,
    maxBoxes: 16,
    note: `${RIGGING_NOTE} Passive cardioid box: the SPL assumes the recommended XPS 16K amplification.`,
  },
  splCalibration: { offsetDb: 0, source: null },
  unverified: {
    splayPresetsDeg: placeholderPresets('HDL 30-A'),
    maxBoxes: listingOnly('fly-bar limit (16)'),
    heightM: listingOnly('cabinet height'),
  },
  sources: ['TT+ Audio product pages and press: 140 dB, 120° x 10°, 248 x 595 x 433 mm, 24.5 kg; FLB60721 for up to 16'],
};

/** @type {BoxProfile} */
export const GTX_10 = {
  id: 'tt-gtx-10',
  name: 'TT+ GTX 10',
  family: 'TT+ Audio GTX',
  maxSplDb: 143,
  coverageHDeg: 110,
  coverageVDeg: 15,
  heightM: 0.337,
  depthM: 0.4835,
  weightKg: 31.5,
  splayPresetsDeg: HDL_30_BRACKET,
  rigging: {
    flyBar: 'GTX 10 fly bar',
    flyBarWeightKg: null,
    maxBoxes: 24,
    note: `${RIGGING_NOTE} Passive box: the SPL assumes the recommended XPS 16K amplification.`,
  },
  splCalibration: { offsetDb: 0, source: null },
  unverified: {
    splayPresetsDeg: placeholderPresets('HDL 30-A'),
    maxBoxes: listingOnly('fly-bar limit (24)'),
    heightM: listingOnly('cabinet height'),
  },
  sources: ['TT+ Audio spec sheet via listings: 143 dB, 110° x 15°, 337 x 750 x 483.5 mm, 31.5 kg, up to 24 per fly bar'],
};

/** @type {BoxProfile} */
export const GTX_12 = {
  id: 'tt-gtx-12',
  name: 'TT+ GTX 12',
  family: 'TT+ Audio GTX',
  maxSplDb: 148,
  coverageHDeg: 90,
  coverageVDeg: 10,
  heightM: 0.366,
  depthM: 0.5406,
  weightKg: 64.2,
  splayPresetsDeg: HDL_50_BRACKET,
  rigging: {
    flyBar: 'GTX 12 fly bar',
    flyBarWeightKg: null,
    maxBoxes: 24,
    note: `${RIGGING_NOTE} Passive box: the SPL assumes the recommended XPS 16K amplification.`,
  },
  splCalibration: { offsetDb: 0, source: null },
  unverified: {
    splayPresetsDeg: placeholderPresets('HDL 50-A'),
    maxBoxes: listingOnly('fly-bar limit (24)'),
    heightM: listingOnly('cabinet height'),
  },
  sources: ['TT+ Audio spec sheet via listings: 148 dB, 90° x 10°, 366 x 1177.5 x 540.6 mm, 64.2 kg, up to 24 per fly bar'],
};

/** Smallest to largest within each family; the UI lists them in this order. */
export const BOX_LIST = [HDL_26_A, HDL_28_A, HDL_30_A, HDL_50_A, HDL_50_A_4K, GTX_7C, GTX_10, GTX_12];

export const BOXES = Object.fromEntries(BOX_LIST.map((b) => [b.id, b]));

/**
 * Look a box up by id or a loose name: "hdl30", "HDL 50-A 4K", "gtx10", "gtx7". An exact name
 * (brand prefix and trailing "-A" optional) wins; otherwise a prefix that matches only one box.
 */
export function findBox(query) {
  if (!query) return undefined;
  if (BOXES[query]) return BOXES[query];
  const squash = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
  const key = squash(query);
  const forms = (b) => {
    const bare = squash(b.name).replace(/^(rcf|tt)/, '');
    return [squash(b.name), bare, bare.replace(/a(?=4k$|$)/, '')];
  };
  const exact = BOX_LIST.find((b) => forms(b).includes(key));
  if (exact) return exact;
  const partial = BOX_LIST.filter((b) => forms(b).some((f) => f.startsWith(key)));
  return partial.length === 1 ? partial[0] : undefined;
}
