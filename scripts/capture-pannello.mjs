/**
 * Playwright screenshots + responsive checks for pannello.
 * No real DB: API routes are mocked.
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, mkdirSync, existsSync, writeFileSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const outDir = join(root, 'docs/screenshots/pannello');
const nuovoDir = join(outDir, 'nuovo');
mkdirSync(outDir, { recursive: true });
mkdirSync(nuovoDir, { recursive: true });

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.json': 'application/json'
};

function serve() {
  const server = createServer((req, res) => {
    const url = new URL(req.url || '/', 'http://127.0.0.1');
    let path = decodeURIComponent(url.pathname);
    if (path === '/') path = '/store.html';
    const file = join(root, path.replace(/^\//, ''));
    if (!file.startsWith(root) || !existsSync(file)) {
      res.writeHead(404);
      res.end('not found');
      return;
    }
    const body = readFileSync(file);
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' });
    res.end(body);
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

const demoStore = {
  id: 's1',
  name: 'Bar del Porto',
  slug: 'bar-del-porto',
  businessType: 'bar',
  phone: '3331234567',
  address: 'Via Mare 1',
  logoUrl: '',
  primaryColor: '#0f766e',
  secondaryColor: '#134e4a',
  subscriptionStatus: 'trial',
  subscriptionExpiresAt: '2026-12-31'
};

/** Newly registered store: only name, email, slug — rest absent/null. */
const newStore = {
  id: 'n1',
  name: 'Pasticceria Artigianale Del Borgo',
  slug: 'pasticceria-borgo',
  email: 'nuovo@pasticceria.it',
  logoUrl: null,
  primaryColor: null,
  secondaryColor: null,
  businessType: null,
  phone: null,
  address: null,
  subscriptionStatus: null,
  subscriptionExpiresAt: null
};

const demoCampaign = {
  id: 'c1',
  name: 'Promo Settembre',
  slug: 'promo-settembre',
  active: true,
  gameType: 'scratch_card',
  guaranteedWin: false,
  startDate: '2026-09-15',
  endDate: '2026-10-15',
  playLimitMode: 'per_campaign',
  voucherValidityDays: 15,
  loseMessage: 'Niente premio oggi — ci vediamo alla prossima!',
  description: '',
  customerFields: [],
  stats: { totalPlays: 12, wins: 3, redeemedVouchers: 1 },
  totalPlays: 12,
  wins: 3,
  prizeItems: [
    { id: 'p1', name: 'Birra 50cl', emoji: '🍺', active: true, totalQuantity: 20, remainingQuantity: 18, winProbability: 10 },
    { id: 'p2', name: 'Caffè', emoji: '☕', active: true, totalQuantity: 50, remainingQuantity: 50, winProbability: 30 }
  ]
};

async function mockApis(page, {
  store = demoStore,
  campaigns = [demoCampaign],
  subscriptionOk = true,
  subscription = { status: 'trial', expiresAt: '2026-12-31', planName: 'Trial', plans: [] }
} = {}) {
  await page.route('**/api/**', async (route) => {
    const url = route.request().url();
    const method = route.request().method();
    const json = (data, ok = true) => route.fulfill({
      status: ok ? 200 : 500,
      contentType: 'application/json',
      body: JSON.stringify(ok ? { success: true, data } : { success: false, error: 'fail' })
    });
    if (url.includes('/api/auth/login')) {
      return json({ user: { email: store.email || 'demo@bar.it', role: 'store' } });
    }
    if (url.includes('/api/store/me')) return json({ store });
    if (url.includes('/prizes') && method === 'POST') return json(demoCampaign.prizeItems[0]);
    if (url.match(/\/api\/store\/campaigns\/?$/) && method === 'POST') return json(demoCampaign);
    if (url.includes('/api/store/campaigns')) return json(campaigns);
    if (url.includes('/api/store/participations')) return json([]);
    if (url.includes('/api/store/vouchers')) return json([]);
    if (url.includes('/api/store/alerts')) return json([]);
    if (url.includes('/api/store/subscription')) {
      if (!subscriptionOk) return json(null, false);
      return json(subscription);
    }
    if (url.includes('/api/public/qr')) {
      const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
      return route.fulfill({ status: 200, contentType: 'image/png', body: png });
    }
    return json({});
  });
}

async function checkNoOverflow(page, width) {
  await page.setViewportSize({ width, height: 844 });
  const overflow = await page.evaluate(() => {
    const doc = document.documentElement;
    return {
      scrollWidth: doc.scrollWidth,
      clientWidth: doc.clientWidth,
      overflowX: doc.scrollWidth > doc.clientWidth + 1
    };
  });
  return { width, overflow };
}

