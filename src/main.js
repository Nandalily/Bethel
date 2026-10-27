import './styles.css';

const STORAGE_KEY = 'bethel-sda-records';
const SESSION_KEY = 'bethel-sda-session';
const SESSION_ACTIVITY_KEY = 'bethel-sda-last-activity';
const INACTIVITY_TIMEOUT = 60 * 60 * 1000;
const FAMILY_NAMES = ['Shepherds', 'Apostles', 'Prophets', 'Kings', 'Disciples', 'Children', 'Visitor'];
let inactivityTimer;
let lastActivityWrite = 0;



const state = {
  view: 'overview',
  query: '',
  members: loadLocal().members,
  attendance: loadLocal().attendance,
  today: new Date().toISOString().slice(0, 10),
  loading: false,
  reportFilters: {
  from: '',
  to: '',
  gender: '',
  family: '',
  detail: '',
  name: ''
},
 recordFilters: {
    name: '',
    gender: '',
    family: '',
    detail: '',
    category: '',
    marriedGroup: '',
    className: ''
  }
};

function loadLocal() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return stored || { members: [], attendance: [] };
  } catch {
    return { members: [], attendance: [] };
  }
}

function saveLocal() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ members: state.members, attendance: state.attendance }));
}

function clearInactivityMonitor() {
  window.clearTimeout(inactivityTimer);
  inactivityTimer = undefined;
}

function scheduleInactivityCheck() {
  clearInactivityMonitor();
  if (localStorage.getItem(SESSION_KEY) !== 'authenticated') return;
  const lastActivity = Number(localStorage.getItem(SESSION_ACTIVITY_KEY)) || Date.now();
  const remaining = Math.max(0, INACTIVITY_TIMEOUT - (Date.now() - lastActivity));
  inactivityTimer = window.setTimeout(() => {
    if (Date.now() - (Number(localStorage.getItem(SESSION_ACTIVITY_KEY)) || 0) >= INACTIVITY_TIMEOUT) {
      endSession('Your session expired after one hour of inactivity. Please log in again.');
    } else {
      scheduleInactivityCheck();
    }
  }, remaining);
}

function recordActivity() {
  if (localStorage.getItem(SESSION_KEY) !== 'authenticated') return;
  const now = Date.now();
  if (now - lastActivityWrite < 5000) return;
  lastActivityWrite = now;
  localStorage.setItem(SESSION_ACTIVITY_KEY, String(now));
  scheduleInactivityCheck();
}

function startInactivityMonitor() {
  lastActivityWrite = Date.now();
  localStorage.setItem(SESSION_ACTIVITY_KEY, String(lastActivityWrite));
  scheduleInactivityCheck();
}

function endSession(message = '') {
  clearInactivityMonitor();
  localStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(SESSION_ACTIVITY_KEY);
  state.view = 'overview';
  state.query = '';
  renderLogin(message);
}

['click', 'keydown', 'mousemove', 'scroll', 'touchstart'].forEach((eventName) => {
  window.addEventListener(eventName, recordActivity, { passive: true });
});
window.addEventListener('storage', (event) => {
  if (event.key === SESSION_ACTIVITY_KEY) scheduleInactivityCheck();
});

function todayLabel() {
  return new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(`${state.today}T12:00:00`));
}

function esc(value = '') {
  return String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}

async function apiRequest(path, options = {}) {
  const response = await fetch(`https://bethelsda.gt.tc/api${path}.php`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    credentials: 'include'
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || `Request failed with status ${response.status}.`);
  }
  return response.status === 204 ? null : response.json();
}

function filteredMembers() {
  const query = state.query.trim().toLowerCase();
  return state.members.filter((member) => !query || [member.name, member.id, member.family, member.phone].some((field) => field.toLowerCase().includes(query)));
}

function isCheckedIn(memberId, date = state.today) {
  return state.attendance.some((entry) => entry.memberId === memberId && entry.date === date);
}

function arrivalTime(memberId, date = state.today) {
  const entry = state.attendance.find((item) => item.memberId === memberId && item.date === date);
  if (!entry?.checkedInAt) return '';
  return formatArrival(entry.checkedInAt);
}

