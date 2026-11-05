// 纯业务逻辑：剩余课时一律由记录推导（购买 + 赠送 + 调整 - 签到），因此撤销永远可靠。
import { state } from './store.js';
import { addDays, dowOf, inRange } from './util.js';

export const COLORS = {
  coral: { main: '#ff7a59', soft: '#ffe9e2', name: '珊瑚橙' },
  blue: { main: '#4a7bd8', soft: '#e8f0ff', name: '天空蓝' },
  purple: { main: '#8a63d2', soft: '#f0e8ff', name: '葡萄紫' },
  green: { main: '#2fa66a', soft: '#dcf5e6', name: '薄荷绿' },
  pink: { main: '#e8629a', soft: '#ffe3ef', name: '樱花粉' },
  amber: { main: '#d98e04', soft: '#fff1c9', name: '柠檬黄' },
  teal: { main: '#1fa5a0', soft: '#d9f4f2', name: '湖水青' },
};
export const AVATARS = ['#ffd6e0', '#d6e8ff', '#e4d9ff', '#fff1b8', '#c9f2ee', '#ffd9c2', '#dff5c8', '#f0d6ff'];

export const classById = id => state.settings.classes.find(c => c.id === id);
export const className = id => classById(id)?.name || '已删除班级';
export const classColor = id => COLORS[classById(id)?.color] || COLORS.coral;
export const studentById = id => state.students.find(s => s.id === id);
export const studentName = id => studentById(id)?.name || '已删除学生';
export function avatarColor(id) {
  let h = 0; for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATARS[h % AVATARS.length];
}
export const surname = name => (name || '?').trim().slice(0, 1) || '?';

export function computeStats() {
  const m = new Map();
  for (const s of state.students) m.set(s.id, { bought: 0, gift: 0, adj: 0, present: 0, leave: 0, paid: 0, remaining: 0 });
  for (const p of state.payments) { const x = m.get(p.studentId); if (x) { x.bought += +p.lessons || 0; x.gift += +p.gift || 0; x.paid += +p.amount || 0; } }
  for (const a of state.adjustments) { const x = m.get(a.studentId); if (x) x.adj += +a.delta || 0; }
  for (const a of state.attendance) { const x = m.get(a.studentId); if (x) { if (a.status === 'present') x.present++; else if (a.status === 'leave') x.leave++; } }
  for (const x of m.values()) x.remaining = x.bought + x.gift + x.adj - x.present;
  return m;
}
export const remainingOf = id => computeStats().get(id)?.remaining ?? 0;

export const sortedStudents = (classId) =>
  state.students.filter(s => !classId || classId === 'all' || s.classId === classId)
    .sort((a, b) => classOrder(a.classId) - classOrder(b.classId) || a.name.localeCompare(b.name, 'zh-Hans-CN'));
export const classOrder = id => { const i = state.settings.classes.findIndex(c => c.id === id); return i < 0 ? 999 : i; };

// ---- 点名 ----
export const attId = (studentId, date) => `${studentId}|${date}`;

export function rollStudents(classId, date) {
  const dayMap = new Map(state.attendance.filter(a => a.date === date).map(a => [a.studentId, a]));
  const list = state.students.filter(s => {
    const rec = dayMap.get(s.id);
    return rec ? (rec.classId || s.classId) === classId : s.classId === classId;
  }).sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'));
  return { list, dayMap };
}

// 未点 -> 已签到 -> 请假 -> 未点
export async function cycleAttendance(studentId, date, classId, store) {
  const id = attId(studentId, date);
  const cur = state.attendance.find(a => a.id === id);
  if (!cur) { await store.save('attendance', { id, studentId, date, classId, status: 'present', ts: Date.now() }); return 'present'; }
  if (cur.status === 'present') { await store.save('attendance', { ...cur, status: 'leave', ts: Date.now() }); return 'leave'; }
  await store.remove('attendance', id); return 'none';
}

// 默认点名班级与日期
export function weekdayClasses() { return state.settings.classes.filter(c => Number.isInteger(c.weekday)); }
export function classRecentDate(c, t) {
  if (!Number.isInteger(c.weekday)) return t;
  let d = t; for (let i = 0; i < 7 && dowOf(d) !== c.weekday; i++) d = addDays(d, -1);
  return d;
}
export function defaultRoll(t) {
  const classes = state.settings.classes; const wd = weekdayClasses();
  if (!wd.length) return { classId: classes[0].id, date: t };
  const hit = wd.find(c => c.weekday === dowOf(t));
  if (hit) return { classId: hit.id, date: t };
  const has = d => wd.some(c => c.weekday === dowOf(d));
  let d = t; for (let i = 0; i < 7; i++) { d = addDays(d, -1); if (has(d)) break; }
  let start = d; for (let i = 0; i < 7 && has(addDays(start, -1)) && addDays(start, -1) !== d; i++) start = addDays(start, -1);
  const c = wd.find(c => c.weekday === dowOf(start));
  return { classId: c.id, date: start };
}

// ---- 赠送规则 ----
export const giftFor = n => state.settings.giftRules.find(r => r.pack === n)?.gift ?? 0;
export const packChoices = () => [...new Set(state.settings.giftRules.map(r => r.pack))].sort((a, b) => a - b);
export const payText = p => `购买 ${p.lessons} 节` + (p.gift > 0 ? ` + 赠送 ${p.gift} 节` : '');

// ---- 汇总 ----
export function rangeStats(range, classId) {
  const students = sortedStudents(classId);
  const ids = new Set(students.map(s => s.id));
  const base = computeStats();
  const rows = students.map(s => ({ s, all: base.get(s.id), present: 0, leave: 0, paid: 0 }));
  const byId = new Map(rows.map(r => [r.s.id, r]));
  for (const a of state.attendance) { if (!ids.has(a.studentId) || !inRange(a.date, range)) continue; const r = byId.get(a.studentId); if (a.status === 'present') r.present++; else if (a.status === 'leave') r.leave++; }
  for (const p of state.payments) { if (!ids.has(p.studentId) || !inRange(p.date, range)) continue; byId.get(p.studentId).paid += +p.amount || 0; }
  const totals = rows.reduce((t, r) => ({ income: t.income + r.paid, taught: t.taught + r.present, leaves: t.leaves + r.leave, renew: t.renew + (r.all.remaining <= 2 ? 1 : 0) }), { income: 0, taught: 0, leaves: 0, renew: 0 });
  return { rows, totals };
}
