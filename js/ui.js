"use strict";
// View, interaction, side panel, persistence (local files), export, boot.
// ================= view =================
const stage = document.getElementById('stage'), view = document.getElementById('view'), vctx = view.getContext('2d');
let mapImg = null; let vs = {scale: .4, ox: 0, oy: 0}; let autoFit = true; let dpr = window.devicePixelRatio || 1;
function resize(){ dpr = window.devicePixelRatio || 1; const r = stage.getBoundingClientRect(); view.width = Math.max(1, r.width * dpr); view.height = Math.max(1, r.height * dpr); draw(); }
function fit(){ autoFit = true; const r = stage.getBoundingClientRect(); const s = Math.min(r.width / W, r.height / H) * .98; vs.scale = s; vs.ox = (r.width - W*s)/2; vs.oy = (r.height - H*s)/2; draw(); }
function toWorld(sx, sy){ return [(sx - vs.ox)/vs.scale, (sy - vs.oy)/vs.scale]; }
function toScreen(x, y){ return [x*vs.scale + vs.ox, y*vs.scale + vs.oy]; }

let vmode = null; let ghost = null; let hoverV = -1;
let selObj = null;
// autoFit: поки користувач не рухав вигляд, мапа вписується заново при зміні розміру сцени
let showOutlines = true; let selected = null; let activeVertex = -1; let drawing = null; let hover = null;
const visibleKinds = {land: true, lake: true, mountain: true, forest: true, marsh: true, terrain: true, river: true, region: true, vill: true, town: true, fort: true, road: true, rail: true, path: true, stain: true, stamp: true, text: true};
function draw(){
  const g = vctx; g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, view.width, view.height);
  g.setTransform(dpr*vs.scale, 0, 0, dpr*vs.scale, dpr*vs.ox, dpr*vs.oy);
  if (mapImg){ g.imageSmoothingQuality = 'high'; g.drawImage(mapImg, 0, 0, W, H); } else { g.fillStyle = PAPER; g.fillRect(0, 0, W, H); }
  const px = 1 / vs.scale;
  // outlines
  if (showOutlines) for (const s of data.shapes){ if (!visibleKinds[s.kind]) continue; if (s === selected) continue; outline(g, s, px, false); }
  if (selected){ outline(g, selected, px, true); drawGhost(g, px); }
  drawDecor(g);
  drawBrushPreview(g, px);
  drawAIHighlights(g, px);
  drawBoundsPreview(g, px);
  if (selObj){ const b = selObj.type === 'text' ? [selObj.o.x, selObj.o.y, selObj.o.x + selObj.o.w, selObj.o.y + selObj.o.h] : stampBox(selObj.o);
    g.setLineDash([6*px, 4*px]); g.strokeStyle = '#d39a4a'; g.lineWidth = 1.8*px; g.strokeRect(b[0], b[1], b[2]-b[0], b[3]-b[1]); g.setLineDash([]);
    const hdl = decorHandle(selObj); handle(g, hdl[0], hdl[1], px, true); }
  if ((exportUI || tool === 'exrect') && (data.exportRect || (drawing && drawing.type === 'exrect' && drawing.b))){ const b = drawing && drawing.type === 'exrect' && drawing.b ? {x: drawing.b[0], y: drawing.b[1], w: drawing.b[2], h: drawing.b[3]} : data.exportRect;
    g.save(); g.fillStyle = 'rgba(0,0,0,.35)'; g.beginPath(); g.rect(-W, -H, W*3, H*3); g.rect(b.x, b.y, b.w, b.h); g.fill('evenodd'); g.setLineDash([10*px, 6*px]); g.strokeStyle = '#d39a4a'; g.lineWidth = 2.5*px; g.strokeRect(b.x, b.y, b.w, b.h); g.restore(); }
  if (drawing && drawing.type === 'textbox' && drawing.b){ const b = drawing.b; g.setLineDash([6*px, 4*px]); g.strokeStyle = '#d39a4a'; g.lineWidth = 2*px; g.strokeRect(b[0], b[1], b[2], b[3]); g.setLineDash([]); }
  if (snapMark){ g.beginPath(); g.arc(snapMark[0], snapMark[1], 7*px, 0, Math.PI*2); g.strokeStyle = '#d39a4a'; g.lineWidth = 2.5*px; g.stroke(); }
  // drawing preview
  if (drawing){ g.strokeStyle = drawing.kind === 'river' ? KIND_COLOR.river : KIND_COLOR[drawing.kind]; g.lineWidth = 2*px; g.setLineDash([6*px, 4*px]);
    if (drawing.type === 'ellipse' && drawing.e){ g.stroke(pathOf(ellipsePts(drawing.e), true)); }
    else if (drawing.pts && drawing.pts.length){ const pts = drawing.pts.concat(drawing.cursor ? [drawing.cursor] : []); g.stroke(pathOf(pts, false)); for (const p of drawing.pts){ g.fillStyle = '#fff'; g.fillRect(p[0] - 3*px, p[1] - 3*px, 6*px, 6*px); } }
    g.setLineDash([]); }
}
function outline(g, s, px, sel){
  const col = shapeColor(s); const pts = shapePts(s); const closed = s.shape !== 'line';
  g.lineJoin = 'round';
  if (sel){ g.strokeStyle = 'rgba(0,0,0,.55)'; g.lineWidth = 4.5*px; g.stroke(pathOf(pts, closed)); }
  g.strokeStyle = col; g.lineWidth = (sel ? 2.4 : 1.4)*px; g.globalAlpha = sel ? 1 : (s.kind === 'land' ? .45 : .8);
  if (!sel && (s.kind === 'land' || s.kind === 'lake')) g.setLineDash([5*px, 4*px]);
  if ((s.kind === 'vill' || s.kind === 'town' || s.kind === 'fort') && !sel){ g.setLineDash([3*px, 3*px]); g.globalAlpha = .9; }
  if (s.kind === 'region'){ g.setLineDash([12*px, 6*px]); g.lineWidth = (sel ? 3 : 2.2)*px; g.globalAlpha = 1; }
  g.stroke(pathOf(pts, closed)); g.setLineDash([]); g.globalAlpha = 1;
  if (!sel) return;
  if (s.shape === 'ellipse'){ for (const h of ellipseHandles(s)){ handle(g, h[0], h[1], px, false); } }
  else { const step = !vmode && pts.length > 400 && vs.scale < .5 ? Math.ceil(pts.length / 400) : 1; for (let i = 0; i < pts.length; i += step) handle(g, pts[i][0], pts[i][1], px, i === activeVertex); }
}
function drawGhost(g, px){ if (selected && ghost && selected.shape !== 'ellipse'){ const pts = selected.pts, n = pts.length; g.setLineDash([5*px, 4*px]); g.strokeStyle = '#d39a4a'; g.lineWidth = 1.6*px; g.beginPath();
    if (ghost.extend === 'end'){ g.moveTo(pts[n-1][0], pts[n-1][1]); g.lineTo(ghost.p[0], ghost.p[1]); } else if (ghost.extend === 'start'){ g.moveTo(pts[0][0], pts[0][1]); g.lineTo(ghost.p[0], ghost.p[1]); }
    g.stroke(); g.setLineDash([]); g.beginPath(); g.arc(ghost.p[0], ghost.p[1], 5.5*px, 0, Math.PI*2); g.fillStyle = '#d39a4a'; g.fill(); g.strokeStyle = '#1c1915'; g.lineWidth = 1.2*px; g.stroke();
    g.fillStyle = '#1c1915'; g.fillRect(ghost.p[0] - 3*px, ghost.p[1] - .7*px, 6*px, 1.4*px); g.fillRect(ghost.p[0] - .7*px, ghost.p[1] - 3*px, 1.4*px, 6*px); }
  if (selected && hoverV >= 0 && selected.pts && selected.pts[hoverV]){ const p = selected.pts[hoverV]; const r = 7*px; g.strokeStyle = '#ff5a4a'; g.lineWidth = 2.4*px; g.beginPath(); g.moveTo(p[0]-r, p[1]-r); g.lineTo(p[0]+r, p[1]+r); g.moveTo(p[0]+r, p[1]-r); g.lineTo(p[0]-r, p[1]+r); g.stroke(); } }
function handle(g, x, y, px, act){ g.fillStyle = act ? '#d39a4a' : '#fff'; g.strokeStyle = '#1c1915'; g.lineWidth = 1.2*px; const r = 4.5*px; g.beginPath(); g.rect(x - r, y - r, 2*r, 2*r); g.fill(); g.stroke(); }
function ellipseHandles(s){ const c = Math.cos(s.rot||0), sn = Math.sin(s.rot||0); return [[s.cx, s.cy], [s.cx + c*s.rx, s.cy + sn*s.rx], [s.cx - sn*s.ry, s.cy + c*s.ry]]; }

// ================= rendering scheduler =================
let renderTimer = null, renderVersion = 0;
const busy = document.getElementById('busy');
function scheduleRender(delay){ clearTimeout(renderTimer); busy.style.display = 'block'; renderTimer = setTimeout(() => { requestAnimationFrame(() => { try { mapImg = renderMap(1); libThumb(mapImg); } catch (e) { console.error(e); } busy.style.display = 'none'; draw(); }); }, delay ?? 300); }

// ================= history & persistence =================
let undoStack = [], redoStack = [];
function snapshot(){ return JSON.stringify(data); }
function pushUndo(){ undoStack.push(snapshot()); if (undoStack.length > 80) undoStack.shift(); redoStack = []; updateUndo(); }
function updateUndo(){ document.getElementById('undo').disabled = !undoStack.length; document.getElementById('redo').disabled = !redoStack.length; }
function restore(json){ const selId = selected && selected.id; selObj = null; const nm = data.name; data = JSON.parse(json); data.name = nm; ensureIds(); selected = data.shapes.find(s => s.id === selId) || null; activeVertex = -1; changed(); renderSide(); }
function undo(){ if (!undoStack.length) return; redoStack.push(snapshot()); restore(undoStack.pop()); updateUndo(); }
function redo(){ if (!redoStack.length) return; undoStack.push(snapshot()); restore(redoStack.pop()); updateUndo(); }
function setStatus(t){ const el = document.getElementById('status'); el.textContent = t; el.title = t; }
function changed(noRender){ setStatus('Зберігаю…'); if (!noRender) scheduleRender(); draw(); scheduleSave(); }

// ---- local file persistence (standalone build) ----
let fileHandle = null, fileName = 'kraitren-north.json';
const FS_API = 'showSaveFilePicker' in window;
// download helper used by PNG export; same contract as the old Claude "downloads" capability
const dl = { async save({filename, data}){ const ext = filename.split('.').pop();
  if (FS_API){ try { const h = await window.showSaveFilePicker({suggestedName: filename, types: [{description: ext.toUpperCase(), accept: {[ext === 'png' ? 'image/png' : 'application/json']: ['.' + ext]}}]});
      const w = await h.createWritable(); await w.write(data); await w.close(); return {status: 'saved'}; } catch (e) { if (e && e.name === 'AbortError') throw {code: 'declined'}; } }
  const blob = data instanceof Blob ? data : new Blob([data]); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000); return {status: 'saved'}; } };
