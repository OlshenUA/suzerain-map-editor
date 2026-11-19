"use strict";
// Procedural generators: terrain & drainage (streams), ponds, marshes, settlements, ink stains.
// ================= wetlands generator: ponds, marshes, streams =================
function chamfer(T){ const N = FW*FH, d = new Float32Array(N); const BIG = 1e6; for (let i = 0; i < N; i++) d[i] = T[i] ? 0 : BIG;
  const a = 1, b = 1.4142;
  for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++){ const i = y*FW + x; let v = d[i]; if (!v) continue;
    if (x > 0) v = Math.min(v, d[i-1] + a); if (y > 0){ v = Math.min(v, d[i-FW] + a); if (x > 0) v = Math.min(v, d[i-FW-1] + b); if (x < FW-1) v = Math.min(v, d[i-FW+1] + b); } d[i] = v; }
  for (let y = FH-1; y >= 0; y--) for (let x = FW-1; x >= 0; x--){ const i = y*FW + x; let v = d[i]; if (!v) continue;
    if (x < FW-1) v = Math.min(v, d[i+1] + a); if (y < FH-1){ v = Math.min(v, d[i+FW] + a); if (x < FW-1) v = Math.min(v, d[i+FW+1] + b); if (x > 0) v = Math.min(v, d[i+FW-1] + b); } d[i] = v; }
  return d; }
function rasterMask(drawFn){ const c = layer(FW, FH), g = c.getContext('2d'); g.scale(1/FS, 1/FS); g.fillStyle = '#fff'; g.strokeStyle = '#fff'; drawFn(g); const im = g.getImageData(0, 0, FW, FH).data; const m = new Uint8Array(FW*FH); for (let i = 0; i < m.length; i++) m[i] = im[i*4+3] > 100 ? 1 : 0; return m; }
// ---- terrain model: elevation from mountains + distance from water, priority-flood drainage ----
function heapPush(h, k, v){ h.k.push(k); h.v.push(v); let i = h.k.length - 1; while (i > 0){ const p = (i - 1) >> 1; if (h.k[p] <= h.k[i]) break; [h.k[p], h.k[i]] = [h.k[i], h.k[p]]; [h.v[p], h.v[i]] = [h.v[i], h.v[p]]; i = p; } }
function heapPop(h){ const v = h.v[0]; const lk = h.k.pop(), lv = h.v.pop(); if (h.k.length){ h.k[0] = lk; h.v[0] = lv; let i = 0; const n = h.k.length;
    for (;;){ const l = 2*i + 1, r = l + 1; let m = i; if (l < n && h.k[l] < h.k[m]) m = l; if (r < n && h.k[r] < h.k[m]) m = r; if (m === i) break; [h.k[m], h.k[i]] = [h.k[i], h.k[m]]; [h.v[m], h.v[i]] = [h.v[i], h.v[m]]; i = m; } } return v; }
