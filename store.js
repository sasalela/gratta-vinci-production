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
const appSuccess = document.getElementById('appSuccess');
const campaignForm = document.getElementById('campaignForm');
const saveCampaignBtn = document.getElementById('saveCampaignBtn');
const createPrizeBtn = document.getElementById('createPrizeBtn');
const newCampaignBtn = document.getElementById('newCampaignBtn');
const cancelEditBtn = document.getElementById('cancelEditBtn');
const cancelEditBtnBottom = document.getElementById('cancelEditBtnBottom');
const campaignCards = document.getElementById('campaignCards');
const participationsTable = document.getElementById('participationsTable');
const vouchersTable = document.getElementById('vouchersTable');
const alertsList = document.getElementById('alertsList');
const voucherCode = document.getElementById('voucherCode');
const validateVoucherBtn = document.getElementById('validateVoucherBtn');
const redeemVoucherBtn = document.getElementById('redeemVoucherBtn');
const voucherResult = document.getElementById('voucherResult');
const scanQrBtn = document.getElementById('scanQrBtn');
const stopScanBtn = document.getElementById('stopScanBtn');
const scannerPanel = document.getElementById('scannerPanel');
const qrVideo = document.getElementById('qrVideo');
const scannerStatus = document.getElementById('scannerStatus');
const editorTitle = document.getElementById('editorTitle');
const editorSubtitle = document.getElementById('editorSubtitle');
const prizeList = document.getElementById('prizeList');
const prizeForm = document.getElementById('prizeForm');
const statActiveCampaigns = document.getElementById('statActiveCampaigns');
const statParticipations = document.getElementById('statParticipations');
const statOpenVouchers = document.getElementById('statOpenVouchers');
const statRedeemedVouchers = document.getElementById('statRedeemedVouchers');

const state = {
  campaigns: [],
  participations: [],
  vouchers: [],
  alerts: [],
  editingCampaignId: null,
  store: null,
  scannerStream: null,
  scannerFrame: null
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

function formatDate(value) {
  if (!value) return '-';
  return new Date(value).toLocaleString('it-IT');
}

function formatDateOnly(value) {
  if (!value) return '';
  return new Date(value).toISOString().slice(0, 10);
}

function slugify(value) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
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
    if (response.status === 401 || response.status === 403) {
      sessionStorage.removeItem(TOKEN_KEY);
      sessionStorage.removeItem(USER_KEY);
    }
    const validation = Array.isArray(payload.errors)
      ? payload.errors.map((error) => error.message || error).join(', ')
      : '';
    const rawMessage = validation || payload.message || payload.error || `Errore API (${response.status})`;
    if (rawMessage.includes('Unique constraint failed') || rawMessage.includes('storeId') && rawMessage.includes('slug')) {
      throw new Error('Esiste già una campagna con questo slug. Cambia il nome o lo slug link.');
    }
    throw new Error(rawMessage);
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

function showSuccess(message) {
  appSuccess.textContent = message;
  show(appSuccess);
  setTimeout(() => hide(appSuccess), 3500);
}

function switchTab(name) {
  if (name !== 'vouchers') {
    stopQrScanner();
  }
  document.querySelectorAll('.tab').forEach((tab) => {
    tab.classList.toggle('active', tab.dataset.tab === name);
  });
  document.querySelectorAll('.tab-panel').forEach((panel) => hide(panel));
  show(document.getElementById(`tab${name[0].toUpperCase()}${name.slice(1)}`));
}

function normalizeScannedVoucherCode(value) {
  const text = String(value || '').trim();
  if (!text) return '';

  try {
    const url = new URL(text);
    return url.searchParams.get('code') || url.pathname.split('/').filter(Boolean).pop() || text;
  } catch {
    return text;
  }
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

    state.store = me.store;
    state.campaigns = campaigns;
    state.participations = participations;
    state.vouchers = vouchers;
    state.alerts = alerts;

    storeName.textContent = me.store?.name || 'Negozio';
    userLabel.textContent = ` — ${me.user.email}`;
    renderStats();
    renderCampaigns(campaigns);
    renderParticipations(participations);
    renderVouchers(vouchers);
    renderAlerts(alerts);
  } catch (error) {
    setError(appError, error.message);
  }
}

function renderStats() {
  statActiveCampaigns.textContent = state.campaigns.filter((campaign) => campaign.active).length;
  statParticipations.textContent = state.participations.length;
  statOpenVouchers.textContent = state.vouchers.filter((voucher) => !voucher.redeemed).length;
  statRedeemedVouchers.textContent = state.vouchers.filter((voucher) => voucher.redeemed).length;
}

