const TOKEN_KEY = 'gv_partner_token';
const EMAIL_KEY = 'gv_partner_email';

const loginSection = document.getElementById('loginSection');
const appSection = document.getElementById('appSection');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const loginBtn = document.getElementById('loginBtn');
const loginError = document.getElementById('loginError');
const refreshBtn = document.getElementById('refreshBtn');
const logoutBtn = document.getElementById('logoutBtn');
const partnerName = document.getElementById('partnerName');
const userLabel = document.getElementById('userLabel');
const appError = document.getElementById('appError');
const appSuccess = document.getElementById('appSuccess');
const statStores = document.getElementById('statStores');
const statActiveStores = document.getElementById('statActiveStores');
const statUsers = document.getElementById('statUsers');
const storeForm = document.getElementById('storeForm');
const storeNameInput = document.getElementById('storeNameInput');
const storeSlugInput = document.getElementById('storeSlugInput');
const storeEmailInput = document.getElementById('storeEmailInput');
const storePhoneInput = document.getElementById('storePhoneInput');
const storeExpiresInput = document.getElementById('storeExpiresInput');
const storePrimaryInput = document.getElementById('storePrimaryInput');
const storeSecondaryInput = document.getElementById('storeSecondaryInput');
const userForm = document.getElementById('userForm');
const userStoreInput = document.getElementById('userStoreInput');
const userNameInput = document.getElementById('userNameInput');
const userEmailInput = document.getElementById('userEmailInput');
const userPasswordInput = document.getElementById('userPasswordInput');
const userRoleInput = document.getElementById('userRoleInput');
const storesTable = document.getElementById('storesTable');
const usersTable = document.getElementById('usersTable');

const state = {
  stores: [],
  users: [],
  partner: null
};

function show(el) {
  el.classList.remove('hidden');
}

function hide(el) {
  el.classList.add('hidden');
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function slugify(value) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function formatDate(value) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('it-IT');
}

function getToken() {
  return sessionStorage.getItem(TOKEN_KEY);
}

function setMessage(el, message) {
  el.textContent = message;
  show(el);
}

function clearMessages() {
  hide(loginError);
  hide(appError);
  hide(appSuccess);
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getToken()}`,
      ...(options.headers || {})
    }
  });
  const payload = await response.json().catch(() => ({}));
  if (response.status === 401 || response.status === 403) {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(EMAIL_KEY);
  }
  if (!response.ok || !payload.success) {
    const validation = Array.isArray(payload.errors)
      ? payload.errors.map((error) => error.message || error).join(', ')
      : '';
    throw new Error(validation || payload.error || `Errore API (${response.status})`);
  }
  return payload.data;
}

function renderTable(container, columns, rows) {
  if (!rows.length) {
    container.innerHTML = '<p class="muted">Nessun dato.</p>';
    return;
  }

  const head = columns.map((col) => `<th>${escapeHtml(col.label)}</th>`).join('');
  const body = rows.map((row) => `
    <tr>${columns.map((col) => `<td>${col.html ? col.render(row) : escapeHtml(col.render(row))}</td>`).join('')}</tr>
  `).join('');
  container.innerHTML = `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

function populateStoreSelect() {
  userStoreInput.innerHTML = state.stores
    .map((store) => `<option value="${store.id}">${escapeHtml(store.name)} (${escapeHtml(store.slug)})</option>`)
    .join('');
}

function renderStats() {
  statStores.textContent = state.stores.length;
  statActiveStores.textContent = state.stores.filter((store) => store.active).length;
  statUsers.textContent = state.users.length;
}

function renderStores() {
  renderTable(storesTable, [
    { label: 'Nome', render: (row) => row.name },
    { label: 'Slug', render: (row) => row.slug },
    { label: 'Email', render: (row) => row.email },
    { label: 'Attivo', render: (row) => (row.active ? 'Sì' : 'No') },
    { label: 'Scadenza', render: (row) => formatDate(row.subscriptionExpiresAt) },
    { label: 'Utenti', render: (row) => row._count?.users ?? 0 },
    { label: 'Campagne', render: (row) => row._count?.campaigns ?? 0 }
  ], state.stores);
}