function markSaved(){ setStatus('Збережено у файл: ' + fileName); }
async function saveFile(as){ const json = JSON.stringify(data);
  try {
    if (FS_API){ if (!fileHandle || as){ fileHandle = await window.showSaveFilePicker({suggestedName: fileName, types: [{description: 'Мапа (JSON)', accept: {'application/json': ['.json']}}]}); fileName = fileHandle.name; }
      const w = await fileHandle.createWritable(); await w.write(json); await w.close(); markSaved(); toast('Збережено у ' + fileName); return; }
    await dl.save({filename: fileName, data: new Blob([json], {type: 'application/json'})}); markSaved(); toast('Файл мапи завантажено');
  } catch (e) { if (e && (e.name === 'AbortError' || e.code === 'declined')) return; console.error(e); toast('Не вдалося зберегти: ' + (e && e.message || e)); }
}
async function openFile(){
  try {
    if ('showOpenFilePicker' in window){ const [h] = await window.showOpenFilePicker({types: [{description: 'Мапа (JSON)', accept: {'application/json': ['.json']}}]}); const f = await h.getFile(); loadMapText(await f.text(), f.name); fileHandle = h; return; }
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json,application/json'; inp.onchange = async () => { const f = inp.files[0]; if (f){ loadMapText(await f.text(), f.name); fileHandle = null; } }; inp.click();
  } catch (e) { if (e && e.name === 'AbortError') return; toast('Не вдалося відкрити: ' + (e && e.message || e)); }
}
// Файл .json відкривається як нова мапа в бібліотеці (поточна лишається як є).
function loadMapText(txt, name){ try { const d = JSON.parse(txt); if (!d.shapes || !Array.isArray(d.shapes)) throw new Error('у файлі немає shapes');
  if (!d.name) d.name = String(name || L('Мапа з файлу', 'Map from file')).replace(/.json$/i, ''); if (createMap(d)){ if (name) fileName = name; markSaved(); toast('Відкрито ' + (name || mapName(d))); } } catch (e) { toast('Це не схоже на файл мапи: ' + e.message); } }
function initCaps(){ initLibrary(); }
window.addEventListener('beforeunload', () => { if (saveTimer) saveCurrent(); });
window.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's'){ e.preventDefault(); saveFile(e.shiftKey); } if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'o'){ e.preventDefault(); openFile(); } });

// ================= tools / interaction =================
// «Крива» малює річку, дорогу, залізницю чи пунктирний шлях — вид обирається в лівій панелі опцій.
let tool = 'select', newKind = 'mountain', newStamp = 'house', newCurve = 'river', newTerrain = 'steppe', newTrees = 'conifer';
document.getElementById('curveBar').addEventListener('click', e => { const b = e.target.closest('[data-curve]'); if (!b) return; newCurve = b.dataset.curve; for (const c of document.getElementById('curveBar').children) c.setAttribute('aria-pressed', String(c.dataset.curve === newCurve)); });
// кольорові позначки, як у контурів на мапі
for (const b of document.querySelectorAll('#kinds [data-kind], #curveBar [data-curve]')){ const k = b.dataset.kind || b.dataset.curve; const col = b.dataset.terrain ? TERRAINS[b.dataset.terrain].color : KIND_COLOR[k]; b.insertAdjacentHTML('afterbegin', `<span class="dot" style="background:${col}"></span>`); }
view.addEventListener('pointerleave', () => { if (brushCursor && !brushStroke){ brushCursor = null; draw(); } });
(function(){ const sb = document.getElementById('stampsBar'); sb.innerHTML = Object.entries(STAMPS).map(([k, v]) => `<button class="btn" data-stamp="${k}" aria-pressed="${k === 'house'}">${v.name}</button>`).join('');
  sb.addEventListener('click', e => { const b = e.target.closest('[data-stamp]'); if (!b) return; newStamp = b.dataset.stamp; for (const c of sb.children) c.setAttribute('aria-pressed', String(c.dataset.stamp === newStamp)); }); })();
const toolsEl = document.getElementById('tools'), kindsEl = document.getElementById('kinds');
const OPTS_TITLE = {poly: 'Що малювати', ellipse: 'Що малювати', brush: 'Пензель', curve: 'Вид кривої', stamp: 'Штамп'};
// Ліва панель: опції активного інструмента та/або налаштування вибраного об'єкта.
function updateLeftPanel(){ const opts = document.getElementById('opts'), to = document.getElementById('toolOpts'); const hasTool = !!OPTS_TITLE[tool], hasObj = !!(selected || selObj);
  to.hidden = !hasTool; objPanel.hidden = !hasObj; opts.hidden = !hasTool && !hasObj;
  if (hasTool){ document.getElementById('optsTitle').textContent = OPTS_TITLE[tool]; for (const l of opts.querySelectorAll('.optlist')) l.hidden = !l.dataset.for.split(' ').includes(tool); } }
function setTool(t){ tool = t; drawing = null; for (const b of toolsEl.children) b.setAttribute('aria-pressed', String(b.dataset.tool === t));
  updateLeftPanel(); if (t !== 'brush'){ brushCursor = null; brushStroke = null; } else renderBrushOpts();
  view.style.cursor = t === 'select' ? 'default' : 'crosshair'; draw(); }
function setKind(k, t){ newKind = k; if (k === 'terrain' && t) newTerrain = t;
  for (const b of kindsEl.querySelectorAll('[data-kind]')) b.setAttribute('aria-pressed', String(b.dataset.kind === k && (k !== 'terrain' || b.dataset.terrain === newTerrain)));
  updateLeftPanel(); draw(); }
toolsEl.addEventListener('click', e => { const b = e.target.closest('[data-tool]'); if (b) setTool(b.dataset.tool); });
kindsEl.addEventListener('click', e => { const b = e.target.closest('[data-kind]'); if (b) setKind(b.dataset.kind, b.dataset.terrain); });
document.getElementById('brushBar').addEventListener('click', e => { const b = e.target.closest('[data-bmode]'); if (b) setBrushErase(b.dataset.bmode === 'erase'); });

function shapeArea(s){ return s.shape === 'ellipse' ? Math.PI * s.rx * s.ry : polyArea(s.pts); }
function hitShape(x, y){ const tol = 8 / vs.scale; if (!showOutlines) return null;
  for (const k of ['road', 'rail', 'path', 'river']){ if (!visibleKinds[k]) continue; const list = data.shapes.filter(s => s.kind === k);
    for (let i = list.length - 1; i >= 0; i--){ const s = list[i];
      if (k === 'river'){ if (polyEdgeDist(x, y, s.pts, false) < Math.max(tol, (s.width||3)/2 + 3)) return s; }
      else if (polyEdgeDist(x, y, s.pts, false) < Math.max(tol, 5)) return s; } }
  // площинні: найменша фігура, що містить точку
  let best = null, ba = Infinity;
  for (const s of data.shapes){ if (isLineKind(s.kind) || !visibleKinds[s.kind] || !inside(s, x, y)) continue; const a = shapeArea(s); if (a <= ba){ best = s; ba = a; } }
  return best; }
function hitVertex(s, x, y){ const tol = 9 / vs.scale;
  if (s.shape === 'ellipse'){ const hs = ellipseHandles(s); for (let i = hs.length - 1; i >= 0; i--) if (Math.hypot(hs[i][0] - x, hs[i][1] - y) < tol) return i; return -1; }
  let best = -1, bd = tol; for (let i = 0; i < s.pts.length; i++){ const d = Math.hypot(s.pts[i][0] - x, s.pts[i][1] - y); if (d < bd){ bd = d; best = i; } } return best; }

// snapping river points onto other rivers, lakes and coasts so they flow into them
function nearestOnPoly(x, y, pts, closed){ let best = null, bd = Infinity; const n = pts.length; const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++){ const a = pts[i], b = pts[(i+1)%n]; const dx = b[0]-a[0], dy = b[1]-a[1]; const L2 = dx*dx + dy*dy || 1; let t = ((x-a[0])*dx + (y-a[1])*dy) / L2; t = Math.max(0, Math.min(1, t));
    const px = a[0] + dx*t, py = a[1] + dy*t; const d = Math.hypot(x - px, y - py); if (d < bd){ bd = d; best = {x: px, y: py, d, nx: -dy / Math.sqrt(L2), ny: dx / Math.sqrt(L2)}; } }
  return best; }
let snapMark = null;
const ROUTE_KINDS = ['road', 'rail', 'path'];
function isLineKind(k){ return k === 'river' || ROUTE_KINDS.includes(k); }
function snapLinePoint(kind, x, y, self, noSnap){ if (kind === 'river') return snapRiverPoint(x, y, self, noSnap);
  snapMark = null; if (noSnap) return [Math.round(x*10)/10, Math.round(y*10)/10]; const tol = 14 / vs.scale; let best = null;
  for (const s of data.shapes){ if (s === self || !ROUTE_KINDS.includes(s.kind)) continue; for (const p of s.pts){ const d = Math.hypot(p[0] - x, p[1] - y); if (d < tol && (!best || d < best.d)) best = {x: p[0], y: p[1], d}; } }
  if (!best) for (const s of data.shapes){ if (s === self || !ROUTE_KINDS.includes(s.kind)) continue; const q = nearestOnPoly(x, y, s.pts, false); if (q && q.d < tol && (!best || q.d < best.d)) best = {x: q.x, y: q.y, d: q.d}; }
  if (!best) for (const st of data.stamps || []){ const d = Math.hypot(st.x - x, st.y - y); if (d < Math.max(tol, st.size*.4) && (!best || d < best.d)) best = {x: st.x, y: st.y, d}; }
  if (best){ snapMark = [best.x, best.y]; return [Math.round(best.x*10)/10, Math.round(best.y*10)/10]; }
  return [Math.round(x*10)/10, Math.round(y*10)/10]; }
function snapRiverPoint(x, y, self, noSnap){
  snapMark = null; if (noSnap) return [x, y]; const tol = 14 / vs.scale; let best = null;
  for (const s of data.shapes){ if (s === self || s.kind !== 'river') continue; const q = nearestOnPoly(x, y, s.pts, false); if (q && q.d < tol && (!best || q.d < best.d)) best = {x: q.x, y: q.y, d: q.d}; }
  if (!best) for (const s of data.shapes){ if (s.kind !== 'land' && s.kind !== 'lake') continue; const pts = shapePts(s); const q = nearestOnPoly(x, y, pts, true); if (!q || q.d >= tol || (best && q.d >= best.d)) continue;
    // push the point 12px into the water so the river visibly reaches it
    let ox = q.nx * 12, oy = q.ny * 12; const into = inside(s, q.x + ox, q.y + oy); const wantInside = s.kind === 'lake'; if (into !== wantInside){ ox = -ox; oy = -oy; }
    best = {x: q.x + ox, y: q.y + oy, d: q.d}; }
  if (best){ snapMark = [best.x, best.y]; return [Math.round(best.x*10)/10, Math.round(best.y*10)/10]; }
  return [Math.round(x*10)/10, Math.round(y*10)/10]; }

