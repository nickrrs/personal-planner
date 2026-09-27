'use strict';

const PRIORITIES = {
  1: { label: 'Urgente', color: '#ef4444' },
  2: { label: 'Alta', color: '#f97316' },
  3: { label: 'Média', color: '#eab308' },
  4: { label: 'Baixa', color: '#22c55e' },
};
const HOUR_H = 64;
const DEFAULT_COLOR = '#64748b';

const DEFAULT_DATA = () => ({
  version: 1,
  settings: { mode: 'schedule' },
  categories: [
    { id: uid(), name: 'Trabalho', color: '#3b82f6' },
    { id: uid(), name: 'Estudos', color: '#a855f7' },
    { id: uid(), name: 'Pessoal', color: '#10b981' },
    { id: uid(), name: 'Saúde', color: '#f43f5e' },
  ],
  tasks: [],
});

const state = {
  data: null,
  date: todayStr(),
  selectedId: null,
  filterCat: 'all',
  scrollTop: null,
};

// ---------- utilidades ----------

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
function pad(n) {
  return String(n).padStart(2, '0');
}
function toDateStr(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function todayStr() {
  return toDateStr(new Date());
}
function parseDate(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}
function addDays(s, n) {
  const d = parseDate(s);
  d.setDate(d.getDate() + n);
  return toDateStr(d);
}
function timeToMin(t) {
  if (!t) return null;
  const [hh, mm] = t.split(':').map(Number);
  return hh * 60 + mm;
}
function minToTime(m) {
  m = Math.max(0, Math.min(1439, m));
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}
function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1024 / 1024).toFixed(1) + ' MB';
}
function formatDateTime(iso) {
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

const $ = (sel) => document.querySelector(sel);

function h(tag, props, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style') {
      for (const [sk, sv] of Object.entries(v)) {
        if (sk.startsWith('--')) el.style.setProperty(sk, sv);
        else el.style[sk] = sv;
      }
    } else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'value') el.value = v;
    else if (k === 'checked') el.checked = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

// ---------- dados ----------

let saveTimer = null;
function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    window.api.save(state.data);
  }, 250);
}
window.addEventListener('beforeunload', () => {
  if (saveTimer) {
    clearTimeout(saveTimer);
    window.api.saveSync(state.data);
  }
});

function normalizeTask(t) {
  return {
    id: t.id || uid(),
    date: t.date || state.date,
    title: t.title || '',
    start: t.start || '',
    end: t.end || '',
    categoryId: t.categoryId || '',
    priority: Number(t.priority) || 3,
    done: !!t.done,
    description: t.description || '',
    checklist: Array.isArray(t.checklist) ? t.checklist : [],
    comments: Array.isArray(t.comments) ? t.comments : [],
    attachments: Array.isArray(t.attachments) ? t.attachments : [],
    createdAt: t.createdAt || new Date().toISOString(),
  };
}

const getTask = (id) => state.data.tasks.find((t) => t.id === id);
const getCat = (id) => state.data.categories.find((c) => c.id === id);

function dayTasks(date = state.date) {
  return state.data.tasks.filter((t) => t.date === date);
}

function visibleTasks() {
  return dayTasks().filter((t) => {
    if (state.filterCat === 'all') return true;
    if (state.filterCat === 'none') return !getCat(t.categoryId);
    return t.categoryId === state.filterCat;
  });
}

function sortTasks(list) {
  return [...list].sort(
    (a, b) =>
      a.done - b.done ||
      a.priority - b.priority ||
      (timeToMin(a.start) ?? 9999) - (timeToMin(b.start) ?? 9999) ||
      a.createdAt.localeCompare(b.createdAt)
  );
}

function createTask(fields = {}) {
  const t = normalizeTask({ date: state.date, ...fields });
  if (state.filterCat !== 'all' && state.filterCat !== 'none' && !fields.categoryId) {
    t.categoryId = state.filterCat;
  }
  state.data.tasks.push(t);
  persist();
  return t;
}

