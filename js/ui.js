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
const visibleKinds = {land: true, lake: true, mountain: true, forest: true, marsh: true, river: true, region: true, vill: true, town: true, fort: true, road: true, rail: true, path: true, stain: true, stamp: true, text: true};
function draw(){
  const g = vctx; g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, view.width, view.height);
  g.setTransform(dpr*vs.scale, 0, 0, dpr*vs.scale, dpr*vs.ox, dpr*vs.oy);
  if (mapImg){ g.imageSmoothingQuality = 'high'; g.drawImage(mapImg, 0, 0, W, H); } else { g.fillStyle = PAPER; g.fillRect(0, 0, W, H); }
  const px = 1 / vs.scale;
  // outlines
  if (showOutlines) for (const s of data.shapes){ if (!visibleKinds[s.kind]) continue; if (s === selected) continue; outline(g, s, px, false); }
  if (selected){ outline(g, selected, px, true); drawGhost(g, px); }
  drawDecor(g);
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
  const col = s.kind === 'stain' ? (s.color || KIND_COLOR.stain) : KIND_COLOR[s.kind]; const pts = shapePts(s); const closed = s.shape !== 'line';
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
function scheduleRender(delay){ clearTimeout(renderTimer); busy.style.display = 'block'; renderTimer = setTimeout(() => { requestAnimationFrame(() => { try { mapImg = renderMap(1); } catch (e) { console.error(e); } busy.style.display = 'none'; draw(); }); }, delay ?? 300); }

// ================= history & persistence =================
let undoStack = [], redoStack = [];
function snapshot(){ return JSON.stringify(data); }
function pushUndo(){ undoStack.push(snapshot()); if (undoStack.length > 80) undoStack.shift(); redoStack = []; updateUndo(); }
function updateUndo(){ document.getElementById('undo').disabled = !undoStack.length; document.getElementById('redo').disabled = !redoStack.length; }
function restore(json){ const selId = selected && selected.id; selObj = null; data = JSON.parse(json); ensureIds(); selected = data.shapes.find(s => s.id === selId) || null; activeVertex = -1; changed(); renderSide(); }
function undo(){ if (!undoStack.length) return; redoStack.push(snapshot()); restore(undoStack.pop()); updateUndo(); }
function redo(){ if (!redoStack.length) return; undoStack.push(snapshot()); restore(redoStack.pop()); updateUndo(); }
let dirty = false; let draftTimer = null;
function setStatus(t){ document.getElementById('status').textContent = t; }
function changed(noRender){ dirty = true; setStatus('Є незбережені зміни'); if (!noRender) scheduleRender(); draw();
  clearTimeout(draftTimer); draftTimer = setTimeout(() => { try { localStorage.setItem(LS_KEY, JSON.stringify({at: Date.now(), json: snapshot()})); } catch (e) {} }, 600); }

// ---- local file persistence (standalone build) ----
let fileHandle = null, fileName = 'kraitren-north.json';
const FS_API = 'showSaveFilePicker' in window;
// download helper used by PNG export; same contract as the old Claude "downloads" capability
const dl = { async save({filename, data}){ const ext = filename.split('.').pop();
  if (FS_API){ try { const h = await window.showSaveFilePicker({suggestedName: filename, types: [{description: ext.toUpperCase(), accept: {[ext === 'png' ? 'image/png' : 'application/json']: ['.' + ext]}}]});
      const w = await h.createWritable(); await w.write(data); await w.close(); return {status: 'saved'}; } catch (e) { if (e && e.name === 'AbortError') throw {code: 'declined'}; } }
  const blob = data instanceof Blob ? data : new Blob([data]); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000); return {status: 'saved'}; } };
