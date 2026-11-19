"use strict";
// Мови інтерфейсу: українська (основна, нею написані код і розмітка) та англійська.
// Англійська накладається поверх: словник EN (js/i18n-en.js, «точний український текст → переклад»)
// застосовується до тексту й атрибутів (title, placeholder, aria-label) усієї сторінки через MutationObserver,
// тож панелі, що будуються на льоту, перекладаються самі. Для рядків зі змінними — L('укр', 'eng').
// Підключається першим, до всіх інших скриптів.

const LANG_KEY = 'suzerain-lang';
let LANG = (() => { try { const v = localStorage.getItem(LANG_KEY); return v === 'en' || v === 'uk' ? v : null; } catch (e){ return null; } })(); // null — ще не обрано
const EN = {}, EN_PATTERNS = []; // заповнює i18n-en.js
const lang = () => LANG === 'en' ? 'en' : 'uk';
function L(uk, en){ return lang() === 'en' ? en : uk; }
const APP_NAME = () => L('Сюзерен: Безкоштовний Редактор Фентезі Мап', 'Suzerain: Free Fantasy Map Editor');
const APP_SHORT = () => L('Сюзерен', 'Suzerain');

// Переклад одного рядка: точний збіг → шаблони → частини через « · » / «: ».
function tr(s){
  if (lang() !== 'en' || s == null) return s; const str = String(s);
  const core = str.trim(); if (!core || !/[А-Яа-яІіЇїЄєҐґ]/.test(core)) return str;
  const wrap = v => str.slice(0, str.indexOf(core)) + v + str.slice(str.indexOf(core) + core.length);
  if (EN[core] != null) return wrap(EN[core]);
  for (const [re, f] of EN_PATTERNS){ const m = core.match(re); if (m) return wrap(typeof f === 'function' ? f(m) : f); }
  if (core.includes(' · ')) return wrap(core.split(' · ').map(p => tr(p)).join(' · '));
  const c = core.indexOf(': '); if (c > 0 && EN[core.slice(0, c)] != null) return wrap(EN[core.slice(0, c)] + ': ' + tr(core.slice(c + 2)));
  return str;
}

// ================= переклад DOM =================
const I18N_ATTRS = ['title', 'placeholder', 'aria-label'];
const i18nText = new WeakMap();   // текстовий вузол → {uk, out}
const i18nAttr = new WeakMap();   // елемент → {attr: {uk, out}}
const skipNode = el => !el || el.closest && el.closest('textarea, script, style, [data-noi18n]');
function i18nTextNode(n){ const p = n.parentElement; if (skipNode(p)) return;
  let rec = i18nText.get(n); const cur = n.nodeValue;
  if (!rec || cur !== rec.out){ if (!/[А-Яа-яІіЇїЄєҐґ]/.test(cur) && !rec) return; rec = {uk: cur}; }
  rec.out = lang() === 'en' ? tr(rec.uk) : rec.uk; i18nText.set(n, rec); if (cur !== rec.out) n.nodeValue = rec.out; }
// Атрибути полів вводу теж перекладаємо (підказки), їхній вміст — ні.
function i18nAttrs(el){ if (!el || el.closest('script, style, [data-noi18n]')) return; let map = i18nAttr.get(el);
  for (const a of I18N_ATTRS){ if (!el.hasAttribute(a)) continue; const cur = el.getAttribute(a); let rec = map && map[a];
    if (!rec || cur !== rec.out){ if (!/[А-Яа-яІіЇїЄєҐґ]/.test(cur) && !rec) continue; rec = {uk: cur}; }
    rec.out = lang() === 'en' ? tr(rec.uk) : rec.uk; if (!map) i18nAttr.set(el, map = {}); map[a] = rec; if (cur !== rec.out) el.setAttribute(a, rec.out); } }
function i18nWalk(root){ if (!root) return;
  if (root.nodeType === 3){ i18nTextNode(root); return; } if (root.nodeType !== 1) return;
  i18nAttrs(root); const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT); let n;
  while ((n = tw.nextNode())){ if (n.nodeType === 3) i18nTextNode(n); else i18nAttrs(n); } }
let i18nBusy = false;
const i18nObserver = new MutationObserver(list => { if (i18nBusy) return; i18nBusy = true;
  try { for (const m of list){ if (m.type === 'childList') m.addedNodes.forEach(i18nWalk); else if (m.type === 'characterData') i18nTextNode(m.target); else if (m.type === 'attributes') i18nAttrs(m.target); } }
  finally { i18nBusy = false; } });
i18nObserver.observe(document.documentElement, {subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: I18N_ATTRS});

// ================= перемикання мови =================
let flagSeq = 0;
function flagSvg(l){ if (l === 'uk') return '<svg class="flag" viewBox="0 0 3 2" aria-hidden="true"><rect width="3" height="1" fill="#0057b7"/><rect y="1" width="3" height="1" fill="#ffd700"/></svg>';
  const id = 'ukclip' + (++flagSeq);
  return `<svg class="flag" viewBox="0 0 60 30" aria-hidden="true"><clipPath id="${id}"><path d="M30,15h30v15zv15h-30zh-30v-15zv-15h30z"/></clipPath><path d="M0,0v30h60v-30z" fill="#012169"/><path d="M0,0L60,30M60,0L0,30" stroke="#fff" stroke-width="6"/><path d="M0,0L60,30M60,0L0,30" clip-path="url(#${id})" stroke="#C8102E" stroke-width="4"/><path d="M30,0v30M0,15h60" stroke="#fff" stroke-width="10"/><path d="M30,0v30M0,15h60" stroke="#C8102E" stroke-width="6"/></svg>`; }
function setLang(l){ LANG = l === 'en' ? 'en' : 'uk'; try { localStorage.setItem(LANG_KEY, LANG); } catch (e){}
  document.documentElement.lang = LANG; i18nBusy = true; try { i18nWalk(document.body); } finally { i18nBusy = false; }
  window.dispatchEvent(new Event('langchange')); }
document.documentElement.lang = lang();