function formatArrival(value) {
  return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function stats() {
  return {
    total: state.members.length,
    visitors: state.members.filter((member) => member.category === 'Visitor').length,
    youth: state.members.filter((member) => member.maritalStatus === 'Youth').length,
    children: state.members.filter((member) => ['Child', 'Children'].includes(member.maritalStatus)).length,
    present: state.attendance.filter((entry) => entry.date === state.today).length
  };
}


function reportRows() {
  const filters = state.reportFilters;
  const nameQuery = String(filters.name || '').trim().toLowerCase();

  // Match attendance records to members using string IDs.
  // Accept both camelCase and snake_case API field names.
  const membersById = new Map(
    state.members.map((member) => [
      String(member.id ?? '').trim(),
      {
        ...member,
        id: String(member.id ?? ''),
        name: String(member.name ?? ''),
        gender: String(member.gender ?? ''),
        family: String(member.family ?? ''),
        maritalStatus: String(
          member.maritalStatus ?? member.marital_status ?? ''
        ),
        className: String(member.className ?? member.class_name ?? '')
      }
    ])
  );

  return state.attendance
    .map((entry) => {
      const memberId = String(
        entry.memberId ?? entry.member_id ?? ''
      ).trim();

      const date = String(
        entry.date ?? entry.attendance_date ?? ''
      ).slice(0, 10);

      const checkedInAt =
        entry.checkedInAt ?? entry.checked_in_at ?? '';

      return {
        entry: { ...entry, memberId, date, checkedInAt },
        member: membersById.get(memberId)
      };
    })
    .filter(({ entry, member }) => {
      if (!member || !entry.date) return false;

      // Date range
      if (filters.from && entry.date < filters.from) return false;
      if (filters.to && entry.date > filters.to) return false;

      // Gender
      if (
        filters.gender &&
        member.gender.toLowerCase() !== filters.gender.toLowerCase()
      ) {
        return false;
      }

      // Family
      if (
        filters.family &&
        member.family.toLowerCase() !== filters.family.toLowerCase()
      ) {
        return false;
      }

      // Life stage / detail
      if (
        filters.detail &&
        member.maritalStatus.toLowerCase() !== filters.detail.toLowerCase()
      ) {
        return false;
      }

      // Person name or member ID
      if (
        nameQuery &&
        ![member.name, member.id].some((value) =>
          value.toLowerCase().includes(nameQuery)
        )
      ) {
        return false;
      }

      return true;
    })
    .sort((a, b) => {
      const dateA = `${a.entry.date} ${a.entry.checkedInAt || ''}`;
      const dateB = `${b.entry.date} ${b.entry.checkedInAt || ''}`;
      return dateB.localeCompare(dateA);
    });
}


async function createMember(member) {
  return apiRequest('/members', { method: 'POST', body: JSON.stringify({ ...member, id: `M-${String(state.members.length + 1).padStart(3, '0')}` }) });
}

async function hydrateFromDatabase() {
  const [members, attendance] = await Promise.all([apiRequest('/members'), apiRequest('/attendance')]);
  state.members = members;
  state.attendance = attendance;
  saveLocal();
}

async function createAttendance(entry) {
  await apiRequest('/attendance', { method: 'POST', body: JSON.stringify(entry) });
}

function shell(content) {
  return `
    <div class="app-shell">
      <aside class="sidebar">
        <div class="brand"><span class="brand-mark">B</span><div><strong>BETHEL SDA</strong><small>Church database</small></div></div>
        <div class="side-label">Workspace</div>
        <nav class="nav-list" aria-label="Main navigation">
          ${navItem('overview', 'Overview', '◼')}
          ${navItem('check-in', 'Check in', '✓')}
          ${navItem('members', 'Members', '♙')}
          ${navItem('attendance', 'Attendance', '▤')}
          ${navItem('reports', 'Reports', '▥')}
          ${navItem('records', 'Records', '▤')}
        </nav>
        <div class="sidebar-bottom"><div class="location"><span class="status-dot"></span><div><strong>Live workspace</strong><small>Connected to MySQL</small></div></div><button class="logout-button" type="button" data-action="logout">Log out</button></div>
      </aside>
      <main class="main-content">
        <header class="topbar"><div class="mobile-brand">BETHEL SDA</div><div class="date-context">${todayLabel()}</div><div class="user-pill"><span class="avatar">B</span><span><strong>BETHEL</strong><small>Administrator</small></span></div></header>
        <div class="page-content">${content}</div>
      </main>
    </div>`;
}

function navItem(view, label, icon) { return `<button class="nav-item ${state.view === view ? 'active' : ''}" data-view="${view}"><span>${icon}</span>${label}</button>`; }
function statCard(label, value, note) { return `<div class="stat-card"><div class="stat-top"><span>${label}</span></div><strong>${value}</strong><small>${note}</small></div>`; }

function overview() {
  const s = stats();
  const familyCounts = state.members.reduce((counts, member) => {
    const family = member.family;
    if (!FAMILY_NAMES.includes(family)) return counts;
    counts[family] = (counts[family] || 0) + 1;
    return counts;
  }, Object.fromEntries(FAMILY_NAMES.map((family) => [family, 0])));
  const families = FAMILY_NAMES.map((family) => [family, familyCounts[family]]);
  return shell(`<section class="page-heading"><div>
   
    <h1>Welcome Back.</h1>
    <p class="subheading">Bethel Church Attendance records.</p>
    </div><button class="primary-button" data-view="check-in"><span>+</span> Start check-in</button>
    </section>
    <section class="stats-grid">${statCard('Total people', s.total, 'Registered in database')}${statCard('Present today', s.present, `${s.present ? 'Attendance recorded' : 'Ready for check-in'}`)}${statCard('Visitors', s.visitors, 'People visiting Bethel')}${statCard('Youth & children', s.youth + s.children, `${s.youth} youth · ${s.children} children`)}</section>
    <div class="content-grid"><section class="panel attendance-panel"><div class="panel-heading"><div><p class="eyebrow">Today at Bethel</p><h2>Attendance snapshot</h2></div><button class="text-button" data-view="attendance">View history →</button></div><div class="attendance-visual"><div class="ring" style="--progress:${s.total ? Math.round((s.present / s.total) * 100) : 0}%"><div><strong>${s.present}</strong><small>of ${s.total} present</small></div></div><div class="legend"><div><span class="legend-dot present"></span><span>Present</span><strong>${s.present}</strong></div><div><span class="legend-dot remaining"></span><span>Not checked in</span><strong>${Math.max(0, s.total - s.present)}</strong></div><button class="outline-button" data-view="check-in">Open check-in</button></div></div></section><section class="panel"><div class="panel-heading"><div><p class="eyebrow">People by family</p><h2>Church family</h2></div><button class="icon-button" data-view="members" title="View all members">→</button></div><div class="family-list">${families.map(([family, count]) => `<div class="family-row"><span class="family-name">${esc(family)}</span><strong>${count}</strong><small>${count === 1 ? 'person' : 'people'}</small></div>`).join('') || emptyState('No people added yet.')}</div></section></div>`);
}

function memberRow(member) { return `<div class="member-row"><span class="person-avatar ${member.category === 'Visitor' ? 'visitor' : ''}">${esc(member.name.charAt(0))}</span><div class="member-info"><strong>${esc(member.name)}</strong><small>${esc(member.id)} · ${esc(member.family || 'No family listed')}</small></div><span class="category-tag ${member.category.toLowerCase()}">${esc(member.category)}</span></div>`; }
function emptyState(text) { return `<div class="empty-state"><span>◎</span><p>${text}</p></div>`; }

function checkIn() {
  const visible = filteredMembers();
  return shell(`<section class="page-heading compact"><div><p class="eyebrow">${todayLabel()}</p><h1>Check-Me-in</h1></div><button class="secondary-button" data-view="members">+ New person</button></section><section class="panel checkin-panel"><div class="checkin-toolbar"><label class="search-box"><span>⌕</span><input data-search placeholder="Search name, ID, family, or phone" value="${esc(state.query)}" autofocus /></label><span class="results-count">${visible.length} people</span></div><div class="checkin-list">${visible.map((member) => `<div class="checkin-row"><div class="member-row">${memberRow(member)}</div>${isCheckedIn(member.id) ? `<small class="arrival-time">Arrived ${esc(arrivalTime(member.id))}</small>` : ''}<button class="check-button ${isCheckedIn(member.id) ? 'checked' : ''}" data-checkin="${member.id}">${isCheckedIn(member.id) ? ' Present' : 'CHECK ME IN'}</button></div>`).join('') || emptyState('No matching person. Add them as a new member or visitor.')}</div></section>`);
}

function members() {
  return shell(`<section class="page-heading compact"><div><p class="eyebrow">People directory</p><h1>Members & visitors</h1>
  
    </div><button class="primary-button" data-action="show-form"><span>+</span> Add person</button></section><section class="panel"><div class="table-toolbar"><label class="search-box"><span>⌕</span><input data-search placeholder="Search the directory" value="${esc(state.query)}" /></label><span class="results-count">${state.members.length} total records</span></div><div class="table-wrap"><table><thead><tr><th>Person</th><th>Category</th><th>Gender</th><th>Family</th><th>Marital status</th><th>Phone</th></tr></thead><tbody>${filteredMembers().map((member) => `<tr><td><div class="table-person"><span class="person-avatar">${esc(member.name.charAt(0))}</span><div><strong>${esc(member.name)}</strong><small>${esc(member.id)}</small></div></div></td><td><span class="category-tag ${member.category.toLowerCase()}">${esc(member.category)}</span></td><td>${esc(member.gender)}</td><td>${esc(member.family || '—')}</td><td>${esc(member.maritalStatus)}</td><td>${esc(member.phone || '—')}</td></tr>`).join('') || `<tr><td colspan="6">${emptyState('No people found.')}</td></tr>`}</tbody></table></div></section>`);
}

function attendance() {
  const dates = [...new Set([state.today, ...state.attendance.map((entry) => entry.date)])].sort().reverse();
  return shell(`<section class="page-heading compact"><div><p class="eyebrow">Permanent history</p><h1>Attendance history</h1><p class="subheading">Review who was present on each recorded day.</p></div><label class="date-picker">View date <input type="date" data-date value="${state.today}" /></label></section><section class="panel"><div class="panel-heading"><div><p class="eyebrow">${todayLabel()}</p><h2>${stats().present} people present</h2></div><button class="text-button" data-view="check-in">Take attendance →</button></div><div class="attendance-table">${state.members.map((member) => `<div class="history-row"><div class="member-row">${memberRow(member)}</div><span class="history-status ${isCheckedIn(member.id) ? 'is-present' : ''}">${isCheckedIn(member.id) ? `Present · ${esc(arrivalTime(member.id))}` : 'Not recorded'}</span></div>`).join('')}</div></section><section class="panel history-summary"><div class="panel-heading"><div><p class="eyebrow">Recorded days</p><h2>Attendance log</h2></div></div><div class="date-chips">${dates.map((date) => `<button class="date-chip ${date === state.today ? 'selected' : ''}" data-date-chip="${date}"><strong>${new Date(`${date}T12:00:00`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}</strong><small>${state.attendance.filter((entry) => entry.date === date).length} present</small></button>`).join('')}</div></section>`);
}

function reports() {
  const s = stats();
  const memberCount = state.members.filter((member) => member.category === 'Member').length;
  const filters = state.reportFilters;
  const rows = reportRows();
  const uniquePeople = new Map(
  rows.map(({ member }) => [member.id, member])
);

const uniqueFemales = [...uniquePeople.values()]
  .filter((member) => member.gender === 'Female').length;

const uniqueMales = [...uniquePeople.values()]
  .filter((member) => member.gender === 'Male').length;

  
  const familyOptions = FAMILY_NAMES.map((family) => `
  <option value="${esc(family)}"
    ${filters.family === family ? 'selected' : ''}>
    ${esc(family)}
  </option>
`).join('');

  const details = ['Children', 'Ambassadors', 'Young adults', 'Married', 'Not Married'];
  return shell(`<section class="page-heading compact"><div><p class="eyebrow">Reports & insights</p><h1>Church reports</h1><p class="subheading">Filter attendance by date, person, gender, family, and life stage.</p></div></section><section class="report-grid"><div class="report-feature"><p class="eyebrow">Filtered attendance</p><strong>${rows.length}</strong><small>check-ins in selected period</small></div><div class="report-card"><strong>${new Set(rows.map(({ member }) => member.id)).size}</strong><span>People checked in</span><small>Unique people</small></div><div class="report-card"><strong>${uniqueFemales}</strong><span>Female attendees</span><small>Unique people in selected period</small></div><div class="report-card"><strong>${uniqueMales}</strong><span>Male check-ins</span><small>In selected period</small></div></section><section class="panel report-filters"><div class="panel-heading"><div><p class="eyebrow">Attendance report</p><h2>Choose filters</h2></div></div><form class="report-filter-grid" data-action="report-filter"><label>From date<input type="date" name="from" value="${esc(filters.from)}" /></label><label>To date<input type="date" name="to" value="${esc(filters.to)}" /></label><label>Person name<input name="name" value="${esc(filters.name)}" placeholder="Search by name or ID" /></label><label>Gender<select name="gender"><option value="">All genders</option><option ${filters.gender === 'Male' ? 'selected' : ''}>Male</option><option ${filters.gender === 'Female' ? 'selected' : ''}>Female</option></select></label><label>Family<select name="family"><option value="">All families</option>${familyOptions}</select></label><label>Life stage / detail<select name="detail"><option value="">All details</option>${details.map((detail) => `<option ${filters.detail === detail ? 'selected' : ''}>${detail}</option>`).join('')}</select></label>
 <div class="report-filter-actions">
  <button class="primary-button" type="submit">Run report</button>
  <button class="secondary-button" type="button" data-action="report-reset">
    Reset filters
  </button>
  <button class="secondary-button" type="button" data-action="report-export">
    Download results
  </button>
</div>
  </form></section><section class="panel"><div class="panel-heading"><div><p class="eyebrow">Matching check-ins</p><h2>${rows.length} results</h2></div></div><div class="table-wrap"><table><thead><tr><th>Date & time</th><th>Person</th><th>Gender</th><th>Family</th><th>Detail</th><th>Class</th></tr></thead><tbody>${rows.map(({ entry, member }) => `<tr><td>${esc(entry.checkedInAt ? formatArrival(entry.checkedInAt) : entry.date)}</td><td><strong>${esc(member.name)}</strong><small>${esc(member.id)}</small></td><td>${esc(member.gender)}</td><td>${esc(member.family || '—')}</td><td>${esc(member.maritalStatus || '—')}</td><td>${esc(member.className || '—')}</td></tr>`).join('') || `<tr><td colspan="6">${emptyState('No check-ins match these filters.')}</td></tr>`}</tbody></table></div></section><section class="panel"><div class="panel-heading"><div><p class="eyebrow">Directory breakdown</p><h2>People by life stage</h2></div></div><div class="breakdown"><div><span>Adults</span><strong>${Math.max(0, s.total - s.youth - s.children)}</strong><div class="bar"><i style="width:${s.total ? ((s.total - s.youth - s.children) / s.total) * 100 : 0}%"></i></div></div><div><span>Youth</span><strong>${s.youth}</strong><div class="bar"><i style="width:${s.total ? (s.youth / s.total) * 100 : 0}%"></i></div></div><div><span>Children</span><strong>${s.children}</strong><div class="bar"><i style="width:${s.total ? (s.children / s.total) * 100 : 0}%"></i></div></div></div></section>`);
}

function render() { document.querySelector('#app').innerHTML = state.view === 'overview' ? overview() : state.view === 'check-in' ? checkIn() : state.view === 'members' ? members() : state.view === 'attendance' ? attendance() : reports(); bindEvents(); }
function showToast(message, error = false) { const toast = document.createElement('div'); toast.className = `toast ${error ? 'error' : ''}`; toast.textContent = message; document.body.append(toast); setTimeout(() => toast.remove(), 3200); }

function bindEvents() {
  document.querySelectorAll('[data-view]').forEach((element) => element.addEventListener('click', () => { state.view = element.dataset.view; state.query = ''; render(); }));
  document.querySelectorAll('[data-search]').forEach((input) => input.addEventListener('input', (event) => { state.query = event.target.value; render(); document.querySelector('[data-search]')?.focus(); document.querySelector('[data-search]')?.setSelectionRange(state.query.length, state.query.length); }));
  document.querySelectorAll('[data-checkin]').forEach((button) => button.addEventListener('click', () => markPresent(button.dataset.checkin)));
  document.querySelectorAll('[data-date]').forEach((input) => input.addEventListener('change', (event) => { state.today = event.target.value; render(); }));
  document.querySelectorAll('[data-date-chip]').forEach((button) => button.addEventListener('click', () => { state.today = button.dataset.dateChip; render(); }));
  document.querySelector('[data-action="show-form"]')?.addEventListener('click', showMemberForm);
  document.querySelector('[data-action="export"]')?.addEventListener('click', exportCsv);
  
  document.querySelector('[data-action="report-filter"]')
  ?.addEventListener('submit', (event) => {
    event.preventDefault();

    const form = event.currentTarget;
    const data = new FormData(form);

    const from = String(data.get('from') || '');
    const to = String(data.get('to') || '');

    if (from && to && from > to) {
      showToast('The start date cannot be after the end date.', true);
      return;
    }

    state.reportFilters = {
      from,
      to,
      gender: String(data.get('gender') || ''),
      family: String(data.get('family') || ''),
      detail: String(data.get('detail') || ''),
      name: String(data.get('name') || '')
    };

    // Refresh the report using the selected filters.
    render();
  });
  
  
  document.querySelector('[data-action="report-reset"]')
  ?.addEventListener('click', () => {
    state.reportFilters = {
      from: '',
      to: '',
      gender: '',
      family: '',
      detail: '',
      name: ''
    };

    render();
  });
  
  document.querySelector('[data-action="report-export"]')?.addEventListener('click', () => exportReportCsv(reportRows()));
  document.querySelector('[data-action="logout"]')?.addEventListener('click', async () => { try { await apiRequest('/auth/logout', { method: 'POST' }); } finally { endSession(); } });
}

async function markPresent(memberId) {
  if (isCheckedIn(memberId)) return;
  const entry = { memberId, date: state.today, status: 'Present', checkedInAt: new Date().toISOString() };
  state.attendance.push(entry); saveLocal();
  try { await createAttendance(entry); showToast('Attendance recorded'); } catch (error) { showToast(`Attendance could not be saved: ${error.message}`, true); }
  render();
}

function showMemberForm() {
  const modal = document.createElement('div'); modal.className = 'modal-backdrop'; modal.innerHTML = `<form class="modal" id="member-form"><button type="button" class="modal-close" data-close>×</button><p class="eyebrow">New record</p><h2>Add a person</h2>
  <div class="form-grid"><label>Full name<input name="name" required placeholder="e.g. Ruth Nankunda" /></label><label>Family <span class="required-field">(required)</span><select name="family" required><option value="">Choose a family</option><option>Shepherds</option><option>Apostles</option><option>Prophets</option><option>Kings</option><option>Disciples</option><option>Children</option><option>Visitor</option></select></label><label>Gender<select name="gender" required><option value="">Choose gender</option><option>Male</option><option>Female</option></select></label><label>Other details <select name="maritalStatus"><option value="">Choose a detail</option><option>Children</option><option>Ambassadors</option><option>Young adults</option><option>Married</option><option>Not Married</option></select></label><label>Married group <select name="marriedGroup"><option value="">Choose a group</option><option>Adventist Women</option><option>Adventist Men</option></select></label><label>Class <select name="className"><option value="">Choose a class</option><option>Bible class</option><option>Lesson class</option><option>Children's class</option></select></label><label>Phone number <input name="phone" type="tel" placeholder="07xx xxx xxx" /></label></div><div class="modal-actions"><button type="button" class="secondary-button" data-close>Cancel</button><button class="primary-button" type="submit">Save person</button></div></form>`; document.body.append(modal); modal.querySelectorAll('[data-close]').forEach((button) => button.addEventListener('click', () => modal.remove())); modal.querySelector('input').focus(); modal.querySelector('form').addEventListener('submit', async (event) => { event.preventDefault(); const formData = new FormData(event.target); const record = { name: formData.get('name').trim(), category: formData.get('family') === 'Visitor' ? 'Visitor' : 'Member', gender: formData.get('gender'), maritalStatus: formData.get('maritalStatus'), family: formData.get('family'), marriedGroup: formData.get('marriedGroup'), className: formData.get('className'), phone: formData.get('phone').trim(), createdAt: state.today }; try { const member = await createMember(record); state.members.push(member); saveLocal(); modal.remove(); state.view = 'members'; render(); showToast(`${record.name} added to the directory`); } catch (error) { showToast(error.message, true); } }); }

function exportCsv() { const rows = [['Member ID', 'Name', 'Category', 'Gender', 'Family', 'Marital status', 'Phone'], ...state.members.map((member) => [member.id, member.name, member.category, member.gender, member.family, member.maritalStatus, member.phone])]; const csv = rows.map((row) => row.map((cell) => `"${String(cell || '').replaceAll('"', '""')}"`).join(',')).join('\n'); const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); link.download = `bethel-directory-${state.today}.csv`; link.click(); URL.revokeObjectURL(link.href); showToast('CSV report downloaded'); }

function exportReportCsv(rows) { const data = [['Date', 'Arrival time', 'Member ID', 'Name', 'Gender', 'Family', 'Detail', 'Class'], ...rows.map(({ entry, member }) => [entry.date, entry.checkedInAt || '', member.id, member.name, member.gender, member.family, member.maritalStatus, member.className])]; const csv = data.map((row) => row.map((cell) => `"${String(cell || '').replaceAll('"', '""')}"`).join(',')).join('\n'); const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); link.download = `bethel-attendance-report-${state.reportFilters.from || 'all'}-to-${state.reportFilters.to || 'all'}.csv`; link.click(); URL.revokeObjectURL(link.href); showToast('Attendance report downloaded'); }

