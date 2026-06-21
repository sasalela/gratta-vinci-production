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
const quickCampaignTitle = document.getElementById('quickCampaignTitle');
const quickCampaignSubtitle = document.getElementById('quickCampaignSubtitle');
const quickPlayUrl = document.getElementById('quickPlayUrl');
const copyQuickLinkBtn = document.getElementById('copyQuickLinkBtn');
const quickNewCampaignBtn = document.getElementById('quickNewCampaignBtn');
const quickInsights = document.getElementById('quickInsights');
const campaignForm = document.getElementById('campaignForm');
const saveCampaignBtn = document.getElementById('saveCampaignBtn');
const createPrizeBtn = document.getElementById('createPrizeBtn');
const resetPrizeBtn = document.getElementById('resetPrizeBtn');
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
const profileForm = document.getElementById('profileForm');
const profileName = document.getElementById('profileName');
const profilePhone = document.getElementById('profilePhone');
const profileAddress = document.getElementById('profileAddress');
const profileLogoUrl = document.getElementById('profileLogoUrl');
const profilePrimaryColor = document.getElementById('profilePrimaryColor');
const profileSecondaryColor = document.getElementById('profileSecondaryColor');
const profilePreview = document.getElementById('profilePreview');
const profilePreviewLogo = document.getElementById('profilePreviewLogo');
const profilePreviewName = document.getElementById('profilePreviewName');
const profilePreviewMeta = document.getElementById('profilePreviewMeta');
const subscriptionBanner = document.getElementById('subscriptionBanner');
const subscriptionTitle = document.getElementById('subscriptionTitle');
const subscriptionText = document.getElementById('subscriptionText');
const subscriptionDays = document.getElementById('subscriptionDays');
const openBillingBtn = document.getElementById('openBillingBtn');
const billingStatus = document.getElementById('billingStatus');
const billingPlans = document.getElementById('billingPlans');

const state = {
  campaigns: [],
  participations: [],
  vouchers: [],
  alerts: [],
  editingCampaignId: null,
  editingPrizeId: null,
  store: null,
  subscription: null,
  billingPlans: [],
  scannerStream: null,
  scannerFrame: null
};

const GAME_TYPE_LABELS = {
  scratch_card: 'Gratta e vinci',
  wheel: 'Ruota della fortuna',
  instant_reveal: 'Scatole misteriose'
};

function getGameTypeLabel(gameType) {
  return GAME_TYPE_LABELS[gameType] || gameType || 'Gratta e vinci';
}

function isGuaranteedWinEnabled() {
  return document.getElementById('guaranteedWin')?.checked || false;
}

function getEditablePrizes() {
  const campaign = state.campaigns.find((item) => item.id === state.editingCampaignId);
  const savedPrizes = (campaign?.prizeItems || [])
    .filter((prize) => prize.id !== state.editingPrizeId)
    .map((prize) => ({
      name: prize.name,
      winProbability: Number(prize.winProbability || 0),
      active: Boolean(prize.active)
    }));

  const draft = getPrizeDraft();
  if (draft.name) {
    savedPrizes.push({
      name: draft.name,
      winProbability: Number(draft.winProbability || 0),
      active: Boolean(draft.active)
    });
  }

  return savedPrizes;
}

function updateGuaranteedWinUi() {
  const guaranteed = isGuaranteedWinEnabled();
  const loseMessageLabel = document.getElementById('loseMessageLabel');
  const loseMessageInput = document.getElementById('loseMessage');
  const guaranteedHelp = document.getElementById('guaranteedWinHelp');

  if (loseMessageLabel) {
    loseMessageLabel.classList.toggle('hidden', guaranteed);
  }
  if (loseMessageInput) {
    loseMessageInput.classList.toggle('hidden', guaranteed);
  }
  if (guaranteedHelp) {
    guaranteedHelp.textContent = guaranteed
      ? 'Ogni giocatore vince uno dei premi ancora disponibili. Le percentuali si ripartiscono tra i premi attivi.'
      : 'Se disattiva, la somma delle probabilità premi può lasciare una quota di non vincita.';
  }

  updateProbabilitySummary();
}

