"use strict";
// Шари: 0 — земля, 1 і вище — летючі острови, −1 і нижче — підземелля.
// Активний шар живе в data.shapes / data.stamps / data.texts, тож увесь редактор (вибір, пензель, генератори, ШІ)
// працює з ним як завжди. Решта шарів лежить у data.layers[n] = {shapes, stamps, texts}; номер активного — data.layer.
// Порожній шар (крім 0) зникає, коли з нього йдеш. Штамп з exit: n видно ще й на шарі n (вхід у печеру, сходи…).
const LAYER_MIN = -9, LAYER_MAX = 9;
const LAYER_SHADOW = [34, 52]; // зсув тіні на кожен шар угору: світло з північного заходу

function ensureLayers(){
  data.layer = data.layer | 0;
  if (!data.layers || typeof data.layers !== 'object' || Array.isArray(data.layers)) data.layers = {};
  for (const k of Object.keys(data.layers)){ const o = data.layers[k];
    if (!o || +k === data.layer || !Number.isInteger(+k)){ delete data.layers[k]; continue; }
    o.shapes = Array.isArray(o.shapes) ? o.shapes : []; o.stamps = Array.isArray(o.stamps) ? o.stamps : []; o.texts = Array.isArray(o.texts) ? o.texts : [];
    for (const s of o.shapes) if (!s.id) s.id = 's' + (uid++); else { const n = +String(s.id).slice(1); if (n >= uid) uid = n + 1; }
    for (const s of o.stamps.concat(o.texts)) if (!s.id) s.id = 'd' + (uid++); else { const n = +String(s.id).slice(1); if (n >= uid) uid = n + 1; } }
}
function layerNums(){ const s = new Set([0, data.layer | 0]); for (const k of Object.keys(data.layers || {})) s.add(+k); return [...s].sort((a, b) => b - a); }
function layerName(n){ return n === 0 ? L('Земля', 'Ground') : n > 0 ? L('Небо', 'Sky') + ' +' + n : L('Підземелля', 'Underground') + ' −' + (-n); }
function layerEmpty(o){ return !o || (!o.shapes.length && !o.stamps.length && !o.texts.length); }
function hasLayers(){ return layerNums().length > 1; }

// перемикає вміст без жодних побічних ефектів в інтерфейсі
function swapLayer(n){ const cur = data.layer | 0; if (n === cur) return; if (!data.layers) data.layers = {};
  data.layers[cur] = {shapes: data.shapes, stamps: data.stamps || [], texts: data.texts || []};
  const t = data.layers[n] || {shapes: [], stamps: [], texts: []}; delete data.layers[n];
  data.shapes = t.shapes; data.stamps = t.stamps; data.texts = t.texts; data.layer = n; }
function withLayer(n, fn){ const prev = data.layer | 0; if (n === prev) return fn(); const existed = !!(data.layers && data.layers[n]);
  swapLayer(n); try { return fn(); } finally { swapLayer(prev); if (!existed && layerEmpty(data.layers[n])) delete data.layers[n]; } }

// штампи з інших шарів, що ведуть на поточний
function exitStamps(){ const out = [], cur = data.layer | 0; for (const k of Object.keys(data.layers || {})) for (const s of data.layers[k].stamps || []) if (s.exit != null && (s.exit | 0) === cur) out.push(s); return out; }

function switchLayer(n){
  if (typeof aiPreview !== 'undefined' && aiPreview) return;
  n = Math.max(LAYER_MIN, Math.min(LAYER_MAX, n | 0)); const cur = data.layer | 0; if (n === cur) return;
  drawing = null; selected = null; selObj = null; activeVertex = -1;
  swapLayer(n); if (cur !== 0 && layerEmpty(data.layers[cur])) delete data.layers[cur];
  mapImg = null; changed(); renderSide(); toast(layerName(n));
}