// ---- adding / removing points ----
function nearestSeg(s, x, y){ const pts = s.pts, n = pts.length, closed = s.shape !== 'line'; let best = null;
  for (let i = 0; i < (closed ? n : n - 1); i++){ const a = pts[i], b = pts[(i+1)%n]; const dx = b[0]-a[0], dy = b[1]-a[1]; const L2 = dx*dx + dy*dy || 1; let t = ((x-a[0])*dx + (y-a[1])*dy) / L2; const tc = Math.max(0, Math.min(1, t));
    const px = a[0] + dx*tc, py = a[1] + dy*tc; const d = Math.hypot(x - px, y - py); if (!best || d < best.d) best = {i, t, x: px, y: py, d}; }
  return best; }
// where a click would put a new point: on an edge, or (for rivers) beyond an end to extend it
function planInsert(s, x, y, noSnap){ if (!s || s.shape === 'ellipse') return null; const q = nearestSeg(s, x, y); if (!q) return null; const tol = 14 / vs.scale;
  if (s.shape === 'line'){ const n = s.pts.length;
    const dStart = Math.hypot(x - s.pts[0][0], y - s.pts[0][1]), dEnd = Math.hypot(x - s.pts[n-1][0], y - s.pts[n-1][1]);
    if (q.d > tol || (q.i === 0 && q.t < 0) || (q.i === n - 2 && q.t > 1)){ const p = snapLinePoint(s.kind, x, y, s, noSnap); return dEnd <= dStart ? {at: n, p, extend: 'end'} : {at: 0, p, extend: 'start'}; } }
  if (q.d > tol * 1.6) return null;
  return {at: q.i + 1, p: [Math.round(q.x*10)/10, Math.round(q.y*10)/10]}; }
function doInsert(plan){ pushUndo(); selected.pts.splice(plan.at, 0, plan.p); activeVertex = plan.at; changed(); renderSide(); }
function removeVertex(vi){ const min = selected.shape === 'line' ? 2 : 3; if (selected.pts.length <= min){ toast('Менше точок бути не може — видаліть усю фігуру'); return; }
  pushUndo(); selected.pts.splice(vi, 1); activeVertex = -1; hoverV = -1; changed(); renderSide(); }
