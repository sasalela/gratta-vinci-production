const TOKEN_KEY = 'gv_store_token';
const USER_KEY = 'gv_store_user';

const loginSection = document.getElementById('loginSection');
const appSection = document.getElementById('appSection');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const loginBtn = document.getElementById('loginBtn');
const loginError = document.getElementById('loginError');
const refreshBtn = document.getElementById('refreshBtn');
const logoutBtn = document.getElementById('logoutBtn');
const storeName = document.getElementById('storeName');
const userLabel = document.getElementById('userLabel');
const appError = document.getElementById('appError');
const createCampaignBtn = document.getElementById('createCampaignBtn');
const createPrizeBtn = document.getElementById('createPrizeBtn');
const prizeCampaign = document.getElementById('prizeCampaign');
const campaignsTable = document.getElementById('campaignsTable');
const participationsTable = document.getElementById('participationsTable');
const vouchersTable = document.getElementById('vouchersTable');
const alertsList = document.getElementById('alertsList');
const voucherCode = document.getElementById('voucherCode');
const validateVoucherBtn = document.getElementById('validateVoucherBtn');
const redeemVoucherBtn = document.getElementById('redeemVoucherBtn');
const voucherResult = document.getElementById('voucherResult');

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

function formatDate(value) {
  if (!value) return '-';
  return new Date(value).toLocaleString('it-IT');
}

function getToken() {
  return sessionStorage.getItem(TOKEN_KEY);
}

function setError(el, message) {
  el.textContent = message;
  show(el);
}

function clearError(el) {
  el.textContent = '';
  hide(el);
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
  if (!response.ok || !payload.success) {
    throw new Error(payload.error || 'Errore API');
  }
  return payload.data;
}