function deleteTask(t) {
  if (!confirm(`Excluir a atividade "${t.title || 'sem título'}"?`)) return;
  t.attachments.forEach((a) => window.api.deleteAttachment(a.file));
  state.data.tasks = state.data.tasks.filter((x) => x.id !== t.id);
  state.selectedId = null;
  persist();
  render();
}

function copyPendingFromPreviousDay() {
  const prev = addDays(state.date, -1);
  const pending = dayTasks(prev).filter((t) => !t.done);
  if (!pending.length) {
    alert('Não há atividades pendentes no dia anterior.');
    return;
  }
  pending.forEach((t) => {
    state.data.tasks.push(
      normalizeTask({
        ...JSON.parse(JSON.stringify(t)),
        id: uid(),
        date: state.date,
        attachments: [],
        createdAt: new Date().toISOString(),
      })
    );
  });
  persist();
  render();
}

// ---------- ações de UI ----------

function changed() {
  persist();
  render();
}

// Atualiza tudo menos o painel de detalhes (preserva o foco durante a edição).
function changedLight() {
  persist();
  renderSidebar();
  renderMain();
}

function selectTask(id, focusTitle = false) {
  state.selectedId = id;
  render();
  if (focusTitle) {
    const input = $('#detail .title-input');
    if (input) {
      input.focus();
      input.select();
    }
  }
}

function setDate(date) {
  if (!date) return;
  state.date = date;
  state.scrollTop = null;
  const sel = state.selectedId && getTask(state.selectedId);
  if (sel && sel.date !== date) state.selectedId = null;
  render();
}

function setMode(mode) {
  state.data.settings.mode = mode;
  state.scrollTop = null;
  changed();
}

function newTaskDefault() {
  let fields = {};
  if (state.data.settings.mode === 'schedule') {
    let start = 9 * 60;
    if (state.date === todayStr()) {
      const now = new Date();
      start = Math.min((now.getHours() + 1) * 60, 23 * 60);
    }
    fields = { start: minToTime(start), end: minToTime(start + 60) };
  }
  const t = createTask(fields);
  selectTask(t.id, true);
}

// ---------- render ----------

function render() {
  renderHeader();
  renderSidebar();
  renderMain();
  renderDetail();
}

function renderHeader() {
  $('#datePicker').value = state.date;
  const label = parseDate(state.date).toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  $('#dateLabel').textContent = label.charAt(0).toUpperCase() + label.slice(1) + (state.date === todayStr() ? ' · hoje' : '');
  document.querySelectorAll('.mode-btn').forEach((b) => {
    b.classList.toggle('active', b.dataset.mode === state.data.settings.mode);
  });
}

function renderSidebar() {
  const side = $('#sidebar');
  side.innerHTML = '';
  const tasks = dayTasks();
  const done = tasks.filter((t) => t.done).length;
  const pct = tasks.length ? Math.round((done / tasks.length) * 100) : 0;

  side.append(
    h(
      'div',
      { class: 'side-card' },
      h('div', { class: 'side-title' }, 'Progresso do dia'),
      h('div', { class: 'progress-num' }, `${done}/${tasks.length}`, h('span', {}, ` concluídas · ${pct}%`)),
      h('div', { class: 'progress' }, h('div', { class: 'progress-bar', style: { width: pct + '%' } }))
    )
  );

  const catItem = (id, name, color, count) =>
    h(
      'button',
      {
        class: 'filter-item' + (state.filterCat === id ? ' active' : ''),
        onclick: () => {
          state.filterCat = id;
          render();
        },
      },
      color ? h('span', { class: 'dot', style: { background: color } }) : h('span', { class: 'dot all' }),
      h('span', { class: 'filter-name' }, name),
      h('span', { class: 'count' }, count)
    );

  const filterList = h(
    'div',
    { class: 'side-card' },
    h('div', { class: 'side-title' }, 'Categorias'),
    catItem('all', 'Todas', null, tasks.length),
    state.data.categories.map((c) =>
      catItem(c.id, c.name, c.color, tasks.filter((t) => t.categoryId === c.id).length)
    )
  );
  const noCat = tasks.filter((t) => !getCat(t.categoryId)).length;
  if (noCat) filterList.append(catItem('none', 'Sem categoria', DEFAULT_COLOR, noCat));
  side.append(filterList);

  side.append(
    h(
      'div',
      { class: 'side-card' },
      h('div', { class: 'side-title' }, 'Prioridades'),
      Object.entries(PRIORITIES).map(([k, p]) =>
        h(
          'div',
          { class: 'prio-row' },
          h('span', { class: 'dot', style: { background: p.color } }),
          h('span', { class: 'filter-name' }, p.label),
          h('span', { class: 'count' }, tasks.filter((t) => t.priority === Number(k) && !t.done).length)
        )
      )
    )
  );

  side.append(
    h('button', { class: 'btn ghost full', onclick: copyPendingFromPreviousDay }, 'Copiar pendentes do dia anterior')
  );
}

