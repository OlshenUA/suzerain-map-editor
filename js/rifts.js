"use strict";
// Розломи (kind:'rift'): тріщини в землі, провали й кратери.
// shape 'line' — тріщина вздовж кривої; 'poly' | 'ellipse' — зона: sunk !== false — занижена всередині (кратер, провал),
// sunk === false — лише тріщина по контуру. Параметри: width — ширина тріщини, depth — глибина провалу, branches — відгалуження.
// Світло з північного заходу: тіньові стінки — ті, що дивляться на південний схід.
const RIFT_LIGHT = [.7071, .7071]; // напрямок, куди падає світло

function riftGeo(s, seed){
  const closed = s.shape !== 'line', p = shapePts(s); if (!p || p.length < (closed ? 3 : 2)) return null;
  const w = Math.max(1, s.width ?? 5), sunk = closed && s.sunk !== false;
  const sm = s.shape === 'ellipse' ? p : chaikin(p, 2, closed);
  let pts = roughen(sm, closed, sunk ? 5 : 2 + w * .45, seed + strHash(s.id || '') % 991, 4);
  if (!sunk) pts = zigzag(pts, closed, 3 + w * .7, rng(seed * 3 + strHash(s.id || '')));
  return {s, closed, sunk, w, pts, bb: bbox(pts)};
}

// різкий злам: кожна 3-4-та точка відскакує вбік, між ними — прямі відрізки
function zigzag(pts, closed, amp, R){ const n = pts.length, out = []; let next = 0;
  for (let i = 0; i < n; i++){ if (i < next && !(i === n - 1 && !closed)){ continue; } next = i + 2 + (R() * 3 | 0);
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)]; const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
    const edge = !closed && (i === 0 || i === n - 1); const o = edge ? 0 : (R() - .5) * 2 * amp; out.push([pts[i][0] - dy / l * o, pts[i][1] + dx / l * o]); }
  // густішимо назад, щоб ширина й рисочки лягали рівно
  const res = []; const m = out.length; for (let i = 0; i < (closed ? m : m - 1); i++){ const a = out[i], b = out[(i + 1) % m]; const k = Math.max(1, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / 4)); for (let j = 0; j < k; j++) res.push([a[0] + (b[0] - a[0]) * j / k, a[1] + (b[1] - a[1]) * j / k]); }
  if (!closed) res.push(out[m - 1]); return res; }
