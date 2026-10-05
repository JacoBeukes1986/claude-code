// Browser UI for the line array calculator. All maths lives in ./src; this file only reads the
// form, calls calculate() and draws the result.

import { calculate, GENRES } from './src/index.js';

const $ = (id) => document.getElementById(id);
const SVG_NS = 'http://www.w3.org/2000/svg';

const LEVEL_LABEL = { error: 'Error', warn: 'Warning', info: 'Note' };
const LEVEL_ICON = { error: '✖', warn: '!', info: 'i' };
const SHORT_CODE = {
  RIGGING_LIMIT: 'over rating',
  TRIM_LIMIT: 'trim limit',
  CAPPED: 'capped',
  RESOLUTION_LIMIT: 'resolution',
  FRONT_GAP: 'front gap',
  HEADROOM: 'short of target',
  DEEP_ROOM: 'deep room',
  LOW_ARRAY: 'low array',
  SPACING_MISS: 'aim misses',
  LF_NOT_EVALUATED: 'needs subs',
};

let last = null; // last good result, kept on screen (dimmed) while the form is invalid
let cross = null; // index into last.profile for the crosshair

function el(tag, props = {}, ...kids) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    node.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return node;
}

function sv(tag, attrs = {}, text) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) node.setAttribute(k, v);
  if (text != null) node.textContent = text;
  return node;
}

const f1 = (v) => (Number.isFinite(v) ? v.toFixed(1) : '∞');
const metres = (v) => (Number.isFinite(v) ? `${v.toFixed(1)} m` : '∞');
const signed = (v, d = 1) => {
  const s = Math.abs(v).toFixed(d);
  return Number(s) === 0 ? `±${s}` : `${v < 0 ? '−' : '+'}${s}`;
};
const badge = (level, label, icon) => el('span', { class: `badge ${level}` }, icon ? `${icon} ${label}` : label);

// ---------------------------------------------------------------- form

function buildGenreOptions() {
  const seg = $('genreSeg');
  for (const g of Object.values(GENRES)) {
    const input = el('input', { type: 'radio', name: 'genre', value: g.id, id: `genre-${g.id}`, checked: g.id === 'rock' });
    const opt = el(
      'span',
      { class: 'opt' },
      el('b', { text: g.label }),
      el('small', { text: `${g.targetLAeqDbA} dBA · ${g.headroomDb} dB · ${g.spacingM} m` }),
    );
    seg.append(el('label', {}, input, opt));
  }
}

function readInputs() {
  const fd = new FormData($('controls'));
  const num = (name) => {
    const v = fd.get(name);
    return v === null || String(v).trim() === '' ? null : Number(v);
  };
  return {
    mode: fd.get('mode'),
    genre: fd.get('genre'),
    boxCount: num('boxCount') ?? undefined,
    roomDepthM: num('roomDepthM') ?? undefined,
    trimHeightM: num('trimHeightM') ?? undefined,
    listenerHeightM: num('listenerHeightM') ?? undefined,
    frontRowM: num('frontRowM') ?? undefined,
    fohM: num('fohM'),
    hangs: num('hangs') ?? 2,
    hangSpacingM: num('hangSpacingM') ?? 0,
    noiseLimitDbA: num('noiseLimitDbA'),
    spacingM: num('spacingM'),
    holdTolerance: num('holdTolerance') ?? undefined,
  };
}

function update() {
  const inputs = readInputs();
  for (const node of document.querySelectorAll('[data-mode]')) node.hidden = node.dataset.mode !== inputs.mode;
  let r;
  try {
    r = calculate(inputs);
  } catch (err) {
    $('error').textContent = `${err.message} Showing the last valid result.`;
    $('error').hidden = false;
    $('results').style.opacity = last ? '0.45' : '';
    return;
  }
  $('error').hidden = true;
  $('results').style.opacity = '';
  last = r;
  cross = null;
  renderFlag(r);
  renderTiles(r);
  renderLegend(r);
  renderSection(r);
  renderWarnings(r);
  renderSpl(r);
  renderSplays(r);
  renderGenres(inputs);
  renderProfile(r);
  renderNotes(r);
}

// ---------------------------------------------------------------- summary

