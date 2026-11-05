// 示例数据（设置里可选加载）
import { state, defaultSettings } from './store.js';
import { uid, addDays, todayStr } from './util.js';
import { defaultRoll, classRecentDate, giftFor } from './logic.js';

const SAT = [['王子涵', 7, 1], ['李欣怡', 1, 1], ['张浩宇', 11, 1], ['刘雨桐', 1, 2], ['陈思远', 5, 1], ['杨梓萱', 15, 0], ['赵一鸣', 3, 1], ['黄诗琪', 7, 0]];
const SUN = [['周安琪', 9, 1], ['吴子墨', 2, 1], ['郑沐阳', 13, 0], ['孙可心', 0, 1], ['马嘉禾', 6, 2]];

export function buildSample() {
  const settings = defaultSettings();
  const t = todayStr();
  const students = [], payments = [], attendance = [], adjustments = [];
  const groups = [[settings.classes[0], SAT, '138'], [settings.classes[1], SUN, '139']];
  let n = 0;
  for (const [cls, list, pre] of groups) {
    const d0 = classRecentDate(cls, t); // 本班最近一次上课日
    const past = Array.from({ length: 12 }, (_, i) => addDays(d0, -7 * (i + 1)));
    list.forEach(([name, finalRemaining, todayState], idx) => {
      const sid = uid() + (n++);
      students.push({ id: sid, name, classId: cls.id, phone: `${pre}${String(10000000 + idx * 1234567).slice(0, 8)}`, note: idx === 1 ? '对花生过敏' : '', createdAt: Date.now() - 9e8 + n });
      // 过去几周：大部分到课，少量请假
      let present = 0;
      const used = new Set();
      past.forEach((d, i) => {
        const r = (idx * 7 + i * 5) % 10;
        if (i < 2 + (idx % 4) + 2 && r < 8) { attendance.push({ id: `${sid}|${d}`, studentId: sid, date: d, classId: cls.id, status: 'present', ts: Date.now() }); present++; used.add(i); }
        else if (r === 9 && i < 6) { attendance.push({ id: `${sid}|${d}`, studentId: sid, date: d, classId: cls.id, status: 'leave', ts: Date.now() }); used.add(i); }
      });
      if (todayState === 1) { attendance.push({ id: `${sid}|${d0}`, studentId: sid, date: d0, classId: cls.id, status: 'present', ts: Date.now() }); present++; }
      if (todayState === 2) attendance.push({ id: `${sid}|${d0}`, studentId: sid, date: d0, classId: cls.id, status: 'leave', ts: Date.now() });
      // 补足较早的上课记录，使累计课时凑够一个课时包
      for (let i = past.length - 1; i >= 0 && finalRemaining + present < 11; i--) {
        if (used.has(i)) continue;
        attendance.push({ id: `${sid}|${past[i]}`, studentId: sid, date: past[i], classId: cls.id, status: 'present', ts: Date.now() }); present++; used.add(i);
      }
      // 缴费：凑出目标剩余课时
      let need = finalRemaining + present;
      const packs = [];
      if (need >= 23) { packs.push(20); need -= 23; }
      while (need >= 11) { packs.push(10); need -= 11; }
      packs.forEach((p, i) => payments.push({ id: uid() + (n++), studentId: sid, date: i === packs.length - 1 ? addDays(t, -(idx * 4 + 1)) : addDays(past[past.length - 1 - i], -2), lessons: p, gift: giftFor(p), amount: p === 20 ? 3600 : 1900, note: i === 0 ? '微信转账' : '', ts: Date.now() - (packs.length - i) * 1000 }));
      if (need > 0) adjustments.push({ id: uid() + (n++), studentId: sid, date: addDays(past[past.length - 1], -2), delta: need, reason: '上学期结余课时', ts: Date.now() });
    });
  }
  return { settings, students, payments, attendance, adjustments };
}
export { defaultRoll };
