"use strict";
// Map rendering: land/coast/ripples, glyph placement, mountains, trees, stamps, text, renderMap().
// ================= render =================
function layer(w, h){ const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

function buildGeometry(){
  const seed = data.seed | 0;
  const lands = [], lakes = [], rivers = [], mts = [], fos = [], ter = [], set = [], routes = [], stains = [], rifts = [];
  for (const s of data.shapes){
    if (s.kind === 'land' || s.kind === 'lake'){
      let p = shapePts(s); if (p.length < 3) continue;
      const smooth = s.shape === 'ellipse' ? p : chaikin(p, 1, true);
      const rough = roughen(smooth, true, s.kind === 'land' ? 6.5 : 4, seed + 11, 3);
      (s.kind === 'land' ? lands : lakes).push({s, raw: p, rough, bb: bbox(rough)});
    } else if (s.kind === 'stain'){ stains.push(s);
    } else if (s.kind === 'rift'){ const r = riftGeo(s, seed); if (r) rifts.push(r); // rifts.js
    } else if (ROUTE_KINDS.includes(s.kind)){ if (s.pts.length < 2) continue; routes.push({s, pts: roughen(chaikin(s.pts, 3, false), false, .7, seed + 41, 5)});
    } else if (s.kind === 'river'){
      if (s.pts.length < 2) continue;
      const sm = chaikin(s.pts, 3, false); const rough = roughen(sm, false, 1.6, seed + 23, 5);
      rivers.push({s, pts: rough});
    } else if (s.kind === 'mountain') mts.push(s); else if (s.kind === 'forest') fos.push(s); else if (s.kind === 'terrain') ter.push(s); else if (s.kind === 'vill' || s.kind === 'town' || s.kind === 'fort') set.push(s);
  }
  return {lands, lakes, rivers, mts, fos, ter, set, routes, stains, rifts};
}

const WIDE = 4.5;
function riverW(r){ return Math.max(1, r.s.width || 3); }
function strokeRiver(ctx, r, add){
  const w = riverW(r), pts = r.pts, n = pts.length; const taper = r.s.taper !== false; const segs = 10;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (let k = 0; k < segs; k++){ const a = Math.floor(n*k/segs), b = Math.min(n, Math.floor(n*(k+1)/segs) + 1); if (b - a < 2) continue;
    const t = (k + 1) / segs; const f = taper ? (.45 + .55*Math.min(1, t/.45)) : 1;
    ctx.beginPath(); ctx.moveTo(pts[a][0], pts[a][1]); for (let i = a + 1; i < b; i++) ctx.lineTo(pts[i][0], pts[i][1]); ctx.lineWidth = w*f + add; ctx.stroke(); } }
// land lookup field at 1/4 resolution with distance-to-coast
const FS = 4; let FW = Math.ceil(W / FS), FH = Math.ceil(H / FS);
// Мапи можуть мати різний розмір: після заміни data синхронізуємо W/H, сітки й текстуру паперу.
function applyMapSize(){ data.W = Math.round(data.W || 3200); data.H = Math.round(data.H || 1513); if (W === data.W && H === data.H) return; W = data.W; H = data.H; FW = Math.ceil(W / FS); FH = Math.ceil(H / FS); paperCanvas = null; }
function buildField(geo){
  const c = layer(FW, FH); const g = c.getContext('2d'); g.scale(1/FS, 1/FS);
  g.fillStyle = '#fff'; for (const l of geo.lands) g.fill(pathOf(l.rough, true));
  g.fillStyle = '#000'; for (const l of geo.lakes) g.fill(pathOf(l.rough, true));
  g.strokeStyle = '#000'; for (const r of geo.rivers) if (riverW(r) > WIDE) strokeRiver(g, r, 0);
  const im = g.getImageData(0, 0, FW, FH).data; const N = FW * FH; const d = new Float32Array(N);
  const BIG = 1e6; for (let i = 0; i < N; i++) d[i] = im[i*4] > 127 ? BIG : 0;
  // chamfer distance (inside land, distance to water); outside frame counts as land
  const a = 1, b = 1.4142;
  for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++){ const i = y*FW + x; if (!d[i]) continue; let v = d[i];
    if (x > 0) v = Math.min(v, d[i-1] + a); if (y > 0){ v = Math.min(v, d[i-FW] + a); if (x > 0) v = Math.min(v, d[i-FW-1] + b); if (x < FW-1) v = Math.min(v, d[i-FW+1] + b); } d[i] = v; }
  for (let y = FH-1; y >= 0; y--) for (let x = FW-1; x >= 0; x--){ const i = y*FW + x; if (!d[i]) continue; let v = d[i];
    if (x < FW-1) v = Math.min(v, d[i+1] + a); if (y < FH-1){ v = Math.min(v, d[i+FW] + a); if (x < FW-1) v = Math.min(v, d[i+FW+1] + b); if (x > 0) v = Math.min(v, d[i+FW-1] + b); } d[i] = v; }
  for (let i = 0; i < N; i++) d[i] = d[i] >= BIG ? 9999 : d[i] * FS;
  return d;
}

function placeGlyphs(geo, dist, mode){
  const seed = data.seed | 0; const st = data.settings || {};
  const occ = new Uint8Array(FW * FH);
  const landAt = (x, y, m) => { const fx = (x / FS) | 0, fy = (y / FS) | 0; if (fx < 0 || fy < 0 || fx >= FW || fy >= FH) return false; return dist[fy*FW + fx] >= (m || 0.01); };
  const mark = (x, y, r) => { const fx = (x / FS) | 0, fy = (y / FS) | 0, rr = Math.ceil(r / FS); for (let yy = fy - rr; yy <= fy; yy++) for (let xx = fx - rr; xx <= fx + rr; xx++) if (xx >= 0 && yy >= 0 && xx < FW && yy < FH) occ[yy*FW + xx] = 1; };
  const free = (x, y, r) => { const fx = (x / FS) | 0, fy = (y / FS) | 0, rr = Math.ceil(r / FS); for (let yy = fy - rr; yy <= fy; yy++) for (let xx = fx - rr; xx <= fx + rr; xx++) if (xx >= 0 && yy >= 0 && xx < FW && yy < FH && occ[yy*FW + xx]) return false; return true; };
  const mS = new Uint8Array(FW*FH), mD = new Uint8Array(FW*FH), mR = new Uint8Array(FW*FH);
  for (const st of (data.stamps || []).concat(exitStamps())){ if (st.clear === false) continue; const b = stampBox(st); const r = (b[2] - b[0]) / 2 * .85; for (let yy = st.y - r; yy <= st.y + r + 14; yy += FS) for (let xx = st.x - r; xx <= st.x + r; xx += FS){ if (Math.hypot(xx - st.x, (yy - st.y) * .9) <= r){ const fx = (xx/FS)|0, fy = (yy/FS)|0; if (fx>=0&&fy>=0&&fx<FW&&fy<FH) mS[fy*FW+fx] = 1; } } }
  for (const t of data.texts || []) if (t.bg) for (let yy = t.y; yy <= t.y + t.h + 14; yy += FS) for (let xx = t.x - 6; xx <= t.x + t.w + 6; xx += FS){ const fx = (xx/FS)|0, fy = (yy/FS)|0; if (fx>=0&&fy>=0&&fx<FW&&fy<FH) mS[fy*FW+fx] = 1; }
  for (const r of geo.routes || []){ const rr = 5 * (r.s.width || 1) + 3; for (let i = 0; i < r.pts.length; i += 2){ const p = r.pts[i]; const fx = (p[0]/FS)|0, fy = (p[1]/FS)|0, k = Math.ceil(rr/FS); for (let yy = fy-k; yy <= fy+k+2; yy++) for (let xx = fx-k; xx <= fx+k; xx++) if (xx>=0&&yy>=0&&xx<FW&&yy<FH) { mD[yy*FW+xx] = 1; if (r.s.clear !== false) occ[yy*FW+xx] = 1; }; } }
  // rivers block
  for (const r of geo.rivers){ const w = r.s.width || 3; for (let i = 0; i < r.pts.length; i += 2){ const p = r.pts[i]; const rr = w <= 2.6 ? w / 2 + 3 : w / 2 + 7; const fx = (p[0]/FS)|0, fy = (p[1]/FS)|0, k = Math.ceil(rr/FS); for (let yy = fy-k; yy <= fy+k+2; yy++) for (let xx = fx-k; xx <= fx+k; xx++) if (xx>=0&&yy>=0&&xx<FW&&yy<FH) { mR[yy*FW+xx] = 1; if (r.s.clear !== false) occ[yy*FW+xx] = 1; }; } }
  markRifts(geo.rifts, occ);
  for (let i = 0; i < mS.length; i++) if (mS[i]) occ[i] = 1;
  const glyphs = [];
  const settle = placeSettlements(geo, {landAt, free, mark, glyphs, seed, occ, mS, mD, mR});
  // mountains
  const placed = [];
  const cellM = 60; const gridM = new Map();
  const near = (x, y) => { const out = []; const cx = Math.floor(x / cellM), cy = Math.floor(y / cellM); for (let j = cy-2; j <= cy+2; j++) for (let i = cx-2; i <= cx+2; i++){ const a = gridM.get(i + ',' + j); if (a) out.push(...a); } return out; };
  const addM = (m) => { const k = Math.floor(m[0]/cellM) + ',' + Math.floor(m[1]/cellM); if (!gridM.has(k)) gridM.set(k, []); gridM.get(k).push(m); };
  for (const z of geo.mts){
    const pts = shapePts(z); const bb = bbox(pts); const area = polyArea(pts); const R = rng(seed * 7 + strHash(z.id));
    const n = Math.min(40000, Math.round(area / 80 * (z.density ?? 1)));
    const cand = [];
    for (let i = 0; i < n; i++){ const x = bb[0] + R()*(bb[2]-bb[0]), y = bb[1] + R()*(bb[3]-bb[1]); if (!inside(z, x, y)) continue; const dp = depthIn(z, x, y); cand.push([x, y, dp + R()*40]); }
    cand.sort((a, b) => b[2] - a[2]);
    const smin = z.min ?? 28, smax = z.max ?? 90;
    for (const [x, y] of cand){
      const dp = depthIn(z, x, y);
      const s = smin + Math.min(1, dp / 110) * (smax - smin) * (.7 + R()*.35);
      if (!landAt(x, Math.min(y, H-1), Math.min(s * .35, 18))) continue;
      if (!free(x, y, 4)) continue;
      let ok = true; for (const [a, b, sb] of near(x, y)){ if (Math.abs(x-a) < (s+sb)*.8 && Math.abs(y-b) < (s+sb)*.5 && Math.hypot(x-a, (y-b)*1.7) < (s+sb)*.6){ ok = false; break; } }
      if (!ok) continue;
      const m = [x, y, s]; placed.push(m); addM(m);
    }
  }
  for (const [x, y, s] of placed){ glyphs.push({y, t: 'm', x, s, r: hash3(x|0, y|0, seed) * 1e9 | 0}); mark(x, y, s * .9); }
  // ландшафт (nature.js): пагорби одразу після гір, болота перед лісами
  const nc = {landAt, free, mark, glyphs, seed, near, addM};
  placeHills(geo, nc); placeMarsh(geo, nc);
  // forests
  for (const z of geo.fos){
    const pts = shapePts(z); const bb = bbox(pts); const area = polyArea(pts); const R = rng(seed * 13 + strHash(z.id));
    const ts = z.tree ?? 11; const n = Math.min(60000, Math.round(area / 18 * (z.density ?? 1))); const tk = treesOf(z);
    const sp = Math.max(3, ts * .55 * TREE_TYPES[tk].space / Math.sqrt(Math.max(.2, z.density ?? 1)));
    for (let i = 0; i < n; i++){ const x = bb[0] + R()*(bb[2]-bb[0]), y = bb[1] + R()*(bb[3]-bb[1]); if (!inside(z, x, y)) continue;
      if (!landAt(x, y, 8) || !free(x, y, sp)) continue; const s = ts * (.82 + R()*.36); glyphs.push({y, t: 't', x, s, r: (R()*1e9)|0, k: pickTree(tk, R)}); mark(x, y, sp); }
  }
  // scattered trees
  { const R = rng(seed * 17 + 5); const n = mode === 'cave' ? 0 : Math.round(2500 * (st.scatter ?? 1)); /* у підземеллі окремих дерев немає */ const stk = TREE_TYPES[st.scatterTrees] ? st.scatterTrees : 'conifer'; const sf = TREE_TYPES[stk].space; const noTrees = geo.ter.filter(z => terrainOf(z) === 'desert'); const treeOk = (x, y) => !noTrees.some(z => inside(z, x, y));
    for (let i = 0; i < n; i++){ const x = 40 + R()*(W-80), y = 40 + R()*(H-80); if (!(landAt(x, y, 10) && free(x, y, 16) && R() < .08)) continue;
      const k = 1 + (R()*4|0); for (let j = 0; j < k; j++){ const xx = x + (R()-.5)*32, yy = y + (R()-.5)*18; if (landAt(xx, yy, 8) && free(xx, yy, 7 * sf) && treeOk(xx, yy)){ glyphs.push({y: yy, t: 't', x: xx, s: 8 + R()*3, r: (R()*1e9)|0, k: pickTree(stk, R)}); mark(xx, yy, 7 * sf); } } } }
  // сніг, тундра, степ, пустеля (nature.js)
  const {snow, stip, dash} = placeGround(geo, nc);
  glyphs.sort((a, b) => a.y - b.y);
  return {glyphs, snow, stip, dash, fields: settle.fields, walls: settle.walls};
}