function renderCampaigns(campaigns) {
  if (!campaigns.length) {
    campaignCards.innerHTML = '<div class="empty-state">Non hai ancora campagne. Clicca su “Nuova campagna” per crearne una.</div>';
    return;
  }

  campaignCards.innerHTML = campaigns.map((campaign) => {
    const playUrl = `${window.location.origin}/?store=${state.store?.slug || 'negozio'}&campaign=${campaign.slug}`;
    const stats = campaign.stats || {};
    const prizes = campaign.prizeItems.map((prize) => (
      `<div class="prize-stock">
        <strong>${escapeHtml(prize.emoji || '')} ${escapeHtml(prize.name)}</strong>
        <span>${prize.remainingQuantity}/${prize.totalQuantity} disponibili · ${prize.winProbability}% vincita</span>
      </div>`
    )).join('') || '<span class="muted">Nessun premio inserito</span>';
    return `
      <article class="campaign-card">
        <div class="campaign-card-head">
          <div>
            <span class="status ${campaign.active ? 'active' : 'inactive'}">${campaign.active ? 'Attiva' : 'Non attiva'}</span>
            <h3>${escapeHtml(campaign.name)}</h3>
            <p class="muted">${escapeHtml(campaign.description || 'Nessuna descrizione')}</p>
          </div>
          <button type="button" class="secondary small" data-edit-campaign="${escapeHtml(campaign.id)}">Modifica</button>
        </div>
        <div class="campaign-meta">
          <span>Periodo: ${formatDate(campaign.startDate)} - ${formatDate(campaign.endDate)}</span>
          <span>Limite: ${campaign.playLimitMode === 'per_day' ? '1 volta al giorno' : '1 volta per campagna'}</span>
        </div>
        <div class="campaign-stats">
          <div>
            <span>Giocate</span>
            <strong>${stats.totalPlays ?? campaign._count?.participations ?? 0}</strong>
          </div>
          <div>
            <span>Vincite</span>
            <strong>${stats.wins ?? 0}</strong>
          </div>
          <div>
            <span>% reale</span>
            <strong>${stats.realWinRate ?? 0}%</strong>
          </div>
          <div>
            <span>Voucher emessi</span>
            <strong>${stats.vouchersIssued ?? campaign._count?.vouchers ?? 0}</strong>
          </div>
          <div>
            <span>Riscattati</span>
            <strong>${stats.vouchersRedeemed ?? 0}</strong>
          </div>
          <div>
            <span>Premi residui</span>
            <strong>${stats.prizesRemaining ?? 0}/${stats.prizesTotal ?? 0}</strong>
          </div>
        </div>
        <h4 class="stock-title">Disponibilità premi</h4>
        <div class="prize-list compact">${prizes}</div>
        <div class="play-link">
          <input readonly value="${escapeHtml(playUrl)}">
          <a href="${escapeHtml(playUrl)}" target="_blank" rel="noreferrer">Apri gioco</a>
        </div>
      </article>
    `;
  }).join('');

  campaignCards.querySelectorAll('[data-edit-campaign]').forEach((button) => {
    button.addEventListener('click', () => editCampaign(button.dataset.editCampaign));
  });
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
    alertsList.innerHTML = '';
    return;
  }
  alertsList.innerHTML = rows.map((alert) => (
    `<div class="alert ${alert.readByStore ? '' : 'unread'}">${escapeHtml(alert.message)} <small>${formatDate(alert.createdAt)}</small></div>`
  )).join('');
}

function resetCampaignForm() {
  state.editingCampaignId = null;
  editorTitle.textContent = 'Nuova campagna';
  editorSubtitle.textContent = 'Compila campagna e primo premio: verranno salvati insieme.';
  campaignForm.reset();
  document.getElementById('campaignActive').checked = true;
  document.getElementById('voucherValidityDays').value = 15;
  document.getElementById('loseMessage').value = 'Nessun premio questa volta.';
  document.querySelector('[data-field="name"]').checked = true;
  document.querySelector('[data-field="email"]').checked = true;
  prizeList.innerHTML = '<p class="muted">Inserisci qui sotto il primo premio della nuova campagna.</p>';
  prizeForm.classList.remove('disabled-block');
}