function renderMain() {
  const main = $('#main');
  const prevScroll = main.querySelector('.timeline-scroll');
  if (prevScroll) state.scrollTop = prevScroll.scrollTop;
  main.innerHTML = '';
  const tasks = visibleTasks();
  if (state.data.settings.mode === 'schedule') renderSchedule(main, tasks);
  else renderGeneral(main, tasks);
}

function quickAdd(placeholder, extra = {}) {
  const input = h('input', {
    class: 'input quick-input',
    placeholder,
    onkeydown: (e) => {
      if (e.key === 'Enter' && input.value.trim()) {
        const title = input.value.trim();
        input.value = '';
        createTask({ title, priority: Number(prioSel.value), ...extra });
        renderSidebar();
        renderMain();
        const again = $('#main .quick-input');
        if (again) again.focus();
      }
    },
  });
  const prioSel = h(
    'select',
    { class: 'input small', title: 'Prioridade' },
    Object.entries(PRIORITIES).map(([k, p]) => h('option', { value: k }, p.label))
  );
  prioSel.value = '3';
  return h('div', { class: 'quick-add' }, input, prioSel);
}

function taskCard(t, compact = false) {
  const cat = getCat(t.categoryId);
  const pr = PRIORITIES[t.priority];
  const clDone = t.checklist.filter((i) => i.done).length;
  return h(
    'div',
    {
      class: 'card' + (t.done ? ' done' : '') + (state.selectedId === t.id ? ' selected' : '') + (compact ? ' compact' : ''),
      style: { '--cat': cat ? cat.color : DEFAULT_COLOR },
      onclick: () => selectTask(t.id),
    },
    h('input', {
      type: 'checkbox',
      class: 'chk',
      checked: t.done,
      title: 'Concluir',
      onclick: (e) => e.stopPropagation(),
      onchange: (e) => {
        t.done = e.target.checked;
        changed();
      },
    }),
    h(
      'div',
      { class: 'card-body' },
      h('div', { class: 'card-title' }, t.title || '(sem título)'),
      h(
        'div',
        { class: 'meta' },
        t.start && h('span', { class: 'time' }, t.start + (t.end ? ' – ' + t.end : '')),
        cat && h('span', { class: 'chip', style: { '--c': cat.color } }, cat.name),
        h('span', { class: 'prio', style: { '--p': pr.color } }, pr.label),
        t.checklist.length > 0 &&
          h('span', { class: 'ind', title: 'Checklist' }, `\u2611 ${clDone}/${t.checklist.length}`),
        t.comments.length > 0 && h('span', { class: 'ind', title: 'Comentários' }, `\u{1F4AC} ${t.comments.length}`),
        t.attachments.length > 0 && h('span', { class: 'ind', title: 'Anexos' }, `\u{1F4CE} ${t.attachments.length}`)
      )
    )
  );
}

function emptyState(text) {
  return h('div', { class: 'empty' }, text);
}

function renderGeneral(main, tasks) {
  const sorted = sortTasks(tasks);
  const pending = sorted.filter((t) => !t.done);
  const done = sorted.filter((t) => t.done);
  main.append(
    h(
      'div',
      { class: 'general' },
      h('div', { class: 'section-head' }, h('h2', {}, 'O que vou fazer hoje'), h('span', { class: 'muted' }, `${pending.length} pendentes`)),
      quickAdd('Adicionar atividade e pressionar Enter...'),
      h('div', { class: 'list' }, pending.length ? pending.map((t) => taskCard(t)) : emptyState('Nenhuma atividade pendente para este dia.')),
      done.length > 0 && h('div', { class: 'section-head sub' }, h('h3', {}, `Concluídas (${done.length})`)),
      done.length > 0 && h('div', { class: 'list' }, done.map((t) => taskCard(t)))
    )
  );
}

