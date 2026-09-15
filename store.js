const USER_KEY = 'gv_store_user';
const SL = globalThis.StoreLogic;

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
const alertsList = document.getElementById('alertsList');
const activePromoCard = document.getElementById('activePromoCard');
const otherCampaigns = document.getElementById('otherCampaigns');
const participationsTable = document.getElementById('participationsTable');
const vouchersTable = document.getElementById('vouchersTable');
const voucherCode = document.getElementById('voucherCode');
const validateVoucherBtn = document.getElementById('validateVoucherBtn');
const redeemVoucherBtn = document.getElementById('redeemVoucherBtn');
const voucherResult = document.getElementById('voucherResult');
const scanQrBtn = document.getElementById('scanQrBtn');
const stopScanBtn = document.getElementById('stopScanBtn');
const scannerPanel = document.getElementById('scannerPanel');
const qrVideo = document.getElementById('qrVideo');
const scannerStatus = document.getElementById('scannerStatus');
const profileForm = document.getElementById('profileForm');
const profileName = document.getElementById('profileName');
const profileBusinessType = document.getElementById('profileBusinessType');
const profilePhone = document.getElementById('profilePhone');
const profileAddress = document.getElementById('profileAddress');
const profileLogoUrl = document.getElementById('profileLogoUrl');
const profileLogoFile = document.getElementById('profileLogoFile');
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
const altroBtn = document.getElementById('altroBtn');
const altroMenu = document.getElementById('altroMenu');

const GAME_TYPE_LABELS = {
  scratch_card: 'Gratta e vinci',
  wheel: 'Ruota della fortuna',
  instant_reveal: 'Scatole misteriose'
};

const BUSINESS_TYPE_LABELS = {
  bar: 'Bar / pub',
  restaurant: 'Ristorante',
  retail: 'Negozio',
  beauty: 'Beauty / estetica',
  fitness: 'Palestra / fitness',
  generic: 'Altro'
};

const state = {
  campaigns: [],
  participations: [],
  vouchers: [],
  alerts: [],
  store: null,
  subscription: null,
  billingPlans: [],
  scannerStream: null,
  scannerFrame: null,
  view: 'dashboard',
  wizardStep: 1,
  editingCampaignId: null,
  prizeDrafts: [],
  emojiTargetIndex: null,
  returnFromAdvanced: 2
};

function show(el) { el?.classList.remove('hidden'); }
function hide(el) { el?.classList.add('hidden'); }

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDate(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString('it-IT');
}

function formatDateOnly(value) {
  if (!value) return '';
  return SL.toDateInputValue(new Date(value));
}

function formatDisplayDate(value) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('it-IT');
}

function setError(el, message) {
  el.textContent = message;
  show(el);
}

function clearError(el) {
  el.textContent = '';
  hide(el);
}

function showSuccess(message) {
  appSuccess.textContent = message;
  show(appSuccess);
  setTimeout(() => hide(appSuccess), 3200);
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.success) {
    const validation = Array.isArray(payload.errors)
      ? payload.errors.map((e) => e.message || e).join(', ')
      : '';
    throw new Error(validation || payload.error || payload.message || 'Operazione non riuscita.');
  }
  return payload.data;
}

function getGameTypeLabel(gameType) {
  return GAME_TYPE_LABELS[gameType] || 'Gratta e vinci';
}

function getBusinessTypeLabel(value) {
  return BUSINESS_TYPE_LABELS[value] || 'Attività';
}

function isStoreOperational() {
  return getSubscriptionInfo(state.store, state.subscription).operational;
}

function getSubscriptionInfo(store, subscription) {
  const sub = subscription || {};
  const status = sub.status || store?.subscriptionStatus || 'trial';
  const expiresAt = sub.expiresAt || store?.subscriptionExpiresAt;
  const daysLeft = expiresAt
    ? Math.ceil((new Date(expiresAt) - Date.now()) / (1000 * 60 * 60 * 24))
    : null;
  const operational = status === 'active' || status === 'trial' || (daysLeft != null && daysLeft >= 0 && status !== 'expired');
  return { status, expiresAt, daysLeft, operational, planName: sub.planName || sub.plan?.name || 'Trial' };
}

function resolveEffectiveCustomerFields(raw) {
  const defaults = [
    { key: 'name', label: 'Nome', enabled: true, required: true },
    { key: 'email', label: 'Email', enabled: true, required: true }
  ];
  if (!Array.isArray(raw) || !raw.length) return defaults;
  return raw;
}

function getCustomerFields() {
  const fields = [
    { key: 'name', label: 'Nome', enabled: true, required: true },
    { key: 'email', label: 'Email', enabled: true, required: true }
  ];
  document.querySelectorAll('[data-field]').forEach((input) => {
    if (input.disabled) return;
    fields.push({
      key: input.dataset.field,
      label: input.parentElement?.textContent?.trim() || input.dataset.field,
      enabled: input.checked,
      required: false
    });
  });
  return fields;
}