function updateProbabilitySummary() {
  const summary = document.getElementById('probabilitySummary');
  if (!summary) return;

  const prizes = getEditablePrizes().filter((prize) => prize.active && prize.winProbability > 0);
  if (!prizes.length) {
    summary.classList.add('hidden');
    summary.innerHTML = '';
    return;
  }

  const total = prizes.reduce((sum, prize) => sum + prize.winProbability, 0);
  const guaranteed = isGuaranteedWinEnabled();
  const loseRate = guaranteed ? 0 : Math.max(0, 100 - total);
  const normalized = guaranteed && total > 0
    ? prizes.map((prize) => ({
        ...prize,
        effective: Math.round((prize.winProbability / total) * 1000) / 10
      }))
    : prizes.map((prize) => ({ ...prize, effective: prize.winProbability }));

  summary.classList.remove('hidden');
  summary.innerHTML = `
    <strong>${guaranteed ? 'Ripartizione premi (vincita garantita)' : 'Ripartizione probabilità'}</strong>
    <ul>
      ${normalized.map((prize) => `<li>${escapeHtml(prize.name)}: ${prize.effective}%</li>`).join('')}
    </ul>
    ${guaranteed
      ? '<p class="ok">Ogni giocatore vince uno di questi premi finché c’è stock disponibile.</p>'
      : loseRate > 0
        ? `<p class="ok">Probabilità di non vincere: ${Math.round(loseRate * 10) / 10}%</p>`
        : '<p class="ok">Con questa configurazione ogni giocata assegna un premio se c’è stock.</p>'}
    ${!guaranteed && total > 100 ? `<p class="warning">Attenzione: la somma premi (${total}%) supera il 100%.</p>` : ''}
  `;
}

function validateCampaignProbabilities() {
  const prizes = getEditablePrizes().filter((prize) => prize.active && prize.winProbability > 0);
  const total = prizes.reduce((sum, prize) => sum + prize.winProbability, 0);

  if (isGuaranteedWinEnabled()) {
    if (!prizes.length) {
      throw new Error('Con vincita garantita serve almeno un premio attivo con probabilità maggiore di 0.');
    }
    return;
  }

  if (total > 100) {
    throw new Error(`La somma delle probabilità dei premi attivi (${total}%) supera il 100%.`);
  }
}

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

function formatDisplayDate(value) {
  if (!value) return 'senza scadenza';
  return new Date(value).toLocaleDateString('it-IT');
}

function getSubscriptionInfo(store, subscription) {
  if (subscription?.status === 'inactive' || store?.active === false) {
    return {
      status: 'danger',
      title: 'Account disattivato',
      text: subscription?.message || 'Contatta l’amministratore della piattaforma per riattivare il negozio.',
      daysLabel: 'Bloccato'
    };
  }

  if (subscription?.status === 'expired') {
    return {
      status: 'danger',
      title: 'Trial scaduto',
      text: subscription.message || `Scaduto il ${formatDisplayDate(store.subscriptionExpiresAt)}. Attiva un piano per continuare.`,
      daysLabel: 'Scaduto'
    };
  }

  if (!store?.subscriptionExpiresAt && subscription?.status === 'active') {
    return {
      status: 'success',
      title: 'Abbonamento attivo',
      text: subscription.message || 'Il negozio non ha una scadenza impostata.',
      daysLabel: 'Attivo'
    };
  }

  const daysLeft = subscription?.daysLeft ?? (
    store?.subscriptionExpiresAt
      ? Math.ceil((new Date(store.subscriptionExpiresAt).getTime() - Date.now()) / 86400000)
      : null
  );

  if (subscription?.status === 'expiring' || (typeof daysLeft === 'number' && daysLeft <= 7 && daysLeft >= 0)) {
    return {
      status: 'warning',
      title: 'Trial in scadenza',
      text: subscription?.message || `Scade il ${formatDisplayDate(store.subscriptionExpiresAt)}. Attiva un piano per non interrompere le campagne.`,
      daysLabel: `${daysLeft} gg`
    };
  }

  return {
    status: 'success',
    title: 'Trial attivo',
    text: subscription?.message || `Scade il ${formatDisplayDate(store?.subscriptionExpiresAt)}. Puoi creare campagne e materiali promozionali.`,
    daysLabel: typeof daysLeft === 'number' ? `${daysLeft} gg` : 'Attivo'
  };
}

