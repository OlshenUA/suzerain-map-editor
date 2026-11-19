"use strict";
// ШІ без ключів і без сервера. Користувач пише запит, копіює його разом з описом формату й мапою,
// дає будь-якому ШІ, вставляє відповідь. Редактор перевіряє блок «map-patch», застосовує його до копії
// й показує «до / після» з підсвіченими змінами. Зміни можна зберегти (один крок «Назад») або скинути.
// Формат описано в AI.md. Тут лише функції й обробники — запуск у ui.js (boot).

let aiPreview = null; // {before, after, beforeJson, imgBefore, imgAfter, showing, changes, errors}
const AI_COL = {add: '#5fd068', mod: '#ffb02e', del: '#ff5a4a'};

// ================= запит для ШІ =================
function aiDocUrl(){ try { return new URL('AI.md', location.href).href; } catch (e){ return 'AI.md'; } }
function aiObjBox(type, o){ return type === 'shape' ? bbox(shapePts(o)) : type === 'stamp' ? stampBox(o) : [o.x, o.y, o.x + o.w, o.y + o.h]; }
function aiObjName(type, o){
  if (type === 'shape') return o.kind === 'terrain' ? 'Ландшафт · ' + TERRAINS[terrainOf(o)].name : (KIND_NAME[o.kind] || o.kind);
  if (type === 'stamp') return 'Штамп · ' + (STAMPS[o.type] ? STAMPS[o.type].name : o.type) + (o.label ? ' «' + o.label + '»' : '');
  return 'Напис «' + String(o.text || '').split('\n')[0].slice(0, 30) + '»'; }
function aiSummaryLine(type, o){ const b = aiObjBox(type, o).map(v => Math.round(v));
  const extra = type === 'shape' ? `${o.kind}${o.terrain ? ':' + o.terrain : ''}${o.trees ? ':' + o.trees : ''} ${o.shape}${o.pts ? ' ' + o.pts.length + ' точок' : ''}` : type;
  return `${o.id}  ${extra}  межі [${b.join(', ')}]  — ${aiObjName(type, o)}`; }
