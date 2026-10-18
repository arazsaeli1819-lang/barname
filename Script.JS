'use strict';

/* ---------- ابزارها ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const KEY = 'study-planner-v1';
const uid = () => Math.random().toString(36).slice(2, 10);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = n => String(n).padStart(2, '0');
const dkey = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = k => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const today = () => parse(dkey(new Date()));
const fn = n => Number(n).toLocaleString('fa-IR');
const fDay = new Intl.DateTimeFormat('fa-IR', { weekday: 'long' });
const fShort = new Intl.DateTimeFormat('fa-IR', { day: 'numeric', month: 'long' });
const fFull = new Intl.DateTimeFormat('fa-IR', { year: 'numeric', month: 'long', day: 'numeric' });

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}

/* ---------- داده‌ها ---------- */
const defaults = () => ({
  subjects: [], tasks: [], exams: [],
  pomoDone: {},
  settings: { theme: 'light', provider: 'anthropic', model: '', apiKey: '', focus: 25, brk: 5 }
});
let state = load();
function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY));
    if (raw && typeof raw === 'object') {
      const d = defaults();
      return { ...d, ...raw, settings: { ...d.settings, ...(raw.settings || {}) } };
    }
  } catch (e) { /* داده خراب */ }
  return defaults();
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); }
  catch (e) { toast('ذخیره‌سازی در مرورگر ممکن نشد'); }
}
const subj = id => state.subjects.find(s => s.id === id);

/* ---------- ناوبری و تم ---------- */
function showView(name) {
  $$('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + name));
  $$('#nav button').forEach(b => b.classList.toggle('active', b.dataset.view === name));
  window.scrollTo({ top: 0 });
}
$('#nav').addEventListener('click', e => {
  const b = e.target.closest('button[data-view]');
  if (b) showView(b.dataset.view);
});
function applyTheme() { document.documentElement.dataset.theme = state.settings.theme; }
$('#theme-btn').addEventListener('click', () => {
  state.settings.theme = state.settings.theme === 'dark' ? 'light' : 'dark';
  applyTheme(); save();
});

/* ---------- رندر ---------- */
function taskItem(t, compact) {
  const s = subj(t.subjectId);
  const meta = compact
    ? ''
    : `<small>${esc(s ? s.name : 'بدون درس')} · ${fn(t.minutes)} دقیقه · ${fShort.format(parse(t.date))}</small>`;
  const title = compact ? `${esc(t.title)}` : `<b>${esc(t.title)}</b>`;
  return `<li class="task ${t.done ? 'done' : ''}" style="--c:${esc(s ? s.color : '#888')}" ${compact ? `title="${esc(s ? s.name : '')} · ${t.minutes} دقیقه"` : ''}>
    <input type="checkbox" data-action="toggle" data-id="${t.id}" ${t.done ? 'checked' : ''} aria-label="انجام شد">
    <div class="grow">${title}${meta}</div>
    ${compact ? '' : `<button class="icon" data-action="del-task" data-id="${t.id}" title="حذف" aria-label="حذف">✕</button>`}
  </li>`;
}

function examDays(e) { return Math.round((parse(e.date) - today()) / 864e5); }
function upcomingExams() {
  return state.exams.filter(e => examDays(e) >= 0).sort((a, b) => a.date.localeCompare(b.date));
}
function examLabel(e) {
  const d = examDays(e);
  return d === 0 ? 'امروز!' : `${fn(d)} روز دیگر`;
}

function renderDashboard() {
  const k = dkey(new Date());
  const todays = state.tasks.filter(t => t.date === k);
  $('#st-today').textContent = `${fn(todays.filter(t => t.done).length)}/${fn(todays.length)}`;
  const total = state.tasks.length;
  const done = state.tasks.filter(t => t.done);
  $('#st-progress').textContent = fn(total ? Math.round(done.length / total * 100) : 0) + '٪';
  const mins = done.reduce((a, t) => a + t.minutes, 0);
  $('#st-hours').textContent = fn(Math.round(mins / 6) / 10);
  const next = upcomingExams()[0];
  $('#st-exam').textContent = next ? examLabel(next) : '—';

  $('#dash-today').innerHTML = todays.map(t => taskItem(t)).join('');

  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = addDays(today(), -i), key = dkey(d);
    const m = state.tasks.filter(t => t.done && t.date === key).reduce((a, t) => a + t.minutes, 0);
    days.push({ d, m });
  }
  const max = Math.max(60, ...days.map(x => x.m));
  $('#chart').innerHTML = days.map(x =>
    `<div class="bar"><span>${fn(x.m)}</span><i style="height:${Math.round(x.m / max * 120)}px"></i><span>${esc(fDay.format(x.d))}</span></div>`).join('');

  $('#dash-exams').innerHTML = upcomingExams().map(e => {
    const s = subj(e.subjectId);
    return `<li class="task" style="--c:${esc(s ? s.color : '#888')}"><div class="grow"><b>${esc(e.title)}</b><small>${esc(s ? s.name : '')} · ${fFull.format(parse(e.date))}</small></div><b>${examLabel(e)}</b></li>`;
  }).join('');
}

