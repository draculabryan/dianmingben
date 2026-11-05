import * as Store from './store.js';
import { state, info } from './store.js';
import {
  esc, uid, todayStr, addDays, dowOf, WEEK, weekdayName, mdLabel, ymdLabel, shortDate, monthRange, defaultSemester, money, parseDate,
} from './util.js';
import {
  COLORS, classById, className, classColor, studentById, avatarColor, surname, computeStats, sortedStudents, rollStudents,
  cycleAttendance, defaultRoll, classRecentDate, giftFor, packChoices, payText, rangeStats, attId,
} from './logic.js';
import { I } from './icons.js';
import { loadXLSX, makeXlsxBlob, backupBlob, shareOrDownload, parseBackup, stamp } from './export.js';
import { buildSample } from './sample.js';

export const APP_VERSION = '1.0.0';
const $ = (s, r = document) => r.querySelector(s);
const viewEl = $('#view'), pageRoot = $('#pages'), sheetRoot = $('#sheet-root'), dlgRoot = $('#dialog-root'), toastEl = $('#toast');

const ui = {
  tab: 'roll',
  rollClass: null, rollDate: null, manualClass: false, manualDate: false,
  stuFilter: 'all',
  sumClass: 'all', sumRange: 'month', sumFrom: '', sumTo: '',
  page: null, // {type:'student', id, seg} | {type:'settings'}
  drafts: {},
};
const TAB_TITLES = { roll: '点名', students: '学生', pay: '缴费', summary: '汇总' };

// ============ 基础组件 ============
let toastTimer;
function toast(msg, kind = '') {
  toastEl.className = 'toast show ' + kind; toastEl.textContent = msg;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { toastEl.className = 'toast'; }, 2200);
}
function openSheet(title, html, opts = {}) {
  sheetRoot.innerHTML = `<div class="backdrop" data-act="closeSheet"></div><section class="sheet" role="dialog" aria-label="${esc(title)}">
    <div class="sheet-grab"></div><div class="sheet-head"><h2>${esc(title)}</h2><button class="icon-btn sm" data-act="closeSheet" aria-label="关闭">${I.close}</button></div>
    <div class="sheet-body">${html}</div></section>`;
  sheetRoot.classList.add('open');
  document.body.classList.add('noscroll');
  if (opts.focus) setTimeout(() => $(opts.focus, sheetRoot)?.focus(), 320);
}
function closeSheet() { sheetRoot.classList.remove('open'); document.body.classList.remove('noscroll'); setTimeout(() => { if (!sheetRoot.classList.contains('open')) sheetRoot.innerHTML = ''; }, 260); }