function layoutTimed(tasks) {
  const items = tasks
    .map((t) => {
      const s = timeToMin(t.start);
      let e = timeToMin(t.end);
      if (e == null) e = Math.min(s + 30, 1440);
      else if (e <= s) e = 1440;
      return { t, s, e };
    })
    .sort((a, b) => a.s - b.s || b.e - a.e);

  const out = [];
  let cluster = [];
  let cols = [];
  let clusterEnd = -1;
  const flush = () => {
    cluster.forEach((it) => (it.cols = cols.length));
    out.push(...cluster);
    cluster = [];
    cols = [];
    clusterEnd = -1;
  };
  for (const it of items) {
    if (cluster.length && it.s >= clusterEnd) flush();
    let c = cols.findIndex((end) => end <= it.s);
    if (c === -1) {
      c = cols.length;
      cols.push(it.e);
    } else cols[c] = it.e;
    it.col = c;
    cluster.push(it);
    clusterEnd = Math.max(clusterEnd, it.e);
  }
  if (cluster.length) flush();
  return out;
}

function renderSchedule(main, tasks) {
  const timed = tasks.filter((t) => t.start);
  const untimed = sortTasks(tasks.filter((t) => !t.start));

  const lane = h('div', {
    class: 'lane',
    title: 'Duplo clique em um horário vazio para criar uma atividade',
    ondblclick: (e) => {
      if (e.target !== lane) return;
      const minute = Math.floor(e.offsetY / HOUR_H * 2) * 30;
      const t = createTask({ start: minToTime(minute), end: minToTime(Math.min(minute + 60, 1439)) });
      selectTask(t.id, true);
    },
  });

  for (const it of layoutTimed(timed)) {
    const t = it.t;
    const cat = getCat(t.categoryId);
    const pr = PRIORITIES[t.priority];
    const height = Math.max(((it.e - it.s) / 60) * HOUR_H, 22);
    const block = h(
      'div',
      {
        class: 'block' + (t.done ? ' done' : '') + (state.selectedId === t.id ? ' selected' : '') + (height < 44 ? ' short' : ''),
        style: {
          top: (it.s / 60) * HOUR_H + 'px',
          height: height - 2 + 'px',
          left: `calc(${(it.col / it.cols) * 100}% + 2px)`,
          width: `calc(${100 / it.cols}% - 4px)`,
          '--cat': cat ? cat.color : DEFAULT_COLOR,
        },
        onclick: () => selectTask(t.id),
      },
      h('input', {
        type: 'checkbox',
        class: 'chk',
        checked: t.done,
        onclick: (e) => e.stopPropagation(),
        onchange: (e) => {
          t.done = e.target.checked;
          changed();
        },
      }),
      h(
        'div',
        { class: 'block-body' },
        h('div', { class: 'block-title' }, h('span', { class: 'dot', style: { background: pr.color }, title: pr.label }), t.title || '(sem título)'),
        h('div', { class: 'block-meta' }, `${t.start}${t.end ? ' – ' + t.end : ''}${cat ? ' · ' + cat.name : ''}`)
      )
    );
    lane.append(block);
  }

  if (state.date === todayStr()) {
    const now = new Date();
    lane.append(h('div', { class: 'now-line', style: { top: ((now.getHours() * 60 + now.getMinutes()) / 60) * HOUR_H + 'px' } }));
  }

  const hours = h('div', { class: 'hours' });
  for (let i = 0; i < 24; i++) {
    hours.append(h('div', { class: 'hour', style: { height: HOUR_H + 'px' } }, h('span', {}, `${pad(i)}:00`)));
  }

  const timeline = h('div', { class: 'timeline', style: { height: 24 * HOUR_H + 'px', '--hour': HOUR_H + 'px' } }, hours, lane);
  const scroll = h('div', { class: 'timeline-scroll' }, timeline);

  const side = h(
    'div',
    { class: 'untimed' },
    h('div', { class: 'section-head' }, h('h3', {}, 'Sem horário'), h('span', { class: 'muted' }, untimed.length)),
    quickAdd('Adicionar sem horário...'),
    h('div', { class: 'list' }, untimed.length ? untimed.map((t) => taskCard(t, true)) : emptyState('Atividades sem horário aparecem aqui.'))
  );

  main.append(h('div', { class: 'schedule' }, h('div', { class: 'timeline-wrap' }, scroll), side));

  if (state.scrollTop != null) scroll.scrollTop = state.scrollTop;
  else {
    const first = timed.length ? Math.min(...timed.map((t) => timeToMin(t.start))) : 7 * 60;
    scroll.scrollTop = Math.max(0, (first / 60 - 0.5) * HOUR_H);
  }
}