async function checkHeaderLayout(page, width) {
  await page.setViewportSize({ width, height: 844 });
  return page.evaluate((w) => {
    const name = document.getElementById('storeName').getBoundingClientRect();
    const refresh = document.getElementById('refreshBtn').getBoundingClientRect();
    const nameUnderButtons = name.top >= refresh.bottom - 2
      ? false
      : (name.top > refresh.top + 8 && name.right > refresh.left && name.left < refresh.right);
    const truncated = document.getElementById('storeName').scrollHeight > 0
      && getComputedStyle(document.getElementById('storeName')).textOverflow === 'ellipsis';
    return {
      width: w,
      nameUnderButtons,
      nameBelowActions: name.top >= refresh.bottom - 2 || refresh.top >= name.bottom - 2,
      truncated,
      nameHeight: name.height
    };
  }, width);
}

function writeIndexHtml(images) {
  const figures = images.map((rel) => `
  <figure>
    <figcaption>${rel}</figcaption>
    <img src="${rel}" alt="${rel}" width="390" />
  </figure>`).join('\n');
  writeFileSync(join(outDir, 'index.html'), `<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Screenshot pannello</title>
  <style>
    body { margin: 0; padding: 24px; background: #e8e8e8; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #222; }
    h1 { font-size: 1.1rem; font-weight: 600; margin: 0 0 24px; }
    figure { margin: 0 0 32px; padding: 0; }
    figcaption { font-size: 0.875rem; margin-bottom: 8px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
    img { display: block; width: 390px; height: auto; background: #fff; box-shadow: 0 1px 4px rgba(0, 0, 0, 0.12); }
  </style>
</head>
<body>
  <h1>Screenshot pannello</h1>
${figures}
</body>
</html>
`);
}