let weekStart = startOfWeek(new Date());
function startOfWeek(d) { // هفته از شنبه شروع می‌شود
  const x = parse(dkey(d));
  return addDays(x, -((x.getDay() + 1) % 7));
}
function renderWeek() {
  const end = addDays(weekStart, 6);
  $('#week-title').textContent = `${fShort.format(weekStart)} تا ${fShort.format(end)}`;
  const tk = dkey(new Date());
  let html = '';
  for (let i = 0; i < 7; i++) {
    const d = addDays(weekStart, i), key = dkey(d);
    const ts = state.tasks.filter(t => t.date === key);
    html += `<div class="day ${key === tk ? 'today' : ''}">
      <h3>${esc(fDay.format(d))}<small>${esc(fShort.format(d))}</small></h3>
      ${ts.map(t => taskItem(t, true)).join('')}
      <button class="add" data-action="add-on" data-date="${key}">+ افزودن</button>
    </div>`;
  }
  $('#week-grid').innerHTML = html;
}
$('#week-prev').onclick = () => { weekStart = addDays(weekStart, -7); renderWeek(); };
$('#week-next').onclick = () => { weekStart = addDays(weekStart, 7); renderWeek(); };
$('#week-today').onclick = () => { weekStart = startOfWeek(new Date()); renderWeek(); };

let taskFilter = 'all';
function renderTasks() {
  const k = dkey(new Date());
  let list = [...state.tasks];
  if (taskFilter === 'today') list = list.filter(t => t.date === k);
  if (taskFilter === 'pending') list = list.filter(t => !t.done);
  if (taskFilter === 'done') list = list.filter(t => t.done);
  list.sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title, 'fa'));
  $('#task-list').innerHTML = list.map(t => taskItem(t)).join('');
}
$('#task-filter').addEventListener('click', e => {
  const b = e.target.closest('button[data-f]');
  if (!b) return;
  taskFilter = b.dataset.f;
  $$('#task-filter button').forEach(x => x.classList.toggle('active', x === b));
  renderTasks();
});

function renderSubjects() {
  const opts = state.subjects.length
    ? state.subjects.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('')
    : '<option value="">(ابتدا درس اضافه کنید)</option>';
  const cur1 = $('#task-subject').value, cur2 = $('#exam-subject').value;
  $('#task-subject').innerHTML = opts;
  $('#exam-subject').innerHTML = opts;
  if (subj(cur1)) $('#task-subject').value = cur1;
  if (subj(cur2)) $('#exam-subject').value = cur2;
  const dn = { 1: 'آسان', 2: 'متوسط', 3: 'سخت' };
  $('#subject-list').innerHTML = state.subjects.map(s =>
    `<li class="task" style="--c:${esc(s.color)}"><div class="grow"><b>${esc(s.name)}</b><small>سختی: ${dn[s.difficulty]}</small></div>
    <button type="button" class="icon" data-action="del-subject" data-id="${s.id}" title="حذف" aria-label="حذف">✕</button></li>`).join('');
  $('#exam-list').innerHTML = [...state.exams].sort((a, b) => a.date.localeCompare(b.date)).map(e => {
    const s = subj(e.subjectId);
    return `<li class="task" style="--c:${esc(s ? s.color : '#888')}"><div class="grow"><b>${esc(e.title)}</b><small>${esc(s ? s.name : '')} · ${fFull.format(parse(e.date))}</small></div>
    <button type="button" class="icon" data-action="del-exam" data-id="${e.id}" title="حذف" aria-label="حذف">✕</button></li>`;
  }).join('');
}

function renderAll() {
  renderSubjects(); renderDashboard(); renderWeek(); renderTasks(); renderPomoCount();
}