function renderFlag(r) {
  const labels = Object.values(r.box.unverified).map((v) => v.label);
  const flag = $('dataFlag');
  flag.hidden = labels.length === 0;
  if (labels.length) {
    const list = labels.length > 1 ? `${labels.slice(0, -1).join(', ')} and ${labels.at(-1)}` : labels[0];
    flag.replaceChildren(
      badge('warn', 'Unverified'),
      el('span', { text: `${list[0].toUpperCase()}${list.slice(1)} still to be checked against the HDL 30-A rigging manual.` }),
    );
  }
}

function renderTiles(r) {
  const tile = (k, v, s, cls) => el('div', { class: 'tile' }, el('span', { class: 'k', text: k }), el('span', { class: `v ${cls ?? ''}`, text: v }), el('span', { class: 's', text: s }));
  const boxesSub =
    r.mode === 'B'
      ? r.binding
        ? `${r.neededBoxes} needed, capped by the ${r.binding === 'trim' ? 'trim height' : r.binding === 'rigging' ? 'fly-bar rating' : 'angle-resolution limit'}`
        : `${r.neededBoxes} needed to reach ${metres(r.input.roomDepthM)}`
      : `${r.limits.maxUsefulBoxes} useful at this spacing · fly bar max ${r.limits.riggingMaxBoxes}`;
  const margin = r.target.fohMarginDb;
  $('tiles').replaceChildren(
    tile('Boxes per hang', String(r.boxCount), boxesSub),
    tile('Coverage', `${f1(r.coverage.startM)}–${f1(r.coverage.endM)} m`, `${f1(r.spacing.usedM)} m spacing · hold limit ${metres(r.limits.holdLimitM)}`),
    tile(
      'Mix position',
      `${signed(margin)} dB`,
      `${margin >= 0 ? 'Meets' : 'Short of'} ${r.target.laeqDbA} dBA with ${r.target.headroomDb} dB headroom at ${f1(r.spl.foh.distanceM)} m`,
      margin >= 0 ? 'good' : 'bad',
    ),
    tile('Hang', `${Math.round(r.rigging.hangWeightKg)} kg`, `${f1(r.rigging.arrayLengthM)} m long · bottom at ${f1(r.rigging.bottomEdgeM)} m · tilt ${f1(r.rigging.topTiltDeg)}°`),
  );
}

// ---------------------------------------------------------------- side view

function renderLegend(r) {
  const pair = r.input.hangs > 1;
  const item = (cls, text) => el('li', {}, el('span', { class: `key ${cls}` }), text);
  const items = [
    item('s1', pair ? 'L+R, centre line' : 'On axis'),
    pair && item('s2', 'One hang only'),
    item('ref', `Target ${r.target.laeqDbA} dBA`),
    item('aim', 'Aim line'),
    r.rows.some((x) => x.beyondHoldLimit) && item('aim dash', 'Aim past the hold limit'),
  ];
  $('legend').replaceChildren(...items.filter(Boolean));
}

function niceStep(span) {
  return span > 60 ? 20 : span > 30 ? 10 : 5;
}

