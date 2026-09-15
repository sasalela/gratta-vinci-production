/**
 * Playwright screenshots + responsive checks for pannello.
 * No real DB: API routes are mocked.
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const outDir = join(root, 'docs/screenshots/pannello');
mkdirSync(outDir, { recursive: true });

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

async function mockApis(page, { campaigns = [demoCampaign] } = {}) {
  await page.route('**/api/**', async (route) => {
    const url = route.request().url();
    const method = route.request().method();
    const json = (data) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data })
    });
    if (url.includes('/api/auth/login')) {
      return json({ user: { email: 'demo@bar.it', role: 'store' } });
    }
    if (url.includes('/api/store/me')) return json({ store: demoStore });
    if (url.includes('/prizes') && method === 'POST') return json(demoCampaign.prizeItems[0]);
    if (url.match(/\/api\/store\/campaigns\/?$/) && method === 'POST') return json(demoCampaign);
    if (url.includes('/api/store/campaigns')) return json(campaigns);
    if (url.includes('/api/store/participations')) return json([]);
    if (url.includes('/api/store/vouchers')) return json([]);
    if (url.includes('/api/store/alerts')) return json([]);
    if (url.includes('/api/store/subscription')) {
      return json({ status: 'trial', expiresAt: '2026-12-31', planName: 'Trial', plans: [] });
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

async function main() {
  const server = await serve();
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.setDefaultTimeout(20000);
  page.on('pageerror', (e) => console.error('PAGEERROR', e.message));
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

  const reports = [];
  await page.unroute('**/api/**');
  await mockApis(page, { campaigns: [] });
  await page.goto(`${base}/store.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#createPromoBtn');
  for (const w of [320, 390, 768, 1280]) {
    reports.push(await checkNoOverflow(page, w));
  }
  await page.setViewportSize({ width: 320, height: 844 });
  await page.click('#createPromoBtn');
  await page.waitForSelector('#wizardStep1:not(.hidden)');
  reports.push({ ...(await checkNoOverflow(page, 320)), view: 'wizard-step1' });
  await page.fill('.prize-row-edit [data-f="name"]', 'Birra');
  await page.click('#step1NextBtn');
  await page.waitForSelector('#wizardStep2:not(.hidden)');
  reports.push({ ...(await checkNoOverflow(page, 320)), view: 'wizard-step2' });

  console.log(JSON.stringify({ outDir, reports }, null, 2));
  const badOverflow = reports.filter((r) => r.overflow.overflowX);
  if (badOverflow.length) {
    console.error('OVERFLOW-X detected', badOverflow);
    process.exitCode = 1;
  }

  await browser.close();
  server.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