function drawMountain(g, x, y, s, seedv){
  const R = rng(seedv); const jit = (a) => (R()*2 - 1) * a;
  const w = s * (1.5 + R()*.5), h = s * (1.0 + R()*.4); const px = x + jit(s*.15), py = y - h;
  const n = s < 40 ? 3 : 5; const left = [[x - w/2, y]];
  for (let i = 1; i < n; i++){ const t = i/n; left.push([x - w/2 + (px - (x - w/2))*t + jit(s*.06), y + (py - y)*Math.pow(t, 1.15) + jit(s*.036)]); }
  left.push([px, py]); const right = [];
  for (let i = 1; i < n; i++){ const t = i/n; right.push([px + (x + w/2 - px)*t + jit(s*.06), py + (y - py)*Math.pow(t, 1.15) + jit(s*.036)]); }
  right.push([x + w/2, y]); const all = left.concat(right);
  const p = pathOf(all, false); const sw = Math.min(2.2, Math.max(1.1, s*.045));
  const pf = pathOf(all, true); g.fillStyle = PAPER_L; g.fill(pf);
  const rx2 = px + w*(.04 + R()*.1), ry2 = y - h*R()*.15;
  // hatching
  const nh = (s / 4.5 | 0) + 2; g.beginPath();
  for (let i = 0; i < nh; i++){ const t = .35 + .62*(i + .5)/nh; const ax = px + (rx2 - px)*t, ay = py + (ry2 - py)*t; const fx = px + (x + w/2 - px)*t; const L = (fx - ax)*(.55 + R()*.35); if (L < 2) continue; g.moveTo(ax + 1, ay); g.lineTo(ax + L, ay + L*.35); }
  g.strokeStyle = INK; g.globalAlpha = .8; g.lineWidth = Math.min(1, Math.max(.6, s*.02)); g.lineCap = 'round'; g.stroke(); g.globalAlpha = 1;
  // ridge
  const mx = px + (rx2 - px)*.5 + jit(s*.05), my = py + (ry2 - py)*.5;
  g.beginPath(); g.moveTo(px, py); g.quadraticCurveTo(mx, my, rx2, ry2); g.lineWidth = sw*.7; g.stroke();
  if (s > 30){ g.beginPath(); const k = 1 + (R()*3|0); for (let i = 0; i < k; i++){ const t = .45 + R()*.35; const lx = px - (px - (x - w/2))*t*(.4 + R()*.4), ly = py + h*t; g.moveTo(lx, ly); g.lineTo(lx + s*.1, ly - s*.04); } g.globalAlpha = .55; g.lineWidth = .8; g.stroke(); g.globalAlpha = 1; }
  g.lineJoin = 'round'; g.lineWidth = sw; g.stroke(p);
}
function drawTree(g, x, y, s, seedv){
  const R = rng(seedv); const h = s * (1.6 + R()*.5), w = s * (.75 + R()*.2); const top = [x + (R()-.5)*.6, y - h];
  const pts = [top]; for (let i = 1; i <= 3; i++){ const ty = y - h + h*.8*i/3; const tw = w/2*(.45 + .55*i/3); pts.push([x + tw, ty]); pts.push([x + tw*.45, ty - h*.06]); }
  const left = pts.slice(1).map(p => [2*x - p[0], p[1]]).reverse(); const poly = pts.concat(left);
  g.lineCap = 'round'; g.strokeStyle = INK;
  g.beginPath(); g.moveTo(x, y - h*.2); g.lineTo(x, y); g.lineWidth = 1; g.stroke();
  const p = pathOf(poly, true); g.fillStyle = PAPER_L; g.fill(p); g.lineJoin = 'round'; g.lineWidth = 1; g.stroke(p);
  g.beginPath(); g.moveTo(x + w*.12, y - h*.55); g.lineTo(x + w*.32, y - h*.43); g.moveTo(x + w*.15, y - h*.3); g.lineTo(x + w*.4, y - h*.2); g.lineWidth = .7; g.stroke();
}
function drawTuft(g, x, y, s, seedv){ const R = rng(seedv); g.save(); g.strokeStyle = INK; g.lineCap = 'round'; g.lineWidth = .9;
  g.beginPath(); const lean = (R() - .5) * s * .25;
  g.moveTo(x, y); g.quadraticCurveTo(x + lean*.5, y - s*.5, x + lean, y - s);
  g.moveTo(x - s*.12, y); g.quadraticCurveTo(x - s*.3, y - s*.4, x - s*.55 + lean*.5, y - s*.72);
  g.moveTo(x + s*.12, y); g.quadraticCurveTo(x + s*.3, y - s*.4, x + s*.55 + lean*.5, y - s*.72);
  if (R() < .5){ g.moveTo(x - s*.25, y); g.lineTo(x - s*.62, y - s*.35); }
  g.stroke(); g.beginPath(); g.moveTo(x - s*.85, y + .8); g.lineTo(x - s*.25, y + .8); g.moveTo(x + s*.2, y + .8); g.lineTo(x + s*.8, y + .8); g.lineWidth = .7; g.globalAlpha = .8; g.stroke(); g.restore(); }
