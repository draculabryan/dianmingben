// Excel 导出、JSON 备份与恢复
import { state, snapshot, SCHEMA } from './store.js';
import { computeStats, className, studentById, payText } from './logic.js';
import { weekdayName, todayStr } from './util.js';

let xlsxPromise = null;
export function loadXLSX() {
  if (self.XLSX) return Promise.resolve(self.XLSX);
  if (!xlsxPromise) xlsxPromise = new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'vendor/xlsx.full.min.js';
    s.onload = () => res(self.XLSX);
    s.onerror = () => { xlsxPromise = null; rej(new Error('无法加载 Excel 组件')); };
    document.head.appendChild(s);
  });
  return xlsxPromise;
}

export function buildSheets() {
  const stats = computeStats();
  const sName = id => studentById(id)?.name || '已删除学生';
  const sClass = (a) => a.classId ? className(a.classId) : className(studentById(a.studentId)?.classId);
  const byDateStudent = (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : sName(a.studentId).localeCompare(sName(b.studentId), 'zh-Hans-CN'));
  const sheets = {};
  sheets['学生汇总'] = [['姓名', '班级', '家长电话', '备注', '剩余课时', '累计购买课时', '累计赠送课时', '课时调整合计', '已上课节数', '请假次数', '累计缴费(元)'],
    ...state.students.slice().sort((a, b) => a.classId.localeCompare(b.classId) || a.name.localeCompare(b.name, 'zh-Hans-CN')).map(s => {
      const x = stats.get(s.id);
      return [s.name, className(s.classId), s.phone || '', s.note || '', x.remaining, x.bought, x.gift, x.adj, x.present, x.leave, x.paid];
    })];
  sheets['上课记录'] = [['日期', '星期', '班级', '学生', '状态', '扣减课时'],
    ...state.attendance.filter(a => a.status === 'present').sort(byDateStudent).map(a => [a.date, weekdayName(a.date), sClass(a), sName(a.studentId), '已签到', 1])];
  sheets['请假记录'] = [['日期', '星期', '班级', '学生', '状态'],
    ...state.attendance.filter(a => a.status === 'leave').sort(byDateStudent).map(a => [a.date, weekdayName(a.date), sClass(a), sName(a.studentId), '请假'])];
  sheets['缴费记录'] = [['日期', '学生', '班级', '购买课时', '赠送课时', '合计课时', '金额(元)', '说明', '备注'],
    ...state.payments.slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.ts - b.ts)).map(p => [p.date, sName(p.studentId), className(studentById(p.studentId)?.classId), p.lessons, p.gift || 0, (p.lessons || 0) + (p.gift || 0), p.amount, payText(p), p.note || ''])];
  sheets['课时调整'] = [['日期', '学生', '班级', '调整节数', '原因'],
    ...state.adjustments.slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)).map(a => [a.date, sName(a.studentId), className(studentById(a.studentId)?.classId), a.delta, a.reason])];
  return sheets;
}

export async function makeXlsxBlob() {
  const X = await loadXLSX();
  const wb = X.utils.book_new();
  for (const [name, rows] of Object.entries(buildSheets())) {
    const ws = X.utils.aoa_to_sheet(rows);
    ws['!cols'] = rows[0].map((_, i) => ({ wch: Math.min(28, Math.max(8, ...rows.map(r => String(r[i] ?? '').length * 1.6 + 2))) }));
    X.utils.book_append_sheet(wb, ws, name);
  }
  const out = X.write(wb, { bookType: 'xlsx', type: 'array' });
  return new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

export function backupObject() {
  return { app: '点名本', schema: SCHEMA, exportedAt: new Date().toISOString(), data: snapshot() };
}
export const backupBlob = () => new Blob([JSON.stringify(backupObject(), null, 1)], { type: 'application/json' });

// 返回 'shared' | 'downloaded' | 'cancelled'
export async function shareOrDownload(blob, filename, mime) {
  const file = new File([blob], filename, { type: mime || blob.type });
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] }) && navigator.share) {
      await navigator.share({ files: [file], title: filename });
      return 'shared';
    }
  } catch (e) {
    if (e && e.name === 'AbortError') return 'cancelled';
    // 其它错误则退回下载
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.rel = 'noopener';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  return 'downloaded';
}

export function stamp() { return todayStr(); }

// 解析并校验备份文件，返回 data；不合法则抛出带中文信息的错误
export function parseBackup(text) {
  let obj;
  try { obj = JSON.parse(text); } catch { throw new Error('文件不是有效的备份文件（JSON 解析失败）'); }
  const data = obj && obj.data ? obj.data : obj;
  if (!data || !Array.isArray(data.students) || !Array.isArray(data.payments) || !Array.isArray(data.attendance)) throw new Error('这不是「点名本」的备份文件');
  if (obj.schema && obj.schema > SCHEMA) throw new Error('备份文件来自更新版本的点名本，请先更新应用');
  const ids = new Set();
  for (const s of data.students) { if (!s || !s.id || !s.name) throw new Error('备份文件中的学生数据不完整'); ids.add(s.id); }
  data.adjustments = Array.isArray(data.adjustments) ? data.adjustments : [];
  for (const a of data.attendance) if (!a || !a.id || !a.studentId || !a.date || !['present', 'leave'].includes(a.status)) throw new Error('备份文件中的上课记录不完整');
  for (const p of data.payments) if (!p || !p.id || !p.studentId || !p.date) throw new Error('备份文件中的缴费记录不完整');
  return data;
}