function renderUsers() {
  renderTable(usersTable, [
    { label: 'Nome', render: (row) => row.name },
    { label: 'Email', render: (row) => row.email },
    { label: 'Ruolo', render: (row) => row.role },
    { label: 'Negozio', render: (row) => row.store?.name || '—' },
    { label: 'Attivo', render: (row) => (row.active ? 'Sì' : 'No') },
    { label: 'Creato', render: (row) => formatDate(row.createdAt) }
  ], state.users);
}

async function loadAll() {
  clearMessages();
  const [me, stores, users] = await Promise.all([
    api('/api/partner/me'),
    api('/api/partner/stores'),
    api('/api/partner/users')
  ]);

  state.partner = me.partner;
  state.stores = stores;
  state.users = users;
  partnerName.textContent = me.partner.name;
  userLabel.textContent = `Connesso come ${me.user.email}`;
  populateStoreSelect();
  renderStats();
  renderStores();
  renderUsers();
}

async function login() {
  clearMessages();
  loginBtn.disabled = true;
  loginBtn.textContent = 'Accesso...';

  try {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: emailInput.value.trim(),
        password: passwordInput.value
      })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.success) {
      throw new Error(payload.error || 'Credenziali non valide.');
    }
    if (payload.data.user.role !== 'partner_owner') {
      throw new Error('Questa pagina è riservata ai gestori.');
    }

    sessionStorage.setItem(TOKEN_KEY, payload.data.token);
    sessionStorage.setItem(EMAIL_KEY, payload.data.user.email);
    hide(loginSection);
    show(appSection);
    await loadAll();
  } catch (error) {
    setMessage(loginError, error.message);
  } finally {
    loginBtn.disabled = false;
    loginBtn.textContent = 'Accedi';
  }
}

async function saveStore(event) {
  event.preventDefault();
  clearMessages();

  try {
    await api('/api/partner/stores', {
      method: 'POST',
      body: JSON.stringify({
        name: storeNameInput.value.trim(),
        slug: storeSlugInput.value.trim(),
        email: storeEmailInput.value.trim(),
        phone: storePhoneInput.value.trim(),
        primaryColor: storePrimaryInput.value,
        secondaryColor: storeSecondaryInput.value,
        subscriptionExpiresAt: storeExpiresInput.value,
        active: true
      })
    });
    storeForm.reset();
    storePrimaryInput.value = '#667eea';
    storeSecondaryInput.value = '#764ba2';
    setMessage(appSuccess, 'Negozio cliente creato.');
    await loadAll();
  } catch (error) {
    setMessage(appError, error.message);
  }
}

async function saveUser(event) {
  event.preventDefault();
  clearMessages();

  try {
    await api('/api/partner/users', {
      method: 'POST',
      body: JSON.stringify({
        storeId: userStoreInput.value,
        name: userNameInput.value.trim(),
        email: userEmailInput.value.trim(),
        password: userPasswordInput.value,
        role: userRoleInput.value,
        active: true
      })
    });
    userForm.reset();
    setMessage(appSuccess, 'Utente negozio creato.');
    await loadAll();
  } catch (error) {
    setMessage(appError, error.message);
  }
}

function logout() {
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(EMAIL_KEY);
  show(loginSection);
  hide(appSection);
}

storeNameInput.addEventListener('input', () => {
  storeSlugInput.value = slugify(storeNameInput.value);
});
loginBtn.addEventListener('click', login);
refreshBtn.addEventListener('click', loadAll);
logoutBtn.addEventListener('click', logout);
storeForm.addEventListener('submit', saveStore);
userForm.addEventListener('submit', saveUser);

if (getToken()) {
  hide(loginSection);
  show(appSection);
  loadAll().catch((error) => {
    setMessage(loginError, error.message);
    logout();
  });
}