function terrain(seed, pull){ pull = pull ?? 1;
  const geo = buildGeometry(); const dist = buildField(geo); const N = FW*FH;
  const mtn = rasterMask(g => { for (const z of geo.mts) g.fill(pathOf(shapePts(z), true)); });
  const fst = rasterMask(g => { for (const z of geo.fos) g.fill(pathOf(shapePts(z), true)); });
  const narrowR = rasterMask(g => { g.lineWidth = 6; g.lineCap = 'round'; for (const r of geo.rivers) if (riverW(r) <= WIDE) g.stroke(pathOf(r.pts, false)); });
  const wideR = rasterMask(g => { g.lineCap = 'round'; for (const r of geo.rivers) if (riverW(r) > WIDE){ g.lineWidth = riverW(r) + 8; g.stroke(pathOf(r.pts, false)); } });
  const isW = new Uint8Array(N); for (let i = 0; i < N; i++) isW[i] = (dist[i] <= 0 || narrowR[i]) ? 1 : 0;
  const dWide = chamfer(wideR), dNarrow = chamfer(narrowR);
  const notM = new Uint8Array(N); for (let i = 0; i < N; i++) notM[i] = mtn[i] ? 0 : 1; const inM = chamfer(notM); // depth inside mountains
  const toM = chamfer(mtn); // distance to mountains
  const E = new Float32Array(N);
  for (let i = 0; i < N; i++){ const x = i % FW, y = (i / FW) | 0;
    const m = mtn[i] ? 60 + inM[i]*1.6 : 60*Math.exp(-toM[i]/32);
    E[i] = m + .35*Math.min(dist[i]/FS, 120) + (fbm(x/45, y/45, 3) - .5)*55 + (fbm(x/16, y/16, 8) - .5)*24
      - pull * (55*Math.exp(-dWide[i]/45) + 14*Math.exp(-dNarrow[i]/18)); }
  return {geo, dist, mtn, fst, narrowR, wideR, isW, E, toM, pull};
}
function drainage(T, rainMul){
  const N = FW*FH, {isW, E, mtn, toM} = T; const parent = new Int32Array(N).fill(-1), seen = new Uint8Array(N), filled = new Float32Array(N); const order = [];
  const h = {k: [], v: []}; const nb = [-1, 1, -FW, FW, -FW-1, -FW+1, FW-1, FW+1];
  const {wideR, narrowR, pull} = T; for (let i = 0; i < N; i++){ if (!isW[i]) continue; seen[i] = 1; const x = i % FW; let edge = false;
    for (const d of nb){ const j = i + d; if (j < 0 || j >= N || Math.abs((j % FW) - x) > 1) continue; if (!isW[j]){ edge = true; break; } } if (edge){ const k = wideR[i] ? -60*pull - 1 : narrowR[i] ? -18*pull - 1 : -1; filled[i] = k; heapPush(h, k, i); } }
  while (h.k.length){ const c = heapPop(h); const x = c % FW; for (const d of nb){ const j = c + d; if (j < 0 || j >= N || Math.abs((j % FW) - x) > 1 || seen[j]) continue; seen[j] = 1; parent[j] = c; filled[j] = Math.max(E[j], filled[c] + .01); order.push(j); heapPush(h, filled[j], j); } }
  const acc = new Float32Array(N); for (const c of order) acc[c] = (1 + 3.5*(mtn[c] ? 1 : Math.exp(-toM[c]/25))) * rainMul;
  for (let k = order.length - 1; k >= 0; k--){ const c = order[k], p = parent[c]; if (p >= 0 && !isW[p]) acc[p] += acc[c]; }
  return {parent, acc, order};
}
function regionMask(rs){ return rasterMask(g => g.fill(pathOf(shapePts(rs), true))); }
function cellXY(i){ return [(i % FW + .5) * FS, (((i / FW) | 0) + .5) * FS]; }
function genTag(rs, t){ return 'r:' + rs.id + ':' + t; }
function clearGen(rs, t){ const tag = genTag(rs, t); data.shapes = data.shapes.filter(x => x.gen !== tag); if (selected && selected.gen === tag) selected = null; }
function insertShapes(arr){ const firstNonLand = data.shapes.findIndex(x => x.kind !== 'land' && x.kind !== 'lake');
  const lakes = arr.filter(o => o.kind === 'lake'), zones = arr.filter(o => o.kind === 'terrain'), rivers = arr.filter(o => o.kind === 'river');
  data.shapes.splice(firstNonLand < 0 ? data.shapes.length : firstNonLand, 0, ...lakes, ...zones); data.shapes.push(...rivers); for (const o of arr) o.id = 's' + (uid++); }

function genStreams(rs, seed){
  clearGen(rs, 'stream'); const T = terrain(seed, rs.pull ?? 1); const RM = regionMask(rs); const dens = rs.streams ?? 1;
  const {parent, acc} = drainage(T, 1); const N = FW*FH; const thr = 260 / dens; const R = rng(seed);
  const isCh = (i) => i >= 0 && !T.isW[i] && acc[i] >= thr;
  // heads: channel cells inside the region with no upstream channel cell
  const hasUp = new Uint8Array(N); for (let i = 0; i < N; i++){ const p = parent[i]; if (p >= 0 && isCh(i) && isCh(p)) hasUp[p] = 1; }
  let heads = []; for (let i = 0; i < N; i++) if (RM[i] && isCh(i) && !hasUp[i] && (T.mtn[i] || T.toM[i]*FS < 110)) heads.push(i);
  if (!heads.length) for (let i = 0; i < N; i++) if (RM[i] && isCh(i) && !hasUp[i] && acc[i] > thr*1.5) heads.push(i);
  // trace longest/most upstream first so trunks are continuous
  const len = (i) => { let n = 0; while (i >= 0 && !T.isW[i] && n < 5000){ i = parent[i]; n++; } return n; };
  heads.sort((a, b) => len(b) - len(a));
  const used = new Uint8Array(N); const out = []; const tag = genTag(rs, 'stream');
  for (const hd of heads){ const cells = []; let c = hd, endAcc = acc[hd];
    while (c >= 0){ cells.push(c); if (T.isW[c] || used[c]) break; used[c] = 1; endAcc = acc[c]; c = parent[c]; }
    if (cells.length < 9) continue;
    const pts = []; for (let k = 0; k < cells.length; k++){ if (k % 3 && k !== cells.length - 1) continue; const [x, y] = cellXY(cells[k]); const j = (k === 0 || k === cells.length - 1) ? 0 : 4.5;
      pts.push([Math.round((x + (vnoise(x/14, y/14, 21) - .5)*2*j)*10)/10, Math.round((y + (vnoise(x/14, y/14, 22) - .5)*2*j)*10)/10]); }
    const w = Math.min(4.2, 1.1 + .55*Math.log2(endAcc/thr + 1));
    out.push({kind: 'river', shape: 'line', pts, width: Math.round(w*10)/10, taper: true, gen: tag}); }
  insertShapes(out); return out.length;
}
function pondPoly(R, cx, cy, r){ const n = 10, ang = R()*Math.PI, el = 1 + R()*.7, ps = [], ph = R()*100;
  for (let i = 0; i < n; i++){ const a = i/n*Math.PI*2; const rr = r * (.72 + .55*fbm(Math.cos(a)*1.3 + ph, Math.sin(a)*1.3, 3)); const x = Math.cos(a)*rr*el, y = Math.sin(a)*rr;
    ps.push([Math.round(cx + x*Math.cos(ang) - y*Math.sin(ang)), Math.round(cy + x*Math.sin(ang) + y*Math.cos(ang))]); } return ps; }