function renderLogin(message = '') { document.querySelector('#app').innerHTML = `<main class="login-page"><div class="login-art"><div class="login-brand"><span class="brand-mark">B</span> BETHEL SDA CHURCH</div><div class="login-message">
  
  <h1>Welcome to<br /><em>Bethel SDA</em><br />Church Database</h1>

  </div><div class="login-footer">Kampala · Uganda <span>•</span> Est. 2026</div></div><section class="login-panel"><div class="login-panel-inner"><div class="mobile-login-mark">B</div><p class="eyebrow">Church Records</p>
  <h2>Sign in Here</h2>
  
  <form id="login-form">${message ? `<p class="login-timeout-message">${esc(message)}</p>` : ''}<label>Username<input name="username" autocomplete="username" placeholder="Enter username" required /></label><label>Password<div class="password-field"><input name="password" type="password" autocomplete="current-password" placeholder="Enter password" required /><button class="password-toggle" type="button" aria-label="Show password" title="Show password" data-password-toggle><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 12s3.5-5 9.5-5 9.5 5 9.5 5-9.5 5-9.5 5Z" /><circle cx="12" cy="12" r="2.5" /><path class="eye-slash" d="m4 4 16 16" /></svg></button></div></label><button class="primary-button full-width" type="submit">Enter dashboard <span>→</span></button><p class="login-note">Bethel SDA Church · Members & Sabbath Attendance</p></form></div></section></main>`; const loginForm = document.querySelector('#login-form'); const passwordInput = loginForm.querySelector('input[name="password"]'); const passwordToggle = loginForm.querySelector('[data-password-toggle]'); passwordToggle.addEventListener('click', () => { const isVisible = passwordInput.type === 'text'; passwordInput.type = isVisible ? 'password' : 'text'; passwordToggle.classList.toggle('is-visible', !isVisible); passwordToggle.setAttribute('aria-label', isVisible ? 'Show password' : 'Hide password'); passwordToggle.setAttribute('title', isVisible ? 'Show password' : 'Hide password'); }); loginForm.addEventListener('submit', async (event) => { event.preventDefault(); const data = new FormData(event.target); try { await apiRequest('/auth/login', { method: 'POST', body: JSON.stringify({ username: data.get('username'), password: data.get('password') }) }); localStorage.setItem(SESSION_KEY, 'authenticated'); startInactivityMonitor(); render(); } catch (error) { showToast(error.message, true); } }); }

async function bootstrap() {
  if (localStorage.getItem(SESSION_KEY) !== 'authenticated') return renderLogin();
  const lastActivity = Number(localStorage.getItem(SESSION_ACTIVITY_KEY)) || Date.now();
  if (Date.now() - lastActivity >= INACTIVITY_TIMEOUT) return endSession('Your session expired after one hour of inactivity. Please log in again.');
  try {
    await apiRequest('/auth/session');
    startInactivityMonitor();
  } catch {
    return endSession('Your session expired. Please log in again.');
  }
  try {
    await hydrateFromDatabase();
  } catch (error) {
    return endSession(error.message);
  }
  render();
}

bootstrap();