function editCampaign(campaignId) {
  const campaign = state.campaigns.find((item) => item.id === campaignId);
  if (!campaign) return;

  state.editingCampaignId = campaign.id;
  editorTitle.textContent = `Modifica: ${campaign.name}`;
  editorSubtitle.textContent = 'Aggiorna parametri, stato attivo e premi della campagna.';
  document.getElementById('campaignName').value = campaign.name || '';
  document.getElementById('campaignSlug').value = campaign.slug || '';
  document.getElementById('campaignDescription').value = campaign.description || '';
  document.getElementById('startDate').value = formatDateOnly(campaign.startDate);
  document.getElementById('endDate').value = formatDateOnly(campaign.endDate);
  document.getElementById('playLimitMode').value = campaign.playLimitMode || 'per_campaign';
  document.getElementById('voucherValidityDays').value = campaign.voucherValidityDays || 15;
  document.getElementById('loseMessage').value = campaign.loseMessage || 'Nessun premio questa volta.';
  document.getElementById('campaignActive').checked = campaign.active;

  document.querySelectorAll('[data-field]').forEach((input) => {
    const field = (campaign.customerFields || []).find((item) => item.key === input.dataset.field);
    input.checked = Boolean(field?.enabled) || ['name', 'email'].includes(input.dataset.field);
  });

  renderPrizeEditor(campaign);
  switchTab('editor');
}

function renderPrizeEditor(campaign) {
  prizeForm.classList.remove('disabled-block');
  if (!campaign.prizeItems.length) {
    prizeList.innerHTML = '<p class="muted">Nessun premio inserito. Aggiungi almeno un premio per poter assegnare voucher.</p>';
    return;
  }
  prizeList.innerHTML = campaign.prizeItems.map((prize) => (
    `<div class="prize-row">
      <strong>${escapeHtml(prize.emoji || '')} ${escapeHtml(prize.name)}</strong>
      <span>${prize.remainingQuantity}/${prize.totalQuantity} disponibili</span>
      <span>${prize.winProbability}% vincita</span>
    </div>`
  )).join('');
}

async function saveCampaign(event) {
  event.preventDefault();
  clearError(appError);
  try {
    const name = document.getElementById('campaignName').value.trim();
    const slug = document.getElementById('campaignSlug').value.trim() || slugify(name);
    if (!name || !slug) {
      throw new Error('Inserisci nome campagna e slug.');
    }
    if (!document.getElementById('startDate').value || !document.getElementById('endDate').value) {
      throw new Error('Inserisci data inizio e data fine campagna.');
    }

    const duplicate = state.campaigns.find((item) => (
      item.slug === slug && item.id !== state.editingCampaignId
    ));
    if (duplicate) {
      throw new Error('Esiste già una campagna con questo slug. Cambia il nome o lo slug link.');
    }

    const wasCreating = !state.editingCampaignId;
    if (wasCreating) {
      validatePrizeDraft();
    }

    const campaign = {
      name,
      slug,
      description: document.getElementById('campaignDescription').value.trim(),
      startDate: document.getElementById('startDate').value,
      endDate: document.getElementById('endDate').value,
      playLimitMode: document.getElementById('playLimitMode').value,
      voucherValidityDays: Number(document.getElementById('voucherValidityDays').value || 15),
      loseMessage: document.getElementById('loseMessage').value.trim() || 'Nessun premio questa volta.',
      gameType: 'scratch_card',
      active: document.getElementById('campaignActive').checked,
      customerFields: getCustomerFields()
    };

    const path = state.editingCampaignId
      ? `/api/store/campaigns/${state.editingCampaignId}`
      : '/api/store/campaigns';

    const saved = await api(path, {
      method: state.editingCampaignId ? 'PUT' : 'POST',
      body: JSON.stringify(campaign)
    });

    if (wasCreating && getPrizeDraft().name) {
      await savePrizeForCampaign(saved.id);
    }

    await loadAll();
    state.editingCampaignId = saved.id;
    editCampaign(saved.id);
    showSuccess(wasCreating ? 'Campagna e premio salvati correttamente.' : 'Campagna salvata correttamente.');
  } catch (error) {
    setError(appError, error.message);
  }
}

function getPrizeDraft() {
  return {
    name: document.getElementById('prizeName').value.trim(),
    emoji: document.getElementById('prizeEmoji').value.trim(),
    description: document.getElementById('prizeDescription').value.trim(),
    totalQuantity: Number(document.getElementById('prizeQuantity').value || 0),
    winProbability: Number(document.getElementById('prizeProbability').value || 0),
    active: true
  };
}

function validatePrizeDraft() {
  const prize = getPrizeDraft();
  if (!prize.name) {
    throw new Error('Inserisci il nome del premio.');
  }
  if (prize.totalQuantity < 1) {
    throw new Error('La quantità premi deve essere almeno 1.');
  }
  if (prize.winProbability <= 0 || prize.winProbability > 100) {
    throw new Error('La percentuale di vincita deve essere tra 1 e 100.');
  }
  return prize;
}