function genPonds(rs, seed){
  clearGen(rs, 'pond'); const T = terrain(seed); const RM = regionMask(rs); const R = rng(seed); const pts = shapePts(rs); const bb = bbox(pts);
  const area = polyArea(pts); const target = Math.max(2, Math.round(area / 26000 * (rs.ponds ?? 1)));
  const gi = (x, y) => { const fx = (x / FS) | 0, fy = (y / FS) | 0; return (fx < 0 || fy < 0 || fx >= FW || fy >= FH) ? -1 : fy*FW + fx; };
  const ponds = []; const ok = (x, y, r) => { const i = gi(x, y); if (i < 0 || !RM[i] || T.mtn[i] || T.narrowR[i]) return false; if (T.dist[i] < r*1.5 + 12) return false; if (T.fst[i] && R() > .25) return false;
    if (T.E[i] > 40) return false; for (const p of ponds) if (Math.hypot(p.x - x, p.y - y) < p.r + r + 22) return false; return true; };
  let main = 0;
  for (let t = 0; t < target * 300 && main < target; t++){ const x = bb[0] + R()*(bb[2]-bb[0]), y = bb[1] + R()*(bb[3]-bb[1]); const i = gi(x, y);
    if (i < 0 || R() > 1.1 - T.E[i]/45) continue; const r = 6 + 20*Math.pow(R(), 2.2); if (!ok(x, y, r)) continue; ponds.push({x, y, r}); main++;
    const k = R() < .5 ? (R()*4)|0 : 0; for (let j = 0; j < k; j++){ const a = R()*Math.PI*2, d = r + 18 + R()*40; const sx = x + Math.cos(a)*d, sy = y + Math.sin(a)*d, sr = 4.5 + R()*8; if (ok(sx, sy, sr)) ponds.push({x: sx, y: sy, r: sr}); } }
  const tag = genTag(rs, 'pond'); const out = ponds.map(p => ({kind: 'lake', shape: 'poly', pts: pondPoly(R, p.x, p.y, p.r), gen: tag}));
  insertShapes(out); return out.length;
}
function genMarsh(rs, seed){
  clearGen(rs, 'marsh'); const T = terrain(seed); const RM = regionMask(rs); const R = rng(seed); const rp = shapePts(rs); const bb = bbox(rp);
  const area = polyArea(rp); const target = Math.max(1, Math.round(area / 70000 * (rs.marsh ?? 1)));
  // wet ground = close to any water (rivers, lakes, ponds, sea) and low
  const Wd = chamfer(T.isW);
  const gi = (x, y) => { const fx = (x / FS) | 0, fy = (y / FS) | 0; return (fx < 0 || fy < 0 || fx >= FW || fy >= FH) ? -1 : fy*FW + fx; };
  const cx0 = (bb[0] + bb[2]) / 2, cy0 = (bb[1] + bb[3]) / 2; const zones = []; const out = []; const tag = genTag(rs, 'marsh');
  for (let t = 0; t < target * 400 && zones.length < target; t++){ const x = bb[0] + R()*(bb[2]-bb[0]), y = bb[1] + R()*(bb[3]-bb[1]); const i = gi(x, y);
    if (i < 0 || !RM[i] || T.mtn[i] || T.dist[i] < 10 || T.E[i] > 42) continue; if (Wd[i]*FS > 90 && R() > .15) continue;
    const r = 45 + R()*80; if (zones.some(z => Math.hypot(z.x - x, z.y - y) < z.r + r*.7)) continue; zones.push({x, y, r});
    const n = 13, ps = [], ph = R()*100, el = 1.1 + R()*.6, ang = R()*Math.PI;
    for (let k = 0; k < n; k++){ const a = k/n*Math.PI*2; let rr = r * (.6 + .7*fbm(Math.cos(a)*1.6 + ph, Math.sin(a)*1.6, 9)); let px, py;
      for (let s = 0; s < 8; s++){ const ex = Math.cos(a)*rr*el, ey = Math.sin(a)*rr; px = x + ex*Math.cos(ang) - ey*Math.sin(ang); py = y + ex*Math.sin(ang) + ey*Math.cos(ang); if (inside(rs, px, py)) break; rr *= .75; }
      ps.push([Math.round(px), Math.round(py)]); }
    out.push({kind: 'terrain', terrain: 'marsh', shape: 'poly', pts: ps, density: 1, gen: tag}); }
  insertShapes(out); return out.length;
}

