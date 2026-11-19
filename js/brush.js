"use strict";
// Пензель: малює або стирає області будь-якого типу (суша, озеро, ліс, ландшафт, поселення…).
// Мазок растеризується разом із сусідніми мазками того ж типу, контур трасується назад у полігон —
// тож результат завжди звичайні фігури (shape: 'poly', brush: true), які можна редагувати як інші.

const brushOpts = {size: 80, erase: false};   // size — діаметр у пікселях мапи
let brushStroke = null;                        // {pts, r, erase} поки тягнемо
let brushCursor = null;                        // [x, y] під мишею

// Підтип, що має збігатися, щоб мазки зливалися/стирались: вид ландшафту чи вид дерев.
function brushSub(kind){ return kind === 'terrain' ? newTerrain : kind === 'forest' ? newTrees : null; }
function brushMatch(s, kind, sub){ if (s.kind !== kind || s.shape === 'line') return false;
  if (kind === 'terrain') return terrainOf(s) === sub; if (kind === 'forest') return treesOf(s) === sub; return true; }
const bbOverlap = (a, b) => !(a[0] > b[2] || a[2] < b[0] || a[1] > b[3] || a[3] < b[1]);
const bbUnion = (a, b) => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])];
const bbPad = (a, p) => [a[0] - p, a[1] - p, a[2] + p, a[3] + p];

// Крок сітки: дрібний для точності, але не більше ~1.5 млн клітинок.
function brushGrid(bb, want){ let G = Math.max(1.5, want); while (((bb[2] - bb[0]) / G) * ((bb[3] - bb[1]) / G) > 1.5e6) G *= 1.25; return G; }
function brushRaster(bb, G, drawFn){
  const w = Math.max(1, Math.ceil((bb[2] - bb[0]) / G)), h = Math.max(1, Math.ceil((bb[3] - bb[1]) / G));
  const c = layer(w, h), g = c.getContext('2d'); g.setTransform(1 / G, 0, 0, 1 / G, -bb[0] / G, -bb[1] / G); g.fillStyle = '#000'; g.strokeStyle = '#000'; drawFn(g);
  const im = g.getImageData(0, 0, w, h).data, m = new Uint8Array(w * h); for (let i = 0; i < m.length; i++) m[i] = im[i * 4 + 3] > 127 ? 1 : 0;
  return {m, w, h, ox: bb[0], oy: bb[1], G}; }
function strokePath(g, st){ g.lineCap = 'round'; g.lineJoin = 'round'; g.lineWidth = st.r * 2; const p = st.pts;
  if (p.length === 1){ g.beginPath(); g.arc(p[0][0], p[0][1], st.r, 0, Math.PI * 2); g.fill(); return; }
  g.beginPath(); g.moveTo(p[0][0], p[0][1]); for (let i = 1; i < p.length; i++) g.lineTo(p[i][0], p[i][1]); g.stroke(); }

// Контури маски: межі клітинок, обхід за годинниковою стрілкою (зовнішні) / проти (дірки).
function traceMask(R){
  const {m, w, h} = R; const at = (x, y) => x >= 0 && y >= 0 && x < w && y < h && m[y * w + x] === 1;
  const out = new Map(); const add = (x1, y1, x2, y2) => { const k = x1 + ',' + y1; let a = out.get(k); if (!a) out.set(k, a = []); a.push([x2, y2]); };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++){ if (!m[y * w + x]) continue;
    if (!at(x, y - 1)) add(x, y, x + 1, y); if (!at(x + 1, y)) add(x + 1, y, x + 1, y + 1); if (!at(x, y + 1)) add(x + 1, y + 1, x, y + 1); if (!at(x - 1, y)) add(x, y + 1, x, y); }
  const loops = [];
  for (const [k0, arr0] of out){ while (arr0.length){
    const [sx, sy] = k0.split(',').map(Number); let cx = sx, cy = sy, dx = 0, dy = 0; const loop = [];
    for (let guard = 0; guard < 4e6; guard++){ const arr = out.get(cx + ',' + cy); if (!arr || !arr.length) break;
      let pick = 0; if (arr.length > 1){ let best = -9; for (let i = 0; i < arr.length; i++){ const nx = arr[i][0] - cx, ny = arr[i][1] - cy; const score = (nx === -dy && ny === dx) ? 2 : (nx === dx && ny === dy) ? 1 : 0; if (score > best){ best = score; pick = i; } } }
      const [nx, ny] = arr.splice(pick, 1)[0]; loop.push([cx, cy]); dx = nx - cx; dy = ny - cy; cx = nx; cy = ny; if (cx === sx && cy === sy) break; }
    if (loop.length >= 4) loops.push(loop); } }
  return loops.map(l => {
    // середини ребер прибирають «сходинки», далі спрощення Дугласа — Пекера
    const mid = l.map((p, i) => { const q = l[(i + 1) % l.length]; return [R.ox + (p[0] + q[0]) / 2 * R.G, R.oy + (p[1] + q[1]) / 2 * R.G]; });
    const pts = simplifyClosed(mid, R.G * .8).map(p => [Math.round(p[0] * 10) / 10, Math.round(p[1] * 10) / 10]);
    let a = 0; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) a += pts[j][0] * pts[i][1] - pts[i][0] * pts[j][1];
    return {pts, area: a / 2}; });
}
function simplifyClosed(pts, tol){ if (pts.length < 8) return pts;
  // розрізаємо в двох найвіддаленіших точках, спрощуємо обидві половини
  let far = 0, fd = 0; for (let i = 1; i < pts.length; i++){ const d = Math.hypot(pts[i][0] - pts[0][0], pts[i][1] - pts[0][1]); if (d > fd){ fd = d; far = i; } }
  const a = rdp(pts.slice(0, far + 1), tol), b = rdp(pts.slice(far).concat([pts[0]]), tol); return a.slice(0, -1).concat(b.slice(0, -1)); }
