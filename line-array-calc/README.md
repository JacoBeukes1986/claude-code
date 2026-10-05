# Line array calculator (RCF HDL and TT+ GTX, v1)

Module for the rig builder / quoting app. Given a genre, a speaker and either a box count
(mode A) or a room depth (mode B), it works out the splay list, coverage depth, estimated SPL at
the front row, mix position and back, and the limit warnings. In mode B it can also run every
speaker and say which ones meet the spec. Plain JavaScript (ES modules), no dependencies, so it
runs in Node and in the browser and can be dropped into the app as is.

```
node cli.js                                         # every genre, both modes, HDL 30-A
node cli.js --mode A --genre rock --boxes 12 --box hdl28
node cli.js --mode B --genre edm --depth 45 --box gtx12
node cli.js --mode B --genre edm --depth 45 --compare   # which speakers meet the spec
node cli.js --help                                  # all options; add --json for raw results
node --test                                         # 25 tests
python3 -m http.server 8000                         # then open http://localhost:8000 for the UI
```

```js
import { calculate, compareBoxes } from './src/index.js';
const r = calculate({ mode: 'B', genre: 'pop', roomDepthM: 35, boxId: 'hdl30' });
r.boxCount, r.rows /* splay list */, r.coverage, r.spl.foh, r.warnings;
compareBoxes({ mode: 'B', genre: 'edm', roomDepthM: 45 }); // [{ box, result, meetsSpec, reasons }]
```

## Speakers and how far to trust their data

RCF's and TT+ Audio's sites were blocked from the build environment. Two owner manuals were
readable (HDL 30-A and HDL 50-A, 2017 editions), plus your photo of the HDL 30-A bracket; the
rest is from product listings. Every result lists the unverified fields for its speaker until
you clear them in [`src/boxes.js`](src/boxes.js).

| Speaker | Max SPL | Coverage | Height | Weight | Per fly bar | Splay presets |
|---|---|---|---|---|---|---|
| HDL 26-A | 133 dB | 100° × 10° | 237 mm | 13.5 kg | 16 | **Stand-in**: 1° minimum known, rest whole degrees |
| HDL 28-A | 135 dB | 100° × 15° | 294 mm | 20.6 kg | 20 | **Stand-in**: HDL 30-A bracket |
| HDL 30-A | 137 dB | 100° × 10°* | 293 mm | 25 kg | 20 | Manual: 0.2, 0.7, 1.7, 2.7, 3.7, 5, 7, 10, 14° |
| HDL 50-A | 140 dB | 90° × 10° | 366 mm | 56 kg | 20 | Manual: 0.2, 0.7, 1.4, 2.2, 3, 4, 5, 6, 7, 10° |
| HDL 50-A 4K | 143 dB | 90° × 10° | 366 mm | 58.4 kg | 20 | Assumed same as HDL 50-A |
| GTX 7C | 140 dB | 120° × 10° | 248 mm | 24.5 kg | 16 | **Stand-in**: HDL 30-A bracket |
| GTX 10 | 143 dB | 110° × 15° | 337 mm | 31.5 kg | 24 | **Stand-in**: HDL 30-A bracket |
| GTX 12 | 148 dB | 90° × 10° | 366 mm | 64.2 kg | 24 | **Stand-in**: HDL 50-A bracket |

\* The HDL 30-A manual gives 10° vertical; product listings give 15°. 10° is used; 15° would
raise its levels by about 1.8 dB. The GTX boxes are passive; their SPL assumes XPS 16K
amplification. Fly-bar weights are unknown except the HDL 30-A's (21.2 kg), so hang weights
are boxes only for the others. RCF's manuals suggest a single pick point for up to 8 boxes.

The fly-bar figures are maximums. The safety factor depends on the fly-bar tilt and the splays,
so check every hang in the manufacturer's prediction software; this tool does not compute
rigging loads.

## How it works

**Geometry** (`src/geometry.js`). The array hangs from the trim height (top of the array) and the
boxes hinge at their front corners. Mode A anchors the bottom box on the front row and steps
back one spacing per box. Mode B anchors the top box on the back row and uses enough boxes to
reach the front row at no more than the genre spacing. The top box gets its exact tilt from the
fly-bar pick point. Each junction below gets one of the two presets either side of the splay the
geometry asks for: whichever lands that box's tilt closest to its own floor target. Rounding error
carries forward instead of piling up, so presets dither (0.2/0.7/0.2/0.7…) and cumulative drift
stays within half a preset step. The splay list shows the drift per box.

**Limits.** The box count is capped at whichever comes first:

1. **Fly-bar rating** for that speaker.
2. **Angle-resolution limit**: the distance beyond which an aim point can no longer be kept
   within `holdTolerance × spacing` of its target (default 0.5, so each aim point stays nearer its
   own target than its neighbour's). It fails one of two ways. Either the smallest preset
   already spreads neighbouring aim points wider than the spacing (`min splay·r²/Δh + h·x/Δh > s`),
   or the gap between the presets either side of the wanted splay is too coarse even when
   dithered (`gap/2 · r²/Δh > tolerance · s`). Tall boxes hit the first case sooner, because
   even parallel boxes land `h·x/Δh` apart.
3. **Trim height**: boxes that would hang below ear height are dropped.

**Distance mode reaches for the back.** If the genre spacing hits a cap, the spacing is widened
(up to 3×, `maxSpacingFactor` in `src/model.js`) until the array reaches the back. That costs
level (about 3 dB per doubling of spacing), so the result still has to pass the level check
below. A spacing you set by hand is never widened; a capped array then keeps its spacing and
coverage stops short, with a note to cover the rest with delays.

**Which speakers meet the spec** (`compareBoxes`). In mode B a speaker meets the spec when its
array reaches the room depth without a cap and the mix position gets the genre LAeq with its
headroom. The UI greys out the rest, with the reason on each card. If your chosen speaker
fails, it shows the first one in the list (smallest first within each range) that passes, and
says so.

**SPL** (`src/acoustics.js`). Each box is a point source at its peak spec with a Gaussian
vertical pattern of its rated coverage, inverse-square loss and ISO 9613-1 air absorption
(20 °C, 50 % RH), and the boxes are summed on an energy basis. Max LAeq is that peak,
A-weighted (−2.4 dB for a pink-noise-like programme), less the genre headroom. With an L/R pair,
both hangs are summed on the centre line, each with its horizontal off-axis loss. Mid-floor,
this reproduces the energy-density result `L ≈ Lmax + 10·log(0.754·θv / (s·Δh))`, where Δh is
the height of the boxes covering that spot above the ears: halving the spacing gains about
3 dB. Every estimate carries a confidence level: front row is always low, and nothing is above
medium until calibrated.

**Warnings**: rigging limit, trim limit, resolution limit / cap, spacing widened, front gap
(bottom boxes at max splay cannot reach the front row), aim misses, headroom shortfall at the
mix position, noise limit, deep room, LF target needing subs, short array, unverified data.

## Calibrating

- **Genres** ([`src/genres.js`](src/genres.js)): target LAeq, headroom and spacing are starting
  assumptions; adjust them against real shows.
- **SPL offset** (`splCalibration` per speaker in `src/boxes.js`): run the same configuration in
  the manufacturer's prediction software or measure a show, set `offsetDb` to (reference −
  modelled) at the same position, and name the reference in `source`. Confidence then goes up
  one level. Since the pass/fail greying rests on these levels, calibrating the speakers you
  own matters most.
- **Model dials** ([`src/model.js`](src/model.js)): aim tolerance, spacing widening factor,
  directivity floor, air conditions, deep-room thresholds.

## Where this departs from the brief

- **Spacing per genre, not per speaker.** A fixed genre spacing is a level proxy for one box.
  Applied to every speaker it holds big boxes to small-box density, and their taller cabinets
  then hit the resolution limit sooner: at 2 m spacing even a GTX 12 "could not" do a 40 m EDM
  floor despite 7 dB to spare. Widening the spacing until the array reaches the back, then
  checking the level, fixes that.
- **Distance loss.** Taken literally (single box plus a coupling gain, then 3 dB / 6 dB per
  doubling from 1 m), the brief's rule puts every box's output on one axis. For 12 HDL 30-A at
  9 m trim it predicts about 132 dB peak at 24 m; the energy sum gives about 115 dB per hang,
  because a curved array spreads that output over its whole vertical coverage. The
  front-to-back slope comes out similar (9 dB vs 8 dB from 6 m to 36 m), so the rule's shape
  was fine and its level was not. The energy sum also makes level depend on spacing and trim
  height, which the rule cannot see.
- **Published array figures.** Prediction-software results are specific to one configuration,
  so a lookup table keyed on box count would mislead. Calibrating one offset per speaker against
  a reference configuration carries over to others.
- **A third cap.** The trim height limits the box count before the fly bar does in low rooms.
- **dBA.** Max SPL specs are unweighted; the A-weighting correction is applied before comparing
  with LAeq targets.
- **L/R pair.** Genre targets are at the mix position, where both hangs contribute (up to
  +3 dB), so the pair is modelled; single hang is an option.
- **Deep room** is flagged when the level falls more than 6 dB from the mix position to the
  back (even spacing alone loses about 4 dB), or when the top box grazes the back row below 7°.
  At that angle crowd absorption adds loss this model leaves out.

## Not in v1

Subwoofers (HDL 38-AS and the GTS range) and LF/dBC targets, tapered spacing, rigging load
calculation. Adding a speaker means adding a profile to `src/boxes.js` and `BOX_LIST`.