function setVmode(m){ vmode = (vmode === m) ? null : m; ghost = null; hoverV = -1; view.style.cursor = vmode ? 'crosshair' : (tool === 'select' ? 'default' : 'crosshair'); renderSide(); draw(); }
let drag = null; let spaceDown = false;
function pos(e){ const r = view.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
view.addEventListener('contextmenu', e => e.preventDefault());
view.addEventListener('pointerdown', e => {
  view.setPointerCapture(e.pointerId); const [sx, sy] = pos(e); const [x, y] = toWorld(sx, sy);
  if (aiPreview){ drag = {type: 'pan', sx, sy, ox: vs.ox, oy: vs.oy, moved: true}; return; } // перегляд змін ШІ: лише рух мапою
  if (e.button === 1 || e.button === 2 && tool !== 'select' || spaceDown){ drag = {type: 'pan', sx, sy, ox: vs.ox, oy: vs.oy}; return; }
  if (tool === 'select'){
    if (e.button === 2){ // delete vertex
      if (selected && selected.shape !== 'ellipse'){ const vi = hitVertex(selected, x, y); const min = selected.shape === 'line' ? 2 : 3; if (vi >= 0 && selected.pts.length > min){ pushUndo(); selected.pts.splice(vi, 1); activeVertex = -1; changed(); } }
      return; }
    if (selObj && e.button === 0){ const hd = decorHandle(selObj); if (Math.hypot(x - hd[0], y - hd[1]) < 10 / vs.scale){ pushUndo(); drag = {type: 'objsize', x0: x, y0: y, o0: JSON.parse(JSON.stringify(selObj.o))}; return; } }
    const vHit = selected ? hitVertex(selected, x, y) : -1;
    if (e.button === 0 && vHit < 0 && !vmode){ const dh = hitDecor(x, y); if (dh){ if (!selObj || selObj.o !== dh.o){ selObj = dh; selected = null; activeVertex = -1; renderSide(); } pushUndo(); drag = {type: 'objmove', x0: x, y0: y, ox: dh.o.x, oy: dh.o.y}; draw(); return; } }
    if (selected && selected.shape !== 'ellipse' && e.button === 0){
      if (vmode === 'remove'){ const vi = hitVertex(selected, x, y); if (vi >= 0) removeVertex(vi); else drag = {type: 'pan', sx, sy, ox: vs.ox, oy: vs.oy, moved: true}; return; }
      if (vmode === 'add' || e.altKey){ const plan = planInsert(selected, x, y, e.shiftKey); if (plan){ doInsert(plan); drag = {type: 'vertex', vi: plan.at, dirty: true}; return; } if (vmode === 'add'){ drag = {type: 'pan', sx, sy, ox: vs.ox, oy: vs.oy, moved: true}; return; } } }
    if (selected){ const vi = hitVertex(selected, x, y); if (vi >= 0){ pushUndo(); activeVertex = selected.shape === 'ellipse' ? -1 : vi; drag = {type: 'vertex', vi}; draw(); return; } }
    const h = hitShape(x, y);
    if (h && h === selected){ pushUndo(); drag = {type: 'move', x0: x, y0: y, orig: JSON.stringify(h)}; return; }
    if (h !== selected || selObj){ selected = h; selObj = null; activeVertex = -1; vmode = null; ghost = null; renderSide(); draw(); }
    drag = {type: 'pan', sx, sy, ox: vs.ox, oy: vs.oy, moved: false}; return; }
  if (tool === 'stamp'){ pushUndo(); const def = STAMPS[newStamp]; const st = {id: 'd' + (uid++), type: newStamp, x: Math.round(x), y: Math.round(y), size: def.size, rot: 0, label: ''}; data.stamps.push(st); selObj = {type: 'stamp', o: st}; selected = null; changed(); setTool('select'); renderSide(); return; }
  if (tool === 'text'){ drawing = {type: 'textbox', x0: x, y0: y, b: null}; drag = {type: 'textbox'}; return; }
  if (tool === 'exrect'){ drawing = {type: 'exrect', x0: x, y0: y, b: null}; drag = {type: 'exrect'}; return; }
  if (tool === 'ellipse'){ drawing = {type: 'ellipse', kind: newKind, x0: x, y0: y, e: null}; drag = {type: 'ellipse'}; return; }
  if (tool === 'brush' && e.button === 0){ brushStroke = {pts: [[x, y]], r: brushOpts.size / 2, erase: brushOpts.erase || e.altKey}; drag = {type: 'brush'}; draw(); return; }
  if (tool === 'poly' || tool === 'curve'){
    if (!drawing) drawing = {type: 'poly', kind: tool === 'curve' ? newCurve : newKind, pts: []};
    const last = drawing.pts[drawing.pts.length - 1];
    const sp = isLineKind(drawing.kind) ? snapLinePoint(drawing.kind, x, y, null, e.shiftKey) : [Math.round(x*10)/10, Math.round(y*10)/10];
    if (!last || Math.hypot(last[0] - sp[0], last[1] - sp[1]) > 3 / vs.scale) drawing.pts.push(sp);
    draw(); }
});
view.addEventListener('pointermove', e => {
  const [sx, sy] = pos(e); const [x, y] = toWorld(sx, sy);
  if (!drag && tool === 'select' && selected && selected.shape !== 'ellipse'){
    const ng = (vmode === 'add' || e.altKey) ? planInsert(selected, x, y, e.shiftKey) : null; const nh = vmode === 'remove' ? hitVertex(selected, x, y) : -1;
    if (ng || ghost || nh !== hoverV){ ghost = ng; hoverV = nh; if (!ng) snapMark = null; draw(); } }
  if (drawing && drawing.type === 'poly'){ drawing.cursor = isLineKind(drawing.kind) ? snapLinePoint(drawing.kind, x, y, null, e.shiftKey) : [x, y]; draw(); }
  else if (tool === 'curve' && !drag){ snapLinePoint(newCurve, x, y, null, e.shiftKey); draw(); }
  if (tool === 'brush'){ brushCursor = [x, y]; if (drag && drag.type === 'brush' && brushStroke){ const l = brushStroke.pts[brushStroke.pts.length - 1]; if (Math.hypot(x - l[0], y - l[1]) > Math.max(1.5 / vs.scale, brushStroke.r * .15)) brushStroke.pts.push([x, y]); } if (!drag || drag.type === 'brush'){ draw(); if (drag) return; } }
  if (!drag) return;
  if (drag.type === 'pan'){ autoFit = false; vs.ox = drag.ox + (sx - drag.sx); vs.oy = drag.oy + (sy - drag.sy); if (Math.abs(sx - drag.sx) + Math.abs(sy - drag.sy) > 3) drag.moved = true; draw(); return; }
  if (drag.type === 'objmove'){ selObj.o.x = Math.round(drag.ox + x - drag.x0); selObj.o.y = Math.round(drag.oy + y - drag.y0); drag.dirty = true; draw(); return; }
  if (drag.type === 'objsize'){ const o = selObj.o, o0 = drag.o0; drag.dirty = true;
    if (selObj.type === 'text'){ o.w = Math.max(40, Math.round(o0.w + x - drag.x0)); o.h = Math.max(20, Math.round(o0.h + y - drag.y0)); }
    else { const k = Math.max(.15, Math.hypot(x - o0.x, y - o0.y) / Math.max(1, Math.hypot(drag.x0 - o0.x, drag.y0 - o0.y))); o.size = Math.max(10, Math.round(o0.size * k)); }
    draw(); return; }
  if (drag.type === 'exrect'){ const x0 = Math.max(0, Math.min(drawing.x0, x)), y0 = Math.max(0, Math.min(drawing.y0, y)); drawing.b = [x0, y0, Math.min(W, Math.max(drawing.x0, x)) - x0, Math.min(H, Math.max(drawing.y0, y)) - y0]; draw(); return; }
  if (drag.type === 'textbox'){ const x0 = Math.min(drawing.x0, x), y0 = Math.min(drawing.y0, y); drawing.b = [x0, y0, Math.abs(x - drawing.x0), Math.abs(y - drawing.y0)]; draw(); return; }
  if (drag.type === 'vertex'){ const s = selected; drag.dirty = true;
    if (s.shape === 'ellipse'){ if (drag.vi === 0){ s.cx = x; s.cy = y; } else if (drag.vi === 1){ s.rx = Math.max(8, Math.hypot(x - s.cx, y - s.cy)); s.rot = Math.atan2(y - s.cy, x - s.cx); } else { const c = Math.cos(s.rot||0), sn = Math.sin(s.rot||0); s.ry = Math.max(8, Math.abs(-(x - s.cx)*sn + (y - s.cy)*c)); } }
    else s.pts[drag.vi] = s.shape === 'line' ? snapLinePoint(s.kind, x, y, s, e.shiftKey) : [Math.round(x*10)/10, Math.round(y*10)/10];
    draw(); return; }
  if (drag.type === 'move'){ const dx = x - drag.x0, dy = y - drag.y0; const o = JSON.parse(drag.orig); drag.dirty = true;
    if (selected.shape === 'ellipse'){ selected.cx = o.cx + dx; selected.cy = o.cy + dy; } else selected.pts = o.pts.map(p => [Math.round((p[0] + dx)*10)/10, Math.round((p[1] + dy)*10)/10]); draw(); return; }
  if (drag.type === 'ellipse'){ drawing.e = {cx: drawing.x0, cy: drawing.y0, rx: Math.max(4, Math.abs(x - drawing.x0)), ry: Math.max(4, Math.abs(y - drawing.y0)), rot: 0}; draw(); }
});
view.addEventListener('pointerup', e => {
  if (!drag) return; const d = drag; drag = null; snapMark = null;
  if (d.type === 'brush'){ const st = brushStroke; brushStroke = null; brushCommit(st); draw(); return; }
  if (d.type === 'pan' && !d.moved && tool === 'select'){ /* click on empty selects nothing */ const [sx, sy] = pos(e); const [x, y] = toWorld(sx, sy); const h = hitShape(x, y); if (!h && (selected || selObj) && !vmode){ selected = null; selObj = null; activeVertex = -1; renderSide(); draw(); } }
  if (d.type === 'exrect'){ const b = drawing && drawing.b; if (b && b[2] > 20 && b[3] > 20){ data.exportRect = {x: Math.round(b[0]), y: Math.round(b[1]), w: Math.round(b[2]), h: Math.round(b[3])}; changed(true); } drawing = null; setTool('select'); openExport(true); return; }
  if (d.type === 'textbox'){ let b = drawing && drawing.b; if (!b || b[2] < 30 / vs.scale || b[3] < 15 / vs.scale) b = [drawing.x0 - 180, drawing.y0 - 40, 360, 80];
    pushUndo(); const t = {id: 'd' + (uid++), x: Math.round(b[0]), y: Math.round(b[1]), w: Math.round(b[2]), h: Math.round(b[3]), text: L('Новий напис', 'New label'), size: 36, font: 'Kurale', align: 'center', bg: false, italic: false, spacing: 0};
    data.texts.push(t); selObj = {type: 'text', o: t}; selected = null; drawing = null; changed(true); setTool('select'); renderSide(); const ta = document.getElementById('tText'); if (ta){ ta.focus(); ta.select(); } return; }
  if (d.type === 'objmove' || d.type === 'objsize'){ if (d.dirty) changed(); else { undoStack.pop(); updateUndo(); } renderSide(); return; }
  if ((d.type === 'vertex' || d.type === 'move')){ if (d.dirty) changed(); else { undoStack.pop(); updateUndo(); } renderSide(); }
  if (d.type === 'ellipse'){ if (drawing.e && drawing.e.rx > 6 / vs.scale && drawing.e.ry > 6 / vs.scale){ pushUndo(); const s = Object.assign({id: 's' + (uid++), kind: drawing.kind, shape: 'ellipse'}, roundE(drawing.e), defaultsFor(drawing.kind)); data.shapes.push(s); selected = s; changed(); setTool('select'); renderSide(); } drawing = null; draw(); }
});
view.addEventListener('dblclick', e => {
  const [sx, sy] = pos(e); const [x, y] = toWorld(sx, sy);
  if (drawing && drawing.type === 'poly'){ finishPoly(); return; }
  if (tool === 'select' && selected && selected.shape !== 'ellipse'){ // insert vertex on nearest edge
    const pts = selected.pts; const closed = selected.shape !== 'line'; let best = -1, bd = 12 / vs.scale; const n = pts.length;
    for (let i = 0; i < (closed ? n : n - 1); i++){ const dd = segDist(x, y, pts[i], pts[(i+1)%n]); if (dd < bd){ bd = dd; best = i; } }
    if (best >= 0){ pushUndo(); pts.splice(best + 1, 0, [Math.round(x*10)/10, Math.round(y*10)/10]); activeVertex = best + 1; changed(); } }
});
function roundE(e){ return {cx: Math.round(e.cx), cy: Math.round(e.cy), rx: Math.round(e.rx), ry: Math.round(e.ry), rot: e.rot || 0}; }
function defaultsFor(k){ if (k === 'mountain') return {min: 28, max: 90, density: 1}; if (k === 'forest') return {tree: 11, density: 1, trees: newTrees}; if (k === 'terrain') return {terrain: newTerrain, density: 1}; if (k === 'marsh') return {density: 1}; if (k === 'road' || k === 'rail' || k === 'path') return {width: 1}; if (k === 'stain') return {color: lastStainColor, opacity: .45, blur: 8, rough: 1.2, edge: .5, grain: .4, drops: 6}; if (k === 'vill') return {density: 1, fields: 1}; if (k === 'town') return {density: 1, wall: 5}; if (k === 'fort') return {density: 1, wall: 7}; if (k === 'region') return {streams: 1, ponds: 1, marsh: 1, pull: 1}; if (k === 'river') return {width: lastRiverWidth}; return {}; }
let lastRiverWidth = 3; let lastStainColor = '#2f6b3a';
function finishPoly(){ if (!drawing) return; const pts = drawing.pts; const min = isLineKind(drawing.kind) ? 2 : 3;
  // dblclick adds duplicate points: drop near-duplicates
  const clean = []; for (const p of pts){ const l = clean[clean.length - 1]; if (!l || Math.hypot(l[0] - p[0], l[1] - p[1]) > 2) clean.push(p); }
  if (clean.length >= min){ pushUndo(); const s = Object.assign({id: 's' + (uid++), kind: drawing.kind, shape: isLineKind(drawing.kind) ? 'line' : 'poly', pts: clean}, defaultsFor(drawing.kind)); data.shapes.push(s); selected = s; changed(); }
  drawing = null; snapMark = null; setTool('select'); renderSide(); draw(); }
view.addEventListener('wheel', e => { e.preventDefault(); const [sx, sy] = pos(e); const f = Math.exp(-e.deltaY * (e.ctrlKey ? .01 : .0015)); const ns = Math.min(4, Math.max(.08, vs.scale * f));
  autoFit = false; const [wx, wy] = toWorld(sx, sy); vs.scale = ns; vs.ox = sx - wx*ns; vs.oy = sy - wy*ns; draw(); }, {passive: false});
// ================= map settings (бічна панель, коли нічого не вибрано) =================
function renderMapSettings(){ const mapBody = document.getElementById('mapBody'); if (!mapBody) return;
  const st = data.settings || (data.settings = {}); if (st.wetStreams == null) st.wetStreams = 1; if (st.wetPonds == null) st.wetPonds = 1;
  let h = `<div class="row"><label for="mapName">Назва</label><input type="text" id="mapName" class="txt" maxlength="120" value="${esc(mapName(data))}"></div>`;
  h += `<div class="row"><label>Розмір <output>${W} × ${H}</output></label><div class="btns"><button class="btn solid" id="boundsBtn">Змінити межі…</button></div></div>`;
  h += `<div class="row"><label for="seedIn">Варіант розкладки (seed)</label><div class="btns" style="flex-wrap:nowrap"><input type="number" id="seedIn" value="${data.seed}"><button class="btn solid" id="seedNew">Інший</button></div></div>`;
  h += slider('Розсип окремих дерев', 'scatter', 0, 3, .05, st);
  h += `<div class="row"><label for="scatterTrees">Вид окремих дерев</label><select id="scatterTrees">${Object.entries(TREE_TYPES).map(([k, v]) => `<option value="${k}" ${k === (st.scatterTrees || 'conifer') ? 'selected' : ''}>${v.name}</option>`).join('')}</select></div>`;
  const nGen = data.shapes.filter(x => x.gen === 'wet').length;
  if (nGen) h += `<div class="btns" style="margin-bottom:8px"><button class="btn solid" id="wetClear">Прибрати стару автогенерацію (${nGen})</button></div>`;
  mapBody.innerHTML = h;
  bindSliders(mapBody, st, () => changed());
  const q = id => document.getElementById(id);
  q('mapName').addEventListener('change', e => renameMap(currentMapId, e.target.value));
  q('mapName').addEventListener('keydown', e => { if (e.key === 'Enter') e.target.blur(); });
  q('boundsBtn').addEventListener('click', openBounds);
  q('scatterTrees').addEventListener('change', e => { pushUndo(); st.scatterTrees = e.target.value; changed(); });
  q('seedIn').addEventListener('change', e => { pushUndo(); data.seed = (+e.target.value) | 0; changed(); });
  q('seedNew').addEventListener('click', () => { pushUndo(); data.seed = (Math.random()*100000) | 0; changed(); renderMapSettings(); });
  if (q('wetClear')) q('wetClear').addEventListener('click', () => { pushUndo(); data.shapes = data.shapes.filter(x => x.gen !== 'wet'); if (selected && selected.gen === 'wet') selected = null; changed(); renderSide(); });
}

// ================= help dialog =================
const helpM = document.getElementById('helpModal');
// Довідка: вкладки «Основи / Інструменти / Гарячі клавіші»; галерея лісів і ландшафтів малюється тими ж функціями, що й мапа.
function setHelpTab(t){ for (const b of helpM.querySelectorAll('[data-htab]')) b.setAttribute('aria-pressed', String(b.dataset.htab === t)); for (const p of helpM.querySelectorAll('[data-hpane]')) p.hidden = p.dataset.hpane !== t; helpM.querySelector('.helpbody').scrollTop = 0; if (t === 'tools') renderHelpGallery(); }
function toggleHelp(open, tab){ helpM.classList.toggle('open', open ?? !helpM.classList.contains('open')); if (helpM.classList.contains('open')){ if (tab) setHelpTab(tab); document.getElementById('helpClose').focus({preventScroll: true}); helpM.querySelector('.helpbody').scrollTop = 0; } }
helpM.addEventListener('click', e => { const b = e.target.closest('[data-htab]'); if (b) setHelpTab(b.dataset.htab); });
function renderHelpGallery(){
  for (const el of helpM.querySelectorAll('[data-gallery]')){ if (el.dataset.done) continue; el.dataset.done = '1'; const trees = el.dataset.gallery === 'trees';
    const kinds = trees ? Object.keys(TREE_TYPES) : Object.keys(TERRAINS);
    el.innerHTML = kinds.map(k => `<figure><canvas width="240" height="150" data-k="${k}"></canvas><figcaption>${esc(trees ? TREE_TYPES[k].name : TERRAINS[k].name)}</figcaption></figure>`).join('');
    el.querySelectorAll('canvas').forEach(c => drawHelpSample(c.getContext('2d'), trees, c.dataset.k)); } }
function drawHelpSample(g, trees, k){
  g.scale(2, 2); g.fillStyle = PAPER_L; g.fillRect(0, 0, 120, 75); const R = rng(strHash(k) + 11); const pts = [];
  const spread = (n, minD, x0, y0, x1, y1) => { for (let t = 0; t < n * 30 && pts.length < n; t++){ const x = x0 + R() * (x1 - x0), y = y0 + R() * (y1 - y0); if (pts.every(p => Math.hypot(p[0] - x, (p[1] - y) * 1.6) > minD)) pts.push([x, y]); } return pts.sort((a, b) => a[1] - b[1]); };
  const stip = n => { g.fillStyle = INK; g.globalAlpha = .33; for (let i = 0; i < n; i++) g.fillRect(6 + R() * 108, 8 + R() * 62, 1.3, 1.3); g.globalAlpha = 1; };
  const dashes = n => { g.beginPath(); for (let i = 0; i < n; i++){ const x = 8 + R() * 104, y = 10 + R() * 60, l = 3 + R() * 4; g.moveTo(x - l / 2, y); g.lineTo(x + l / 2, y); } g.strokeStyle = INK; g.globalAlpha = .5; g.lineWidth = .7; g.stroke(); g.globalAlpha = 1; };
  if (trees){ for (const [x, y] of spread(14, 11, 10, 26, 110, 70)) drawTreeKind(g, x, y, 9, (R() * 1e9) | 0, pickTree(k, R)); return; }
  if (k === 'snow'){ stip(160); g.beginPath(); for (let i = 0; i < 14; i++){ const x = 8 + R() * 100, y = 10 + R() * 60, l = 7 + R() * 6; g.moveTo(x, y); g.quadraticCurveTo(x + l / 2, y - l * .35, x + l, y); } g.strokeStyle = INK; g.globalAlpha = .55; g.lineWidth = .8; g.stroke(); g.globalAlpha = 1; }
  else if (k === 'tundra'){ stip(110); for (const [x, y] of spread(16, 9, 8, 14, 112, 70)) R() < .25 ? drawStone(g, x, y, 1.6 + R() * 1.2) : drawGrass(g, x, y, 3.5 + R() * 2, (R() * 1e9) | 0); }
  else if (k === 'steppe'){ dashes(18); for (const [x, y] of spread(14, 12, 8, 16, 112, 70)) drawGrass(g, x, y, 4.5 + R() * 2.5, (R() * 1e9) | 0); }
  else if (k === 'meadow'){ dashes(10); for (const [x, y] of spread(18, 10, 8, 14, 112, 70)) drawMeadow(g, x, y, 4.5 + R() * 2.5, (R() * 1e9) | 0); }
  else if (k === 'hills'){ for (const [x, y] of spread(5, 34, 22, 30, 98, 66)) drawHill(g, x, y, 15 + R() * 6, (R() * 1e9) | 0); }
  else if (k === 'marsh'){ for (const [x, y] of spread(16, 10, 8, 14, 112, 70)) R() < .38 ? drawWet(g, x, y, 5.5 + R() * 3, (R() * 1e9) | 0) : drawTuft(g, x, y, 6 + R() * 3, (R() * 1e9) | 0); }
  else if (k === 'desert'){ stip(220); for (const [x, y] of spread(5, 30, 18, 24, 102, 68)) drawDune(g, x, y, 12 + R() * 6, (R() * 1e9) | 0); }
}
document.getElementById('helpBtn').addEventListener('click', () => toggleHelp());
document.getElementById('helpClose').addEventListener('click', () => toggleHelp(false));
helpM.addEventListener('click', e => { if (e.target === helpM) toggleHelp(false); });
window.addEventListener('keydown', e => {
  if (e.key === 'F1' || (e.key === '?' && !e.target.matches('input,textarea,select'))){ e.preventDefault(); toggleHelp(); return; }
  if (e.key === 'Escape' && helpM.classList.contains('open')){ e.stopImmediatePropagation(); toggleHelp(false); }
}, true);

window.addEventListener('keydown', e => {
  if (e.target.matches('input,textarea,select')) return;
  if (e.code === 'Space'){ spaceDown = true; e.preventDefault(); }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z'){ e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y'){ e.preventDefault(); redo(); return; }
  if (e.key === 'Enter' && drawing) finishPoly();
  if (e.key === 'Escape' && vmode){ setVmode(vmode); return; }
  if (e.key === 'Escape'){ if (drawing){ drawing = null; draw(); } else if (selObj){ selObj = null; renderSide(); draw(); } else if (selected){ selected = null; activeVertex = -1; renderSide(); draw(); } }
  if ((e.key === 'Delete' || e.key === 'Backspace') && selObj){ e.preventDefault(); deleteSelected(); return; }
  if ((e.key === 'Delete' || e.key === 'Backspace') && selected){ e.preventDefault();
    if (activeVertex >= 0 && selected.shape !== 'ellipse' && selected.pts.length > (selected.shape === 'line' ? 2 : 3)){ pushUndo(); selected.pts.splice(activeVertex, 1); activeVertex = -1; changed(); }
    else deleteSelected(); }
  if (selected && selected.shape !== 'ellipse' && !e.ctrlKey && !e.metaKey){ if (e.key === '+' || e.key === '=' || e.key.toLowerCase() === 'a'){ setVmode('add'); return; } if (e.key === '-' || e.key.toLowerCase() === 'x'){ setVmode('remove'); return; } }
  if (!e.ctrlKey && !e.metaKey){ if (tool === 'brush' && (e.key === '[' || e.key === ']')){ brushOpts.size = Math.max(10, Math.min(600, Math.round(brushOpts.size * (e.key === ']' ? 1.2 : 1 / 1.2)))); renderBrushOpts(); draw(); }
    const m = {v: 'select', p: 'poly', o: 'ellipse', r: 'curve', s: 'stamp', t: 'text', d: 'curve', b: 'brush'}[e.key.toLowerCase()]; if (m && !drawing) setTool(m); }
});
window.addEventListener('keyup', e => { if (e.code === 'Space') spaceDown = false; if (e.key === 'Alt' && ghost && vmode !== 'add'){ ghost = null; snapMark = null; draw(); } });
function deleteSelected(){ if (selObj){ pushUndo(); const o = selObj.o; data.stamps = data.stamps.filter(x => x !== o); data.texts = data.texts.filter(x => x !== o); selObj = null; changed(); renderSide(); return; } if (!selected) return; vmode = null; ghost = null; pushUndo(); data.shapes = data.shapes.filter(s => s !== selected); selected = null; activeVertex = -1; changed(); renderSide(); }