function switchView(name) {
  state.view = name;
  ['dashboard', 'wizard', 'vouchers', 'players', 'billing', 'profile'].forEach((key) => {
    const el = document.getElementById(`view${key[0].toUpperCase()}${key.slice(1)}`);
    if (!el) return;
    el.classList.toggle('hidden', key !== name);
  });
  hide(altroMenu);
  altroBtn.setAttribute('aria-expanded', 'false');
  if (name === 'wizard') renderWizardStep();
}

function renderDashBrand() {
  const store = state.store;
  if (!store) return;
  storeName.textContent = store.name || 'Negozio';
  const logoEl = document.getElementById('dashLogo');
  if (store.logoUrl) {
    logoEl.innerHTML = `<img src="${escapeHtml(store.logoUrl)}" alt="">`;
  } else {
    logoEl.textContent = SL.storeInitials(store.name);
  }
}

function getPrimaryCampaign() {
  const active = state.campaigns.filter((c) => c.active);
  if (!active.length) return null;
  return active.sort((a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0))[0];
}

function getCampaignPlayUrl(campaign) {
  if (!state.store || !campaign) return '';
  return `${window.location.origin}/?store=${state.store.slug}&campaign=${campaign.slug}`;
}

function campaignWins(campaign) {
  return Number(campaign?.stats?.wins ?? campaign?.wins ?? 0);
}

function campaignPlays(campaign) {
  return Number(campaign?.stats?.totalPlays ?? campaign?.totalPlays ?? 0);
}

function campaignRedeemed(campaign) {
  const fromStats = campaign?.stats?.redeemedVouchers ?? campaign?.redeemedVouchers;
  if (fromStats != null) return Number(fromStats);
  return state.vouchers.filter((v) => v.campaignId === campaign.id && v.status === 'redeemed').length;
}

function renderDashboard() {
  renderDashBrand();
  const primary = getPrimaryCampaign();
  if (!primary) {
    activePromoCard.innerHTML = `
      <p class="eyebrow">Nessuna promozione</p>
      <h2>Metti in piedi la tua promozione</h2>
      <p class="muted">Tre passi: cosa regali, come si gioca, come lo fai sapere.</p>
      <button type="button" class="primary full hit" id="createPromoBtn">Crea la tua promozione</button>
    `;
    activePromoCard.querySelector('#createPromoBtn')?.addEventListener('click', () => startWizard(null));
  } else {
    activePromoCard.innerHTML = `
      <p class="eyebrow">Campagna attiva</p>
      <h2>${escapeHtml(primary.name)}</h2>
      <div class="stat-trio">
        <div><span>Giocate</span><strong>${campaignPlays(primary)}</strong></div>
        <div><span>Vincite</span><strong>${campaignWins(primary)}</strong></div>
        <div><span>Riscattati</span><strong>${campaignRedeemed(primary)}</strong></div>
      </div>
      <div class="promo-actions">
        <a class="secondary hit" href="/content.html?campaign=${encodeURIComponent(primary.id)}">Scarica i materiali</a>
        <button type="button" class="primary hit" data-view="vouchers">Valida un premio</button>
        <button type="button" class="ghost hit" data-edit-campaign="${escapeHtml(primary.id)}">Modifica</button>
      </div>
    `;
  }

  const others = state.campaigns.filter((c) => !primary || c.id !== primary.id);
  if (!others.length) {
    otherCampaigns.innerHTML = '<p class="muted">Nessun’altra campagna.</p>';
  } else {
    otherCampaigns.innerHTML = others.map((c) => `
      <article class="other-card">
        <div>
          <strong>${escapeHtml(c.name)}</strong>
          <span class="status ${c.active ? 'active' : 'inactive'}">${c.active ? 'Attiva' : 'Non attiva'}</span>
        </div>
        <span class="muted">${campaignPlays(c)} giocate</span>
        <button type="button" class="ghost small hit" data-edit-campaign="${escapeHtml(c.id)}">Apri</button>
      </article>
    `).join('');
  }
}