function confirmDialog({ title, message, ok = '确定', danger = false, typeWord = null }) {
  return new Promise(resolve => {
    dlgRoot.innerHTML = `<div class="backdrop show"></div><div class="dialog" role="alertdialog"><h3>${esc(title)}</h3><p>${message}</p>
      ${typeWord ? `<input id="dlgType" class="input" placeholder="请输入「${esc(typeWord)}」" autocomplete="off">` : ''}
      <div class="dlg-btns"><button class="btn ghost" data-dlg="cancel">取消</button><button class="btn ${danger ? 'danger' : 'primary'}" data-dlg="ok" ${typeWord ? 'disabled' : ''}>${esc(ok)}</button></div></div>`;
    dlgRoot.classList.add('open');
    const done = v => { dlgRoot.classList.remove('open'); dlgRoot.innerHTML = ''; resolve(v); };
    const inp = $('#dlgType', dlgRoot);
    if (inp) inp.addEventListener('input', () => { $('[data-dlg=ok]', dlgRoot).disabled = inp.value.trim() !== typeWord; });
    dlgRoot.onclick = e => { const b = e.target.closest('[data-dlg]'); if (!b) return; if (b.dataset.dlg === 'ok' && b.disabled) return; done(b.dataset.dlg === 'ok'); };
  });
}
const field = (label, inner, hint = '') => `<label class="field"><span class="fl">${label}</span>${inner}${hint ? `<span class="hint">${hint}</span>` : ''}</label>`;
const avatar = (s, size = '') => `<span class="av ${size}" style="background:${avatarColor(s.id)}">${esc(surname(s.name))}</span>`;
const classChip = id => { const c = classColor(id); return `<span class="chip" style="background:${c.soft};color:${c.main}">${esc(className(id))}</span>`; };
const remText = r => r >= 0 ? `剩 ${r} 节` : `欠 ${-r} 节`;
const remClass = r => r <= 0 ? 'rem low over' : r <= 2 ? 'rem low' : 'rem';
const emptyIllu = `<svg viewBox="0 0 120 100" width="120" height="100" aria-hidden="true"><rect x="22" y="22" width="76" height="62" rx="16" fill="#ffe9e2"/><rect x="34" y="12" width="52" height="16" rx="8" fill="#ffd6e0"/><circle cx="42" cy="48" r="7" fill="#d6e8ff"/><rect x="54" y="43" width="32" height="5" rx="2.5" fill="#fff"/><circle cx="42" cy="68" r="7" fill="#dff5c8"/><rect x="54" y="63" width="24" height="5" rx="2.5" fill="#fff"/><path d="m88 68 5 5 9-10" stroke="#2fa66a" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

// ============ 点名 ============
function applyDefaultRoll(force = false) {
  const t = todayStr();
  const d = defaultRoll(t);
  if (force || !ui.manualClass) ui.rollClass = d.classId;
  if (force || !ui.manualDate) ui.rollDate = (ui.manualClass && !force) ? classRecentDate(classById(ui.rollClass), t) : d.date;
  if (!classById(ui.rollClass)) ui.rollClass = d.classId;
}
function pillRow(items, active, act, extraAttr = 'data-v') {
  return `<div class="pills">${items.map(it => {
    const on = it.id === active;
    const style = on ? `background:${it.main};color:#fff` : `background:${it.soft};color:${it.main}`;
    return `<button class="pill ${on ? 'on' : ''}" style="${style}" data-act="${act}" ${extraAttr}="${esc(it.id)}">${esc(it.label)}</button>`;
  }).join('')}</div>`;
}
const classPills = (active, act, withAll = false) => pillRow([
  ...(withAll ? [{ id: 'all', label: '全部', main: '#6b625a', soft: '#f1ece6' }] : []),
  ...state.settings.classes.map(c => ({ id: c.id, label: c.name, main: COLORS[c.color]?.main || '#ff7a59', soft: COLORS[c.color]?.soft || '#ffe9e2' })),
], active, act);

function headerHtml(sub, title, extra = '') {
  return `<header class="hdr"><div class="hdr-l"><div class="sub">${sub}</div><h1>${title}</h1></div><div class="hdr-r">${extra}<button class="icon-btn gear" data-act="openSettings" aria-label="设置">${I.gear}${needBackupNudge() ? '<i class="dot"></i>' : ''}</button></div></header>`;
}

function renderRoll() {
  const t = todayStr();
  if (!ui.rollClass) applyDefaultRoll(true);
  const cls = classById(ui.rollClass) || state.settings.classes[0];
  const col = COLORS[cls.color] || COLORS.coral;
  viewEl.style.setProperty('--accent', col.main);
  $('#app').style.setProperty('--accent', col.main);
  const isToday = ui.rollDate === t;
  const { list, dayMap } = rollStudents(cls.id, ui.rollDate);
  const stats = computeStats();
  const cnt = { present: 0, leave: 0, none: 0 };
  list.forEach(s => { const a = dayMap.get(s.id); cnt[a ? a.status : 'none']++; });
  const dflt = defaultRoll(t);
  const isDefault = ui.rollClass === dflt.classId && ui.rollDate === dflt.date;
  const sub = `${mdLabel(ui.rollDate)} · ${weekdayName(ui.rollDate)}${isToday ? ' ☀︎' : !ui.manualDate ? ' · 最近上课日' : ' · 补记'}`;
  let body;
  if (!state.students.length) {
    body = `<div class="empty"><div class="illu">${emptyIllu}</div><h2>欢迎使用点名本</h2><p>从添加第一位学生开始吧：</p>
      <ol class="steps"><li><b>1</b>在「学生」里添加学生并选好班级</li><li><b>2</b>在「缴费」里登记课时包</li><li><b>3</b>上课时回到这里，轻点卡片签到</li></ol>
      <button class="btn primary big" data-act="addStudent">添加第一位学生</button><p class="tiny">想先试玩？到右上角 设置 → 高级选项 里加载示例数据</p></div>`;
  } else if (!list.length) {
    body = `<div class="empty"><div class="illu">${emptyIllu}</div><h2>${esc(cls.name)}还没有学生</h2><p>添加学生后就能在这里点名啦。</p><button class="btn primary" data-act="addStudent" data-class="${esc(cls.id)}">添加学生</button></div>`;
  } else {
    body = `<div class="chips-row"><span class="stat s-present">已签到 ${cnt.present}</span><span class="stat s-leave">请假 ${cnt.leave}</span><span class="stat s-none">未点 ${cnt.none}</span></div>
    <div class="grid">${list.map(s => {
      const a = dayMap.get(s.id); const st = a ? a.status : 'none'; const r = stats.get(s.id).remaining;
      const badge = st === 'present' ? `<span class="badge b-present">${I.check}已签到</span>` : st === 'leave' ? `<span class="badge b-leave">${I.umbrella}请假</span>` : `<span class="badge b-none">点我签到</span>`;
      return `<button class="card st-${st} ${r <= 0 ? 'over' : ''}" data-act="rollToggle" data-id="${s.id}" data-st="${st}" aria-label="${esc(s.name)} ${st === 'present' ? '已签到' : st === 'leave' ? '请假' : '未点'}">
        <span class="card-top">${avatar(s)}<span class="nm">${esc(s.name)}</span></span>
        <span class="${remClass(r)}">${r <= 0 ? I.warn : ''}${remText(r)}</span>${r <= 0 ? '<span class="renew">需续费</span>' : ''}${badge}</button>`;
    }).join('')}</div>
    <p class="tiny center">轻点切换：未点 → 已签到 → 请假 → 未点　·　长按进入学生详情</p>`;
  }
  const dateBtn = `<label class="icon-btn date-btn" aria-label="选择日期">${I.calendar}<input type="date" id="rollDate" class="date-overlay" value="${ui.rollDate}" max="${t}" data-on="rollDate"></label>`;
  viewEl.innerHTML = `${headerHtml(sub, isToday ? '今天点名 🎒' : !ui.manualDate ? '最近点名 🎒' : '补记点名 📝', dateBtn)}
    ${classPills(ui.rollClass, 'rollClass')}
    ${!isDefault ? `<button class="link-btn" data-act="rollReset">↺ 回到${dflt.date === t ? '今天' : '最近上课日'}</button>` : ''}
    ${body}`;
}

const pressTimers = new WeakMap();
async function rollToggle(el) {
  const id = el.dataset.id;
  const to = await cycleAttendance(id, ui.rollDate, ui.rollClass, Store);
  const scroll = viewEl.scrollTop;
  renderRoll(); viewEl.scrollTop = scroll;
  const card = viewEl.querySelector(`.card[data-id="${id}"]`);
  if (card) { card.classList.add('pop'); card.addEventListener('animationend', () => card.classList.remove('pop'), { once: true }); }
  if (navigator.vibrate) navigator.vibrate(to === 'present' ? 12 : 6);
  refreshPage();
}

// ============ 学生 ============
function renderStudents() {
  viewEl.style.removeProperty('--accent'); $('#app').style.removeProperty('--accent');
  const stats = computeStats();
  const list = sortedStudents(ui.stuFilter);
  const add = `<button class="icon-btn solid" data-act="addStudent" aria-label="添加学生">${I.plus}</button>`;
  let body;
  if (!state.students.length) {
    body = `<div class="empty"><div class="illu">${emptyIllu}</div><h2>还没有学生</h2><p>点右上角的「＋」，添加第一位学生吧。</p><button class="btn primary big" data-act="addStudent">添加学生</button></div>`;
  } else if (!list.length) body = `<div class="empty small"><p>这个班还没有学生</p></div>`;
  else body = `<div class="list">${list.map(s => {
    const r = stats.get(s.id).remaining;
    return `<button class="row-card" data-act="openStudent" data-id="${s.id}">${avatar(s, 'lg')}<span class="rc-main"><span class="rc-name">${esc(s.name)}</span><span class="rc-sub">${classChip(s.classId)}${s.phone ? `<span class="muted">${esc(s.phone)}</span>` : ''}</span></span><span class="${remClass(r)} rc-rem">${remText(r)}</span><span class="chev">${I.chev}</span></button>`;
  }).join('')}</div>`;
  viewEl.innerHTML = `${headerHtml(`共 ${state.students.length} 位学生`, '学生 🧒', add)}${classPills(ui.stuFilter, 'stuFilter', true)}${body}`;
}

function studentForm(s) {
  const isNew = !s;
  const d = s || { name: '', classId: ui.stuFilter !== 'all' ? ui.stuFilter : (ui.tab === 'roll' ? ui.rollClass : state.settings.classes[0].id), phone: '', note: '' };
  ui.drafts.stu = { classId: d.classId };
  openSheet(isNew ? '添加学生' : '编辑学生', `
    <form data-form="student" data-id="${s?.id || ''}" autocomplete="off" novalidate>
      ${field('姓名', `<input class="input" id="f_name" value="${esc(d.name)}" placeholder="例如：王子涵" maxlength="20">`)}
      <div class="field"><span class="fl">班级</span><div id="f_class">${classPicker(d.classId)}</div></div>
      ${field('家长电话（选填）', `<input class="input" id="f_phone" type="tel" inputmode="tel" value="${esc(d.phone || '')}" placeholder="选填">`)}
      ${field('备注（选填）', `<textarea class="input" id="f_note" rows="2" placeholder="例如：对花生过敏">${esc(d.note || '')}</textarea>`)}
      ${isNew ? field('已有剩余课时（选填）', `<input class="input" id="f_init" type="number" inputmode="numeric" min="0" step="1" placeholder="之前已缴费、还没上完的课时">`, '会记录为一条「初始剩余课时」调整') : ''}
      <div class="form-btns">${isNew ? '' : `<button type="button" class="btn danger-soft" data-act="delStudent" data-id="${s.id}">删除学生</button>`}<button type="submit" class="btn primary grow">保存</button></div>
    </form>`, { focus: isNew ? '#f_name' : null });
}
const classPicker = cur => `<div class="pills wrap">${state.settings.classes.map(c => { const col = COLORS[c.color]; const on = c.id === cur; return `<button type="button" class="pill ${on ? 'on' : ''}" style="${on ? `background:${col.main};color:#fff` : `background:${col.soft};color:${col.main}`}" data-act="pickClass" data-v="${c.id}">${esc(c.name)}</button>`; }).join('')}</div>`;

async function saveStudent(form) {
  const name = $('#f_name', form).value.trim();
  if (!name) { toast('请填写姓名', 'warn'); $('#f_name', form).focus(); return; }
  const id = form.dataset.id;
  const classId = ui.drafts.stu.classId;
  const base = id ? studentById(id) : { id: uid(), createdAt: Date.now() };
  const stu = { ...base, name, classId, phone: $('#f_phone', form).value.trim(), note: $('#f_note', form).value.trim() };
  const ops = [{ op: 'put', store: 'students', obj: stu }];
  if (!id) {
    const init = parseInt($('#f_init', form)?.value, 10);
    if (init > 0) ops.push({ op: 'put', store: 'adjustments', obj: { id: uid(), studentId: stu.id, date: todayStr(), delta: init, reason: '初始剩余课时', ts: Date.now() } });
  }
  await Store.bulk(ops);
  closeSheet(); toast(id ? '已保存' : `已添加 ${name}`, 'ok'); refresh();
}
async function deleteStudent(id) {
  const s = studentById(id); if (!s) return;
  const nPay = state.payments.filter(p => p.studentId === id).length;
  const nAtt = state.attendance.filter(p => p.studentId === id).length;
  const ok = await confirmDialog({ title: `删除 ${s.name}？`, message: `将同时删除 TA 的 ${nPay} 条缴费记录、${nAtt} 条上课/请假记录和课时调整，且无法恢复。<br>（建议先导出备份）`, ok: '删除', danger: true });
  if (!ok) return;
  const ops = [{ op: 'del', store: 'students', id }];
  state.payments.filter(p => p.studentId === id).forEach(p => ops.push({ op: 'del', store: 'payments', id: p.id }));
  state.attendance.filter(p => p.studentId === id).forEach(p => ops.push({ op: 'del', store: 'attendance', id: p.id }));
  state.adjustments.filter(p => p.studentId === id).forEach(p => ops.push({ op: 'del', store: 'adjustments', id: p.id }));
  await Store.bulk(ops);
  closeSheet(); if (ui.page?.type === 'student' && ui.page.id === id) closePage();
  toast(`已删除 ${s.name}`); refresh();
}

// ---- 学生详情页 ----
function studentPageHtml() {
  const s = studentById(ui.page.id); if (!s) return '';
  const x = computeStats().get(s.id); const seg = ui.page.seg;
  const att = state.attendance.filter(a => a.studentId === s.id);
  const rows = {
    att: att.filter(a => a.status === 'present').sort((a, b) => b.date.localeCompare(a.date)).map(a => `<button class="rec" data-act="delAtt" data-id="${a.id}"><span class="rec-dot g"></span><span class="rec-main">${shortDate(a.date)} ${weekdayName(a.date)}<small>${esc(className(a.classId || s.classId))} · 扣 1 节</small></span><span class="rec-v g">已签到</span></button>`),
    leave: att.filter(a => a.status === 'leave').sort((a, b) => b.date.localeCompare(a.date)).map(a => `<button class="rec" data-act="delAtt" data-id="${a.id}"><span class="rec-dot o"></span><span class="rec-main">${shortDate(a.date)} ${weekdayName(a.date)}<small>${esc(className(a.classId || s.classId))} · 不扣课时</small></span><span class="rec-v o">请假</span></button>`),
    pay: state.payments.filter(p => p.studentId === s.id).sort((a, b) => b.date.localeCompare(a.date) || b.ts - a.ts).map(p => `<button class="rec" data-act="editPay" data-id="${p.id}"><span class="rec-dot p"></span><span class="rec-main">${shortDate(p.date)}<small>${payText(p)}${p.note ? ' · ' + esc(p.note) : ''}</small></span><span class="rec-v">${money(p.amount)}</span></button>`),
    adj: state.adjustments.filter(a => a.studentId === s.id).sort((a, b) => b.date.localeCompare(a.date) || b.ts - a.ts).map(a => `<button class="rec" data-act="delAdj" data-id="${a.id}"><span class="rec-dot b"></span><span class="rec-main">${shortDate(a.date)}<small>${esc(a.reason)}</small></span><span class="rec-v ${a.delta >= 0 ? 'g' : 'r'}">${a.delta > 0 ? '+' : ''}${a.delta} 节</span></button>`),
  };
  const empties = { att: '还没有上课记录', leave: '还没有请假记录', pay: '还没有缴费记录', adj: '没有课时调整记录' };
  const segs = [['att', `上课 ${x.present}`], ['leave', `请假 ${x.leave}`], ['pay', `缴费 ${state.payments.filter(p => p.studentId === s.id).length}`], ['adj', `调整 ${state.adjustments.filter(a => a.studentId === s.id).length}`]];
  const c = classColor(s.classId);
  return `<div class="page-bar"><button class="icon-btn" data-act="closePage" aria-label="返回">${I.back}</button><span class="pb-title">学生详情</span><button class="icon-btn" data-act="editStudent" data-id="${s.id}" aria-label="编辑">${I.edit}</button></div>
  <div class="page-scroll">
    <div class="hero" style="background:${c.soft}">
      <div class="hero-top">${avatar(s, 'xl')}<div><div class="hero-name">${esc(s.name)}</div>${classChip(s.classId)}</div></div>
      <div class="hero-rem ${x.remaining <= 2 ? 'low' : ''}"><span class="big">${x.remaining}</span><span>节剩余${x.remaining <= 0 ? ' · 需续费' : x.remaining <= 2 ? ' · 该续费啦' : ''}</span></div>
      <div class="hero-eq">购买 ${x.bought} + 赠送 ${x.gift}${x.adj ? ` ${x.adj > 0 ? '+' : '−'} 调整 ${Math.abs(x.adj)}` : ''} − 已上 ${x.present}</div>
      ${s.phone ? `<a class="hero-line" href="tel:${esc(s.phone)}">${I.phone}${esc(s.phone)}</a>` : ''}${s.note ? `<div class="hero-line note">${esc(s.note)}</div>` : ''}
      <div class="hero-btns"><button class="btn primary" data-act="payFor" data-id="${s.id}">缴费</button><button class="btn white" data-act="adjust" data-id="${s.id}">调整课时</button></div>
    </div>
    <div class="mini-stats"><div><b>${x.present}</b>已上课</div><div><b>${x.leave}</b>请假</div><div><b>${money(x.paid)}</b>累计缴费</div></div>
    <div class="seg">${segs.map(([k, l]) => `<button class="${seg === k ? 'on' : ''}" data-act="seg" data-v="${k}">${l}</button>`).join('')}</div>
    <div class="recs">${rows[seg].length ? rows[seg].join('') : `<div class="empty small"><p>${empties[seg]}</p></div>`}</div>
    ${seg === 'att' || seg === 'leave' ? '<p class="tiny center">轻点一条记录可删除（上课记录会返还课时）</p>' : ''}
  </div>`;
}

function openStudentPage(id, seg = 'att') { ui.page = { type: 'student', id, seg }; mountPage(); }
function mountPage() {
  if (!ui.page) return;
  const html = ui.page.type === 'student' ? studentPageHtml() : settingsHtml();
  const had = pageRoot.firstElementChild;
  const sc = had ? $('.page-scroll', had)?.scrollTop : 0;
  if (!html) { closePage(); return; }
  pageRoot.innerHTML = `<div class="page ${had ? 'noanim' : ''}">${html}</div>`;
  if (sc) $('.page-scroll', pageRoot).scrollTop = sc;
  $('#app').classList.add('page-open');
}
function closePage() {
  ui.page = null;
  const p = pageRoot.firstElementChild; if (!p) return;
  p.classList.add('leaving');
  setTimeout(() => { if (!ui.page) { pageRoot.innerHTML = ''; $('#app').classList.remove('page-open'); } }, 220);
  refresh();
}
function refreshPage() { if (ui.page) mountPage(); }

function adjustForm(id) {
  const s = studentById(id); const r = computeStats().get(id).remaining;
  ui.drafts.adj = { sign: 1 };
  openSheet(`调整课时 · ${s.name}`, `<form data-form="adjust" data-id="${id}" autocomplete="off" novalidate>
    <p class="note-box">用于更正错误或特殊补偿。每次调整都会记录在 TA 的「调整」历史里。当前剩余 <b>${r}</b> 节。</p>
    <div class="field"><span class="fl">方向</span><div class="seg two"><button type="button" class="on" data-act="adjSign" data-v="1">增加课时</button><button type="button" data-act="adjSign" data-v="-1">扣减课时</button></div></div>
    ${field('节数', `<input class="input" id="a_n" type="number" inputmode="numeric" min="1" step="1" placeholder="例如：1" data-on="adjPreview">`)}
    ${field('原因（必填）', `<input class="input" id="a_reason" placeholder="例如：上周补课 / 误点签到更正" maxlength="40">`)}
    ${field('日期', `<input class="input" id="a_date" type="date" value="${todayStr()}">`)}
    <div class="preview" id="adjPreview" data-cur="${r}">调整后剩余 ${r} 节</div>
    <button type="submit" class="btn primary block">保存调整</button></form>`);
}
const adjPreview = () => { const el = $('#adjPreview'); if (!el) return; const n = parseInt($('#a_n')?.value, 10) || 0; el.textContent = `调整后剩余 ${(+el.dataset.cur) + ui.drafts.adj.sign * n} 节`; };
async function saveAdjust(form) {
  const n = parseInt($('#a_n', form).value, 10); const reason = $('#a_reason', form).value.trim();
  if (!(n > 0)) return toast('请输入大于 0 的节数', 'warn');
  if (!reason) return toast('请填写调整原因', 'warn');
  await Store.save('adjustments', { id: uid(), studentId: form.dataset.id, date: $('#a_date', form).value || todayStr(), delta: ui.drafts.adj.sign * n, reason, ts: Date.now() });
  closeSheet(); toast('已记录课时调整', 'ok'); refresh();
}

// ============ 缴费 ============
function newPayDraft(studentId = '') {
  return { studentId, pack: packChoices().includes(10) ? 10 : (packChoices()[0] || 'custom'), custom: '', gift: String(giftFor(packChoices().includes(10) ? 10 : (packChoices()[0] || 0))), amount: '', date: todayStr(), note: '' };
}
const draftLessons = d => d.pack === 'custom' ? (parseInt(d.custom, 10) || 0) : d.pack;
function payFormHtml(d, key) {
  const packs = packChoices();
  const studs = state.settings.classes.map(c => { const l = sortedStudents(c.id); return l.length ? `<optgroup label="${esc(c.name)}">${l.map(s => `<option value="${s.id}" ${s.id === d.studentId ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</optgroup>` : ''; }).join('');
  return `<div class="payform" data-pf="${key}">
    ${field('学生', `<span class="select-wrap"><select class="input" data-on="pf" data-k="studentId"><option value="">请选择学生</option>${studs}</select></span>`)}
    <div class="field"><span class="fl">课时包</span><div class="packs">${packs.map(p => `<button type="button" class="pack ${d.pack === p ? 'on' : ''}" data-act="packPick" data-v="${p}">${p} 节</button>`).join('')}<button type="button" class="pack ${d.pack === 'custom' ? 'on' : ''}" data-act="packPick" data-v="custom">自定义</button></div>
      ${d.pack === 'custom' ? `<input class="input mt" type="number" inputmode="numeric" min="1" step="1" placeholder="输入购买节数" value="${esc(d.custom)}" data-on="pf" data-k="custom">` : ''}</div>
    <div class="two-col">
      ${field('赠送课时', `<input class="input" type="number" inputmode="numeric" min="0" step="1" value="${esc(d.gift)}" data-on="pf" data-k="gift">`)}
      ${field('金额（元）', `<input class="input" type="number" inputmode="decimal" min="0" step="any" placeholder="例如 1900" value="${esc(d.amount)}" data-on="pf" data-k="amount">`)}
    </div>
    ${field('日期', `<input class="input" type="date" value="${esc(d.date)}" data-on="pf" data-k="date">`)}
    ${field('备注（选填）', `<input class="input" placeholder="例如：微信转账" value="${esc(d.note)}" data-on="pf" data-k="note" maxlength="40">`)}
    <div class="preview" data-preview="${key}"></div>
    <p class="tiny">赠送默认：${state.settings.giftRules.slice().sort((a, b) => a.pack - b.pack).map(r => `${r.pack} 节送 ${r.gift} 节`).join('，') || '未设置'}　<button type="button" class="inline-link" data-act="openSettings">修改规则</button></p>
  </div>`;
}
function updatePayPreview(key) {
  const d = ui.drafts[key]; const el = document.querySelector(`[data-preview="${key}"]`); if (!el) return;
  const l = draftLessons(d); const g = Math.max(0, parseInt(d.gift, 10) || 0);
  let t = l > 0 ? `购买 ${l} 节${g > 0 ? ` + 赠送 ${g} 节` : ''} = 共 ${l + g} 节` : '请选择或输入购买节数';
  if (d.studentId && l > 0) {
    let r = computeStats().get(d.studentId)?.remaining ?? 0;
    if (d.editing) { const old = state.payments.find(p => p.id === d.editing); if (old && old.studentId === d.studentId) r -= (+old.lessons || 0) + (+old.gift || 0); }
    t += ` · 缴费后剩余 ${r + l + g} 节`;
  }
  el.textContent = t;
}
function rerenderPayForm(key) {
  const wrap = document.querySelector(`[data-pf="${key}"]`); if (!wrap) return;
  const tmp = document.createElement('div'); tmp.innerHTML = payFormHtml(ui.drafts[key], key);
  wrap.replaceWith(tmp.firstElementChild); updatePayPreview(key);
}
function validatePay(d) {
  if (!d.studentId || !studentById(d.studentId)) return '请选择学生';
  const l = draftLessons(d); if (!(l >= 1)) return '请选择或输入购买节数';
  const g = parseInt(d.gift, 10); if (d.gift !== '' && !(g >= 0)) return '赠送课时不能为负数';
  if (d.amount === '' || !(parseFloat(d.amount) >= 0)) return '请输入金额（元）';
  if (!d.date) return '请选择日期';
  return null;
}
const draftToPayment = (d, base) => ({ ...(base || { id: uid(), ts: Date.now() }), studentId: d.studentId, date: d.date, lessons: draftLessons(d), gift: Math.max(0, parseInt(d.gift, 10) || 0), amount: Math.round(parseFloat(d.amount) * 100) / 100, note: (d.note || '').trim() });

async function savePay(key) {
  const d = ui.drafts[key]; const err = validatePay(d); if (err) return toast(err, 'warn');
  const base = d.editing ? state.payments.find(p => p.id === d.editing) : null;
  const p = draftToPayment(d, base);
  await Store.save('payments', p);
  if (key === 'edit') closeSheet();
  else { ui.drafts.new = newPayDraft(); }
  toast(`已记录：${studentById(p.studentId).name} ${payText(p)}`, 'ok'); refresh();
}
function editPayment(id) {
  const p = state.payments.find(x => x.id === id); if (!p) return;
  ui.drafts.edit = { studentId: p.studentId, pack: packChoices().includes(p.lessons) ? p.lessons : 'custom', custom: String(p.lessons), gift: String(p.gift || 0), amount: String(p.amount), date: p.date, note: p.note || '', editing: id };
  openSheet('编辑缴费', `${payFormHtml(ui.drafts.edit, 'edit')}<div class="form-btns"><button class="btn danger-soft" data-act="delPay" data-id="${id}">删除</button><button class="btn primary grow" data-act="savePay" data-key="edit">保存修改</button></div>`);
  updatePayPreview('edit');
}
async function deletePayment(id) {
  const p = state.payments.find(x => x.id === id); if (!p) return;
  const ok = await confirmDialog({ title: '删除这条缴费记录？', message: `${esc(studentById(p.studentId)?.name || '')}　${payText(p)}　${money(p.amount)}<br>删除后，对应的 ${p.lessons + (p.gift || 0)} 节课时会从剩余课时中扣除。`, ok: '删除', danger: true });
  if (!ok) return;
  await Store.remove('payments', id); closeSheet(); toast('已删除缴费记录'); refresh();
}
let payLimit = 20;
function renderPay() {
  viewEl.style.removeProperty('--accent'); $('#app').style.removeProperty('--accent');
  if (!ui.drafts.new) ui.drafts.new = newPayDraft();
  const pays = state.payments.slice().sort((a, b) => b.date.localeCompare(a.date) || b.ts - a.ts);
  const list = pays.slice(0, payLimit);
  const form = state.students.length
    ? `<section class="panel"><div class="panel-title">新增缴费</div>${payFormHtml(ui.drafts.new, 'new')}<button class="btn primary block" data-act="savePay" data-key="new">保存缴费</button></section>`
    : `<div class="empty"><div class="illu">${emptyIllu}</div><h2>先添加学生</h2><p>有了学生才能登记缴费哦。</p><button class="btn primary" data-act="addStudent">添加学生</button></div>`;
  viewEl.innerHTML = `${headerHtml('登记课时包与赠送', '缴费 💰')}${form}
    <div class="sec-title">最近缴费</div>
    ${list.length ? `<div class="recs card-list">${list.map(p => { const s = studentById(p.studentId); return `<button class="rec" data-act="editPay" data-id="${p.id}">${s ? avatar(s) : ''}<span class="rec-main">${esc(s?.name || '已删除学生')}<small>${shortDate(p.date)} · ${payText(p)}${p.note ? ' · ' + esc(p.note) : ''}</small></span><span class="rec-v">${money(p.amount)}</span></button>`; }).join('')}</div>
    ${pays.length > payLimit ? `<button class="btn ghost block" data-act="morePay">显示更多</button>` : ''}
    <p class="tiny center">轻点一条记录可编辑或删除</p>` : '<div class="empty small"><p>还没有缴费记录</p></div>'}`;
  updatePayPreview('new');
}

// ============ 汇总 ============
function sumRange() {
  const t = todayStr();
  if (ui.sumRange === 'month') return { ...monthRange(t), label: '本月' };
  if (ui.sumRange === 'term') { const s = state.settings; const d = defaultSemester(t); return { from: s.semesterStart || d.from, to: s.semesterEnd || d.to, label: '本学期' }; }
  if (ui.sumRange === 'custom') return { from: ui.sumFrom || '', to: ui.sumTo || '', label: '所选时间段' };
  return { from: '', to: '', label: '全部时间' };
}
function renderSummary() {
  viewEl.style.removeProperty('--accent'); $('#app').style.removeProperty('--accent');
  const r = sumRange();
  const { rows, totals } = rangeStats(r, ui.sumClass);
  const rangeSeg = [['month', '本月'], ['term', '本学期'], ['all', '全部'], ['custom', '自定义']];
  const rangeText = ui.sumRange === 'all' ? '全部记录' : `${r.from ? shortDate(r.from) : '最早'} – ${r.to ? shortDate(r.to) : '至今'}`;
  viewEl.innerHTML = `${headerHtml('学生出勤与收入', '汇总 📊')}
    ${classPills(ui.sumClass, 'sumClass', true)}
    <div class="seg mt">${rangeSeg.map(([k, l]) => `<button class="${ui.sumRange === k ? 'on' : ''}" data-act="sumRange" data-v="${k}">${l}</button>`).join('')}</div>
    ${ui.sumRange === 'custom' ? `<div class="two-col custom-range"><input class="input" type="date" id="sumFrom" value="${ui.sumFrom}" data-on="sumDate" aria-label="开始日期"><input class="input" type="date" id="sumTo" value="${ui.sumTo}" data-on="sumDate" aria-label="结束日期"></div>` : ''}
    <div class="range-text">${rangeText}</div>
    <div class="totals">
      <div class="tot t1"><span>${r.label}收入</span><b>${money(totals.income)}</b></div>
      <div class="tot t2"><span>上课节次</span><b>${totals.taught}</b></div>
      <div class="tot t3"><span>请假次数</span><b>${totals.leaves}</b></div>
      <div class="tot t4"><span>待续费</span><b class="${totals.renew ? 'red' : ''}">${totals.renew} 人</b></div>
    </div>
    <div class="sec-title">学生明细${ui.sumClass !== 'all' ? ' · ' + esc(className(ui.sumClass)) : ''}</div>
    ${rows.length ? `<div class="list">${rows.map(({ s, all, present, leave, paid }) => `<button class="sum-row" data-act="openStudent" data-id="${s.id}">
      <span class="sr-top">${avatar(s)}<span class="sr-name">${esc(s.name)}</span>${ui.sumClass === 'all' ? classChip(s.classId) : ''}<span class="${remClass(all.remaining)} sr-rem">${remText(all.remaining)}</span></span>
      <span class="sr-stats"><span><b>${present}</b>上课</span><span><b>${leave}</b>请假</span><span><b>${money(paid)}</b>${ui.sumRange === 'all' ? '累计缴费' : '期间缴费'}</span>${ui.sumRange !== 'all' ? `<span class="faint"><b>${money(all.paid)}</b>累计缴费</span>` : ''}</span></button>`).join('')}</div>` : '<div class="empty small"><p>暂无学生数据</p></div>'}`;
}

// ============ 设置 ============
const BACKUP_DAYS = 14;
function needBackupNudge() {
  if (!Store.hasData()) return false;
  const lb = state.settings.lastBackup; if (!lb) return true;
  return (Date.now() - new Date(lb).getTime()) / 864e5 >= BACKUP_DAYS;
}
function backupLine() {
  const lb = state.settings.lastBackup;
  if (!lb) return '还没有备份过';
  const days = Math.floor((Date.now() - new Date(lb).getTime()) / 864e5);
  const d = new Date(lb); return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日（${days <= 0 ? '今天' : days + ' 天前'}）`;
}
function settingsHtml() {
  const st = state.settings; const sem = defaultSemester();
  const wd = c => Number.isInteger(c.weekday) ? '每' + WEEK[c.weekday] : '不固定';
  return `<div class="page-bar"><button class="icon-btn" data-act="closePage" aria-label="返回">${I.back}</button><span class="pb-title">设置</span><span class="icon-btn ghost"></span></div>
  <div class="page-scroll">
    ${needBackupNudge() ? `<div class="nudge">${I.sparkle}<div><b>该备份一下啦</b><span>${st.lastBackup ? `距离上次备份已超过 ${BACKUP_DAYS} 天` : '数据只保存在这台手机里，建议现在导出一份备份'}</span></div><button class="btn primary sm" data-act="exportBackup">立即备份</button></div>` : ''}
    <div class="sec-title">班级</div>
    <div class="group">${st.classes.map(c => `<button class="g-row" data-act="editClass" data-id="${c.id}"><i class="swatch" style="background:${COLORS[c.color]?.main}"></i><span class="g-main">${esc(c.name)}</span><span class="g-val">${wd(c)} · ${sortedStudents(c.id).length} 人</span><span class="chev">${I.chev}</span></button>`).join('')}
      <button class="g-row accent" data-act="addClass"><span class="g-main">＋ 添加班级</span></button></div>
    <div class="sec-title">默认赠送规则</div>
    <div class="group">${st.giftRules.slice().sort((a, b) => a.pack - b.pack).map(r => `<div class="g-row"><span class="g-main">买</span><input class="input tiny-in" type="number" inputmode="numeric" min="1" value="${r.pack}" data-on="rulePack" data-old="${r.pack}"><span>节 送</span><input class="input tiny-in" type="number" inputmode="numeric" min="0" value="${r.gift}" data-on="ruleGift" data-pack="${r.pack}"><span>节</span><button class="icon-btn sm" data-act="delRule" data-pack="${r.pack}" aria-label="删除规则">${I.trash}</button></div>`).join('')}
      <button class="g-row accent" data-act="addRule"><span class="g-main">＋ 添加规则</span></button></div>
    <p class="tiny pad">缴费时会自动填入这里的赠送节数，仍可手动改成任意数字（包括 0）。</p>
    <div class="sec-title">本学期范围</div>
    <div class="group"><div class="g-row"><span class="g-main">开始</span><input class="input date-in" type="date" value="${st.semesterStart || sem.from}" data-on="semDate" data-k="semesterStart"></div>
      <div class="g-row"><span class="g-main">结束</span><input class="input date-in" type="date" value="${st.semesterEnd || sem.to}" data-on="semDate" data-k="semesterEnd"></div>
      ${st.semesterStart || st.semesterEnd ? `<button class="g-row accent" data-act="semReset"><span class="g-main">恢复自动（按月份推算）</span></button>` : ''}</div>
    <div class="sec-title">导出与备份</div>
    <div class="group">
      <button class="g-row" data-act="exportXlsx"><span class="g-ico c1">${I.sheet}</span><span class="g-main">导出 Excel<small>学生汇总 · 上课 · 请假 · 缴费记录</small></span><span class="chev">${I.chev}</span></button>
      <button class="g-row" data-act="exportBackup"><span class="g-ico c2">${I.share}</span><span class="g-main">导出备份文件<small>完整 JSON，可用于恢复</small></span><span class="chev">${I.chev}</span></button>
      <label class="g-row"><span class="g-ico c3">${I.upload}</span><span class="g-main">从备份文件恢复<small>会覆盖当前所有数据</small></span><span class="chev">${I.chev}</span><input type="file" id="importFile" accept=".json,application/json" hidden data-on="importFile"></label>
    </div>
    <p class="tiny pad ${needBackupNudge() ? 'warn-text' : ''}">上次备份：${backupLine()}<br>存储：${info.backend === 'idb' ? 'IndexedDB' : 'localStorage'} · ${info.persisted ? '已申请持久存储 ✓' : '未获持久存储（添加到主屏幕后更稳妥）'}</p>
    <div class="sec-title">应用</div>
    <div class="group"><button class="g-row" data-act="checkUpdate"><span class="g-main">检查更新</span><span class="g-val">v${APP_VERSION}</span></button></div>
    <details class="adv"><summary>高级选项</summary>
      <div class="group"><button class="g-row" data-act="loadSample"><span class="g-main">加载示例数据<small>用于试玩，会覆盖当前数据</small></span></button>
        <button class="g-row danger" data-act="clearAll"><span class="g-main">清除所有数据<small>删除全部学生与记录，无法恢复</small></span></button></div>
    </details>
    <p class="tiny center pad">点名本 · 数据仅保存在本机，无需联网</p>
  </div>`;
}
function openSettings() { ui.page = { type: 'settings' }; mountPage(); loadXLSX().catch(() => {}); }

function classForm(c) {
  const isNew = !c; const d = c || { name: '', color: 'green', weekday: null };
  ui.drafts.cls = { color: d.color };
  openSheet(isNew ? '添加班级' : '编辑班级', `<form data-form="class" data-id="${c?.id || ''}" autocomplete="off" novalidate>
    ${field('班级名称', `<input class="input" id="c_name" value="${esc(d.name)}" placeholder="例如：周三晚班" maxlength="12">`)}
    <div class="field"><span class="fl">代表色</span><div class="swatches">${Object.entries(COLORS).map(([k, v]) => `<button type="button" class="sw ${k === d.color ? 'on' : ''}" style="background:${v.main}" data-act="pickColor" data-v="${k}" aria-label="${v.name}"></button>`).join('')}</div></div>
    ${field('固定上课日', `<span class="select-wrap"><select class="input" id="c_wd"><option value="" ${d.weekday == null ? 'selected' : ''}>不固定</option>${WEEK.map((w, i) => `<option value="${i}" ${d.weekday === i ? 'selected' : ''}>每${w}</option>`).join('')}</select></span>`, '用于启动时自动选择当天的班级')}
    <div class="form-btns">${isNew ? '' : `<button type="button" class="btn danger-soft" data-act="delClass" data-id="${c.id}">删除班级</button>`}<button type="submit" class="btn primary grow">保存</button></div></form>`, { focus: isNew ? '#c_name' : null });
}
async function saveClass(form) {
  const name = $('#c_name', form).value.trim(); if (!name) return toast('请填写班级名称', 'warn');
  if (state.settings.classes.some(c => c.name === name && c.id !== form.dataset.id)) return toast('已有同名班级', 'warn');
  const wdv = $('#c_wd', form).value; const weekday = wdv === '' ? null : +wdv;
  const classes = state.settings.classes.slice();
  if (form.dataset.id) { const i = classes.findIndex(c => c.id === form.dataset.id); classes[i] = { ...classes[i], name, color: ui.drafts.cls.color, weekday }; }
  else classes.push({ id: 'c-' + uid(), name, color: ui.drafts.cls.color, weekday });
  state.settings = { ...state.settings, classes }; await Store.saveSettings();
  closeSheet(); toast('已保存班级', 'ok'); applyDefaultRoll(); refresh();
}
async function deleteClass(id) {
  const c = classById(id);
  if (state.settings.classes.length <= 1) return toast('至少保留一个班级', 'warn');
  if (state.students.some(s => s.classId === id)) return toast('这个班还有学生，请先把学生移到其他班级', 'warn');
  const ok = await confirmDialog({ title: `删除「${c.name}」？`, message: '班级里没有学生，可以安全删除。', ok: '删除', danger: true }); if (!ok) return;
  state.settings = { ...state.settings, classes: state.settings.classes.filter(x => x.id !== id) }; await Store.saveSettings();
  if (ui.rollClass === id) { ui.manualClass = false; ui.manualDate = false; applyDefaultRoll(true); }
  if (ui.stuFilter === id) ui.stuFilter = 'all'; if (ui.sumClass === id) ui.sumClass = 'all';
  closeSheet(); toast('已删除班级'); refresh();
}

async function doExportXlsx() {
  try {
    toast('正在生成 Excel…');
    const blob = await makeXlsxBlob();
    const r = await shareOrDownload(blob, `点名本-数据-${stamp()}.xlsx`, blob.type);
    if (r === 'shared') toast('已导出 Excel', 'ok'); else if (r === 'downloaded') toast('Excel 已下载', 'ok');
  } catch (e) { console.error(e); toast('导出失败：' + e.message, 'warn'); }
}
async function doExportBackup() {
  try {
    const blob = backupBlob();
    const r = await shareOrDownload(blob, `点名本备份-${stamp()}.json`, 'application/json');
    if (r === 'cancelled') return;
    state.settings = { ...state.settings, lastBackup: new Date().toISOString() }; await Store.saveSettings();
    toast(r === 'shared' ? '备份已导出' : '备份文件已下载', 'ok'); refresh();
  } catch (e) { console.error(e); toast('备份失败：' + e.message, 'warn'); }
}
async function doImport(file) {
  if (!file) return;
  try {
    const data = parseBackup(await file.text());
    const ok = await confirmDialog({ title: '从备份恢复？', message: `备份内容：${data.students.length} 位学生、${data.payments.length} 条缴费、${data.attendance.length} 条上课/请假记录。<br><b>当前手机上的所有数据将被覆盖。</b>`, ok: '覆盖并恢复', danger: true });
    if (!ok) return;
    await Store.replaceAll(data); resetRollSelection(); toast('已恢复备份', 'ok'); refresh();
  } catch (e) { toast(e.message || '恢复失败', 'warn'); }
}
function resetRollSelection() { ui.manualClass = false; ui.manualDate = false; ui.rollClass = null; ui.stuFilter = 'all'; ui.sumClass = 'all'; applyDefaultRoll(true); }
async function doLoadSample() {
  const ok = await confirmDialog({ title: '加载示例数据？', message: Store.hasData() ? '当前所有数据会被示例数据<b>覆盖</b>。建议先导出备份。' : '会加入两个班级的示例学生、缴费和点名记录，可随时在「清除所有数据」中删除。', ok: '加载', danger: Store.hasData() });
  if (!ok) return;
  await Store.replaceAll(buildSample()); resetRollSelection(); toast('已加载示例数据', 'ok'); refresh();
}
async function doClearAll() {
  const ok = await confirmDialog({ title: '清除所有数据？', message: '将永久删除所有学生、缴费、上课与请假记录，<b>无法恢复</b>。<br>如需保留请先导出备份。', ok: '永久清除', danger: true, typeWord: '清除' });
  if (!ok) return;
  await Store.clearAll(); resetRollSelection(); ui.drafts = {}; toast('已清除所有数据'); refresh();
}

// ============ 路由 / 渲染 ============
function refresh() {
  const scroll = viewEl.scrollTop;
  ({ roll: renderRoll, students: renderStudents, pay: renderPay, summary: renderSummary })[ui.tab]();
  viewEl.scrollTop = scroll;
  document.querySelectorAll('.tab').forEach(b => b.classList.toggle('on', b.dataset.tab === ui.tab));
  refreshPage();
}
function setTab(tab) {
  if (ui.page) { ui.page = null; pageRoot.innerHTML = ''; $('#app').classList.remove('page-open'); }
  if (tab === ui.tab) { viewEl.scrollTo({ top: 0, behavior: 'smooth' }); return; }
  ui.tab = tab; viewEl.scrollTop = 0; refresh();
}

// ============ 事件 ============
const ACT = {
  tab: el => setTab(el.dataset.tab),
  rollClass: el => { ui.rollClass = el.dataset.v; ui.manualClass = true; if (!ui.manualDate) ui.rollDate = classRecentDate(classById(ui.rollClass), todayStr()); refresh(); },
  rollToggle: el => { if (el._longFired) { el._longFired = false; return; } rollToggle(el); },
  rollReset: () => { ui.manualClass = false; ui.manualDate = false; applyDefaultRoll(true); refresh(); },
  addStudent: el => { if (el.dataset.class) ui.stuFilter = el.dataset.class; studentForm(null); },
  openStudent: el => openStudentPage(el.dataset.id),
  editStudent: el => studentForm(studentById(el.dataset.id)),
  delStudent: el => deleteStudent(el.dataset.id),
  pickClass: el => { ui.drafts.stu.classId = el.dataset.v; $('#f_class').innerHTML = classPicker(el.dataset.v); },
  stuFilter: el => { ui.stuFilter = el.dataset.v; refresh(); },
  closeSheet, closePage,
  seg: el => { ui.page.seg = el.dataset.v; mountPage(); },
  payFor: el => { ui.drafts.new = { ...newPayDraft(el.dataset.id) }; setTab('pay'); refresh(); viewEl.scrollTop = 0; },
  adjust: el => adjustForm(el.dataset.id),
  adjSign: el => { ui.drafts.adj.sign = +el.dataset.v; el.parentElement.querySelectorAll('button').forEach(b => b.classList.toggle('on', b === el)); adjPreview(); },
  delAdj: async el => { const a = state.adjustments.find(x => x.id === el.dataset.id); if (!a) return; if (await confirmDialog({ title: '删除这条调整？', message: `${esc(a.reason)}：${a.delta > 0 ? '+' : ''}${a.delta} 节<br>删除后剩余课时会相应变化。`, ok: '删除', danger: true })) { await Store.remove('adjustments', a.id); toast('已删除调整记录'); refresh(); } },
  delAtt: async el => { const a = state.attendance.find(x => x.id === el.dataset.id); if (!a) return; const p = a.status === 'present'; if (await confirmDialog({ title: `删除这条${p ? '上课' : '请假'}记录？`, message: `${shortDate(a.date)} ${weekdayName(a.date)}${p ? '<br>课时会返还 1 节。' : ''}`, ok: '删除', danger: true })) { await Store.remove('attendance', a.id); toast('已删除记录'); refresh(); } },
  packPick: el => { const key = el.closest('[data-pf]').dataset.pf; const d = ui.drafts[key]; d.pack = el.dataset.v === 'custom' ? 'custom' : +el.dataset.v; d.gift = d.pack === 'custom' ? (d.custom ? String(giftFor(parseInt(d.custom, 10) || 0)) : '0') : String(giftFor(d.pack)); rerenderPayForm(key); },
  savePay: el => savePay(el.dataset.key),
  editPay: el => editPayment(el.dataset.id),
  delPay: el => deletePayment(el.dataset.id),
  morePay: () => { payLimit += 30; refresh(); },
  sumClass: el => { ui.sumClass = el.dataset.v; refresh(); },
  sumRange: el => { ui.sumRange = el.dataset.v; if (ui.sumRange === 'custom' && !ui.sumFrom) { const m = monthRange(); ui.sumFrom = m.from; ui.sumTo = todayStr(); } refresh(); },
  openSettings: () => { closeSheet(); openSettings(); },
  editClass: el => classForm(classById(el.dataset.id)),
  addClass: () => classForm(null),
  pickColor: el => { ui.drafts.cls.color = el.dataset.v; el.parentElement.querySelectorAll('.sw').forEach(b => b.classList.toggle('on', b === el)); },
  delClass: el => deleteClass(el.dataset.id),
  addRule: async () => { const rules = state.settings.giftRules.slice(); let p = 30; while (rules.some(r => r.pack === p)) p += 10; rules.push({ pack: p, gift: 0 }); state.settings = { ...state.settings, giftRules: rules }; await Store.saveSettings(); refresh(); },
  delRule: async el => { state.settings = { ...state.settings, giftRules: state.settings.giftRules.filter(r => r.pack !== +el.dataset.pack) }; await Store.saveSettings(); ui.drafts.new = null; refresh(); },
  semReset: async () => { state.settings = { ...state.settings, semesterStart: '', semesterEnd: '' }; await Store.saveSettings(); refresh(); },
  exportXlsx: doExportXlsx, exportBackup: doExportBackup,
  loadSample: doLoadSample, clearAll: doClearAll,
  checkUpdate: async () => { if (!swReg) return toast('当前环境不支持离线更新'); try { await swReg.update(); setTimeout(() => { if (!swReg.waiting) toast('已是最新版本', 'ok'); }, 1200); } catch { toast('检查失败，请联网后重试', 'warn'); } },
  applyUpdate: () => { if (swReg?.waiting) { updating = true; swReg.waiting.postMessage('SKIP_WAITING'); } },
};
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]'); if (!el) return;
  const fn = ACT[el.dataset.act]; if (fn) { e.preventDefault?.(); fn(el, e); }
});
document.addEventListener('submit', e => {
  const f = e.target.closest('form[data-form]'); if (!f) return; e.preventDefault();
  ({ student: saveStudent, adjust: saveAdjust, class: saveClass })[f.dataset.form]?.(f);
});
const ON = {
  rollDate: el => { if (!el.value) return; ui.rollDate = el.value > todayStr() ? todayStr() : el.value; ui.manualDate = true; refresh(); },
  pf: el => { const key = el.closest('[data-pf]').dataset.pf; ui.drafts[key][el.dataset.k] = el.value; if (el.dataset.k === 'custom') { const d = ui.drafts[key]; d.gift = String(giftFor(parseInt(el.value, 10) || 0)); const g = el.closest('[data-pf]').querySelector('[data-k=gift]'); if (g) g.value = d.gift; } updatePayPreview(key); },
  adjPreview,
  sumDate: el => { ui[el.id === 'sumFrom' ? 'sumFrom' : 'sumTo'] = el.value; refresh(); },
  rulePack: async el => { const old = +el.dataset.old; const n = parseInt(el.value, 10); const rules = state.settings.giftRules; if (!(n >= 1) || (n !== old && rules.some(r => r.pack === n))) { toast('节数无效或已存在', 'warn'); return refresh(); } state.settings = { ...state.settings, giftRules: rules.map(r => r.pack === old ? { ...r, pack: n } : r) }; await Store.saveSettings(); ui.drafts.new = null; refresh(); },
  ruleGift: async el => { const g = Math.max(0, parseInt(el.value, 10) || 0); state.settings = { ...state.settings, giftRules: state.settings.giftRules.map(r => r.pack === +el.dataset.pack ? { ...r, gift: g } : r) }; await Store.saveSettings(); ui.drafts.new = null; refresh(); },
  semDate: async el => { state.settings = { ...state.settings, [el.dataset.k]: el.value }; await Store.saveSettings(); refresh(); },
  importFile: el => { const f = el.files[0]; el.value = ''; doImport(f); },
};
const onHandler = e => { const el = e.target.closest('[data-on]'); if (el) ON[el.dataset.on]?.(el, e); };
document.addEventListener('input', e => { const el = e.target.closest('[data-on]'); if (el && ['pf', 'adjPreview'].includes(el.dataset.on) && !(el.type === 'date' || el.tagName === 'SELECT')) ON[el.dataset.on](el, e); });
document.addEventListener('change', e => { const el = e.target.closest('[data-on]'); if (el && !(['adjPreview'].includes(el.dataset.on) && false)) ON[el.dataset.on]?.(el, e); });

// 长按学生卡片 -> 学生详情
document.addEventListener('pointerdown', e => {
  const card = e.target.closest('.card[data-act=rollToggle]'); if (!card) return;
  card._longFired = false; const x = e.clientX, y = e.clientY;
  const t = setTimeout(() => { card._longFired = true; if (navigator.vibrate) navigator.vibrate(15); openStudentPage(card.dataset.id); }, 550);
  pressTimers.set(card, t);
  const cancel = ev => { if (ev.type === 'pointermove' && Math.hypot(ev.clientX - x, ev.clientY - y) < 10) return; clearTimeout(t); card.removeEventListener('pointerup', cancel); card.removeEventListener('pointermove', cancel); card.removeEventListener('pointercancel', cancel); card.removeEventListener('pointerleave', cancel); };
  ['pointerup', 'pointermove', 'pointercancel', 'pointerleave'].forEach(n => card.addEventListener(n, cancel));
});
document.addEventListener('contextmenu', e => { if (e.target.closest('.card')) e.preventDefault(); });

// ============ Service Worker ============
let swReg = null, updating = false;
function showUpdateBanner() {
  if ($('#updateBar')) return;
  const b = document.createElement('div'); b.id = 'updateBar'; b.className = 'update-bar';
  b.innerHTML = `<span>发现新版本</span><button class="btn primary sm" data-act="applyUpdate">立即更新</button>`;
  document.body.appendChild(b);
}
async function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  try {
    swReg = await navigator.serviceWorker.register('sw.js');
    if (swReg.waiting && navigator.serviceWorker.controller) showUpdateBanner();
    swReg.addEventListener('updatefound', () => { const nw = swReg.installing; nw?.addEventListener('statechange', () => { if (nw.state === 'installed' && navigator.serviceWorker.controller) showUpdateBanner(); }); });
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (updating) location.reload(); });
  } catch (e) { console.warn('SW 注册失败', e); }
}

// ============ 启动 ============
async function boot() {
  await Store.init();
  applyDefaultRoll(true);
  $('#tabbar').innerHTML = [['roll', '点名', I.roll], ['students', '学生', I.students], ['pay', '缴费', I.pay], ['summary', '汇总', I.summary]]
    .map(([k, l, ic]) => `<button class="tab" data-act="tab" data-tab="${k}" aria-label="${l}">${ic}<span>${l}</span></button>`).join('');
  refresh();
  document.documentElement.classList.add('ready');
  registerSW();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    if (!ui.manualClass && !ui.manualDate) { const d = defaultRoll(todayStr()); if (d.classId !== ui.rollClass || d.date !== ui.rollDate) { applyDefaultRoll(true); if (ui.tab === 'roll') refresh(); } }
    swReg?.update().catch(() => {});
  });
}
boot();