function rdp(p, tol){ if (p.length < 3) return p; const keep = new Uint8Array(p.length); keep[0] = keep[p.length - 1] = 1; const st = [[0, p.length - 1]];
  while (st.length){ const [a, b] = st.pop(); let md = 0, mi = -1; for (let i = a + 1; i < b; i++){ const d = segDist(p[i][0], p[i][1], p[a], p[b]); if (d > md){ md = d; mi = i; } }
    if (md > tol && mi > 0){ keep[mi] = 1; st.push([a, mi], [mi, b]); } }
  return p.filter((_, i) => keep[i]); }

function stripShape(s){ const o = Object.assign({}, s); for (const k of ['id', 'pts', 'cx', 'cy', 'rx', 'ry', 'rot', 'shape']) delete o[k]; return o; }
// Чи зачіпає мазок фігуру: перевіряємо точки вздовж мазка з кроком у пів радіуса.
function strokeSamples(st){ const out = [st.pts[0]]; for (let i = 1; i < st.pts.length; i++){ const a = st.pts[i - 1], b = st.pts[i]; const n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / Math.max(2, st.r / 2)); for (let k = 1; k <= n; k++) out.push([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]); } return out; }
function strokeTouches(s, st){ const pts = shapePts(s); for (const p of strokeSamples(st)){ if (inside(s, p[0], p[1]) || polyEdgeDist(p[0], p[1], pts, true) < st.r) return true; } return false; }

// Дірки й кути.
function pipPts(pts, x, y){ return inside({shape: 'poly', pts}, x, y); }
// Дірка в лісі/ландшафті: з'єднуємо її з зовнішнім контуром тонким невидимим розрізом (один простий полігон).
function bridgeHoles(outer, holes){ let poly = outer.slice();
  for (const h of holes){ let bi = 0, bj = 0, bd = Infinity;
    for (let i = 0; i < poly.length; i++) for (let j = 0; j < h.length; j++){ const d = (poly[i][0] - h[j][0]) ** 2 + (poly[i][1] - h[j][1]) ** 2; if (d < bd){ bd = d; bi = i; bj = j; } }
    poly = poly.slice(0, bi + 1).concat(h.slice(bj), h.slice(0, bj + 1), poly.slice(bi)); }
  return poly; }
// Суша згладжується, тож кути за межами мапи закріплюємо двома точками (як у шаблонах).
function pinOffMap(pts){ const out = [], n = pts.length, d = 100; const off = p => p[0] < -5 || p[1] < -5 || p[0] > W + 5 || p[1] > H + 5;
  for (let i = 0; i < n; i++){ const p = pts[i]; if (!off(p)){ out.push(p); continue; }
    const tw = q => { const dx = q[0] - p[0], dy = q[1] - p[1], L = Math.hypot(dx, dy); return L > d * 2.5 ? [Math.round(p[0] + dx / L * d), Math.round(p[1] + dy / L * d)] : null; };
    const a = tw(pts[(i - 1 + n) % n]), b = tw(pts[(i + 1) % n]); if (a) out.push(a); out.push(p); if (b) out.push(b); }
  return out; }
// Контури → фігури. orig — початковий контур (для стирання), якщо мазок не дістав до його краю: тоді лишаємо його точки.
function shapesFromLoops(loops, base, kind, minA, orig){
  const outers = loops.filter(l => l.area > minA), holes = loops.filter(l => -l.area > minA);
  if (orig && outers.length === 1) outers[0].pts = orig.pts;
  const res = [];
  for (const o of outers){ const hs = holes.filter(h => pipPts(o.pts, h.pts[0][0], h.pts[0][1])).map(h => h.pts);
    if (kind === 'land' || kind === 'lake'){ res.push(Object.assign({}, base, {shape: 'poly', pts: kind === 'land' ? pinOffMap(o.pts) : o.pts}));
      // дірка в суші — це вода: стає озером; дірка в озері — острів
      for (const h of hs) res.push({kind: kind === 'land' ? 'lake' : 'land', shape: 'poly', pts: h.slice().reverse(), brush: true}); }
    else res.push(Object.assign({}, base, {shape: 'poly', pts: hs.length ? bridgeHoles(o.pts, hs) : o.pts})); }
  for (const r of res) r.id = 's' + (uid++);
  return res; }

