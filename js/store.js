// 本地存储：IndexedDB（失败时退回 localStorage）。内存中保持完整状态，写入时同步持久化。
import { uid, todayStr } from './util.js';

const DB_NAME = 'diandianben-db';
const DB_VER = 1;
const LS_KEY = 'diandianben-state-v1';
const STORES = ['students', 'payments', 'attendance', 'adjustments', 'meta'];
export const SCHEMA = 1;

export const defaultSettings = () => ({
  id: 'settings',
  classes: [
    { id: 'c-sat', name: '周六班', color: 'coral', weekday: 6 },
    { id: 'c-sun', name: '周日班', color: 'blue', weekday: 0 },
  ],
  giftRules: [{ pack: 10, gift: 1 }, { pack: 20, gift: 3 }],
  semesterStart: '',
  semesterEnd: '',
  lastBackup: null,
  schemaVersion: SCHEMA,
});

export const state = { settings: defaultSettings(), students: [], payments: [], attendance: [], adjustments: [] };
export const info = { backend: 'idb', persisted: null };

let db = null;

function openDB() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in self)) return reject(new Error('no idb'));
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = () => {
      const d = req.result;
      for (const s of STORES) if (!d.objectStoreNames.contains(s)) d.createObjectStore(s, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('blocked'));
  });
}
const idbAll = (store) => new Promise((res, rej) => {
  const r = db.transaction(store, 'readonly').objectStore(store).getAll();
  r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
});
function idbApply(ops) {
  return new Promise((res, rej) => {
    const names = [...new Set(ops.map(o => o.store))];
    const t = db.transaction(names, 'readwrite');
    for (const o of ops) {
      const os = t.objectStore(o.store);
      if (o.op === 'put') os.put(o.obj);
      else if (o.op === 'del') os.delete(o.id);
      else if (o.op === 'clear') os.clear();
    }
    t.oncomplete = () => res(); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error || new Error('abort'));
  });
}
const lsDump = () => localStorage.setItem(LS_KEY, JSON.stringify(state));

export function normalizeSettings(s) {
  const d = defaultSettings();
  const out = { ...d, ...(s || {}), id: 'settings' };
  if (!Array.isArray(out.classes) || !out.classes.length) out.classes = d.classes;
  if (!Array.isArray(out.giftRules)) out.giftRules = d.giftRules;
  out.schemaVersion = SCHEMA;
  return out;
}

export async function init() {
  try {
    db = await openDB();
    const [students, payments, attendance, adjustments, meta] = await Promise.all(STORES.map(idbAll));
    Object.assign(state, { students, payments, attendance, adjustments });
    state.settings = normalizeSettings(meta.find(m => m.id === 'settings'));
    if (!meta.length) await idbApply([{ op: 'put', store: 'meta', obj: state.settings }]);
  } catch (e) {
    console.warn('IndexedDB 不可用，改用 localStorage', e);
    info.backend = 'ls'; db = null;
    try {
      const raw = JSON.parse(localStorage.getItem(LS_KEY) || 'null');
      if (raw) Object.assign(state, { students: raw.students || [], payments: raw.payments || [], attendance: raw.attendance || [], adjustments: raw.adjustments || [] }, { settings: normalizeSettings(raw.settings) });
    } catch { /* ignore */ }
  }
  try {
    if (navigator.storage?.persisted) info.persisted = await navigator.storage.persisted();
    if (navigator.storage?.persist && !info.persisted) info.persisted = await navigator.storage.persist();
  } catch { /* ignore */ }
}

async function apply(ops) {
  if (db) await idbApply(ops); else lsDump();
}
const arrOf = (store) => state[store];

// ---- 写入 API ----
export async function save(store, obj) {
  if (store === 'meta') { state.settings = obj; return apply([{ op: 'put', store: 'meta', obj }]); }
  const arr = arrOf(store); const i = arr.findIndex(x => x.id === obj.id);
  if (i >= 0) arr[i] = obj; else arr.push(obj);
  return apply([{ op: 'put', store, obj }]);
}
export async function saveSettings() { return save('meta', state.settings); }
export async function remove(store, id) {
  const arr = arrOf(store); const i = arr.findIndex(x => x.id === id);
  if (i >= 0) arr.splice(i, 1);
  return apply([{ op: 'del', store, id }]);
}
export async function bulk(ops) { // ops: [{op:'put'|'del', store, obj|id}]
  for (const o of ops) {
    if (o.store === 'meta') { if (o.op === 'put') state.settings = o.obj; continue; }
    const arr = arrOf(o.store);
    if (o.op === 'put') { const i = arr.findIndex(x => x.id === o.obj.id); if (i >= 0) arr[i] = o.obj; else arr.push(o.obj); }
    else if (o.op === 'del') { const i = arr.findIndex(x => x.id === o.id); if (i >= 0) arr.splice(i, 1); }
  }
  return apply(ops);
}
export async function replaceAll(data) {
  const next = {
    students: data.students || [], payments: data.payments || [], attendance: data.attendance || [],
    adjustments: data.adjustments || [], settings: normalizeSettings(data.settings),
  };
  const ops = [...STORES.map(s => ({ op: 'clear', store: s }))];
  for (const s of ['students', 'payments', 'attendance', 'adjustments']) for (const obj of next[s]) ops.push({ op: 'put', store: s, obj });
  ops.push({ op: 'put', store: 'meta', obj: next.settings });
  Object.assign(state, next);
  return apply(ops);
}
export async function clearAll() {
  const keepBackup = null;
  return replaceAll({ settings: { ...defaultSettings(), lastBackup: keepBackup } });
}
export const snapshot = () => JSON.parse(JSON.stringify({
  settings: state.settings, students: state.students, payments: state.payments,
  attendance: state.attendance, adjustments: state.adjustments,
}));
export const hasData = () => state.students.length + state.payments.length + state.attendance.length + state.adjustments.length > 0;
export { uid, todayStr };
