import './styles.css';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = SUPABASE_URL && SUPABASE_ANON_KEY ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;
const STORAGE_KEY = 'bethel-sda-records';
const SESSION_KEY = 'bethel-sda-session';

const seedMembers = [
  { id: 'BTL-001', name: 'Grace Namirembe', gender: 'Female', family: 'Namirembe', category: 'Member', maritalStatus: 'Married', phone: '0782 109 519', createdAt: '2026-09-01' },
  { id: 'BTL-002', name: 'Daniel Kato', gender: 'Male', family: 'Kato', category: 'Member', maritalStatus: 'Single', phone: '0704 210 118', createdAt: '2026-09-02' },
  { id: 'BTL-003', name: 'Sarah Achieng', gender: 'Female', family: 'Achieng', category: 'Visitor', maritalStatus: 'Youth', phone: '', createdAt: '2026-09-14' },
  { id: 'BTL-004', name: 'Michael Okello', gender: 'Male', family: 'Okello', category: 'Member', maritalStatus: 'Single', phone: '', createdAt: '2026-09-18' },
  { id: 'BTL-005', name: 'Esther Nakato', gender: 'Female', family: 'Nakato', category: 'Member', maritalStatus: 'Child', phone: '', createdAt: '2026-09-20' }
];

const state = {
  view: 'overview',
  query: '',
  members: loadLocal().members,
  attendance: loadLocal().attendance,
  today: new Date().toISOString().slice(0, 10),
  loading: false
};

function loadLocal() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return stored || { members: seedMembers, attendance: [] };
  } catch {
    return { members: seedMembers, attendance: [] };
  }
}

function saveLocal() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ members: state.members, attendance: state.attendance }));
}

function todayLabel() {
  return new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(`${state.today}T12:00:00`));
}

function esc(value = '') {
  return String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}

function filteredMembers() {
  const query = state.query.trim().toLowerCase();
  return state.members.filter((member) => !query || [member.name, member.id, member.family, member.phone].some((field) => field.toLowerCase().includes(query)));
}

function isCheckedIn(memberId, date = state.today) {
  return state.attendance.some((entry) => entry.memberId === memberId && entry.date === date);
}

function stats() {
  return {
    total: state.members.length,
    visitors: state.members.filter((member) => member.category === 'Visitor').length,
    youth: state.members.filter((member) => member.maritalStatus === 'Youth').length,
    children: state.members.filter((member) => member.maritalStatus === 'Child').length,
    present: state.attendance.filter((entry) => entry.date === state.today).length
  };
}

async function createMember(member) {
  if (supabase) {
    const { data, error } = await supabase.from('members').insert({
      id: member.id,
      name: member.name,
      category: member.category,
      gender: member.gender,
      family: member.family,
      marital_status: member.maritalStatus,
      phone: member.phone,
      created_at: member.createdAt
    }).select().single();
    if (error) throw error;
    return { ...data, maritalStatus: data.marital_status, createdAt: data.created_at };
  }
  return { ...member, id: `BTL-${String(state.members.length + 1).padStart(3, '0')}` };
}

async function hydrateFromSupabase() {
  if (!supabase) return;
  const [membersResult, attendanceResult] = await Promise.all([
    supabase.from('members').select('*').order('created_at', { ascending: true }),
    supabase.from('attendance').select('*')
  ]);
  if (membersResult.error) throw membersResult.error;
  if (attendanceResult.error) throw attendanceResult.error;
  state.members = membersResult.data.map((member) => ({ ...member, maritalStatus: member.marital_status, createdAt: member.created_at }));
  state.attendance = attendanceResult.data.map((entry) => ({ memberId: entry.member_id, date: entry.date, status: entry.status, checkedInAt: entry.checked_in_at }));
  saveLocal();
}