function isStoreOperational() {
  return Boolean(state.subscription?.operational);
}

function applyOperationalLocks() {
  const locked = !isStoreOperational();
  [newCampaignBtn, quickNewCampaignBtn, saveCampaignBtn, createPrizeBtn].forEach((button) => {
    if (button) button.disabled = locked;
  });
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
    const [me, campaigns, participations, vouchers, alerts, billing] = await Promise.all([
      api('/api/store/me'),
      api('/api/store/campaigns'),
      api('/api/store/participations'),
      api('/api/store/vouchers'),
      api('/api/store/alerts'),
      api('/api/store/subscription')
    ]);

    state.store = me.store;
    state.subscription = {
      operational: billing.operational,
      status: billing.status,
      currentPlan: billing.currentPlan,
      daysLeft: billing.daysLeft,
      message: billing.message
    };
    state.billingPlans = billing.plans || [];
    state.campaigns = campaigns;
    state.participations = participations;
    state.vouchers = vouchers;
    state.alerts = alerts;

    storeName.textContent = me.store?.name || 'Negozio';
    userLabel.textContent = ` — ${me.user.email}`;
    populateProfileForm(me.store);
    renderSubscriptionBanner();
    applyOperationalLocks();
    renderBillingSection();
    renderOperationalDashboard();
    renderStats();
    renderCampaigns(campaigns);
    renderParticipations(participations);
    renderVouchers(vouchers);
    renderAlerts(alerts);
  } catch (error) {
    setError(appError, error.message);
  }
}

function getCampaignPlayUrl(campaign) {
  if (!campaign || !state.store?.slug) return '';
  return `${window.location.origin}/?store=${state.store.slug}&campaign=${campaign.slug}`;
}

function getPrimaryCampaign() {
  const now = new Date();
  return state.campaigns.find((campaign) => (
    campaign.active && new Date(campaign.startDate) <= now && new Date(campaign.endDate) >= now
  )) || state.campaigns.find((campaign) => campaign.active) || state.campaigns[0] || null;
}

function renderOperationalDashboard() {
  const campaign = getPrimaryCampaign();
  const openVouchers = state.vouchers.filter((voucher) => !voucher.redeemed);
  const lowPrizes = state.campaigns.flatMap((item) => (
    item.prizeItems
      .filter((prize) => prize.active && prize.totalQuantity > 0 && prize.remainingQuantity <= Math.max(2, Math.ceil(prize.totalQuantity * 0.15)))
      .map((prize) => ({ campaign: item.name, prize }))
  ));

  quickCampaignTitle.textContent = campaign ? campaign.name : 'Nessuna campagna attiva';
  quickCampaignSubtitle.textContent = campaign
    ? 'Link pronto da condividere o inserire nei materiali promozionali.'
    : 'Crea una nuova campagna per iniziare a raccogliere giocate.';
  quickPlayUrl.value = getCampaignPlayUrl(campaign);
  copyQuickLinkBtn.disabled = !quickPlayUrl.value;

  const insights = [];
  if (openVouchers.length > 0) {
    insights.push({
      type: 'warning',
      title: `${openVouchers.length} voucher da riscattare`,
      text: 'Controlla i clienti che devono ancora ritirare il premio.',
      action: 'Vai ai voucher',
      tab: 'vouchers'
    });
  }
  if (lowPrizes.length > 0) {
    insights.push({
      type: 'danger',
      title: `${lowPrizes.length} premio/i in esaurimento`,
      text: lowPrizes.slice(0, 2).map((item) => `${item.prize.name}: ${item.prize.remainingQuantity} rimasti`).join(' · '),
      action: 'Gestisci premi',
      tab: 'campaigns'
    });
  }
  if (!isStoreOperational()) {
    insights.unshift({
      type: 'danger',
      title: 'Abbonamento scaduto',
      text: 'Non puoi creare nuove campagne finché non attivi un piano.',
      action: 'Vai al piano',
      tab: 'billing'
    });
  }
  if (!campaign) {
    insights.push({
      type: 'info',
      title: 'Crea la prima campagna',
      text: 'Configura premio, durata e dati richiesti ai giocatori.',
      action: 'Nuova campagna',
      newCampaign: true
    });
  }
  if (!insights.length) {
    insights.push({
      type: 'success',
      title: 'Tutto sotto controllo',
      text: 'Campagne, premi e voucher non richiedono azioni urgenti.',
      action: 'Vedi campagne',
      tab: 'campaigns'
    });
  }

  quickInsights.innerHTML = insights.map((item) => `
    <div class="quick-insight ${item.type}">
      <strong>${escapeHtml(item.title)}</strong>
      <span>${escapeHtml(item.text)}</span>
      <button type="button" class="small ghost" ${item.newCampaign ? 'data-quick-new-campaign="true"' : `data-quick-tab="${escapeHtml(item.tab)}"`}>${escapeHtml(item.action)}</button>
    </div>
  `).join('');
}

