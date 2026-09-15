/**
 * Pure store-panel helpers — no DOM. Safe for Node tests and browser.
 */

const ITALIAN_MONTHS = [
  'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
  'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'
];

const DEFAULT_LOSE_MESSAGE = 'Niente premio oggi — ci vediamo alla prossima!';

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
  resizeLogoFile,
  EMOJI_GRID
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = StoreLogicExports;
}
if (typeof globalThis !== 'undefined') {
  globalThis.StoreLogic = StoreLogicExports;
}
