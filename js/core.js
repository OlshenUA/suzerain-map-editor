"use strict";
// Data model, noise, geometry and paper texture.
// ================= data =================
const DEFAULT_JSON = JSON.stringify(window.DEFAULT_MAP);
let data = JSON.parse(DEFAULT_JSON);
let W = data.W, H = data.H; // змінюються разом із data (applyMapSize у render.js)
const INK = '#2a1b0e', PAPER = '#e2cb94', PAPER_L = '#efe2bd', SEA_FILL = '#dcc48d';
const KIND_NAME = {land:'Суша', lake:'Озеро', mountain:'Гори', forest:'Ліс', marsh:'Болото', river:'Річка', region:'Область генерації', vill:'Село', town:'Місто', fort:'Фортеця', road:'Дорога', rail:'Залізниця', path:'Шлях', stain:'Пляма'};
const KIND_COLOR = {land:'#5fb3c4', lake:'#7aa7ff', mountain:'#e0795a', forest:'#79c26a', marsh:'#c49be8', river:'#5aa0ff', region:'#f2ead8', vill:'#f0c060', town:'#ff9f5a', fort:'#ff6b6b', road:'#e6d27a', rail:'#b0b0b0', path:'#e0a0d0', stain:'#d07ad0'};
const LS_KEY = 'kraitren-map-editor-autosave-v1';
const DB_DOC = 'maps/north';

let uid = 1;
function ensureIds(){ for (const s of data.shapes){ if(!s.id) s.id = 's' + (uid++); else { const n = +String(s.id).slice(1); if(n >= uid) uid = n + 1; } } if (typeof ensureDecor === 'function') ensureDecor(); if (typeof applyMapSize === 'function') applyMapSize(); }
ensureIds();

// ================= noise / rng =================
function hash3(x, y, s){ let h = Math.imul(x|0, 374761393) ^ Math.imul(y|0, 668265263) ^ Math.imul(s|0, 1442695041); h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; }
function vnoise(x, y, s){ const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi; const u = xf*xf*(3-2*xf), v = yf*yf*(3-2*yf);
  const a = hash3(xi,yi,s), b = hash3(xi+1,yi,s), c = hash3(xi,yi+1,s), d = hash3(xi+1,yi+1,s); return a + (b-a)*u + (c-a)*v + (a-b-c+d)*u*v; }
function fbm(x, y, s){ let t = 0, amp = 1, f = 1, n = 0; for (let i = 0; i < 4; i++){ t += amp * vnoise(x*f, y*f, s + i*31); n += amp; amp *= .5; f *= 2; } return t / n; }
function rng(seed){ let a = seed >>> 0; return function(){ a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function strHash(s){ let h = 2166136261; for (let i = 0; i < s.length; i++){ h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

// ================= geometry =================
function ellipsePts(s, n){ n = n || 48; const out = []; const c = Math.cos(s.rot||0), sn = Math.sin(s.rot||0);
  for (let i = 0; i < n; i++){ const a = i / n * Math.PI * 2; const x = Math.cos(a) * s.rx, y = Math.sin(a) * s.ry; out.push([s.cx + x*c - y*sn, s.cy + x*sn + y*c]); } return out; }
function shapePts(s){ return s.shape === 'ellipse' ? ellipsePts(s) : s.pts; }
function chaikin(pts, it, closed){ for (let k = 0; k < it; k++){ const q = []; const n = pts.length; if (!closed) q.push(pts[0]);
    const segs = closed ? n : n - 1;
    for (let i = 0; i < segs; i++){ const a = pts[i], b = pts[(i+1)%n]; q.push([a[0]*.75+b[0]*.25, a[1]*.75+b[1]*.25]); q.push([a[0]*.25+b[0]*.75, a[1]*.25+b[1]*.75]); }
    if (!closed) q.push(pts[n-1]); pts = q; } return pts; }
function roughen(pts, closed, amp, seed, step){ step = step || 4; const out = []; const n = pts.length; const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++){ const a = pts[i], b = pts[(i+1)%n]; const dx = b[0]-a[0], dy = b[1]-a[1]; const L = Math.hypot(dx, dy); const k = Math.max(1, Math.ceil(L / step));
    for (let j = 0; j < k; j++){ const t = j / k; const x = a[0] + dx*t, y = a[1] + dy*t;
      const ox = (fbm(x/45, y/45, seed) - .5) * 2 * amp + (vnoise(x/9, y/9, seed+7) - .5) * amp * .8 + (vnoise(x/3, y/3, seed+13) - .5) * amp * .45;
      const oy = (fbm(x/45 + 17.3, y/45 - 9.1, seed+3) - .5) * 2 * amp + (vnoise(x/9+3.3, y/9, seed+11) - .5) * amp * .8 + (vnoise(x/3+1.7, y/3, seed+17) - .5) * amp * .45;
      out.push([x + ox, y + oy]); } }
  if (!closed) out.push(pts[n-1]); return out; }
function pathOf(pts, closed){ const p = new Path2D(); if (!pts.length) return p; p.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) p.lineTo(pts[i][0], pts[i][1]); if (closed) p.closePath(); return p; }
function pip(x, y, pts){ let ins = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++){ const xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1];
  if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi + 1e-9) + xi) ins = !ins; } return ins; }
