"use strict";
// Бібліотека мап у браузері (localStorage): список, відкриття, перейменування, копії, шаблони,
// нова мапа з шаблону й розміру, зміна меж мапи. Тут лише функції й обробники — запуск у ui.js (boot).

// ================= сховище =================
const LIB = 'suzerain-maps-v1:';
const LIB_INDEX = LIB + 'index', LIB_CUR = LIB + 'current', LIB_TPL = LIB + 'templates';
const libKey = id => LIB + 'map:' + id, thumbKey = id => LIB + 'thumb:' + id;
let currentMapId = null;
let quotaWarned = false;
function lsGet(k){ try { return localStorage.getItem(k); } catch (e) { return null; } }
function lsSet(k, v){ try { localStorage.setItem(k, v); return true; } catch (e) {
  if (!quotaWarned){ quotaWarned = true; toast('Сховище браузера переповнене. Збережіть мапу у файл (Ctrl+S) і видаліть непотрібні мапи.'); } return false; } }
function lsDel(k){ try { localStorage.removeItem(k); } catch (e) {} }
function libList(){ try { const l = JSON.parse(lsGet(LIB_INDEX) || '[]'); return Array.isArray(l) ? l : []; } catch (e) { return []; } }
function libSetList(l){ lsSet(LIB_INDEX, JSON.stringify(l)); }
function libGet(id){ try { return JSON.parse(lsGet(libKey(id))); } catch (e) { return null; } }
function libPut(id, d){
  const ok = lsSet(libKey(id), JSON.stringify(d)); if (!ok) return false;
  const l = libList(); let e = l.find(x => x.id === id); if (!e){ e = {id, created: Date.now()}; l.unshift(e); }
  e.name = mapName(d); e.W = d.W; e.H = d.H; e.updated = Date.now(); libSetList(l); return true; }