// ================= settlement zones: village / town / fortress =================
const SETTLE = ['vill', 'town', 'fort'];
function placeSettlements(geo, ctx){
  const {landAt, free, mark, glyphs, seed, mS, mD, mR} = ctx; const fields = [], walls = [];
  const blocked = (m, x, y, r) => { const fx = (x / FS) | 0, fy = (y / FS) | 0, rr = Math.ceil(r / FS); for (let yy = fy - rr; yy <= fy; yy++) for (let xx = fx - rr; xx <= fx + rr; xx++) if (xx >= 0 && yy >= 0 && xx < FW && yy < FH && m[yy*FW + xx]) return true; return false; };
  for (const z of geo.set){
    const pts = shapePts(z); const bb = bbox(pts); const A = polyArea(pts); const R = rng(seed * 31 + strHash(z.id));
    let cx = 0, cy = 0; for (const p of pts){ cx += p[0]; cy += p[1]; } cx /= pts.length; cy /= pts.length;
    if (!inside(z, cx, cy) || !landAt(cx, cy, 10)){ let best = null; for (let i = 0; i < 400; i++){ const x = bb[0] + R()*(bb[2]-bb[0]), y = bb[1] + R()*(bb[3]-bb[1]); if (!inside(z, x, y) || !landAt(x, y, 10)) continue; const d = depthIn(z, x, y) - Math.hypot(x - cx, y - cy)*.25; if (!best || d > best[2]) best = [x, y, d]; } if (best){ cx = best[0]; cy = best[1]; } }
    const sc = z.scale ?? 1; const placedH = []; const ig = z.ignore || {}; const onMap = (x, y) => x >= 0 && y >= 0 && x < W && y < H;
    const okGround = (x, y, m) => ig.water ? onMap(x, y) : landAt(x, y, m);
    const okSpot = (x, y, s, inset) => inside(z, x, y) && depthIn(z, x, y) >= inset && okGround(x, y, 3) && (ig.rivers || !blocked(mR, x, y, 3)) && (ig.roads || !blocked(mD, x, y, 3)) && (ig.stamps || !blocked(mS, x, y, 3)) && !placedH.some(h => Math.abs(h[0] - x) < (h[2] + s)*.62 && Math.abs(h[1] - y) < (h[2] + s)*.42);
    const addHut = (x, y, s) => { placedH.push([x, y, s]); glyphs.push({y, t: 'h', x, s, r: (R()*1e9)|0}); if (z.clear === false) mark(x, y + 2, s*.8); };
    if (z.kind === 'vill'){
      const nH = Math.max(3, Math.round(A / 1500 * (z.density ?? 1))); const nC = 1 + (R()*Math.min(3, A/20000))|0; const centers = [[cx, cy]];
      for (let i = 1; i < nC; i++){ for (let t = 0; t < 60; t++){ const x = bb[0] + R()*(bb[2]-bb[0]), y = bb[1] + R()*(bb[3]-bb[1]); if (inside(z, x, y) && depthIn(z, x, y) > 18){ centers.push([x, y]); break; } } }
      const sig = Math.sqrt(A) / 5.5; let made = 0;
      for (let t = 0; t < nH * 40 && made < nH; t++){ const c = centers[(R()*centers.length)|0]; const g1 = (R() + R() + R() - 1.5) * sig, g2 = (R() + R() + R() - 1.5) * sig; const x = c[0] + g1, y = c[1] + g2*.8, s = (8 + R()*4) * sc;
        if (okSpot(x, y, s, 4)){ addHut(x, y, s); made++; } }
      const nF = Math.round(A / 2600 * (z.fields ?? 1)); const fc = [];
      for (let t = 0; t < nF * 30 && fc.length < nF; t++){ const x = bb[0] + R()*(bb[2]-bb[0]), y = bb[1] + R()*(bb[3]-bb[1]); if (!inside(z, x, y) || !okGround(x, y, 6)) continue;
        const w = 22 + R()*26, h = 14 + R()*16; if (placedH.some(hh => Math.hypot(hh[0] - x, hh[1] - y) < 14 + w*.5) || fc.some(f => Math.abs(f[0] - x) < (f[2] + w)*.5 + 3 && Math.abs(f[1] - y) < (f[3] + h)*.5 + 3)) continue;
        const a = (R() - .5) * .9; fc.push([x, y, w*1.1, h*1.2]);
        const c = Math.cos(a), s2 = Math.sin(a); const cor = [[-w/2, -h/2], [w/2, -h/2], [w/2, h/2], [-w/2, h/2]].map(([u, v]) => [x + u*c - v*s2 + (R()-.5)*4, y + u*s2 + v*c + (R()-.5)*3]);
        if (!cor.every(q => inside(z, q[0], q[1]) && depthIn(z, q[0], q[1]) >= 2 && okGround(q[0], q[1], 1)) || !cor.every((q, i) => { const r2 = cor[(i+1)%4]; const mx = (q[0] + r2[0])/2, my = (q[1] + r2[1])/2; return inside(z, mx, my) && depthIn(z, mx, my) >= 2; })){ fc.pop(); continue; }
        if (z.clear === false) for (const q of cor.concat([[x, y]])) mark(q[0], q[1], 8);
        fields.push({z, pts: cor, a: a + (R() < .5 ? 0 : Math.PI/2), tone: R()}); mark(x, y, 10); }
    } else {
      const fort = z.kind === 'fort'; const ww = z.wall ?? (fort ? 7 : 5);
      // wall towers on corners and along long edges
      const tw = []; const n = pts.length; const step = fort ? 80 : 65;
      for (let i = 0; i < n; i++){ const a = pts[i], b = pts[(i+1)%n]; tw.push([a[0], a[1]]); const L = Math.hypot(b[0]-a[0], b[1]-a[1]); const k = Math.floor(L / step); for (let j = 1; j <= k; j++){ const t = j / (k + 1); tw.push([a[0] + (b[0]-a[0])*t, a[1] + (b[1]-a[1])*t]); } }
      const wmode = z.wallMode || 'land'; if (wmode !== 'never'){ walls.push({pts, w: ww, mode: wmode}); if (z.clear === false){ const n2 = pts.length; for (let i = 0; i < n2; i++){ const a = pts[i], b = pts[(i+1)%n2]; const L = Math.hypot(b[0]-a[0], b[1]-a[1]); for (let t = 0; t <= L; t += FS*2) mark(a[0] + (b[0]-a[0])*t/L, a[1] + (b[1]-a[1])*t/L + 4, ww + 6); } } }
      const tr = fort ? Math.max(5, ww*.9) : Math.max(4, ww*.85);
      for (const [x, y] of tw) if (wmode === 'always' || (wmode === 'land' && landAt(x, y, 1))) glyphs.push({y: y + tr*.35, t: 'wt', x, s: tr, r: (R()*1e9)|0, cone: false});
      const inset = ww/2 + 7;
      if (!fort){
        const streets = []; const ns = 2 + (R()*2|0); for (let i = 0; i < ns; i++) streets.push(R()*Math.PI);
        const step2 = 10 * sc / Math.sqrt(z.density ?? 1); const sq = Math.min(16, Math.sqrt(A)/10);
        let spireAt = [cx + sq*.9, cy - sq*.3]; if (!okGround(spireAt[0], spireAt[1], 4)) spireAt = [cx, cy]; glyphs.push({y: spireAt[1], t: 'sp', x: spireAt[0], s: 12*sc, r: 1}); if (z.clear === false) mark(spireAt[0], spireAt[1] + 2, 10*sc); placedH.push([spireAt[0], spireAt[1], 14*sc]);
        for (let y = bb[1]; y <= bb[3]; y += step2*.72) for (let x = bb[0]; x <= bb[2]; x += step2){ const jx = x + (R() - .5)*3 + ((Math.round((y - bb[1]) / (step2*.72)) % 2) ? step2/2 : 0), jy = y + (R() - .5)*2;
          if (Math.hypot(jx - cx, jy - cy) < sq) continue; let onStreet = false; for (const a of streets){ const d = Math.abs((jx - cx)*Math.sin(a) - (jy - cy)*Math.cos(a)); if (d < 3.6){ onStreet = true; break; } } if (onStreet) continue;
          const s = (6.5 + R()*2.5) * sc; if (okSpot(jx, jy, s, inset)) addHut(jx, jy, s); }
      } else {
        const ks = Math.max(18, Math.min(46, Math.sqrt(A) / 4)) * sc; glyphs.push({y: cy + ks*.3, t: 'kp', x: cx, s: ks, r: (R()*1e9)|0}); if (z.clear === false) mark(cx, cy + ks*.3, ks*.8); placedH.push([cx, cy, ks*1.4]);
        const nb = Math.round(Math.max(2, A / 5000) * (z.density ?? 1)); let made = 0; for (let t = 0; t < nb * 60 && made < nb; t++){ const x = bb[0] + R()*(bb[2]-bb[0]), y = bb[1] + R()*(bb[3]-bb[1]); const s = (8 + R()*4) * sc; if (okSpot(x, y, s, inset + 4)){ addHut(x, y, s); made++; } }
      }
    }
  }
  // keep mountains, trees and snow marks out of every settlement
  for (const z of geo.set){ if (z.clear === false) continue; const pts = shapePts(z); const bb = bbox(pts); for (let yy = bb[1] - 6; yy <= bb[3] + 14; yy += FS) for (let xx = bb[0] - 6; xx <= bb[2] + 6; xx += FS){ if (inside(z, xx, yy) || depthIn(z, xx, yy) < 6){ const fx = (xx/FS)|0, fy = (yy/FS)|0; if (fx >= 0 && fy >= 0 && fx < FW && fy < FH) ctx.occ[fy*FW + fx] = 1; } } }
  return {fields, walls};
}
const TONE = 'rgba(42,27,14,.30)', TONE2 = 'rgba(42,27,14,.5)';
function drawHut(g, x, y, s, seedv){ const R = rng(seedv); const w = s, h = s*.5, d = s*.42, sk = d*.55, rh = s*.42; const fl = x - w/2, fr = x + w/2, top = y - h;
  g.save(); g.lineJoin = 'round'; g.strokeStyle = INK; g.lineWidth = .7; const F = (pts, fill) => { g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]); g.closePath(); g.fillStyle = fill; g.fill(); g.stroke(); };
  if (R() < .5){ const ax = x, ay = top - rh;
    F([[fr, y], [fr + d, y - sk], [fr + d, top - sk], [fr, top]], PAPER_L); F([[fr, y], [fr + d, y - sk], [fr + d, top - sk], [fr, top]], TONE);
    F([[fl, top], [ax, ay], [ax + d, ay - sk], [fl + d, top - sk]], PAPER_L); F([[fr, top], [ax, ay], [ax + d, ay - sk], [fr + d, top - sk]], TONE2);
    F([[fl, y], [fl, top], [fr, top], [fr, y]], PAPER_L); F([[fl, top], [ax, ay], [fr, top]], PAPER_L); }
  else { const ry = top - sk*.5 - rh*.8;
    F([[fr, y], [fr + d, y - sk], [fr + d, top - sk], [fr + d*.5, ry], [fr, top]], PAPER_L); F([[fr, y], [fr + d, y - sk], [fr + d, top - sk], [fr + d*.5, ry], [fr, top]], TONE2);
    F([[fl, y], [fl, top], [fr, top], [fr, y]], PAPER_L); F([[fl - .5, top], [fr + .5, top], [fr + d*.5, ry], [fl + d*.5, ry]], PAPER_L);
    g.beginPath(); g.moveTo(fl + d*.25, (top + ry)/2); g.lineTo(fr + d*.25, (top + ry)/2); g.lineWidth = .45; g.stroke(); }
  g.fillStyle = INK; g.fillRect(x - s*.07, y - h*.55, s*.14, h*.55); g.restore(); }