function renderSubscriptionBanner() {
  const info = getSubscriptionInfo(state.store, state.subscription);
  subscriptionBanner.className = `subscription-banner ${info.status}`;
  subscriptionTitle.textContent = info.title;
  subscriptionText.textContent = info.text;
  subscriptionDays.textContent = info.daysLabel;
  openBillingBtn.textContent = state.subscription?.status === 'expired' ? 'Attiva piano' : 'Gestisci piano';
}

function renderBillingSection() {
  if (!state.subscription) {
    billingStatus.innerHTML = '<p class="muted">Caricamento stato abbonamento...</p>';
    billingPlans.innerHTML = '';
    return;
  }

  const expiresLabel = state.store?.subscriptionExpiresAt
    ? formatDisplayDate(state.store.subscriptionExpiresAt)
    : 'Senza scadenza';
  const operationalLabel = isStoreOperational() ? 'Operativo' : 'Limitato';

  billingStatus.innerHTML = `
    <p class="eyebrow">Stato attuale</p>
    <h3>${escapeHtml(state.subscription.currentPlan === 'trial' ? 'Trial' : state.subscription.currentPlan === 'basic' ? 'Basic' : 'Pro')}</h3>
    <p>${escapeHtml(state.subscription.message)}</p>
    <div class="billing-meta">
      <span><strong>Scadenza:</strong> ${escapeHtml(expiresLabel)}</span>
      <span><strong>Accesso:</strong> ${escapeHtml(operationalLabel)}</span>
    </div>
  `;

  const plans = state.billingPlans.length
    ? state.billingPlans
    : [
        { id: 'trial', name: 'Trial', priceLabel: 'Gratis', periodLabel: '14 giorni', description: 'Prova completa.', features: ['1 negozio', 'Campagne', 'QR e voucher'] },
        { id: 'basic', name: 'Basic', priceLabel: '€29/mese', periodLabel: 'Mensile', description: 'Per attività singole.', features: ['1 negozio', 'Supporto email', 'Statistiche'] },
        { id: 'pro', name: 'Pro', priceLabel: '€59/mese', periodLabel: 'Mensile', description: 'Per uso intensivo.', features: ['Tutto del Basic', 'Priorità assistenza', 'Brand avanzato'] }
      ];

  billingPlans.innerHTML = plans.map((plan) => {
    const isCurrent = plan.id === state.subscription.currentPlan;
    const canRequest = !isCurrent && plan.id !== 'trial';
    return `
      <article class="plan-card ${isCurrent ? 'current' : ''}">
        <p class="eyebrow">${escapeHtml(plan.periodLabel)}</p>
        <h3>${escapeHtml(plan.name)}</h3>
        <strong class="plan-price">${escapeHtml(plan.priceLabel)}</strong>
        <p>${escapeHtml(plan.description)}</p>
        <ul>${plan.features.map((feature) => `<li>${escapeHtml(feature)}</li>`).join('')}</ul>
        ${isCurrent ? '<span class="plan-badge">Piano attuale</span>' : ''}
        ${canRequest ? `<button type="button" class="primary full" data-plan-id="${escapeHtml(plan.id)}">Richiedi attivazione</button>` : ''}
      </article>
    `;
  }).join('');
}