async function savePrizeForCampaign(campaignId) {
  const prize = validatePrizeDraft();
  return api(`/api/store/campaigns/${campaignId}/prizes`, {
    method: 'POST',
    body: JSON.stringify(prize)
  });
}

async function createPrize() {
  clearError(appError);
  try {
    const campaignId = state.editingCampaignId;
    if (!campaignId) {
      throw new Error('Per una nuova campagna compila il premio e poi clicca “Salva campagna”.');
    }

    await savePrizeForCampaign(campaignId);
    await loadAll();
    editCampaign(campaignId);
    document.getElementById('prizeName').value = '';
    document.getElementById('prizeEmoji').value = '';
    document.getElementById('prizeDescription').value = '';
    showSuccess('Premio aggiunto correttamente.');
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

async function startQrScanner() {
  voucherResult.innerHTML = '';

  if (!('BarcodeDetector' in window)) {
    voucherResult.innerHTML = '<div class="message error">Scanner QR non supportato da questo browser. Inserisci il codice manualmente.</div>';
    return;
  }

  try {
    show(scannerPanel);
    show(stopScanBtn);
    scanQrBtn.disabled = true;
    scannerStatus.textContent = 'Apro la fotocamera...';

    const detector = new BarcodeDetector({ formats: ['qr_code'] });
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' } },
      audio: false
    });

    state.scannerStream = stream;
    qrVideo.srcObject = stream;
    await qrVideo.play();
    scannerStatus.textContent = 'Inquadra il QR della card premio.';

    const scan = async () => {
      if (!state.scannerStream) return;

      try {
        const codes = await detector.detect(qrVideo);
        if (codes.length > 0) {
          const code = normalizeScannedVoucherCode(codes[0].rawValue);
          if (code) {
            voucherCode.value = code;
            stopQrScanner();
            voucherResult.innerHTML = `<div class="message success">Codice letto: ${escapeHtml(code)}</div>`;
            await validateVoucher();
            return;
          }
        }
      } catch {
        scannerStatus.textContent = 'Non riesco a leggere il QR. Avvicina la card e riprova.';
      }

      state.scannerFrame = requestAnimationFrame(scan);
    };

    state.scannerFrame = requestAnimationFrame(scan);
  } catch (error) {
    stopQrScanner();
    voucherResult.innerHTML = `<div class="message error">Impossibile aprire la fotocamera: ${escapeHtml(error.message || 'permesso negato')}</div>`;
  } finally {
    scanQrBtn.disabled = false;
  }
}

function stopQrScanner() {
  if (state.scannerFrame) {
    cancelAnimationFrame(state.scannerFrame);
    state.scannerFrame = null;
  }

  if (state.scannerStream) {
    state.scannerStream.getTracks().forEach((track) => track.stop());
    state.scannerStream = null;
  }

  qrVideo.pause();
  qrVideo.srcObject = null;
  hide(scannerPanel);
  hide(stopScanBtn);
  scanQrBtn.disabled = false;
  scannerStatus.textContent = 'Inquadra il QR della card premio.';
}

function logout() {
  stopQrScanner();
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(USER_KEY);
  show(loginSection);
  hide(appSection);
}

function newCampaign() {
  resetCampaignForm();
  switchTab('editor');
}

loginBtn.addEventListener('click', login);
refreshBtn.addEventListener('click', loadAll);
logoutBtn.addEventListener('click', logout);
newCampaignBtn.addEventListener('click', newCampaign);
campaignForm.addEventListener('submit', saveCampaign);
createPrizeBtn.addEventListener('click', createPrize);
validateVoucherBtn.addEventListener('click', validateVoucher);
redeemVoucherBtn.addEventListener('click', redeemVoucher);
scanQrBtn.addEventListener('click', startQrScanner);
stopScanBtn.addEventListener('click', stopQrScanner);
cancelEditBtn.addEventListener('click', () => switchTab('campaigns'));
cancelEditBtnBottom.addEventListener('click', () => switchTab('campaigns'));
document.getElementById('campaignName').addEventListener('input', (event) => {
  if (!state.editingCampaignId) {
    document.getElementById('campaignSlug').value = slugify(event.target.value);
  }
});

document.querySelectorAll('.tab').forEach((tab) => {
  tab.addEventListener('click', () => switchTab(tab.dataset.tab));
});

resetCampaignForm();

if (getToken()) {
  showApp();
}