function aiSpec(){
  const stamps = Object.entries(STAMPS).map(([k, v]) => `${k} (${v.name})`).join(', ');
  return `## Формат мапи
Координати в пікселях мапи: x праворуч, y вниз, (0,0) — лівий верхній кут. Мапа ${W} × ${H}.
shapes: [{id, kind, shape: 'poly'|'ellipse'|'line', pts: [[x,y],...] (або cx, cy, rx, ry, rot для овалу), ...параметри}]
- land — суша (берег згладжується; кути за межами мапи закріплюйте двома точками ~100 px від кута); lake — озеро
- mountain — гори: min 12–80, max 20–160, density 0.2–2
- forest — ліс: trees = ${Object.keys(TREE_TYPES).join(' | ')}; tree 6–24 (розмір), density 0.1–2
- terrain — ландшафт: terrain = ${Object.entries(TERRAINS).map(([k, v]) => `${k} (${v.name.toLowerCase()})`).join(', ')}; density 0.1–3; для hills size 12–70
- vill / town / fort — село / місто / фортеця: density, scale 0.4–3; село fields 0–3; місто й фортеця wall, wallMode = land | always | never
- stain — пляма: color #rrggbb, opacity 0.05–1, blur 0–40
- region — область генерації (не малюється)
- river (shape 'line') — річка: width 1–30 (до 4.5 — одна лінія), taper
- road / rail / path (shape 'line') — дорога / залізниця / пунктирний шлях: width 0.4–3
stamps: [{id, type, x, y, size, rot, label, labelSize}]; type = ${stamps}
texts: [{id, x, y, w, h, text, size, font, align, bg, italic, bold}]
settings: {scatter (0–3, окремі дерева), scatterTrees}

## Як відповісти
Коротко поясніть, що змінено, і дайте РІВНО ОДИН блок \`\`\`map-patch з JSON-масивом операцій. Не повертайте всю мапу.
- {"op":"transform","id":"s7","scale":1.2} — також scaleX, scaleY, dx, dy, rotate (градуси), origin [x,y] (типово центр фігури). Найкраще для «більше / менше / зсунь / поверни».
- {"op":"set","id":"s29","fields":{"trees":"broadleaf","density":1.4}} — замінити поля (і pts); id змінювати не можна.
- {"op":"add","shape":{"kind":"terrain","terrain":"snow","shape":"poly","pts":[[400,80],[1200,60],[1150,380]]}} — також "stamp":{...} чи "text":{...}; id не потрібен.
- {"op":"delete","id":"s1941"}
- {"op":"map","fields":{"name":"…","seed":7,"settings":{"scatter":1.5}}}
Полігони замкнені самі собою. Повний опис: ${aiDocUrl()}`;
}
function aiBuildPrompt(request, scope){
  const r = stage.getBoundingClientRect(); const a = toWorld(0, 0), b = toWorld(r.width, r.height);
  const view = [a[0], a[1], b[0], b[1]].map((v, i) => Math.round(Math.max(0, Math.min(i % 2 ? H : W, v))));
  const sel = selected ? [['shape', selected]] : selObj ? [[selObj.type === 'text' ? 'text' : 'stamp', selObj.o]] : [];
  let t = `Ти допомагаєш редагувати фентезі-мапу в редакторі «${mapName(data)}» (чорнило на пергаменті). Зміни мапу за запитом користувача.\n\n`;
  t += `## Запит користувача\n${request.trim() || '(запит не вказано)'}\n\n`;
  t += `## Контекст\n- Мапа: «${mapName(data)}», ${W} × ${H} px.\n- На екрані зараз видно область [${view.join(', ')}] (x0, y0, x1, y1).\n`;
  t += sel.length ? `- Вибрано: ${sel.map(([ty, o]) => aiSummaryLine(ty, o)).join('; ')}. Слова «це», «ця суша», «тут» стосуються вибраного.\n` : '- Нічого не вибрано.\n';
  t += '\n' + aiSpec() + '\n\n';
  if (scope === 'summary'){
    const lines = []; for (const s of data.shapes) lines.push(aiSummaryLine('shape', s)); for (const s of data.stamps || []) lines.push(aiSummaryLine('stamp', s)); for (const s of data.texts || []) lines.push(aiSummaryLine('text', s));
    t += `## Мапа (зведення: id, тип, межі [x0, y0, x1, y1])\n${lines.join('\n')}\n\nsettings: ${JSON.stringify(data.settings || {})}\n`;
    if (sel.length) t += `\n## Вибране повністю\n\`\`\`json\n${JSON.stringify(sel.map(s => s[1]))}\n\`\`\`\n`;
  } else t += `## Мапа (JSON)\n\`\`\`json\n${snapshot()}\n\`\`\`\n`;
  return t;
}