async function createAttendance(entry) {
  if (supabase) {
    const { error } = await supabase.from('attendance').upsert(entry, { onConflict: 'member_id,date' });
    if (error) throw error;
  }
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
        </nav>
        <div class="sidebar-bottom"><div class="location"><span class="status-dot"></span><div><strong>Live workspace</strong><small>${supabase ? 'Connected to Supabase' : 'Local preview mode'}</small></div></div><button class="logout-button" data-action="logout">Sign out</button></div>
      </aside>
      <main class="main-content">
        <header class="topbar"><div class="mobile-brand">BETHEL SDA</div><div class="date-context">${todayLabel()}</div><div class="user-pill"><span class="avatar">B</span><span><strong>BETHEL</strong><small>Administrator</small></span></div></header>
        <div class="page-content">${content}</div>
      </main>
    </div>`;
}

function navItem(view, label, icon) { return `<button class="nav-item ${state.view === view ? 'active' : ''}" data-view="${view}"><span>${icon}</span>${label}</button>`; }
function statCard(label, value, note, accent) { return `<div class="stat-card"><div class="stat-top"><span>${label}</span><span class="stat-icon ${accent}">${accent === 'green' ? '✓' : accent === 'amber' ? '◌' : accent === 'blue' ? '♙' : '◈'}</span></div><strong>${value}</strong><small>${note}</small></div>`; }

function overview() {
  const s = stats();
  const recent = [...state.members].slice(-5).reverse();
  return shell(`<section class="page-heading"><div><p class="eyebrow">Good morning, administrator</p><h1>Welcome to Bethel.</h1><p class="subheading">A clear view of your church family, attendance, and daily records.</p></div><button class="primary-button" data-view="check-in"><span>+</span> Start check-in</button></section>
    <section class="stats-grid">${statCard('Total people', s.total, 'Registered in database', 'blue')}${statCard('Present today', s.present, `${s.present ? 'Attendance recorded' : 'Ready for check-in'}`, 'green')}${statCard('Visitors', s.visitors, 'People visiting Bethel', 'amber')}${statCard('Youth & children', s.youth + s.children, `${s.youth} youth · ${s.children} children`, 'purple')}</section>
    <div class="content-grid"><section class="panel attendance-panel"><div class="panel-heading"><div><p class="eyebrow">Today at Bethel</p><h2>Attendance snapshot</h2></div><button class="text-button" data-view="attendance">View history →</button></div><div class="attendance-visual"><div class="ring" style="--progress:${s.total ? Math.round((s.present / s.total) * 100) : 0}%"><div><strong>${s.present}</strong><small>of ${s.total} present</small></div></div><div class="legend"><div><span class="legend-dot present"></span><span>Present</span><strong>${s.present}</strong></div><div><span class="legend-dot remaining"></span><span>Not checked in</span><strong>${Math.max(0, s.total - s.present)}</strong></div><button class="outline-button" data-view="check-in">Open check-in</button></div></div></section><section class="panel"><div class="panel-heading"><div><p class="eyebrow">Recently added</p><h2>Church family</h2></div><button class="icon-button" data-view="members" title="View all members">→</button></div><div class="member-list">${recent.map(memberRow).join('') || emptyState('No people added yet.')}</div></section></div>`);
}

function memberRow(member) { return `<div class="member-row"><span class="person-avatar ${member.category === 'Visitor' ? 'visitor' : ''}">${esc(member.name.charAt(0))}</span><div class="member-info"><strong>${esc(member.name)}</strong><small>${esc(member.id)} · ${esc(member.family || 'No family listed')}</small></div><span class="category-tag ${member.category.toLowerCase()}">${esc(member.category)}</span></div>`; }
function emptyState(text) { return `<div class="empty-state"><span>◎</span><p>${text}</p></div>`; }

function checkIn() {
  const visible = filteredMembers();
  return shell(`<section class="page-heading compact"><div><p class="eyebrow">${todayLabel()}</p><h1>Morning check-in</h1><p class="subheading">Search for a member or visitor, then mark them present.</p></div><button class="secondary-button" data-view="members">+ New person</button></section><section class="panel checkin-panel"><div class="checkin-toolbar"><label class="search-box"><span>⌕</span><input data-search placeholder="Search name, ID, family, or phone" value="${esc(state.query)}" autofocus /></label><span class="results-count">${visible.length} people</span></div><div class="checkin-list">${visible.map((member) => `<div class="checkin-row"><div class="member-row">${memberRow(member)}</div><button class="check-button ${isCheckedIn(member.id) ? 'checked' : ''}" data-checkin="${member.id}">${isCheckedIn(member.id) ? '✓ Present' : 'Mark present'}</button></div>`).join('') || emptyState('No matching person. Add them as a new member or visitor.')}</div></section>`);
}

function members() {
  return shell(`<section class="page-heading compact"><div><p class="eyebrow">People directory</p><h1>Members & visitors</h1><p class="subheading">Keep one trusted record for everyone who worships with Bethel.</p></div><button class="primary-button" data-action="show-form"><span>+</span> Add person</button></section><section class="panel"><div class="table-toolbar"><label class="search-box"><span>⌕</span><input data-search placeholder="Search the directory" value="${esc(state.query)}" /></label><span class="results-count">${state.members.length} total records</span></div><div class="table-wrap"><table><thead><tr><th>Person</th><th>Category</th><th>Gender</th><th>Family</th><th>Marital status</th><th>Phone</th></tr></thead><tbody>${filteredMembers().map((member) => `<tr><td><div class="table-person"><span class="person-avatar">${esc(member.name.charAt(0))}</span><div><strong>${esc(member.name)}</strong><small>${esc(member.id)}</small></div></div></td><td><span class="category-tag ${member.category.toLowerCase()}">${esc(member.category)}</span></td><td>${esc(member.gender)}</td><td>${esc(member.family || '—')}</td><td>${esc(member.maritalStatus)}</td><td>${esc(member.phone || '—')}</td></tr>`).join('') || `<tr><td colspan="6">${emptyState('No people found.')}</td></tr>`}</tbody></table></div></section>`);
}

function attendance() {
  const dates = [...new Set([state.today, ...state.attendance.map((entry) => entry.date)])].sort().reverse();
  return shell(`<section class="page-heading compact"><div><p class="eyebrow">Permanent history</p><h1>Attendance history</h1><p class="subheading">Review who was present on each recorded day.</p></div><label class="date-picker">View date <input type="date" data-date value="${state.today}" /></label></section><section class="panel"><div class="panel-heading"><div><p class="eyebrow">${todayLabel()}</p><h2>${stats().present} people present</h2></div><button class="text-button" data-view="check-in">Take attendance →</button></div><div class="attendance-table">${state.members.map((member) => `<div class="history-row"><div class="member-row">${memberRow(member)}</div><span class="history-status ${isCheckedIn(member.id) ? 'is-present' : ''}">${isCheckedIn(member.id) ? 'Present' : 'Not recorded'}</span></div>`).join('')}</div></section><section class="panel history-summary"><div class="panel-heading"><div><p class="eyebrow">Recorded days</p><h2>Attendance log</h2></div></div><div class="date-chips">${dates.map((date) => `<button class="date-chip ${date === state.today ? 'selected' : ''}" data-date-chip="${date}"><strong>${new Date(`${date}T12:00:00`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}</strong><small>${state.attendance.filter((entry) => entry.date === date).length} present</small></button>`).join('')}</div></section>`);
}

function reports() {
  const s = stats();
  const memberCount = state.members.filter((member) => member.category === 'Member').length;
  return shell(`<section class="page-heading compact"><div><p class="eyebrow">Reports & insights</p><h1>Church reports</h1><p class="subheading">Simple numbers to help leaders understand the church family.</p></div><button class="secondary-button" data-action="export">Download CSV</button></section><section class="report-grid"><div class="report-feature"><span class="report-icon">◒</span><p class="eyebrow">Attendance today</p><strong>${s.present}<small> / ${s.total}</small></strong><div class="progress"><span style="width:${s.total ? (s.present / s.total) * 100 : 0}%"></span></div><small>${s.total ? Math.round((s.present / s.total) * 100) : 0}% of registered people checked in</small></div><div class="report-card"><span class="report-icon blue-icon">♙</span><strong>${memberCount}</strong><span>Church members</span><small>${Math.max(0, s.total - memberCount)} other records</small></div><div class="report-card"><span class="report-icon amber-icon">✦</span><strong>${s.visitors}</strong><span>Visitors</span><small>Welcome and follow up</small></div><div class="report-card"><span class="report-icon purple-icon">◎</span><strong>${s.youth + s.children}</strong><span>Youth & children</span><small>${s.youth} youth · ${s.children} children</small></div></section><section class="panel"><div class="panel-heading"><div><p class="eyebrow">Directory breakdown</p><h2>People by life stage</h2></div></div><div class="breakdown"><div><span>Adults</span><strong>${Math.max(0, s.total - s.youth - s.children)}</strong><div class="bar"><i style="width:${s.total ? ((s.total - s.youth - s.children) / s.total) * 100 : 0}%"></i></div></div><div><span>Youth</span><strong>${s.youth}</strong><div class="bar"><i style="width:${s.total ? (s.youth / s.total) * 100 : 0}%"></i></div></div><div><span>Children</span><strong>${s.children}</strong><div class="bar"><i style="width:${s.total ? (s.children / s.total) * 100 : 0}%"></i></div></div></div></section>`);
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
  document.querySelector('[data-action="logout"]')?.addEventListener('click', () => { localStorage.removeItem(SESSION_KEY); renderLogin(); });
}

async function markPresent(memberId) {
  if (isCheckedIn(memberId)) return;
  const entry = { memberId, date: state.today, status: 'Present', checkedInAt: new Date().toISOString() };
  state.attendance.push(entry); saveLocal();
  try { await createAttendance({ member_id: memberId, date: state.today, status: 'Present' }); showToast('Attendance recorded'); } catch (error) { showToast(`Saved locally. Supabase: ${error.message}`, true); }
  render();
}

function showMemberForm() {
  const modal = document.createElement('div'); modal.className = 'modal-backdrop'; modal.innerHTML = `<form class="modal" id="member-form"><button type="button" class="modal-close" data-close>×</button><p class="eyebrow">New record</p><h2>Add a person</h2><p class="modal-copy">Register a member or visitor in the Bethel directory.</p><div class="form-grid"><label>Full name<input name="name" required placeholder="e.g. Ruth Nankunda" /></label><label>Category<select name="category"><option>Member</option><option>Visitor</option></select></label><label>Gender<select name="gender"><option>Female</option><option>Male</option><option>Other</option></select></label><label>Marital status<select name="maritalStatus"><option>Married</option><option>Single</option><option>Youth</option><option>Child</option><option>Widowed</option><option>Other</option></select></label><label>Family name<input name="family" placeholder="e.g. Nankunda" /></label><label>Phone number<input name="phone" type="tel" placeholder="07xx xxx xxx" /></label></div><div class="modal-actions"><button type="button" class="secondary-button" data-close>Cancel</button><button class="primary-button" type="submit">Save person</button></div></form>`; document.body.append(modal); modal.querySelectorAll('[data-close]').forEach((button) => button.addEventListener('click', () => modal.remove())); modal.querySelector('input').focus(); modal.querySelector('form').addEventListener('submit', async (event) => { event.preventDefault(); const formData = new FormData(event.target); const record = { name: formData.get('name').trim(), category: formData.get('category'), gender: formData.get('gender'), maritalStatus: formData.get('maritalStatus'), family: formData.get('family').trim(), phone: formData.get('phone').trim(), createdAt: state.today }; try { const member = await createMember(record); state.members.push(member); saveLocal(); modal.remove(); state.view = 'members'; render(); showToast(`${record.name} added to the directory`); } catch (error) { showToast(error.message, true); } }); }

function exportCsv() { const rows = [['Member ID', 'Name', 'Category', 'Gender', 'Family', 'Marital status', 'Phone'], ...state.members.map((member) => [member.id, member.name, member.category, member.gender, member.family, member.maritalStatus, member.phone])]; const csv = rows.map((row) => row.map((cell) => `"${String(cell || '').replaceAll('"', '""')}"`).join(',')).join('\n'); const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); link.download = `bethel-directory-${state.today}.csv`; link.click(); URL.revokeObjectURL(link.href); showToast('CSV report downloaded'); }

function renderLogin() { document.querySelector('#app').innerHTML = `<main class="login-page"><div class="login-art"><div class="login-brand"><span class="brand-mark">B</span> BETHEL SDA CHURCH</div><div class="login-message"><p class="eyebrow">Membership & Sabbath attendance database</p><h1>Welcome to<br /><em>Bethel SDA</em><br />Church Database</h1><p>A calm, reliable place to care for your church family.</p></div><div class="login-footer">Kampala · Uganda <span>•</span> Est. 2026</div></div><section class="login-panel"><div class="login-panel-inner"><div class="mobile-login-mark">B</div><p class="eyebrow">Administrator access</p><h2>Sign in to your workspace</h2><p class="login-copy">Use the church administrator credentials to continue.</p><form id="login-form"><label>Username<input name="username" autocomplete="username" placeholder="Enter username" required /></label><label>Password<input name="password" type="password" autocomplete="current-password" placeholder="Enter password" required /></label><button class="primary-button full-width" type="submit">Enter dashboard <span>→</span></button><p class="login-note">Bethel SDA Church · Members & Sabbath Attendance</p></form></div></section></main>`; document.querySelector('#login-form').addEventListener('submit', (event) => { event.preventDefault(); const data = new FormData(event.target); if (data.get('username') === 'BETHEL' && data.get('password') === 'bethelsda12345') { localStorage.setItem(SESSION_KEY, 'authenticated'); render(); } else showToast('The username or password is not correct.', true); }); }

async function bootstrap() {
  if (localStorage.getItem(SESSION_KEY) !== 'authenticated') return renderLogin();
  try {
    await hydrateFromSupabase();
  } catch (error) {
    showToast(`Using local records. Supabase: ${error.message}`, true);
  }
  render();
}

bootstrap();