function drawWet(g, x, y, s, seedv){ const R = rng(seedv); g.save(); g.strokeStyle = INK; g.lineCap = 'round'; g.lineWidth = .7; g.globalAlpha = .75; g.beginPath();
  const k = 2 + (R()*2|0); for (let i = 0; i < k; i++){ const l = s * (1 + R()*1.3) * (1 - i*.22); const ox = (R() - .5) * s * .6; g.moveTo(x + ox - l/2, y + i*2.6); g.lineTo(x + ox + l/2, y + i*2.6); }
  g.stroke(); g.restore(); }
// ================= stamps & text boxes =================
const STAMPS = {
  compass: {name: 'Роза вітрів', size: 210}, house: {name: 'Будинок', size: 40}, manor: {name: 'Маєток', size: 64}, 
  tower: {name: 'Вежа', size: 54}, ruins: {name: 'Руїни', size: 56}, cave: {name: 'Печера / шахта', size: 56},
  camp: {name: 'Табір', size: 54}, warehouse: {name: 'Склад / комплекс', size: 70}, banner: {name: 'Стяг', size: 50},
  sigil: {name: 'Трикутник (Новий Сюзеренат)', size: 56}, poppy: {name: 'Мак', size: 44}, arrow: {name: 'Стрілка', size: 70}, poi: {name: 'Мітка', size: 28}
};
// ---- stamp artwork: 100-unit box centred on (0,0), ground line around y = +38 ----
function stampKit(g, u){
  const L = (px) => px / u;
  const K = {
    L,
    path(pts, close){ g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]); if (close) g.closePath(); },
    face(pts, fill, lw){ K.path(pts, true); g.fillStyle = fill || PAPER_L; g.fill(); g.lineWidth = L(lw || 1.3); g.strokeStyle = INK; g.stroke(); },
    line(pts, lw, a){ K.path(pts, false); g.lineWidth = L(lw || 1.2); g.strokeStyle = INK; g.globalAlpha = a ?? 1; g.stroke(); g.globalAlpha = 1; },
    dark(pts){ K.path(pts, true); g.fillStyle = INK; g.fill(); },
    hatch(pts, ang, gapU, lw, a){ const gap = Math.max(gapU, 2.1 / u); g.save(); K.path(pts, true); g.clip();
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const p of pts){ x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); }
      const cx = (x0 + x1)/2, cy = (y0 + y1)/2, R = Math.hypot(x1 - x0, y1 - y0)/2 + 2; const dx = Math.cos(ang), dy = Math.sin(ang), nx = -dy, ny = dx;
      g.beginPath(); for (let o = -R; o <= R; o += gap){ g.moveTo(cx + nx*o - dx*R, cy + ny*o - dy*R); g.lineTo(cx + nx*o + dx*R, cy + ny*o + dy*R); }
      g.lineWidth = L(lw || .7); g.strokeStyle = INK; g.globalAlpha = a ?? .85; g.stroke(); g.restore(); g.globalAlpha = 1; },
    ground(x0, x1, y){ g.beginPath(); for (let x = x0; x < x1; x += 7){ g.moveTo(x, y + ((x*7) % 3) * .3); g.lineTo(Math.min(x1, x + 4.2), y); } g.lineWidth = L(.9); g.strokeStyle = INK; g.globalAlpha = .8; g.stroke(); g.globalAlpha = 1; },
    // 3/4 view gabled building: front face, right side face (hatched), roof planes
    house(x, by, w, h, d, rh, o){ o = o || {}; const fl = x - w/2, fr = x + w/2, top = by - h, sk = d*.55;
      K.face([[fr, by], [fr + d, by - sk], [fr + d, top - sk], [fr, top]]); K.hatch([[fr, by], [fr + d, by - sk], [fr + d, top - sk], [fr, top]], -1.0, 2.4);
      const ax = x, ay = top - rh; // gable apex
      K.face([[fl, top], [ax, ay], [ax + d, ay - sk], [fl + d, top - sk]]); K.line([[fl + w*.18, top - rh*.36], [fl + w*.18 + d, top - rh*.36 - sk]], .5, .45);
      K.face([[fr, top], [ax, ay], [ax + d, ay - sk], [fr + d, top - sk]]); K.hatch([[fr, top], [ax, ay], [ax + d, ay - sk], [fr + d, top - sk]], -.35, 1.9, .65);
      K.thatch([fr, top], [fr + d, top - sk], [ax + d, ay - sk], [ax, ay], .45);
      K.face([[fl, by], [fl, top], [fr, top], [fr, by]]); if (o.timber) K.timber(fl, fr, top, by); else K.stone([[fl, by], [fl, by - h*.22], [fr, by - h*.22], [fr, by]], 3.4, .45);
      K.face([[fl, top], [ax, ay], [fr, top]]); if (o.timber){ K.line([[x, ay + rh*.15], [x, top]], 1, .7); }
      if (o.chimney){ const cx = x + w*.15 + d*.5, cb = ay + rh*.45 - sk*.5; K.face([[cx - 2.5, cb], [cx - 2.5, cb - 9], [cx + 2.5, cb - 9], [cx + 2.5, cb]]); if (o.smoke) K.smoke(cx, cb - 11, o.smoke); }
      if (o.door !== false){ const dw = Math.max(4, w*.2); K.dark([[x - dw/2, by], [x - dw/2, by - h*.45], [x + dw/2, by - h*.45], [x + dw/2, by]]); }
      if (o.win){ g.fillStyle = INK; const ws = Math.max(2.4, w*.11); g.fillRect(fl + w*.12, top + h*.22, ws, ws); g.fillRect(fr - w*.12 - ws, top + h*.22, ws, ws); }
    },
    // 3/4 view side-gabled building: ridge parallel to the front
    house2(x, by, w, h, d, rh, o){ o = o || {}; const fl = x - w/2, fr = x + w/2, top = by - h, sk = d*.55, ry = top - sk*.5 - rh;
      K.face([[fr, by], [fr + d, by - sk], [fr + d, top - sk], [fr + d*.5, ry], [fr, top]]); K.hatch([[fr, by], [fr + d, by - sk], [fr + d, top - sk], [fr + d*.5, ry], [fr, top]], -1.0, 2.4);
      K.face([[fl, by], [fl, top], [fr, top], [fr, by]]);
      K.face([[fl - 1, top + .5], [fr + 1, top + .5], [fr + d*.5 + 1, ry], [fl + d*.5 - 1, ry]]); K.thatch([fl - 1, top + .5], [fr + 1, top + .5], [fr + d*.5 + 1, ry], [fl + d*.5 - 1, ry], .55); if (o.timber) K.timber(fl, fr, top, by);
      if (o.door !== false){ const dw = Math.max(4, w*.16); K.dark([[x - dw/2, by], [x - dw/2, by - h*.55], [x + dw/2, by - h*.55], [x + dw/2, by]]); }
      if (o.win){ g.fillStyle = INK; const ws = Math.max(2.4, w*.09); g.fillRect(fl + w*.14, top + h*.25, ws, ws); g.fillRect(fr - w*.14 - ws, top + h*.25, ws, ws); }
    },
    // flat-topped block with crenellations (keeps, walls)
    block(x, by, w, h, d, o){ o = o || {}; const fl = x - w/2, fr = x + w/2, top = by - h, sk = d*.55;
      K.face([[fr, by], [fr + d, by - sk], [fr + d, top - sk], [fr, top]]); K.hatch([[fr, by], [fr + d, by - sk], [fr + d, top - sk], [fr, top]], -1.0, 2.2);
      K.face([[fl, top], [fl + d, top - sk], [fr + d, top - sk], [fr, top]]);
      K.face([[fl, by], [fl, top], [fr, top], [fr, by]]); if (o.stone !== false) K.stone([[fl, by], [fl, top], [fr, top], [fr, by]], o.row || 4.4, .42);
      if (o.cren !== false){ const n = Math.max(3, Math.round(w / 6)), cw = w / (n*2 - 1); for (let i = 0; i < n; i++){ const c0 = fl + i*2*cw; K.face([[c0, top], [c0, top - cw*1.1], [c0 + cw, top - cw*1.1], [c0 + cw, top]], PAPER_L, 1.1); } }
      if (o.win){ g.fillStyle = INK; for (let i = 0; i < o.win; i++){ const wx = fl + w*(i + .5)/o.win - 1.4; g.fillRect(wx, top + h*.25, 2.8, 5); } }
    },
    // round tower: cylinder with right half hatched; roof: 'cone' | 'cren' | 'none'
    tower(x, by, r, h, roof){ const top = by - h, e = r*.35;
      g.beginPath(); g.moveTo(x - r, top); g.lineTo(x - r, by); g.ellipse(x, by, r, e, 0, Math.PI, 0, true); g.lineTo(x + r, top); g.closePath(); g.fillStyle = PAPER_L; g.fill(); g.lineWidth = L(1.3); g.strokeStyle = INK; g.stroke();
      K.hatch([[x + r*.15, top], [x + r, top], [x + r, by], [x + r*.15, by + e*.8]], Math.PI/2, 2.1, .7); K.hatch([[x + r*.6, top], [x + r, top], [x + r, by], [x + r*.6, by + e*.5]], Math.PI/2, 1.5, .6, .6);
      { const row = Math.max(4.4, 2.6 / u); g.save(); g.beginPath(); g.moveTo(x - r, top); g.lineTo(x - r, by); g.ellipse(x, by, r, e, 0, Math.PI, 0, true); g.lineTo(x + r, top); g.closePath(); g.clip(); g.beginPath();
        let k = 0; for (let yy = by - row; yy > top; yy -= row, k++){ g.moveTo(x - r, yy); g.ellipse(x, yy, r, e, 0, Math.PI, 0, true); for (let a = (k % 2 ? .25 : 0) + .15; a < 1; a += .3){ const xx = x - r*Math.cos(a*Math.PI); g.moveTo(xx, yy + e*Math.sin(a*Math.PI)); g.lineTo(xx, yy + e*Math.sin(a*Math.PI) - row*.9); } }
        g.lineWidth = L(.5); g.strokeStyle = INK; g.globalAlpha = .45; g.stroke(); g.globalAlpha = 1; g.restore(); }
      g.beginPath(); g.ellipse(x, top, r, e, 0, 0, Math.PI*2); g.fillStyle = PAPER_L; g.fill(); g.stroke();
      if (roof === 'cone'){ K.face([[x - r - 1.5, top], [x, top - r*2.4], [x + r + 1.5, top]]); K.hatch([[x + .5, top - r*2.3], [x + r + 1.5, top], [x + r*.1, top + e*.5]], -.4, 1.9, .65); }
      else if (roof === 'cren'){ for (let i = -2; i <= 2; i++){ const cx = x + i*r*.42; K.face([[cx - r*.14, top + e*.6 - Math.abs(i)*e*.2], [cx - r*.14, top - r*.3], [cx + r*.14, top - r*.3], [cx + r*.14, top + e*.6 - Math.abs(i)*e*.2]], PAPER_L, 1); } }
    },
    clipTo(pts, fn){ g.save(); K.path(pts, true); g.clip(); fn(); g.restore(); },
    stone(pts, rowU, a){ const row = Math.max(rowU || 4.2, 2.6 / u); let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const p of pts){ x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); }
      K.clipTo(pts, () => { g.beginPath(); let k = 0; for (let y = y1 - row; y > y0; y -= row, k++){ const bw = row * 2.1; for (let x = x0 + (k % 2 ? bw/2 : 0) - bw; x < x1; x += bw){ const j = ((x*13 + y*7) % 5) * .12; g.moveTo(x + .6, y + j); g.lineTo(x + bw - .8, y + j); g.moveTo(x, y); g.lineTo(x, y - row*.9); } }
        g.lineWidth = L(.5); g.strokeStyle = INK; g.globalAlpha = a ?? .5; g.stroke(); g.globalAlpha = 1; }); },
    thatch(p0, p1, p2, p3, a){ // p0-p1 eave, p3-p2 ridge; strokes run eave->ridge, staggered rows
      const rows = 4; K.clipTo([p0, p1, p2, p3], () => { g.beginPath(); const n = Math.max(6, Math.round(Math.hypot(p1[0]-p0[0], p1[1]-p0[1]) / Math.max(2.2, 2.4 / u)));
        for (let r = 0; r < rows; r++){ const t0 = r / rows, t1 = (r + 1) / rows;
          for (let i = 0; i <= n; i++){ const s1 = (i + (r % 2) * .5) / n; const ex = p0[0] + (p1[0]-p0[0])*s1, ey = p0[1] + (p1[1]-p0[1])*s1, rx = p3[0] + (p2[0]-p3[0])*s1, ry = p3[1] + (p2[1]-p3[1])*s1;
            g.moveTo(ex + (rx-ex)*t0, ey + (ry-ey)*t0); g.lineTo(ex + (rx-ex)*(t1 - .08), ey + (ry-ey)*(t1 - .08)); }
          const ex0 = p0[0] + (p3[0]-p0[0])*t1, ey0 = p0[1] + (p3[1]-p0[1])*t1, ex1 = p1[0] + (p2[0]-p1[0])*t1, ey1 = p1[1] + (p2[1]-p1[1])*t1; g.moveTo(ex0, ey0); g.lineTo(ex1, ey1); }
        g.lineWidth = L(.5); g.strokeStyle = INK; g.globalAlpha = a ?? .6; g.stroke(); g.globalAlpha = 1; }); },
    timber(fl, fr, top, by){ const w = fr - fl; g.beginPath(); g.moveTo(fl, top + (by - top)*.45); g.lineTo(fr, top + (by - top)*.45);
      for (const t of [.2, .8]){ g.moveTo(fl + w*t, top); g.lineTo(fl + w*t, by); } g.moveTo(fl, top); g.lineTo(fl + w*.2, top + (by - top)*.45); g.moveTo(fr, top); g.lineTo(fl + w*.8, top + (by - top)*.45);
      g.lineWidth = L(1.1); g.strokeStyle = INK; g.globalAlpha = .75; g.stroke(); g.globalAlpha = 1; },
    tuft(x, y, s){ g.beginPath(); for (const a of [-.55, -.2, .15, .5]){ g.moveTo(x + a*s*.5, y); g.quadraticCurveTo(x + a*s*.7, y - s*.5, x + a*s*1.3, y - s*(.8 + Math.abs(a)*.2)); } g.lineWidth = L(.7); g.strokeStyle = INK; g.stroke(); },
    mound(cx, y, w, h){ const pts = []; for (let i = 0; i <= 20; i++){ const t = i/20; const x = cx - w/2 + w*t; pts.push([x, y - Math.sin(t*Math.PI) * h * (1 + .06*Math.sin(t*23))]); }
      K.path(pts, false); g.lineTo(cx + w/2, y); g.closePath(); g.fillStyle = PAPER_L; g.fill(); K.line(pts, 1.1);
      K.hatch([...pts.slice(12), [cx + w/2, y], [cx + w*.1, y]], -1.0, 2.4, .6, .55);
      for (const t of [.12, .3, .62, .85]) K.tuft(cx - w/2 + w*t, y - Math.sin(t*Math.PI)*h*.25 + 1, 4); },
    crenels(fl, w, top, cwMin){ const n = Math.max(3, Math.round(w / (cwMin || 6))), cw = w / (n*2 - 1); for (let i = 0; i < n; i++){ const c0 = fl + i*2*cw; K.face([[c0, top], [c0, top - cw*1.1], [c0 + cw, top - cw*1.1], [c0 + cw, top]], PAPER_L, 1.1); } },
    roofPyr(x, top, w, d, rh){ const fl = x - w/2, fr = x + w/2, sk = d*.55; const ax = x + d/2, ay = top - sk/2 - rh;
      K.face([[fl, top], [fl + d, top - sk], [ax, ay]]);
      K.face([[fr, top], [fr + d, top - sk], [ax, ay]]); K.hatch([[fr, top], [fr + d, top - sk], [ax, ay]], -.4, 1.8, .7);
      K.face([[fl, top], [fr, top], [ax, ay]]); K.line([[fl + w*.3, top], [ax, ay]], .6, .5); },
    slit(x, y, h){ g.fillStyle = INK; g.fillRect(x - 1.1, y, 2.2, h || 6); },
    gate(x, by, w, h){ K.dark([[x - w/2, by], [x - w/2, by - h*.6], [x, by - h], [x + w/2, by - h*.6], [x + w/2, by]]); for (let y = by - h*.75; y < by; y += 3) K.line([[x - w/2 + .8, y], [x + w/2 - .8, y]], .55, .75); },
    smoke(x, y, n){ g.beginPath(); let cx = x, cy = y, r = 2.6; for (let i = 0; i < (n || 3); i++){ g.moveTo(cx + r, cy); g.arc(cx, cy, r, 0, Math.PI*2); cx += 3 + i*1.5; cy -= 5 + i*1.2; r += 1.1; } g.lineWidth = L(.9); g.strokeStyle = INK; g.globalAlpha = .7; g.stroke(); g.globalAlpha = 1; },
    flag(x, y, h, w, tail){ K.line([[x, y], [x, y - h]], 1.3); const t = y - h; const p = [[x, t], [x + w*.5, t - 2], [x + w, t + 1.5], [x + (tail ? w*.72 : w), t + h*.17], [x + w, t + h*.32], [x + w*.5, t + h*.3], [x, t + h*.33]]; K.face(p, PAPER_L, 1.1); K.hatch([[x + w*.45, t - 2], [x + w, t + 1.5], [x + w*.72, t + h*.17], [x + w, t + h*.32], [x + w*.5, t + h*.3]], 1.2, 2, .6); },
    pine(x, by, s){ K.face([[x, by - s*1.9], [x + s*.5, by - s*.95], [x + s*.22, by - s*1.0], [x + s*.62, by - s*.25], [x - s*.62, by - s*.25], [x - s*.22, by - s*1.0], [x - s*.5, by - s*.95]], PAPER_L, 1); K.hatch([[x, by - s*1.9], [x + s*.5, by - s*.95], [x + s*.22, by - s*1.0], [x + s*.62, by - s*.25], [x, by - s*.25]], -.9, 1.8, .6); K.line([[x, by - s*.25], [x, by]], 1); },
    rock(x, y, s){ K.face([[x - s, y], [x - s*.6, y - s*.8], [x + s*.2, y - s], [x + s, y - s*.3], [x + s*.8, y]], PAPER_L, 1); K.hatch([[x + s*.2, y - s], [x + s, y - s*.3], [x + s*.8, y], [x + s*.1, y]], -.8, 1.8, .6); }
  };
  return K;
}
const STAMP_ART = {
  village(g, K){ K.mound(0, 46, 104, 14); K.pine(-40, 30, 9); K.pine(-33, 34, 7); K.house2(16, 16, 24, 14, 9, 9, {win: true}); K.house(-16, 22, 24, 16, 9, 13, {chimney: true, timber: true}); K.house(8, 38, 26, 17, 10, 14, {win: true, timber: true});
    K.line([[-44, 40], [-26, 40]], .9); for (let x = -44; x <= -26; x += 4.5) K.line([[x, 40], [x, 35]], .9); K.ground(-22, 44, 41); },
  house(g, K){ K.mound(0, 42, 96, 10); K.house(-4, 34, 44, 28, 16, 22, {chimney: true, win: true, timber: true}); K.tuft(30, 38, 6); K.tuft(-34, 38, 5); K.line([[-40, 34], [-26, 34]], .9); for (let x = -40; x <= -26; x += 4.6) K.line([[x, 34], [x, 28]], .9); K.ground(-30, 36, 36); },
  town(g, K){
    // back row (furthest)
    K.house(-34, 4, 11, 8, 5, 7, {door: false}); K.house2(-20, 4, 13, 8, 5, 6, {door: false}); K.house2(20, 3, 13, 8, 5, 6, {door: false}); K.house(34, 4, 11, 8, 5, 7, {door: false});
    // cathedral: nave + bell tower with spire
    K.house(8, 14, 12, 15, 18, 9, {door: false, win: true}); K.block(-5, 16, 10, 32, 5, {cren: false}); K.slit(-5, -10, 7);
    K.face([[-10, -16], [-2.5, -48], [5, -16]]); K.face([[5, -16], [7.5, -18.75], [-2.5, -48]]); K.hatch([[-2.5, -48], [5, -16], [7.5, -18.75]], -.3, 1.7, .7);
    // middle row
    K.house2(-30, 20, 15, 10, 5, 7, {win: true}); K.house(-15, 22, 12, 10, 5, 9); K.house(20, 21, 12, 10, 5, 9, {win: true}); K.house2(34, 20, 13, 10, 5, 7);
    // front row (nearest)
    K.house(-28, 36, 14, 11, 6, 10, {win: true}); K.house2(-11, 36, 16, 11, 6, 7, {win: true}); K.house2(12, 36, 16, 11, 6, 7, {win: true}); K.house(29, 36, 14, 11, 6, 10, {win: true});
    // walls, gatehouse, towers
    K.block(0, 48, 84, 10, 6, {}); K.block(0, 50, 18, 21, 7, {cren: false}); K.crenels(-9, 18, 29, 4.5); K.gate(0, 50, 8, 12); K.slit(-5, 33, 4); K.slit(5, 33, 4);
    K.tower(-44, 50, 8, 23, 'cone'); K.tower(44, 50, 8, 23, 'cone'); K.tuft(-30, 54, 5); K.tuft(30, 55, 5); K.ground(-52, 54, 53); },
  castle(g, K){ K.mound(0, 58, 116, 18);
    // rear towers and rear wall
    K.tower(-30, 4, 6, 22, 'cone'); K.tower(30, 0, 6, 22, 'cone'); K.block(0, 4, 54, 9, 4, {});
    // keep with pyramid roof and parapet
    K.block(4, 22, 26, 48, 11, {cren: false}); K.roofPyr(4, -26, 26, 11, 16); K.crenels(-9, 26, -26, 5); K.slit(-2, -14); K.slit(10, -14); K.slit(4, 0);
    K.flag(9.5, -45, 14, 16, true);
    // front curtain with gatehouse and round towers
    K.block(0, 42, 76, 15, 8, {}); K.block(0, 44, 22, 26, 8, {cren: false}); K.crenels(-11, 22, 18, 4.5); K.gate(0, 44, 10, 16); K.slit(-7, 24, 5); K.slit(7, 24, 5);
    K.tower(-40, 46, 10, 34, 'cone'); K.tower(40, 46, 10, 34, 'cone'); K.slit(-40, 26, 5); K.slit(40, 26, 5);
    K.rock(-24, 50, 5); K.rock(22, 51, 4.5); K.ground(-54, 56, 51); },
  tower(g, K){
    K.mound(0, 50, 80, 12); K.rock(-16, 44, 9); K.rock(17, 45, 8);
    K.block(0, 40, 22, 60, 10, {cren: false}); // shaft
    K.block(0, -20, 30, 9, 12, {cren: false}); // overhanging parapet
    for (let x = -13; x <= 13; x += 5.2) K.line([[x, -20], [x + 1, -16]], .7, .8); // corbels
    K.roofPyr(0, -29, 24, 10, 20); K.crenels(-15, 30, -29, 5);
    K.slit(0, -8, 8); K.slit(0, 12, 7); K.gate(0, 40, 9, 13); K.line([[11, 0], [11, 6]], 1.4, .9);
    K.flag(5, -51.5, 12, 13, true); K.ground(-30, 32, 47); },
  ruins(g, K){ // broken walls in 3/4 with jagged tops
    const wall = (x, by, w, h, d, jag) => { const fl = x - w/2, fr = x + w/2, sk = d*.55; const topPts = jag.map((t, i) => [fl + w*i/(jag.length - 1), by - h*t]);
      K.face([[fr, by], [fr + d, by - sk], [fr + d, topPts[topPts.length-1][1] - sk], topPts[topPts.length-1]]); K.hatch([[fr, by], [fr + d, by - sk], [fr + d, topPts[topPts.length-1][1] - sk], topPts[topPts.length-1]], -1, 2.2);
      K.face([[fl, by], ...topPts, [fr, by]]); K.stone([[fl, by], ...topPts, [fr, by]], 4, .5); };
    wall(-22, 30, 26, 40, 7, [.95, 1, .7, .82, .4, .55, .35]); g.fillStyle = INK; g.fillRect(-27, 4, 4, 7);
    wall(14, 34, 24, 28, 7, [.5, .9, 1, .6, .7, .3]); K.dark([[10, 34], [10, 22], [14, 19], [18, 22], [18, 34]]);
    K.face([[26, 42], [46, 36], [48, 40], [28, 46]]); K.hatch([[26, 42], [46, 36], [48, 40], [28, 46]], .3, 2, .6); // fallen column
    for (const [x, y, s] of [[-40, 42, 4], [-6, 40, 3.2], [0, 44, 2.6], [36, 46, 2.4], [-30, 44, 2.4]]) K.rock(x, y, s); for (const [x, y] of [[-34, 31], [-12, 31], [24, 35], [44, 46], [-46, 46]]) K.tuft(x, y, 5);
    g.beginPath(); g.moveTo(-34, 30); g.bezierCurveTo(-30, 20, -36, 12, -31, 4); g.moveTo(26, 34); g.bezierCurveTo(22, 26, 27, 20, 23, 12); g.lineWidth = K.L(.8); g.strokeStyle = INK; g.stroke(); K.ground(-48, 50, 46); },
  cave(g, K){ const hill = [[-48, 36], [-36, 8], [-22, -14], [-6, -26], [10, -22], [24, -6], [38, 12], [48, 36]];
    K.face(hill); K.hatch([[-6, -26], [10, -22], [24, -6], [38, 12], [48, 36], [14, 36], [6, 0]], -.95, 2.2);
    for (const c of [[[-30, 12], [-24, 8], [-26, 0]], [[-12, -12], [-6, -16], [-2, -12]], [[20, 4], [26, 10], [24, 18]], [[-38, 26], [-30, 22]], [[30, 24], [36, 30]]]) K.line(c, .8, .8); for (const [x, y] of [[-44, 36], [40, 36], [-20, 38]]) K.tuft(x, y, 5);
    K.dark([[-14, 36], [-14, 14], [-8, 6], [0, 3], [8, 6], [14, 14], [14, 36]]);
    K.face([[-18, 36], [-18, 8], [-14, 8], [-14, 36]], PAPER_L, 1.1); K.face([[14, 36], [14, 8], [18, 8], [18, 36]], PAPER_L, 1.1); K.face([[-21, 9], [-21, 3], [21, 3], [21, 9]], PAPER_L, 1.1);
    K.line([[-8, 36], [-26, 48]], 1); K.line([[8, 36], [-10, 48]], 1); for (let t = .15; t < 1; t += .22) K.line([[-8 - 18*t + 1, 36 + 12*t], [8 - 18*t - 1, 36 + 12*t]], .8);
    K.face([[-40, 44], [-36, 36], [-24, 36], [-22, 44]], PAPER_L, 1.1); K.hatch([[-30, 36], [-24, 36], [-22, 44], [-30, 44]], 1.2, 2, .6); g.beginPath(); g.arc(-36, 45, 2, 0, Math.PI*2); g.arc(-25, 45, 2, 0, Math.PI*2); g.fillStyle = INK; g.fill();
    for (const [x, y] of [[-30, 33], [-27, 32], [-33, 32]]){ g.beginPath(); g.arc(x, y, 1.6, 0, Math.PI*2); g.fill(); } },
  camp(g, K){ const tent = (x, by, w, h, d) => { const sk = d*.55; K.face([[x + w/2, by], [x, by - h], [x + d, by - h - sk], [x + w/2 + d, by - sk]]); K.hatch([[x + w/2, by], [x, by - h], [x + d, by - h - sk], [x + w/2 + d, by - sk]], -.6, 2.1);
      K.face([[x - w/2, by], [x, by - h], [x + w/2, by]]); K.line([[x - w*.25, by], [x, by - h]], .6, .6); K.line([[x + w*.25, by], [x, by - h]], .6, .6); K.dark([[x - w*.12, by], [x, by - h*.55], [x + w*.12, by]]); K.line([[x - w/2 - 3, by + 1], [x - w/2, by - 3]], .7); K.line([[x + w/2 + 3, by + 1], [x + w/2, by - 3]], .7); };
    tent(16, 22, 26, 22, 12); tent(-14, 36, 32, 28, 14); K.flag(-30, 36, 40, 16, true);
    K.face([[19, 44], [33, 40], [34, 42], [20, 46]], PAPER_L, .9); K.face([[19, 40], [33, 44], [32, 46], [18, 42]], PAPER_L, .9);
    g.beginPath(); g.moveTo(22, 41); g.quadraticCurveTo(21, 33, 26, 28); g.quadraticCurveTo(25, 34, 28, 35); g.quadraticCurveTo(30, 30, 29, 27); g.quadraticCurveTo(34, 33, 31, 41); g.closePath(); g.fillStyle = PAPER_L; g.fill(); g.lineWidth = K.L(1); g.strokeStyle = INK; g.stroke();
    for (let x = -46; x <= 46; x += 6) if (x < -24 || x > 36) K.face([[x - 1.6, 44], [x - 1.6, 34], [x, 31], [x + 1.6, 34], [x + 1.6, 44]], PAPER_L, .9);
    K.ground(-48, 50, 45); },
  banner(g, K){ K.face([[-3, 46], [-3, -36], [3, -36], [3, 46]], PAPER_L, 1.1); K.hatch([[0, 46], [0, -36], [3, -36], [3, 46]], Math.PI/2, 1.8, .6);
    K.face([[0, -48], [4, -38], [0, -36], [-4, -38]], PAPER_L, 1.1); K.face([[-16, -34], [16, -34], [16, -30], [-16, -30]], PAPER_L, 1);
    const fl = [[-14, -30], [14, -30], [16, 0], [12, 12], [8, 22], [0, 12], [-6, 26], [-10, 14], [-16, 2]]; K.face(fl);
    K.hatch([[-14, -30], [-4, -30], [-8, 18], [-10, 14], [-16, 2]], 1.25, 2, .6); K.hatch([[8, -30], [14, -30], [16, 0], [12, 12], [8, 22]], 1.4, 2, .6);
    K.face([[0, -22], [7, -12], [0, -2], [-7, -12]], PAPER_L, 1.1); K.dark([[0, -17], [3.5, -12], [0, -7], [-3.5, -12]]);
    K.rock(-10, 48, 6); K.rock(9, 48, 5); },
  warehouse(g, K){ // sawtooth-roof works hall, side store, chimney, crates
    K.block(8, 14, 9, 64, 5, {cren: false}); K.smoke(14, -54, 4); for (let y = -44; y < -8; y += 6) K.line([[3.5, y], [12.5, y]], .6, .7);
    const fl = -34, fr = 18, by = 30, top = 4, d = 12, sk = d*.55;
    K.face([[fr, by], [fr + d, by - sk], [fr + d, top - sk], [fr, top]]); K.hatch([[fr, by], [fr + d, by - sk], [fr + d, top - sk], [fr, top]], -1, 2.2);
    K.face([[fl, by], [fl, top], [fr, top], [fr, by]]);
    const n = 4, tw = (fr - fl) / n; for (let i = 0; i < n; i++){ const x0 = fl + i*tw; K.face([[x0, top], [x0 + tw, top - 10], [x0 + tw, top], [x0, top]], PAPER_L, 1.1); K.face([[x0 + tw, top - 10], [x0 + tw + d*.45, top - 10 - sk*.45], [x0 + tw + d*.45, top - sk*.45], [x0 + tw, top]], INK, 1); }
    g.fillStyle = INK; for (let i = 0; i < 6; i++) g.fillRect(fl + 3 + i*8.4, 12, 4, 6); K.dark([[-10, 30], [-10, 20], [-2, 20], [-2, 30]]);
    K.house(-38, 40, 18, 10, 6, 8, {door: false}); for (const [x, y] of [[8, 40], [15, 40], [11.5, 34]]){ K.face([[x - 3, y], [x - 3, y - 6], [x + 3, y - 6], [x + 3, y]], PAPER_L, 1); K.line([[x - 3, y - 6], [x + 3, y]], .6, .8); }
    K.line([[24, 42], [48, 42]], .9); for (let x = 24; x <= 48; x += 4) K.line([[x, 42], [x, 36]], .9); K.ground(-48, 50, 43); },
  sigil(g, K){ const T = (r) => [[0, -r], [r*.866, r*.5], [-r*.866, r*.5]];
    K.path(T(46), true); g.fillStyle = PAPER_L; g.fill(); g.lineWidth = K.L(2.6); g.strokeStyle = INK; g.stroke();
    K.path(T(38), true); g.lineWidth = K.L(1); g.stroke();
    // hatched band between the two triangles
    g.save(); g.beginPath(); for (const r of [38, 46]){ const t = T(r); g.moveTo(t[0][0], t[0][1]); g.lineTo(t[1][0], t[1][1]); g.lineTo(t[2][0], t[2][1]); g.closePath(); } g.clip('evenodd'); K.hatch([[-60, -60], [60, -60], [60, 60], [-60, 60]], -.8, 2, .8, .9); g.restore();
    K.path(T(26), true); g.lineWidth = K.L(1.6); g.strokeStyle = INK; g.stroke();
    K.line([[0, -26], [0, 13]], 1.1); K.path(T(9).map(p => [p[0], p[1] + 2]), true); g.fillStyle = INK; g.fill();
    for (const p of T(46)){ g.beginPath(); g.arc(p[0], p[1], 3.4, 0, Math.PI*2); g.fillStyle = PAPER_L; g.fill(); g.lineWidth = K.L(1.3); g.stroke(); } },
  poppy(g, K){ // stem and leaf
    g.beginPath(); g.moveTo(2, 46); g.bezierCurveTo(6, 30, -6, 14, 0, -2); g.lineWidth = K.L(1.6); g.strokeStyle = INK; g.stroke();
    const leaf = [[2, 34], [-10, 26], [-22, 28], [-30, 22], [-24, 18], [-28, 12], [-16, 14], [-12, 8], [-4, 18], [1, 28]]; K.face(leaf); K.hatch([[2, 34], [-10, 26], [-22, 28], [-30, 22], [-12, 24]], -.3, 1.9, .6); K.line([[1, 31], [-22, 20]], .7, .8);
    g.beginPath(); g.moveTo(3, 40); g.bezierCurveTo(14, 36, 18, 30, 22, 20); g.lineWidth = K.L(1.1); g.stroke(); K.face([[22, 20], [18, 13], [22, 4], [26, 13]]); K.hatch([[22, 20], [22, 4], [26, 13]], -1.2, 1.8, .6);
    // back petals
    const petal = (pts, sh) => { K.face(pts); if (sh) K.hatch(pts, -.7, 2, .65); };
    petal([[0, -4], [-22, -12], [-26, -30], [-12, -42], [0, -34]], true); petal([[0, -4], [22, -12], [26, -30], [12, -42], [0, -34]], true);
    // seed pod
    g.beginPath(); g.ellipse(0, -22, 8, 9, 0, 0, Math.PI*2); g.fillStyle = INK; g.fill(); g.beginPath(); for (let i = 0; i < 8; i++){ const a = i/8*Math.PI*2; g.moveTo(0, -29); g.lineTo(Math.cos(a)*7, -29 + Math.sin(a)*3); } g.strokeStyle = PAPER_L; g.lineWidth = K.L(.9); g.stroke(); g.strokeStyle = INK;
    // front petals
    petal([[0, -2], [-20, -6], [-30, -18], [-24, -26], [-8, -22], [-2, -12]], false); petal([[0, -2], [20, -6], [30, -18], [24, -26], [8, -22], [2, -12]], true);
    K.line([[-6, -8], [-20, -16]], .7, .7); K.line([[6, -8], [20, -16]], .7, .7); },
  manor(g, K){ K.mound(0, 50, 116, 12);
    K.pine(-46, 36, 8); K.pine(47, 36, 7);
    K.house(-30, 34, 20, 18, 8, 13, {door: false, win: true}); K.house(31, 34, 20, 18, 8, 13, {door: false, win: true});
    // main two-storey block, side-gabled, with chimneys
    K.face([[-12, 0], [-12, -15], [-8, -15], [-8, 0]]); K.face([[14, 0], [14, -15], [18, -15], [18, 0]]);
    K.house2(0, 38, 46, 30, 12, 13, {door: false});
    g.fillStyle = INK; for (const yy of [14, 26]) for (const xx of [-19, -12, 9, 16]) g.fillRect(xx, yy, 2.8, 4.2);
    // portico: pediment + columns + door
    K.face([[-9, 18], [0, 9], [9, 18]]); K.face([[-9.5, 19.5], [9.5, 19.5], [9.5, 18], [-9.5, 18]], PAPER_L, .9);
    for (const xx of [-8, -3.2, 1.6, 6.4]) K.face([[xx, 38], [xx, 19.5], [xx + 1.6, 19.5], [xx + 1.6, 38]], PAPER_L, .7);
    K.dark([[-2.2, 38], [-2.2, 28], [0, 26], [2.2, 28], [2.2, 38]]);
    // garden: path, low hedge with gate posts
    K.line([[-3, 39], [-8, 52]], .8, .8); K.line([[3, 39], [8, 52]], .8, .8);
    g.beginPath(); for (let x = -50; x <= 50; x += 3.2){ if (Math.abs(x) < 10) continue; g.moveTo(x, 46); g.arc(x, 46, 1.6, Math.PI, 0); } g.lineWidth = K.L(.8); g.strokeStyle = INK; g.stroke();
    K.face([[-11, 47], [-11, 40], [-9, 40], [-9, 47]], PAPER_L, .8); K.face([[9, 47], [9, 40], [11, 40], [11, 47]], PAPER_L, .8); },
  arrow(g, K){ // bold marker arrow pointing down at rot 0; swallowtail end, engraved ridge, right half hatched
    const P = [[0, 48], [-34, 6], [-22, 4], [-11, 12], [-9, -28], [-20, -48], [0, -37], [20, -48], [9, -28], [11, 12], [22, 4], [34, 6]];
    K.path(P, true); g.fillStyle = PAPER_L; g.fill();
    K.clipTo(P, () => { K.hatch([[0, -60], [40, -60], [40, 60], [0, 60]], -1.0, 2.2, .7); K.hatch([[0, 0], [40, 0], [40, 60], [0, 60]], -1.0, 1.5, .6, .55); });
    K.path(P, true); g.lineWidth = K.L(2.6); g.strokeStyle = INK; g.stroke();
    K.line([[0, 42], [0, -33]], 1, .9); // ridge
    K.line([[-27, 8], [-4, 37]], .8, .7); K.line([[-5, -27], [-5, 8]], .7, .55); K.line([[-15, -42], [-6, -32]], .7, .6); // inner engraving on the lit side
    for (const y of [-22, -16, -10]) K.line([[-9, y], [9, y]], .9, .85); // binding marks
  },
  poi(g, K){ g.beginPath(); g.arc(0, 0, 30, 0, Math.PI*2); g.fillStyle = PAPER_L; g.fill(); g.lineWidth = K.L(2.2); g.strokeStyle = INK; g.stroke(); g.beginPath(); g.arc(0, 0, 21, 0, Math.PI*2); g.lineWidth = K.L(1); g.stroke(); g.beginPath(); g.arc(0, 0, 8, 0, Math.PI*2); g.fillStyle = INK; g.fill(); }
};