// ================= side panel =================
const sidePanel = document.getElementById('side'), objPanel = document.getElementById('objPanel');
// Повзунок із полем для числа: тягнути або ввести значення вручну (Enter / вихід з поля застосовує).
function slider(label, key, min, max, step, obj, onSet){ const id = 'f_' + key; const v = obj[key];
  return `<div class="row"><label for="${id}">${label} <input type="text" inputmode="decimal" class="num" id="${id}_o" data-min="${min}" data-max="${max}" value="${v}" aria-label="${label}, число"></label><input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${v}" data-key="${key}"></div>`; }
// Прив'язати всі повзунки в root до об'єкта obj; after(v) — що зробити після зміни (зазвичай changed()).
function bindSliders(root, obj, after, noUndo){ const undo = noUndo ? () => {} : pushUndo;
  root.querySelectorAll('input[type=range]').forEach(inp => { const box = document.getElementById(inp.id + '_o'); const key = inp.dataset.key;
    inp.addEventListener('pointerdown', () => undo());
    inp.addEventListener('keydown', () => { if (!inp._u){ undo(); inp._u = 1; } });
    inp.addEventListener('input', () => { obj[key] = +inp.value; if (box) box.value = inp.value; after(+inp.value); });
    if (box){ box.addEventListener('keydown', e => { if (e.key === 'Enter') box.blur(); });
      box.addEventListener('change', () => { let v = parseFloat(String(box.value).replace(',', '.')); if (!isFinite(v)){ box.value = obj[key]; return; }
        v = Math.min(+inp.max, Math.max(+inp.min, v)); box.value = v; if (v === obj[key]) return; undo(); obj[key] = v; inp.value = v; after(v); }); } }); }