// ---------- painel de detalhes ----------

function field(label, control) {
  return h('label', { class: 'field' }, h('span', { class: 'field-label' }, label), control);
}

function renderDetail() {
  const el = $('#detail');
  el.innerHTML = '';
  const t = state.selectedId && getTask(state.selectedId);
  if (!t) {
    el.classList.add('hidden');
    return;
  }
  el.classList.remove('hidden');

  const catSel = h(
    'select',
    { class: 'input', onchange: (e) => { t.categoryId = e.target.value; changedLight(); } },
    h('option', { value: '' }, 'Sem categoria'),
    state.data.categories.map((c) => h('option', { value: c.id }, c.name))
  );
  catSel.value = getCat(t.categoryId) ? t.categoryId : '';

  const prioSel = h(
    'select',
    { class: 'input', onchange: (e) => { t.priority = Number(e.target.value); changedLight(); } },
    Object.entries(PRIORITIES).map(([k, p]) => h('option', { value: k }, p.label))
  );
  prioSel.value = String(t.priority);

  const startIn = h('input', {
    type: 'time',
    class: 'input',
    value: t.start,
    onchange: (e) => {
      t.start = e.target.value;
      if (t.start && t.end && timeToMin(t.end) <= timeToMin(t.start)) {
        t.end = minToTime(timeToMin(t.start) + 60);
        endIn.value = t.end;
      }
      changedLight();
    },
  });
  const endIn = h('input', {
    type: 'time',
    class: 'input',
    value: t.end,
    onchange: (e) => { t.end = e.target.value; changedLight(); },
  });

  el.append(
    h(
      'div',
      { class: 'drawer-head' },
      h('input', { type: 'checkbox', class: 'chk big', checked: t.done, title: 'Concluída', onchange: (e) => { t.done = e.target.checked; changedLight(); } }),
      h('input', { class: 'title-input', value: t.title, placeholder: 'Título da atividade', oninput: (e) => { t.title = e.target.value; changedLight(); } }),
      h('button', { class: 'btn icon', title: 'Fechar (Esc)', onclick: () => selectTask(null) }, '\u2715')
    ),
    h(
      'div',
      { class: 'drawer-body' },
      h('div', { class: 'grid2' },
        field('Data', h('input', { type: 'date', class: 'input', value: t.date, onchange: (e) => { if (e.target.value) { t.date = e.target.value; changedLight(); } } })),
        field('Prioridade', prioSel)
      ),
      h('div', { class: 'grid3' },
        field('Início', startIn),
        field('Fim', endIn),
        h('button', { class: 'btn ghost align-end', title: 'Remover horário (vai para "Sem horário")', onclick: () => { t.start = ''; t.end = ''; changed(); } }, 'Sem horário')
      ),
      field('Categoria', catSel),
      field('Descrição', h('textarea', { class: 'input', rows: 3, placeholder: 'Detalhes da atividade...', oninput: (e) => { t.description = e.target.value; persist(); } }, t.description)),
      checklistSection(t),
      commentsSection(t),
      attachmentsSection(t)
    ),
    h('div', { class: 'drawer-foot' }, h('button', { class: 'btn danger', onclick: () => deleteTask(t) }, 'Excluir atividade'))
  );
}