function drawSpire(g, x, y, s){ const w = s*.36, h = s*1.0, d = s*.2, sk = d*.55; g.save(); g.strokeStyle = INK; g.lineWidth = .8; g.lineJoin = 'round';
  const F = (pts, fill) => { g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]); g.closePath(); g.fillStyle = fill; g.fill(); g.stroke(); };
  F([[x + w/2, y], [x + w/2 + d, y - sk], [x + w/2 + d, y - h - sk], [x + w/2, y - h]], PAPER_L); F([[x + w/2, y], [x + w/2 + d, y - sk], [x + w/2 + d, y - h - sk], [x + w/2, y - h]], TONE);
  F([[x - w/2, y], [x - w/2, y - h], [x + w/2, y - h], [x + w/2, y]], PAPER_L); F([[x - w/2 - .5, y - h], [x + d*.5, y - h - s*1.1], [x + w/2 + .5, y - h]], PAPER_L); F([[x + w/2 + .5, y - h], [x + w/2 + d, y - h - sk], [x + d*.5, y - h - s*1.1]], TONE2);
  g.fillStyle = INK; g.fillRect(x - .7, y - h*.75, 1.4, 2.6); g.restore(); }
function drawKeep(g, x, y, s){ const w = s*.62, h = s*.7, d = s*.3, sk = d*.55, fl = x - w/2, fr = x + w/2, top = y - h; g.save(); g.strokeStyle = INK; g.lineWidth = 1; g.lineJoin = 'round';
  const F = (pts, fill) => { g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]); g.closePath(); g.fillStyle = fill; g.fill(); g.stroke(); };
  F([[fr, y], [fr + d, y - sk], [fr + d, top - sk], [fr, top]], PAPER_L); F([[fr, y], [fr + d, y - sk], [fr + d, top - sk], [fr, top]], TONE);
  F([[fl, top], [fl + d, top - sk], [fr + d, top - sk], [fr, top]], PAPER_L); F([[fl, y], [fl, top], [fr, top], [fr, y]], PAPER_L);
  const ax = x + d/2, ay = top - sk/2 - s*.32; F([[fl, top], [fl + d, top - sk], [ax, ay]], PAPER_L); F([[fr, top], [fr + d, top - sk], [ax, ay]], TONE2); F([[fl, top], [fr, top], [ax, ay]], PAPER_L);
  const n = Math.max(3, Math.round(w / 5)), cw = w / (n*2 - 1); for (let i = 0; i < n; i++){ const c0 = fl + i*2*cw; F([[c0, top], [c0, top - cw], [c0 + cw, top - cw], [c0 + cw, top]], PAPER_L); }
  g.fillStyle = INK; g.fillRect(x - w*.08, y - h*.3, w*.16, h*.3); g.fillRect(fl + w*.2, top + h*.25, 1.6, 3); g.fillRect(fr - w*.2 - 1.6, top + h*.25, 1.6, 3);
  g.beginPath(); g.moveTo(ax, ay); g.lineTo(ax, ay - s*.28); g.stroke(); g.beginPath(); g.moveTo(ax, ay - s*.28); g.lineTo(ax + s*.18, ay - s*.24); g.lineTo(ax, ay - s*.19); g.closePath(); g.fillStyle = PAPER_L; g.fill(); g.stroke(); g.restore(); }