/* ---------- رویدادهای عمومی (delegation) ---------- */
document.addEventListener('click', e => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const id = el.dataset.id;
  switch (el.dataset.action) {
    case 'del-task':
      state.tasks = state.tasks.filter(t => t.id !== id); break;
    case 'del-subject':
      if (!confirm('این درس و کارها و امتحان‌های مربوط به آن حذف شود؟')) return;
      state.subjects = state.subjects.filter(s => s.id !== id);
      state.tasks = state.tasks.filter(t => t.subjectId !== id);
      state.exams = state.exams.filter(x => x.subjectId !== id); break;
    case 'del-exam':
      state.exams = state.exams.filter(x => x.id !== id); break;
    case 'add-on':
      $('#task-date').value = el.dataset.date;
      showView('tasks');
      $('#task-title').focus();
      return;
    default: return;
  }
  save(); renderAll();
});
document.addEventListener('change', e => {
  const el = e.target.closest('[data-action="toggle"]');
  if (!el) return;
  const t = state.tasks.find(x => x.id === el.dataset.id);
  if (t) { t.done = el.checked; save(); renderAll(); }
});

/* ---------- فرم‌ها ---------- */
$('#task-form').addEventListener('submit', e => {
  e.preventDefault();
  const title = $('#task-title').value.trim();
  if (!title) return;
  state.tasks.push({
    id: uid(), title, subjectId: $('#task-subject').value || '',
    date: $('#task-date').value, minutes: Math.max(5, +$('#task-min').value || 45), done: false
  });
  $('#task-title').value = '';
  save(); renderAll(); toast('کار اضافه شد ✓');
});
$('#subject-form').addEventListener('submit', e => {
  e.preventDefault();
  const name = $('#sub-name').value.trim();
  if (!name) return;
  if (state.subjects.some(s => s.name === name)) return toast('این درس قبلاً اضافه شده');
  state.subjects.push({ id: uid(), name, difficulty: +$('#sub-diff').value, color: $('#sub-color').value });
  $('#sub-name').value = '';
  save(); renderAll(); toast('درس اضافه شد ✓');
});
$('#exam-form').addEventListener('submit', e => {
  e.preventDefault();
  const sid = $('#exam-subject').value;
  if (!sid) return toast('ابتدا یک درس اضافه کنید');
  state.exams.push({ id: uid(), title: $('#exam-title').value.trim(), subjectId: sid, date: $('#exam-date').value });
  $('#exam-title').value = '';
  save(); renderAll(); toast('امتحان اضافه شد ✓');
});

/* ---------- برنامه‌ساز هوشمند (آفلاین) ---------- */
function generatePlan() {
  const hours = +$('#plan-hours').value, days = +$('#plan-days').value;
  if (!state.subjects.length) return toast('ابتدا چند درس اضافه کنید');
  if (!(hours > 0)) return toast('ساعت مطالعه نامعتبر است');
  const start = today(), end = addDays(start, days - 1);
  state.tasks = state.tasks.filter(t => !(t.auto && !t.done && parse(t.date) >= start && parse(t.date) <= end));
  const BLOCK = 45;
  const blocks = Math.max(1, Math.round(hours * 60 / BLOCK));
  let created = 0;
  for (let i = 0; i < days; i++) {
    const day = addDays(start, i);
    const weights = state.subjects.map(s => {
      let w = s.difficulty;
      const ex = state.exams.filter(x => x.subjectId === s.id);
      const future = ex.filter(x => parse(x.date) >= day).sort((a, b) => a.date.localeCompare(b.date))[0];
      if (future) w *= 1 + 14 / (Math.round((parse(future.date) - day) / 864e5) + 1);
      else if (ex.length) w *= 0.3; // همه امتحان‌ها گذشته
      return w;
    });
    const count = state.subjects.map(() => 0);
    for (let b = 0; b < blocks; b++) {
      let best = 0, bestScore = -1;
      weights.forEach((w, idx) => {
        const sc = w / (count[idx] + 1);
        if (sc > bestScore) { bestScore = sc; best = idx; }
      });
      count[best]++;
    }
    count.forEach((c, idx) => {
      if (!c) return;
      state.tasks.push({
        id: uid(), title: `مطالعه ${state.subjects[idx].name}`, subjectId: state.subjects[idx].id,
        date: dkey(day), minutes: c * BLOCK, done: false, auto: true
      });
      created++;
    });
  }
  save(); renderAll();
  toast(`${fn(created)} کار در برنامه ساخته شد ✓`);
}
$('#plan-btn').addEventListener('click', generatePlan);

