"use strict";
// Клімат і ландшафт: види дерев у лісах, шар ландшафту (сніг, тундра, степ, пагорби, болото, пустеля),
// їхні позначки чорнилом і розміщення цих позначок. Підключається після render.js.

// ================= довідники =================
const TREE_TYPES = {
  conifer:   {name: 'Хвойні', space: 1},
  broadleaf: {name: 'Листяні', space: 1.35},
  mixed:     {name: 'Мішані', space: 1.18},
  palm:      {name: 'Пальми', space: 1.3},
  jungle:    {name: 'Джунглі', space: 1.5},
  dead:      {name: 'Сухостій / мертвий ліс', space: 1.1},
  mushroom:  {name: 'Гриби', space: 1.25},
  coral:     {name: 'Корали', space: 1.3},
};
const TERRAINS = {
  snow:   {name: 'Сніг', color: '#dfe9ff'},
  tundra: {name: 'Тундра', color: '#8fd1bd'},
  steppe: {name: 'Степ', color: '#e6cf6e'},
  meadow: {name: 'Поля', color: '#9ccc65'},
  hills:  {name: 'Пагорби', color: '#d9a066'},
  marsh:  {name: 'Болото', color: '#c49be8'},
  desert: {name: 'Пустеля', color: '#f4a742'},
};
function terrainOf(s){ return TERRAINS[s.terrain] ? s.terrain : 'steppe'; }
function treesOf(s){ return TREE_TYPES[s.trees] ? s.trees : 'conifer'; }
// Колір контуру фігури на сцені й позначки в списках.
function shapeColor(s){ return s.kind === 'terrain' ? TERRAINS[terrainOf(s)].color : s.kind === 'stain' ? (s.color || KIND_COLOR.stain) : KIND_COLOR[s.kind]; }
// Конкретне дерево для виду лісу (мішаний і джунглі — суміш).
function pickTree(kind, R){ if (kind === 'mixed') return R() < .5 ? 'conifer' : 'broadleaf'; if (kind === 'jungle') return R() < .18 ? 'palm' : 'jungle'; return kind; }

// ================= міграція старих мап (v1 → v2) =================
// Болота стають ландшафтом «Болото»; глобальні «Снігові позначки» — шаром «Сніг» на всю мапу з тією ж щільністю.
function migrateNature(d){
  if ((d.v | 0) >= 2) return;
  for (const s of d.shapes || []) if (s.kind === 'marsh'){ s.kind = 'terrain'; s.terrain = 'marsh'; }
  const st = d.settings || (d.settings = {}); const sn = st.snow ?? 1; const w = d.W || 3200, h = d.H || 1513;
  if (sn > 0) (d.shapes || (d.shapes = [])).unshift({kind: 'terrain', terrain: 'snow', shape: 'poly', pts: [[-40, -40], [w + 40, -40], [w + 40, h + 40], [-40, h + 40]], density: sn});
  delete st.snow; d.v = 2;
}