function drawWallTower(g, x, y, r, cone){ const h = r*1.9, e = r*.4, top = y - h; g.save(); g.strokeStyle = INK; g.lineWidth = .9;
  g.beginPath(); g.moveTo(x - r, top); g.lineTo(x - r, y); g.ellipse(x, y, r, e, 0, Math.PI, 0, true); g.lineTo(x + r, top); g.closePath(); g.fillStyle = PAPER_L; g.fill(); g.stroke();
  g.beginPath(); g.moveTo(x + r*.2, top); g.lineTo(x + r, top); g.lineTo(x + r, y); g.lineTo(x + r*.2, y + e*.9); g.closePath(); g.fillStyle = TONE; g.fill();
  g.beginPath(); g.ellipse(x, top, r, e, 0, 0, Math.PI*2); g.fillStyle = PAPER_L; g.fill(); g.stroke();
  if (cone){ g.beginPath(); g.moveTo(x - r - .8, top); g.lineTo(x, top - r*2.1); g.lineTo(x + r + .8, top); g.closePath(); g.fillStyle = PAPER_L; g.fill(); g.stroke(); g.beginPath(); g.moveTo(x, top - r*2.1); g.lineTo(x + r + .8, top); g.lineTo(x + r*.15, top + e*.6); g.closePath(); g.fillStyle = TONE2; g.fill(); }
  else { g.fillStyle = INK; for (let i = -1; i <= 1; i++) g.fillRect(x + i*r*.55 - r*.12, top - r*.35, r*.24, r*.35); }
  g.fillStyle = INK; g.fillRect(x - .6, y - h*.6, 1.2, h*.22); g.restore(); }