async function requestPlanUpgrade(planId) {
  clearError(appError);
  try {
    const data = await api('/api/store/subscription/request', {
      method: 'POST',
      body: JSON.stringify({ planId })
    });
    showSuccess(data.message || 'Richiesta inviata.');
    await loadAll();
  } catch (error) {
    setError(appError, error.message);
  }
}

async function copyQuickLink() {
  if (!quickPlayUrl.value) return;
  try {
    await navigator.clipboard.writeText(quickPlayUrl.value);
    showSuccess('Link gioco copiato.');
  } catch {
    quickPlayUrl.select();
    document.execCommand('copy');
    showSuccess('Link gioco copiato.');
  }
}

function storeInitials(name) {
  return String(name || 'GV')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('');
}

function populateProfileForm(store) {
  if (!store) return;
  profileName.value = store.name || '';
  profilePhone.value = store.phone || '';
  profileAddress.value = store.address || '';
  profileLogoUrl.value = store.logoUrl || '';
  profilePrimaryColor.value = store.primaryColor || '#667eea';
  profileSecondaryColor.value = store.secondaryColor || '#764ba2';
  renderProfilePreview();
}

function renderProfilePreview() {
  const primary = profilePrimaryColor.value || '#667eea';
  const secondary = profileSecondaryColor.value || '#764ba2';
  profilePreview.style.background = `linear-gradient(135deg, ${primary}, ${secondary})`;
  profilePreviewName.textContent = profileName.value || 'Negozio';
  profilePreviewMeta.textContent = [profilePhone.value, profileAddress.value].filter(Boolean).join(' · ') || 'Colori e dati compariranno su gioco e card premio.';

  if (profileLogoUrl.value.trim()) {
    profilePreviewLogo.innerHTML = `<img src="${escapeHtml(profileLogoUrl.value.trim())}" alt="${escapeHtml(profileName.value || 'Logo negozio')}">`;
  } else {
    profilePreviewLogo.textContent = storeInitials(profileName.value);
  }
}

