// Genre targets. These are starting assumptions to calibrate against real shows, not
// standards: change them here and every mode picks them up.
//
// spacingM is the floor distance between neighbouring box aim points. Tighter spacing puts
// more boxes on each metre of floor, so more level and headroom (about +3 dB per halving).

/**
 * @typedef {object} Genre
 * @property {string} id
 * @property {string} label
 * @property {number} targetLAeqDbA  Target LAeq at the mix position.
 * @property {number} headroomDb     Peak capability required above the LAeq target.
 * @property {number} spacingM       Floor spacing between box aim points.
 * @property {number|null} lfTargetDbC  Low-frequency target; needs subs, not evaluated in v1.
 */

/** @type {Record<string, Genre>} */
export const GENRES = {
  classical: {
    id: 'classical',
    label: 'Classical',
    targetLAeqDbA: 96,
    headroomDb: 10,
    spacingM: 5,
    lfTargetDbC: null,
  },
  rock: {
    id: 'rock',
    label: 'Rock',
    targetLAeqDbA: 102,
    headroomDb: 12,
    spacingM: 3,
    lfTargetDbC: null,
  },
  pop: {
    id: 'pop',
    label: 'Pop',
    targetLAeqDbA: 102,
    headroomDb: 12,
    spacingM: 2.5,
    lfTargetDbC: 115,
  },
  edm: {
    id: 'edm',
    label: 'EDM',
    targetLAeqDbA: 104,
    headroomDb: 14,
    spacingM: 2,
    lfTargetDbC: 118,
  },
};
