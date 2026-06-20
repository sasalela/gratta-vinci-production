const TOKEN_KEY = 'gv_admin_token';
const EMAIL_KEY = 'gv_admin_email';

const loginSection = document.getElementById('loginSection');
const dashboardSection = document.getElementById('dashboardSection');
const adminEmailInput = document.getElementById('adminEmail');
const adminPasswordInput = document.getElementById('adminPassword');
const loginError = document.getElementById('loginError');
const loginBtn = document.getElementById('loginBtn');
const refreshBtn = document.getElementById('refreshBtn');
const logoutBtn = document.getElementById('logoutBtn');
const adminUserLabel = document.getElementById('adminUserLabel');
const loadError = document.getElementById('loadError');
const campaignsTable = document.getElementById('campaignsTable');
const participationsTable = document.getElementById('participationsTable');
const vouchersTable = document.getElementById('vouchersTable');
const alertsTable = document.getElementById('alertsTable');

function show(el) {
  el.classList.remove('hidden');
}

function hide(el) {
  el.classList.add('hidden');
}

function formatDate(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString('it-IT');
}

function formatDateOnly(value) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('it-IT');
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderTable(container, columns, rows) {
  if (!rows.length) {
    container.innerHTML = '<p class="empty">Nessun record trovato.</p>';
    return;
  }

  const header = columns.map((col) => `<th>${escapeHtml(col.label)}</th>`).join('');
  const body = rows
    .map((row) => {
      const cells = columns
        .map((col) => `<td>${escapeHtml(col.render(row))}</td>`)
        .join('');
      return `<tr>${cells}</tr>`;
    })
    .join('');

  container.innerHTML = `<table><thead><tr>${header}</tr></thead><tbody>${body}</tbody></table>`;
}

function getToken() {
  return sessionStorage.getItem(TOKEN_KEY);
}

function showLoginError(message) {
  loginError.textContent = message;
  show(loginError);
}

function clearLoginError() {
  loginError.textContent = '';
  hide(loginError);
}

function showLoadError(message) {
  loadError.textContent = message;
  show(loadError);
}

function clearLoadError() {
  loadError.textContent = '';
  hide(loadError);
}

function showDashboard(email) {
  hide(loginSection);
  show(dashboardSection);
  adminUserLabel.textContent = `Connesso come ${email}`;
}

function showLogin() {
  show(loginSection);
  hide(dashboardSection);
  adminPasswordInput.value = '';
  clearLoadError();
}

async function fetchAdminData(path) {
  const response = await fetch(path, {
    headers: {
      Authorization: `Bearer ${getToken()}`
    }
  });

  const payload = await response.json().catch(() => ({}));

  if (response.status === 401) {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(EMAIL_KEY);
    showLogin();
    throw new Error('Sessione scaduta. Accedi di nuovo.');
  }

  if (!response.ok || !payload.success) {
    throw new Error(payload.error || `Errore ${response.status} su ${path}`);
  }

  return payload.data;
}

function renderCampaigns(rows) {
  renderTable(campaignsTable, [
    { label: 'Nome', render: (row) => row.name },
    { label: 'Slug', render: (row) => row.slug },
    { label: 'Negozio', render: (row) => row.storeName },
    { label: 'Attiva', render: (row) => (row.active ? 'Sì' : 'No') },
    { label: 'Inizio', render: (row) => formatDateOnly(row.startDate) },
    { label: 'Fine', render: (row) => formatDateOnly(row.endDate) },
    { label: 'Max giocate', render: (row) => row.maxPlaysPerUser },
    { label: 'Creata', render: (row) => formatDate(row.createdAt) }
  ], rows);
}

function renderParticipations(rows) {
  renderTable(participationsTable, [
    { label: 'Email', render: (row) => row.email },
    { label: 'Campagna', render: (row) => row.campaignName },
    { label: 'IP', render: (row) => row.clientIp },
    { label: 'Session key', render: (row) => row.sessionKey },
    { label: 'Data', render: (row) => formatDate(row.createdAt) }
  ], rows);
}

function renderVouchers(rows) {
  renderTable(vouchersTable, [
    { label: 'Codice', render: (row) => row.code },
    { label: 'Email', render: (row) => row.email },
    { label: 'Premio', render: (row) => `${row.prizeEmoji} ${row.prizeName}`.trim() },
    { label: 'Campagna', render: (row) => row.campaignName },
    { label: 'Riscattato', render: (row) => (row.redeemed ? 'Sì' : 'No') },
    { label: 'Scadenza', render: (row) => formatDate(row.expiresAt) },
    { label: 'Creato', render: (row) => formatDate(row.createdAt) }
  ], rows);
}

function renderAlerts(rows) {
  renderTable(alertsTable, [
    { label: 'Data', render: (row) => formatDate(row.createdAt) },
    { label: 'Negozio', render: (row) => row.store?.name || '—' },
    { label: 'Campagna', render: (row) => row.campaign?.name || '—' },
    { label: 'Tipo', render: (row) => row.type },
    { label: 'Messaggio', render: (row) => row.message },
    { label: 'Letto admin', render: (row) => (row.readByAdmin ? 'Sì' : 'No') },
    { label: 'Letto negozio', render: (row) => (row.readByStore ? 'Sì' : 'No') }
  ], rows);
}

async function loadDashboardData() {
  clearLoadError();
  refreshBtn.disabled = true;
  refreshBtn.textContent = 'Caricamento...';

  try {
    const [campaigns, participations, vouchers, alerts] = await Promise.all([
      fetchAdminData('/api/admin/campaigns'),
      fetchAdminData('/api/admin/participations'),
      fetchAdminData('/api/admin/vouchers'),
      fetchAdminData('/api/admin/alerts')
    ]);

    renderAlerts(alerts);
    renderCampaigns(campaigns);
    renderParticipations(participations);
    renderVouchers(vouchers);
  } catch (error) {
    showLoadError(error.message || 'Errore durante il caricamento dei dati.');
  } finally {
    refreshBtn.disabled = false;
    refreshBtn.textContent = 'Aggiorna';
  }
}

async function login() {
  clearLoginError();

  const email = adminEmailInput.value.trim();
  const password = adminPasswordInput.value;

  if (!email || !password) {
    showLoginError('Inserisci email e password.');
    return;
  }

  loginBtn.disabled = true;
  loginBtn.textContent = 'Accesso...';

  try {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    const payload = await response.json();

    if (!response.ok || !payload.success) {
      showLoginError(payload.error || 'Credenziali non valide.');
      return;
    }

    if (payload.data.user.role !== 'super_admin') {
      showLoginError('Solo l\'admin può accedere a questa pagina.');
      return;
    }

    sessionStorage.setItem(TOKEN_KEY, payload.data.token);
    sessionStorage.setItem(EMAIL_KEY, payload.data.user.email);
    showDashboard(payload.data.user.email);
    await loadDashboardData();
  } catch (error) {
    showLoginError('Impossibile contattare il server.');
  } finally {
    loginBtn.disabled = false;
    loginBtn.textContent = 'Accedi';
  }
}

function logout() {
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(EMAIL_KEY);
  showLogin();
}

loginBtn.addEventListener('click', login);
refreshBtn.addEventListener('click', loadDashboardData);
logoutBtn.addEventListener('click', logout);

adminPasswordInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    login();
  }
});

const savedToken = getToken();
const savedEmail = sessionStorage.getItem(EMAIL_KEY);

if (savedToken && savedEmail) {
  showDashboard(savedEmail);
  loadDashboardData();
}
