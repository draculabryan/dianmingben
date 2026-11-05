// 通用工具：日期、转义、格式化
export const pad = n => String(n).padStart(2, '0');
export const fmtDate = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseDate = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
export const todayStr = () => fmtDate(new Date());
export const addDays = (s, n) => { const d = parseDate(s); d.setDate(d.getDate() + n); return fmtDate(d); };
export const dowOf = s => parseDate(s).getDay();
export const WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
export const weekdayName = s => WEEK[dowOf(s)];
export const mdLabel = s => { const d = parseDate(s); return `${d.getMonth() + 1}月${d.getDate()}日`; };
export const ymdLabel = s => { const d = parseDate(s); return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`; };
export const shortDate = s => { const d = parseDate(s); const t = new Date(); return d.getFullYear() === t.getFullYear() ? mdLabel(s) : `${d.getFullYear()}年${mdLabel(s)}`; };
export const monthRange = (t = todayStr()) => {
  const d = parseDate(t);
  const from = fmtDate(new Date(d.getFullYear(), d.getMonth(), 1));
  const to = fmtDate(new Date(d.getFullYear(), d.getMonth() + 1, 0));
  return { from, to };
};
// 默认学期：春季 2/1–7/31，秋季 8/1–次年 1/31
export const defaultSemester = (t = todayStr()) => {
  const d = parseDate(t); const y = d.getFullYear(); const m = d.getMonth() + 1;
  if (m >= 2 && m <= 7) return { from: `${y}-02-01`, to: `${y}-07-31` };
  if (m >= 8) return { from: `${y}-08-01`, to: `${y + 1}-01-31` };
  return { from: `${y - 1}-08-01`, to: `${y}-01-31` };
};
export const inRange = (date, r) => !r || ((!r.from || date >= r.from) && (!r.to || date <= r.to));

export const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
export const money = n => {
  const v = Math.round((Number(n) || 0) * 100) / 100;
  return '¥' + v.toLocaleString('zh-CN', { maximumFractionDigits: 2 });
};
export const sleep = ms => new Promise(r => setTimeout(r, ms));
export const collator = new Intl.Collator('zh-Hans-CN');