function renderDecorSide(side){
  const so = selObj, o = so.o; let h = '';
  if (so.type === 'stamp'){
    h += `<div class="kindtag"><span class="dot" style="background:#d39a4a"></span>Штамп · ${STAMPS[o.type] ? STAMPS[o.type].name : o.type}</div>`;
    h += `<div class="row"><label for="dType">Вигляд</label><select id="dType">${(STAMPS[o.type] ? '' : `<option value="${o.type}" selected>${o.type}</option>`) + Object.entries(STAMPS).map(([k, v]) => `<option value="${k}" ${k === o.type ? 'selected' : ''}>${v.name}</option>`).join('')}</select></div>`;
    h += slider('Розмір', 'size', 10, 420, 1, o) + (o.type === 'compass' ? '' : slider('Поворот', 'rot', -180, 180, 1, o));
    h += `<div class="row"><label for="dLabel">Підпис під штампом</label><input type="text" id="dLabel" value="${(o.label || '').replace(/"/g, '&quot;')}" placeholder="Без підпису" style="background:var(--panel2);border:1px solid var(--line);border-radius:6px;padding:7px 9px;min-height:36px"></div>`;
    if (o.labelSize == null) o.labelSize = 22; h += slider('Розмір підпису', 'labelSize', 10, 80, 1, o);
    if (o.type !== 'compass') h += `<label class="check"><input type="checkbox" id="dHalo" ${o.halo !== false ? 'checked' : ''}> Світлий фон під штампом</label><label class="check"><input type="checkbox" id="dClear" ${o.clear !== false ? 'checked' : ''}> Прибирати гори й дерева під штампом</label>`;
  } else {
    h += `<div class="kindtag"><span class="dot" style="background:#d39a4a"></span>Текст</div>`;
    h += `<div class="row"><label for="tText">Текст (Enter — новий рядок)</label><textarea id="tText" rows="4">${(o.text || '').replace(/</g, '&lt;')}</textarea></div>`;
    h += `<div class="row"><label for="tFont">Шрифт</label><select id="tFont">${FONTS.map(([f, n]) => `<option value="${f}" ${f === o.font ? 'selected' : ''} style="font-family:'${f}'">${n}</option>`).join('')}</select></div>`;
    h += slider('Розмір шрифту', 'size', 8, 200, 1, o) + slider('Розрядка між літерами', 'spacing', 0, 40, .5, o) + (o.lineH == null ? (o.lineH = 1.2, '') : '') + slider('Міжрядковий інтервал', 'lineH', .8, 2.5, .05, o);
    h += `<div class="row"><label for="tAlign">Вирівнювання</label><select id="tAlign">${[['left', 'Ліворуч'], ['center', 'По центру'], ['right', 'Праворуч']].map(([v, n]) => `<option value="${v}" ${v === (o.align || 'center') ? 'selected' : ''}>${n}</option>`).join('')}</select></div>`;
    h += `<label class="check"><input type="checkbox" id="tItalic" ${o.italic ? 'checked' : ''}> Курсив</label><label class="check"><input type="checkbox" id="tBold" ${o.bold ? 'checked' : ''}> Жирний</label><label class="check"><input type="checkbox" id="tBg" ${o.bg ? 'checked' : ''}> Рамка й фон-пергамент</label>`;
    h += `<p class="help" style="padding:0;margin:8px 0">Розмір боксу — тягніть помаранчевий квадрат у правому нижньому куті. Зараз ${o.w}×${o.h}.</p>`;
  }
  h += `<div class="btns" style="margin-top:8px"><button class="btn solid" id="oDup">Дублювати</button><button class="btn solid" id="oDel">Видалити</button></div>`;
  side.innerHTML = h; const q = id => document.getElementById(id);
  bindSliders(side, o, () => changed(so.type === 'text' && !o.bg));
  const once = (el, ev, fn) => { let u = false; el.addEventListener('focus', () => { u = false; }); el.addEventListener(ev, () => { if (!u){ pushUndo(); u = true; } fn(); }); };
  if (q('dType')) q('dType').addEventListener('change', e => { pushUndo(); o.type = e.target.value; o.size = STAMPS[o.type].size; changed(); renderSide(); });
  if (q('dHalo')) q('dHalo').addEventListener('change', e => { pushUndo(); o.halo = e.target.checked; changed(true); });
  if (q('dClear')) q('dClear').addEventListener('change', e => { pushUndo(); o.clear = e.target.checked; changed(); });
  if (q('dLabel')) once(q('dLabel'), 'input', () => { o.label = q('dLabel').value; changed(true); });
  if (q('tText')) once(q('tText'), 'input', () => { o.text = q('tText').value; changed(!o.bg); });
  if (q('tFont')) q('tFont').addEventListener('change', e => { pushUndo(); o.font = e.target.value; document.fonts && document.fonts.load(`36px "${o.font}"`).then(draw); changed(!o.bg); });
  if (q('tAlign')) q('tAlign').addEventListener('change', e => { pushUndo(); o.align = e.target.value; changed(!o.bg); });
  if (q('tItalic')) q('tItalic').addEventListener('change', e => { pushUndo(); o.italic = e.target.checked; changed(!o.bg); });
  if (q('tBold')) q('tBold').addEventListener('change', e => { pushUndo(); o.bold = e.target.checked; changed(!o.bg); });
  if (q('tBg')) q('tBg').addEventListener('change', e => { pushUndo(); o.bg = e.target.checked; changed(); });
  q('oDup').addEventListener('click', () => { pushUndo(); const c = JSON.parse(JSON.stringify(o)); c.id = 'd' + (uid++); c.x += 40; c.y += 40; (so.type === 'text' ? data.texts : data.stamps).push(c); selObj = {type: so.type, o: c}; changed(); renderSide(); });
  q('oDel').addEventListener('click', deleteSelected);
}
// Права панель — завжди параметри мапи й контури; налаштування вибраної фігури, штампа чи тексту — у лівій панелі.
function renderSide(){
  const s0 = selected, o0 = selObj;
  selected = null; selObj = null; try { renderPanel(sidePanel); } finally { selected = s0; selObj = o0; }
  if (s0 || o0) renderPanel(objPanel); else objPanel.innerHTML = '';
  updateLeftPanel(); }