function markSaved(){ dirty = false; setStatus('Збережено: ' + fileName); try { localStorage.setItem(LS_KEY, JSON.stringify({at: Date.now(), json: snapshot(), file: fileName, saved: true})); } catch (e) {} }
async function saveFile(as){ const json = JSON.stringify(data);
  try {
    if (FS_API){ if (!fileHandle || as){ fileHandle = await window.showSaveFilePicker({suggestedName: fileName, types: [{description: 'Мапа (JSON)', accept: {'application/json': ['.json']}}]}); fileName = fileHandle.name; }
      const w = await fileHandle.createWritable(); await w.write(json); await w.close(); markSaved(); toast('Збережено у ' + fileName); return; }
    await dl.save({filename: fileName, data: new Blob([json], {type: 'application/json'})}); markSaved(); toast('Файл мапи завантажено');
  } catch (e) { if (e && (e.name === 'AbortError' || e.code === 'declined')) return; console.error(e); toast('Не вдалося зберегти: ' + (e && e.message || e)); }
}
async function openFile(){
  if (dirty && !(await ask('Є незбережені зміни. Відкрити інший файл усе одно?'))) return;
  try {
    if ('showOpenFilePicker' in window){ const [h] = await window.showOpenFilePicker({types: [{description: 'Мапа (JSON)', accept: {'application/json': ['.json']}}]}); const f = await h.getFile(); loadMapText(await f.text(), f.name); fileHandle = h; return; }
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json,application/json'; inp.onchange = async () => { const f = inp.files[0]; if (f){ loadMapText(await f.text(), f.name); fileHandle = null; } }; inp.click();
  } catch (e) { if (e && e.name === 'AbortError') return; toast('Не вдалося відкрити: ' + (e && e.message || e)); }
}
function loadMapText(txt, name){ try { const d = JSON.parse(txt); if (!d.shapes || !Array.isArray(d.shapes)) throw new Error('у файлі немає shapes'); undoStack = []; redoStack = []; updateUndo();
  data = d; ensureIds(); selected = null; selObj = null; fileName = name || fileName; scheduleRender(0); renderSide(); draw(); markSaved(); toast('Відкрито ' + fileName); } catch (e) { toast('Це не схоже на файл мапи: ' + e.message); } }
async function newMap(){ if (dirty && !(await ask('Є незбережені зміни. Почати нову мапу (з початкової)?'))) return; undoStack = []; redoStack = []; updateUndo(); fileHandle = null; fileName = 'nova-mapa.json'; data = JSON.parse(DEFAULT_JSON); ensureIds(); selected = null; selObj = null; scheduleRender(0); renderSide(); changed(); }
async function initCaps(){
  let draft = null; try { draft = JSON.parse(localStorage.getItem(LS_KEY) || 'null'); } catch (e) {}
  if (draft && draft.json){ try { data = JSON.parse(draft.json); ensureIds(); if (draft.file) fileName = draft.file; dirty = !draft.saved; toast(draft.saved ? 'Відкрито останню мапу' : 'Відновлено автозбереження'); } catch (e) {} }
  setStatus(dirty ? 'Є незбережені зміни' : (draft ? 'Збережено: ' + fileName : 'Нова мапа'));
  renderSide(); scheduleRender(0);
}
window.addEventListener('beforeunload', e => { if (dirty){ e.preventDefault(); e.returnValue = ''; } });
window.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's'){ e.preventDefault(); saveFile(e.shiftKey); } if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'o'){ e.preventDefault(); openFile(); } });

// ================= tools / interaction =================
let tool = 'select', newKind = 'mountain', newStamp = 'house', newRoute = 'road';
document.getElementById('routeBar').addEventListener('click', e => { const b = e.target.closest('[data-route]'); if (!b) return; newRoute = b.dataset.route; for (const c of document.getElementById('routeBar').children) c.setAttribute('aria-pressed', String(c.dataset.route === newRoute)); });
(function(){ const sb = document.getElementById('stampsBar'); sb.innerHTML = Object.entries(STAMPS).map(([k, v]) => `<button class="btn" data-stamp="${k}" aria-pressed="${k === 'house'}">${v.name}</button>`).join('');
  sb.addEventListener('click', e => { const b = e.target.closest('[data-stamp]'); if (!b) return; newStamp = b.dataset.stamp; for (const c of sb.children) c.setAttribute('aria-pressed', String(c.dataset.stamp === newStamp)); }); })();
const toolsEl = document.getElementById('tools'), kindsEl = document.getElementById('kinds');
function setTool(t){ tool = t; drawing = null; const rb = document.getElementById('routeBar'); if (rb) rb.style.display = t === 'route' ? '' : 'none'; const sb = document.getElementById('stampsBar'); if (sb) sb.style.display = t === 'stamp' ? '' : 'none'; for (const b of toolsEl.children) b.setAttribute('aria-pressed', String(b.dataset.tool === t)); kindsEl.style.display = (t === 'poly' || t === 'ellipse') ? '' : 'none'; view.style.cursor = t === 'select' ? 'default' : 'crosshair'; draw(); }
function setKind(k){ newKind = k; for (const b of kindsEl.children) b.setAttribute('aria-pressed', String(b.dataset.kind === k)); }
toolsEl.addEventListener('click', e => { const b = e.target.closest('[data-tool]'); if (b) setTool(b.dataset.tool); });
kindsEl.addEventListener('click', e => { const b = e.target.closest('[data-kind]'); if (b) setKind(b.dataset.kind); });

