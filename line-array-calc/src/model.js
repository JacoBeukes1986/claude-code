// Model dials: the assumptions behind the SPL estimate and the limit checks, kept in one place
// so they can be calibrated without touching the maths.

export const MODEL = {
  // How far (as a fraction of the target spacing) a box's aim point may land from its target
  // before the spacing counts as "not held". Drives the angle-resolution limit.
  holdTolerance: 0.5,

  // Vertical directivity of one box: Gaussian, -6 dB at +/- coverageVDeg/2, never below this
  // floor (real boxes leak mid and low frequencies well outside the HF pattern).
  directivityFloorDb: -20,

  // Air absorption (ISO 9613-1) at these conditions.
  air: { temperatureC: 20, humidityPct: 50 },

  // Deep-room flag: raised when the modelled level at the back falls more than maxDropDb below
  // the mix position, or when the top box grazes the back row at less than minGrazingDeg
  // (crowd absorption and reflections at grazing incidence are not modelled).
  deepRoom: { maxDropDb: 6, minGrazingDeg: 7 },

  // Distance mode widens the genre spacing up to this factor when the array cannot otherwise
  // reach the back; the level check then decides whether the result still meets the spec.
  maxSpacingFactor: 3,

  // Arrays shorter than this get an info note about limited low-mid pattern control.
  shortArrayBoxes: 4,

  // Warn when the bottom of the array hangs less than this far above the listening plane.
  lowArrayClearanceM: 1,
};

export const DEFAULTS = {
  mode: 'A',
  genre: 'rock',
  boxId: 'rcf-hdl-30-a',
  boxCount: 12,
  roomDepthM: 40,
  trimHeightM: 9, // top of the array (underside of the fly bar)
  listenerHeightM: 1.7, // standing ear height; use about 1.2 for seated
  frontRowM: 3, // horizontal distance from the array face to the first listeners
  fohM: null, // null = two thirds of the way to the back
  hangs: 2, // L/R pair
  hangSpacingM: 12, // distance between the L and R hangs
  noiseLimitDbA: null, // e.g. 100 for a 15-min LAeq licence condition
  spacingM: null, // null = genre spacing
};