function drawFields(g, fields){ for (const f of fields){ g.save(); g.beginPath(); const zp = shapePts(f.z); g.moveTo(zp[0][0], zp[0][1]); for (const p of zp) g.lineTo(p[0], p[1]); g.closePath(); g.clip();
    const p = f.pts; g.beginPath(); g.moveTo(p[0][0], p[0][1]); for (const q of p) g.lineTo(q[0], q[1]); g.closePath(); g.fillStyle = `rgba(150,105,45,${.05 + f.tone*.08})`; g.fill(); g.strokeStyle = INK; g.lineWidth = .8; g.globalAlpha = .75; g.stroke(); g.clip();
    const cx = (p[0][0] + p[2][0])/2, cy = (p[0][1] + p[2][1])/2, dx = Math.cos(f.a), dy = Math.sin(f.a); g.beginPath(); for (let o = -40; o <= 40; o += 3.2){ g.moveTo(cx - dy*o - dx*50, cy + dx*o - dy*50); g.lineTo(cx - dy*o + dx*50, cy + dx*o + dy*50); }
    g.lineWidth = .5; g.globalAlpha = .55; g.stroke(); g.restore(); } }
function drawRoutes(g, routes){ g.save(); g.lineJoin = 'round'; g.lineCap = 'round';
  for (const kind of ['path', 'road', 'rail']) for (const r of routes){ if (r.s.kind !== kind) continue; const k = r.s.width || 1; const p = pathOf(r.pts, false);
    if (kind === 'road'){ g.setLineDash([]); g.strokeStyle = INK; g.lineWidth = 5.2*k; g.stroke(p); g.strokeStyle = PAPER_L; g.lineWidth = 3*k; g.stroke(p); g.setLineDash([1.5*k, 7*k]); g.strokeStyle = INK; g.globalAlpha = .35; g.lineWidth = .7; g.stroke(p); g.globalAlpha = 1; }
    else if (kind === 'rail'){ g.setLineDash([]); g.strokeStyle = INK; g.lineWidth = 4.2*k; g.lineCap = 'butt'; g.stroke(p); g.strokeStyle = PAPER_L; g.lineWidth = 2.2*k; g.setLineDash([6*k, 6*k]); g.stroke(p); g.lineCap = 'round'; }
    else { g.setLineDash([5*k, 4*k]); g.strokeStyle = INK; g.lineWidth = 1.4*k; g.stroke(p); }
    g.setLineDash([]); }
  g.restore(); }
function drawWalls(g0, walls, landMask){ for (const w of walls){ const p = pathOf(w.pts, true); let g = g0, tmp = null;
    if (w.mode === 'land' && landMask){ tmp = layer(landMask.width, landMask.height); g = tmp.getContext('2d'); g.setTransform(g0.getTransform()); }
    g.save(); g.lineJoin = 'round'; g.strokeStyle = INK; g.lineWidth = w.w + 2.4; g.stroke(p); g.strokeStyle = PAPER_L; g.lineWidth = w.w; g.stroke(p);
    g.setLineDash([2.2, 2.2]); g.strokeStyle = INK; g.lineWidth = Math.max(1, w.w*.5); g.globalAlpha = .7; g.stroke(p); g.restore();
    if (tmp){ g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'destination-in'; g.drawImage(landMask, 0, 0); g0.save(); g0.setTransform(1, 0, 0, 1, 0, 0); g0.drawImage(tmp, 0, 0); g0.restore(); } } }