async function main() {
  const server = await serve();
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.setDefaultTimeout(20000);
  const pageErrors = [];
  page.on('pageerror', (e) => {
    pageErrors.push(e.message);
    console.error('PAGEERROR', e.message);
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    sessionStorage.setItem('gv_store_user', JSON.stringify({ email: 'demo@bar.it' }));
  });

  await mockApis(page, {
    campaigns: [
      demoCampaign,
      { ...demoCampaign, id: 'c2', name: 'Estate', active: false, stats: { totalPlays: 4 } }
    ]
  });
  await page.goto(`${base}/store.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#activePromoCard h2');
  await page.screenshot({ path: join(outDir, 'cruscotto-attiva.png'), fullPage: true });

  await page.unroute('**/api/**');
  await mockApis(page, { campaigns: [] });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#createPromoBtn');
  await page.screenshot({ path: join(outDir, 'cruscotto-vuoto.png'), fullPage: true });

  await page.click('#createPromoBtn');
  await page.waitForSelector('#wizardStep1:not(.hidden)');
  await page.fill('.prize-row-edit [data-f="name"]', 'Birra 50cl');
  await page.screenshot({ path: join(outDir, 'passo1.png'), fullPage: true });

  await page.click('#step1NextBtn');
  await page.waitForSelector('#wizardStep2:not(.hidden)');
  await page.screenshot({ path: join(outDir, 'passo2.png'), fullPage: true });

  await page.click('#openAdvancedBtn');
  await page.waitForSelector('#wizardAdvanced:not(.hidden)');
  await page.screenshot({ path: join(outDir, 'avanzate.png'), fullPage: true });
  await page.click('#closeAdvancedBtn');
  await page.waitForSelector('#wizardStep2:not(.hidden)');

  await page.click('#step2NextBtn');
  await page.waitForSelector('#wizardStep3:not(.hidden)');
  await page.screenshot({ path: join(outDir, 'passo3.png'), fullPage: true });

  await page.unroute('**/api/**');
  await mockApis(page, { campaigns: [demoCampaign] });
  await page.goto(`${base}/content.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#contentApp:not(.hidden)');
  await page.click('#renderBtn');
  await page.waitForTimeout(1200);
  await page.screenshot({ path: join(outDir, 'volantino-a4-demo.png'), fullPage: true });

  // ── Negozio appena registrato ───────────────────────────────────────────
  const newStoreErrors = [];
  page.removeAllListeners('pageerror');
  page.on('pageerror', (e) => {
    newStoreErrors.push(e.message);
    pageErrors.push(e.message);
    console.error('PAGEERROR-nuovo', e.message);
  });
  await page.unroute('**/api/**');
  await page.addInitScript(() => {
    sessionStorage.setItem('gv_store_user', JSON.stringify({ email: 'nuovo@pasticceria.it' }));
  });
  await mockApis(page, {
    store: newStore,
    campaigns: [],
    subscription: { status: 'trial', expiresAt: null, planName: 'Trial', plans: [] }
  });
  await page.goto(`${base}/store.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#createPromoBtn');
  const nuovoSnap = await page.evaluate(() => ({
    initials: document.getElementById('dashLogo')?.textContent,
    name: document.getElementById('storeName')?.textContent,
    subTitle: document.getElementById('subscriptionTitle')?.textContent,
    createBtn: Boolean(document.getElementById('createPromoBtn')),
    otherHidden: document.getElementById('otherCampaignsSection')?.classList.contains('hidden'),
    alertsHidden: document.getElementById('alertsList')?.classList.contains('hidden'),
    promoText: document.getElementById('activePromoCard')?.innerText || ''
  }));
  if (!nuovoSnap.createBtn || !nuovoSnap.promoText.includes('Crea la tua promozione')) {
    throw new Error(`Negozio nuovo: cruscotto incompleto ${JSON.stringify(nuovoSnap)}`);
  }
  if (!nuovoSnap.otherHidden || !nuovoSnap.alertsHidden) {
    throw new Error(`Negozio nuovo: contenitori vuoti visibili ${JSON.stringify(nuovoSnap)}`);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: join(nuovoDir, 'cruscotto-390.png'), fullPage: true });
  await page.setViewportSize({ width: 320, height: 844 });
  await page.screenshot({ path: join(nuovoDir, 'cruscotto-320.png'), fullPage: true });

  // subscription fail must still render dashboard
  await page.unroute('**/api/**');
  await mockApis(page, { store: newStore, campaigns: [], subscriptionOk: false });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#createPromoBtn');
  const subFail = await page.evaluate(() => ({
    subTitle: document.getElementById('subscriptionTitle')?.textContent,
    subText: document.getElementById('subscriptionText')?.textContent,
    promoEmpty: !(document.getElementById('activePromoCard')?.innerText || '').trim()
  }));
  if (subFail.promoEmpty || /controllo/i.test(subFail.subText || '') || subFail.subTitle === 'Trial attivo') {
    throw new Error(`Subscription fail UI stuck: ${JSON.stringify(subFail)}`);
  }
  await page.screenshot({ path: join(nuovoDir, 'abbonamento-non-disponibile.png'), fullPage: true });

  const reports = [];
  const headerReports = [];
  await page.unroute('**/api/**');
  await mockApis(page, { store: newStore, campaigns: [] });
  await page.goto(`${base}/store.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#createPromoBtn');
  for (const w of [320, 390, 768, 1280]) {
    reports.push(await checkNoOverflow(page, w));
  }
  for (const w of [320, 390]) {
    headerReports.push(await checkHeaderLayout(page, w));
  }
  await page.setViewportSize({ width: 320, height: 844 });
  await page.click('#createPromoBtn');
  await page.waitForSelector('#wizardStep1:not(.hidden)');
  reports.push({ ...(await checkNoOverflow(page, 320)), view: 'wizard-step1' });
  await page.fill('.prize-row-edit [data-f="name"]', 'Birra');
  await page.click('#step1NextBtn');
  await page.waitForSelector('#wizardStep2:not(.hidden)');
  reports.push({ ...(await checkNoOverflow(page, 320)), view: 'wizard-step2' });

  // Register responsive
  const registerReports = [];
  for (const w of [320, 390]) {
    await page.setViewportSize({ width: w, height: 900 });
    await page.goto(`${base}/register.html`, { waitUntil: 'domcontentloaded' });
    const reg = await page.evaluate((width) => {
      const doc = document.documentElement;
      const rows = [...document.querySelectorAll('.form-row.two')].map((r) => {
        const styles = getComputedStyle(r);
        return styles.gridTemplateColumns;
      });
      const btn = document.getElementById('registerBtn').getBoundingClientRect();
      const singleCol = rows.every((cols) => !cols.includes(' ') || cols.split(' ').filter(Boolean).length === 1);
      return {
        width,
        overflowX: doc.scrollWidth > doc.clientWidth + 1,
        scrollWidth: doc.scrollWidth,
        clientWidth: doc.clientWidth,
        singleCol,
        btnFull: Math.abs(btn.width - (doc.clientWidth - 20)) < 40 || btn.width >= doc.clientWidth * 0.85,
        rows
      };
    }, w);
    registerReports.push(reg);
    await page.screenshot({ path: join(nuovoDir, `register-${w}.png`), fullPage: true });
  }

  writeIndexHtml([
    'avanzate.png',
    'cruscotto-attiva.png',
    'cruscotto-vuoto.png',
    'passo1.png',
    'passo2.png',
    'passo3.png',
    'volantino-a4-demo.png',
    'nuovo/cruscotto-320.png',
    'nuovo/cruscotto-390.png',
    'nuovo/abbonamento-non-disponibile.png',
    'nuovo/register-320.png',
    'nuovo/register-390.png'
  ]);

  console.log(JSON.stringify({
    outDir,
    nuovoSnap,
    subFail,
    reports,
    headerReports,
    registerReports,
    newStoreErrors,
    pageErrors
  }, null, 2));

  const badOverflow = reports.filter((r) => r.overflow.overflowX);
  const badHeader = headerReports.filter((r) => r.nameUnderButtons || r.truncated);
  const badRegister = registerReports.filter((r) => r.overflowX || !r.singleCol || !r.btnFull);
  if (badOverflow.length) {
    console.error('OVERFLOW-X detected', badOverflow);
    process.exitCode = 1;
  }
  if (badHeader.length) {
    console.error('HEADER layout bad', badHeader);
    process.exitCode = 1;
  }
  if (badRegister.length) {
    console.error('REGISTER responsive bad', badRegister);
    process.exitCode = 1;
  }
  if (newStoreErrors.length || pageErrors.length) {
    console.error('Console/page errors', { newStoreErrors, pageErrors });
    process.exitCode = 1;
  }

  await browser.close();
  server.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
