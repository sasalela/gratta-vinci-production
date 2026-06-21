// Gratta & Vinci — integrato con API backend

const params = new URLSearchParams(window.location.search);
const storeSlug = params.get('store');
const campaignSlug = params.get('campaign');

const setupError = document.getElementById('setupError');
const setupForm = document.getElementById('setupForm');
const gameSection = document.getElementById('gameSection');
const brandLogo = document.getElementById('brandLogo');
const storeLabel = document.getElementById('storeLabel');
const campaignTitle = document.getElementById('campaignTitle');
const campaignInfo = document.getElementById('campaignInfo');
const dynamicFields = document.getElementById('dynamicFields');
const privacyCheckbox = document.getElementById('privacyConsent');
const formError = document.getElementById('formError');
const playBtn = document.getElementById('playBtn');
const canvas = document.getElementById('scratch');
const ctx = canvas.getContext('2d');
const resultDiv = document.getElementById('result');
const finalNotice = document.getElementById('finalNotice');
const scratchProgressBar = document.getElementById('scratchProgressBar');
const scratchProgressText = document.getElementById('scratchProgressText');
const voucherCard = document.getElementById('voucherCard');
const voucherCanvas = document.getElementById('voucherCanvas');
const voucherCtx = voucherCanvas.getContext('2d');
const downloadVoucherBtn = document.getElementById('downloadVoucherBtn');

const threshold = 50;
let gameData = null;
let campaignConfig = null;
let revealed = false;
let scratching = false;
let initialCoverPixels = 0;
const resultLayer = document.createElement('canvas');
const coverLayer = document.createElement('canvas');
const resultLayerCtx = resultLayer.getContext('2d');
const coverLayerCtx = coverLayer.getContext('2d');

function show(el) {
  el.classList.remove('hidden');
}

function hide(el) {
  el.classList.add('hidden');
}

function showFormError(message) {
  formError.textContent = message;
  show(formError);
}

function clearFormError() {
  formError.textContent = '';
  hide(formError);
}

function getDeviceKey() {
  const key = 'gv_device_key';
  let value = localStorage.getItem(key);
  if (!value) {
    value = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(key, value);
  }
  return value;
}

function renderDynamicFields(fields) {
  dynamicFields.innerHTML = fields
    .filter((field) => field.enabled)
    .map((field) => {
      const type = field.key === 'birthDate' ? 'date' : field.key === 'email' ? 'email' : field.key === 'marketingConsent' ? 'checkbox' : 'text';
      if (type === 'checkbox') {
        return `<label class="checkbox-label"><input type="checkbox" data-customer-field="${field.key}"> ${field.label}</label>`;
      }
      return `<label for="field_${field.key}">${field.label}${field.required ? ' *' : ''}</label><input id="field_${field.key}" type="${type}" data-customer-field="${field.key}" ${field.required ? 'required' : ''}>`;
    })
    .join('');
}