async function saveProfile(event) {
  event.preventDefault();
  clearError(appError);

  try {
    const store = await api('/api/store/me', {
      method: 'PUT',
      body: JSON.stringify({
        name: profileName.value.trim(),
        phone: profilePhone.value.trim(),
        address: profileAddress.value.trim(),
        logoUrl: profileLogoUrl.value.trim(),
        primaryColor: profilePrimaryColor.value,
        secondaryColor: profileSecondaryColor.value
      })
    });

    state.store = store;
    storeName.textContent = store.name;
    renderProfilePreview();
    showSuccess('Profilo negozio aggiornato correttamente.');
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
          <span>${campaign.guaranteedWin ? '<span class="campaign-badge">Vincita garantita</span>' : ''}Gioco: ${escapeHtml(getGameTypeLabel(campaign.gameType))}</span>
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
  state.editingPrizeId = null;
  editorTitle.textContent = 'Nuova campagna';
  editorSubtitle.textContent = 'Compila campagna e primo premio: verranno salvati insieme.';
  campaignForm.reset();
  document.getElementById('campaignActive').checked = true;
  document.getElementById('voucherValidityDays').value = 15;
  document.getElementById('loseMessage').value = 'Nessun premio questa volta.';
  document.getElementById('gameType').value = 'scratch_card';
  document.getElementById('guaranteedWin').checked = false;
  updateGuaranteedWinUi();
  document.querySelector('[data-field="name"]').checked = true;
  document.querySelector('[data-field="email"]').checked = true;
  prizeList.innerHTML = '<p class="muted">Inserisci qui sotto il primo premio della nuova campagna.</p>';
  resetPrizeForm();
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
  document.getElementById('gameType').value = campaign.gameType || 'scratch_card';
  document.getElementById('voucherValidityDays').value = campaign.voucherValidityDays || 15;
  document.getElementById('loseMessage').value = campaign.loseMessage || 'Nessun premio questa volta.';
  document.getElementById('guaranteedWin').checked = Boolean(campaign.guaranteedWin);
  document.getElementById('campaignActive').checked = campaign.active;
  updateGuaranteedWinUi();

  document.querySelectorAll('[data-field]').forEach((input) => {
    const field = (campaign.customerFields || []).find((item) => item.key === input.dataset.field);
    input.checked = Boolean(field?.enabled) || ['name', 'email'].includes(input.dataset.field);
  });

  renderPrizeEditor(campaign);
  switchTab('editor');
}

function renderPrizeEditor(campaign) {
  prizeForm.classList.remove('disabled-block');
  resetPrizeForm();
  if (!campaign.prizeItems.length) {
    prizeList.innerHTML = '<p class="muted">Nessun premio inserito. Aggiungi almeno un premio per poter assegnare voucher.</p>';
    return;
  }
  prizeList.innerHTML = campaign.prizeItems.map((prize) => (
    `<div class="prize-row ${prize.active ? '' : 'inactive-prize'}">
      <strong>${escapeHtml(prize.emoji || '')} ${escapeHtml(prize.name)}</strong>
      <span>${prize.remainingQuantity}/${prize.totalQuantity} disponibili</span>
      <span>${prize.winProbability}% vincita</span>
      <span>${prize.active ? 'Attivo' : 'Disattivo'}</span>
      <button type="button" class="secondary small" data-edit-prize="${escapeHtml(prize.id)}">Modifica</button>
    </div>`
  )).join('');
  prizeList.querySelectorAll('[data-edit-prize]').forEach((button) => {
    button.addEventListener('click', () => editPrize(button.dataset.editPrize));
  });
  updateProbabilitySummary();
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
    } else {
      validateCampaignProbabilities();
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
      gameType: document.getElementById('gameType').value,
      guaranteedWin: document.getElementById('guaranteedWin').checked,
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
  const totalQuantity = Number(document.getElementById('prizeQuantity').value || 0);
  const remainingValue = document.getElementById('prizeRemainingQuantity').value;
  return {
    name: document.getElementById('prizeName').value.trim(),
    emoji: document.getElementById('prizeEmoji').value.trim(),
    description: document.getElementById('prizeDescription').value.trim(),
    totalQuantity,
    remainingQuantity: remainingValue === '' ? totalQuantity : Number(remainingValue),
    winProbability: Number(document.getElementById('prizeProbability').value || 0),
    active: document.getElementById('prizeActive').checked
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
  if (prize.remainingQuantity < 0 || prize.remainingQuantity > prize.totalQuantity) {
    throw new Error('La quantità residua deve essere tra 0 e la quantità totale.');
  }
  if (prize.winProbability <= 0 || prize.winProbability > 100) {
    throw new Error('La percentuale di vincita deve essere tra 1 e 100.');
  }
  return prize;
}

function resetPrizeForm() {
  state.editingPrizeId = null;
  document.getElementById('editingPrizeId').value = '';
  document.getElementById('prizeName').value = '';
  document.getElementById('prizeEmoji').value = '';
  document.getElementById('prizeDescription').value = '';
  document.getElementById('prizeQuantity').value = 10;
  document.getElementById('prizeRemainingQuantity').value = '';
  document.getElementById('prizeProbability').value = 10;
  document.getElementById('prizeActive').checked = true;
  createPrizeBtn.textContent = state.editingCampaignId ? 'Aggiungi premio' : 'Aggiungi premio alla campagna';
  updateProbabilitySummary();
}

function editPrize(prizeId) {
  const campaign = state.campaigns.find((item) => item.id === state.editingCampaignId);
  const prize = campaign?.prizeItems.find((item) => item.id === prizeId);
  if (!prize) return;

  state.editingPrizeId = prize.id;
  document.getElementById('editingPrizeId').value = prize.id;
  document.getElementById('prizeName').value = prize.name || '';
  document.getElementById('prizeEmoji').value = prize.emoji || '';
  document.getElementById('prizeDescription').value = prize.description || '';
  document.getElementById('prizeQuantity').value = prize.totalQuantity;
  document.getElementById('prizeRemainingQuantity').value = prize.remainingQuantity;
  document.getElementById('prizeProbability').value = prize.winProbability;
  document.getElementById('prizeActive').checked = Boolean(prize.active);
  createPrizeBtn.textContent = 'Salva modifiche premio';
  document.getElementById('prizeName').focus();
  updateProbabilitySummary();
}

async function savePrizeForCampaign(campaignId, prizeId = state.editingPrizeId) {
  const prize = validatePrizeDraft();
  const path = prizeId
    ? `/api/store/campaigns/${campaignId}/prizes/${prizeId}`
    : `/api/store/campaigns/${campaignId}/prizes`;
  return api(path, {
    method: prizeId ? 'PUT' : 'POST',
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

    const wasEditingPrize = Boolean(state.editingPrizeId);
    await savePrizeForCampaign(campaignId);
    await loadAll();
    editCampaign(campaignId);
    resetPrizeForm();
    showSuccess(wasEditingPrize ? 'Premio aggiornato correttamente.' : 'Premio aggiunto correttamente.');
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
  if (!isStoreOperational()) {
    setError(appError, 'Abbonamento scaduto. Attiva un piano per creare nuove campagne.');
    switchTab('billing');
    return;
  }
  resetCampaignForm();
  switchTab('editor');
}

openBillingBtn.addEventListener('click', () => switchTab('billing'));
billingPlans.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-plan-id]');
  if (!button) return;
  requestPlanUpgrade(button.dataset.planId);
});
loginBtn.addEventListener('click', login);
refreshBtn.addEventListener('click', loadAll);
logoutBtn.addEventListener('click', logout);
newCampaignBtn.addEventListener('click', newCampaign);
quickNewCampaignBtn.addEventListener('click', newCampaign);
copyQuickLinkBtn.addEventListener('click', copyQuickLink);
campaignForm.addEventListener('submit', saveCampaign);
createPrizeBtn.addEventListener('click', createPrize);
resetPrizeBtn.addEventListener('click', resetPrizeForm);
validateVoucherBtn.addEventListener('click', validateVoucher);
redeemVoucherBtn.addEventListener('click', redeemVoucher);
scanQrBtn.addEventListener('click', startQrScanner);
stopScanBtn.addEventListener('click', stopQrScanner);
profileForm.addEventListener('submit', saveProfile);
cancelEditBtn.addEventListener('click', () => switchTab('campaigns'));
cancelEditBtnBottom.addEventListener('click', () => switchTab('campaigns'));
document.getElementById('campaignName').addEventListener('input', (event) => {
  if (!state.editingCampaignId) {
    document.getElementById('campaignSlug').value = slugify(event.target.value);
  }
});
document.getElementById('guaranteedWin').addEventListener('change', updateGuaranteedWinUi);
['prizeName', 'prizeProbability', 'prizeActive'].forEach((id) => {
  document.getElementById(id).addEventListener('input', updateProbabilitySummary);
  document.getElementById(id).addEventListener('change', updateProbabilitySummary);
});

document.querySelectorAll('.tab').forEach((tab) => {
  tab.addEventListener('click', () => switchTab(tab.dataset.tab));
});

document.addEventListener('click', (event) => {
  const quickTab = event.target.closest('[data-quick-tab]');
  if (quickTab) {
    switchTab(quickTab.dataset.quickTab);
    return;
  }

  if (event.target.closest('[data-quick-new-campaign]')) {
    newCampaign();
  }
});

[profileName, profilePhone, profileAddress, profileLogoUrl, profilePrimaryColor, profileSecondaryColor].forEach((input) => {
  input.addEventListener('input', renderProfilePreview);
});

resetCampaignForm();

if (getToken()) {
  showApp();
}
