/**
 * Pure store-panel helpers — no DOM. Safe for Node tests and browser.
 */

const ITALIAN_MONTHS = [
  'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
  'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'
];

const DEFAULT_LOSE_MESSAGE = 'Niente premio oggi — ci vediamo alla prossima!';
const DEFAULT_PRIMARY_COLOR = '#0f766e';
const DEFAULT_SECONDARY_COLOR = '#134e4a';

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function toDateInputValue(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

/** Default period: today → +30 days. End never equals start. */
function getDefaultCampaignDates(now = new Date()) {
  const start = toDateInputValue(now);
  let endDate = addDays(now, 30);
  let end = toDateInputValue(endDate);
  if (end === start) {
    endDate = addDays(now, 1);
    end = toDateInputValue(endDate);
  }
  return { startDate: start, endDate: end };
}

function defaultPromoName(now = new Date()) {
  const month = ITALIAN_MONTHS[now.getMonth()] || 'Promo';
  return `Promo ${month}`;
}

function activePrizes(prizes) {
  return (prizes || []).filter(
    (p) => p && p.active !== false && Number(p.winProbability || 0) > 0
  );
}

function sumActiveProbabilities(prizes) {
  return activePrizes(prizes).reduce((sum, p) => sum + Number(p.winProbability || 0), 0);
}

/**
 * Live Italian preview phrase for step 1.
 * @returns {{ ok: boolean, text: string, error: boolean }}
 */
function buildPrizePreviewPhrase(prizes, guaranteedWin, loseMessage = DEFAULT_LOSE_MESSAGE) {
  const list = activePrizes(prizes);
  const total = sumActiveProbabilities(prizes);
  const names = list.map((p) => String(p.name || '').trim()).filter(Boolean);

  if (!list.length) {
    return {
      ok: false,
      error: true,
      text: 'Aggiungi almeno un premio attivo per continuare.'
    };
  }

  if (!guaranteedWin && total > 100) {
    return {
      ok: false,
      error: true,
      text: `Attenzione: la somma delle probabilità è ${total}% (oltre 100%). Abbassa le percentuali oppure attiva “Vince sempre qualcosa”.`
    };
  }

  if (guaranteedWin) {
    const joined = names.length <= 3
      ? names.join(', ').replace(/, ([^,]*)$/, ' o $1')
      : `${names.slice(0, 3).join(', ')} e altri`;
    return {
      ok: true,
      error: false,
      text: `Ogni giocatore vince qualcosa: ${joined}.`
    };
  }

  const winPct = Math.round(Math.min(100, total) * 10) / 10;
  const losePct = Math.round(Math.max(0, 100 - total) * 10) / 10;
  const main = names[0] || 'un premio';
  const lose = (loseMessage || DEFAULT_LOSE_MESSAGE).trim();
  if (losePct <= 0) {
    return {
      ok: true,
      error: false,
      text: `Con queste probabilità, circa ${winPct} giocatori su 100 vincono (es. ${main}).`
    };
  }
  return {
    ok: true,
    error: false,
    text: `Su 100 giocatori, circa ${winPct} vincono (es. ${main}). Gli altri vedono: «${lose}».`
  };
}

function canProceedStep1(prizes, guaranteedWin) {
  const phrase = buildPrizePreviewPhrase(prizes, guaranteedWin);
  return phrase.ok && !phrase.error;
}

function ensureEndAfterStart(startDate, endDate) {
  if (!startDate) return { startDate, endDate };
  if (!endDate || endDate <= startDate) {
    const next = addDays(new Date(`${startDate}T12:00:00`), 30);
    let end = toDateInputValue(next);
    if (end <= startDate) {
      end = toDateInputValue(addDays(new Date(`${startDate}T12:00:00`), 1));
    }
    return { startDate, endDate: end };
  }
  return { startDate, endDate };
}

function storeInitials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'GV';
  return parts.slice(0, 2).map((p) => p[0].toUpperCase()).join('');
}

function isHexColor(value) {
  return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value.trim());
}

/**
 * Single normalization point for store API payloads (new or complete).
 * Fills safe defaults so the panel never reads undefined brand/subscription fields.
 */
function normalizeStore(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const name = String(src.name || '').trim() || 'Negozio';
  return {
    ...src,
    id: src.id ?? null,
    name,
    slug: String(src.slug || '').trim(),
    email: src.email == null ? '' : String(src.email),
    businessType: src.businessType || 'generic',
    phone: src.phone == null ? '' : String(src.phone),
    address: src.address == null ? '' : String(src.address),
    logoUrl: src.logoUrl == null ? '' : String(src.logoUrl),
    primaryColor: isHexColor(src.primaryColor) ? src.primaryColor.trim() : DEFAULT_PRIMARY_COLOR,
    secondaryColor: isHexColor(src.secondaryColor) ? src.secondaryColor.trim() : DEFAULT_SECONDARY_COLOR,
    subscriptionStatus: src.subscriptionStatus || 'trial',
    subscriptionExpiresAt: src.subscriptionExpiresAt || null
  };
}