function applyCampaignBranding(config) {
  document.documentElement.style.setProperty('--brand-primary', config.store.primaryColor || '#667eea');
  document.documentElement.style.setProperty('--brand-secondary', config.store.secondaryColor || '#764ba2');
  storeLabel.textContent = config.store.name;
  campaignTitle.textContent = config.name;
  document.getElementById('subtitle').textContent = config.description || 'Compila i dati e scopri se hai vinto.';

  if (config.store.logoUrl) {
    brandLogo.innerHTML = `<img src="${config.store.logoUrl}" alt="${config.store.name}">`;
    show(brandLogo);
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

function roundedRect(targetCtx, x, y, width, height, radius) {
  targetCtx.beginPath();
  targetCtx.moveTo(x + radius, y);
  targetCtx.arcTo(x + width, y, x + width, y + height, radius);
  targetCtx.arcTo(x + width, y + height, x, y + height, radius);
  targetCtx.arcTo(x, y + height, x, y, radius);
  targetCtx.arcTo(x, y, x + width, y, radius);
  targetCtx.closePath();
}

function drawCenteredText(targetCtx, text, x, y, maxWidth, lineHeight, maxLines) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';

  for (const word of words) {
    const testLine = line ? `${line} ${word}` : word;
    if (targetCtx.measureText(testLine).width > maxWidth && line) {
      lines.push(line);
      line = word;
      if (maxLines && lines.length === maxLines) break;
    } else {
      line = testLine;
    }
  }

  if (line && (!maxLines || lines.length < maxLines)) {
    lines.push(line);
  }

  lines.forEach((textLine, index) => {
    targetCtx.fillText(textLine, x, y + index * lineHeight);
  });

  return y + lines.length * lineHeight;
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

async function validateSetup() {
  if (!storeSlug || !campaignSlug) {
    setupError.textContent =
      'URL non valido. Usa: /?store=bar-giorgio&campaign=birra-gratis';
    show(setupError);
    hide(setupForm);
    hide(gameSection);
    return false;
  }

  try {
    const response = await fetch(`/api/public/campaign?store=${encodeURIComponent(storeSlug)}&campaign=${encodeURIComponent(campaignSlug)}`);
    const payload = await response.json();
    if (!response.ok || !payload.success) {
      throw new Error(payload.error || 'Campagna non disponibile.');
    }

    campaignConfig = payload.data;
    applyCampaignBranding(campaignConfig);
    campaignInfo.textContent = 'Completa i campi richiesti per registrare la tua partecipazione.';
    renderDynamicFields(campaignConfig.customerFields || []);
    show(setupForm);
    return true;
  } catch (error) {
    setupError.textContent = error.message;
    show(setupError);
    hide(setupForm);
    hide(gameSection);
    return false;
  }
}

function collectCustomerData() {
  const data = {};
  document.querySelectorAll('[data-customer-field]').forEach((input) => {
    if (input.type === 'checkbox') {
      data[input.dataset.customerField] = input.checked;
    } else {
      data[input.dataset.customerField] = input.value.trim();
    }
  });
  return data;
}

async function startPlay() {
  clearFormError();

  const customerData = collectCustomerData();
  const email = customerData.email;

  if (!privacyCheckbox.checked) {
    showFormError('Devi accettare il consenso privacy per giocare.');
    return;
  }

  playBtn.disabled = true;
  playBtn.textContent = 'Caricamento...';

  try {
    const response = await fetch('/api/public/play', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        storeSlug,
        campaignSlug,
        email,
        customerData,
        deviceKey: getDeviceKey(),
        privacyConsent: true
      })
    });

    const payload = await response.json();

    if (!response.ok || !payload.success) {
      const errorMessage =
        payload.error ||
        (payload.errors && payload.errors[0]?.message) ||
        'Errore durante la partita.';
      showFormError(errorMessage);
      return;
    }

    gameData = payload.data;
    revealed = false;
    hide(setupForm);
    show(gameSection);
    initGame();
  } catch (error) {
    showFormError('Impossibile contattare il server. Riprova più tardi.');
  } finally {
    playBtn.disabled = false;
    playBtn.textContent = 'Gioca';
  }
}

function initGame() {
  if (!gameData) return;

  resultLayer.width = canvas.width;
  resultLayer.height = canvas.height;
  coverLayer.width = canvas.width;
  coverLayer.height = canvas.height;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  resultDiv.textContent = '';
  resultDiv.className = 'result';
  updateScratchProgress(0);
  hide(finalNotice);
  hide(voucherCard);

  drawWaitingLayer();
  drawCoverLayer();
  initialCoverPixels = countCoveredPixels();
  composeScratchCanvas();
}

function drawWaitingLayer() {
  const primary = campaignConfig?.store?.primaryColor || '#667eea';
  const secondary = campaignConfig?.store?.secondaryColor || '#764ba2';
  resultLayerCtx.clearRect(0, 0, resultLayer.width, resultLayer.height);

  const gradient = resultLayerCtx.createLinearGradient(0, 0, resultLayer.width, resultLayer.height);
  gradient.addColorStop(0, '#fffaf0');
  gradient.addColorStop(1, '#eef2ff');
  resultLayerCtx.fillStyle = gradient;
  roundedRect(resultLayerCtx, 0, 0, resultLayer.width, resultLayer.height, 28);
  resultLayerCtx.fill();

  resultLayerCtx.fillStyle = primary;
  roundedRect(resultLayerCtx, 18, 18, resultLayer.width - 36, resultLayer.height - 36, 24);
  resultLayerCtx.fill();

  resultLayerCtx.fillStyle = '#ffffff';
  roundedRect(resultLayerCtx, 28, 28, resultLayer.width - 56, resultLayer.height - 56, 20);
  resultLayerCtx.fill();

  resultLayerCtx.fillStyle = secondary;
  resultLayerCtx.globalAlpha = 0.1;
  for (let x = 52; x < resultLayer.width; x += 72) {
    for (let y = 55; y < resultLayer.height; y += 58) {
      resultLayerCtx.beginPath();
      resultLayerCtx.arc(x, y, 6, 0, Math.PI * 2);
      resultLayerCtx.fill();
    }
  }
  resultLayerCtx.globalAlpha = 1;

  resultLayerCtx.textAlign = 'center';
  resultLayerCtx.fillStyle = primary;
  resultLayerCtx.font = '900 18px Arial';
  resultLayerCtx.fillText('CONTINUA A GRATTARE', resultLayer.width / 2, 104);

  resultLayerCtx.fillStyle = '#111827';
  resultLayerCtx.font = '900 28px Arial';
  resultLayerCtx.fillText('Il risultato è nascosto', resultLayer.width / 2, 145);

  resultLayerCtx.fillStyle = '#64748b';
  resultLayerCtx.font = '700 15px Arial';
  resultLayerCtx.fillText('Ancora un po’ e scoprirai l’esito', resultLayer.width / 2, 176);
}