// ================= позначки (вигляд у три чверті, тіні штрихуванням праворуч) =================
function drawTreeKind(g, x, y, s, r, k){
  if (k === 'broadleaf') return drawBroadleaf(g, x, y, s, r, false);
  if (k === 'jungle') return drawBroadleaf(g, x, y, s * 1.15, r, true);
  if (k === 'palm') return drawPalm(g, x, y, s, r);
  if (k === 'dead') return drawDeadTree(g, x, y, s, r);
  if (k === 'mushroom') return drawMushroom(g, x, y, s, r);
  if (k === 'coral') return drawCoral(g, x, y, s, r);
  return drawTree(g, x, y, s, r);
}
function drawBroadleaf(g, x, y, s, seedv, lush){
  const R = rng(seedv); const h = s * (1.45 + R()*.35), cr = s * (lush ? .62 + R()*.12 : .5 + R()*.12);
  const cx = x + (R() - .5) * s * .1, cy = y - h + cr * (lush ? .85 : 1);
  g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = INK;
  g.beginPath(); g.moveTo(x, cy + cr * .55); g.lineTo(x, y); g.lineWidth = 1; g.stroke();
  const n = (lush ? 9 : 7) + (R()*3 | 0), pts = [];
  for (let i = 0; i < n; i++){ const a = -Math.PI / 2 + i / n * Math.PI * 2 + (R() - .5) * .35; const rr = cr * (.84 + R()*.22); pts.push([cx + Math.cos(a)*rr, cy + Math.sin(a)*rr*(lush ? .8 : .92)]); }
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const p = new Path2D(); let m = mid(pts[n - 1], pts[0]); p.moveTo(m[0], m[1]);
  for (let i = 0; i < n; i++){ const a = pts[i], b = pts[(i + 1) % n]; const c = [cx + (a[0] - cx) * 1.2, cy + (a[1] - cy) * 1.2]; m = mid(a, b); p.quadraticCurveTo(c[0], c[1], m[0], m[1]); }
  p.closePath(); g.fillStyle = PAPER_L; g.fill(p); g.lineWidth = 1; g.stroke(p);
  // тінь: кілька коротких дуг з правого нижнього боку крони
  g.beginPath(); const k = lush ? 4 : 3;
  for (let i = 0; i < k; i++){ const t = (i + .5) / k; const a = -.2 + t * 1.5; const rx = cx + Math.cos(a) * cr * .55, ry = cy + Math.sin(a) * cr * .5; g.moveTo(rx, ry); g.lineTo(rx + cr * .26, ry + cr * .12); }
  g.lineWidth = .7; g.globalAlpha = .85; g.stroke(); g.globalAlpha = 1;
}
function drawPalm(g, x, y, s, seedv){
  const R = rng(seedv); const h = s * (1.7 + R()*.4), lean = (R() - .5) * s * .8; const tx = x + lean, ty = y - h;
  g.lineCap = 'round'; g.strokeStyle = INK;
  g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + lean * .15, y - h * .55, tx, ty); g.lineWidth = 1.25; g.stroke();
  g.beginPath(); for (let i = 1; i < 5; i++){ const t = i / 5; const px = x + (tx - x) * t * t + lean * .15 * 2 * t * (1 - t), py = y - h * t; g.moveTo(px - 1.6, py + .4); g.lineTo(px + 1.6, py - .4); } g.lineWidth = .6; g.stroke();
  const k = 5 + (R()*2 | 0), L = s * (.85 + R()*.25);
  for (let i = 0; i < k; i++){ const a = Math.PI + (i + .5) / k * Math.PI + (R() - .5) * .25; const ex = tx + Math.cos(a) * L, ey = ty + Math.sin(a) * L * .45 + L * .38;
    const c1x = tx + Math.cos(a) * L * .5, c1y = ty + Math.sin(a) * L * .55 - L * .18;
    g.beginPath(); g.moveTo(tx, ty); g.quadraticCurveTo(c1x, c1y, ex, ey); g.lineWidth = .9; g.stroke();
    g.beginPath(); for (let j = 1; j <= 2; j++){ const t = j / 4; const qx = (1 - t) * (1 - t) * tx + 2 * (1 - t) * t * c1x + t * t * ex, qy = (1 - t) * (1 - t) * ty + 2 * (1 - t) * t * c1y + t * t * ey; g.moveTo(qx, qy); g.lineTo(qx + (ex > tx ? 1 : -1) * 1.2, qy + 2.2); } g.lineWidth = .6; g.stroke(); }
}
function drawDeadTree(g, x, y, s, seedv){
  const R = rng(seedv); const h = s * (1.5 + R()*.5); g.lineCap = 'round'; g.strokeStyle = INK;
  g.beginPath(); g.moveTo(x, y); g.lineTo(x + (R() - .5) * 1.5, y - h); g.lineWidth = 1.1; g.stroke();
  g.beginPath(); const k = 3 + (R()*3 | 0);
  for (let i = 0; i < k; i++){ const t = .35 + .6 * i / k; const by = y - h * t, side = i % 2 ? 1 : -1, L = s * (.35 + R()*.3) * (1 - t * .4);
    const ex = x + side * L, ey = by - L * (.55 + R()*.4); g.moveTo(x, by); g.lineTo(ex, ey); if (R() < .6){ g.moveTo((x + ex) / 2 + side * L * .1, (by + ey) / 2); g.lineTo((x + ex) / 2 + side * L * .45, (by + ey) / 2 - L * .45); } }
  g.lineWidth = .8; g.stroke();
}
// гриб-велетень: товста ніжка, капелюх-купол з плямами й пластинками знизу, тінь праворуч; іноді поруч малі грибочки
function drawMushroom(g, x, y, s, seedv){
  const R = rng(seedv); g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = INK;
  const one = (x, y, s, spots) => {
    const h = s * (.95 + R()*.45), sw = s * (.15 + R()*.05), cw = s * (.58 + R()*.2), chh = cw * (.85 + R()*.35), lean = (R() - .5) * s * .25;
    const tx = x + lean, ty = y - h; // низ капелюха
    const stem = new Path2D(); stem.moveTo(x - sw * 1.15, y); stem.quadraticCurveTo(x - sw * .7 + lean * .4, y - h * .5, tx - sw * .8, ty); stem.lineTo(tx + sw * .8, ty); stem.quadraticCurveTo(x + sw * .7 + lean * .4, y - h * .5, x + sw * 1.15, y); stem.closePath();
    g.fillStyle = PAPER_L; g.fill(stem); g.lineWidth = .9; g.stroke(stem);
    g.beginPath(); for (let i = 1; i <= 3; i++){ const t = i / 4; g.moveTo(x + sw * .35 + lean * t, y - h * t); g.lineTo(x + sw * .9 + lean * t, y - h * t + 1); } g.lineWidth = .6; g.stroke(); // тінь на ніжці
    const cap = new Path2D(); cap.moveTo(tx - cw, ty + chh * .12); cap.bezierCurveTo(tx - cw * 1.02, ty - chh * 1.05, tx + cw * 1.02, ty - chh * 1.05, tx + cw, ty + chh * .12); cap.quadraticCurveTo(tx, ty - chh * .18, tx - cw, ty + chh * .12); cap.closePath();
    g.fillStyle = PAPER_L; g.fill(cap); g.lineWidth = 1; g.stroke(cap);
    g.beginPath(); for (let i = -3; i <= 3; i++){ const gx = tx + cw * i / 4.2; g.moveTo(gx, ty + chh * .05 - Math.abs(i) * .2); g.lineTo(tx + (gx - tx) * .55, ty - chh * .12); } g.lineWidth = .5; g.globalAlpha = .7; g.stroke(); g.globalAlpha = 1; // пластинки
    g.save(); g.clip(cap); g.beginPath(); for (let i = 0; i < 4; i++){ const ax = tx + cw * (.25 + i * .2), ay = ty - chh * (.75 - i * .12); g.moveTo(ax, ay); g.lineTo(ax + cw * .35, ay + chh * .4); } g.lineWidth = .6; g.globalAlpha = .75; g.stroke(); g.restore(); g.globalAlpha = 1; // тінь
    if (spots){ g.fillStyle = INK; for (let i = 0; i < 3 + (R()*3 | 0); i++){ const a = Math.PI * (1.12 + R() * .62), rr = .35 + R() * .45; g.beginPath(); g.ellipse(tx + Math.cos(a) * cw * rr * 1.05, ty + chh * .1 + Math.sin(a) * chh * rr * 1.1, s * .05 + R() * s * .03, s * .035 + R() * s * .02, 0, 0, Math.PI * 2); g.fill(); } }
  };
  const spots = R() < .55; if (R() < .45) one(x + s * (.45 + R() * .2), y + 1, s * (.38 + R() * .12), spots); one(x, y, s, spots); if (R() < .3) one(x - s * (.5 + R() * .2), y + 1.5, s * (.3 + R() * .1), !spots);
}
// корал: гіллясті трубки подвійною лінією з круглими кінчиками й цятками-поліпами; іноді — віяло з сіточкою
function drawCoral(g, x, y, s, seedv){
  const R = rng(seedv); g.lineCap = 'round'; g.lineJoin = 'round'; const h = s * (1.5 + R()*.45);
  if (R() < .3){ // віяло
    const w = h * .5, fan = new Path2D(); fan.moveTo(x, y - h * .12); for (let i = 0; i <= 10; i++){ const a = Math.PI * (1.08 + .84 * i / 10); const rr = h * (.82 + (R() - .5) * .14); fan.lineTo(x + Math.cos(a) * w * rr / h * 1.25, y - h * .12 + Math.sin(a) * rr); } fan.closePath();
    g.fillStyle = PAPER_L; g.fill(fan); g.strokeStyle = INK; g.lineWidth = 1; g.stroke(fan);
    g.save(); g.clip(fan); g.beginPath(); for (let i = 0; i < 7; i++){ const a = Math.PI * (1.12 + .76 * i / 6); g.moveTo(x, y - h * .12); g.lineTo(x + Math.cos(a) * h * 1.2, y - h * .12 + Math.sin(a) * h * 1.2); } for (let k = 1; k <= 3; k++){ g.moveTo(x - w, y - h * .12 - h * k / 4); g.lineTo(x + w, y - h * .12 - h * k / 4 - h * .05); } g.lineWidth = .5; g.globalAlpha = .7; g.stroke(); g.restore(); g.globalAlpha = 1;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x, y - h * .12); g.lineWidth = 1.6; g.strokeStyle = INK; g.stroke(); return; }
  const segs = []; const grow = (px, py, a, len, w, d) => { const ex = px + Math.cos(a) * len, ey = py + Math.sin(a) * len; const cx = px + Math.cos(a + (R() - .5) * .6) * len * .55, cy = py + Math.sin(a + (R() - .5) * .6) * len * .55; segs.push([px, py, cx, cy, ex, ey, w, d]);
    if (d < 3 && len > s * .18){ const k = d === 0 ? 2 + (R() < .5 ? 1 : 0) : 2; for (let i = 0; i < k; i++){ const na = a + (i - (k - 1) / 2) * (.62 + R() * .3) + (R() - .5) * .2; grow(ex, ey, Math.max(-Math.PI * .97, Math.min(-Math.PI * .03, na)), len * (.62 + R() * .16), w * .76, d + 1); } } };
  grow(x, y, -Math.PI / 2 + (R() - .5) * .2, h * .42, Math.max(2.2, s * .2), 0);
  // контур: широка чорнильна лінія, поверх — світла, вужча; так трубки зливаються в один кущ
  for (const [col, add] of [[INK, 1.9], [PAPER_L, 0]]){ g.strokeStyle = col; for (const sg of segs){ g.beginPath(); g.moveTo(sg[0], sg[1]); g.quadraticCurveTo(sg[2], sg[3], sg[4], sg[5]); g.lineWidth = sg[6] + add; g.stroke(); } }
  g.beginPath(); for (const [px, py, cx, cy, ex, ey, w] of segs){ const nx = ex - px, ny = ey - py, L = Math.hypot(nx, ny) || 1; const ox = -ny / L * w * .28, oy = nx / L * w * .28; g.moveTo(px - Math.abs(ox), py + oy * .2); g.lineTo(ex - Math.abs(ox), ey + oy * .2); } g.strokeStyle = INK; g.lineWidth = .5; g.globalAlpha = .55; g.stroke(); g.globalAlpha = 1; // штрих тіні вздовж трубок
  g.fillStyle = INK; for (const sg of segs){ if (R() < .5) continue; const t = .3 + R() * .5; g.beginPath(); g.arc(sg[0] + (sg[4] - sg[0]) * t, sg[1] + (sg[5] - sg[1]) * t, Math.max(.45, sg[6] * .14), 0, Math.PI * 2); g.fill(); }
}
function drawHill(g, x, y, s, seedv){
  const R = rng(seedv); const w = s * (1.9 + R()*.5), h = s * (.5 + R()*.2); const px = x + (R() - .5) * w * .16;
  const hump = new Path2D(); hump.moveTo(x - w / 2, y); hump.bezierCurveTo(x - w * .3, y - h * .12, px - w * .24, y - h, px, y - h); hump.bezierCurveTo(px + w * .24, y - h, x + w * .3, y - h * .12, x + w / 2, y);
  const fillP = new Path2D(hump); fillP.closePath(); g.fillStyle = PAPER_L; g.fill(fillP);
  g.strokeStyle = INK; g.lineCap = 'round'; g.lineJoin = 'round';
  g.beginPath(); const k = 3 + (s / 14 | 0);
  for (let i = 0; i < k; i++){ const t = .2 + .7 * (i + .5) / k; const ax = px + (x + w / 2 - px) * t * .82, ay = y - h * (1 - t * t) * .92 + 1.5; g.moveTo(ax, ay); g.lineTo(ax - h * .12, ay + h * (.3 + R()*.15)); }
  g.lineWidth = .7; g.globalAlpha = .8; g.stroke(); g.globalAlpha = 1;
  g.lineWidth = Math.min(1.6, Math.max(1, s * .04)); g.stroke(hump);
}
function drawDune(g, x, y, s, seedv){
  const R = rng(seedv); const f = R() < .5 ? 1 : -1; const X = (d) => x + d * f;
  g.strokeStyle = INK; g.lineCap = 'round';
  const ridge = new Path2D(); ridge.moveTo(X(-s), y + s * .1); ridge.quadraticCurveTo(X(-s * .2), y - s * .45, X(s * .25), y - s * .3); ridge.quadraticCurveTo(X(s * .62), y - s * .15, X(s * 1.05), y + s * .12);
  g.beginPath(); const k = 4 + (R()*3 | 0);
  for (let i = 0; i < k; i++){ const t = (i + .5) / k; const ax = X(-s * .15 + s * .95 * t), ay = y - s * .3 * (1 - Math.abs(t - .25) * 1.1) + s * .02; g.moveTo(ax, ay + 1); g.lineTo(ax + f * s * .05, ay + s * (.16 + R()*.1)); }
  g.lineWidth = .6; g.globalAlpha = .6; g.stroke(); g.globalAlpha = .9; g.lineWidth = .9; g.stroke(ridge); g.globalAlpha = 1;
}
function drawGrass(g, x, y, s, seedv){
  const R = rng(seedv); g.strokeStyle = INK; g.lineCap = 'round'; g.beginPath(); const k = 3 + (R()*2 | 0);
  for (let i = 0; i < k; i++){ const t = k === 1 ? 0 : i / (k - 1) - .5; const bx = x + t * s * .5, tx = x + t * s * 1.3 + (R() - .5) * s * .2, ty = y - s * (.65 + R()*.4) * (1 - Math.abs(t) * .5); g.moveTo(bx, y); g.quadraticCurveTo(bx + (tx - bx) * .2, y - s * .4, tx, ty); }
  g.lineWidth = .75; g.globalAlpha = .85; g.stroke(); g.globalAlpha = 1;
}
// Поля: густі низькі пучки трави з вогкими рисками біля землі (помірний клімат, на відміну від сухого степу).
function drawMeadow(g, x, y, s, seedv){
  const R = rng(seedv); const wind = (R() < .5 ? -1 : 1) * s * (.25 + R()*.2); const k = 4 + (R()*3 | 0);
  g.strokeStyle = INK; g.lineCap = 'round'; g.beginPath();
  for (let i = 0; i < k; i++){ const t = i / (k - 1) - .5; const bx = x + t * s * 1.7 + (R() - .5) * s * .2; const hh = s * (1 - Math.abs(t) * .7) * (.75 + R()*.35);
    const lean = wind * (hh / s) + (R() - .5) * s * .12; g.moveTo(bx, y); g.quadraticCurveTo(bx + lean * .15, y - hh * .55, bx + lean, y - hh); }
  g.lineWidth = .65; g.globalAlpha = .85; g.stroke();
  // вогкість: дві короткі риски під пучком
  g.beginPath(); g.moveTo(x - s * 1.1, y + 1.6); g.lineTo(x - s * .35, y + 1.6); g.moveTo(x + s * .05, y + 2.8); g.lineTo(x + s * .9, y + 2.8);
  g.lineWidth = .55; g.globalAlpha = .45; g.stroke(); g.globalAlpha = 1;
}
function drawStone(g, x, y, s){ g.beginPath(); g.ellipse(x, y - s * .5, s, s * .62, 0, 0, Math.PI * 2); g.fillStyle = PAPER_L; g.fill(); g.strokeStyle = INK; g.lineWidth = .7; g.stroke(); }