function brushCommit(st){
  if (!st || !st.pts.length) return; const kind = newKind, sub = brushSub(kind);
  const sb = bbPad(bbox(st.pts), st.r + 2); const minA = Math.max(30, st.r * st.r * .2);
  if (!st.erase){
    // зливаємо лише з мазками пензля того ж типу; намальовані вручну фігури не чіпаємо
    const merge = data.shapes.filter(s => s.brush && brushMatch(s, kind, sub) && bbOverlap(bbox(shapePts(s)), sb) && strokeTouches(s, st));
    let bb = sb; for (const s of merge) bb = bbUnion(bb, bbox(shapePts(s)));
    const G = brushGrid(bb, Math.min(st.r / 6, 3)); bb = bbPad(bb, G * 2);
    const R = brushRaster(bb, G, g => { for (const s of merge) g.fill(pathOf(shapePts(s), true)); strokePath(g, st); });
    const base = merge.length ? stripShape(merge[0]) : Object.assign({kind}, defaultsFor(kind)); base.brush = true;
    const made = shapesFromLoops(traceMask(R), base, kind, minA, null);
    if (!made.length) return;
    pushUndo();
    let at = merge.length ? data.shapes.indexOf(merge[0]) : data.shapes.length;
    data.shapes = data.shapes.filter(s => !merge.includes(s)); at = Math.min(at, data.shapes.length);
    data.shapes.splice(at, 0, ...made);
    if (merge.includes(selected)) selected = null;
  } else {
    const targets = data.shapes.filter(s => brushMatch(s, kind, sub) && bbOverlap(bbox(shapePts(s)), sb) && strokeTouches(s, st));
    if (!targets.length) return;
    pushUndo();
    for (const s of targets){ const bb0 = bbPad(bbox(shapePts(s)), 4); const G = brushGrid(bb0, s.brush ? Math.min(st.r / 6, 3) : 2); const bb = bbPad(bb0, G * 2);
      const R = brushRaster(bb, G, g => { g.fill(pathOf(shapePts(s), true)); g.globalCompositeOperation = 'destination-out'; strokePath(g, st); });
      const op = shapePts(s); const edgeHit = strokeSamples(st).some(p => polyEdgeDist(p[0], p[1], op, true) < st.r);
      const orig = edgeHit ? null : {pts: s.shape === 'ellipse' ? op.map(p => [Math.round(p[0] * 10) / 10, Math.round(p[1] * 10) / 10]) : op};
      const made = shapesFromLoops(traceMask(R), stripShape(s), kind, minA, orig);
      if (made[0]) made[0].id = s.id;
      const at = data.shapes.indexOf(s); data.shapes.splice(at, 1, ...made);
      if (selected === s) selected = made[0] || null; }
  }
  activeVertex = -1; changed(); renderSide();
}

// Прев'ю мазка й курсор пензля (викликається з draw()).
function drawBrushPreview(g, px){
  if (tool !== 'brush') return; const er = brushStroke ? brushStroke.erase : brushOpts.erase; const col = er ? '#ff5a4a' : newKind === 'terrain' ? TERRAINS[newTerrain].color : KIND_COLOR[newKind];
  if (brushStroke){ g.save(); g.globalAlpha = .38; g.strokeStyle = col; g.fillStyle = col; strokePath(g, brushStroke); g.restore(); }
  if (brushCursor){ const r = brushOpts.size / 2; g.beginPath(); g.arc(brushCursor[0], brushCursor[1], r, 0, Math.PI * 2); g.lineWidth = 1.6 * px; g.strokeStyle = '#1c1915'; g.stroke(); g.setLineDash(er ? [5 * px, 4 * px] : []); g.lineWidth = 1.2 * px; g.strokeStyle = col; g.stroke(); g.setLineDash([]); }
}
function setBrushErase(on){ brushOpts.erase = !!on; for (const b of document.querySelectorAll('[data-bmode]')) b.setAttribute('aria-pressed', String((b.dataset.bmode === 'erase') === brushOpts.erase)); draw(); }
function renderBrushOpts(){ const el = document.getElementById('brushSize'); if (!el) return; el.innerHTML = slider('Розмір пензля', 'size', 10, 600, 5, brushOpts); bindSliders(el, brushOpts, () => draw(), true); }