function countCoveredPixels() {
  const imageData = coverLayerCtx.getImageData(0, 0, coverLayer.width, coverLayer.height);
  let covered = 0;

  for (let i = 3; i < imageData.data.length; i += 4) {
    if (imageData.data[i] > 0) {
      covered += 1;
    }
  }

  return covered;
}

function updateScratchProgress(percentage) {
  const safePercentage = Math.max(0, Math.min(100, Math.round(percentage)));
  scratchProgressBar.style.width = `${safePercentage}%`;
  scratchProgressText.textContent = safePercentage >= threshold
    ? 'Risultato sbloccato.'
    : 'Continua a grattare';
}

function drawResultLayer() {
  const primary = campaignConfig?.store?.primaryColor || '#667eea';
  const secondary = campaignConfig?.store?.secondaryColor || '#764ba2';
  resultLayerCtx.clearRect(0, 0, resultLayer.width, resultLayer.height);

  const gradient = resultLayerCtx.createLinearGradient(0, 0, resultLayer.width, resultLayer.height);
  gradient.addColorStop(0, '#fffaf0');
  gradient.addColorStop(1, '#eef2ff');
  resultLayerCtx.fillStyle = gradient;
  roundedRect(resultLayerCtx, 0, 0, resultLayer.width, resultLayer.height, 28);
  resultLayerCtx.fill();

  resultLayerCtx.fillStyle = primary;
  roundedRect(resultLayerCtx, 18, 18, resultLayer.width - 36, resultLayer.height - 36, 24);
  resultLayerCtx.fill();

  resultLayerCtx.fillStyle = '#ffffff';
  roundedRect(resultLayerCtx, 28, 28, resultLayer.width - 56, resultLayer.height - 56, 20);
  resultLayerCtx.fill();

  resultLayerCtx.fillStyle = secondary;
  resultLayerCtx.globalAlpha = 0.12;
  for (let i = 0; i < 18; i += 1) {
    resultLayerCtx.beginPath();
    resultLayerCtx.arc(
      35 + Math.random() * (resultLayer.width - 70),
      35 + Math.random() * (resultLayer.height - 70),
      4 + Math.random() * 9,
      0,
      Math.PI * 2
    );
    resultLayerCtx.fill();
  }
  resultLayerCtx.globalAlpha = 1;

  const hiddenText = gameData.won
    ? `${gameData.prize.emoji || ''} ${gameData.prize.name}`
    : campaignConfig?.loseMessage || gameData.loseMessage;

  resultLayerCtx.textAlign = 'center';
  resultLayerCtx.fillStyle = primary;
  resultLayerCtx.font = '800 15px Arial';
  resultLayerCtx.fillText(gameData.won ? 'HAI VINTO' : 'ESITO GIOCATA', resultLayer.width / 2, 72);

  resultLayerCtx.fillStyle = '#111827';
  resultLayerCtx.font = '900 28px Arial';
  drawCenteredText(resultLayerCtx, hiddenText, resultLayer.width / 2, 115, resultLayer.width - 86, 34, 2);

  if (gameData.won) {
    resultLayerCtx.fillStyle = '#4b5563';
    resultLayerCtx.font = '700 14px Arial';
    resultLayerCtx.fillText('Scarica la card premio dopo aver grattato', resultLayer.width / 2, resultLayer.height - 58);
  }
}