function renderSection(r) {
  const svg = $('section');
  svg.replaceChildren();
  const width = Math.max(300, Math.round($('chart').clientWidth));
  const pad = { l: 46, r: 14, t: 14, b: 28 };
  const plotW = width - pad.l - pad.r;
  const ear = r.input.listenerHeightM;
  const xMin = -1;
  const reach = Math.max(r.spl.back.distanceM, Number.isFinite(r.coverage.endM) ? r.coverage.endM : 0, r.spl.foh.distanceM);
  const xMax = Math.ceil((reach * 1.05 + 1) / 5) * 5;
  const pxPerM = plotW / (xMax - xMin);
  const zMax = r.input.trimHeightM + 1;
  let zScale = pxPerM;
  let elevH = zMax * zScale;
  const minElev = 110;
  let exaggeration = 1;
  if (elevH < minElev) {
    exaggeration = minElev / elevH;
    zScale *= exaggeration;
    elevH = minElev;
  }
  const elevBottom = pad.t + elevH;
  const splTop = elevBottom + 30;
  const splH = 170;
  const splBottom = splTop + splH;
  const height = splBottom + pad.b;
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('width', width);
  svg.setAttribute('height', height);
  $('sectionNote').textContent = exaggeration > 1.05 ? `Side view stretched ×${exaggeration.toFixed(1)} vertically` : 'Side view to scale';

  const X = (x) => pad.l + (x - xMin) * pxPerM;
  const Z = (z) => elevBottom - z * zScale;

  // Audience zone and floor.
  const back = r.spl.back.distanceM;
  svg.append(
    sv('rect', { class: 'crowd', x: X(r.input.frontRowM), y: Z(ear), width: Math.max(0, X(back) - X(r.input.frontRowM)), height: Z(0) - Z(ear) }),
    sv('line', { class: 'floor', x1: X(xMin), x2: X(xMax), y1: Z(0), y2: Z(0) }),
    sv('line', { class: 'ear', x1: X(0), x2: X(xMax), y1: Z(ear), y2: Z(ear) }),
    sv('text', { x: X(xMax), y: Z(ear) - 4, 'text-anchor': 'end' }, `ear height ${f1(ear)} m`),
  );

  // Aim lines first so the boxes sit on top of them.
  const DEG = Math.PI / 180;
  for (const row of r.rows) {
    let x2 = row.aimM;
    let z2 = ear;
    if (!Number.isFinite(x2) || x2 > xMax) {
      x2 = xMax;
      z2 = row.centreHeightM - (xMax - row.centreX) * Math.tan(row.tiltDeg * DEG);
    }
    svg.append(sv('line', { class: `aim${row.beyondHoldLimit ? ' past' : ''}`, x1: X(row.centreX), y1: Z(row.centreHeightM), x2: X(x2), y2: Z(z2) }));
    if (row.targetM <= xMax) svg.append(sv('line', { class: 'tick', x1: X(row.targetM), x2: X(row.targetM), y1: Z(ear) - 3, y2: Z(ear) + 3 }));
  }

  // Fly bar and boxes, drawn from each box's acoustic centre and tilt.
  const h = r.box.heightM;
  const d = r.box.depthM ?? 0.5;
  svg.append(sv('rect', { class: 'flybar', x: X(-d - 0.1), y: Z(r.input.trimHeightM + 0.12), width: (d + 0.2) * pxPerM, height: Math.max(2, 0.12 * zScale) }));
  for (const row of r.rows) {
    const t = row.tiltDeg * DEG;
    const down = { x: -Math.sin(t), z: -Math.cos(t) };
    const axis = { x: Math.cos(t), z: -Math.sin(t) };
    const ft = { x: row.centreX - (h / 2) * down.x, z: row.centreHeightM - (h / 2) * down.z };
    const fb = { x: row.centreX + (h / 2) * down.x, z: row.centreHeightM + (h / 2) * down.z };
    const pts = [ft, fb, { x: fb.x - d * axis.x, z: fb.z - d * axis.z }, { x: ft.x - d * axis.x, z: ft.z - d * axis.z }];
    svg.append(sv('polygon', { class: 'boxshape', points: pts.map((p) => `${X(p.x).toFixed(1)},${Z(p.z).toFixed(1)}`).join(' ') }));
  }

  // Level panel.
  const headroom = r.target.headroomDb;
  const pair = r.input.hangs > 1;
  const series = [{ key: 'centrePeakDbA', cls: 'line1', dot: 'dot1', label: pair ? 'L+R centre' : 'On axis' }];
  if (pair) series.push({ key: 'hangPeakDbA', cls: 'line2', dot: 'dot2', label: 'One hang' });
  const values = r.profile.flatMap((p) => series.map((s) => p[s.key] - headroom));
  const top = Math.max(...values, r.target.laeqDbA);
  const yMax = Math.ceil((top + 1) / 5) * 5;
  const yMin = Math.max(Math.floor((Math.min(...values, r.target.laeqDbA) - 1) / 5) * 5, yMax - 30);
  const Y = (db) => splTop + ((yMax - Math.max(yMin, Math.min(yMax, db))) / (yMax - yMin)) * splH;

  for (let db = yMin; db <= yMax; db += 5) {
    svg.append(
      sv('line', { class: 'gridline', x1: X(xMin), x2: X(xMax), y1: Y(db), y2: Y(db) }),
      sv('text', { x: pad.l - 6, y: Y(db) + 4, 'text-anchor': 'end' }, String(db)),
    );
  }
  svg.append(sv('text', { x: pad.l - 6, y: splTop - 10, 'text-anchor': 'end', class: 'strong' }, 'dBA'));
  const step = niceStep(xMax);
  for (let x = 0; x <= xMax; x += step) {
    svg.append(
      sv('line', { class: 'axis', x1: X(x), x2: X(x), y1: splBottom, y2: splBottom + 4 }),
      sv('text', { x: X(x), y: splBottom + 17, 'text-anchor': 'middle' }, x === 0 ? '0 m' : String(x)),
    );
  }
  svg.append(sv('line', { class: 'axis', x1: X(xMin), x2: X(xMax), y1: splBottom, y2: splBottom }));

  // Front / mix / back markers across the level panel, labelled in the gap above it.
  const markers = [
    ['Front', r.input.frontRowM],
    ['Mix', r.spl.foh.distanceM],
    ['Back', back],
  ];
  let lastLabelRight = -Infinity;
  for (const [label, x] of markers) {
    svg.append(sv('line', { class: 'marker', x1: X(x), x2: X(x), y1: splTop, y2: splBottom }));
    const w = label.length * 6.5;
    if (X(x) - w / 2 > lastLabelRight + 4) {
      svg.append(sv('text', { x: X(x), y: splTop - 10, 'text-anchor': 'middle', class: 'strong' }, label));
      lastLabelRight = X(x) + w / 2;
    }
  }
  if (Number.isFinite(r.limits.holdLimitM) && r.limits.holdLimitM < xMax) {
    const hx = X(r.limits.holdLimitM);
    svg.append(
      sv('line', { class: 'limit', x1: hx, x2: hx, y1: Z(r.input.trimHeightM + 0.8), y2: splBottom }),
      sv('text', { x: hx - 4, y: Z(r.input.trimHeightM + 0.8) + 10, 'text-anchor': 'end' }, `hold limit ${f1(r.limits.holdLimitM)} m`),
    );
  }

  // Target and the level curves.
  svg.append(sv('line', { class: 'ref', x1: X(xMin), x2: X(xMax), y1: Y(r.target.laeqDbA), y2: Y(r.target.laeqDbA) }));
  svg.append(sv('text', { x: X(xMin) + 4, y: Y(r.target.laeqDbA) - 5, class: 'strong' }, `target ${r.target.laeqDbA}`));
  const clipId = 'splclip';
  const defs = sv('defs');
  const clip = sv('clipPath', { id: clipId });
  clip.append(sv('rect', { x: X(xMin), y: splTop - 2, width: X(xMax) - X(xMin), height: splH + 4 }));
  defs.append(clip);
  svg.append(defs);
  const ends = [];
  for (const s of series) {
    const d = r.profile.map((p, i) => `${i ? 'L' : 'M'}${X(p.x).toFixed(1)},${Y(p[s.key] - headroom).toFixed(1)}`).join('');
    svg.append(sv('path', { class: s.cls, d, 'clip-path': `url(#${clipId})` }));
    const lastPoint = r.profile.at(-1);
    ends.push({ y: Y(lastPoint[s.key] - headroom), label: s.label });
  }
  // Direct end labels, inside the plot, only where they do not collide; the legend carries
  // identity otherwise.
  if (ends.length === 1 || Math.abs(ends[0].y - ends[1].y) >= 14) {
    const xEnd = X(r.profile.at(-1).x) - 4;
    for (const e of ends) {
      const below = ends.length > 1 && e.y > Math.min(...ends.map((o) => o.y));
      svg.append(sv('text', { x: xEnd, y: below ? e.y + 15 : e.y - 7, 'text-anchor': 'end', class: 'strong' }, e.label));
    }
  }

  // Crosshair layer.
  const crossLayer = sv('g', { class: 'crosshair' });
  svg.append(crossLayer);
  const hit = sv('rect', { class: 'hit', x: X(xMin), y: pad.t, width: X(xMax) - X(xMin), height: splBottom - pad.t });
  svg.append(hit);
  const nearest = (clientX) => {
    const box = svg.getBoundingClientRect();
    const x = ((clientX - box.left) / box.width) * width;
    const metresX = xMin + (x - pad.l) / pxPerM;
    let best = 0;
    r.profile.forEach((p, i) => {
      if (Math.abs(p.x - metresX) < Math.abs(r.profile[best].x - metresX)) best = i;
    });
    return best;
  };
  const show = (i) => {
    cross = i;
    crossLayer.replaceChildren();
    const p = r.profile[i];
    crossLayer.append(sv('line', { class: 'cross', x1: X(p.x), x2: X(p.x), y1: pad.t, y2: splBottom }));
    for (const s of series) crossLayer.append(sv('circle', { class: s.dot, cx: X(p.x), cy: Y(p[s.key] - headroom), r: 4 }));
    const tip = $('tip');
    const fohPeak = r.spl.foh.peakDbA;
    tip.replaceChildren(
      el('span', { class: 'x', text: `${p.x} m from the array` }),
      ...series.map((s) =>
        el('div', { class: 'row' }, el('span', { class: `key ${s.cls === 'line1' ? 's1' : 's2'}` }), el('strong', { text: f1(p[s.key] - headroom) }), el('span', { text: `${s.label}, max LAeq` })),
      ),
      el('div', { class: 'row' }, el('span', { class: 'key ref' }), el('strong', { text: f1(r.target.laeqDbA + (p.centrePeakDbA - fohPeak)) }), el('span', { text: 'with the mix at target' })),
    );
    tip.hidden = false;
    const chartBox = $('chart').getBoundingClientRect();
    const scale = chartBox.width / width;
    const px = X(p.x) * scale;
    const tipW = tip.offsetWidth;
    tip.style.left = `${px + 14 + tipW > chartBox.width ? Math.max(0, px - 14 - tipW) : px + 14}px`;
    tip.style.top = `${splTop * scale}px`;
  };
  const hide = () => {
    cross = null;
    crossLayer.replaceChildren();
    $('tip').hidden = true;
  };
  hit.addEventListener('pointermove', (e) => show(nearest(e.clientX)));
  hit.addEventListener('pointerleave', hide);
  svg.onkeydown = (e) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const start = cross ?? r.profile.findIndex((p) => p.x >= r.spl.foh.distanceM);
      show(Math.max(0, Math.min(r.profile.length - 1, start + (e.key === 'ArrowRight' ? 1 : -1))));
    } else if (e.key === 'Escape') hide();
  };
  svg.onblur = hide;
}