function emptyPrize(overrides = {}) {
  return {
    localId: `local-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    id: null,
    name: '',
    emoji: '🎁',
    description: '',
    totalQuantity: 10,
    remainingQuantity: 10,
    winProbability: 10,
    active: true,
    ...overrides
  };
}

function startWizard(campaignId) {
  if (!isStoreOperational()) {
    setError(appError, 'Abbonamento scaduto. Attiva un piano per creare nuove promozioni.');
    switchView('billing');
    return;
  }
  clearError(appError);
  state.editingCampaignId = campaignId;
  state.wizardStep = 1;
  state.emojiTargetIndex = null;

  if (campaignId) {
    const campaign = state.campaigns.find((c) => c.id === campaignId);
    if (!campaign) return;
    state.prizeDrafts = (campaign.prizeItems || []).map((p) => ({
      localId: p.id,
      id: p.id,
      name: p.name || '',
      emoji: p.emoji || '🎁',
      description: p.description || '',
      totalQuantity: p.totalQuantity,
      remainingQuantity: p.remainingQuantity,
      winProbability: p.winProbability,
      active: Boolean(p.active)
    }));
    if (!state.prizeDrafts.length) state.prizeDrafts = [emptyPrize()];
    document.getElementById('campaignName').value = campaign.name || '';
    document.getElementById('campaignDescription').value = campaign.description || '';
    document.getElementById('startDate').value = formatDateOnly(campaign.startDate);
    document.getElementById('endDate').value = formatDateOnly(campaign.endDate);
    document.getElementById('playLimitMode').value = campaign.playLimitMode || 'per_campaign';
    document.getElementById('gameType').value = campaign.gameType || 'scratch_card';
    document.getElementById('voucherValidityDays').value = campaign.voucherValidityDays || 15;
    document.getElementById('loseMessage').value = campaign.loseMessage || SL.DEFAULT_LOSE_MESSAGE;
    document.getElementById('guaranteedWin').checked = Boolean(campaign.guaranteedWin);
    document.getElementById('campaignActive').checked = campaign.active;
    const effective = resolveEffectiveCustomerFields(campaign.customerFields);
    document.querySelectorAll('[data-field]').forEach((input) => {
      if (input.disabled) return;
      const field = effective.find((f) => f.key === input.dataset.field);
      input.checked = Boolean(field?.enabled);
    });
  } else {
    state.prizeDrafts = [emptyPrize({ name: '', winProbability: 20 })];
    const dates = SL.getDefaultCampaignDates();
    document.getElementById('campaignName').value = SL.defaultPromoName();
    document.getElementById('campaignDescription').value = '';
    document.getElementById('startDate').value = dates.startDate;
    document.getElementById('endDate').value = dates.endDate;
    document.getElementById('playLimitMode').value = 'per_campaign';
    document.getElementById('gameType').value = 'scratch_card';
    document.getElementById('voucherValidityDays').value = 15;
    document.getElementById('loseMessage').value = SL.DEFAULT_LOSE_MESSAGE;
    document.getElementById('guaranteedWin').checked = false;
    document.getElementById('campaignActive').checked = true;
    document.querySelectorAll('[data-field]').forEach((input) => {
      if (!input.disabled) input.checked = false;
    });
  }

  updateGameChoiceUi();
  updateTicketPreview();
  updateGuaranteedWinUi();
  switchView('wizard');
}

function renderWizardStep() {
  const step = state.wizardStep;
  document.querySelectorAll('[data-step-dot]').forEach((dot) => {
    const n = Number(dot.dataset.stepDot);
    dot.classList.toggle('active', n === step);
    dot.classList.toggle('done', n < step);
  });
  hide(document.getElementById('wizardStep1'));
  hide(document.getElementById('wizardStep2'));
  hide(document.getElementById('wizardStep3'));
  hide(document.getElementById('wizardAdvanced'));
  if (step === 'advanced') {
    show(document.getElementById('wizardAdvanced'));
    return;
  }
  show(document.getElementById(`wizardStep${step}`));
  if (step === 1) {
    renderPrizeRows();
    updateLivePreview();
  }
  if (step === 2) {
    updateTicketPreview();
    ensureDatesValid();
  }
  if (step === 3) {
    prepareMaterialsStep();
  }
}

function syncPrizeDraftsFromDom() {
  document.querySelectorAll('.prize-row-edit').forEach((row) => {
    const idx = Number(row.dataset.index);
    const draft = state.prizeDrafts[idx];
    if (!draft) return;
    draft.name = row.querySelector('[data-f="name"]')?.value.trim() || '';
    draft.emoji = row.querySelector('[data-f="emoji"]')?.value.trim() || '🎁';
    draft.totalQuantity = Number(row.querySelector('[data-f="qty"]')?.value || 0);
    draft.remainingQuantity = draft.id ? draft.remainingQuantity : draft.totalQuantity;
    draft.winProbability = Number(row.querySelector('[data-f="prob"]')?.value || 0);
    draft.active = row.querySelector('[data-f="active"]')?.checked !== false;
  });
}

function renderPrizeRows() {
  const wrap = document.getElementById('prizeRows');
  wrap.innerHTML = state.prizeDrafts.map((p, index) => `
    <div class="prize-row-edit card" data-index="${index}">
      <div class="prize-row-top">
        <button type="button" class="emoji-btn hit" data-pick-emoji="${index}" aria-label="Scegli icona">${escapeHtml(p.emoji || '🎁')}</button>
        <input data-f="emoji" type="hidden" value="${escapeHtml(p.emoji || '🎁')}">
        <input data-f="name" type="text" placeholder="Nome premio" value="${escapeHtml(p.name)}" class="hit">
      </div>
      <div class="form-row three">
        <label>Quantità
          <input data-f="qty" type="number" min="1" value="${Number(p.totalQuantity) || 1}" class="hit">
        </label>
        <label>Probabilità %
          <input data-f="prob" type="number" min="1" max="100" value="${Number(p.winProbability) || 1}" class="hit">
        </label>
        <label class="switch-row">
          <input data-f="active" type="checkbox" ${p.active !== false ? 'checked' : ''}>
          <span>Attivo</span>
        </label>
      </div>
      <button type="button" class="ghost small hit" data-remove-prize="${index}">Rimuovi</button>
    </div>
  `).join('');

  wrap.querySelectorAll('[data-f]').forEach((input) => {
    input.addEventListener('input', () => {
      syncPrizeDraftsFromDom();
      updateLivePreview();
    });
    input.addEventListener('change', () => {
      syncPrizeDraftsFromDom();
      updateLivePreview();
    });
  });
  wrap.querySelectorAll('[data-pick-emoji]').forEach((btn) => {
    btn.addEventListener('click', () => openEmojiPicker(Number(btn.dataset.pickEmoji)));
  });
  wrap.querySelectorAll('[data-remove-prize]').forEach((btn) => {
    btn.addEventListener('click', () => {
      syncPrizeDraftsFromDom();
      const idx = Number(btn.dataset.removePrize);
      state.prizeDrafts.splice(idx, 1);
      if (!state.prizeDrafts.length) state.prizeDrafts.push(emptyPrize());
      renderPrizeRows();
      updateLivePreview();
    });
  });
}

function openEmojiPicker(index) {
  state.emojiTargetIndex = index;
  const grid = document.getElementById('emojiGrid');
  grid.innerHTML = Object.entries(SL.EMOJI_GRID).map(([cat, list]) => `
    <div class="emoji-cat">
      <p class="muted">${escapeHtml(cat)}</p>
      <div class="emoji-cat-grid">
        ${list.map((e) => `<button type="button" class="emoji-cell hit" data-emoji="${e}">${e}</button>`).join('')}
      </div>
    </div>
  `).join('');
  grid.querySelectorAll('[data-emoji]').forEach((btn) => {
    btn.addEventListener('click', () => applyEmoji(btn.dataset.emoji));
  });
  document.getElementById('emojiFree').value = state.prizeDrafts[index]?.emoji || '🎁';
  show(document.getElementById('emojiPicker'));
}

function applyEmoji(emoji) {
  const value = (emoji || '🎁').trim() || '🎁';
  const idx = state.emojiTargetIndex;
  if (idx == null || !state.prizeDrafts[idx]) return;
  syncPrizeDraftsFromDom();
  state.prizeDrafts[idx].emoji = value;
  hide(document.getElementById('emojiPicker'));
  renderPrizeRows();
  updateLivePreview();
}

function updateLivePreview() {
  syncPrizeDraftsFromDom();
  const guaranteed = document.getElementById('guaranteedWin').checked;
  const lose = document.getElementById('loseMessage').value;
  const phrase = SL.buildPrizePreviewPhrase(state.prizeDrafts, guaranteed, lose);
  const box = document.getElementById('prizeLivePreview');
  box.textContent = phrase.text;
  box.classList.toggle('error', phrase.error);
  box.classList.toggle('ok', !phrase.error && phrase.ok);
  document.getElementById('step1NextBtn').disabled = !phrase.ok;
}

function updateGuaranteedWinUi() {
  const guaranteed = document.getElementById('guaranteedWin').checked;
  const loseLabel = document.getElementById('loseMessageLabel');
  const loseInput = document.getElementById('loseMessage');
  const help = document.getElementById('guaranteedWinHelp');
  loseLabel?.classList.toggle('hidden', guaranteed);
  loseInput?.classList.toggle('hidden', guaranteed);
  if (help) {
    help.textContent = guaranteed
      ? 'Ogni giocatore vince uno dei premi ancora disponibili.'
      : 'Se spento, la somma delle probabilità può lasciare una quota di non vincita.';
  }
  updateLivePreview();
}

function updateGameChoiceUi() {
  const current = document.getElementById('gameType').value || 'scratch_card';
  document.querySelectorAll('.game-choice').forEach((btn) => {
    const on = btn.dataset.game === current;
    btn.classList.toggle('selected', on);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
}

function updateTicketPreview() {
  const store = state.store;
  const logo = document.getElementById('ticketLogo');
  const name = document.getElementById('ticketStoreName');
  const game = document.getElementById('ticketGameLabel');
  const hint = document.getElementById('ticketPrizeHint');
  const preview = document.getElementById('ticketPreview');
  if (store) {
    name.textContent = store.name;
    if (store.logoUrl) logo.innerHTML = `<img src="${escapeHtml(store.logoUrl)}" alt="">`;
    else logo.textContent = SL.storeInitials(store.name);
    preview.style.setProperty('--brand1', store.primaryColor || '#0f766e');
    preview.style.setProperty('--brand2', store.secondaryColor || '#134e4a');
  }
  game.textContent = getGameTypeLabel(document.getElementById('gameType').value);
  syncPrizeDraftsFromDom();
  const names = SL.activePrizes(state.prizeDrafts).map((p) => p.name).filter(Boolean);
  hint.textContent = names.length
    ? `In palio: ${names.slice(0, 3).join(', ')}`
    : 'Anteprima biglietto con il tuo brand';
}

function ensureDatesValid() {
  const start = document.getElementById('startDate');
  const end = document.getElementById('endDate');
  const fixed = SL.ensureEndAfterStart(start.value, end.value);
  start.value = fixed.startDate;
  end.value = fixed.endDate;
}

async function saveWizardCampaign() {
  syncPrizeDraftsFromDom();
  ensureDatesValid();
  const name = document.getElementById('campaignName').value.trim() || SL.defaultPromoName();
  const slug = SL.slugify(name);
  if (!slug) throw new Error('Inserisci un nome promozione.');
  const startDate = document.getElementById('startDate').value;
  const endDate = document.getElementById('endDate').value;
  if (!startDate || !endDate) throw new Error('Inserisci le date della promozione.');
  if (endDate <= startDate) throw new Error('La data di fine deve essere dopo la data di inizio.');

  const duplicate = state.campaigns.find((item) => item.slug === slug && item.id !== state.editingCampaignId);
  if (duplicate) {
    // Auto-suffix rather than showing "slug" to merchant
    const suffix = String(Date.now()).slice(-4);
    // still send unique slug
  }
  const finalSlug = duplicate ? `${slug}-${String(Date.now()).slice(-4)}` : slug;

  if (!SL.canProceedStep1(state.prizeDrafts, document.getElementById('guaranteedWin').checked)) {
    throw new Error('Controlla i premi al passo 1 prima di continuare.');
  }

  const active = SL.activePrizes(state.prizeDrafts);
  if (!active.length || active.some((p) => !p.name)) {
    throw new Error('Ogni premio attivo deve avere un nome.');
  }

  const campaign = {
    name,
    slug: finalSlug,
    description: document.getElementById('campaignDescription').value.trim(),
    startDate,
    endDate,
    playLimitMode: document.getElementById('playLimitMode').value,
    voucherValidityDays: Number(document.getElementById('voucherValidityDays').value || 15),
    loseMessage: document.getElementById('loseMessage').value.trim() || SL.DEFAULT_LOSE_MESSAGE,
    gameType: document.getElementById('gameType').value,
    guaranteedWin: document.getElementById('guaranteedWin').checked,
    active: document.getElementById('campaignActive').checked,
    customerFields: getCustomerFields()
  };

  const wasCreating = !state.editingCampaignId;
  const path = state.editingCampaignId
    ? `/api/store/campaigns/${state.editingCampaignId}`
    : '/api/store/campaigns';

  const saved = await api(path, {
    method: state.editingCampaignId ? 'PUT' : 'POST',
    body: JSON.stringify(campaign)
  });

  state.editingCampaignId = saved.id;

  if (wasCreating) {
    for (const prize of state.prizeDrafts.filter((p) => p.name.trim())) {
      await api(`/api/store/campaigns/${saved.id}/prizes`, {
        method: 'POST',
        body: JSON.stringify({
          name: prize.name.trim(),
          emoji: prize.emoji || '🎁',
          description: prize.description || '',
          totalQuantity: Number(prize.totalQuantity) || 1,
          remainingQuantity: Number(prize.totalQuantity) || 1,
          winProbability: Number(prize.winProbability) || 1,
          active: prize.active !== false
        })
      });
    }
  } else {
    for (const prize of state.prizeDrafts) {
      if (!prize.name.trim()) continue;
      const body = {
        name: prize.name.trim(),
        emoji: prize.emoji || '🎁',
        description: prize.description || '',
        totalQuantity: Number(prize.totalQuantity) || 1,
        remainingQuantity: prize.id != null
          ? Number(prize.remainingQuantity)
          : Number(prize.totalQuantity) || 1,
        winProbability: Number(prize.winProbability) || 1,
        active: prize.active !== false
      };
      if (prize.id) {
        await api(`/api/store/campaigns/${saved.id}/prizes/${prize.id}`, {
          method: 'PUT',
          body: JSON.stringify(body)
        });
      } else {
        await api(`/api/store/campaigns/${saved.id}/prizes`, {
          method: 'POST',
          body: JSON.stringify(body)
        });
      }
    }
  }

  await loadAll();
  return saved;
}

function prepareMaterialsStep() {
  const campaign = state.campaigns.find((c) => c.id === state.editingCampaignId);
  const main = campaign?.prizeItems
    ?.filter((p) => p.active && p.totalQuantity > 0 && p.winProbability > 0)
    ?.sort((a, b) => a.winProbability - b.winProbability || a.totalQuantity - b.totalQuantity)[0];
  const prizeName = main?.name || 'un premio';
  const headline = document.getElementById('matHeadline');
  const subtitle = document.getElementById('matSubtitle');
  const cta = document.getElementById('matCta');
  if (!headline.value) headline.value = `Vinci ${prizeName}`;
  if (!subtitle.value) subtitle.value = 'Inquadra il codice e scopri subito se hai vinto';
  if (!cta.value) cta.value = 'Gioca ora';

  const playUrl = campaign ? getCampaignPlayUrl(campaign) : '';
  document.getElementById('wizardPlayUrl').value = playUrl;

  const materialsLink = document.getElementById('openMaterialsBtn');
  const q = new URLSearchParams();
  if (campaign) q.set('campaign', campaign.id);
  q.set('headline', headline.value);
  q.set('subtitle', subtitle.value);
  q.set('cta', cta.value);
  materialsLink.href = `/content.html?${q.toString()}`;

  show(document.getElementById('wizardDoneCard'));
}

function syncMaterialsLink() {
  const campaign = state.campaigns.find((c) => c.id === state.editingCampaignId);
  const materialsLink = document.getElementById('openMaterialsBtn');
  const q = new URLSearchParams();
  if (campaign) q.set('campaign', campaign.id);
  q.set('headline', document.getElementById('matHeadline').value);
  q.set('subtitle', document.getElementById('matSubtitle').value);
  q.set('cta', document.getElementById('matCta').value);
  materialsLink.href = `/content.html?${q.toString()}`;
}

function renderTable(container, columns, rows) {
  if (!rows.length) {
    container.innerHTML = '<p class="muted">Nessun dato.</p>';
    return;
  }
  container.innerHTML = `
    <table>
      <thead><tr>${columns.map((c) => `<th>${escapeHtml(c.label)}</th>`).join('')}</tr></thead>
      <tbody>
        ${rows.map((row) => `<tr>${columns.map((c) => `<td>${c.render(row)}</td>`).join('')}</tr>`).join('')}
      </tbody>
    </table>
  `;
}

function renderParticipations(rows) {
  renderTable(participationsTable, [
    { label: 'Data', render: (r) => escapeHtml(formatDate(r.createdAt)) },
    { label: 'Email', render: (r) => escapeHtml(r.email || r.customerEmail || '—') },
    { label: 'Esito', render: (r) => (r.isWinner || r.won ? 'Vinto' : 'Perso') },
    { label: 'Campagna', render: (r) => escapeHtml(r.campaign?.name || r.campaignName || '—') }
  ], rows.slice(0, 40));
}

function renderVouchers(rows) {
  renderTable(vouchersTable, [
    { label: 'Codice', render: (r) => escapeHtml(r.code) },
    { label: 'Stato', render: (r) => (r.status === 'redeemed' ? 'Riscattato' : 'Da riscattare') },
    { label: 'Email', render: (r) => escapeHtml(r.email || '—') },
    { label: 'Campagna', render: (r) => escapeHtml(r.campaign?.name || '—') }
  ], rows.slice(0, 40));
}

function renderAlerts(rows) {
  alertsList.innerHTML = rows.slice(0, 5).map((alert) => (
    `<div class="alert ${alert.readByStore ? '' : 'unread'}">${escapeHtml(alert.message)} <small>${formatDate(alert.createdAt)}</small></div>`
  )).join('');
}

function renderSubscriptionBanner() {
  const info = getSubscriptionInfo(state.store, state.subscription);
  subscriptionTitle.textContent = info.operational
    ? (info.status === 'trial' ? 'Prova attiva' : 'Piano attivo')
    : 'Abbonamento da rinnovare';
  subscriptionText.textContent = info.expiresAt
    ? `Scade il ${formatDisplayDate(info.expiresAt)}`
    : 'Stato abbonamento aggiornato.';
  subscriptionDays.textContent = info.daysLeft != null ? `${info.daysLeft}g` : '—';
}

function renderBillingSection() {
  const info = getSubscriptionInfo(state.store, state.subscription);
  billingStatus.innerHTML = `
    <h3>Piano attuale</h3>
    <p><strong>${escapeHtml(info.planName)}</strong> — ${escapeHtml(info.status)}</p>
    <p class="muted">${info.expiresAt ? `Scade il ${formatDisplayDate(info.expiresAt)}` : 'Nessuna scadenza indicata.'}</p>
  `;
  const plans = state.billingPlans || [];
  billingPlans.innerHTML = plans.length
    ? plans.map((plan) => `
      <article class="plan-card card">
        <h3>${escapeHtml(plan.name)}</h3>
        <p class="muted">${escapeHtml(plan.description || '')}</p>
        <button type="button" class="primary hit" data-plan-id="${escapeHtml(plan.id)}">Richiedi attivazione</button>
      </article>
    `).join('')
    : '<p class="muted">Nessun piano disponibile al momento.</p>';
}

async function requestPlanUpgrade(planId) {
  try {
    await api('/api/store/subscription/request', {
      method: 'POST',
      body: JSON.stringify({ planId })
    });
    showSuccess('Richiesta inviata. Ti contatteremo per l’attivazione.');
    await loadAll();
  } catch (error) {
    setError(appError, error.message);
  }
}

function populateProfileForm(store) {
  profileName.value = store.name || '';
  profileBusinessType.value = store.businessType || 'generic';
  profilePhone.value = store.phone || '';
  profileAddress.value = store.address || '';
  profileLogoUrl.value = store.logoUrl || '';
  profilePrimaryColor.value = store.primaryColor || '#0f766e';
  profileSecondaryColor.value = store.secondaryColor || '#134e4a';
  renderProfilePreview();
}

function renderProfilePreview() {
  const name = profileName.value.trim() || 'Negozio';
  profilePreviewName.textContent = name;
  profilePreviewMeta.textContent = `${getBusinessTypeLabel(profileBusinessType.value)} · ${profilePhone.value || 'telefono'} · ${profileAddress.value || 'indirizzo'}`;
  profilePreview.style.background = `linear-gradient(135deg, ${profilePrimaryColor.value}, ${profileSecondaryColor.value})`;
  if (profileLogoUrl.value.trim()) {
    profilePreviewLogo.innerHTML = `<img src="${escapeHtml(profileLogoUrl.value.trim())}" alt="">`;
  } else {
    profilePreviewLogo.textContent = SL.storeInitials(name);
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
        businessType: profileBusinessType.value,
        phone: profilePhone.value.trim(),
        address: profileAddress.value.trim(),
        logoUrl: profileLogoUrl.value.trim(),
        primaryColor: profilePrimaryColor.value,
        secondaryColor: profileSecondaryColor.value
      })
    });
    state.store = store;
    populateProfileForm(store);
    renderDashBrand();
    showSuccess('Profilo salvato.');
  } catch (error) {
    setError(appError, error.message);
  }
}

function normalizeScannedVoucherCode(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    if (raw.startsWith('http')) {
      const url = new URL(raw);
      return url.searchParams.get('code') || url.pathname.split('/').filter(Boolean).pop() || raw;
    }
  } catch { /* ignore */ }
  return raw;
}

async function validateVoucher() {
  voucherResult.innerHTML = '';
  try {
    const data = await api('/api/store/vouchers/validate', {
      method: 'POST',
      body: JSON.stringify({ code: voucherCode.value.trim() })
    });
    voucherResult.innerHTML = `<div class="message success">Premio ${escapeHtml(data.status)} — ${escapeHtml(data.email)} — ${escapeHtml(data.campaign.name)}</div>`;
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
    voucherResult.innerHTML = '<div class="message success">Premio riscattato.</div>';
    await loadAll();
  } catch (error) {
    voucherResult.innerHTML = `<div class="message error">${escapeHtml(error.message)}</div>`;
  }
}

async function startQrScanner() {
  voucherResult.innerHTML = '';
  if (!('BarcodeDetector' in window)) {
    voucherResult.innerHTML = '<div class="message error">Scanner non supportato. Inserisci il codice a mano.</div>';
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
        scannerStatus.textContent = 'Non riesco a leggere il QR. Avvicina e riprova.';
      }
      state.scannerFrame = requestAnimationFrame(scan);
    };
    state.scannerFrame = requestAnimationFrame(scan);
  } catch (error) {
    stopQrScanner();
    voucherResult.innerHTML = `<div class="message error">Fotocamera non disponibile: ${escapeHtml(error.message || 'permesso negato')}</div>`;
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
    state.scannerStream.getTracks().forEach((t) => t.stop());
    state.scannerStream = null;
  }
  qrVideo.pause();
  qrVideo.srcObject = null;
  hide(scannerPanel);
  hide(stopScanBtn);
  scanQrBtn.disabled = false;
  scannerStatus.textContent = 'Inquadra il QR della card premio.';
}

async function login() {
  clearError(loginError);
  try {
    const data = await api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: emailInput.value.trim(),
        password: passwordInput.value
      })
    });
    sessionStorage.setItem(USER_KEY, JSON.stringify(data.user));
    await showApp();
  } catch (error) {
    setError(loginError, error.message);
  }
}

async function logout() {
  stopQrScanner();
  await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
  sessionStorage.removeItem(USER_KEY);
  show(loginSection);
  hide(appSection);
}

async function showApp() {
  hide(loginSection);
  show(appSection);
  await loadAll();
}

async function loadAll() {
  clearError(appError);
  try {
    const [me, campaigns, participations, vouchers, alerts, subscription] = await Promise.all([
      api('/api/store/me'),
      api('/api/store/campaigns'),
      api('/api/store/participations'),
      api('/api/store/vouchers'),
      api('/api/store/alerts'),
      api('/api/store/subscription')
    ]);
    state.store = me.store || me;
    state.campaigns = campaigns || [];
    state.participations = participations || [];
    state.vouchers = vouchers || [];
    state.alerts = alerts || [];
    state.subscription = subscription;
    state.billingPlans = subscription?.plans || me.plans || [];
    const user = JSON.parse(sessionStorage.getItem(USER_KEY) || '{}');
    userLabel.textContent = user.email || '';
    populateProfileForm(state.store);
    renderDashboard();
    renderParticipations(state.participations);
    renderVouchers(state.vouchers);
    renderAlerts(state.alerts);
    renderSubscriptionBanner();
    renderBillingSection();
  } catch (error) {
    setError(appError, error.message);
    if (String(error.message).toLowerCase().includes('auth') || String(error.message).includes('401')) {
      await logout();
    }
  }
}

// ── Events ────────────────────────────────────────────────────────────────────

loginBtn.addEventListener('click', login);
refreshBtn.addEventListener('click', loadAll);
logoutBtn.addEventListener('click', logout);
openBillingBtn.addEventListener('click', () => switchView('billing'));
altroBtn.addEventListener('click', () => {
  const open = altroMenu.classList.contains('hidden');
  altroMenu.classList.toggle('hidden', !open);
  altroBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
});

document.addEventListener('click', (event) => {
  if (!event.target.closest('.altro-wrap')) {
    hide(altroMenu);
    altroBtn.setAttribute('aria-expanded', 'false');
  }
  const viewBtn = event.target.closest('[data-view]');
  if (viewBtn) {
    switchView(viewBtn.dataset.view);
    return;
  }
  const editBtn = event.target.closest('[data-edit-campaign]');
  if (editBtn) {
    startWizard(editBtn.dataset.editCampaign);
  }
});

document.getElementById('wizardBackDashBtn').addEventListener('click', () => switchView('dashboard'));
document.getElementById('addPrizeRowBtn').addEventListener('click', () => {
  syncPrizeDraftsFromDom();
  state.prizeDrafts.push(emptyPrize());
  renderPrizeRows();
  updateLivePreview();
});
document.getElementById('guaranteedWin').addEventListener('change', updateGuaranteedWinUi);
document.getElementById('emojiApplyBtn').addEventListener('click', () => {
  applyEmoji(document.getElementById('emojiFree').value);
});
document.getElementById('emojiCloseBtn').addEventListener('click', () => hide(document.getElementById('emojiPicker')));

document.getElementById('step1NextBtn').addEventListener('click', () => {
  syncPrizeDraftsFromDom();
  if (!SL.canProceedStep1(state.prizeDrafts, document.getElementById('guaranteedWin').checked)) {
    updateLivePreview();
    return;
  }
  state.wizardStep = 2;
  renderWizardStep();
});

document.getElementById('step2BackBtn').addEventListener('click', () => {
  state.wizardStep = 1;
  renderWizardStep();
});

document.getElementById('step2NextBtn').addEventListener('click', async () => {
  clearError(appError);
  document.getElementById('step2NextBtn').disabled = true;
  try {
    await saveWizardCampaign();
    document.getElementById('matHeadline').value = '';
    document.getElementById('matSubtitle').value = '';
    document.getElementById('matCta').value = '';
    state.wizardStep = 3;
    renderWizardStep();
    showSuccess('Promozione salvata.');
  } catch (error) {
    setError(appError, error.message);
  } finally {
    document.getElementById('step2NextBtn').disabled = false;
  }
});

document.getElementById('step3BackBtn').addEventListener('click', () => {
  state.wizardStep = 2;
  renderWizardStep();
});

document.getElementById('finishWizardBtn').addEventListener('click', () => {
  show(document.getElementById('wizardDoneCard'));
  switchView('dashboard');
});
document.getElementById('doneToDashBtn').addEventListener('click', () => switchView('dashboard'));

document.getElementById('openAdvancedBtn').addEventListener('click', () => {
  state.returnFromAdvanced = 2;
  state.wizardStep = 'advanced';
  renderWizardStep();
});
document.getElementById('closeAdvancedBtn').addEventListener('click', () => {
  state.wizardStep = state.returnFromAdvanced || 2;
  renderWizardStep();
});

document.querySelectorAll('.game-choice').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.getElementById('gameType').value = btn.dataset.game;
    updateGameChoiceUi();
    updateTicketPreview();
  });
});

['startDate', 'endDate'].forEach((id) => {
  document.getElementById(id).addEventListener('change', ensureDatesValid);
});

['matHeadline', 'matSubtitle', 'matCta'].forEach((id) => {
  document.getElementById(id).addEventListener('input', syncMaterialsLink);
});

document.getElementById('copyWizardLinkBtn').addEventListener('click', async () => {
  const url = document.getElementById('wizardPlayUrl').value;
  if (!url) return;
  await navigator.clipboard.writeText(url);
  showSuccess('Link del gioco copiato.');
});

validateVoucherBtn.addEventListener('click', validateVoucher);
redeemVoucherBtn.addEventListener('click', redeemVoucher);
scanQrBtn.addEventListener('click', startQrScanner);
stopScanBtn.addEventListener('click', stopQrScanner);
profileForm.addEventListener('submit', saveProfile);
billingPlans.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-plan-id]');
  if (!button) return;
  requestPlanUpgrade(button.dataset.planId);
});

[profileName, profileBusinessType, profilePhone, profileAddress, profileLogoUrl, profilePrimaryColor, profileSecondaryColor].forEach((input) => {
  input.addEventListener('input', renderProfilePreview);
  input.addEventListener('change', renderProfilePreview);
});

profileLogoFile.addEventListener('change', async () => {
  const file = profileLogoFile.files?.[0];
  if (!file) return;
  clearError(appError);
  try {
    const dataUrl = await SL.resizeLogoFile(file);
    profileLogoUrl.value = dataUrl;
    renderProfilePreview();
    showSuccess('Logo pronto. Premi Salva profilo per confermare.');
  } catch (error) {
    setError(appError, error.message);
  }
});

if (sessionStorage.getItem(USER_KEY)) {
  showApp();
}