function renderPanel(side){
  if (selObj){ renderDecorSide(side); return; }
  let h = '';
  if (selected){ const s = selected; h += `<div class="kindtag"><span class="dot" style="background:${shapeColor(s)}"></span>${s.kind === 'terrain' ? 'Ландшафт · ' + TERRAINS[terrainOf(s)].name : KIND_NAME[s.kind]}${s.shape === 'ellipse' ? ' · овал' : s.shape === 'poly' ? ' · полігон' : ''}</div>`;
    if (s.shape === 'line') h += `<label class="check"><input type="checkbox" id="lineClear" ${s.clear !== false ? 'checked' : ''}> Прибирати дерева, гори й сніг уздовж</label>`;
    if (ROUTE_KINDS.includes(s.kind)){ h += `<div class="row"><label for="routeSel">Вид</label><select id="routeSel">${ROUTE_KINDS.map(k => `<option value="${k}" ${k === s.kind ? 'selected' : ''}>${KIND_NAME[k]}</option>`).join('')}</select></div>` + slider('Товщина', 'width', .4, 3, .05, s); }
    if (s.shape !== 'line'){ h += `<div class="row"><label for="kindSel">Тип зони</label><select id="kindSel">${['land','lake','mountain','forest','terrain','stain','vill','town','fort','region'].map(k => `<option value="${k}" ${k === s.kind ? 'selected' : ''}>${KIND_NAME[k]}</option>`).join('')}</select></div>`; }
    if (s.kind === 'mountain'){ h += slider('Найменші гори', 'min', 12, 80, 1, s) + slider('Найбільші гори', 'max', 20, 160, 1, s) + slider('Щільність', 'density', .2, 2, .05, s); }
    if (s.kind === 'forest'){ h += `<div class="row"><label for="treesSel">Дерева</label><select id="treesSel">${Object.entries(TREE_TYPES).map(([k, v]) => `<option value="${k}" ${k === treesOf(s) ? 'selected' : ''}>${v.name}</option>`).join('')}</select></div>` + slider('Розмір дерев', 'tree', 6, 24, .5, s) + slider('Щільність', 'density', .1, 2, .05, s); }
    if (s.kind === 'stain'){ const [r0, g0, b0] = hexToRgb(s.color); const pal = INK_PRESETS.concat((data.palette || []).map(p => Object.assign({own: true}, p)));
      h += `<h2>Колір</h2><div class="btns" style="gap:6px;margin-bottom:8px">${pal.map((p, i) => `<span style="display:inline-flex;align-items:center"><button class="btn solid" data-sw="${p.c}" title="${p.name} ${p.c}" aria-label="${p.name}" aria-pressed="${p.c.toLowerCase() === (s.color || '').toLowerCase()}" style="width:44px;padding:0;background:${p.c};border:2px solid ${p.c.toLowerCase() === (s.color || '').toLowerCase() ? '#fff' : 'transparent'}"></button>${p.own ? `<button class="btn" data-swdel="${i - INK_PRESETS.length}" aria-label="Видалити ${p.name} з палітри" style="min-height:28px;padding:0 6px">×</button>` : ''}</span>`).join('')}</div>`;
      h += `<div class="row"><label for="stCol">Свій колір</label><div class="btns" style="align-items:flex-end"><input type="color" id="stCol" value="${s.color}" style="width:56px;height:36px;padding:2px;background:var(--panel2);border:1px solid var(--line);border-radius:6px">
        <label style="display:flex;flex-direction:column;font-size:11px;color:var(--muted)">R<input type="number" id="stR" min="0" max="255" value="${r0}" style="width:62px"></label><label style="display:flex;flex-direction:column;font-size:11px;color:var(--muted)">G<input type="number" id="stG" min="0" max="255" value="${g0}" style="width:62px"></label><label style="display:flex;flex-direction:column;font-size:11px;color:var(--muted)">B<input type="number" id="stB" min="0" max="255" value="${b0}" style="width:62px"></label></div></div>`;
      h += `<div class="row"><label for="stName">Зберегти колір у палітру</label><div class="btns" style="flex-wrap:nowrap"><input type="text" id="stName" placeholder="Назва, напр. «Гравці»" style="background:var(--panel2);border:1px solid var(--line);border-radius:6px;padding:7px 9px;min-height:36px;flex:1;width:auto"><button class="btn solid" id="stSave">Зберегти</button></div></div>`;
      h += `<h2>Вигляд плями</h2>` + slider('Насиченість', 'opacity', .05, 1, .01, s) + slider('Розмитість', 'blur', 0, 40, .5, s) + slider('Нерівність краю', 'rough', 0, 4, .05, s) + slider('Темний обідок', 'edge', 0, 1, .01, s) + slider('Зернистість', 'grain', 0, 1, .01, s) + slider('Бризки', 'drops', 0, 40, 1, s);
    }
    if (s.kind === 'terrain'){ h += `<div class="row"><label for="terrSel">Вид ландшафту</label><select id="terrSel">${Object.entries(TERRAINS).map(([k, v]) => `<option value="${k}" ${k === terrainOf(s) ? 'selected' : ''}>${v.name}</option>`).join('')}</select></div>` + slider('Щільність позначок', 'density', .1, 3, .05, s) + (terrainOf(s) === 'hills' ? slider('Розмір пагорбів', 'size', 12, 70, 1, Object.assign(s, {size: s.size ?? 26})) : ''); }
    if ((s.kind === 'vill' || s.kind === 'town' || s.kind === 'fort') && s.scale == null) s.scale = 1;
    if (s.kind === 'vill' || s.kind === 'town' || s.kind === 'fort'){ h += slider('Масштаб будівель', 'scale', .4, 3, .05, s); const ig = s.ignore || {};
      h += `<label class="check"><input type="checkbox" id="zoneClear" ${s.clear !== false ? 'checked' : ''}> Прибирати дерева, гори й сніг у зоні</label><p class="help" style="padding:0;margin:-2px 0 10px">Вимкнено — ліс і гори лишаються між будинками, полями й мурами (лісове село, замок серед скель).</p>`;
      h += `<div class="row"><label>Будувати попри перешкоди</label>${[['water', 'Вода (озера, море) — будинки стануть і на воді'], ['rivers', 'Річки й струмки'], ['roads', 'Дороги, залізниці, шляхи'], ['stamps', 'Штампи й написи з фоном']].map(([k, n]) => `<label class="check"><input type="checkbox" data-ign="${k}" ${ig[k] ? 'checked' : ''}> ${n}</label>`).join('')}</div>`; }
    if (s.kind === 'vill'){ h += slider('Кількість хат', 'density', .2, 3, .05, s) + slider('Поля', 'fields', 0, 3, .05, s) + `<p class="help" style="padding:0;margin-bottom:10px">Хати купчаться ближче до середини, поля — довкола і завжди цілком усередині зони. Інший варіант розкладки — кнопка «Інший» у налаштуваннях мапи.</p>`; }
    const wallSel = () => `<div class="row"><label for="wallMode">Мури</label><select id="wallMode">${[['land', 'Лише на суші'], ['always', 'Завжди (і над водою)'], ['never', 'Ніколи']].map(([v, n]) => `<option value="${v}" ${v === (s.wallMode || 'land') ? 'selected' : ''}>${n}</option>`).join('')}</select></div>`;
    if (s.kind === 'town'){ h += wallSel() + slider('Щільність забудови', 'density', .4, 2.5, .05, s) + slider('Товщина мурів', 'wall', 2, 14, .5, s) + `<p class="help" style="padding:0;margin-bottom:10px">Мури йдуть по контуру зони, вежі — на кутах і вздовж довгих стін. Будинки ніколи не стають на воду; мури й вежі — залежно від вибору вище.</p>`; }
    if (s.kind === 'fort'){ h += wallSel() + slider('Кількість будівель у дворі', 'density', 0, 3, .05, s) + slider('Товщина мурів', 'wall', 3, 16, .5, s) + `<p class="help" style="padding:0;margin-bottom:10px">Донжон стає в найглибшій частині зони, вежі — на кожному куті.</p>`; }
    if (s.kind === 'region'){ if (s.pull == null) s.pull = 1; const cnt = t => data.shapes.filter(x => x.gen === genTag(s, t)).length;
      h += `<p class="help" style="padding:0;margin-bottom:10px">На мапі не малюється. Генерує всередині себе; кожна кнопка замінює лише попередню генерацію свого типу в цій області. Порада: спершу озерця, потім струмки — тоді струмки впадатимуть і в озерця.</p>`;
      h += `<h2>Озерця · ${cnt('pond')}</h2>` + slider('Кількість', 'ponds', .2, 4, .05, s) + `<div class="btns"><button class="btn solid" data-gen="pond">Згенерувати</button><button class="btn solid" data-clr="pond">Прибрати</button></div>`;
      h += `<h2>Струмки · ${cnt('stream')}</h2>` + slider('Густота', 'streams', .2, 4, .05, s) + slider('Тяжіння до широких річок', 'pull', 0, 3, .05, s) + `<p class="help" style="padding:0;margin:-4px 0 8px">Беруть початок у горах і на схилах, зливаються між собою й течуть униз — насамперед до широких річок (сила тяжіння — повзунок вище), а якщо вона далеко, то до найближчої річки, озера чи моря, навіть за межами області.</p><div class="btns"><button class="btn solid" data-gen="stream">Згенерувати</button><button class="btn solid" data-clr="stream">Прибрати</button></div>`;
      h += `<h2>Болота · ${cnt('marsh')}</h2>` + slider('Кількість', 'marsh', .2, 4, .05, s) + `<div class="btns"><button class="btn solid" data-gen="marsh">Згенерувати</button><button class="btn solid" data-clr="marsh">Прибрати</button></div>`;
    }
    if (s.kind === 'river'){ h += slider('Ширина річки', 'width', 1, 30, .5, s) + `<label class="check" style="margin-bottom:8px"><input type="checkbox" id="taperChk" ${s.taper !== false ? 'checked' : ''}> Вужча біля витоку</label><p class="help" style="padding:0;margin-bottom:12px">До 4.5 — одна лінія чорнилом, ширше — вода з двома берегами, яка зливається з озерами, морем та іншими широкими річками. Кінці річки прилипають до інших річок, озер і берега (утримуйте <kbd>Shift</kbd>, щоб вимкнути).</p>`; }
    h += `<div class="btns">`;
    if (s.shape === 'ellipse') h += `<button class="btn solid" id="toPoly">На полігон</button>`;
    h += `<button class="btn solid" id="dupBtn">Дублювати</button><button class="btn solid" id="delBtn">Видалити</button></div>`;
    if (s.shape !== 'ellipse'){
      h += `<h2>Точки · ${s.pts.length}</h2><div class="btns"><button class="btn solid" id="vAdd" aria-pressed="${vmode === 'add'}">+ Додати (A)</button><button class="btn solid" id="vDel" aria-pressed="${vmode === 'remove'}">− Видалити (X)</button></div>`;
      h += `<p class="help" style="padding:0;margin-top:8px">${vmode === 'add' ? (s.shape === 'line' ? 'Клік біля лінії — нова точка на ньому, клік далі від кінця — річка подовжується.' : 'Клік біля краю — нова точка в цьому місці.') + ' Нову точку можна одразу тягнути. <kbd>Esc</kbd> — вийти.' : vmode === 'remove' ? 'Клік по точці — видалити її. <kbd>Esc</kbd> — вийти.' : 'Без режимів: <kbd>Alt</kbd>+клік на краю — додати точку, правий клік по точці — видалити, подвійний клік на краю — теж додати.'}</p>`;
      if (activeVertex >= 0) h += `<div class="btns" style="margin-top:6px"><button class="btn solid" id="vDelActive">Видалити вибрану точку</button></div>`;
    } else h += `<p class="help" style="padding:0;margin-top:10px">Щоб додавати чи видаляти точки, спершу перетворіть овал на полігон.</p>`;
  } else {
    h += `<h2>Мапа</h2><div id="mapBody"></div><h2>Контури й вибір</h2><label class="check"><input type="checkbox" id="outChk" ${showOutlines ? 'checked' : ''}> Показувати контури</label>`;
    h += `<div class="vis">` + ['land','lake','mountain','forest','terrain','river','road','rail','path','stain','vill','town','fort','region'].map(k => `<label class="check"><input type="checkbox" data-vis="${k}" ${visibleKinds[k] ? 'checked' : ''}><span class="dot" style="background:${KIND_COLOR[k]}"></span>${KIND_NAME[k]}</label>`).join('') + [['stamp', 'Штампи'], ['text', 'Написи']].map(([k, n]) => `<label class="check"><input type="checkbox" data-vis="${k}" ${visibleKinds[k] ? 'checked' : ''}><span class="dot" style="background:#d39a4a"></span>${n}</label>`).join('') + `</div>`;
  }
  side.innerHTML = h;
  if (selected){ const sel = selected; bindSliders(side, sel, v => { if (sel.kind === 'river') lastRiverWidth = v; changed(); }); }
  const q = id => document.getElementById(id);
  if (q('treesSel')) q('treesSel').addEventListener('change', e => { pushUndo(); selected.trees = e.target.value; newTrees = e.target.value; changed(); });
  if (q('terrSel')) q('terrSel').addEventListener('change', e => { pushUndo(); selected.terrain = e.target.value; newTerrain = e.target.value; changed(); renderSide(); });
  if (q('kindSel')) q('kindSel').addEventListener('change', e => { pushUndo(); selected.kind = e.target.value; Object.assign(selected, Object.assign(defaultsFor(selected.kind), selected)); changed(); renderSide(); });
  if (q('toPoly')) q('toPoly').addEventListener('click', () => { pushUndo(); const p = ellipsePts(selected, 16).map(p => [Math.round(p[0]), Math.round(p[1])]); delete selected.cx; delete selected.cy; delete selected.rx; delete selected.ry; delete selected.rot; selected.shape = 'poly'; selected.pts = p; changed(); renderSide(); });
  if (q('dupBtn')) q('dupBtn').addEventListener('click', () => { pushUndo(); const c = JSON.parse(JSON.stringify(selected)); c.id = 's' + (uid++); if (c.shape === 'ellipse'){ c.cx += 40; c.cy += 40; } else c.pts = c.pts.map(p => [p[0] + 40, p[1] + 40]); data.shapes.push(c); selected = c; changed(); renderSide(); });
  if (q('delBtn')) q('delBtn').addEventListener('click', deleteSelected);
  if (q('vAdd')) q('vAdd').addEventListener('click', () => setVmode('add'));
  if (q('vDel')) q('vDel').addEventListener('click', () => setVmode('remove'));
  if (q('vDelActive')) q('vDelActive').addEventListener('click', () => removeVertex(activeVertex));
  const setStainColor = (hex) => { pushUndo(); selected.color = hex; lastStainColor = hex; changed(); renderSide(); };
  side.querySelectorAll('[data-sw]').forEach(b => b.addEventListener('click', () => setStainColor(b.dataset.sw)));
  side.querySelectorAll('[data-swdel]').forEach(b => b.addEventListener('click', () => { pushUndo(); data.palette.splice(+b.dataset.swdel, 1); changed(true); renderSide(); }));
  if (q('stCol')){ q('stCol').addEventListener('change', e => setStainColor(e.target.value));
    const fromRgb = () => setStainColor(rgbToHex(+q('stR').value, +q('stG').value, +q('stB').value)); ['stR', 'stG', 'stB'].forEach(id => q(id).addEventListener('change', fromRgb));
    q('stSave').addEventListener('click', () => { const nm = q('stName').value.trim() || selected.color; pushUndo(); if (!Array.isArray(data.palette)) data.palette = []; data.palette.push({name: nm, c: selected.color}); changed(true); renderSide(); toast('Колір додано в палітру'); }); }
  if (q('wallMode')) q('wallMode').addEventListener('change', e => { pushUndo(); selected.wallMode = e.target.value; changed(); });
  side.querySelectorAll('[data-ign]').forEach(c => c.addEventListener('change', () => { pushUndo(); selected.ignore = Object.assign({}, selected.ignore, {[c.dataset.ign]: c.checked}); changed(); }));
  if (q('zoneClear')) q('zoneClear').addEventListener('change', e => { pushUndo(); selected.clear = e.target.checked; changed(); });
  if (q('lineClear')) q('lineClear').addEventListener('change', e => { pushUndo(); selected.clear = e.target.checked; changed(); });
  if (q('routeSel')) q('routeSel').addEventListener('change', e => { pushUndo(); selected.kind = e.target.value; changed(); renderSide(); });
  if (q('taperChk')) q('taperChk').addEventListener('change', e => { pushUndo(); selected.taper = e.target.checked; changed(); });
  side.querySelectorAll('[data-gen]').forEach(b => b.addEventListener('click', () => { const t = b.dataset.gen, rs = selected; pushUndo(); busy.textContent = 'Генерую…'; busy.style.display = 'block';
    setTimeout(() => { let n = 0; try { n = (t === 'stream' ? genStreams : t === 'pond' ? genPonds : genMarsh)(rs, (Math.random()*1e6)|0); } catch (e) { console.error(e); } selected = rs; busy.textContent = 'Перемальовую…'; changed(); renderSide(); toast(n ? 'Згенеровано: ' + n : 'Нічого не вийшло — спробуйте більшу область або вищу густоту'); }, 30); }));
  side.querySelectorAll('[data-clr]').forEach(b => b.addEventListener('click', () => { pushUndo(); const rs = selected; clearGen(rs, b.dataset.clr); selected = rs; changed(); renderSide(); }));
  if (q('outChk')) q('outChk').addEventListener('change', e => { showOutlines = e.target.checked; if (!showOutlines){ selected = null; activeVertex = -1; vmode = null; } draw(); });
  side.querySelectorAll('[data-vis]').forEach(c => c.addEventListener('change', () => { const k = c.dataset.vis; visibleKinds[k] = c.checked; if (!c.checked){ if (selected && selected.kind === k){ selected = null; activeVertex = -1; vmode = null; } if (selObj && selObj.type === k){ selObj = null; } } draw(); }));
  renderMapSettings(); // після прив'язки повзунків панелі, щоб не прив'язати їх двічі
}

