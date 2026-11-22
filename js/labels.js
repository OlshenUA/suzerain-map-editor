"use strict";
// Підписи на мапі: для штампів, усіх зон і кривих. Малюються «живими» поверх мапи (як штампи й написи)
// і потрапляють в експорт PNG. Підключається після render.js.
//
// Поля об'єкта: label (текст), labelPos, labelSize, labelFont, labelItalic, labelSpread, labelAt.
//   штамп і зона: labelPos = below | above | left | right; зона ще inside (текст розходиться всередині зони й повертається за її формою)
//   крива (річка, дорога…): labelPos = above | below (з якого боку лінії), labelAt 0–1 (де вздовж кривої), labelSpread — розрядка в px

const LABEL_POS_ZONE = [['inside', 'Всередині зони'], ['below', 'Знизу'], ['above', 'Згори'], ['left', 'Ліворуч'], ['right', 'Праворуч']];
const LABEL_POS_STAMP = [['below', 'Знизу'], ['above', 'Згори'], ['left', 'Ліворуч'], ['right', 'Праворуч']];
const LABEL_POS_LINE = [['above', 'Над лінією'], ['below', 'Під лінією']];
const isSettlement = s => s.kind === 'vill' || s.kind === 'town' || s.kind === 'fort';
// Типове положення: поселення й штампи — знизу, решта зон — усередині, криві — над лінією.
function labelPosOf(o, isStamp){ if (o.labelPos) return o.labelPos; if (isStamp) return 'below'; if (o.shape === 'line') return 'above'; return isSettlement(o) ? 'below' : 'inside'; }
function labelFontOf(o, size){ return `${o.labelItalic ? 'italic ' : ''}${Math.max(4, size)}px "${o.labelFont || 'Kurale'}", serif`; }
const LABEL_HALO = 'rgba(239,226,189,.92)';

// Текст збоку від рамки bb = [x0, y0, x1, y1].
function drawLabelBeside(g, o, bb, pos, size, gap){
  g.save(); g.font = labelFontOf(o, size); g.lineJoin = 'round'; let x, y;
  if (pos === 'above'){ x = (bb[0] + bb[2]) / 2; y = bb[1] - gap; g.textAlign = 'center'; g.textBaseline = 'bottom'; }
  else if (pos === 'left'){ x = bb[0] - gap; y = (bb[1] + bb[3]) / 2; g.textAlign = 'right'; g.textBaseline = 'middle'; }
  else if (pos === 'right'){ x = bb[2] + gap; y = (bb[1] + bb[3]) / 2; g.textAlign = 'left'; g.textBaseline = 'middle'; }
  else { x = (bb[0] + bb[2]) / 2; y = bb[3] + gap; g.textAlign = 'center'; g.textBaseline = 'top'; }
  g.strokeStyle = LABEL_HALO; g.lineWidth = size * .28; g.strokeText(o.label, x, y); g.fillStyle = INK; g.fillText(o.label, x, y); g.restore(); }