function normalizeCampaign(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  return {
    ...src,
    id: src.id ?? null,
    name: String(src.name || '').trim() || 'Promozione',
    slug: String(src.slug || '').trim(),
    active: Boolean(src.active),
    gameType: src.gameType || 'scratch_card',
    guaranteedWin: Boolean(src.guaranteedWin),
    description: src.description == null ? '' : String(src.description),
    prizeItems: Array.isArray(src.prizeItems) ? src.prizeItems : [],
    customerFields: Array.isArray(src.customerFields) ? src.customerFields : [],
    stats: src.stats && typeof src.stats === 'object' ? src.stats : {}
  };
}

function normalizeCampaigns(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map(normalizeCampaign);
}

/**
 * Normalize /api/store/subscription (or me.subscription). Missing/failed → unavailable.
 */
function normalizeSubscription(raw, store, options = {}) {
  if (options.unavailable || raw == null) {
    return {
      status: 'unavailable',
      expiresAt: null,
      planName: 'Non disponibile',
      plans: [],
      unavailable: true
    };
  }
  const src = typeof raw === 'object' ? raw : {};
  const status = src.status || store?.subscriptionStatus || 'trial';
  const expiresAt = src.expiresAt || src.subscriptionExpiresAt || store?.subscriptionExpiresAt || null;
  return {
    ...src,
    status,
    expiresAt,
    planName: src.planName || src.plan?.name || (status === 'trial' ? 'Trial' : 'Piano'),
    plans: Array.isArray(src.plans) ? src.plans : [],
    unavailable: false
  };
}

/**
 * Normalize the full panel bootstrap payload in one place.
 * `me` may be `{ store, user, subscription }` or a bare store object.
 */
function normalizePanelData({
  me = null,
  campaigns = [],
  participations = [],
  vouchers = [],
  alerts = [],
  subscription = null,
  subscriptionUnavailable = false
} = {}) {
  const meObj = me && typeof me === 'object' ? me : {};
  const storeRaw = meObj.store && typeof meObj.store === 'object'
    ? meObj.store
    : (meObj.name || meObj.slug ? meObj : {});
  const store = normalizeStore(storeRaw);

  let subscriptionOut;
  if (subscriptionUnavailable) {
    subscriptionOut = normalizeSubscription(null, store, { unavailable: true });
  } else if (subscription != null) {
    subscriptionOut = normalizeSubscription(subscription, store);
  } else if (meObj.subscription != null) {
    subscriptionOut = normalizeSubscription(meObj.subscription, store);
  } else {
    subscriptionOut = normalizeSubscription({
      status: store.subscriptionStatus || 'trial',
      expiresAt: store.subscriptionExpiresAt || null,
      planName: 'Trial',
      plans: Array.isArray(meObj.plans) ? meObj.plans : []
    }, store);
  }

  return {
    store,
    campaigns: normalizeCampaigns(campaigns),
    participations: Array.isArray(participations) ? participations : [],
    vouchers: Array.isArray(vouchers) ? vouchers : [],
    alerts: Array.isArray(alerts) ? alerts : [],
    subscription: subscriptionOut,
    billingPlans: Array.isArray(subscriptionOut.plans) && subscriptionOut.plans.length
      ? subscriptionOut.plans
      : (Array.isArray(meObj.plans) ? meObj.plans : []),
    user: meObj.user || null
  };
}

/** Resize image file to max 256px, return data URL (jpeg) under maxBytes. */
async function resizeLogoFile(file, maxPx = 256, maxBytes = 150 * 1024) {
  if (!file || !file.type || !file.type.startsWith('image/')) {
    throw new Error('Scegli un file immagine (PNG o JPG).');
  }
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxPx / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();

  let quality = 0.88;
  let dataUrl = canvas.toDataURL('image/jpeg', quality);
  while (dataUrl.length > maxBytes * 1.37 && quality > 0.4) {
    quality -= 0.08;
    dataUrl = canvas.toDataURL('image/jpeg', quality);
  }
  if (dataUrl.length > maxBytes * 1.37) {
    throw new Error('Il logo resta troppo grande anche dopo la compressione. Prova un’immagine più semplice.');
  }
  return dataUrl;
}

const EMOJI_GRID = {
  Cibo: ['🍕', '🍔', '🍟', '🌭', '🥪', '🍝', '🍜', '🍣'],
  Bevande: ['🍺', '🍻', '☕', '🍵', '🥤', '🍷', '🍸', '🧃'],
  Dolci: ['🍦', '🍩', '🍪', '🧁', '🍫', '🍬', '🎂', '🥐'],
  Extra: ['🎁', '⭐', '💎', '🏆', '🎯', '❤️', '🔥', '✨']
};

const StoreLogicExports = {
  ITALIAN_MONTHS,
  DEFAULT_LOSE_MESSAGE,
  DEFAULT_PRIMARY_COLOR,
  DEFAULT_SECONDARY_COLOR,
  slugify,
  toDateInputValue,
  addDays,
  getDefaultCampaignDates,
  defaultPromoName,
  activePrizes,
  sumActiveProbabilities,
  buildPrizePreviewPhrase,
  canProceedStep1,
  ensureEndAfterStart,
  storeInitials,
  normalizeStore,
  normalizeCampaign,
  normalizeCampaigns,
  normalizeSubscription,
  normalizePanelData,
  resizeLogoFile,
  EMOJI_GRID
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = StoreLogicExports;
}
if (typeof globalThis !== 'undefined') {
  globalThis.StoreLogic = StoreLogicExports;
}
