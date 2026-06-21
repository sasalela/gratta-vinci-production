const TOKEN_KEY = 'gv_store_token';
const USER_KEY = 'gv_store_user';

const params = new URLSearchParams(window.location.search);
const voucherCode = params.get('code') || '';

const loginSection = document.getElementById('loginSection');
const redeemSection = document.getElementById('redeemSection');
const emailInput = document.getElementById('emailInput');
const passwordInput = document.getElementById('passwordInput');
const loginBtn = document.getElementById('loginBtn');
const loginError = document.getElementById('loginError');
const loadError = document.getElementById('loadError');
const successMessage = document.getElementById('successMessage');
const voucherCodeLabel = document.getElementById('voucherCodeLabel');
const statusBadge = document.getElementById('statusBadge');
const voucherDetails = document.getElementById('voucherDetails');
const redeemBtn = document.getElementById('redeemBtn');

let currentVoucher = null;

function show(el) {
  el.classList.remove('hidden');
}

function hide(el) {
  el.classList.add('hidden');
}

function getToken() {
  return sessionStorage.getItem(TOKEN_KEY);
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

function prizeLabel(prize) {
  return `${prize?.emoji || ''} ${prize?.name || '-'}`.trim();
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
    sessionStorage.removeItem(USER_KEY);
    throw new Error('Accedi con l’account del negozio per continuare.');
  }

  if (!response.ok || !payload.success) {
    throw new Error(payload.error || payload.message || `Errore API (${response.status})`);
  }

  return payload.data;
}

function setStatus(status) {
  const labels = {
    valid: 'Valido',
    redeemed: 'Già riscattato',
    expired: 'Scaduto'
  };
  statusBadge.className = `status ${status || ''}`;
  statusBadge.textContent = labels[status] || status || '-';
}

function renderVoucher(voucher) {
  currentVoucher = voucher;
  voucherCodeLabel.textContent = voucher.code;
  setStatus(voucher.status);

  const customerData = voucher.participation?.customerData || {};
  const customerName = [customerData.name, customerData.surname].filter(Boolean).join(' ') || '-';

  voucherDetails.innerHTML = `
    <div class="detail">
      <span>Premio</span>
      <strong>${escapeHtml(prizeLabel(voucher.prize))}</strong>
    </div>
    <div class="detail">
      <span>Campagna</span>
      <strong>${escapeHtml(voucher.campaign?.name || '-')}</strong>
    </div>
    <div class="detail">
      <span>Cliente</span>
      <strong>${escapeHtml(customerName)} · ${escapeHtml(voucher.email || '-')}</strong>
    </div>
    <div class="detail">
      <span>Scadenza</span>
      <strong>${escapeHtml(formatDate(voucher.expiresAt))}</strong>
    </div>
    <div class="detail">
      <span>Creato</span>
      <strong>${escapeHtml(formatDate(voucher.createdAt))}</strong>
    </div>
  `;

  redeemBtn.disabled = voucher.status !== 'valid';
  hide(loadError);
  show(redeemSection);
}

async function validateVoucher() {
  hide(successMessage);
  voucherCodeLabel.textContent = voucherCode || '-';

  if (!voucherCode) {
    loadError.textContent = 'Codice voucher mancante nell’URL.';
    show(loadError);
    show(redeemSection);
    redeemBtn.disabled = true;
    return;
  }

  try {
    const voucher = await api('/api/store/vouchers/validate', {
      method: 'POST',
      body: JSON.stringify({ code: voucherCode })
    });
    renderVoucher(voucher);
  } catch (error) {
    loadError.textContent = error.message;
    show(loadError);
    show(loginSection);
  }
}

async function login() {
  loginError.textContent = '';
  hide(loginError);
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
    const payload = await response.json().catch(() => ({}));

    if (!response.ok || !payload.success) {
      throw new Error(payload.error || 'Credenziali non valide.');
    }
    if (!payload.data.user.storeId) {
      throw new Error('Questo utente non è collegato a un negozio.');
    }

    sessionStorage.setItem(TOKEN_KEY, payload.data.token);
    sessionStorage.setItem(USER_KEY, JSON.stringify(payload.data.user));
    hide(loginSection);
    await validateVoucher();
  } catch (error) {
    loginError.textContent = error.message;
    show(loginError);
  } finally {
    loginBtn.disabled = false;
  }
}

async function redeemVoucher() {
  if (!currentVoucher || currentVoucher.status !== 'valid') return;
  redeemBtn.disabled = true;
  hide(successMessage);

  try {
    await api('/api/store/vouchers/redeem', {
      method: 'POST',
      body: JSON.stringify({ code: currentVoucher.code, notes: 'Riscattato da pagina QR card premio' })
    });
    successMessage.textContent = 'Premio riscattato correttamente.';
    show(successMessage);
    await validateVoucher();
  } catch (error) {
    loadError.textContent = error.message;
    show(loadError);
  } finally {
    redeemBtn.disabled = false;
  }
}

loginBtn.addEventListener('click', login);
redeemBtn.addEventListener('click', redeemVoucher);
passwordInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') login();
});

if (getToken()) {
  validateVoucher();
} else {
  voucherCodeLabel.textContent = voucherCode || '-';
  show(loginSection);
  show(redeemSection);
  redeemBtn.disabled = true;
}
