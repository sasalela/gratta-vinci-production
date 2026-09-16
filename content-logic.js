/**
 * Pure materials helpers — no DOM. Safe for Node tests (require / eval)
 * and for the browser via globalThis.ContentLogic.
 */

function getActivePrizes(campaign) {
  const prizes = (campaign && campaign.prizeItems) || [];
  return prizes.filter(
    (p) => p.active === true && p.totalQuantity > 0 && p.winProbability > 0
  );
}

function getMainPrize(campaign) {
  const valid = getActivePrizes(campaign);
  if (!valid.length) return null;
  return valid.sort((a, b) => {
    if (a.winProbability !== b.winProbability) return a.winProbability - b.winProbability;
    return a.totalQuantity - b.totalQuantity;
  })[0];
}

function prizeDisplayName(prize) {
  if (!prize) return '';
  return String(prize.name || '').trim();
}

function prizeLineWithEmoji(prize) {
  if (!prize) return '';
  return `${prize.emoji || ''} ${prize.name || ''}`.trim();
}

/**
 * Defaults for Titolo / Sottotitolo / Invito when applying a campaign.
 */
function getMaterialDefaults(campaign) {
  const main = getMainPrize(campaign);
  const prizeName = prizeDisplayName(main) || 'un premio';
  return {
    headline: `Vinci ${prizeName}`,
    subtitle: 'Inquadra il codice e scopri subito se hai vinto',
    cta: 'Gioca ora',
  };
}

/**
 * Fixed VINCI heading for materials (never campaign name).
 * @returns {{ title: 'VINCI'|'VINCI SEMPRE', prizeLine: string }}
 */
function getVinciHeading(campaign) {
  if (campaign && campaign.guaranteedWin) {
    const names = getActivePrizes(campaign)
      .map(prizeDisplayName)
      .filter(Boolean)
      .slice(0, 4);
    return {
      title: 'VINCI SEMPRE',
      prizeLine: names.length ? names.join(' · ') : 'Premi garantiti',
    };
  }
  const main = getMainPrize(campaign);
  return {
    title: 'VINCI',
    prizeLine: prizeDisplayName(main) || 'un premio',
  };
}

/**
 * Prize text shown under VINCI / VINCI SEMPRE (emoji kept for single main prize).
 */
function getPrizeDisplayText(campaign) {
  const heading = getVinciHeading(campaign);
  if (campaign && campaign.guaranteedWin) return heading.prizeLine;
  const main = getMainPrize(campaign);
  return prizeLineWithEmoji(main) || heading.prizeLine;
}

function formatExpiresText(endDate, formatDateFn) {
  if (!endDate) return '';
  const formatted = typeof formatDateFn === 'function'
    ? formatDateFn(endDate)
    : String(endDate);
  return formatted ? `Valido fino al ${formatted}` : '';
}

/**
 * The four required material elements for any format.
 * @returns {{ brand: string, vinci: string, qr: string, validity: string, title: string, prizeLine: string }}
 */
function materialFourElements(campaign, store, texts) {
  const storeName = (store && store.name) || '';
  const heading = getVinciHeading(campaign);
  const prizeText = getPrizeDisplayText(campaign);
  const t = texts || {};
  const validity = (t.expiresText != null && String(t.expiresText).trim())
    ? String(t.expiresText).trim()
    : formatExpiresText(campaign && campaign.endDate);
  return {
    brand: storeName ? `logo+${storeName}` : 'logo+negozio',
    vinci: `${heading.title} ${prizeText}`.trim(),
    qr: 'Inquadra e gioca',
    validity: validity || 'validity',
    title: heading.title,
    prizeLine: prizeText,
    headline: (t.headline || '').trim(),
    subtitle: (t.subtitle || '').trim(),
    cta: (t.cta || '').trim(),
  };
}

/**
 * Throws if any of the four required elements is missing.
 */
function assertMaterialFourElements(els) {
  if (!els || typeof els !== 'object') {
    throw new Error('materialFourElements: missing result object');
  }
  const required = ['brand', 'vinci', 'qr', 'validity'];
  for (const key of required) {
    const val = els[key];
    if (val == null || String(val).trim() === '') {
      throw new Error(`materialFourElements: missing "${key}"`);
    }
  }
  if (!String(els.vinci).toUpperCase().includes('VINCI')) {
    throw new Error('materialFourElements: vinci must include VINCI');
  }
  if (!/inquadra e gioca/i.test(String(els.qr))) {
    throw new Error('materialFourElements: qr label must be "Inquadra e gioca"');
  }
  return true;
}

/**
 * Human-readable list of the four required elements (for tests / debugging).
 */
function listFormatElements(formatKey, data, campaign) {
  const store = { name: (data && data.storeName) || '' };
  const texts = {
    headline: data && data.headline,
    subtitle: data && data.subtitle,
    cta: data && data.cta,
    expiresText: data && data.expiresText,
  };
  const els = materialFourElements(campaign || {}, store, texts);
  return [
    `1.brand:${els.brand}`,
    `2.vinci:${els.vinci}`,
    `3.qr:${els.qr}`,
    `4.validity:${els.validity}`,
  ];
}

const ContentLogic = {
  FORMAT_SIZES: {
    a4:       { width: 1240, height: 1754, label: 'A4 Volantino', family: 'print' },
    facebook: { width: 1200, height: 630,  label: 'Facebook Feed', family: 'facebook' },
    square:   { width: 1080, height: 1080, label: 'Quadrato Feed', family: 'social' },
    vertical: { width: 1080, height: 1920, label: '9:16 Story post', family: 'social' },
    story:    { width: 1080, height: 1920, label: 'Story sequenza', family: 'story' },
    led_h:    { width: 1920, height: 576,  label: 'LED orizzontale', family: 'led' },
    led_v:    { width: 576,  height: 1024, label: 'LED verticale', family: 'led' },
    led_sq:   { width: 800,  height: 800,  label: 'LED quadrato', family: 'led' },
    led_43:   { width: 1024, height: 768,  label: 'LED 4:3', family: 'led' },
    '16x9':   { width: 1920, height: 1080, label: 'LCD 16:9', family: 'lcd' },
    '4x3':    { width: 1600, height: 1200, label: 'LCD 4:3', family: 'lcd' },
    lcd_v:    { width: 1080, height: 1920, label: 'LCD verticale', family: 'lcd' },
  },
  getActivePrizes,
  getMainPrize,
  getMaterialDefaults,
  getVinciHeading,
  getPrizeDisplayText,
  formatExpiresText,
  materialFourElements,
  assertMaterialFourElements,
  listFormatElements,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = ContentLogic;
}
if (typeof globalThis !== 'undefined') {
  globalThis.ContentLogic = ContentLogic;
}