/* ---------- پومودورو ---------- */
const pomo = { mode: 'focus', running: false, end: 0, remaining: 0, timer: null };
const fmtTime = s => `${pad(Math.floor(s / 60))}:${pad(s % 60)}`.replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[d]);
const modeSecs = () => (pomo.mode === 'focus' ? state.settings.focus : state.settings.brk) * 60;
function renderPomo() {
  $('#pomo-time').textContent = fmtTime(pomo.remaining);
  $('#pomo-mode').textContent = pomo.mode === 'focus' ? 'تمرکز 🎯' : 'استراحت ☕';
  $('#pomo-start').textContent = pomo.running ? 'توقف' : 'شروع';
  document.title = pomo.running ? `${fmtTime(pomo.remaining)} · برنامه‌ریز درسی` : 'برنامه‌ریز درسی هوشمند';
}
function renderPomoCount() {
  $('#pomo-count').textContent = fn(state.pomoDone[dkey(new Date())] || 0);
}
function beep() {
  try {
    const ac = new (window.AudioContext || window.webkitAudioContext)();
    [0, 0.25, 0.5].forEach(t => {
      const o = ac.createOscillator(), g = ac.createGain();
      o.frequency.value = 880; o.connect(g); g.connect(ac.destination);
      g.gain.setValueAtTime(0.15, ac.currentTime + t);
      o.start(ac.currentTime + t); o.stop(ac.currentTime + t + 0.18);
    });
  } catch (e) { /* بدون صدا */ }
}
function pomoTick() {
  pomo.remaining = Math.max(0, Math.round((pomo.end - Date.now()) / 1000));
  if (pomo.remaining <= 0) {
    clearInterval(pomo.timer); pomo.running = false;
    beep();
    if (pomo.mode === 'focus') {
      const k = dkey(new Date());
      state.pomoDone[k] = (state.pomoDone[k] || 0) + 1;
      save(); renderPomoCount();
      toast('آفرین! وقت استراحته ☕');
    } else toast('استراحت تمام شد، برگردیم سر کار 🎯');
    pomo.mode = pomo.mode === 'focus' ? 'break' : 'focus';
    pomo.remaining = modeSecs();
  }
  renderPomo();
}
$('#pomo-start').onclick = () => {
  if (pomo.running) {
    clearInterval(pomo.timer); pomo.running = false;
  } else {
    pomo.running = true;
    pomo.end = Date.now() + pomo.remaining * 1000;
    pomo.timer = setInterval(pomoTick, 250);
  }
  renderPomo();
};
$('#pomo-reset').onclick = () => {
  clearInterval(pomo.timer); pomo.running = false; pomo.remaining = modeSecs(); renderPomo();
};
$('#pomo-skip').onclick = () => {
  clearInterval(pomo.timer); pomo.running = false;
  pomo.mode = pomo.mode === 'focus' ? 'break' : 'focus';
  pomo.remaining = modeSecs(); renderPomo();
};
['pomo-focus', 'pomo-break'].forEach(id => $('#' + id).addEventListener('change', () => {
  const f = Math.min(90, Math.max(5, +$('#pomo-focus').value || 25));
  const b = Math.min(30, Math.max(1, +$('#pomo-break').value || 5));
  state.settings.focus = f; state.settings.brk = b;
  $('#pomo-focus').value = f; $('#pomo-break').value = b;
  save();
  if (!pomo.running) { pomo.remaining = modeSecs(); renderPomo(); }
}));