// ================= розміщення позначок ландшафту =================
// ctx: {landAt, free, mark, glyphs, seed, near, addM}. Межа рамки — як у старих снігових позначок.
const inFrame = (x, y) => x > 30 && y > 30 && x < W - 30 && y < H - 30;
function terrainZones(geo, t){ return geo.ter.filter(z => terrainOf(z) === t); }
function zoneSamples(z, perArea, cap, R){ const pts = shapePts(z); const bb = bbox(pts); const n = Math.min(cap, Math.round(polyArea(pts) / perArea * (z.density ?? 1)));
  return {bb, n, rnd: () => [bb[0] + R()*(bb[2] - bb[0]), bb[1] + R()*(bb[3] - bb[1])]}; }
// Пагорби: як гори, від середини зони до країв, без перекриття з горами.
function placeHills(geo, c){
  for (const z of terrainZones(geo, 'hills')){ const R = rng(c.seed * 31 + strHash(z.id)); const {n, rnd} = zoneSamples(z, 110, 30000, R); const cand = [];
    for (let i = 0; i < n; i++){ const [x, y] = rnd(); if (!inside(z, x, y)) continue; cand.push([x, y, depthIn(z, x, y) + R()*30]); }
    cand.sort((a, b) => b[2] - a[2]); const base = z.size ?? 26;
    for (const [x, y] of cand){ const s = base * (.7 + Math.min(1, depthIn(z, x, y) / 120) * .35 + R()*.25);
      if (!c.landAt(x, y, Math.min(s * .4, 14)) || !c.free(x, y, 4)) continue;
      let ok = true; for (const [a, b, sb] of c.near(x, y)){ if (Math.hypot(x - a, (y - b) * 2.3) < (s + sb) * 1.08){ ok = false; break; } }
      if (!ok) continue; c.addM([x, y, s]); c.glyphs.push({y, t: 'hl', x, s, r: (R()*1e9) | 0}); c.mark(x, y, s * .7); } }
}
// Болото: очерет і мокрі риски (як і раніше).
function placeMarsh(geo, c){
  for (const z of terrainZones(geo, 'marsh')){ const R = rng(c.seed * 23 + strHash(z.id)); const {n, rnd} = zoneSamples(z, 140, 20000, R);
    for (let i = 0; i < n; i++){ const [x, y] = rnd(); if (!inside(z, x, y)) continue; if (!c.landAt(x, y, 5) || !c.free(x, y, 6)) continue;
      const t = R() < .38 ? 'w' : 'b'; c.glyphs.push({y, t, x, s: 5.5 + R()*3.5, r: (R()*1e9) | 0}); c.mark(x, y, t === 'w' ? 7 : 6); } }
}
// Дрібні позначки поверхні — після лісів і поселень, заповнюють вільні місця.
function placeGround(geo, c){
  const snow = [], stip = [], dash = [];
  for (const z of geo.ter){ const t = terrainOf(z); const R = rng(c.seed * 19 + 9 + strHash(z.id));
    if (t === 'snow'){ const {n, rnd} = zoneSamples(z, 160, 80000, R);
      for (let i = 0; i < n; i++){ const [x, y] = rnd(); if (!inFrame(x, y) || !inside(z, x, y) || !c.landAt(x, y, 6) || !c.free(x, y, 7)) continue; const r = R();
        if (r < .07){ snow.push([x, y, 7 + R()*6]); c.mark(x, y, 4); } else if (r < .55) stip.push([x, y]); } }
    else if (t === 'tundra'){ const {n, rnd} = zoneSamples(z, 170, 60000, R);
      for (let i = 0; i < n; i++){ const [x, y] = rnd(); if (!inFrame(x, y) || !inside(z, x, y) || !c.landAt(x, y, 6) || !c.free(x, y, 6)) continue; const r = R();
        if (r < .09){ c.glyphs.push({y, t: 'gs', x, s: 3.5 + R()*2, r: (R()*1e9) | 0}); c.mark(x, y, 5); }
        else if (r < .12){ c.glyphs.push({y, t: 'st', x, s: 1.6 + R()*1.2, r: 0}); c.mark(x, y, 3); }
        else if (r < .5) stip.push([x, y]); } }
    else if (t === 'steppe'){ const {n, rnd} = zoneSamples(z, 210, 60000, R);
      for (let i = 0; i < n; i++){ const [x, y] = rnd(); if (!inFrame(x, y) || !inside(z, x, y) || !c.landAt(x, y, 6)) continue; const r = R();
        if (r < .16){ if (!c.free(x, y, 9)) continue; c.glyphs.push({y, t: 'gr', x, s: 4.5 + R()*2.5, r: (R()*1e9) | 0}); c.mark(x, y, 8); }
        else if (r < .26){ if (!c.free(x, y, 6)) continue; dash.push([x, y, 4 + R()*5]); c.mark(x, y, 3); }
        else if (r < .34 && c.free(x, y, 4)) stip.push([x, y]); } }
    else if (t === 'meadow'){ const {n, rnd} = zoneSamples(z, 150, 70000, R);
      for (let i = 0; i < n; i++){ const [x, y] = rnd(); if (!inFrame(x, y) || !inside(z, x, y) || !c.landAt(x, y, 6)) continue; const r = R();
        if (r < .24){ if (!c.free(x, y, 10)) continue; c.glyphs.push({y, t: 'mw', x, s: 4.5 + R()*2.5, r: (R()*1e9) | 0}); c.mark(x, y, 8); }
        else if (r < .32){ if (!c.free(x, y, 5)) continue; dash.push([x, y, 3 + R()*4]); c.mark(x, y, 3); }
        else if (r < .38 && c.free(x, y, 3)) stip.push([x, y]); } }
    else if (t === 'desert'){ { const {n, rnd} = zoneSamples(z, 2400, 4000, R);
        for (let i = 0; i < n; i++){ const [x, y] = rnd(); const s = 12 + R()*14; if (!inFrame(x, y) || !inside(z, x, y) || !c.landAt(x, y, 10) || !c.free(x, y, s * .9)) continue;
          c.glyphs.push({y, t: 'du', x, s, r: (R()*1e9) | 0}); c.mark(x, y, s * .9); } }
      const {n, rnd} = zoneSamples(z, 70, 90000, R);
      for (let i = 0; i < n; i++){ const [x, y] = rnd(); if (!inFrame(x, y) || !inside(z, x, y) || !c.landAt(x, y, 5) || !c.free(x, y, 3)) continue; if (R() < .6) stip.push([x, y]); } }
  }
  return {snow, stip, dash};
}
// Малювання позначок цього модуля (виклик із renderMap для кожного гліфа).
function drawNatureGlyph(g, o){
  if (o.t === 't') drawTreeKind(g, o.x, o.y, o.s, o.r, o.k);
  else if (o.t === 'hl') drawHill(g, o.x, o.y, o.s, o.r);
  else if (o.t === 'du') drawDune(g, o.x, o.y, o.s, o.r);
  else if (o.t === 'gr') drawGrass(g, o.x, o.y, o.s, o.r);
  else if (o.t === 'gs') drawGrass(g, o.x, o.y, o.s, o.r);
  else if (o.t === 'mw') drawMeadow(g, o.x, o.y, o.s, o.r);
  else if (o.t === 'st') drawStone(g, o.x, o.y, o.s);
  else return false;
  return true;
}