// ---- перемикач у кутку мапи ----
function updateLayerUI(){ const bar = document.getElementById('layerBar'); if (!bar) return; const cur = data.layer | 0, nums = layerNums();
  bar.innerHTML = `<button class="btn" id="layUp" title="Шар вище (PageUp)" ${cur >= LAYER_MAX ? 'disabled' : ''}>▲</button>`
    + `<button class="btn laycur" id="layName" title="Шари" aria-expanded="false" data-noi18n>${layerName(cur)}</button>`
    + `<button class="btn" id="layDown" title="Шар нижче (PageDown)" ${cur <= LAYER_MIN ? 'disabled' : ''}>▼</button>`
    + `<div class="laylist" id="layList" hidden>${nums.map(n => `<button class="btn" data-layer="${n}" aria-pressed="${n === cur}" data-noi18n>${layerName(n)}</button>`).join('')}`
    + `<p class="help">${L('Новий шар з’являється, коли на нього переходиш. Порожній шар зникає.', 'A new layer appears when you go to it. An empty layer disappears.')}</p></div>`;
  bar.classList.toggle('sky', cur > 0); bar.classList.toggle('under', cur < 0);
  bar.querySelector('#layUp').onclick = () => switchLayer(cur + 1); bar.querySelector('#layDown').onclick = () => switchLayer(cur - 1);
  const list = bar.querySelector('#layList'), nb = bar.querySelector('#layName');
  nb.onclick = () => { list.hidden = !list.hidden; nb.setAttribute('aria-expanded', String(!list.hidden)); };
  for (const b of list.querySelectorAll('[data-layer]')) b.onclick = () => switchLayer(+b.dataset.layer);
}
window.addEventListener('keydown', e => { if (e.target.matches && e.target.matches('input,textarea,select')) return;
  if (e.key === 'PageUp'){ e.preventDefault(); switchLayer((data.layer | 0) + 1); } else if (e.key === 'PageDown'){ e.preventDefault(); switchLayer((data.layer | 0) - 1); } });

// ---- рендер з урахуванням шарів ----
let layerCache = null;
function layerKey(){ return JSON.stringify([data.layer | 0, data.layers, data.settings, data.seed, W, H]); }
function landGeo(n, key){ // геометрія суші іншого шару (для тіней), кешується разом із фоном
  if (layerCache && layerCache.key === key && layerCache.geo[n]) return layerCache.geo[n];
  const geo = withLayer(n, () => buildGeometry()); if (layerCache && layerCache.key === key) layerCache.geo[n] = geo; return geo; }
// тіні летючих островів на землі: напівпрозора пляма зі штрихуванням
function drawLayerShadows(g, nums, key){
  for (const k of nums){ if (k <= 0) continue; const geo = landGeo(k, key); if (!geo.lands.length) continue;
    const dx = LAYER_SHADOW[0] * k, dy = LAYER_SHADOW[1] * k; const p = new Path2D(); let bb = [Infinity, Infinity, -Infinity, -Infinity];
    for (const l of geo.lands){ p.addPath(pathOf(l.rough, true)); bb = [Math.min(bb[0], l.bb[0]), Math.min(bb[1], l.bb[1]), Math.max(bb[2], l.bb[2]), Math.max(bb[3], l.bb[3])]; }
    g.save(); g.translate(dx, dy); g.clip(p, 'nonzero');
    g.fillStyle = 'rgba(42,27,14,' + (.16 / Math.sqrt(k)).toFixed(3) + ')'; g.fillRect(bb[0], bb[1], bb[2] - bb[0], bb[3] - bb[1]);
    g.beginPath(); const gap = 7; for (let o = bb[0] - (bb[3] - bb[1]); o < bb[2]; o += gap){ g.moveTo(o, bb[3]); g.lineTo(o + (bb[3] - bb[1]), bb[1]); }
    g.strokeStyle = INK; g.lineWidth = .7; g.globalAlpha = .28 / Math.sqrt(k); g.stroke(); g.restore(); g.globalAlpha = 1; }
}
// приглушити те, що лежить нижче поточного шару
function washLayer(c, a){ const g = c.getContext('2d'); g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = a; g.fillStyle = PAPER; g.fillRect(0, 0, c.width, c.height); g.globalAlpha = 1; }
// фон для шару cur > 0: земля з тінями й острови проміжних шарів, приглушені
function layerBackdrop(scale, cur, nums, key){
  const ck = key + '|' + scale; if (layerCache && layerCache.bgKey === ck && layerCache.bg) return layerCache.bg;
  let bg = withLayer(0, () => renderMap(scale, true, true, {under: g => drawLayerShadows(g, nums, key)}));
  for (const k of nums.slice().reverse()){ if (k <= 0 || k >= cur) continue; washLayer(bg, .3); const below = bg; bg = withLayer(k, () => renderMap(scale, true, true, {mode: 'island', bg: below})); }
  washLayer(bg, .42);
  if (layerCache && layerCache.key === key){ layerCache.bg = bg; layerCache.bgKey = ck; }
  return bg;
}
function renderLayered(scale, withDecor, noFrame){
  const cur = data.layer | 0, nums = layerNums();
  if (nums.length < 2) return renderMap(scale, withDecor, noFrame);
  const key = layerKey(); if (!layerCache || layerCache.key !== key) layerCache = {key, geo: {}};
  if (cur < 0) return renderMap(scale, withDecor, noFrame, {mode: 'cave'});
  if (cur === 0) return renderMap(scale, withDecor, noFrame, {under: g => drawLayerShadows(g, nums, key)});
  return renderMap(scale, withDecor, noFrame, {mode: 'island', bg: layerBackdrop(scale, cur, nums, key)});
}