// ---------- підпис усередині зони ----------
// Шукаємо найглибшу точку зони й найдовшу хорду через неї (біля головної осі фігури) — уздовж неї й іде текст.
function zoneLabelLayout(s){
  const pts = shapePts(s); if (!pts || pts.length < 3) return null; const bb = bbox(pts);
  // найглибша точка: сітка 14×14 у межах зони
  let best = null, bd = -1; const N = 14;
  for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++){ const x = bb[0] + (bb[2] - bb[0]) * (i + .5) / (N + 1), y = bb[1] + (bb[3] - bb[1]) * (j + .5) / (N + 1);
    if (!inside(s, x, y)) continue; const d = depthIn(s, x, y); if (d > bd){ bd = d; best = [x, y]; } }
  if (!best) return null;
  // головна вісь за другими моментами многокутника
  let A = 0, cx = 0, cy = 0, xx = 0, yy = 0, xy = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++){ const [x0, y0] = pts[j], [x1, y1] = pts[i]; const c = x0 * y1 - x1 * y0; A += c; cx += (x0 + x1) * c; cy += (y0 + y1) * c;
    xx += (x0 * x0 + x0 * x1 + x1 * x1) * c; yy += (y0 * y0 + y0 * y1 + y1 * y1) * c; xy += (x0 * y1 + 2 * x0 * y0 + 2 * x1 * y1 + x1 * y0) * c; }
  let theta = 0;
  if (Math.abs(A) > 1e-6){ A /= 2; cx /= 6 * A; cy /= 6 * A; const Ixx = xx / (12 * A) - cx * cx, Iyy = yy / (12 * A) - cy * cy, Ixy = xy / (24 * A) - cx * cy; theta = .5 * Math.atan2(2 * Ixy, Ixx - Iyy); }
  // хорда через точку p під кутом a: найближчі перетини з контуром в обидва боки
  const chord = (p, a) => { const dx = Math.cos(a), dy = Math.sin(a); let tmin = -Infinity, tmax = Infinity;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++){ const [ax, ay] = pts[j], [bx, by] = pts[i]; const ex = bx - ax, ey = by - ay; const den = dx * ey - dy * ex; if (Math.abs(den) < 1e-9) continue;
      const t = ((ax - p[0]) * ey - (ay - p[1]) * ex) / den, u = ((ax - p[0]) * dy - (ay - p[1]) * dx) / den; if (u < 0 || u > 1) continue;
      if (t > 0 && t < tmax) tmax = t; if (t < 0 && t > tmin) tmin = t; }
    return isFinite(tmin) && isFinite(tmax) ? {a, tmin, tmax, len: tmax - tmin} : null; };
  let bestC = null;
  // кандидати: біля головної осі й горизонталь; трохи віддаємо перевагу пологішим кутам — так легше читати
  const score = (c, da) => c.len * (1 - Math.abs(da) * .2) * (1 - .35 * Math.sin(c.a) ** 2);
  for (const ang of [0, .2, -.2, .4, -.4, .7, -.7].map(d => theta + d).concat([0])){ const c = chord(best, ang); if (!c) continue; const sc = score(c, ang - theta); if (!bestC || sc > bestC.score){ bestC = c; bestC.score = sc; } }
  if (!bestC) return null;
  // читабельність: текст не догори дриґом і не надто стрімко
  let a = bestC.a; while (a > Math.PI / 2) a -= Math.PI; while (a < -Math.PI / 2) a += Math.PI;
  const mid = (bestC.tmin + bestC.tmax) / 2; const cxp = best[0] + Math.cos(bestC.a) * mid, cyp = best[1] + Math.sin(bestC.a) * mid;
  return {x: cxp, y: cyp, a, len: bestC.len, depth: bd};
}
function drawLabelInside(g, s){
  const L = zoneLabelLayout(s); if (!L) return; const text = String(s.label); const n = [...text].length; if (!n) return;
  const spread = s.labelSpread ?? 1; let size = s.labelSize || 34;
  size = Math.min(size, L.depth * 1.6 + 6); // не ширше за саму зону
  g.save(); g.font = labelFontOf(s, size); let w = g.measureText(text).width;
  const target = Math.min(L.len * .92, L.len * (.35 + .3 * spread));
  if (w > L.len * .92){ size *= L.len * .92 / w; g.font = labelFontOf(s, size); w = g.measureText(text).width; } // не вміщається — зменшуємо
  const extra = n > 1 ? Math.max(0, Math.min(size * 1.6, (target - w) / (n - 1))) : 0;
  const chars = [...text]; const widths = chars.map(c => g.measureText(c).width); const total = widths.reduce((a, b) => a + b, 0) + extra * (n - 1);
  g.translate(L.x, L.y); g.rotate(L.a); g.textAlign = 'left'; g.textBaseline = 'middle'; g.lineJoin = 'round';
  for (const pass of [0, 1]){ let x = -total / 2;
    for (let i = 0; i < n; i++){ if (pass === 0){ g.strokeStyle = LABEL_HALO; g.lineWidth = size * .26; g.strokeText(chars[i], x, 0); } else { g.fillStyle = INK; g.fillText(chars[i], x, 0); } x += widths[i] + extra; } }
  g.restore();
}

// ---------- підпис уздовж кривої ----------
function drawLabelAlong(g, s){
  let pts = chaikin(s.pts, 3, false); if (pts.length < 2) return;
  const chars = [...String(s.label)]; if (!chars.length) return;
  const size = s.labelSize || 20; g.save(); g.font = labelFontOf(s, size);
  const widths = chars.map(c => g.measureText(c).width); const sp = s.labelSpread ?? 2; const total = widths.reduce((a, b) => a + b, 0) + sp * (chars.length - 1);
  const build = p => { const seg = []; let len = 0; for (let i = 1; i < p.length; i++){ const d = Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]); seg.push(d); len += d; } return {p, seg, len}; };
  const pointAt = (G, d) => { d = Math.max(0, Math.min(G.len, d)); for (let i = 0; i < G.seg.length; i++){ if (d <= G.seg[i] || i === G.seg.length - 1){ const t = G.seg[i] ? Math.min(1, d / G.seg[i]) : 0; const a = G.p[i], b = G.p[i + 1]; return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, Math.atan2(b[1] - a[1], b[0] - a[0])]; } d -= G.seg[i]; } };
  let G = build(pts), at = Math.min(1, Math.max(0, s.labelAt ?? .5));
  // якщо в місці підпису крива йде справа наліво — перевертаємо, щоб текст не був догори дриґом
  if (pointAt(G, G.len * at + total / 2)[0] < pointAt(G, G.len * at - total / 2)[0]){ G = build(pts.slice().reverse()); at = 1 - at; }
  const start = Math.max(0, Math.min(G.len - total, G.len * at - total / 2));
  // відступ від лінії з урахуванням її товщини: над чи під
  const lineW = s.kind === 'river' ? (s.width || 3) : 5 * (s.width || 1); const off = (s.labelPos === 'below' ? 1 : -1) * (lineW / 2 + size * .62);
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
  for (const pass of [0, 1]){ let d = start;
    for (let i = 0; i < chars.length; i++){ const [x, y, a] = pointAt(G, d + widths[i] / 2); g.save(); g.translate(x - Math.sin(a) * off, y + Math.cos(a) * off); g.rotate(a);
      if (pass === 0){ g.strokeStyle = LABEL_HALO; g.lineWidth = size * .26; g.strokeText(chars[i], 0, 0); } else { g.fillStyle = INK; g.fillText(chars[i], 0, 0); }
      g.restore(); d += widths[i] + sp; } }
  g.restore();
}

// Усі підписи фігур (викликається з drawDecor).
function drawShapeLabels(g){
  for (const s of data.shapes){ if (!s.label || s.kind === 'region') continue;
    try {
      if (s.shape === 'line') drawLabelAlong(g, s);
      else { const pos = labelPosOf(s); if (pos === 'inside') drawLabelInside(g, s); else drawLabelBeside(g, s, bbox(shapePts(s)), pos, s.labelSize || 26, 6); }
    } catch (e){ console.error(e); } } }