function checklistSection(t) {
  const done = t.checklist.filter((i) => i.done).length;
  const pct = t.checklist.length ? (done / t.checklist.length) * 100 : 0;
  const add = h('input', {
    class: 'input',
    placeholder: 'Novo item e Enter...',
    onkeydown: (e) => {
      if (e.key === 'Enter' && add.value.trim()) {
        t.checklist.push({ id: uid(), text: add.value.trim(), done: false });
        changed();
        const again = document.querySelector('#detail .checklist-add');
        if (again) again.focus();
      }
    },
  });
  add.classList.add('checklist-add');
  return h(
    'div',
    { class: 'section' },
    h('div', { class: 'section-title' }, `Checklist`, t.checklist.length > 0 && h('span', { class: 'muted' }, ` ${done}/${t.checklist.length}`)),
    t.checklist.length > 0 && h('div', { class: 'progress thin' }, h('div', { class: 'progress-bar', style: { width: pct + '%' } })),
    t.checklist.map((item) =>
      h(
        'div',
        { class: 'check-item' + (item.done ? ' done' : '') },
        h('input', { type: 'checkbox', class: 'chk', checked: item.done, onchange: (e) => { item.done = e.target.checked; changed(); } }),
        h('input', { class: 'inline-input', value: item.text, oninput: (e) => { item.text = e.target.value; persist(); } }),
        h('button', { class: 'btn icon tiny', title: 'Remover', onclick: () => { t.checklist = t.checklist.filter((x) => x !== item); changed(); } }, '\u2715')
      )
    ),
    add
  );
}

function commentsSection(t) {
  const ta = h('textarea', { class: 'input', rows: 2, placeholder: 'Escreva um comentário (Ctrl+Enter para enviar)...' });
  const submit = () => {
    const text = ta.value.trim();
    if (!text) return;
    t.comments.push({ id: uid(), text, createdAt: new Date().toISOString() });
    changed();
  };
  ta.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.ctrlKey) submit();
  });
  return h(
    'div',
    { class: 'section' },
    h('div', { class: 'section-title' }, 'Comentários', t.comments.length > 0 && h('span', { class: 'muted' }, ` ${t.comments.length}`)),
    t.comments.map((c) =>
      h(
        'div',
        { class: 'comment' },
        h('div', { class: 'comment-head' }, h('span', { class: 'muted' }, formatDateTime(c.createdAt)),
          h('button', { class: 'btn icon tiny', title: 'Excluir comentário', onclick: () => { t.comments = t.comments.filter((x) => x !== c); changed(); } }, '\u2715')),
        h('div', { class: 'comment-text' }, c.text)
      )
    ),
    ta,
    h('button', { class: 'btn small', onclick: submit }, 'Comentar')
  );
}

function attachmentsSection(t) {
  return h(
    'div',
    { class: 'section' },
    h('div', { class: 'section-title' }, 'Anexos', t.attachments.length > 0 && h('span', { class: 'muted' }, ` ${t.attachments.length}`)),
    t.attachments.map((a) =>
      h(
        'div',
        { class: 'attachment' },
        h('button', { class: 'link', title: 'Abrir arquivo', onclick: () => window.api.openAttachment(a.file) }, '\u{1F4CE} ' + a.name),
        h('span', { class: 'muted' }, formatSize(a.size)),
        h('button', { class: 'btn icon tiny', title: 'Mostrar na pasta', onclick: () => window.api.revealAttachment(a.file) }, '\u{1F4C2}'),
        h('button', {
          class: 'btn icon tiny',
          title: 'Remover anexo',
          onclick: () => {
            if (!confirm(`Remover o anexo "${a.name}"?`)) return;
            window.api.deleteAttachment(a.file);
            t.attachments = t.attachments.filter((x) => x !== a);
            changed();
          },
        }, '\u2715')
      )
    ),
    h('button', {
      class: 'btn small',
      onclick: async () => {
        const files = await window.api.pickAttachments();
        if (files.length) {
          t.attachments.push(...files);
          changed();
        }
      },
    }, '+ Adicionar arquivo')
  );
}