/* ---------- دستیار هوش مصنوعی ---------- */
const chat = [];
function aiContext() {
  const k = dkey(new Date());
  const subs = state.subjects.map(s => `${s.name} (سختی ${s.difficulty} از ۳)`).join('، ') || 'ندارد';
  const exams = upcomingExams().map(e => `${e.title} ${subj(e.subjectId)?.name || ''} در ${e.date} (${examDays(e)} روز دیگر)`).join('؛ ') || 'ندارد';
  const pending = state.tasks.filter(t => !t.done && t.date <= dkey(addDays(today(), 7)))
    .slice(0, 30).map(t => `${t.title} [${t.date}${t.date < k ? '، عقب‌افتاده' : ''}]`).join('؛ ') || 'ندارد';
  return `تو دستیار برنامه‌ریزی درسی یک دانش‌آموز/دانشجو هستی. همیشه فارسی، کوتاه، دوستانه و کاربردی پاسخ بده.
تاریخ امروز (میلادی): ${k}
درس‌ها: ${subs}
امتحان‌های پیش رو: ${exams}
کارهای انجام‌نشده تا یک هفته آینده: ${pending}`;
}
function addMsg(text, cls) {
  const d = document.createElement('div');
  d.className = 'msg ' + cls;
  d.textContent = text;
  $('#chat-log').appendChild(d);
  $('#chat-log').scrollTop = $('#chat-log').scrollHeight;
  return d;
}
async function callAI(messages, system) {
  const { provider, apiKey } = state.settings;
  const model = state.settings.model.trim() || (provider === 'anthropic' ? 'claude-sonnet-5-5' : 'gpt-4o-mini');
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), 60000);
  try {
    let res, data;
    if (provider === 'anthropic') {
      res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST', signal: ctrl.signal,
        headers: {
          'content-type': 'application/json', 'x-api-key': apiKey,
          'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify({ model, max_tokens: 1200, system, messages })
      });
      data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message || res.statusText);
      return (data.content || []).map(c => c.text || '').join('').trim();
    }
    res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST', signal: ctrl.signal,
      headers: { 'content-type': 'application/json', Authorization: 'Bearer ' + apiKey },
      body: JSON.stringify({ model, max_tokens: 1200, messages: [{ role: 'system', content: system }, ...messages] })
    });
    data = await res.json();
    if (!res.ok) throw new Error(data?.error?.message || res.statusText);
    return (data.choices?.[0]?.message?.content || '').trim();
  } finally { clearTimeout(to); }
}
async function ask(text) {
  if (!state.settings.apiKey) {
    addMsg('برای استفاده از دستیار، ابتدا در «تنظیمات» کلید API را وارد کنید.', 'bot err');
    return;
  }
  addMsg(text, 'user');
  chat.push({ role: 'user', content: text });
  const pending = addMsg('در حال فکر کردن…', 'bot');
  $('#chat-send').disabled = true;
  try {
    const reply = await callAI(chat.slice(-12), aiContext());
    pending.textContent = reply || '(پاسخی دریافت نشد)';
    chat.push({ role: 'assistant', content: reply || '...' });
  } catch (err) {
    chat.pop();
    pending.classList.add('err');
    pending.textContent = err.name === 'AbortError'
      ? 'زمان درخواست تمام شد. دوباره تلاش کنید.'
      : 'خطا: ' + err.message;
  } finally {
    $('#chat-send').disabled = false;
    $('#chat-log').scrollTop = $('#chat-log').scrollHeight;
  }
}
$('#chat-form').addEventListener('submit', e => {
  e.preventDefault();
  const v = $('#chat-input').value.trim();
  if (!v) return;
  $('#chat-input').value = '';
  ask(v);
});
$('.quick').addEventListener('click', e => {
  const c = e.target.closest('.chip');
  if (c) ask(c.dataset.q);
});

/* ---------- تنظیمات و پشتیبان ---------- */
function fillSettings() {
  const s = state.settings;
  $('#set-provider').value = s.provider;
  $('#set-model').value = s.model;
  $('#set-key').value = s.apiKey;
  $('#pomo-focus').value = s.focus;
  $('#pomo-break').value = s.brk;
}
$('#settings-form').addEventListener('submit', e => {
  e.preventDefault();
  state.settings.provider = $('#set-provider').value;
  state.settings.model = $('#set-model').value.trim();
  state.settings.apiKey = $('#set-key').value.trim();
  save(); toast('تنظیمات ذخیره شد ✓');
});
$('#export-btn').onclick = () => {
  const copy = JSON.parse(JSON.stringify(state));
  copy.settings.apiKey = ''; // کلید در پشتیبان قرار نمی‌گیرد
  const blob = new Blob([JSON.stringify(copy, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `study-planner-${dkey(new Date())}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};
$('#import-file').addEventListener('change', async e => {
  const f = e.target.files[0];
  if (!f) return;
  try {
    const d = JSON.parse(await f.text());
    if (!Array.isArray(d.subjects) || !Array.isArray(d.tasks)) throw new Error('bad');
    const key = state.settings.apiKey;
    const base = defaults();
    state = { ...base, ...d, exams: d.exams || [], settings: { ...base.settings, ...(d.settings || {}), apiKey: key } };
    save(); applyTheme(); fillSettings(); renderAll(); toast('پشتیبان بازیابی شد ✓');
  } catch (err) { toast('فایل پشتیبان معتبر نیست'); }
  e.target.value = '';
});
$('#reset-btn').onclick = () => {
  if (!confirm('همه داده‌ها برای همیشه پاک شود؟')) return;
  const key = state.settings.apiKey;
  state = defaults(); state.settings.apiKey = key;
  save(); applyTheme(); fillSettings(); renderAll(); toast('همه داده‌ها پاک شد');
};

/* ---------- شروع ---------- */
$('#task-date').value = dkey(new Date());
$('#exam-date').value = dkey(addDays(new Date(), 14));
applyTheme(); fillSettings();
pomo.remaining = modeSecs();
renderAll(); renderPomo();
addMsg('سلام! من دستیار درسی تو هستم. هر سؤالی درباره‌ی برنامه‌ریزی و مطالعه داری بپرس 👋', 'bot');
