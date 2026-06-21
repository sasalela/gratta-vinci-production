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
const storesTable = document.getElementById('storesTable');
const usersTable = document.getElementById('usersTable');
const partnersTable = document.getElementById('partnersTable');
const actionMessage = document.getElementById('actionMessage');
const partnerForm = document.getElementById('partnerForm');
const partnerFormTitle = document.getElementById('partnerFormTitle');
const partnerIdInput = document.getElementById('partnerId');
const partnerNameInput = document.getElementById('partnerNameInput');
const partnerEmailInput = document.getElementById('partnerEmailInput');
const partnerPhoneInput = document.getElementById('partnerPhoneInput');
const partnerLogoInput = document.getElementById('partnerLogoInput');
const partnerActiveInput = document.getElementById('partnerActiveInput');
const cancelPartnerEditBtn = document.getElementById('cancelPartnerEditBtn');
const storeForm = document.getElementById('storeForm');
const storeFormTitle = document.getElementById('storeFormTitle');
const storeIdInput = document.getElementById('storeId');
const storePartnerInput = document.getElementById('storePartnerInput');
const storeNameInput = document.getElementById('storeNameInput');
const storeSlugInput = document.getElementById('storeSlugInput');
const storeEmailInput = document.getElementById('storeEmailInput');
const storePhoneInput = document.getElementById('storePhoneInput');
const storeLogoInput = document.getElementById('storeLogoInput');
const storePrimaryInput = document.getElementById('storePrimaryInput');
const storeSecondaryInput = document.getElementById('storeSecondaryInput');
const storeExpiresInput = document.getElementById('storeExpiresInput');
const storeActiveInput = document.getElementById('storeActiveInput');
const cancelStoreEditBtn = document.getElementById('cancelStoreEditBtn');
const userForm = document.getElementById('userForm');
const userFormTitle = document.getElementById('userFormTitle');
const userIdInput = document.getElementById('userId');
const userStoreInput = document.getElementById('userStoreInput');
const userPartnerInput = document.getElementById('userPartnerInput');
const userNameInput = document.getElementById('userNameInput');
const userEmailInput = document.getElementById('userEmailInput');
const userPasswordInput = document.getElementById('userPasswordInput');
const userRoleInput = document.getElementById('userRoleInput');
const userActiveInput = document.getElementById('userActiveInput');
const cancelUserEditBtn = document.getElementById('cancelUserEditBtn');

const state = {
  partners: [],
  stores: [],
  users: []
};

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

function formatDateInput(value) {
  if (!value) return '';
  return new Date(value).toISOString().slice(0, 10);
}

function formatDateForApi(value) {
  return new Date(value).toISOString().slice(0, 10);
}

function getSubscriptionInfo(store) {
  if (!store.active) {
    return { label: 'Disattivato', className: 'danger' };
  }
  if (!store.subscriptionExpiresAt) {
    return { label: 'Attivo senza scadenza', className: 'success' };
  }

  const expiresAt = new Date(store.subscriptionExpiresAt);
  const daysLeft = Math.ceil((expiresAt.getTime() - Date.now()) / 86400000);
  if (daysLeft < 0) {
    return { label: 'Scaduto', className: 'danger' };
  }
  if (daysLeft <= 7) {
    return { label: `In scadenza (${daysLeft} gg)`, className: 'warning' };
  }
  return { label: `Attivo (${daysLeft} gg)`, className: 'success' };
}

function renderSubscriptionBadge(store) {
  const info = getSubscriptionInfo(store);
  return `<span class="status-badge ${info.className}">${escapeHtml(info.label)}</span>`;
}

function slugify(value) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
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
        .map((col) => {
          const value = col.render(row);
          return `<td>${col.html ? value : escapeHtml(value)}</td>`;
        })
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
  hide(actionMessage);
}

function showActionMessage(message) {
  actionMessage.textContent = message;
  show(actionMessage);
  setTimeout(() => hide(actionMessage), 3000);
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
  return adminApi(path);
}