function drawCoverLayer() {
  coverLayerCtx.clearRect(0, 0, coverLayer.width, coverLayer.height);

  const cover = coverLayerCtx.createLinearGradient(0, 0, coverLayer.width, coverLayer.height);
  cover.addColorStop(0, '#6b7280');
  cover.addColorStop(0.22, '#f8fafc');
  cover.addColorStop(0.5, '#9ca3af');
  cover.addColorStop(0.74, '#e5e7eb');
  cover.addColorStop(1, '#64748b');
  coverLayerCtx.fillStyle = cover;
  roundedRect(coverLayerCtx, 0, 0, coverLayer.width, coverLayer.height, 28);
  coverLayerCtx.fill();

  coverLayerCtx.strokeStyle = 'rgba(255,255,255,0.42)';
  coverLayerCtx.lineWidth = 2;
  for (let x = -coverLayer.height; x < coverLayer.width; x += 26) {
    coverLayerCtx.beginPath();
    coverLayerCtx.moveTo(x, coverLayer.height);
    coverLayerCtx.lineTo(x + coverLayer.height, 0);
    coverLayerCtx.stroke();
  }

  coverLayerCtx.fillStyle = 'rgba(17, 24, 39, 0.18)';
  roundedRect(coverLayerCtx, 32, 38, coverLayer.width - 64, coverLayer.height - 76, 22);
  coverLayerCtx.fill();

  coverLayerCtx.textAlign = 'center';
  coverLayerCtx.fillStyle = '#ffffff';
  coverLayerCtx.font = '900 30px Arial';
  coverLayerCtx.fillText('GRATTA QUI', coverLayer.width / 2, coverLayer.height / 2 - 6);
  coverLayerCtx.font = '700 15px Arial';
  coverLayerCtx.fillText('Scopri se hai vinto il premio', coverLayer.width / 2, coverLayer.height / 2 + 25);
}

function composeScratchCanvas() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(resultLayer, 0, 0);
  ctx.drawImage(coverLayer, 0, 0);
}

function scratchAt(x, y) {
  coverLayerCtx.save();
  coverLayerCtx.globalCompositeOperation = 'destination-out';
  coverLayerCtx.beginPath();
  coverLayerCtx.arc(x, y, 24, 0, Math.PI * 2);
  coverLayerCtx.fill();
  coverLayerCtx.restore();
  composeScratchCanvas();

  const remainingCoverPixels = countCoveredPixels();
  const clearedCoverPixels = Math.max(0, initialCoverPixels - remainingCoverPixels);
  const percentage = initialCoverPixels ? (clearedCoverPixels / initialCoverPixels) * 100 : 0;
  updateScratchProgress(percentage);

  if (percentage >= threshold) {
    showResult();
  }
}

function showResult() {
  if (revealed || !gameData) return;
  revealed = true;
  drawResultLayer();
  coverLayerCtx.clearRect(0, 0, coverLayer.width, coverLayer.height);
  composeScratchCanvas();
  updateScratchProgress(100);

  if (gameData.won) {
    const expiresAt = new Date(gameData.expiresAt).toLocaleDateString('it-IT');
    resultDiv.innerHTML =
      `<strong>${gameData.prize.emoji || ''} ${gameData.prize.name}</strong><br>` +
      `Codice voucher: <code>${gameData.voucherCode}</code><br>` +
      `Scade il: ${expiresAt}<br>` +
      '<span class="small-note">Scarica la card premio e conservala nella galleria del telefono.</span>';
    resultDiv.className = 'result winner';
    renderVoucherCard().then(() => show(voucherCard)).catch(() => show(voucherCard));
    show(finalNotice);
    return;
  }

  resultDiv.textContent = gameData.loseMessage || campaignConfig?.loseMessage || 'Nessun premio questa volta.';
  resultDiv.className = 'result loser';
  show(finalNotice);
}