// тріщина: темна щілина змінної ширини з рваними краями, рисочки на краях і відгалуження
function drawCrack(g, pts, w, closed, R, branches){
  const n = pts.length; if (n < 2) return;
  const Ls = [0]; for (let i = 1; i < n; i++) Ls.push(Ls[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const T = (Ls[n - 1] + (closed ? Math.hypot(pts[0][0] - pts[n - 1][0], pts[0][1] - pts[n - 1][1]) : 0)) || 1; const nz = R() * 1000;
  const left = [], right = [], nrm = [];
  for (let i = 0; i < n; i++){
    const a = pts[closed ? (i - 1 + n) % n : Math.max(0, i - 1)], b = pts[closed ? (i + 1) % n : Math.min(n - 1, i + 1)];
    const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1, nx = -dy / l, ny = dx / l; nrm.push([nx, ny]);
    const t = Ls[i] / T, prof = closed ? 1 : Math.pow(Math.sin(Math.PI * t), .6);
    const hw = w / 2 * prof * (.35 + 1.25 * fbm(Ls[i] / 46, nz, 7));
    left.push([pts[i][0] + nx * hw * (.75 + R() * .5), pts[i][1] + ny * hw * (.75 + R() * .5)]);
    right.push([pts[i][0] - nx * hw * (.75 + R() * .5), pts[i][1] - ny * hw * (.75 + R() * .5)]);
  }
  // рисочки-схили вздовж обох країв: довші з боку, звідки видно тіньову стінку
  g.beginPath();
  for (let i = 0; i < n; i += 1){ if (R() < .25) continue; for (const [edge, sg] of [[left, 1], [right, -1]]){ const [nx, ny] = nrm[i]; const ox = nx * sg, oy = ny * sg;
      const sh = .5 + .5 * -(ox * RIFT_LIGHT[0] + oy * RIFT_LIGHT[1]); const len = (w * .45 + 2) * (.45 + .9 * sh) * (.6 + R() * .6);
      if (R() > .3 + .7 * sh) continue; const p = edge[i]; g.moveTo(p[0], p[1]); g.lineTo(p[0] + ox * len, p[1] + oy * len); } }
  g.strokeStyle = INK; g.lineWidth = .7; g.globalAlpha = .55; g.stroke(); g.globalAlpha = 1;
  // відгалуження: короткі рвані тріщини, що звужуються
  const nb = Math.round(T / 85 * (branches ?? 1));
  const twig = (x, y, ang, len, wd, depth) => { let px = x, py = y; const k = 4 + (R() * 3 | 0);
    for (let j = 0; j < k; j++){ const f = 1 - j / k; ang += (R() - .5) * .9; const sl = len / k; const qx = px + Math.cos(ang) * sl, qy = py + Math.sin(ang) * sl;
      g.beginPath(); g.moveTo(px, py); g.lineTo(qx, qy); g.lineWidth = Math.max(.5, wd * f); g.stroke(); px = qx; py = qy;
      if (depth < 1 && j === 1 && R() < .45) twig(px, py, ang + (R() < .5 ? .8 : -.8), len * .5, wd * f * .7, depth + 1); } };
  g.strokeStyle = INK; g.lineCap = 'round';
  for (let b = 0; b < nb; b++){ const i = closed ? (R() * n | 0) : (n * (.12 + R() * .76) | 0); const sg = R() < .5 ? 1 : -1; const [nx, ny] = nrm[i];
    const ta = Math.atan2(ny, nx) * 1 + (sg < 0 ? Math.PI : 0); const ang = ta + (R() - .5) * 1.1; const p = (sg > 0 ? left : right)[i];
    twig(p[0], p[1], ang, w * (1.8 + R() * 3) + 12, Math.max(.7, w * .32), 0); }
  // сама щілина
  const p = new Path2D(); p.moveTo(left[0][0], left[0][1]); for (let i = 1; i < n; i++) p.lineTo(left[i][0], left[i][1]);
  if (closed){ p.closePath(); p.moveTo(right[0][0], right[0][1]); for (let i = 1; i < n; i++) p.lineTo(right[i][0], right[i][1]); p.closePath(); }
  else { for (let i = n - 1; i >= 0; i--) p.lineTo(right[i][0], right[i][1]); p.closePath(); }
  g.fillStyle = INK; g.globalAlpha = .92; g.fill(p, 'evenodd'); g.globalAlpha = 1; g.lineWidth = .6; g.lineJoin = 'round'; g.stroke(p);
}

// провал / кратер: тьмяне дно з цятками, штрихи-схили від краю всередину (густіші на тіньовому боці), вал і викиди назовні
function drawCrater(g, r, R){
  const pts = r.pts, n = pts.length, s = r.s; const p = pathOf(pts, true); const [x0, y0, x1, y1] = r.bb;
  const D = Math.max(6, Math.min(80, Math.min(x1 - x0, y1 - y0) * .16)) * (s.depth ?? 1);
  let a = 0; for (let i = 0, j = n - 1; i < n; j = i++) a += pts[j][0] * pts[i][1] - pts[i][0] * pts[j][1]; const sgn = a > 0 ? 1 : -1;
  const inward = i => { const q = pts[(i + 1) % n], o = pts[(i - 1 + n) % n]; const dx = q[0] - o[0], dy = q[1] - o[1], l = Math.hypot(dx, dy) || 1; return [-dy / l * sgn, dx / l * sgn]; };
  g.save(); g.clip(p);
  g.fillStyle = 'rgba(110,72,30,' + Math.min(.28, .1 + .06 * (s.depth ?? 1)).toFixed(3) + ')'; g.fillRect(x0, y0, x1 - x0, y1 - y0);
  g.fillStyle = INK; g.globalAlpha = .3; const area = (x1 - x0) * (y1 - y0); for (let k = 0; k < Math.min(6000, area / 240); k++) g.fillRect(x0 + R() * (x1 - x0) - .6, y0 + R() * (y1 - y0) - .6, 1.2, 1.2); g.globalAlpha = 1;
  g.strokeStyle = INK; g.lineCap = 'round';
  for (let i = 0; i < n; i++){ const [nx, ny] = inward(i); const sh = .5 + .5 * (nx * RIFT_LIGHT[0] + ny * RIFT_LIGHT[1]); if (R() > .3 + .7 * sh) continue;
    for (const off of sh > .62 ? [0, .5] : [0]){ const q = pts[i], q2 = pts[(i + 1) % n]; const x = q[0] + (q2[0] - q[0]) * off, y = q[1] + (q2[1] - q[1]) * off;
      const len = D * (.5 + .5 * R()) * (.5 + .7 * sh); g.beginPath(); g.moveTo(x, y); g.lineTo(x + nx * len, y + ny * len); g.lineWidth = .7 + .5 * sh; g.globalAlpha = .3 + .6 * sh; g.stroke(); } }
  g.globalAlpha = 1; g.restore();
  // вал по краю і викиди назовні
  g.lineJoin = 'round'; g.strokeStyle = INK; g.lineWidth = 1.5; g.stroke(p);
  g.beginPath(); for (let i = 0; i < n; i += 2){ if (R() < .55) continue; const [nx, ny] = inward(i); const l = 2.5 + R() * (3 + D * .22); const q = pts[i]; g.moveTo(q[0] - nx * 2, q[1] - ny * 2); g.lineTo(q[0] - nx * (2 + l), q[1] - ny * (2 + l)); }
  g.lineWidth = .7; g.globalAlpha = .45; g.stroke(); g.globalAlpha = 1;
}

function drawRifts(g, rifts){ if (!rifts || !rifts.length) return; const seed = data.seed | 0; g.save();
  for (const r of rifts){ const R = rng(seed * 29 + strHash(r.s.id || '')); if (r.sunk) drawCrater(g, r, R); else drawCrack(g, r.pts, r.w, r.closed, R, r.s.branches); }
  g.restore(); }

// сітка зайнятості: у провалі й уздовж тріщин не ростуть дерева, гори й снігові позначки
function markRifts(rifts, occ){ for (const r of rifts || []){ if (r.s.clear === false) continue;
  if (r.sunk){ const [x0, y0, x1, y1] = r.bb; for (let y = Math.max(0, y0); y <= Math.min(H - 1, y1 + 10); y += FS) for (let x = Math.max(0, x0); x <= Math.min(W - 1, x1); x += FS) if (pip(x, y, r.pts) || pip(x, y - 10, r.pts)) occ[((y / FS) | 0) * FW + ((x / FS) | 0)] = 1; }
  else { const rr = r.w / 2 + 6, k = Math.ceil(rr / FS); for (let i = 0; i < r.pts.length; i += 2){ const fx = (r.pts[i][0] / FS) | 0, fy = (r.pts[i][1] / FS) | 0;
      for (let yy = fy - k; yy <= fy + k + 2; yy++) for (let xx = fx - k; xx <= fx + k; xx++) if (xx >= 0 && yy >= 0 && xx < FW && yy < FH) occ[yy * FW + xx] = 1; } } } }