function renderTable(container, columns, rows) {
  if (!rows.length) {
    container.innerHTML = '<p>Nessun dato.</p>';
    return;
  }

  const head = columns.map((col) => `<th>${escapeHtml(col.label)}</th>`).join('');
  const body = rows.map((row) => {
    const cells = columns.map((col) => `<td>${col.html ? col.render(row) : escapeHtml(col.render(row))}</td>`).join('');
    return `<tr>${cells}</tr>`;
  }).join('');

  container.innerHTML = `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

function getCustomerFields() {
  const labels = {
    name: 'Nome',
    email: 'Email',
    phone: 'Telefono',
    birthDate: 'Data nascita',
    marketingConsent: 'Consenso marketing'
  };

  return Array.from(document.querySelectorAll('[data-field]'))
    .filter((input) => input.checked)
    .map((input) => ({
      key: input.dataset.field,
      label: labels[input.dataset.field],
      enabled: true,
      required: ['name', 'email'].includes(input.dataset.field)
    }));
}

async function login() {
  clearError(loginError);
  loginBtn.disabled = true;

  try {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: emailInput.value.trim(),
        password: passwordInput.value
      })
    });
    const payload = await response.json();
    if (!response.ok || !payload.success) {
      throw new Error(payload.error || 'Credenziali non valide');
    }
    if (!payload.data.user.storeId) {
      throw new Error('Questo utente non è collegato a un negozio.');
    }

    sessionStorage.setItem(TOKEN_KEY, payload.data.token);
    sessionStorage.setItem(USER_KEY, JSON.stringify(payload.data.user));
    await showApp();
  } catch (error) {
    setError(loginError, error.message);
  } finally {
    loginBtn.disabled = false;
  }
}

async function showApp() {
  hide(loginSection);
  show(appSection);
  await loadAll();
}

async function loadAll() {
  clearError(appError);
  try {
    const [me, campaigns, participations, vouchers, alerts] = await Promise.all([
      api('/api/store/me'),
      api('/api/store/campaigns'),
      api('/api/store/participations'),
      api('/api/store/vouchers'),
      api('/api/store/alerts')
    ]);

    storeName.textContent = me.store?.name || 'Negozio';
    userLabel.textContent = ` — ${me.user.email}`;
    renderCampaigns(campaigns);
    renderParticipations(participations);
    renderVouchers(vouchers);
    renderAlerts(alerts);
  } catch (error) {
    setError(appError, error.message);
  }
}

function renderCampaigns(campaigns) {
  prizeCampaign.innerHTML = campaigns
    .map((campaign) => `<option value="${escapeHtml(campaign.id)}">${escapeHtml(campaign.name)}</option>`)
    .join('');

  renderTable(campaignsTable, [
    { label: 'Nome', render: (row) => row.name },
    { label: 'Slug', render: (row) => row.slug },
    { label: 'Periodo', render: (row) => `${formatDate(row.startDate)} - ${formatDate(row.endDate)}` },
    { label: 'Limite', render: (row) => row.playLimitMode === 'per_day' ? 'Giornaliero' : 'Per campagna' },
    { label: 'Premi', html: true, render: (row) => row.prizeItems.map((prize) => `<span class="pill">${escapeHtml(prize.emoji || '')} ${escapeHtml(prize.name)}: ${prize.remainingQuantity}/${prize.totalQuantity} (${prize.winProbability}%)</span>`).join('') || '-' },
    { label: 'Giocate', render: (row) => row._count?.participations ?? 0 },
    { label: 'Voucher', render: (row) => row._count?.vouchers ?? 0 },
    { label: 'Attiva', render: (row) => row.active ? 'Si' : 'No' }
  ], campaigns);
}

function renderParticipations(rows) {
  renderTable(participationsTable, [
    { label: 'Data', render: (row) => formatDate(row.createdAt) },
    { label: 'Campagna', render: (row) => row.campaign?.name },
    { label: 'Email', render: (row) => row.email },
    { label: 'Esito', render: (row) => row.outcome === 'won' ? 'Vinto' : 'Perso' },
    { label: 'Premio', render: (row) => row.prize ? `${row.prize.emoji || ''} ${row.prize.name}` : '-' },
    { label: 'IP', render: (row) => row.clientIp }
  ], rows);
}

function renderVouchers(rows) {
  renderTable(vouchersTable, [
    { label: 'Codice', render: (row) => row.code },
    { label: 'Email', render: (row) => row.email },
    { label: 'Campagna', render: (row) => row.campaign?.name },
    { label: 'Premio', render: (row) => `${row.prize?.emoji || ''} ${row.prize?.name || ''}` },
    { label: 'Scadenza', render: (row) => formatDate(row.expiresAt) },
    { label: 'Stato', render: (row) => row.redeemed ? 'Riscattato' : 'Da riscattare' }
  ], rows);
}

function renderAlerts(rows) {
  if (!rows.length) {
    alertsList.innerHTML = '<p>Nessun alert.</p>';
    return;
  }
  alertsList.innerHTML = rows.map((alert) => (
    `<div class="message ${alert.readByStore ? '' : 'error'}">${escapeHtml(alert.message)}<br><small>${formatDate(alert.createdAt)}</small></div>`
  )).join('');
}

async function createCampaign() {
  clearError(appError);
  try {
    const campaign = {
      name: document.getElementById('campaignName').value.trim(),
      slug: document.getElementById('campaignSlug').value.trim(),
      description: document.getElementById('campaignDescription').value.trim(),
      startDate: document.getElementById('startDate').value,
      endDate: document.getElementById('endDate').value,
      playLimitMode: document.getElementById('playLimitMode').value,
      voucherValidityDays: Number(document.getElementById('voucherValidityDays').value || 15),
      loseMessage: document.getElementById('loseMessage').value.trim() || 'Nessun premio questa volta.',
      gameType: 'scratch_card',
      active: true,
      customerFields: getCustomerFields()
    };

    await api('/api/store/campaigns', {
      method: 'POST',
      body: JSON.stringify(campaign)
    });
    await loadAll();
  } catch (error) {
    setError(appError, error.message);
  }
}

async function createPrize() {
  clearError(appError);
  try {
    const campaignId = prizeCampaign.value;
    if (!campaignId) {
      throw new Error('Seleziona una campagna.');
    }

    await api(`/api/store/campaigns/${campaignId}/prizes`, {
      method: 'POST',
      body: JSON.stringify({
        name: document.getElementById('prizeName').value.trim(),
        emoji: document.getElementById('prizeEmoji').value.trim(),
        description: document.getElementById('prizeDescription').value.trim(),
        totalQuantity: Number(document.getElementById('prizeQuantity').value || 0),
        winProbability: Number(document.getElementById('prizeProbability').value || 0),
        active: true
      })
    });
    await loadAll();
  } catch (error) {
    setError(appError, error.message);
  }
}

async function validateVoucher() {
  voucherResult.innerHTML = '';
  try {
    const data = await api('/api/store/vouchers/validate', {
      method: 'POST',
      body: JSON.stringify({ code: voucherCode.value.trim() })
    });
    voucherResult.innerHTML = `<div class="message success">Voucher ${escapeHtml(data.status)} — ${escapeHtml(data.email)} — ${escapeHtml(data.campaign.name)}</div>`;
  } catch (error) {
    voucherResult.innerHTML = `<div class="message error">${escapeHtml(error.message)}</div>`;
  }
}

async function redeemVoucher() {
  voucherResult.innerHTML = '';
  try {
    await api('/api/store/vouchers/redeem', {
      method: 'POST',
      body: JSON.stringify({ code: voucherCode.value.trim() })
    });
    voucherResult.innerHTML = '<div class="message success">Voucher riscattato.</div>';
    await loadAll();
  } catch (error) {
    voucherResult.innerHTML = `<div class="message error">${escapeHtml(error.message)}</div>`;
  }
}

function logout() {
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(USER_KEY);
  show(loginSection);
  hide(appSection);
}

loginBtn.addEventListener('click', login);
refreshBtn.addEventListener('click', loadAll);
logoutBtn.addEventListener('click', logout);
createCampaignBtn.addEventListener('click', createCampaign);
createPrizeBtn.addEventListener('click', createPrize);
validateVoucherBtn.addEventListener('click', validateVoucher);
redeemVoucherBtn.addEventListener('click', redeemVoucher);

if (getToken()) {
  showApp();
}