function segDist(px, py, a, b){ const dx = b[0]-a[0], dy = b[1]-a[1]; const L2 = dx*dx + dy*dy || 1; let t = ((px-a[0])*dx + (py-a[1])*dy) / L2; t = Math.max(0, Math.min(1, t)); return Math.hypot(px - a[0] - dx*t, py - a[1] - dy*t); }
function polyEdgeDist(x, y, pts, closed){ let d = Infinity; const n = pts.length; const segs = closed ? n : n - 1; for (let i = 0; i < segs; i++) d = Math.min(d, segDist(x, y, pts[i], pts[(i+1)%n])); return d; }
function bbox(pts){ let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity; for (const p of pts){ if (p[0] < a) a = p[0]; if (p[1] < b) b = p[1]; if (p[0] > c) c = p[0]; if (p[1] > d) d = p[1]; } return [a, b, c, d]; }
function inside(s, x, y){ if (s.shape === 'ellipse'){ const c = Math.cos(-(s.rot||0)), sn = Math.sin(-(s.rot||0)); const dx = x - s.cx, dy = y - s.cy; const u = dx*c - dy*sn, v = dx*sn + dy*c; return (u*u)/(s.rx*s.rx) + (v*v)/(s.ry*s.ry) <= 1; } return pip(x, y, s.pts); }
function depthIn(s, x, y){ if (s.shape === 'ellipse'){ const c = Math.cos(-(s.rot||0)), sn = Math.sin(-(s.rot||0)); const dx = x - s.cx, dy = y - s.cy; const u = dx*c - dy*sn, v = dx*sn + dy*c; const r = Math.sqrt((u*u)/(s.rx*s.rx) + (v*v)/(s.ry*s.ry)); return Math.max(0, 1 - r) * Math.min(s.rx, s.ry); } return polyEdgeDist(x, y, s.pts, true); }
function polyArea(pts){ let a = 0; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) a += (pts[j][0] + pts[i][0]) * (pts[j][1] - pts[i][1]); return Math.abs(a / 2); }

// ================= paper =================
let paperCanvas = null;
function makePaper(){
  const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
  g.fillStyle = PAPER; g.fillRect(0, 0, W, H);
  // blotches: low-res noise scaled up
  const r = rng(99);
  for (const [cw, alpha] of [[24, .22], [60, .12], [160, .07]]){
    const ch = Math.round(cw * H / W); const s = document.createElement('canvas'); s.width = cw; s.height = ch; const sg = s.getContext('2d'); const im = sg.createImageData(cw, ch);
    for (let i = 0; i < cw*ch; i++){ const v = r(); im.data[i*4] = 120; im.data[i*4+1] = 78; im.data[i*4+2] = 30; im.data[i*4+3] = Math.max(0, (v - .45)) * 255 * 1.6; }
    sg.putImageData(im, 0, 0); g.globalAlpha = alpha; g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high'; g.drawImage(s, 0, 0, W, H); }
  g.globalAlpha = 1;
  // grain
  const gw = W, gh = H; const s = document.createElement('canvas'); s.width = gw; s.height = gh; const sg = s.getContext('2d'); const im = sg.createImageData(gw, gh);
  for (let i = 0; i < gw*gh; i++){ const v = r(); im.data[i*4] = 90; im.data[i*4+1] = 60; im.data[i*4+2] = 25; im.data[i*4+3] = v > .55 ? (v - .55) * 90 : 0; }
  sg.putImageData(im, 0, 0); g.drawImage(s, 0, 0, W, H);
  // stains
  for (let i = 0; i < 6; i++){ const x = 120 + r()*(W-240), y = 120 + r()*(H-240), rad = 50 + r()*170;
    g.beginPath(); for (let k = 0; k <= 60; k++){ const a = k/60*Math.PI*2; const rr = rad * (1 + (fbm(Math.cos(a)*2+i*9, Math.sin(a)*2, 5) - .5) * .35); const px = x + Math.cos(a)*rr, py = y + Math.sin(a)*rr; k ? g.lineTo(px, py) : g.moveTo(px, py); }
    g.closePath(); g.fillStyle = 'rgba(150,100,40,.035)'; g.fill(); g.strokeStyle = 'rgba(130,85,30,.10)'; g.lineWidth = 2 + r()*4; g.stroke(); }
  return c;
}