// ================= ink stains =================
const INK_PRESETS = [
  {name: 'Залізо-жовчне', c: '#3b2f2f'}, {name: 'Сепія', c: '#704214'}, {name: 'Кіновар', c: '#b8352a'}, {name: 'Кров’яне', c: '#7d1a1a'},
  {name: 'Малахіт', c: '#2f6b3a'}, {name: 'Болотяне', c: '#5b6b2a'}, {name: 'Індиго', c: '#2e3a6b'}, {name: 'Берлінська лазур', c: '#1f4e79'},
  {name: 'Охра', c: '#b5832e'}, {name: 'Пурпур', c: '#5e2a5a'}, {name: 'Сажа', c: '#1c1a17'}, {name: 'Іржа', c: '#8a4a22'}
];
let stainNoise = null;
function stainGrain(){ if (stainNoise) return stainNoise; const c = layer(256, 256), g = c.getContext('2d'), im = g.createImageData(256, 256); const r = rng(1234);
  for (let i = 0; i < 256*256; i++){ const v = r(); im.data[i*4+3] = v > .55 ? (v - .55) * 560 : 0; } g.putImageData(im, 0, 0);
  const c2 = layer(256, 256), g2 = c2.getContext('2d'); g2.filter = 'blur(1.2px)'; g2.drawImage(c, 0, 0); g2.filter = 'none'; g2.globalAlpha = .6; g2.drawImage(c, 0, 0); stainNoise = c2; return c2; }
function stainPath(s, seed){ const p = shapePts(s); const sm = s.shape === 'ellipse' ? p : chaikin(p, 2, true); const rgh = s.rough ?? 1.2;
  return roughen(sm, true, 4 + rgh * 9, seed + strHash(s.id) % 997, 4); }
function drawStains(g, stains, scale){ if (!stains.length) return; const seed = data.seed | 0;
  for (const s of stains){ const pts = stainPath(s, seed); const bb = bbox(pts); const bl = s.blur ?? 8; const m = bl * 3 + 50;
    const bx = bb[0] - m, by = bb[1] - m, bw = bb[2] - bb[0] + 2*m, bh = bb[3] - bb[1] + 2*m; const cw = Math.max(1, Math.ceil(bw*scale)), ch = Math.max(1, Math.ceil(bh*scale));
    const t = layer(cw, ch), tg = t.getContext('2d'); tg.setTransform(scale, 0, 0, scale, -bx*scale, -by*scale); const path = pathOf(pts, true); const col = s.color || '#2f6b3a'; const edge = s.edge ?? .5;
    tg.fillStyle = col; tg.strokeStyle = col; tg.filter = bl > 0 ? `blur(${bl*scale}px)` : 'none';
    tg.globalAlpha = 1 - edge*.6; tg.fill(path);
    // darker pooled rim where the ink dried
    if (edge > 0){ tg.filter = `blur(${Math.max(.6, bl*.35)*scale}px)`; tg.globalAlpha = Math.min(1, edge*1.1); tg.lineWidth = 2.5 + bl*.35; tg.lineJoin = 'round'; tg.stroke(path); }
    // splatter drops
    const nd = Math.round(s.drops ?? 6); if (nd > 0){ const R = rng(strHash(s.id) + seed); tg.filter = `blur(${Math.min(2, bl*.15)*scale}px)`; tg.globalAlpha = .85;
      for (let i = 0; i < nd; i++){ const p = pts[(R()*pts.length)|0]; const cx = (bb[0] + bb[2])/2, cy = (bb[1] + bb[3])/2; const dx = p[0] - cx, dy = p[1] - cy, L = Math.hypot(dx, dy) || 1; const out = 4 + R()*R()*40;
        const x = p[0] + dx/L*out, y = p[1] + dy/L*out, r = .8 + R()*R()*5; tg.beginPath(); tg.arc(x, y, r, 0, Math.PI*2); tg.fill(); if (R() < .4){ tg.beginPath(); tg.arc(x + dx/L*r*2.2, y + dy/L*r*2.2, r*.45, 0, Math.PI*2); tg.fill(); } } }
    tg.filter = 'none';
    // granulation: pigment settling in the paper
    const gr = s.grain ?? .4; if (gr > 0){ tg.setTransform(1, 0, 0, 1, 0, 0); tg.globalCompositeOperation = 'destination-out'; tg.globalAlpha = gr * .7; tg.fillStyle = tg.createPattern(stainGrain(), 'repeat'); tg.fillRect(0, 0, cw, ch); tg.globalCompositeOperation = 'source-over'; }
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'multiply'; g.globalAlpha = s.opacity ?? .45; g.drawImage(t, bx*scale, by*scale); g.restore(); }
}
function hexToRgb(h){ const m = /^#?([0-9a-f]{6})$/i.exec(h || ''); const n = m ? parseInt(m[1], 16) : 0; return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function rgbToHex(r, g, b){ const c = (v) => Math.max(0, Math.min(255, v|0)).toString(16).padStart(2, '0'); return '#' + c(r) + c(g) + c(b); }