const FONTS = [['Kurale', 'Kurale'], ['Cormorant Garamond', 'Cormorant'], ['Old Standard TT', 'Old Standard'], ['Ruslan Display', 'Ruslan Display'], ['Philosopher', 'Philosopher']];
function ensureDecor(){
  if (!Array.isArray(data.stamps)) data.stamps = []; if (!Array.isArray(data.texts)) data.texts = [];
  if (data.compass){ if ((data.settings || {}).compass !== false && !data.stamps.some(s => s.type === 'compass')) data.stamps.push({type: 'compass', x: data.compass.x, y: data.compass.y, size: data.compass.r * 2}); delete data.compass; }
  for (const o of data.stamps.concat(data.texts)){ if (!o.id) o.id = 'd' + (uid++); else { const n = +String(o.id).slice(1); if (n >= uid) uid = n + 1; } }
}
function haloAt(g, x, y, r){ const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(239,226,189,.92)'); gr.addColorStop(.65, 'rgba(239,226,189,.75)'); gr.addColorStop(1, 'rgba(239,226,189,0)'); g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, Math.PI*2); g.fill(); }
function drawStamp(g, st){
  const s = st.size, u = s / 100; g.save();
  if (st.type === 'compass'){ drawCompass(g, st.x, st.y, s / 2); }
  else {
    if (st.halo !== false) haloAt(g, st.x, st.y + s*.05, s*.72);
    g.translate(st.x, st.y); g.rotate((st.rot || 0) * Math.PI / 180); g.scale(u, u); g.lineJoin = 'round'; g.lineCap = 'round';
    (STAMP_ART[st.type] || STAMP_ART.poi)(g, stampKit(g, u));
  }
  g.restore();
  if (st.label){ const r = st.type === 'compass' ? s*.62 : s*.5; drawLabelBeside(g, st, [st.x - r, st.y - r, st.x + r, st.y + r], labelPosOf(st, true), st.labelSize || 22, 4); } // labels.js
}
function stampBox(st){ const s = st.size; const r = st.type === 'compass' ? s*.62 : s*.55; return [st.x - r, st.y - r, st.x + r, st.y + r]; }
function wrapLines(g, text, maxW){ const out = []; for (const para of String(text || '').split('\n')){ const words = para.split(/\s+/); let line = '';
    for (const w of words){ const t = line ? line + ' ' + w : w; if (g.measureText(t).width > maxW && line){ out.push(line); line = w; } else line = t; } out.push(line); } return out; }
function drawTextBox(g, t){
  g.save(); const fs = t.size || 36; g.font = `${t.italic ? 'italic ' : ''}${t.bold ? '700 ' : ''}${fs}px "${t.font || 'Kurale'}", serif`;
  try { g.letterSpacing = (t.spacing || 0) + 'px'; } catch (e) {}
  if (t.bg){ g.fillStyle = 'rgba(239,226,189,.94)'; g.fillRect(t.x, t.y, t.w, t.h); g.strokeStyle = INK; g.lineWidth = 2.2; g.strokeRect(t.x, t.y, t.w, t.h); g.lineWidth = .9; g.strokeRect(t.x + 6, t.y + 6, t.w - 12, t.h - 12); }
  const pad = t.bg ? 18 : 4; const lines = wrapLines(g, t.text, t.w - pad*2); const lh = fs * (t.lineH || 1.2);
  const total = lines.length * lh; let y = t.y + (t.h - total) / 2 + lh*.5; g.textBaseline = 'middle';
  const al = t.align || 'center'; g.textAlign = al; const x = al === 'left' ? t.x + pad : al === 'right' ? t.x + t.w - pad : t.x + t.w/2;
  for (const ln of lines){ if (!t.bg){ g.lineJoin = 'round'; g.strokeStyle = 'rgba(239,226,189,.92)'; g.lineWidth = fs*.22; g.strokeText(ln, x, y); } g.fillStyle = INK; g.fillText(ln, x, y); y += lh; }
  g.restore();
}
function drawDecor(g){ drawShapeLabels(g); for (const st of data.stamps || []) drawStamp(g, st); for (const st of exitStamps()) drawStamp(g, st); for (const t of data.texts || []) drawTextBox(g, t); }
function hitDecor(x, y){ const ts = visibleKinds.text === false ? [] : (data.texts || []); for (let i = ts.length - 1; i >= 0; i--){ const t = ts[i]; if (x >= t.x && x <= t.x + t.w && y >= t.y && y <= t.y + t.h) return {type: 'text', o: t}; }
  const ss = visibleKinds.stamp === false ? [] : (data.stamps || []); for (let i = ss.length - 1; i >= 0; i--){ const s = ss[i]; const r = Math.max(s.type === 'compass' ? s.size*.55 : s.size*.5, 10 / vs.scale); if (Math.hypot(x - s.x, y - s.y) <= r) return {type: 'stamp', o: s}; } return null; }
function decorHandle(so){ if (so.type === 'text') return [so.o.x + so.o.w, so.o.y + so.o.h]; const b = stampBox(so.o); return [b[2], b[3]]; }

function drawCompass(g, cx, cy, r){
  g.save(); g.strokeStyle = INK; g.fillStyle = INK;
  g.beginPath(); g.arc(cx, cy, r, 0, Math.PI*2); g.lineWidth = 1.6; g.stroke();
  g.beginPath(); g.arc(cx, cy, r*.9, 0, Math.PI*2); g.lineWidth = .8; g.stroke();
  g.beginPath(); for (let i = 0; i < 32; i++){ const a = i*Math.PI/16, l = r*(i % 2 ? .9 : .82); g.moveTo(cx + Math.cos(a)*l, cy + Math.sin(a)*l); g.lineTo(cx + Math.cos(a)*r*.9, cy + Math.sin(a)*r*.9); } g.lineWidth = .8; g.stroke();
  for (const [k, L, wd] of [[0, r*.62, r*.09], [1, r*1.15, r*.14]]) for (let i = 0; i < 4; i++){
    const a = i*Math.PI/2 + (k === 0 ? Math.PI/4 : 0) - Math.PI/2; const tx = cx + Math.cos(a)*L, ty = cy + Math.sin(a)*L;
    const lx = cx + Math.cos(a - Math.PI/2)*wd, ly = cy + Math.sin(a - Math.PI/2)*wd, rx = cx + Math.cos(a + Math.PI/2)*wd, ry = cy + Math.sin(a + Math.PI/2)*wd;
    g.beginPath(); g.moveTo(cx, cy); g.lineTo(lx, ly); g.lineTo(tx, ty); g.closePath(); g.fillStyle = INK; g.fill(); g.lineWidth = .9; g.stroke();
    g.beginPath(); g.moveTo(cx, cy); g.lineTo(rx, ry); g.lineTo(tx, ty); g.closePath(); g.fillStyle = '#e8d6a6'; g.fill(); g.stroke(); }
  g.beginPath(); g.moveTo(cx-7, cy - r*1.32); g.lineTo(cx-7, cy - r*1.5); g.lineTo(cx+7, cy - r*1.32); g.lineTo(cx+7, cy - r*1.5); g.lineWidth = 2; g.lineJoin = 'round'; g.stroke();
  g.beginPath(); g.arc(cx, cy, r*.06, 0, Math.PI*2); g.fillStyle = '#e8d6a6'; g.fill(); g.lineWidth = 1; g.stroke();
  g.restore();
}

// opts.mode: 'island' — летючий острів поверх opts.bg (layers.js), 'cave' — підземелля; opts.under(g) малює під штампами (тіні шарів)
function renderMap(scale, withDecor, noFrame, opts){
  opts = opts || {}; const mode = opts.mode;
  const cw = Math.round(W*scale), ch = Math.round(H*scale);
  const out = layer(cw, ch); const g = out.getContext('2d');
  if (!paperCanvas) paperCanvas = makePaper();
  const geo = buildGeometry(); const dist = buildField(geo);
  const S = (ctx) => { ctx.setTransform(scale, 0, 0, scale, 0, 0); };
  // land mask
  const landL = layer(cw, ch), lg = landL.getContext('2d'); S(lg);
  const wide = geo.rivers.filter(r => riverW(r) > WIDE), narrow = geo.rivers.filter(r => riverW(r) <= WIDE);
  lg.fillStyle = '#000'; for (const l of geo.lands) lg.fill(pathOf(l.rough, true));
  lg.globalCompositeOperation = 'destination-out'; for (const l of geo.lakes) lg.fill(pathOf(l.rough, true));
  lg.strokeStyle = '#000'; for (const r of wide) strokeRiver(lg, r, 0);
  lg.globalCompositeOperation = 'source-over';
  // папір: на летючому острові — тільки під сушею (озера теж), довкола — нижні шари
  let solidL = null; if (mode){ solidL = layer(cw, ch); const sg = solidL.getContext('2d'); S(sg); sg.fillStyle = '#000'; for (const l of geo.lands) sg.fill(pathOf(l.rough, true)); }
  if (mode === 'island'){ if (opts.bg) g.drawImage(opts.bg, 0, 0, cw, ch); drawCliffs(g, geo, scale, cw, ch);
    const pp = layer(cw, ch), pg = pp.getContext('2d'); pg.drawImage(paperCanvas, 0, 0, cw, ch); pg.globalCompositeOperation = 'destination-in'; pg.drawImage(solidL, 0, 0); g.drawImage(pp, 0, 0); }
  else g.drawImage(paperCanvas, 0, 0, cw, ch);
  // tint
  const tint = layer(cw, ch), tg = tint.getContext('2d'); tg.drawImage(landL, 0, 0); tg.globalCompositeOperation = 'source-in'; tg.fillStyle = PAPER_L; tg.fillRect(0, 0, cw, ch);
  g.globalAlpha = .55; g.drawImage(tint, 0, 0); g.globalAlpha = 1;
  if (mode === 'cave') drawRock(g, solidL, scale, cw, ch);
  // coast path (all edges)
  const coast = new Path2D(); for (const l of geo.lands.concat(geo.lakes)) coast.addPath(pathOf(l.rough, true));
  // ripples (sea and lakes only, never inside rivers)
  const tmp = layer(cw, ch), mg = tmp.getContext('2d');
  for (const [d, w, a, dash] of mode ? [] : [[38, .7, .2, [14, 3, 6, 3]], [25, .9, .33, [14, 3, 6, 3]], [15, 1.1, .52, null], [7, 1.4, .75, null]]){
    mg.setTransform(1, 0, 0, 1, 0, 0); mg.clearRect(0, 0, cw, ch); S(mg); mg.lineJoin = 'round';
    mg.globalCompositeOperation = 'source-over'; mg.strokeStyle = INK; mg.lineWidth = 2*d + w; mg.setLineDash(dash || []); mg.stroke(coast); mg.setLineDash([]);
    mg.globalCompositeOperation = 'destination-out'; mg.lineWidth = 2*d - w; mg.stroke(coast);
    mg.strokeStyle = '#000'; for (const r of wide) strokeRiver(mg, r, 4);
    mg.setTransform(1, 0, 0, 1, 0, 0); mg.drawImage(landL, 0, 0);
    g.globalAlpha = a; g.drawImage(tmp, 0, 0); g.globalAlpha = 1; }
  mg.globalCompositeOperation = 'source-over';
  // shore lines: drawn double width, then kept only on the land side, so sea, lakes and wide rivers merge into one water body
  const cl = layer(cw, ch), cg = cl.getContext('2d');
  const one = layer(cw, ch), og = one.getContext('2d');
  for (let i = 0; i < geo.lands.length; i++){ const l = geo.lands[i];
    const others = geo.lands.filter((o, j) => j !== i && !(o.bb[0] > l.bb[2] || o.bb[2] < l.bb[0] || o.bb[1] > l.bb[3] || o.bb[3] < l.bb[1]));
    og.setTransform(1, 0, 0, 1, 0, 0); og.clearRect(0, 0, cw, ch); S(og); og.globalCompositeOperation = 'source-over'; og.strokeStyle = INK; og.lineWidth = 6; og.lineJoin = 'round'; og.stroke(pathOf(l.rough, true));
    if (others.length){ og.globalCompositeOperation = 'destination-out'; og.fillStyle = '#000'; for (const o of others) og.fill(pathOf(o.rough, true)); }
    og.setTransform(1, 0, 0, 1, 0, 0); cg.drawImage(one, 0, 0); }
  og.setTransform(1, 0, 0, 1, 0, 0); og.clearRect(0, 0, cw, ch); og.globalCompositeOperation = 'source-over'; S(og); og.strokeStyle = INK; og.lineJoin = 'round';
  og.lineWidth = 5.2; for (const l of geo.lakes) og.stroke(pathOf(l.rough, true));
  for (const r of wide) strokeRiver(og, r, 5.2);
  og.setTransform(1, 0, 0, 1, 0, 0); cg.drawImage(one, 0, 0);
  cg.globalCompositeOperation = 'destination-in'; cg.drawImage(landL, 0, 0); cg.globalCompositeOperation = 'source-over';
  g.drawImage(cl, 0, 0);
  // narrow rivers: single ink line that stops at any shore it reaches
  og.clearRect(0, 0, cw, ch); S(og); og.strokeStyle = INK; for (const r of narrow) strokeRiver(og, r, 0);
  og.setTransform(1, 0, 0, 1, 0, 0); og.globalCompositeOperation = 'destination-in'; og.drawImage(landL, 0, 0); og.globalCompositeOperation = 'source-over';
  g.drawImage(one, 0, 0);
  // glyph placement
  const pl = placeGlyphs(geo, dist, mode);
  S(g);
  // stipple & snow ticks
  g.fillStyle = INK; g.globalAlpha = .33; for (const [x, y] of pl.stip){ g.fillRect(x - .65, y - .65, 1.3, 1.3); } g.globalAlpha = 1;
  g.beginPath(); for (const [x, y, l] of pl.snow){ g.moveTo(x, y); g.quadraticCurveTo(x + l/2, y - l*.35, x + l, y); } g.strokeStyle = INK; g.globalAlpha = .55; g.lineWidth = .8; g.lineCap = 'round'; g.stroke(); g.globalAlpha = 1;
  g.beginPath(); for (const [x, y, l] of pl.dash){ g.moveTo(x - l/2, y); g.lineTo(x + l/2, y); } g.strokeStyle = INK; g.globalAlpha = .5; g.lineWidth = .7; g.stroke(); g.globalAlpha = 1;
  drawFields(g, pl.fields); drawRoutes(g, geo.routes); drawWalls(g, pl.walls, landL); drawRifts(g, geo.rifts);
  // glyphs
  for (const o of pl.glyphs){ if (o.t === 'h') drawHut(g, o.x, o.y, o.s, o.r); else if (o.t === 'wt') drawWallTower(g, o.x, o.y, o.s, o.cone); else if (o.t === 'sp') drawSpire(g, o.x, o.y, o.s); else if (o.t === 'kp') drawKeep(g, o.x, o.y, o.s); else if (o.t === 'm') drawMountain(g, o.x, o.y, o.s, o.r); else if (drawNatureGlyph(g, o)){} else if (o.t === 'b') drawTuft(g, o.x, o.y, o.s, o.r); else drawWet(g, o.x, o.y, o.s, o.r); }
  drawStains(g, geo.stains, scale);
  if (opts.under){ g.save(); S(g); opts.under(g); g.restore(); }
  if (withDecor) drawDecor(g);
  // frame
  if (!noFrame){ g.strokeStyle = INK; g.lineWidth = 3; g.strokeRect(18, 18, W - 36, H - 36); g.lineWidth = 1; g.strokeRect(28, 28, W - 56, H - 56);
  g.fillStyle = INK; g.globalAlpha = .85;
  for (let x = 28; x < W - 28; x += 60){ g.fillRect(x, 18, Math.min(30, W - 28 - x), 10); g.fillRect(x, H - 28, Math.min(30, W - 28 - x), 10); }
  for (let y = 28; y < H - 28; y += 60){ g.fillRect(18, y, 10, Math.min(30, H - 28 - y)); g.fillRect(W - 28, y, 10, Math.min(30, H - 28 - y)); } }
  g.globalAlpha = 1; g.setTransform(1, 0, 0, 1, 0, 0);
  // vignette
  const vg = g.createRadialGradient(cw/2, ch/2, 0, cw/2, ch/2, Math.hypot(cw, ch)*.55);
  vg.addColorStop(.62, 'rgba(107,63,18,0)'); vg.addColorStop(.9, 'rgba(107,63,18,.26)'); vg.addColorStop(1, 'rgba(74,42,10,.5)');
  g.fillStyle = vg; g.fillRect(0, 0, cw, ch);
  return out;
}

