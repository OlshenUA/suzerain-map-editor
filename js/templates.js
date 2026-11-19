"use strict";
// Шаблони для «Нова мапа». Кожен шаблон — це або `make(W, H)`, що будує мапу під будь-який розмір,
// або готова мапа `data` (тоді при іншому розмірі вона розширюється/обрізається від центру).
// Щоб додати свій вбудований шаблон: збережіть мапу у файл (.json), вставте її як `data: {...}`
// новим записом нижче. Або просто в редакторі: «Мапи» → «Як шаблон» (зберігається в цьому браузері).

// Органічна пляма суші: еліпс із накладеними синусами (детерміновано від seed).
function tplBlob(cx, cy, rx, ry, n, seed){
  let s = seed >>> 0; const rnd = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
  const waves = [[2, .10], [3, .08], [5, .06], [9, .035], [15, .02]].map(([f, a]) => [f, a * (.6 + rnd()*.8), rnd()*Math.PI*2]);
  const pts = [];
  for (let i = 0; i < n; i++){ const t = i / n * Math.PI * 2; let k = 1; for (const [f, a, p] of waves) k += Math.sin(t*f + p) * a;
    pts.push([Math.round(cx + Math.cos(t)*rx*k), Math.round(cy + Math.sin(t)*ry*k)]); }
  return pts;
}
// Хвиляста лінія узбережжя зверху вниз біля x0, суша праворуч (виходить за межі мапи — так берег не впирається в рамку).
function tplCoast(W, H, x0, seed){
  let s = seed >>> 0; const rnd = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
  const waves = [[1.3, .07], [2.7, .045], [5.1, .03], [9.7, .015]].map(([f, a]) => [f, a * (.6 + rnd()*.8), rnd()*Math.PI*2]);
  const pts = [[W + 60, -60], [Math.round(x0), -60]]; const n = 36;
  for (let i = 0; i <= n; i++){ const y = -60 + (H + 120) * i / n; let dx = 0; for (const [f, a, p] of waves) dx += Math.sin(i / n * Math.PI * 2 * f + p) * a * W;
    pts.push([Math.round(x0 + dx), Math.round(y)]); }
  pts.push([W + 60, H + 60]);
  return tplPin(pts, [[W + 60, -60], [W + 60, H + 60]]);
}
// Суша згладжується (chaikin), тож гострі кути полігона за межами мапи округлюються й «з'їдають» край.
// Біля кожного такого кута ставимо дві точки на відстані d уздовж сусідніх ребер — кут лишається гострим.
function tplPin(pts, corners, d = 100){
  const key = p => p[0] + ',' + p[1]; const want = new Set(corners.map(key)); const out = []; const n = pts.length;
  for (let i = 0; i < n; i++){ const p = pts[i];
    if (!want.has(key(p))){ out.push(p); continue; }
    const toward = q => { const dx = q[0] - p[0], dy = q[1] - p[1], L = Math.hypot(dx, dy); return L > d * 2.5 ? [Math.round(p[0] + dx / L * d), Math.round(p[1] + dy / L * d)] : null; };
    const a = toward(pts[(i - 1 + n) % n]), b = toward(pts[(i + 1) % n]);
    if (a) out.push(a); out.push(p); if (b) out.push(b); }
  return out;
}
function tplBase(W, H, shapes){ return {v: 2, W, H, seed: 7, settings: {scatter: 1}, shapes: shapes || [], stamps: [{type: 'compass', x: Math.round(W - 220), y: 220, size: 190}], texts: []}; }

window.MAP_TEMPLATES = [
  {id: 'sea', name: 'Чистий аркуш', desc: 'Тільки вода й пергамент. Сушу малюєте самі.',
    make: (W, H) => tplBase(W, H, [])},
  {id: 'island', name: 'Острів', desc: 'Один великий острів посеред моря.',
    make: (W, H) => tplBase(W, H, [{kind: 'land', shape: 'poly', pts: tplBlob(W/2, H/2, W*.34, H*.33, 64, 11)}])},
  {id: 'coast', name: 'Узбережжя', desc: 'Море на заході, суша на сході.',
    make: (W, H) => tplBase(W, H, [{kind: 'land', shape: 'poly', pts: tplCoast(W, H, W*.36, 5)}])},
  {id: 'inland', name: 'Внутрішня провінція', desc: 'Уся мапа — суша, без моря.',
    make: (W, H) => tplBase(W, H, [{kind: 'land', shape: 'poly', pts: tplPin([[-80, -80], [W + 80, -80], [W + 80, H + 80], [-80, H + 80]], [[-80, -80], [W + 80, -80], [W + 80, H + 80], [-80, H + 80]])}])},
  {id: 'kraitren', name: 'Північ Крайтрену', desc: 'Стартова мапа кампанії.',
    data: window.DEFAULT_MAP},
];
