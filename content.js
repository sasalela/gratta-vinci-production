const TOKEN_KEY = 'gv_store_token';

const FORMAT_SIZES = {
  a4: { width: 1240, height: 1754, label: 'A4 verticale' },
  '16x9': { width: 1920, height: 1080, label: '16:9 orizzontale' },
  '4x3': { width: 1600, height: 1200, label: '4:3 orizzontale' },
  vertical: { width: 1080, height: 1920, label: '9:16 verticale' },
  square: { width: 1080, height: 1080, label: 'Quadrato' }
};

const contentApp = document.getElementById('contentApp');
const loginHint = document.getElementById('loginHint');
const errorBox = document.getElementById('errorBox');
const successBox = document.getElementById('successBox');
const storeLabel = document.getElementById('storeLabel');
const campaignSelect = document.getElementById('campaignSelect');
const formatSelect = document.getElementById('formatSelect');
const headlineInput = document.getElementById('headlineInput');
const subtitleInput = document.getElementById('subtitleInput');
const ctaInput = document.getElementById('ctaInput');
const renderBtn = document.getElementById('renderBtn');
const promoCanvas = document.getElementById('promoCanvas');
const playUrlLabel = document.getElementById('playUrlLabel');

const state = {
  store: null,
  campaigns: [],
  currentFormat: 'a4',
  lastRenderedFormat: 'a4'
};

function getToken() {
  return sessionStorage.getItem(TOKEN_KEY);
}

function show(el) {
  el.classList.remove('hidden');
}

function hide(el) {
  el.classList.add('hidden');
}

function setError(message) {
  errorBox.textContent = message;
  show(errorBox);
}

function clearMessages() {
  errorBox.textContent = '';
  successBox.textContent = '';
  hide(errorBox);
  hide(successBox);
}

function showSuccess(message) {
  successBox.textContent = message;
  show(successBox);
  setTimeout(() => hide(successBox), 3000);
}