// ---------------------------------------------------------------- lists and tables

function renderWarnings(r) {
  $('warnings').replaceChildren(
    ...r.warnings.map((w) => el('li', { class: w.level }, badge(w.level, LEVEL_LABEL[w.level], LEVEL_ICON[w.level]), el('span', { text: w.message }))),
  );
}

// Header cells are strings (right-aligned numeric columns) or [text] for left-aligned text columns.
function table(id, head, rows) {
  const th = (h) => (Array.isArray(h) ? el('th', { scope: 'col', class: 'left', text: h[0] }) : el('th', { scope: 'col', text: h }));
  $(id).replaceChildren(el('thead', {}, el('tr', {}, ...head.map(th))), el('tbody', {}, ...rows));
}

function renderSpl(r) {
  const rows = [r.spl.front, r.spl.foh, r.spl.back].map((p) =>
    el(
      'tr',
      {},
      el('td', { class: 'text' }, el('strong', { text: p.label }), ` · ${p.where}`),
      el('td', { text: metres(p.distanceM) }),
      el('td', { text: f1(p.capabilityDbA) }),
      el('td', { text: f1(p.atTargetDbA) }),
      el('td', { text: f1(p.peakDbA) }),
      el('td', { class: 'flags' }, badge(p.confidence, p.confidence)),
      el('td', { class: 'text', text: p.why }),
    ),
  );
  table('splTable', ['Point', 'Distance', 'Max LAeq', 'At target', 'Peak', ['Confidence'], ['Basis']], rows);
}