async function adminApi(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getToken()}`,
      ...(options.headers || {})
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

function populateStoreSelect() {
  userStoreInput.innerHTML = state.stores
    .map((store) => `<option value="${store.id}">${escapeHtml(store.name)} (${escapeHtml(store.slug)})</option>`)
    .join('');
}

function populatePartnerSelects() {
  const options = [
    '<option value="">Nessun gestore / negozio diretto</option>',
    ...state.partners.map((partner) => `<option value="${partner.id}">${escapeHtml(partner.name)} (${escapeHtml(partner.email)})</option>`)
  ].join('');
  storePartnerInput.innerHTML = options;
  userPartnerInput.innerHTML = [
    '<option value="">Seleziona gestore</option>',
    ...state.partners.map((partner) => `<option value="${partner.id}">${escapeHtml(partner.name)} (${escapeHtml(partner.email)})</option>`)
  ].join('');
}

function renderPartners(rows) {
  renderTable(partnersTable, [
    { label: 'Nome', render: (row) => row.name },
    { label: 'Email', render: (row) => row.email },
    { label: 'Telefono', render: (row) => row.phone || '—' },
    { label: 'Attivo', render: (row) => (row.active ? 'Sì' : 'No') },
    { label: 'Negozi', render: (row) => row._count?.stores ?? 0 },
    { label: 'Utenti', render: (row) => row._count?.users ?? 0 },
    { label: 'Creato', render: (row) => formatDate(row.createdAt) },
    {
      label: 'Azioni',
      html: true,
      render: (row) => `
        <div class="row-actions">
          <button class="small" type="button" data-action="edit-partner" data-id="${escapeHtml(row.id)}">Modifica</button>
          <button class="small secondary" type="button" data-action="toggle-partner" data-id="${escapeHtml(row.id)}">
            ${row.active ? 'Disattiva' : 'Attiva'}
          </button>
        </div>
      `
    }
  ], rows);
}

function renderStores(rows) {
  renderTable(storesTable, [
    { label: 'Nome', render: (row) => row.name },
    { label: 'Slug', render: (row) => row.slug },
    { label: 'Email', render: (row) => row.email },
    { label: 'Gestore', render: (row) => row.partner?.name || 'Diretto' },
    { label: 'Stato', html: true, render: (row) => renderSubscriptionBadge(row) },
    { label: 'Scadenza', render: (row) => formatDateOnly(row.subscriptionExpiresAt) },
    { label: 'Utenti', render: (row) => row._count?.users ?? 0 },
    { label: 'Campagne', render: (row) => row._count?.campaigns ?? 0 },
    {
      label: 'Azioni',
      html: true,
      render: (row) => `
        <div class="row-actions">
          <button class="small" type="button" data-action="edit-store" data-id="${escapeHtml(row.id)}">Modifica</button>
          <button class="small" type="button" data-action="extend-store" data-id="${escapeHtml(row.id)}">+30 giorni</button>
          <button class="small secondary" type="button" data-action="expire-store" data-id="${escapeHtml(row.id)}">Scadi</button>
          <button class="small secondary" type="button" data-action="toggle-store" data-id="${escapeHtml(row.id)}">
            ${row.active ? 'Disattiva' : 'Attiva'}
          </button>
        </div>
      `
    }
  ], rows);
}

function renderUsers(rows) {
  renderTable(usersTable, [
    { label: 'Nome', render: (row) => row.name },
    { label: 'Email', render: (row) => row.email },
    { label: 'Ruolo', render: (row) => row.role },
    { label: 'Negozio', render: (row) => row.store?.name || '—' },
    { label: 'Gestore', render: (row) => row.partner?.name || '—' },
    { label: 'Attivo', render: (row) => (row.active ? 'Sì' : 'No') },
    { label: 'Creato', render: (row) => formatDate(row.createdAt) },
    {
      label: 'Azioni',
      html: true,
      render: (row) => `
        <div class="row-actions">
          <button class="small" type="button" data-action="edit-user" data-id="${escapeHtml(row.id)}">Modifica</button>
          <button class="small secondary" type="button" data-action="toggle-user" data-id="${escapeHtml(row.id)}">
            ${row.active ? 'Disattiva' : 'Attiva'}
          </button>
        </div>
      `
    }
  ], rows);
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

function resetPartnerForm() {
  partnerForm.reset();
  partnerIdInput.value = '';
  partnerActiveInput.checked = true;
  partnerFormTitle.textContent = 'Crea gestore';
  hide(cancelPartnerEditBtn);
}

function resetStoreForm() {
  storeForm.reset();
  storeIdInput.value = '';
  storePartnerInput.value = '';
  storePrimaryInput.value = '#667eea';
  storeSecondaryInput.value = '#764ba2';
  storeActiveInput.checked = true;
  storeFormTitle.textContent = 'Crea negozio';
  hide(cancelStoreEditBtn);
}

function resetUserForm() {
  userForm.reset();
  userIdInput.value = '';
  userPartnerInput.value = '';
  userActiveInput.checked = true;
  userRoleInput.value = 'store_owner';
  userStoreInput.disabled = false;
  userPartnerInput.disabled = true;
  userFormTitle.textContent = 'Crea utente negozio';
  hide(cancelUserEditBtn);
  if (state.stores[0]) {
    userStoreInput.value = state.stores[0].id;
  }
}

function editPartner(id) {
  const partner = state.partners.find((item) => item.id === id);
  if (!partner) return;

  partnerIdInput.value = partner.id;
  partnerNameInput.value = partner.name || '';
  partnerEmailInput.value = partner.email || '';
  partnerPhoneInput.value = partner.phone || '';
  partnerLogoInput.value = partner.logoUrl || '';
  partnerActiveInput.checked = Boolean(partner.active);
  partnerFormTitle.textContent = `Modifica ${partner.name}`;
  show(cancelPartnerEditBtn);
  partnerNameInput.focus();
}

function editStore(id) {
  const store = state.stores.find((item) => item.id === id);
  if (!store) return;

  storeIdInput.value = store.id;
  storePartnerInput.value = store.partnerId || '';
  storeNameInput.value = store.name || '';
  storeSlugInput.value = store.slug || '';
  storeEmailInput.value = store.email || '';
  storePhoneInput.value = store.phone || '';
  storeLogoInput.value = store.logoUrl || '';
  storePrimaryInput.value = store.primaryColor || '#667eea';
  storeSecondaryInput.value = store.secondaryColor || '#764ba2';
  storeExpiresInput.value = formatDateInput(store.subscriptionExpiresAt);
  storeActiveInput.checked = Boolean(store.active);
  storeFormTitle.textContent = `Modifica ${store.name}`;
  show(cancelStoreEditBtn);
  storeNameInput.focus();
}

function editUser(id) {
  const user = state.users.find((item) => item.id === id);
  if (!user) return;

  userIdInput.value = user.id;
  userStoreInput.value = user.storeId || '';
  userPartnerInput.value = user.partnerId || '';
  userNameInput.value = user.name || '';
  userEmailInput.value = user.email || '';
  userPasswordInput.value = '';
  userRoleInput.value = user.role || 'store_owner';
  userStoreInput.disabled = userRoleInput.value === 'partner_owner';
  userPartnerInput.disabled = userRoleInput.value !== 'partner_owner';
  userActiveInput.checked = Boolean(user.active);
  userFormTitle.textContent = `Modifica ${user.name}`;
  show(cancelUserEditBtn);
  userNameInput.focus();
}

async function loadDashboardData() {
  clearLoadError();
  refreshBtn.disabled = true;
  refreshBtn.textContent = 'Caricamento...';

  try {
    const [partners, stores, users, campaigns, participations, vouchers, alerts] = await Promise.all([
      fetchAdminData('/api/admin/partners'),
      fetchAdminData('/api/admin/stores'),
      fetchAdminData('/api/admin/users'),
      fetchAdminData('/api/admin/campaigns'),
      fetchAdminData('/api/admin/participations'),
      fetchAdminData('/api/admin/vouchers'),
      fetchAdminData('/api/admin/alerts')
    ]);

    state.partners = partners;
    state.stores = stores;
    state.users = users;
    populatePartnerSelects();
    populateStoreSelect();
    renderPartners(partners);
    renderStores(stores);
    renderUsers(users);
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

async function savePartner(event) {
  event.preventDefault();
  clearLoadError();

  const id = partnerIdInput.value;
  const payload = {
    name: partnerNameInput.value.trim(),
    email: partnerEmailInput.value.trim(),
    phone: partnerPhoneInput.value.trim(),
    logoUrl: partnerLogoInput.value.trim(),
    active: partnerActiveInput.checked
  };

  try {
    await adminApi(id ? `/api/admin/partners/${id}` : '/api/admin/partners', {
      method: id ? 'PUT' : 'POST',
      body: JSON.stringify(payload)
    });
    resetPartnerForm();
    await loadDashboardData();
    showActionMessage(id ? 'Gestore aggiornato.' : 'Gestore creato.');
  } catch (error) {
    showLoadError(error.message || 'Errore durante il salvataggio del gestore.');
  }
}

async function saveStore(event) {
  event.preventDefault();
  clearLoadError();

  const id = storeIdInput.value;
  const payload = {
    partnerId: storePartnerInput.value,
    name: storeNameInput.value.trim(),
    slug: storeSlugInput.value.trim(),
    email: storeEmailInput.value.trim(),
    phone: storePhoneInput.value.trim(),
    logoUrl: storeLogoInput.value.trim(),
    primaryColor: storePrimaryInput.value,
    secondaryColor: storeSecondaryInput.value,
    subscriptionExpiresAt: storeExpiresInput.value,
    active: storeActiveInput.checked
  };

  try {
    await adminApi(id ? `/api/admin/stores/${id}` : '/api/admin/stores', {
      method: id ? 'PUT' : 'POST',
      body: JSON.stringify(payload)
    });
    resetStoreForm();
    await loadDashboardData();
    showActionMessage(id ? 'Negozio aggiornato.' : 'Negozio creato.');
  } catch (error) {
    showLoadError(error.message || 'Errore durante il salvataggio del negozio.');
  }
}

async function saveUser(event) {
  event.preventDefault();
  clearLoadError();

  const id = userIdInput.value;
  const payload = {
    storeId: userStoreInput.value,
    partnerId: userPartnerInput.value,
    name: userNameInput.value.trim(),
    email: userEmailInput.value.trim(),
    password: userPasswordInput.value,
    role: userRoleInput.value,
    active: userActiveInput.checked
  };

  if (!id && !payload.password) {
    showLoadError('La password è obbligatoria per creare un nuovo utente.');
    return;
  }

  if (payload.role === 'partner_owner') {
    payload.storeId = '';
    if (!payload.partnerId) {
      showLoadError('Seleziona un gestore per creare l’utente gestore.');
      return;
    }
  } else {
    payload.partnerId = '';
    if (!payload.storeId) {
      showLoadError('Seleziona un negozio per creare l’utente negozio.');
      return;
    }
  }

  if (id && !payload.password) {
    delete payload.password;
  }

  try {
    await adminApi(id ? `/api/admin/users/${id}` : '/api/admin/users', {
      method: id ? 'PUT' : 'POST',
      body: JSON.stringify(payload)
    });
    resetUserForm();
    await loadDashboardData();
    showActionMessage(id ? 'Utente aggiornato.' : 'Utente creato.');
  } catch (error) {
    showLoadError(error.message || 'Errore durante il salvataggio dell\'utente.');
  }
}

async function handleTableAction(event) {
  const button = event.target.closest('button[data-action]');
  if (!button) return;

  const { action, id } = button.dataset;
  if (action === 'edit-partner') {
    editPartner(id);
    return;
  }
  if (action === 'edit-store') {
    editStore(id);
    return;
  }
  if (action === 'edit-user') {
    editUser(id);
    return;
  }

  try {
    if (action === 'toggle-partner') {
      const partner = state.partners.find((item) => item.id === id);
      await adminApi(`/api/admin/partners/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ active: !partner.active })
      });
      showActionMessage(partner.active ? 'Gestore disattivato.' : 'Gestore attivato.');
    }
    if (action === 'toggle-store') {
      const store = state.stores.find((item) => item.id === id);
      await adminApi(`/api/admin/stores/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ active: !store.active })
      });
      showActionMessage(store.active ? 'Negozio disattivato.' : 'Negozio attivato.');
    }
    if (action === 'extend-store') {
      const store = state.stores.find((item) => item.id === id);
      const currentExpiry = store.subscriptionExpiresAt ? new Date(store.subscriptionExpiresAt) : new Date();
      const baseDate = currentExpiry > new Date() ? currentExpiry : new Date();
      baseDate.setDate(baseDate.getDate() + 30);
      await adminApi(`/api/admin/stores/${id}`, {
        method: 'PUT',
        body: JSON.stringify({
          active: true,
          subscriptionExpiresAt: formatDateForApi(baseDate)
        })
      });
      showActionMessage('Abbonamento esteso di 30 giorni.');
    }
    if (action === 'expire-store') {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      await adminApi(`/api/admin/stores/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ subscriptionExpiresAt: formatDateForApi(yesterday) })
      });
      showActionMessage('Abbonamento impostato come scaduto.');
    }
    if (action === 'toggle-user') {
      const user = state.users.find((item) => item.id === id);
      await adminApi(`/api/admin/users/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ active: !user.active })
      });
      showActionMessage(user.active ? 'Utente disattivato.' : 'Utente attivato.');
    }
    await loadDashboardData();
  } catch (error) {
    showLoadError(error.message || 'Operazione non riuscita.');
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
partnerForm.addEventListener('submit', savePartner);
storeForm.addEventListener('submit', saveStore);
userForm.addEventListener('submit', saveUser);
cancelPartnerEditBtn.addEventListener('click', resetPartnerForm);
cancelStoreEditBtn.addEventListener('click', resetStoreForm);
cancelUserEditBtn.addEventListener('click', resetUserForm);
partnersTable.addEventListener('click', handleTableAction);
storesTable.addEventListener('click', handleTableAction);
usersTable.addEventListener('click', handleTableAction);

storeNameInput.addEventListener('input', () => {
  if (!storeIdInput.value) {
    storeSlugInput.value = slugify(storeNameInput.value);
  }
});

userRoleInput.addEventListener('change', () => {
  const isPartnerUser = userRoleInput.value === 'partner_owner';
  userStoreInput.disabled = isPartnerUser;
  userPartnerInput.disabled = !isPartnerUser;
});

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