async function api(path) {
  const response = await fetch(path, {
    headers: { Authorization: `Bearer ${getToken()}` }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.success) {
    throw new Error(payload.error || payload.message || `Errore API (${response.status})`);
  }
  return payload.data;
}

function getSelectedCampaign() {
  return state.campaigns.find((campaign) => campaign.id === campaignSelect.value);
}

function getPlayUrl(campaign) {
  return `${window.location.origin}/?store=${state.store.slug}&campaign=${campaign.slug}`;
}

function getMainPrize(campaign) {
  const prizes = campaign.prizeItems || [];
  const available = prizes.filter((prize) => prize.active !== false && prize.totalQuantity > 0);
  return available.sort((a, b) => b.winProbability - a.winProbability)[0] || prizes[0] || null;
}

function formatDate(value) {
  if (!value) return '';
  return new Date(value).toLocaleDateString('it-IT');
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function drawWrappedText(ctx, text, x, y, maxWidth, lineHeight, maxLines) {
  const words = String(text || '').split(/\s+/);
  let line = '';
  let lines = 0;

  for (const word of words) {
    const testLine = line ? `${line} ${word}` : word;
    if (ctx.measureText(testLine).width > maxWidth && line) {
      ctx.fillText(line, x, y);
      y += lineHeight;
      lines++;
      line = word;
      if (maxLines && lines >= maxLines) return y;
    } else {
      line = testLine;
    }
  }

  if (line && (!maxLines || lines < maxLines)) {
    ctx.fillText(line, x, y);
    y += lineHeight;
  }

  return y;
}

function roundedRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}

function storeInitials(name) {
  return String(name || 'GV')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('');
}

async function renderCanvas(formatKey = formatSelect.value) {
  clearMessages();
  const campaign = getSelectedCampaign();
  if (!campaign) {
    setError('Seleziona una campagna.');
    return;
  }

  const format = FORMAT_SIZES[formatKey];
  const canvas = promoCanvas;
  const ctx = canvas.getContext('2d');
  canvas.width = format.width;
  canvas.height = format.height;
  state.lastRenderedFormat = formatKey;

  const playUrl = getPlayUrl(campaign);
  const qrUrl = `/api/public/qr?text=${encodeURIComponent(playUrl)}`;
  const qrImage = await loadImage(qrUrl);
  const mainPrize = getMainPrize(campaign);
  const primary = state.store.primaryColor || '#667eea';
  const secondary = state.store.secondaryColor || '#764ba2';

  const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  gradient.addColorStop(0, primary);
  gradient.addColorStop(1, secondary);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const pad = Math.round(Math.min(canvas.width, canvas.height) * 0.075);
  const cardRadius = Math.round(Math.min(canvas.width, canvas.height) * 0.035);
  roundedRect(ctx, pad, pad, canvas.width - pad * 2, canvas.height - pad * 2, cardRadius);
  ctx.fillStyle = 'rgba(255,255,255,0.94)';
  ctx.fill();

  ctx.textAlign = 'center';
  ctx.fillStyle = '#172033';

  const isWide = canvas.width > canvas.height;
  const contentWidth = canvas.width - pad * 3;
  const logoSize = Math.round(Math.min(canvas.width, canvas.height) * (isWide ? 0.09 : 0.11));
  const logoX = canvas.width / 2 - logoSize / 2;
  const logoY = pad * 1.45;

  if (state.store.logoUrl) {
    try {
      const logo = await loadImage(state.store.logoUrl);
      roundedRect(ctx, logoX, logoY, logoSize, logoSize, 22);
      ctx.save();
      ctx.clip();
      ctx.drawImage(logo, logoX, logoY, logoSize, logoSize);
      ctx.restore();
    } catch {
      drawInitialLogo(ctx, logoX, logoY, logoSize, primary);
    }
  } else {
    drawInitialLogo(ctx, logoX, logoY, logoSize, primary);
  }

  ctx.font = `700 ${Math.round(canvas.height * (isWide ? 0.032 : 0.026))}px Arial`;
  ctx.fillStyle = primary;
  ctx.fillText(state.store.name, canvas.width / 2, logoY + logoSize + pad * 0.45);

  ctx.fillStyle = '#172033';
  ctx.font = `900 ${Math.round(canvas.height * (isWide ? 0.09 : 0.055))}px Arial`;
  const titleY = logoY + logoSize + pad * (isWide ? 1.05 : 0.95);
  drawWrappedText(ctx, headlineInput.value || 'Inquadra e vinci', canvas.width / 2, titleY, contentWidth, Math.round(canvas.height * 0.075), 2);

  ctx.font = `700 ${Math.round(canvas.height * (isWide ? 0.045 : 0.035))}px Arial`;
  ctx.fillStyle = secondary;
  const prizeText = mainPrize ? `${mainPrize.emoji || ''} ${mainPrize.name}`.trim() : campaign.name;
  drawWrappedText(ctx, prizeText, canvas.width / 2, titleY + canvas.height * (isWide ? 0.16 : 0.13), contentWidth, Math.round(canvas.height * 0.05), 2);

  ctx.font = `400 ${Math.round(canvas.height * (isWide ? 0.032 : 0.024))}px Arial`;
  ctx.fillStyle = '#4b5563';
  drawWrappedText(ctx, subtitleInput.value, canvas.width / 2, titleY + canvas.height * (isWide ? 0.24 : 0.22), contentWidth * 0.85, Math.round(canvas.height * 0.04), 3);

  const qrSize = Math.round(Math.min(canvas.width, canvas.height) * (isWide ? 0.24 : 0.34));
  const qrX = canvas.width / 2 - qrSize / 2;
  const qrY = isWide ? canvas.height - pad - qrSize - pad * 0.55 : canvas.height - pad - qrSize - pad * 1.1;

  roundedRect(ctx, qrX - 22, qrY - 22, qrSize + 44, qrSize + 44, 28);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.drawImage(qrImage, qrX, qrY, qrSize, qrSize);

  ctx.fillStyle = '#172033';
  ctx.font = `900 ${Math.round(canvas.height * (isWide ? 0.04 : 0.028))}px Arial`;
  ctx.fillText(ctaInput.value || 'Inquadra il QR code', canvas.width / 2, qrY + qrSize + pad * 0.62);

  ctx.fillStyle = '#64748b';
  ctx.font = `600 ${Math.round(canvas.height * (isWide ? 0.026 : 0.02))}px Arial`;
  ctx.fillText(`Valido fino al ${formatDate(campaign.endDate)}`, canvas.width / 2, canvas.height - pad * 0.85);

  playUrlLabel.textContent = playUrl;
}

function drawInitialLogo(ctx, x, y, size, color) {
  roundedRect(ctx, x, y, size, size, 22);
  ctx.fillStyle = '#fff';
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(4, size * 0.06);
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.font = `900 ${Math.round(size * 0.38)}px Arial`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(storeInitials(state.store.name), x + size / 2, y + size / 2);
  ctx.textBaseline = 'alphabetic';
}

function downloadCanvas(formatKey, type = 'image/png') {
  return renderCanvas(formatKey).then(() => {
    const campaign = getSelectedCampaign();
    const ext = type === 'image/jpeg' ? 'jpg' : 'png';
    const link = document.createElement('a');
    link.href = promoCanvas.toDataURL(type, 0.95);
    link.download = `${campaign.slug}-${formatKey}.${ext}`;
    link.click();
  });
}

async function downloadPdf() {
  await renderCanvas('a4');
  const campaign = getSelectedCampaign();
  const image = promoCanvas.toDataURL('image/jpeg', 0.95);
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  pdf.addImage(image, 'JPEG', 0, 0, 210, 297);
  pdf.save(`${campaign.slug}-locandina-a4.pdf`);
}

async function downloadQr() {
  const campaign = getSelectedCampaign();
  if (!campaign) return;
  const playUrl = getPlayUrl(campaign);
  const response = await fetch(`/api/public/qr?text=${encodeURIComponent(playUrl)}`);
  const blob = await response.blob();
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `${campaign.slug}-qr.svg`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function populateCampaigns() {
  campaignSelect.innerHTML = state.campaigns
    .map((campaign) => `<option value="${campaign.id}">${campaign.name}</option>`)
    .join('');
}

async function init() {
  if (!getToken()) {
    show(loginHint);
    return;
  }

  try {
    const [me, campaigns] = await Promise.all([
      api('/api/store/me'),
      api('/api/store/campaigns')
    ]);
    state.store = me.store;
    state.campaigns = campaigns;
    storeLabel.textContent = `${me.store.name} · ${campaigns.length} campagne disponibili`;
    populateCampaigns();
    show(contentApp);
    await renderCanvas();
  } catch (error) {
    setError(error.message);
    show(loginHint);
  }
}

renderBtn.addEventListener('click', () => renderCanvas());
campaignSelect.addEventListener('change', () => renderCanvas());
formatSelect.addEventListener('change', () => renderCanvas());
document.getElementById('downloadPdfBtn').addEventListener('click', downloadPdf);
document.getElementById('download16x9Btn').addEventListener('click', () => downloadCanvas('16x9'));
document.getElementById('download4x3Btn').addEventListener('click', () => downloadCanvas('4x3'));
document.getElementById('downloadVerticalBtn').addEventListener('click', () => downloadCanvas('vertical'));
document.getElementById('downloadSquareBtn').addEventListener('click', () => downloadCanvas('square'));
document.getElementById('downloadQrBtn').addEventListener('click', downloadQr);

init().catch((error) => setError(error.message));