function libRemove(id){ lsDel(libKey(id)); lsDel(thumbKey(id)); libSetList(libList().filter(x => x.id !== id)); }
function newMapId(){ return 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
function mapName(d){ return (d && typeof d.name === 'string' && d.name.trim()) || 'Без назви'; }
function fileSafe(name){ return String(name).replace(/[\\/:*?"<>|]+/g, '').trim() || 'mapa'; }
function esc(s){ return String(s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'})[c]); }
function fmtDate(t){ try { return new Date(t).toLocaleString('uk-UA', {day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'}); } catch (e) { return ''; } }

// ================= автозбереження поточної мапи =================
let saveTimer = null;
function scheduleSave(){ clearTimeout(saveTimer); saveTimer = setTimeout(saveCurrent, 500); }
function saveCurrent(){ clearTimeout(saveTimer); saveTimer = null; if (currentMapId && libPut(currentMapId, data)) setStatus('Збережено в браузері'); }
function libThumb(img){ if (!currentMapId || !img) return; const tw = 240, th = Math.max(1, Math.round(tw * img.height / img.width));
  const c = layer(tw, th); c.getContext('2d').drawImage(img, 0, 0, tw, th); try { lsSet(thumbKey(currentMapId), c.toDataURL('image/jpeg', .72)); } catch (e) {} }
function updateTitle(){ const n = mapName(data); document.getElementById('mapTitleBtn').textContent = n; document.title = n + ' — Редактор мап'; }

// Завантажити дані як поточну мапу (без збереження попередньої — це робить виклик).
function loadMapData(d, id){
  currentMapId = id; lsSet(LIB_CUR, id);
  data = d; ensureIds();
  undoStack = []; redoStack = []; updateUndo(); selected = null; selObj = null; activeVertex = -1; drawing = null; mapImg = null;
  fileHandle = null; fileName = fileSafe(mapName(data)) + '.json';
  updateTitle(); fit(); scheduleRender(0); renderSide(); setStatus('Збережено в браузері');
}
function openMap(id){ if (id === currentMapId) return true; const d = libGet(id); if (!d || !Array.isArray(d.shapes)){ toast('Не вдалося прочитати цю мапу'); return false; }
  saveCurrent(); loadMapData(d, id); toast('Відкрито «' + mapName(d) + '»'); return true; }
function createMap(d){ saveCurrent(); const id = newMapId(); if (!libPut(id, d)) return false; loadMapData(d, id); return true; }
function initLibrary(){
  let list = libList();
  if (!list.length){ // перший запуск або перехід із версії, де була одна мапа в автозбереженні
    let d = null; try { const old = JSON.parse(lsGet(LS_KEY) || 'null'); if (old && old.json) d = JSON.parse(old.json); } catch (e) {}
    if (!d || !Array.isArray(d.shapes)) d = JSON.parse(DEFAULT_JSON);
    if (!d.name) d.name = 'Північ Крайтрену';
    const id = newMapId(); libPut(id, d); lsSet(LIB_CUR, id); list = libList();
    if (!list.length){ data.name = d.name; currentMapId = null; updateTitle(); fit(); scheduleRender(0); renderSide(); return; } // сховище недоступне
  }
  let id = lsGet(LIB_CUR); if (!list.some(x => x.id === id)) id = list[0].id;
  const d = libGet(id); loadMapData(d && Array.isArray(d.shapes) ? d : JSON.parse(DEFAULT_JSON), id);
}

// ================= зсув усіх координат (межі, шаблони) =================
function shiftData(d, dx, dy){ if (!dx && !dy) return;
  const mv = p => { const q = p.slice(); q[0] += dx; q[1] += dy; return q; };
  for (const s of d.shapes || []){ if (Array.isArray(s.pts)) s.pts = s.pts.map(mv); if (s.cx != null){ s.cx += dx; s.cy += dy; } }
  for (const o of (d.stamps || []).concat(d.texts || [])){ o.x += dx; o.y += dy; }
  if (d.compass){ d.compass.x += dx; d.compass.y += dy; }
  if (d.exportRect){ d.exportRect.x += dx; d.exportRect.y += dy; } }

// ================= модальні вікна: спільне =================
const MIN_SIDE = 400, MAX_SIDE = 8000;
function openModal(id){ document.getElementById(id).classList.add('open'); }
function closeModal(id){ document.getElementById(id).classList.remove('open'); }
function isOpen(id){ return document.getElementById(id).classList.contains('open'); }

// ================= «Мої мапи» =================
function openLibrary(){ saveCurrent(); renderLibrary(); openModal('libModal'); }
function renderLibrary(){
  const l = libList().slice().sort((a, b) => (b.updated || 0) - (a.updated || 0)); const el = document.getElementById('libList');
  if (!l.length){ el.innerHTML = `<p class="help" style="padding:0">Тут поки порожньо або сховище браузера недоступне.</p>`; return; }
  el.innerHTML = l.map(e => { const th = lsGet(thumbKey(e.id)); const cur = e.id === currentMapId;
    return `<div class="libitem${cur ? ' cur' : ''}" data-id="${esc(e.id)}">
      <button class="libthumb" data-act="open" title="Відкрити">${th ? `<img src="${esc(th)}" alt="">` : ''}</button>
      <div class="libinfo">
        <div class="libname"><button class="linklike" data-act="open">${esc(e.name)}</button></div>
        <div class="libmeta">${e.W}×${e.H} · ${fmtDate(e.updated)}${cur ? ' · <b>відкрита зараз</b>' : ''}</div>
        <div class="btns libacts"><button class="btn solid sm" data-act="rename">Перейменувати</button><button class="btn solid sm" data-act="dup">Копія</button><button class="btn solid sm" data-act="tpl">Як шаблон</button><button class="btn solid sm" data-act="file">У файл</button><button class="btn solid sm danger" data-act="del">Видалити</button></div>
      </div></div>`; }).join('');
}
function mapDataById(id){ return id === currentMapId ? JSON.parse(snapshot()) : libGet(id); }
function renameMap(id, name){ name = String(name || '').trim().slice(0, 120); if (!name) return;
  if (id === currentMapId){ data.name = name; fileName = fileSafe(name) + '.json'; saveCurrent(); updateTitle(); }
  else { const d = libGet(id); if (!d) return; d.name = name; libPut(id, d); }
  renderLibrary(); }
function startRename(item){ const id = item.dataset.id, e = libList().find(x => x.id === id); if (!e) return;
  const box = item.querySelector('.libname'); box.innerHTML = `<input type="text" class="txt" maxlength="120" aria-label="Нова назва мапи" value="${esc(e.name)}">`;
  const inp = box.querySelector('input'); inp.focus(); inp.select(); let done = false;
  const finish = ok => { if (done) return; done = true; if (ok) renameMap(id, inp.value); else renderLibrary(); };
  inp.addEventListener('keydown', ev => { if (ev.key === 'Enter'){ ev.preventDefault(); finish(true); } if (ev.key === 'Escape'){ ev.preventDefault(); ev.stopPropagation(); finish(false); } });
  inp.addEventListener('blur', () => finish(true)); }
function dupMap(id){ const d = mapDataById(id); if (!d) return; d.name = mapName(d) + ' (копія)'; const nid = newMapId();
  if (libPut(nid, d)){ const th = lsGet(thumbKey(id)); if (th) lsSet(thumbKey(nid), th); toast('Створено копію'); } renderLibrary(); }
async function deleteMap(id){ const e = libList().find(x => x.id === id); if (!e) return;
  if (!(await ask(`Видалити мапу «${e.name}» з цього браузера? Це не можна скасувати. Якщо вона ще знадобиться, спершу натисніть «У файл».`))) return;
  libRemove(id);
  if (id === currentMapId){ currentMapId = null; const l = libList(); if (l.length) openMap(l[0].id); else createMap(buildFromTemplate(MAP_TEMPLATES[0], 3200, 1513, 'Нова мапа')); }
  renderLibrary(); toast('Мапу видалено'); }
async function mapToFile(id){ const d = mapDataById(id); if (!d) return;
  try { await dl.save({filename: fileSafe(mapName(d)) + '.json', data: new Blob([JSON.stringify(d)], {type: 'application/json'})}); toast('Файл збережено'); }
  catch (e) { if (!(e && e.code === 'declined')) toast('Не вдалося зберегти файл'); } }

// ================= шаблони =================
function userTemplates(){ try { const t = JSON.parse(lsGet(LIB_TPL) || '[]'); return Array.isArray(t) ? t : []; } catch (e) { return []; } }
function allTemplates(){ return MAP_TEMPLATES.concat(userTemplates().map(t => Object.assign({own: true}, t))); }
function saveAsTemplate(id){ const d = mapDataById(id); if (!d) return; delete d.exportRect;
  const t = userTemplates(); t.push({id: 'u' + Date.now().toString(36), name: mapName(d), desc: `Ваш шаблон · ${d.W}×${d.H}`, data: d});
  if (lsSet(LIB_TPL, JSON.stringify(t))) toast('«' + mapName(d) + '» додано в шаблони нової мапи'); }
function deleteTemplate(id){ lsSet(LIB_TPL, JSON.stringify(userTemplates().filter(t => t.id !== id))); }
function buildFromTemplate(t, w, h, name){
  let d;
  if (t.make) d = t.make(w, h);
  else { d = JSON.parse(JSON.stringify(t.data)); d.W = d.W || 3200; d.H = d.H || 1513;
    if (d.W !== w || d.H !== h){ shiftData(d, Math.floor((w - d.W) / 2), Math.floor((h - d.H) / 2)); d.W = w; d.H = h; } }
  delete d.rev; d.name = name; return d; }

// ================= «Нова мапа» =================
const SIZE_PRESETS = [['3200x1513', '3200 × 1513 — як Крайтрен'], ['2400x1600', '2400 × 1600 — 3:2'], ['3000x2000', '3000 × 2000 — 3:2, більша'], ['2000x2000', '2000 × 2000 — квадрат'], ['4000x2400', '4000 × 2400 — велика'], ['2000x3000', '2000 × 3000 — вертикальна'], ['custom', 'Свій розмір…']];
let nmTpl = 'sea';
function openNewMap(){
  closeModal('libModal');
  const n = libList().length + 1; document.getElementById('nmName').value = 'Нова мапа ' + n;
  nmTpl = 'sea'; renderTplGrid(); syncSizeSelect(); openModal('newModal');
  const inp = document.getElementById('nmName'); inp.focus(); inp.select(); }
function renderTplGrid(){
  const ts = allTemplates(); if (!ts.some(t => t.id === nmTpl)) nmTpl = ts[0].id;
  document.getElementById('nmTpl').innerHTML = ts.map(t => `<div class="tplcard-wrap"><button class="tplcard" data-tpl="${esc(t.id)}" aria-pressed="${t.id === nmTpl}"><b>${esc(t.name)}</b><span>${esc(t.desc || '')}</span></button>${t.own ? `<button class="btn sm tpldel" data-tpldel="${esc(t.id)}" aria-label="Видалити шаблон ${esc(t.name)}" title="Видалити шаблон">×</button>` : ''}</div>`).join(''); }
function curTemplate(){ return allTemplates().find(t => t.id === nmTpl) || MAP_TEMPLATES[0]; }
function syncSizeSelect(){
  const t = curTemplate(), sel = document.getElementById('nmSize'), prev = sel.value;
  const opts = (t.data ? [['tpl', `Як у шаблоні — ${t.data.W} × ${t.data.H}`]] : []).concat(SIZE_PRESETS);
  sel.innerHTML = opts.map(([v, n]) => `<option value="${v}">${n}</option>`).join('');
  sel.value = t.data ? 'tpl' : (opts.some(o => o[0] === prev) && prev !== 'tpl' ? prev : '3200x1513'); syncCustom(); }
function nmSize(){ const v = document.getElementById('nmSize').value, t = curTemplate();
  if (v === 'tpl') return [t.data.W, t.data.H];
  if (v === 'custom') return [+document.getElementById('nmW').value, +document.getElementById('nmH').value];
  return v.split('x').map(Number); }
function syncCustom(){ const v = document.getElementById('nmSize').value; document.getElementById('nmCustom').style.display = v === 'custom' ? 'flex' : 'none';
  if (v !== 'custom'){ const [w, h] = nmSize(); document.getElementById('nmW').value = w; document.getElementById('nmH').value = h; }
  const t = curTemplate(), [w, h] = nmSize();
  document.getElementById('nmHint').textContent = t.data && (w !== t.data.W || h !== t.data.H) ? `Шаблон має розмір ${t.data.W}×${t.data.H}: його буде розширено або обрізано від центру.` : ''; }
function createFromDialog(){
  const name = document.getElementById('nmName').value.trim() || 'Нова мапа'; const [w, h] = nmSize().map(v => Math.round(v));
  if (!(w >= MIN_SIDE && h >= MIN_SIDE && w <= MAX_SIDE && h <= MAX_SIDE)){ toast(`Розмір має бути від ${MIN_SIDE} до ${MAX_SIDE} px з кожного боку`); return; }
  const d = buildFromTemplate(curTemplate(), w, h, name);
  if (createMap(d)){ closeModal('newModal'); toast('Створено «' + name + '»'); } }

// ================= межі мапи =================
let boundsPreview = null; // {l, t, r, b} — скільки додати (+) чи обрізати (−) з кожного боку
function openBounds(){ closeModal('mapModal'); boundsPreview = {l: 0, t: 0, r: 0, b: 0}; for (const k of ['l', 't', 'r', 'b']) document.getElementById('bd_' + k).value = 0;
  boundsInfo(); openModal('boundsModal'); autoFit = false; zoomOutForBounds(); }
function zoomOutForBounds(){ const r = stage.getBoundingClientRect(); const s = Math.min(r.width / (W*1.3), r.height / (H*1.3)); vs.scale = s; vs.ox = (r.width - W*s)/2; vs.oy = (r.height - H*s)/2; draw(); }
function readBounds(){ const v = k => Math.round(+document.getElementById('bd_' + k).value || 0); boundsPreview = {l: v('l'), t: v('t'), r: v('r'), b: v('b')}; boundsInfo(); draw(); }
function boundsInfo(){ const p = boundsPreview, nw = W + p.l + p.r, nh = H + p.t + p.b; const ok = nw >= MIN_SIDE && nh >= MIN_SIDE && nw <= MAX_SIDE && nh <= MAX_SIDE;
  document.getElementById('bdInfo').innerHTML = `Зараз <b>${W} × ${H}</b> → стане <b>${nw} × ${nh}</b>` + (ok ? '' : `<br><span style="color:#ff8a7a">Кожна сторона має бути від ${MIN_SIDE} до ${MAX_SIDE} px.</span>`);
  document.getElementById('bdApply').disabled = !ok || (!p.l && !p.t && !p.r && !p.b); }
function boundsQuick(k, delta){ const el = document.getElementById('bd_' + k); el.value = Math.round((+el.value || 0) + delta); readBounds(); }
function closeBounds(){ boundsPreview = null; closeModal('boundsModal'); fit(); }
function applyBounds(){ const p = boundsPreview; if (!p) return; const nw = W + p.l + p.r, nh = H + p.t + p.b;
  if (!(nw >= MIN_SIDE && nh >= MIN_SIDE && nw <= MAX_SIDE && nh <= MAX_SIDE)) return;
  pushUndo(); shiftData(data, p.l, p.t); data.W = nw; data.H = nh; ensureIds(); mapImg = null;
  boundsPreview = null; closeModal('boundsModal'); fit(); changed(); renderSide(); toast(`Нові межі: ${nw} × ${nh}`); }
// Прев'ю на сцені: нова площа світлим папером, те, що відріжеться, — затемнене.
function drawBoundsPreview(g, px){ const p = boundsPreview; if (!p) return;
  const nx = -p.l, ny = -p.t, nw = W + p.l + p.r, nh = H + p.t + p.b; const big = [-W*4, -H*4, W*9, H*9];
  g.save(); g.beginPath(); g.rect(nx, ny, nw, nh); g.clip(); g.beginPath(); g.rect(...big); g.rect(0, 0, W, H); g.fillStyle = 'rgba(226,203,148,.55)'; g.fill('evenodd'); g.restore();
  g.save(); g.beginPath(); g.rect(0, 0, W, H); g.clip(); g.beginPath(); g.rect(...big); g.rect(nx, ny, nw, nh); g.fillStyle = 'rgba(20,10,5,.6)'; g.fill('evenodd'); g.restore();
  g.setLineDash([12*px, 7*px]); g.strokeStyle = '#d39a4a'; g.lineWidth = 2.5*px; g.strokeRect(nx, ny, nw, nh); g.setLineDash([]); }

// ================= обробники (підключає boot у ui.js) =================
function initLibraryUI(){
  const $ = id => document.getElementById(id);
  $('libBtn').addEventListener('click', openLibrary);
  $('mapTitleBtn').addEventListener('click', openLibrary);
  $('libClose').addEventListener('click', () => closeModal('libModal'));
  $('libNew').addEventListener('click', openNewMap);
  $('libImport').addEventListener('click', () => { closeModal('libModal'); openFile(); });
  $('libList').addEventListener('click', e => { const b = e.target.closest('[data-act]'); if (!b) return; const item = b.closest('.libitem'), id = item.dataset.id;
    const act = b.dataset.act;
    if (act === 'open'){ if (openMap(id)) closeModal('libModal'); }
    else if (act === 'rename') startRename(item);
    else if (act === 'dup') dupMap(id);
    else if (act === 'tpl') saveAsTemplate(id);
    else if (act === 'file') mapToFile(id);
    else if (act === 'del') deleteMap(id); });
  $('nmTpl').addEventListener('click', async e => { const del = e.target.closest('[data-tpldel]');
    if (del){ const t = userTemplates().find(x => x.id === del.dataset.tpldel); if (t && await ask(`Видалити шаблон «${t.name}»? Мапи, створені з нього, залишаться.`)){ deleteTemplate(t.id); renderTplGrid(); syncSizeSelect(); } return; }
    const b = e.target.closest('[data-tpl]'); if (!b) return; nmTpl = b.dataset.tpl; renderTplGrid(); syncSizeSelect(); });
  $('nmSize').addEventListener('change', syncCustom); $('nmW').addEventListener('input', syncCustom); $('nmH').addEventListener('input', syncCustom);
  $('nmCancel').addEventListener('click', () => closeModal('newModal'));
  $('nmCreate').addEventListener('click', createFromDialog);
  $('nmName').addEventListener('keydown', e => { if (e.key === 'Enter') createFromDialog(); });
  $('boundsBtn').addEventListener('click', openBounds);
  for (const k of ['l', 't', 'r', 'b']) $('bd_' + k).addEventListener('input', readBounds);
  $('boundsModal').addEventListener('click', e => { const q = e.target.closest('[data-bq]'); if (q){ const [k, d] = q.dataset.bq.split(':'); boundsQuick(k, +d); } });
  $('bdReset').addEventListener('click', () => { for (const k of ['l', 't', 'r', 'b']) $('bd_' + k).value = 0; readBounds(); });
  $('bdCancel').addEventListener('click', closeBounds);
  $('bdApply').addEventListener('click', applyBounds);
  $('mapName').addEventListener('change', e => renameMap(currentMapId, e.target.value));
  for (const id of ['libModal', 'newModal']) $(id).addEventListener('click', e => { if (e.target.id === id) closeModal(id); });
  window.addEventListener('keydown', e => { if (e.key !== 'Escape') return;
    if (isOpen('confirmModal')) return;
    if (isOpen('newModal')){ e.stopImmediatePropagation(); closeModal('newModal'); }
    else if (isOpen('libModal')){ e.stopImmediatePropagation(); closeModal('libModal'); }
    else if (isOpen('boundsModal')){ e.stopImmediatePropagation(); closeBounds(); } }, true);
}