// ================= top buttons =================
document.getElementById('undo').addEventListener('click', undo);
document.getElementById('redo').addEventListener('click', redo);
document.getElementById('fit').addEventListener('click', fit);
document.getElementById('saveBtn').addEventListener('click', () => saveFile(false));
function toast(t){ const el = document.getElementById('toast'); el.textContent = t; el.style.display = 'block'; clearTimeout(el._t); el._t = setTimeout(() => el.style.display = 'none', 3200); }
function ask(text){ return new Promise(res => { const m = document.getElementById('confirmModal'); document.getElementById('confirmText').textContent = text; m.classList.add('open');
  const done = v => { m.classList.remove('open'); yes.onclick = no.onclick = null; res(v); }; const yes = document.getElementById('confirmYes'), no = document.getElementById('confirmNo'); yes.onclick = () => done(true); no.onclick = () => done(false); yes.focus(); }); }
const jm = document.getElementById('jsonModal');
document.getElementById('jsonBtn').addEventListener('click', () => { document.getElementById('jsonText').value = snapshot(); jm.classList.add('open'); });
document.getElementById('jsonClose').addEventListener('click', () => jm.classList.remove('open'));
document.getElementById('jsonCopy').addEventListener('click', async () => { try { await navigator.clipboard.writeText(document.getElementById('jsonText').value); toast('Скопійовано'); } catch (e) { document.getElementById('jsonText').select(); toast('Виділив текст — скопіюйте Ctrl+C'); } });
function loadJson(txt){ try { const d = JSON.parse(txt); if (!d.shapes || !Array.isArray(d.shapes)) throw new Error('немає shapes'); pushUndo(); restore(JSON.stringify(d)); jm.classList.remove('open'); toast('Завантажено'); } catch (e) { toast('Не схоже на JSON мапи: ' + e.message); } }
document.getElementById('jsonLoad').addEventListener('click', () => loadJson(document.getElementById('jsonText').value));
document.getElementById('jsonFile').addEventListener('change', async e => { const f = e.target.files[0]; if (f) loadJson(await f.text()); e.target.value = ''; });
document.getElementById('jsonReset').addEventListener('click', async () => { jm.classList.remove('open'); if (await ask('Скинути мапу до початкової версії? Поточні зміни можна буде повернути кнопкою «Назад».')){ pushUndo(); restore(DEFAULT_JSON); } });
let exportUI = false;
const exM = document.getElementById('exportModal');
function exUpdate(){ const r = data.exportRect; document.getElementById('exRectInfo').textContent = r ? `(${r.w}×${r.h})` : '(ще не виділена)'; document.getElementById('exRectRadio').disabled = !r;
  const area = document.querySelector('input[name=exArea]:checked').value, sc = +document.getElementById('exScale').value; const w = area === 'rect' && r ? r.w : W, h = area === 'rect' && r ? r.h : H;
  document.getElementById('exSize').textContent = `Розмір файлу: ${Math.round(w*sc)}×${Math.round(h*sc)} px.`; }
function openExport(rect){ exportUI = true; if (rect && data.exportRect) document.getElementById('exRectRadio').checked = true; exUpdate(); exM.classList.add('open'); draw(); }
function closeExport(){ exportUI = false; exM.classList.remove('open'); draw(); }
document.getElementById('exportBtn').addEventListener('click', () => openExport(false));
exM.addEventListener('change', exUpdate);
document.getElementById('exCancel').addEventListener('click', closeExport);
document.getElementById('exPick').addEventListener('click', () => { exM.classList.remove('open'); exportUI = true; setTool('exrect'); toast('Протягніть рамку на мапі'); draw(); });
function drawFrameRect(g, w, h, k){ g.save(); g.strokeStyle = INK; g.fillStyle = INK; const o = 18*k, i = 28*k; g.lineWidth = 3*k; g.strokeRect(o, o, w - 2*o, h - 2*o); g.lineWidth = 1*k; g.strokeRect(i, i, w - 2*i, h - 2*i);
  g.globalAlpha = .85; for (let x = i; x < w - i; x += 60*k){ g.fillRect(x, o, Math.min(30*k, w - i - x), 10*k); g.fillRect(x, h - i, Math.min(30*k, w - i - x), 10*k); } for (let y = i; y < h - i; y += 60*k){ g.fillRect(o, y, 10*k, Math.min(30*k, h - i - y)); g.fillRect(w - i, y, 10*k, Math.min(30*k, h - i - y)); } g.restore(); }
document.getElementById('exGo').addEventListener('click', async () => {
  const area = document.querySelector('input[name=exArea]:checked').value, sc = +document.getElementById('exScale').value, frame = document.getElementById('exFrame').checked;
  closeExport(); busy.textContent = 'Готую PNG…'; busy.style.display = 'block'; await new Promise(r => setTimeout(r, 30));
  try { const r = area === 'rect' ? data.exportRect : null; let out;
    if (!r){ out = renderMap(sc, true, !frame); }
    else { const full = renderMap(sc, true, true); out = layer(Math.round(r.w*sc), Math.round(r.h*sc)); const og = out.getContext('2d'); og.drawImage(full, Math.round(r.x*sc), Math.round(r.y*sc), out.width, out.height, 0, 0, out.width, out.height);
      const cw2 = out.width, ch2 = out.height, vg = og.createRadialGradient(cw2/2, ch2/2, 0, cw2/2, ch2/2, Math.hypot(cw2, ch2)*.55); vg.addColorStop(.62, 'rgba(107,63,18,0)'); vg.addColorStop(.9, 'rgba(107,63,18,.22)'); vg.addColorStop(1, 'rgba(74,42,10,.42)'); og.fillStyle = vg; og.fillRect(0, 0, cw2, ch2);
      if (frame) drawFrameRect(og, out.width, out.height, sc); }
    const blob = await new Promise(res => out.toBlob(res, 'image/png')); await dl.save({filename: fileSafe(mapName(data)) + (r ? L(' (фрагмент).png', ' (fragment).png') : '.png'), data: blob}); toast('PNG збережено'); }
  catch (e) { if (!(e && e.code === 'declined')) toast('Не вдалося експортувати: ' + (e && (e.message || e.code) || e)); }
  busy.style.display = 'none'; busy.textContent = 'Перемальовую…'; });

// ================= boot =================
// Коли ліва панель з'являється чи ховається, сцена зсувається — компенсуємо, щоб мапа не стрибала.
let stageLeft = stage.getBoundingClientRect().left;
new ResizeObserver(() => { const r = stage.getBoundingClientRect(); const dl = stageLeft == null ? 0 : r.left - stageLeft; stageLeft = r.left;
  resize(); if (dl){ vs.ox -= dl; draw(); } else if (autoFit) fit(); }).observe(stage);
setKind('mountain'); setTool('select'); updateUndo(); initLibraryUI(); initAI();
// мова: прапорець у куті перемикає українську / англійську; панелі перебудовуються, решту перекладає i18n.js
// Верхня панель: один рядок, якщо все вміщається; інакше переносимо (українські написи довші за англійські).
const barEl = document.querySelector('.bar');
function fitBar(){ barEl.classList.remove('wrap'); if (barEl.scrollWidth > barEl.clientWidth + 1) barEl.classList.add('wrap'); }
new ResizeObserver(fitBar).observe(document.body); window.addEventListener('langchange', () => requestAnimationFrame(fitBar));
function renderLangBtn(){ const b = document.getElementById('langBtn'); b.innerHTML = flagSvg(lang()) + '<span>' + (lang() === 'en' ? 'EN' : 'UA') + '</span>'; }
document.getElementById('langBtn').addEventListener('click', () => setLang(lang() === 'en' ? 'uk' : 'en'));
window.addEventListener('langchange', () => { renderLangBtn(); if (!currentMapId) data.name = L('Північ Крайтрену', 'Northern Kraitren'); // приклад за стартовим екраном ще не збережено
  renderSide(); updateTitle(); if (isOpen('libModal')) renderLibrary(); if (isOpen('newModal')){ renderTplGrid(); syncSizeSelect(); } if (isOpen('aiModal')) aiUpdateInfo(); if (aiPreview) aiRenderBar(); });
renderLangBtn();
resize(); fit(); renderSide(); scheduleRender(0);
if (document.fonts){ Promise.all(FONTS.map(([f]) => document.fonts.load(`36px "${f}"`).catch(() => {}))).then(() => draw()); }
initCaps();
if (lang() === 'en') setLang('en'); // перекласти вже наявну розмітку
// Режим знімків для довідки: ?shot=overview|brush|ai&lang=uk|en — без стартового екрана й без збереження (див. tools/help-shots.md).
const SHOT = new URLSearchParams(location.search).get('shot');
function setupShot(name){
  setLang(new URLSearchParams(location.search).get('lang') === 'en' ? 'en' : 'uk'); data.name = L('Північ Крайтрену', 'Northern Kraitren'); updateTitle(); setStatus(L('Збережено в браузері', 'Saved in browser'));
  if (name === 'overview'){ setTool('select'); selected = data.shapes.find(s => s.id === 's29'); renderSide(); setTimeout(fit, 150); }
  if (name === 'brush'){ setTool('brush'); setKind('terrain', 'snow'); brushOpts.size = 90; renderBrushOpts();
    setTimeout(() => { const r = stage.getBoundingClientRect(); autoFit = false; vs.scale = 1.05; vs.ox = r.width / 2 - 900 * vs.scale; vs.oy = r.height / 2 - 380 * vs.scale;
      brushStroke = {pts: [[640, 300], [720, 340], [820, 330], [920, 380], [1010, 400], [1090, 450]], r: 45, erase: false}; brushCursor = [1090, 450]; draw(); }, 150); }
  if (name === 'ai'){ const ops = [{op: 'transform', id: 's60', scale: 1.15}, {op: 'set', id: 's29', fields: {trees: 'broadleaf'}}, {op: 'add', shape: {kind: 'terrain', terrain: 'desert', shape: 'poly', pts: [[2080, 280], [2420, 250], [2470, 520], [2120, 560]]}}];
    const r = aiApply(data, ops); aiStartPreview(r.d, r.errors); setTimeout(() => { const l = document.getElementById('aiChanges'); if (l) l.hidden = false; }, 100); }
}
if (SHOT) setupShot(SHOT); else initStart();