function renderSplays(r) {
  const rows = r.rows.map((row) =>
    el(
      'tr',
      {},
      el('td', { text: String(row.index) }),
      el('td', { text: row.splayDeg == null ? 'top' : `${row.splayDeg}°` }),
      el('td', { text: `${row.tiltDeg.toFixed(1)}°` }),
      el('td', { text: metres(row.targetM) }),
      el('td', { text: metres(row.aimM) }),
      el('td', { text: signed(row.aimErrorM) }),
      el('td', { text: `${signed(row.driftDeg, 2)}°` }),
      el(
        'td',
        { class: 'flags' },
        row.atMaxSplay ? badge('warn', 'max splay') : null,
        row.beyondHoldLimit ? badge('warn', 'past hold limit') : null,
        row.missesSpacing && !row.beyondHoldLimit ? badge('info', 'misses') : null,
      ),
    ),
  );
  table('splayTable', ['Box', 'Splay', 'Tilt', 'Target', 'Aim', 'Error', 'Drift', ['']], rows);
  $('splayNote').textContent = 'Splay is the angle to the box above. Box 1 hangs at the fly-bar tilt; drift is the running rounding error the dithering keeps in check.';
}

function renderGenres(inputs) {
  const rows = Object.values(GENRES).map((g) => {
    let r;
    try {
      r = calculate({ ...inputs, genre: g.id, spacingM: null });
    } catch {
      return el('tr', {}, el('td', { text: g.label }), el('td', { colspan: 6, class: 'text', text: 'No valid result for these inputs.' }));
    }
    const codes = r.warnings.filter((w) => SHORT_CODE[w.code]);
    const row = el(
      'tr',
      { class: g.id === inputs.genre ? 'current' : null, tabindex: 0, 'aria-label': `Switch to ${g.label}` },
      el('td', { class: 'text' }, el('strong', { text: g.label })),
      el('td', { text: metres(r.spacing.usedM) }),
      el('td', { text: String(r.boxCount) }),
      el('td', { text: `${f1(r.coverage.startM)}–${f1(r.coverage.endM)} m` }),
      el('td', { text: `${signed(r.target.fohMarginDb)} dB` }),
      el('td', { text: f1(r.spl.back.atTargetDbA) }),
      el('td', { class: 'flags' }, ...codes.map((w) => badge(w.level, SHORT_CODE[w.code]))),
    );
    const pick = () => {
      $(`genre-${g.id}`).checked = true;
      update();
    };
    row.addEventListener('click', pick);
    row.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        pick();
      }
    });
    return row;
  });
  table('genreTable', ['Genre', 'Spacing', 'Boxes', 'Coverage', 'Mix margin', 'Back at target', ['Flags']], rows);
}

