# Line array calculator (RCF HDL 30-A, v1)

Module for the rig builder / quoting app. Given a genre and either a box count (mode A) or a room
depth (mode B), it works out the splay list, coverage depth, estimated SPL at the front row, mix
position and back, and the limit warnings. Plain JavaScript (ES modules), no dependencies, so it runs in
Node and in the browser and can be dropped into the app as is.

```
node cli.js                                   # every genre, both modes, default venue
node cli.js --mode A --genre rock --boxes 12
node cli.js --mode B --genre edm --depth 45 --trim 10 --noise-limit 100
node cli.js --help                            # all options; add --json for raw results
node --test                                   # 21 tests
python3 -m http.server 8000                   # then open http://localhost:8000 for the UI
```

```js
import { calculate } from './src/index.js';
const r = calculate({ mode: 'B', genre: 'pop', roomDepthM: 35, trimHeightM: 9 });
r.boxCount, r.rows /* splay list */, r.coverage, r.spl.foh, r.warnings;
```

## Check these before trusting the output

The splay presets come from the HDL 30-A owner manual (rear suspension bracket, p. 26). The rest
comes from search snippets and retailer listings, because RCF's site was blocked from the build
environment. Every result flags these until you clear them in [`src/boxes.js`](src/boxes.js):

| Field | Value used | Status |
|---|---|---|
| Splay presets | 0.2°, 0.7°, 1.7°, 2.7°, 3.7°, 5°, 7°, 10°, 14° | Verified: manual p. 26. |
| Hinge pitch | 293 mm (catalogue height) | Confirm in the manual. |
| Fly bar | FL-B HDL 30, 20 boxes max, 21.2 kg | RCF says the safety factor depends on the configuration. Check every hang in RCF Easy Shape Designer; this tool does not compute rigging loads. |
| Box | 137 dB peak @ 1 m, 100° × 15°, 25 kg | RCF spec. |

There is no 0° position: the top of the array can never be truly parallel, and that 0.2°
minimum is what sets the far-field limit below.

## How it works

**Geometry** (`src/geometry.js`). The array hangs from the trim height (top of the array) and the
boxes hinge at their front corners. Mode A anchors the bottom box on the front row and steps
back one spacing per box. Mode B anchors the top box on the back row and uses enough boxes to
reach the front row at no more than the genre spacing. The top box gets its exact tilt from the
fly-bar pick point. Each junction below gets one of the two presets either side of the splay the
geometry asks for: whichever lands that box's tilt closest to its own floor target. Rounding error
carries forward instead of piling up, so presets dither (0.2/0.7/0.2/0.7…) and cumulative drift
stays within half a preset step. The splay list shows the drift per box.

**Limits.** Mode B caps the box count at whichever comes first:

1. **Fly-bar rating**: 20 boxes.
2. **Angle-resolution limit**: the distance beyond which an aim point can no longer be kept
   within `holdTolerance × spacing` of its target (default 0.5, so each aim point stays nearer its
   own target than its neighbour's). It fails one of two ways. Either the smallest preset
   already spreads neighbouring aim points wider than the spacing (`0.2°·r²/Δh + h·x/Δh > s`), or
   the gap between the presets either side of the wanted splay is too coarse even when dithered
   (`gap/2 · r²/Δh > tolerance · s`).
3. **Trim height** (added, see below): boxes that would hang below ear height are dropped.

When capped, the spacing is kept and coverage stops short of the back, with a note to cover the
rest with delays (or, for a rigging cap, the wider spacing that would reach the back and its level
cost).

**SPL** (`src/acoustics.js`). Each box is a point source at its 137 dB peak spec with a Gaussian
15° vertical pattern, inverse-square loss and ISO 9613-1 air absorption (20 °C, 50 % RH), and
the boxes are summed on an energy basis. Max LAeq is that peak, A-weighted (−2.4 dB for a pink-noise-like
programme), less the genre headroom. With an L/R pair, both hangs are summed on the centre
line, each with its horizontal off-axis loss. Mid-floor, this reproduces the energy-density
result `L ≈ Lmax + 10·log(0.754·θv / (s·Δh))`, where Δh is the height of the boxes covering
that spot above the ears: halving the spacing gains about 3 dB. Every estimate carries a confidence level:
front row is always low, and nothing is above medium until calibrated.

**Warnings**: rigging limit, trim limit, resolution limit / cap, front gap (bottom boxes at
max splay cannot reach the front row), aim misses, headroom shortfall at the mix position, noise
limit, deep room, LF target needing subs, short array, unverified data.

## Calibrating

- **Genres** ([`src/genres.js`](src/genres.js)): target LAeq, headroom and spacing are starting
  assumptions; adjust them against real shows.
- **SPL offset** (`splCalibration` in `src/boxes.js`): run the same configuration in RCF Shape
  or measure a show, set `offsetDb` to (reference − modelled) at the same position, and name the
  reference in `source`. Confidence then goes up one level.
- **Model dials** ([`src/model.js`](src/model.js)): aim tolerance, directivity floor, air
  conditions, deep-room thresholds.

## Where this departs from the brief

- **Distance loss.** Taken literally (single box plus a coupling gain, then 3 dB / 6 dB per
  doubling from 1 m), the brief's rule puts every box's output on one axis. For 12 boxes at 9 m
  trim it predicts about 132 dB peak at 24 m; the energy sum gives about 116 dB per hang,
  because a curved array spreads that output over its whole vertical coverage. The
  front-to-back slope comes out similar (9 dB vs 8 dB from 6 m to 36 m), so the rule's shape
  was fine and its level was not. The energy sum also makes level depend on spacing and trim
  height, which the rule cannot see, and it still gives 3 dB per doubling along a straight
  section.
- **Published array figures.** RCF Shape predictions are specific to one configuration, so a
  lookup table keyed on box count would mislead. Calibrating one offset against a reference
  configuration carries over to others.
- **A third cap.** The trim height limits the box count before the fly bar does in low rooms.
- **dBA.** The 137 dB spec is unweighted; the A-weighting correction is applied before
  comparing with LAeq targets.
- **L/R pair.** Genre targets are at the mix position, where both hangs contribute (up to
  +3 dB), so the pair is modelled; single hang is an option.
- **Deep room** is flagged when the level falls more than 6 dB from the mix position to the
  back (even spacing alone loses about 4–6 dB), or when the top box grazes the back row below 7°.
  At that angle crowd absorption adds loss this model leaves out.

## Not in v1

Subwoofers (HDL 38-AS) and LF/dBC targets, tapered spacing, rigging load calculation, other
boxes. Adding a box means adding a profile to `src/boxes.js`.