// ---------- modal de categorias ----------

function openCategories() {
  const root = $('#modalRoot');
  const close = () => {
    root.innerHTML = '';
    render();
  };

  const draw = () => {
    root.innerHTML = '';
    const nameIn = h('input', { class: 'input', placeholder: 'Nome da nova categoria' });
    const colorIn = h('input', { type: 'color', class: 'color', value: '#0ea5e9' });
    const addCat = () => {
      const name = nameIn.value.trim();
      if (!name) return;
      state.data.categories.push({ id: uid(), name, color: colorIn.value });
      persist();
      draw();
      root.querySelector('.modal input.input').focus();
    };
    nameIn.addEventListener('keydown', (e) => e.key === 'Enter' && addCat());

    root.append(
      h(
        'div',
        { class: 'overlay', onmousedown: (e) => e.target === e.currentTarget && close() },
        h(
          'div',
          { class: 'modal' },
          h('div', { class: 'drawer-head' }, h('h2', {}, 'Categorias'), h('button', { class: 'btn icon', onclick: close }, '\u2715')),
          h('div', { class: 'cat-add' }, colorIn, nameIn, h('button', { class: 'btn primary', onclick: addCat }, 'Adicionar')),
          h(
            'div',
            { class: 'cat-list' },
            state.data.categories.length === 0 && emptyState('Nenhuma categoria ainda.'),
            state.data.categories.map((c) => {
              const count = state.data.tasks.filter((t) => t.categoryId === c.id).length;
              return h(
                'div',
                { class: 'cat-row' },
                h('input', { type: 'color', class: 'color', value: c.color, oninput: (e) => { c.color = e.target.value; persist(); } }),
                h('input', { class: 'input', value: c.name, oninput: (e) => { c.name = e.target.value; persist(); } }),
                h('span', { class: 'muted nowrap' }, `${count} atividade${count === 1 ? '' : 's'}`),
                h('button', {
                  class: 'btn icon',
                  title: 'Excluir categoria',
                  onclick: () => {
                    if (!confirm(`Excluir a categoria "${c.name}"? As atividades ficarão sem categoria.`)) return;
                    state.data.categories = state.data.categories.filter((x) => x !== c);
                    state.data.tasks.forEach((t) => { if (t.categoryId === c.id) t.categoryId = ''; });
                    if (state.filterCat === c.id) state.filterCat = 'all';
                    persist();
                    draw();
                  },
                }, '\u{1F5D1}')
              );
            })
          )
        )
      )
    );
  };
  draw();
}

// ---------- inicialização ----------

function bindHeader() {
  $('#prevDay').onclick = () => setDate(addDays(state.date, -1));
  $('#nextDay').onclick = () => setDate(addDays(state.date, 1));
  $('#todayBtn').onclick = () => setDate(todayStr());
  $('#datePicker').onchange = (e) => setDate(e.target.value);
  document.querySelectorAll('.mode-btn').forEach((b) => (b.onclick = () => setMode(b.dataset.mode)));
  $('#catBtn').onclick = openCategories;
  $('#newBtn').onclick = newTaskDefault;

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if ($('#modalRoot').children.length) {
        $('#modalRoot').innerHTML = '';
        render();
      } else if (state.selectedId) selectTask(null);
    } else if (e.ctrlKey && e.key.toLowerCase() === 'n') {
      e.preventDefault();
      newTaskDefault();
    }
  });
}

async function init() {
  const loaded = await window.api.load();
  if (loaded && Array.isArray(loaded.tasks)) {
    state.data = {
      ...DEFAULT_DATA(),
      ...loaded,
      settings: { mode: 'schedule', ...(loaded.settings || {}) },
      categories: Array.isArray(loaded.categories) ? loaded.categories : [],
      tasks: loaded.tasks.map(normalizeTask),
    };
  } else {
    state.data = DEFAULT_DATA();
    persist();
  }
  bindHeader();
  render();

  setInterval(() => {
    const typing = $('#main').contains(document.activeElement);
    if (!typing && state.data.settings.mode === 'schedule' && state.date === todayStr()) renderMain();
  }, 60 * 1000);
}

init();