function renderProfile(r) {
  const pair = r.input.hangs > 1;
  const h = r.target.headroomDb;
  const fohPeak = r.spl.foh.peakDbA;
  const rows = r.profile.map((p) =>
    el(
      'tr',
      {},
      el('td', { text: `${p.x} m` }),
      el('td', { text: f1(p.centrePeakDbA - h) }),
      pair ? el('td', { text: f1(p.hangPeakDbA - h) }) : null,
      el('td', { text: f1(r.target.laeqDbA + (p.centrePeakDbA - fohPeak)) }),
    ),
  );
  table('profileTable', pair ? ['Distance', 'Max LAeq, L+R centre', 'Max LAeq, one hang', 'With the mix at target'] : ['Distance', 'Max LAeq', 'With the mix at target'], rows);
}

function renderNotes(r) {
  const item = (title, text) => el('li', {}, el('strong', { text: `${title}: ` }), text);
  const unverified = Object.values(r.box.unverified).map((v) => v.note);
  const notes = [
    unverified.length && item('Unverified box data', unverified.join(' ')),
    item('Rigging', `${r.rigging.note} Hang weight is boxes plus fly bar only (no motors, chain or cable).`),
    item(
      'SPL model',
      'Each box is a point source at its 137 dB peak spec (unweighted) with a 15° Gaussian vertical pattern, inverse-square distance loss and ISO 9613-1 air absorption at 20 °C / 50 % RH, summed on an energy basis. A-weighting a pink-noise-like programme takes 2.4 dB off. It is not calibrated yet, so confidence tops out at medium.',
    ),
    item(
      'Why not 3 dB / 6 dB per doubling',
      'Taken from 1 m with a coupling gain, that rule puts every box’s output on one axis and overstates a curved array by about 15–20 dB. Its front-to-back slope is similar; the energy sum fixes the level and makes it depend on spacing and trim height.',
    ),
    item('Max LAeq', 'Peak capability less the genre headroom. With an L/R pair both hangs are summed on the centre line, each with its horizontal off-axis loss.'),
    item(
      'Angle-resolution limit',
      `Where an aim point can no longer be kept within ${r.input.holdTolerance} × spacing of its target: either even the smallest splay spreads aim points too far apart, or the preset steps are too coarse even when dithered.`,
    ),
    item('Not modelled', 'Subwoofers and LF (dBC) targets, crowd absorption at grazing angles, room reflections, interference ripple, weather beyond the fixed air conditions, and tapered spacing.'),
  ];
  $('notes').replaceChildren(...notes.filter(Boolean));
}

// ---------------------------------------------------------------- boot

buildGenreOptions();
$('controls').addEventListener('input', update);
$('controls').addEventListener('submit', (e) => e.preventDefault());
let resizeFrame = 0;
new ResizeObserver(() => {
  cancelAnimationFrame(resizeFrame);
  resizeFrame = requestAnimationFrame(() => last && renderSection(last));
}).observe($('chart'));
update();