const HIT_ORDER = ['road', 'rail', 'path', 'river', 'fort', 'town', 'vill', 'mountain', 'marsh', 'forest', 'stain', 'lake', 'region', 'land'];
function hitShape(x, y){ const tol = 8 / vs.scale; if (!showOutlines) return null;
  for (const k of HIT_ORDER){ if (!visibleKinds[k]) continue; const list = data.shapes.filter(s => s.kind === k);
    for (let i = list.length - 1; i >= 0; i--){ const s = list[i];
      if (k === 'river'){ if (polyEdgeDist(x, y, s.pts, false) < Math.max(tol, (s.width||3)/2 + 3)) return s; }
      else if (ROUTE_KINDS.includes(k)){ if (polyEdgeDist(x, y, s.pts, false) < Math.max(tol, 5)) return s; }
      else if (inside(s, x, y)) return s; } }
  return null; }
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
  if (tool === 'poly' || tool === 'river' || tool === 'route'){
    if (!drawing) drawing = {type: 'poly', kind: tool === 'river' ? 'river' : tool === 'route' ? newRoute : newKind, pts: []};
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
  else if ((tool === 'river' || tool === 'route') && !drag){ snapLinePoint(tool === 'river' ? 'river' : newRoute, x, y, null, e.shiftKey); draw(); }
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
  if (d.type === 'pan' && !d.moved && tool === 'select'){ /* click on empty selects nothing */ const [sx, sy] = pos(e); const [x, y] = toWorld(sx, sy); const h = hitShape(x, y); if (!h && (selected || selObj) && !vmode){ selected = null; selObj = null; activeVertex = -1; renderSide(); draw(); } }
  if (d.type === 'exrect'){ const b = drawing && drawing.b; if (b && b[2] > 20 && b[3] > 20){ data.exportRect = {x: Math.round(b[0]), y: Math.round(b[1]), w: Math.round(b[2]), h: Math.round(b[3])}; changed(true); } drawing = null; setTool('select'); openExport(true); return; }
  if (d.type === 'textbox'){ let b = drawing && drawing.b; if (!b || b[2] < 30 / vs.scale || b[3] < 15 / vs.scale) b = [drawing.x0 - 180, drawing.y0 - 40, 360, 80];
    pushUndo(); const t = {id: 'd' + (uid++), x: Math.round(b[0]), y: Math.round(b[1]), w: Math.round(b[2]), h: Math.round(b[3]), text: 'Новий напис', size: 36, font: 'Kurale', align: 'center', bg: false, italic: false, spacing: 0};
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
function defaultsFor(k){ if (k === 'mountain') return {min: 28, max: 90, density: 1}; if (k === 'forest') return {tree: 11, density: 1}; if (k === 'marsh') return {density: 1}; if (k === 'road' || k === 'rail' || k === 'path') return {width: 1}; if (k === 'stain') return {color: lastStainColor, opacity: .45, blur: 8, rough: 1.2, edge: .5, grain: .4, drops: 6}; if (k === 'vill') return {density: 1, fields: 1}; if (k === 'town') return {density: 1, wall: 5}; if (k === 'fort') return {density: 1, wall: 7}; if (k === 'region') return {streams: 1, ponds: 1, marsh: 1, pull: 1}; if (k === 'river') return {width: lastRiverWidth}; return {}; }
let lastRiverWidth = 3; let lastStainColor = '#2f6b3a';
function finishPoly(){ if (!drawing) return; const pts = drawing.pts; const min = isLineKind(drawing.kind) ? 2 : 3;
  // dblclick adds duplicate points: drop near-duplicates
  const clean = []; for (const p of pts){ const l = clean[clean.length - 1]; if (!l || Math.hypot(l[0] - p[0], l[1] - p[1]) > 2) clean.push(p); }
  if (clean.length >= min){ pushUndo(); const s = Object.assign({id: 's' + (uid++), kind: drawing.kind, shape: isLineKind(drawing.kind) ? 'line' : 'poly', pts: clean}, defaultsFor(drawing.kind)); data.shapes.push(s); selected = s; changed(); }
  drawing = null; snapMark = null; setTool('select'); renderSide(); draw(); }
view.addEventListener('wheel', e => { e.preventDefault(); const [sx, sy] = pos(e); const f = Math.exp(-e.deltaY * (e.ctrlKey ? .01 : .0015)); const ns = Math.min(4, Math.max(.08, vs.scale * f));
  autoFit = false; const [wx, wy] = toWorld(sx, sy); vs.scale = ns; vs.ox = sx - wx*ns; vs.oy = sy - wy*ns; draw(); }, {passive: false});
// ================= help dialog =================
const helpM = document.getElementById('helpModal');
function toggleHelp(open){ helpM.classList.toggle('open', open ?? !helpM.classList.contains('open')); if (helpM.classList.contains('open')) { document.getElementById('helpClose').focus({preventScroll: true}); helpM.querySelector('.card').scrollTop = 0; } }
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
  if (!e.ctrlKey && !e.metaKey){ const m = {v: 'select', p: 'poly', o: 'ellipse', r: 'river', s: 'stamp', t: 'text', d: 'route'}[e.key.toLowerCase()]; if (m && !drawing) setTool(m); }
});
window.addEventListener('keyup', e => { if (e.code === 'Space') spaceDown = false; if (e.key === 'Alt' && ghost && vmode !== 'add'){ ghost = null; snapMark = null; draw(); } });
function deleteSelected(){ if (selObj){ pushUndo(); const o = selObj.o; data.stamps = data.stamps.filter(x => x !== o); data.texts = data.texts.filter(x => x !== o); selObj = null; changed(); renderSide(); return; } if (!selected) return; vmode = null; ghost = null; pushUndo(); data.shapes = data.shapes.filter(s => s !== selected); selected = null; activeVertex = -1; changed(); renderSide(); }