async function renderVoucherCard() {
  if (!gameData?.won) return;

  const primary = campaignConfig?.store?.primaryColor || '#667eea';
  const secondary = campaignConfig?.store?.secondaryColor || '#764ba2';
  const storeName = campaignConfig?.store?.name || 'Gratta & Vinci';
  const campaignName = campaignConfig?.name || 'Gioco promozionale';
  const expiresAt = new Date(gameData.expiresAt).toLocaleDateString('it-IT');

  voucherCtx.clearRect(0, 0, voucherCanvas.width, voucherCanvas.height);
  const gradient = voucherCtx.createLinearGradient(0, 0, voucherCanvas.width, voucherCanvas.height);
  gradient.addColorStop(0, primary);
  gradient.addColorStop(1, secondary);
  voucherCtx.fillStyle = gradient;
  voucherCtx.fillRect(0, 0, voucherCanvas.width, voucherCanvas.height);

  voucherCtx.fillStyle = 'rgba(255,255,255,0.95)';
  roundedRect(voucherCtx, 70, 70, voucherCanvas.width - 140, voucherCanvas.height - 140, 54);
  voucherCtx.fill();

  voucherCtx.textAlign = 'center';
  voucherCtx.fillStyle = '#ffffff';
  roundedRect(voucherCtx, 130, 130, 150, 150, 36);
  voucherCtx.fill();
  voucherCtx.strokeStyle = primary;
  voucherCtx.lineWidth = 8;
  voucherCtx.stroke();
  voucherCtx.fillStyle = primary;
  voucherCtx.font = '900 58px Arial';
  voucherCtx.fillText(storeInitials(storeName), 205, 225);

  voucherCtx.fillStyle = primary;
  voucherCtx.font = '900 42px Arial';
  voucherCtx.fillText(storeName, voucherCanvas.width / 2, 330);

  voucherCtx.fillStyle = '#111827';
  voucherCtx.font = '900 74px Arial';
  voucherCtx.fillText('CARD PREMIO', voucherCanvas.width / 2, 430);

  voucherCtx.fillStyle = '#4b5563';
  voucherCtx.font = '900 30px Arial';
  voucherCtx.fillText('PREMIO VINTO', voucherCanvas.width / 2, 505);

  voucherCtx.fillStyle = secondary;
  voucherCtx.font = '900 58px Arial';
  drawCenteredText(
    voucherCtx,
    `${gameData.prize.emoji || ''} ${gameData.prize.name}`.trim(),
    voucherCanvas.width / 2,
    555,
    voucherCanvas.width - 220,
    68,
    2
  );

  voucherCtx.fillStyle = '#4b5563';
  voucherCtx.font = '700 32px Arial';
  drawCenteredText(voucherCtx, campaignName, voucherCanvas.width / 2, 720, voucherCanvas.width - 220, 40, 2);

  voucherCtx.fillStyle = '#f8fafc';
  roundedRect(voucherCtx, 150, 815, voucherCanvas.width - 300, 150, 34);
  voucherCtx.fill();
  voucherCtx.strokeStyle = '#d1d5db';
  voucherCtx.lineWidth = 3;
  voucherCtx.stroke();
  voucherCtx.fillStyle = '#111827';
  voucherCtx.font = '900 38px Arial';
  voucherCtx.fillText('CODICE VOUCHER', voucherCanvas.width / 2, 865);
  voucherCtx.font = '900 48px Arial';
  voucherCtx.fillText(gameData.voucherCode, voucherCanvas.width / 2, 930);

  try {
    const redeemUrl = `${window.location.origin}/redeem.html?code=${encodeURIComponent(gameData.voucherCode)}`;
    const qrImage = await loadImage(`/api/public/qr?text=${encodeURIComponent(redeemUrl)}`);
    voucherCtx.fillStyle = '#ffffff';
    roundedRect(voucherCtx, voucherCanvas.width / 2 - 145, 1000, 290, 290, 30);
    voucherCtx.fill();
    voucherCtx.drawImage(qrImage, voucherCanvas.width / 2 - 125, 1020, 250, 250);
  } catch {
    voucherCtx.fillStyle = '#6b7280';
    voucherCtx.font = '700 28px Arial';
    voucherCtx.fillText('QR non disponibile', voucherCanvas.width / 2, 1135);
  }

  voucherCtx.fillStyle = '#4b5563';
  voucherCtx.font = '800 30px Arial';
  voucherCtx.fillText(`Valido fino al ${expiresAt}`, voucherCanvas.width / 2, 1330);
}

function downloadVoucherCard() {
  if (!gameData?.won) return;
  const link = document.createElement('a');
  link.href = voucherCanvas.toDataURL('image/png');
  link.download = `card-premio-${gameData.voucherCode}.png`;
  link.click();
}

function getCanvasPosition(event) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const clientX = event.clientX ?? event.touches?.[0]?.clientX;
  const clientY = event.clientY ?? event.touches?.[0]?.clientY;
  return {
    x: (clientX - rect.left) * scaleX,
    y: (clientY - rect.top) * scaleY
  };
}

function handleScratch(event) {
  if (!gameData || revealed) return;
  event.preventDefault();
  const { x, y } = getCanvasPosition(event);
  scratchAt(x, y);
}

canvas.addEventListener('mousedown', () => {
  scratching = true;
});

canvas.addEventListener('mouseup', () => {
  scratching = false;
});

canvas.addEventListener('mouseleave', () => {
  scratching = false;
});

canvas.addEventListener('mousemove', (event) => {
  if (scratching) {
    handleScratch(event);
  }
});

canvas.addEventListener('touchstart', (event) => {
  scratching = true;
  handleScratch(event);
}, { passive: false });

canvas.addEventListener('touchmove', (event) => {
  if (scratching) {
    handleScratch(event);
  }
}, { passive: false });

canvas.addEventListener('touchend', () => {
  scratching = false;
});

playBtn.addEventListener('click', startPlay);
downloadVoucherBtn.addEventListener('click', downloadVoucherCard);

validateSetup();