// ================= розбір відповіді =================
function aiExtract(text){
  const src = String(text || ''); const blocks = [...src.matchAll(/```([\w-]*)[^\n]*\n([\s\S]*?)```/g)];
  const pick = blocks.find(b => b[1].toLowerCase() === 'map-patch') || blocks.find(b => /json/i.test(b[1])) || blocks[0];
  const tryParse = s => { try { return JSON.parse(s); } catch (e){ return undefined; } };
  let v = pick ? tryParse(pick[2].trim()) : tryParse(src.trim());
  if (v === undefined){ const i = src.search(/[\[{]/), j = Math.max(src.lastIndexOf(']'), src.lastIndexOf('}')); if (i >= 0 && j > i) v = tryParse(src.slice(i, j + 1)); }
  if (v === undefined) throw new Error('не знайшов JSON. Потрібен блок ```map-patch з масивом операцій.');
  if (Array.isArray(v)) return {ops: v};
  if (v && Array.isArray(v.ops)) return {ops: v.ops};
  if (v && Array.isArray(v.shapes)) return {full: v};
  if (v && typeof v.op === 'string') return {ops: [v]};
  throw new Error('JSON не схожий ні на список операцій, ні на мапу.');
}
const aiNum = v => typeof v === 'number' && isFinite(v);
function aiPts(p, min){ if (!Array.isArray(p) || p.length < min) throw new Error(`pts: потрібно щонайменше ${min} точки [x, y]`);
  return p.map(q => { if (!Array.isArray(q) || !aiNum(+q[0]) || !aiNum(+q[1])) throw new Error('pts: кожна точка має бути [x, y] з числами'); return [Math.round(+q[0] * 10) / 10, Math.round(+q[1] * 10) / 10]; }); }
function aiCheckShape(s){
  if (!KIND_NAME[s.kind] || s.kind === 'marsh') throw new Error(`невідомий kind «${s.kind}»`);
  if (s.kind === 'terrain' && !TERRAINS[s.terrain]) throw new Error(`невідомий terrain «${s.terrain}»`);
  if (s.trees != null && !TREE_TYPES[s.trees]) throw new Error(`невідомий вид дерев «${s.trees}»`);
  const line = isLineKind(s.kind);
  if (line){ s.shape = 'line'; s.pts = aiPts(s.pts, 2); }
  else if (s.shape === 'ellipse'){ for (const k of ['cx', 'cy', 'rx', 'ry']) if (!aiNum(s[k])) throw new Error(`овалу потрібне число ${k}`); s.rot = aiNum(s.rot) ? s.rot : 0; delete s.pts; }
  else { s.shape = 'poly'; s.pts = aiPts(s.pts, 3); }
  for (const [k, v] of Object.entries(s)) if (typeof v === 'number' && !isFinite(v)) throw new Error(`${k}: не число`);
  return s; }
function aiCheckStamp(o){ if (!STAMPS[o.type]) throw new Error(`невідомий тип штампа «${o.type}»`); if (!aiNum(o.x) || !aiNum(o.y)) throw new Error('штампу потрібні x і y'); return o; }
function aiCheckText(o){ if (!aiNum(o.x) || !aiNum(o.y)) throw new Error('напису потрібні x і y'); o.text = String(o.text ?? ''); return o; }
// Перетворення точки: масштаб і поворот навколо origin, потім зсув.
function aiXf(op, origin){ const sx = op.scaleX ?? op.scale ?? 1, sy = op.scaleY ?? op.scale ?? 1, a = (op.rotate || 0) * Math.PI / 180, c = Math.cos(a), s = Math.sin(a), dx = op.dx || 0, dy = op.dy || 0;
  for (const v of [sx, sy, a, dx, dy]) if (!aiNum(v)) throw new Error('transform: scale / dx / dy / rotate мають бути числами');
  if (sx <= 0 || sy <= 0 || sx > 20 || sy > 20) throw new Error('transform: масштаб має бути між 0 і 20');
  const f = p => { const x = (p[0] - origin[0]) * sx, y = (p[1] - origin[1]) * sy; return [Math.round((origin[0] + x * c - y * s + dx) * 10) / 10, Math.round((origin[1] + x * s + y * c + dy) * 10) / 10]; };
  return {f, sx, sy, a}; }
function aiApply(base, ops){
  const d = JSON.parse(JSON.stringify(base)); d.stamps = d.stamps || []; d.texts = d.texts || []; const errors = [];
  const find = id => { for (const [type, arr] of [['shape', d.shapes], ['stamp', d.stamps], ['text', d.texts]]){ const i = arr.findIndex(o => o.id === id); if (i >= 0) return {type, arr, i, o: arr[i]}; } throw new Error(`немає об'єкта з id «${id}»`); };
  ops.forEach((op, n) => { try {
    if (!op || typeof op !== 'object') throw new Error('операція має бути об’єктом');
    if (op.op === 'transform'){ const t = find(op.id); const b = aiObjBox(t.type, t.o); const origin = Array.isArray(op.origin) ? op.origin.map(Number) : [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
      const {f, sx, sy, a} = aiXf(op, origin); const o = t.o;
      if (t.type === 'shape'){ if (o.shape === 'ellipse'){ [o.cx, o.cy] = f([o.cx, o.cy]); o.rx = Math.round(o.rx * sx); o.ry = Math.round(o.ry * sy); o.rot = (o.rot || 0) + a; } else o.pts = o.pts.map(f); }
      else if (t.type === 'stamp'){ [o.x, o.y] = f([o.x, o.y]).map(Math.round); o.size = Math.max(10, Math.round(o.size * Math.sqrt(sx * sy))); if (o.type !== 'compass') o.rot = Math.round((o.rot || 0) + (op.rotate || 0)); }
      else { const cx = o.x + o.w / 2, cy = o.y + o.h / 2; const [nx, ny] = f([cx, cy]); o.w = Math.round(o.w * sx); o.h = Math.round(o.h * sy); o.x = Math.round(nx - o.w / 2); o.y = Math.round(ny - o.h / 2); } }
    else if (op.op === 'set'){ const t = find(op.id); const fl = op.fields; if (!fl || typeof fl !== 'object') throw new Error('set: потрібне поле fields');
      const c = Object.assign({}, t.o, fl, {id: t.o.id}); t.arr[t.i] = t.type === 'shape' ? aiCheckShape(c) : t.type === 'stamp' ? aiCheckStamp(c) : aiCheckText(c); }
    else if (op.op === 'add'){
      if (op.shape){ const s = aiCheckShape(Object.assign({}, op.shape)); const full = Object.assign({}, defaultsFor(s.kind), s, {id: 's' + (uid++)}); d.shapes.push(full); }
      else if (op.stamp){ const s = aiCheckStamp(Object.assign({}, op.stamp)); d.stamps.push(Object.assign({size: STAMPS[s.type].size, rot: 0, label: '', labelSize: 22}, s, {id: 'd' + (uid++)})); }
      else if (op.text){ const s = aiCheckText(Object.assign({}, op.text)); d.texts.push(Object.assign({w: 360, h: 80, size: 36, font: 'Kurale', align: 'center', bg: false, italic: false, spacing: 0, lineH: 1.2}, s, {id: 'd' + (uid++)})); }
      else throw new Error('add: потрібне shape, stamp або text'); }
    else if (op.op === 'delete'){ const t = find(op.id); t.arr.splice(t.i, 1); }
    else if (op.op === 'map'){ const fl = op.fields || {};
      if (fl.name != null) d.name = String(fl.name).slice(0, 120); if (fl.seed != null){ if (!aiNum(fl.seed)) throw new Error('seed: не число'); d.seed = fl.seed | 0; }
      if (fl.settings){ if (fl.settings.scatterTrees != null && !TREE_TYPES[fl.settings.scatterTrees]) throw new Error('невідомий scatterTrees'); d.settings = Object.assign({}, d.settings, fl.settings); } }
    else throw new Error(`невідома операція «${op.op}»`);
  } catch (e){ errors.push(`Операція ${n + 1}${op && op.op ? ' (' + op.op + (op.id ? ' ' + op.id : '') + ')' : ''}: ${e.message}`); } });
  return {d, errors}; }
function aiFromFull(base, m){ const errors = []; const d = JSON.parse(JSON.stringify(m)); d.W = d.W || base.W; d.H = d.H || base.H; d.name = d.name || base.name; d.v = d.v || base.v;
  d.shapes = d.shapes.filter((s, i) => { try { aiCheckShape(s); if (!s.id) s.id = 's' + (uid++); return true; } catch (e){ errors.push(`Фігура ${i + 1}: ${e.message}`); return false; } });
  d.stamps = (d.stamps || []).filter(o => { try { aiCheckStamp(o); if (!o.id) o.id = 'd' + (uid++); return true; } catch (e){ errors.push(`Штамп: ${e.message}`); return false; } });
  d.texts = (d.texts || []).filter(o => { try { aiCheckText(o); if (!o.id) o.id = 'd' + (uid++); return true; } catch (e){ errors.push(`Напис: ${e.message}`); return false; } });
  return {d, errors}; }
function aiDiff(a, b){ const ch = [];
  for (const [type, A, B] of [['shape', a.shapes, b.shapes], ['stamp', a.stamps || [], b.stamps || []], ['text', a.texts || [], b.texts || []]]){
    const mA = new Map(A.map(o => [o.id, o])), mB = new Map(B.map(o => [o.id, o]));
    for (const [id, o] of mB){ const p = mA.get(id); if (!p) ch.push({kind: 'add', type, id, after: o}); else if (JSON.stringify(p) !== JSON.stringify(o)) ch.push({kind: 'mod', type, id, before: p, after: o}); }
    for (const [id, o] of mA) if (!mB.has(id)) ch.push({kind: 'del', type, id, before: o}); }
  const meta = x => JSON.stringify([x.name, x.seed, x.settings]); if (meta(a) !== meta(b)) ch.push({kind: 'mod', type: 'map', id: 'map'});
  return ch; }

// ================= перегляд «до / після» =================
function aiStartPreview(after, errors){
  saveCurrent(); const beforeJson = snapshot(); const before = data;
  busy.textContent = 'Готую порівняння…'; busy.style.display = 'block';
  setTimeout(() => {
    let imgAfter, imgBefore;
    try { data = after; ensureIds(); imgAfter = renderMap(1); } finally { data = before; ensureIds(); }
    imgBefore = mapImg || renderMap(1);
    busy.style.display = 'none'; busy.textContent = 'Перемальовую…';
    const changes = aiDiff(before, after);
    aiPreview = {before, after, beforeJson, imgBefore, imgAfter, showing: 'after', changes, errors};
    selected = null; selObj = null; activeVertex = -1; setTool('select'); closeModal('aiModal');
    document.body.classList.add('ai-preview'); aiRenderBar(); aiShow('after'); renderSide();
    if (!changes.length) toast('ШІ нічого не змінив' + (errors.length ? ' — див. помилки' : ''));
  }, 30); }
function aiShow(which){ const p = aiPreview; if (!p) return; p.showing = which; data = which === 'after' ? p.after : p.before; applyMapSize(); mapImg = which === 'after' ? p.imgAfter : p.imgBefore;
  for (const b of document.querySelectorAll('[data-ai]')) b.setAttribute('aria-pressed', String(b.dataset.ai === which)); draw(); }
function aiEnd(){ aiPreview = null; document.body.classList.remove('ai-preview'); document.getElementById('aiBar').hidden = true; renderSide(); draw(); }
function aiCommit(){ const p = aiPreview; if (!p) return; aiShow('after'); undoStack.push(p.beforeJson); if (undoStack.length > 80) undoStack.shift(); redoStack = []; updateUndo();
  aiEnd(); updateTitle(); changed(true); toast('Зміни ШІ збережено. Скасувати — «Назад»'); }
function aiDiscard(){ if (!aiPreview) return; aiShow('before'); aiEnd(); toast('Зміни ШІ скинуто'); }
function aiRenderBar(){ const p = aiPreview, bar = document.getElementById('aiBar'); bar.hidden = false;
  const n = k => p.changes.filter(c => c.kind === k).length;
  document.getElementById('aiCount').innerHTML = [['mod', 'змінено'], ['add', 'додано'], ['del', 'видалено']].filter(([k]) => n(k)).map(([k, t]) => `<span class="aidot" style="background:${AI_COL[k]}"></span>${n(k)} ${t}`).join(' ') || 'змін немає';
  const list = document.getElementById('aiChanges');
  list.innerHTML = p.changes.map((c, i) => { const o = c.after || c.before; const name = c.type === 'map' ? 'Параметри мапи' : aiObjName(c.type, o);
    return `<button class="btn aichg" data-chg="${i}"><span class="aidot" style="background:${AI_COL[c.kind]}"></span>${esc(name)} <span class="aiid">${esc(c.id)}</span></button>`; }).join('')
    + (p.errors.length ? `<div class="aierr"><b>Пропущено (${p.errors.length}):</b><br>${p.errors.map(esc).join('<br>')}</div>` : '');
  list.hidden = !(p.errors.length || p.changes.length <= 6); }
// Наблизити вигляд до зміни.
function aiFocus(c){ if (c.type === 'map') return; const o = (aiPreview.showing === 'after' ? c.after : c.before) || c.after || c.before; const b = aiObjBox(c.type, o);
  const r = stage.getBoundingClientRect(); const w = Math.max(80, b[2] - b[0]), h = Math.max(80, b[3] - b[1]); const s = Math.min(4, Math.min(r.width / w, r.height / h) * .6);
  autoFit = false; vs.scale = s; vs.ox = r.width / 2 - (b[0] + b[2]) / 2 * s; vs.oy = r.height / 2 - (b[1] + b[3]) / 2 * s; draw(); }
// Підсвічування змін на сцені (викликається з draw()).
function drawAIHighlights(g, px){
  const p = aiPreview; if (!p) return; const t = performance.now() / 1000;
  for (const c of p.changes){ if (c.type === 'map') continue;
    const cur = p.showing === 'after' ? c.after : c.before; const ghost = !cur; const o = cur || c.after || c.before; const col = AI_COL[c.kind];
    g.save(); g.strokeStyle = col; g.lineJoin = 'round'; g.shadowColor = col; g.shadowBlur = 10; if (ghost) g.setLineDash([8 * px, 6 * px]);
    if (c.type === 'shape'){ g.lineWidth = 3 * px; g.stroke(pathOf(shapePts(o), o.shape !== 'line')); }
    else { const b = aiObjBox(c.type, o); g.lineWidth = 2.5 * px; g.strokeRect(b[0], b[1], b[2] - b[0], b[3] - b[1]); }
    g.restore();
    // кільце-маркер, щоб дрібні зміни було видно й на віддаленні
    const b = aiObjBox(c.type, o); const cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2; const rr = Math.max(Math.hypot(b[2] - b[0], b[3] - b[1]) / 2 + 6 * px, 18 * px);
    g.beginPath(); g.arc(cx, cy, rr, 0, Math.PI * 2); g.setLineDash([4 * px, 5 * px]); g.lineDashOffset = -t * 20 * px; g.strokeStyle = col; g.globalAlpha = .7; g.lineWidth = 1.5 * px; g.stroke(); g.setLineDash([]); g.globalAlpha = 1; } }

// ================= вікно «ШІ» =================
function aiUpdateInfo(){ const scope = document.getElementById('aiScope').value; const txt = aiBuildPrompt(document.getElementById('aiReq').value, scope);
  const sel = selected ? aiObjName('shape', selected) + ' (' + selected.id + ')' : selObj ? aiObjName(selObj.type === 'text' ? 'text' : 'stamp', selObj.o) : '';
  document.getElementById('aiInfo').textContent = `${sel ? 'Вибрано: ' + sel + '. ' : 'Нічого не вибрано — можна вибрати фігуру на мапі, поки вікно відкрите. '}Обсяг ≈ ${Math.round(txt.length / 1000)} тис. символів (~${Math.round(txt.length / 3.2 / 1000)} тис. токенів).`;
  return txt; }
function aiOpen(){ if (aiPreview) return; openModal('aiModal'); aiUpdateInfo(); document.getElementById('aiErr').textContent = ''; document.getElementById('aiReq').focus(); }
function initAI(){
  const $ = id => document.getElementById(id);
  $('aiBtn').addEventListener('click', () => isOpen('aiModal') ? closeModal('aiModal') : aiOpen());
  $('aiClose').addEventListener('click', () => closeModal('aiModal'));
  $('aiReq').addEventListener('input', aiUpdateInfo); $('aiScope').addEventListener('change', aiUpdateInfo);
  $('aiCopy').addEventListener('click', async () => { const txt = aiUpdateInfo();
    try { await navigator.clipboard.writeText(txt); toast('Скопійовано. Вставте в чат ШІ, а відповідь — у поле нижче'); }
    catch (e){ const ta = $('aiAns'); const old = ta.value; ta.value = txt; ta.select(); document.execCommand && document.execCommand('copy'); ta.value = old; toast('Скопійовано'); } });
  $('aiFile').addEventListener('click', async () => { try { await dl.save({filename: fileSafe(mapName(data)) + ' — запит для ШІ.md', data: new Blob([aiUpdateInfo()], {type: 'text/markdown'})}); } catch (e){} });
  $('aiPreviewBtn').addEventListener('click', () => { const err = $('aiErr'); err.textContent = '';
    try { const x = aiExtract($('aiAns').value); const r = x.full ? aiFromFull(data, x.full) : aiApply(data, x.ops);
      if (!aiDiff(data, r.d).length && r.errors.length){ err.innerHTML = 'Жодна операція не застосувалась:<br>' + r.errors.map(esc).join('<br>'); return; }
      aiStartPreview(r.d, r.errors); }
    catch (e){ err.textContent = 'Не вдалося прочитати відповідь: ' + e.message; } });
  $('aiBar').addEventListener('click', e => { const b = e.target.closest('[data-ai]'); if (b) aiShow(b.dataset.ai);
    const c = e.target.closest('[data-chg]'); if (c) aiFocus(aiPreview.changes[+c.dataset.chg]); });
  $('aiList').addEventListener('click', () => { const l = $('aiChanges'); l.hidden = !l.hidden; });
  $('aiSave').addEventListener('click', aiCommit); $('aiDiscard').addEventListener('click', aiDiscard);
  // під час перегляду: лише рух мапою й перемикання «до / після» (C)
  const inField = e => !!(e.target && e.target.matches && e.target.matches('input,textarea,select'));
  window.addEventListener('keydown', e => { if (!aiPreview || inField(e)) return;
    if (e.key.toLowerCase() === 'c' && !e.ctrlKey && !e.metaKey){ aiShow(aiPreview.showing === 'after' ? 'before' : 'after'); }
    if (e.key !== 'F1') { e.preventDefault(); e.stopImmediatePropagation(); } }, true);
  window.addEventListener('keydown', e => { if (e.key === 'Escape' && isOpen('aiModal') && !(e.target && e.target.matches && e.target.matches('textarea'))){ e.stopImmediatePropagation(); closeModal('aiModal'); } }, true);
  // анімація кілець-маркерів
  const tick = () => { if (aiPreview) draw(); setTimeout(() => requestAnimationFrame(tick), 60); }; tick();
}