// острів знизу: кам'яний конус, що звужується донизу, з вертикальним штрихуванням
function drawCliffs(g, geo, scale, cw, ch){
  if (!geo.lands.length) return;
  const m = layer(cw, ch), mg = m.getContext('2d'); mg.fillStyle = '#000'; let bb = [Infinity, Infinity, -Infinity, -Infinity];
  for (const l of geo.lands){ const [x0, y0, x1, y1] = l.bb; const w = x1 - x0, depth = Math.max(26, Math.min(170, w * .24)); const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2; const p = pathOf(l.rough, true);
    for (let t = 0; t <= depth; t += 2.5){ const s = 1 - .6 * Math.pow(t / depth, 1.35); mg.setTransform(scale * s, 0, 0, scale * s, scale * (cx - cx * s), scale * (cy - cy * s + t)); mg.fill(p); }
    bb = [Math.min(bb[0], x0), Math.min(bb[1], y0), Math.max(bb[2], x1), Math.max(bb[3], y1 + depth)]; }
  mg.setTransform(1, 0, 0, 1, 0, 0);
  const tinted = (col) => { const c = layer(cw, ch), cg = c.getContext('2d'); cg.drawImage(m, 0, 0); cg.globalCompositeOperation = 'source-in'; cg.fillStyle = col; cg.fillRect(0, 0, cw, ch); return c; };
  const ink = tinted(INK), o = Math.max(1, 1.8 * scale); g.save(); g.setTransform(1, 0, 0, 1, 0, 0);
  for (const [dx, dy] of [[-o, 0], [o, 0], [0, o], [0, -o]]) g.drawImage(ink, dx, dy);
  g.drawImage(tinted(PAPER_L), 0, 0);
  // штрихування скелі: вертикальні риски різної довжини, густіші праворуч (тіньовий бік)
  const h = layer(cw, ch), hg = h.getContext('2d'); hg.setTransform(scale, 0, 0, scale, 0, 0); hg.beginPath(); const R = rng((data.seed | 0) * 31 + 7);
  for (let x = bb[0]; x < bb[2]; x += 4){ for (let y = bb[1]; y < bb[3]; y += 10 + R() * 16){ const l = 6 + R() * 14; hg.moveTo(x + R() * 2, y); hg.lineTo(x + R() * 2 - 1, y + l); } }
  hg.strokeStyle = INK; hg.lineWidth = .7; hg.globalAlpha = .55; hg.stroke(); hg.setTransform(1, 0, 0, 1, 0, 0); hg.globalAlpha = 1;
  hg.globalCompositeOperation = 'destination-in'; hg.drawImage(m, 0, 0); g.drawImage(h, 0, 0); g.restore();
}
// підземелля: усе поза сушею — темна скеля зі штрихуванням
function drawRock(g, solidL, scale, cw, ch){
  const c = layer(cw, ch), cg = c.getContext('2d'); cg.fillStyle = 'rgba(92,62,30,.30)'; cg.fillRect(0, 0, cw, ch);
  cg.setTransform(scale, 0, 0, scale, 0, 0); cg.beginPath(); for (let o = -H; o < W; o += 6){ cg.moveTo(o, H); cg.lineTo(o + H, 0); }
  cg.strokeStyle = INK; cg.lineWidth = .8; cg.globalAlpha = .4; cg.stroke(); cg.globalAlpha = 1;
  cg.beginPath(); const R = rng((data.seed | 0) * 17 + 3); for (let i = 0; i < W * H / 9000; i++){ const x = R() * W, y = R() * H, r = 3 + R() * 7; cg.moveTo(x + r, y); cg.arc(x, y, r, 0, Math.PI * 2); }
  cg.lineWidth = .9; cg.globalAlpha = .45; cg.stroke(); cg.globalAlpha = 1; cg.setTransform(1, 0, 0, 1, 0, 0);
  cg.globalCompositeOperation = 'destination-out'; cg.drawImage(solidL, 0, 0); g.drawImage(c, 0, 0);
}