// ================= side panel =================
const side = document.getElementById('side');
function slider(label, key, min, max, step, obj, onSet){ const id = 'f_' + key; const v = obj[key];
  return `<div class="row"><label for="${id}">${label} <output id="${id}_o">${v}</output></label><input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${v}" data-key="${key}"></div>`; }
function renderDecorSide(){
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
  side.querySelectorAll('input[type=range]').forEach(inp => { inp.addEventListener('pointerdown', () => pushUndo()); inp.addEventListener('input', () => { o[inp.dataset.key] = +inp.value; document.getElementById(inp.id + '_o').textContent = inp.value; changed(so.type === 'text' && !o.bg); }); });
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
function renderSide(){
  if (selObj){ renderDecorSide(); return; }
  let h = '';
  if (selected){ const s = selected; h += `<div class="kindtag"><span class="dot" style="background:${KIND_COLOR[s.kind]}"></span>${KIND_NAME[s.kind]}${s.shape === 'ellipse' ? ' · овал' : s.shape === 'poly' ? ' · полігон' : ''}</div>`;
    if (s.shape === 'line') h += `<label class="check"><input type="checkbox" id="lineClear" ${s.clear !== false ? 'checked' : ''}> Прибирати дерева, гори й сніг уздовж</label>`;
    if (ROUTE_KINDS.includes(s.kind)){ h += `<div class="row"><label for="routeSel">Вид</label><select id="routeSel">${ROUTE_KINDS.map(k => `<option value="${k}" ${k === s.kind ? 'selected' : ''}>${KIND_NAME[k]}</option>`).join('')}</select></div>` + slider('Товщина', 'width', .4, 3, .05, s); }
    if (s.shape !== 'line'){ h += `<div class="row"><label for="kindSel">Тип зони</label><select id="kindSel">${['land','lake','mountain','forest','marsh','stain','vill','town','fort','region'].map(k => `<option value="${k}" ${k === s.kind ? 'selected' : ''}>${KIND_NAME[k]}</option>`).join('')}</select></div>`; }
    if (s.kind === 'mountain'){ h += slider('Найменші гори', 'min', 12, 80, 1, s) + slider('Найбільші гори', 'max', 20, 160, 1, s) + slider('Щільність', 'density', .2, 2, .05, s); }
    if (s.kind === 'forest'){ h += slider('Розмір дерев', 'tree', 6, 24, .5, s) + slider('Щільність', 'density', .1, 2, .05, s); }
    if (s.kind === 'stain'){ const [r0, g0, b0] = hexToRgb(s.color); const pal = INK_PRESETS.concat((data.palette || []).map(p => Object.assign({own: true}, p)));
      h += `<h2>Колір</h2><div class="btns" style="gap:6px;margin-bottom:8px">${pal.map((p, i) => `<span style="display:inline-flex;align-items:center"><button class="btn solid" data-sw="${p.c}" title="${p.name} ${p.c}" aria-label="${p.name}" aria-pressed="${p.c.toLowerCase() === (s.color || '').toLowerCase()}" style="width:44px;padding:0;background:${p.c};border:2px solid ${p.c.toLowerCase() === (s.color || '').toLowerCase() ? '#fff' : 'transparent'}"></button>${p.own ? `<button class="btn" data-swdel="${i - INK_PRESETS.length}" aria-label="Видалити ${p.name} з палітри" style="min-height:28px;padding:0 6px">×</button>` : ''}</span>`).join('')}</div>`;
      h += `<div class="row"><label for="stCol">Свій колір</label><div class="btns" style="align-items:flex-end"><input type="color" id="stCol" value="${s.color}" style="width:56px;height:36px;padding:2px;background:var(--panel2);border:1px solid var(--line);border-radius:6px">
        <label style="display:flex;flex-direction:column;font-size:11px;color:var(--muted)">R<input type="number" id="stR" min="0" max="255" value="${r0}" style="width:62px"></label><label style="display:flex;flex-direction:column;font-size:11px;color:var(--muted)">G<input type="number" id="stG" min="0" max="255" value="${g0}" style="width:62px"></label><label style="display:flex;flex-direction:column;font-size:11px;color:var(--muted)">B<input type="number" id="stB" min="0" max="255" value="${b0}" style="width:62px"></label></div></div>`;
      h += `<div class="row"><label for="stName">Зберегти колір у палітру</label><div class="btns" style="flex-wrap:nowrap"><input type="text" id="stName" placeholder="Назва, напр. «Гравці»" style="background:var(--panel2);border:1px solid var(--line);border-radius:6px;padding:7px 9px;min-height:36px;flex:1;width:auto"><button class="btn solid" id="stSave">Зберегти</button></div></div>`;
      h += `<h2>Вигляд плями</h2>` + slider('Насиченість', 'opacity', .05, 1, .01, s) + slider('Розмитість', 'blur', 0, 40, .5, s) + slider('Нерівність краю', 'rough', 0, 4, .05, s) + slider('Темний обідок', 'edge', 0, 1, .01, s) + slider('Зернистість', 'grain', 0, 1, .01, s) + slider('Бризки', 'drops', 0, 40, 1, s);
    }
    if (s.kind === 'marsh'){ h += slider('Щільність очерету', 'density', .1, 2.5, .05, s); }
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
    const st = data.settings || (data.settings = {}); if (st.wetStreams == null) st.wetStreams = 1; if (st.wetPonds == null) st.wetPonds = 1;
    h += `<h2>Мапа</h2>`;
    h += `<div class="row"><label for="seedIn">Варіант розкладки (seed)</label><div class="btns" style="flex-wrap:nowrap"><input type="number" id="seedIn" value="${data.seed}"><button class="btn solid" id="seedNew">Інший</button></div></div>`;
    h += slider('Розсип окремих дерев', 'scatter', 0, 3, .05, st) + slider('Снігові позначки', 'snow', 0, 2, .05, st);
    const nGen = data.shapes.filter(x => x.gen === 'wet').length;
    if (nGen) h += `<div class="btns" style="margin-bottom:8px"><button class="btn solid" id="wetClear">Прибрати стару автогенерацію (${nGen})</button></div>`;
    h += `<h2>Контури й вибір</h2><label class="check"><input type="checkbox" id="outChk" ${showOutlines ? 'checked' : ''}> Показувати контури</label>`;
    h += `<div class="vis">` + ['land','lake','mountain','forest','marsh','river','road','rail','path','stain','vill','town','fort','region'].map(k => `<label class="check"><input type="checkbox" data-vis="${k}" ${visibleKinds[k] ? 'checked' : ''}><span class="dot" style="background:${KIND_COLOR[k]}"></span>${KIND_NAME[k]}</label>`).join('') + [['stamp', 'Штампи'], ['text', 'Написи']].map(([k, n]) => `<label class="check"><input type="checkbox" data-vis="${k}" ${visibleKinds[k] ? 'checked' : ''}><span class="dot" style="background:#d39a4a"></span>${n}</label>`).join('') + `</div>`;
    h += `<p class="help" style="padding:0;margin-top:10px">Як користуватися — кнопка <b>?</b> угорі або <kbd>F1</kbd>.</p>`;
  }
  side.innerHTML = h;
  side.querySelectorAll('input[type=range]').forEach(inp => {
    const obj = selected || data.settings;
    inp.addEventListener('pointerdown', () => pushUndo(), {once: false});
    inp.addEventListener('keydown', () => { if (!inp._u){ pushUndo(); inp._u = 1; } });
    inp.addEventListener('input', () => { obj[inp.dataset.key] = +inp.value; document.getElementById(inp.id + '_o').textContent = inp.value; if (selected && selected.kind === 'river') lastRiverWidth = +inp.value; changed(); });
  });
  const q = id => document.getElementById(id);
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
  if (q('seedIn')) q('seedIn').addEventListener('change', e => { pushUndo(); data.seed = (+e.target.value) | 0; changed(); });
  if (q('seedNew')) q('seedNew').addEventListener('click', () => { pushUndo(); data.seed = (Math.random()*100000) | 0; changed(); renderSide(); });
  side.querySelectorAll('[data-gen]').forEach(b => b.addEventListener('click', () => { const t = b.dataset.gen, rs = selected; pushUndo(); busy.textContent = 'Генерую…'; busy.style.display = 'block';
    setTimeout(() => { let n = 0; try { n = (t === 'stream' ? genStreams : t === 'pond' ? genPonds : genMarsh)(rs, (Math.random()*1e6)|0); } catch (e) { console.error(e); } selected = rs; busy.textContent = 'Перемальовую…'; changed(); renderSide(); toast(n ? 'Згенеровано: ' + n : 'Нічого не вийшло — спробуйте більшу область або вищу густоту'); }, 30); }));
  side.querySelectorAll('[data-clr]').forEach(b => b.addEventListener('click', () => { pushUndo(); const rs = selected; clearGen(rs, b.dataset.clr); selected = rs; changed(); renderSide(); }));
  if (q('wetClear')) q('wetClear').addEventListener('click', () => { pushUndo(); data.shapes = data.shapes.filter(x => x.gen !== 'wet'); if (selected && selected.gen === 'wet') selected = null; changed(); renderSide(); });
  if (q('outChk')) q('outChk').addEventListener('change', e => { showOutlines = e.target.checked; if (!showOutlines){ selected = null; activeVertex = -1; vmode = null; } draw(); });
  side.querySelectorAll('[data-vis]').forEach(c => c.addEventListener('change', () => { const k = c.dataset.vis; visibleKinds[k] = c.checked; if (!c.checked){ if (selected && selected.kind === k){ selected = null; activeVertex = -1; vmode = null; } if (selObj && selObj.type === k){ selObj = null; } } draw(); }));
}

// ================= top buttons =================
document.getElementById('undo').addEventListener('click', undo);
document.getElementById('redo').addEventListener('click', redo);
document.getElementById('fit').addEventListener('click', fit);
document.getElementById('saveBtn').addEventListener('click', () => saveFile(false));
document.getElementById('openBtn').addEventListener('click', openFile);
document.getElementById('newBtn').addEventListener('click', newMap);
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
    const blob = await new Promise(res => out.toBlob(res, 'image/png')); await dl.save({filename: r ? 'pivnich-kraitren-fragment.png' : 'pivnich-kraitren.png', data: blob}); toast('PNG збережено'); }
  catch (e) { if (!(e && e.code === 'declined')) toast('Не вдалося експортувати: ' + (e && (e.message || e.code) || e)); }
  busy.style.display = 'none'; busy.textContent = 'Перемальовую…'; });

// ================= boot =================
new ResizeObserver(() => { resize(); if (autoFit) fit(); }).observe(stage);
setKind('mountain'); setTool('select'); updateUndo();
resize(); fit(); renderSide(); scheduleRender(0);
if (document.fonts){ Promise.all(FONTS.map(([f]) => document.fonts.load(`36px "${f}"`).catch(() => {}))).then(() => draw()); }
initCaps();
