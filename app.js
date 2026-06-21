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
const gameEyebrow = document.getElementById('gameEyebrow');
const gameTitle = document.getElementById('gameTitle');
const gameHelp = document.getElementById('gameHelp');
const gameSurface = document.getElementById('gameSurface');
const resultDiv = document.getElementById('result');
const finalNotice = document.getElementById('finalNotice');
const voucherCard = document.getElementById('voucherCard');
const voucherCanvas = document.getElementById('voucherCanvas');
const downloadVoucherBtn = document.getElementById('downloadVoucherBtn');
let voucherCtx = null;

function getVoucherContext() {
  if (!voucherCtx) {
    voucherCtx = voucherCanvas.getContext('2d');
  }
  return voucherCtx;
}

let gameData = null;
let campaignConfig = null;
let activeGame = null;

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

  const meta = PromoGames.getMeta(config.gameType || 'scratch_card');
  playBtn.textContent = meta.playLabel;
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
    hide(setupForm);
    show(gameSection);
    initGame();
  } catch (error) {
    showFormError('Impossibile contattare il server. Riprova più tardi.');
  } finally {
    playBtn.disabled = false;
    const meta = PromoGames.getMeta(campaignConfig?.gameType || 'scratch_card');
    playBtn.textContent = meta.playLabel;
  }
}

function initGame() {
  if (!gameData) return;

  if (activeGame) {
    activeGame.destroy();
    activeGame = null;
  }

  const gameType = campaignConfig?.gameType || 'scratch_card';
  const meta = PromoGames.getMeta(gameType);
  gameEyebrow.textContent = 'Un solo tentativo';
  gameTitle.textContent = meta.title;
  gameHelp.textContent = meta.help;
  resultDiv.textContent = '';
  resultDiv.className = 'result';
  hide(finalNotice);
  hide(voucherCard);
  gameSurface.innerHTML = '';

  activeGame = PromoGames.create(gameType, gameSurface, {
    gameData,
    campaignConfig,
    onReveal: showResult
  });
  activeGame.start();
}

function showResult() {
  if (!gameData) return;

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

  const ctx = getVoucherContext();
  const primary = campaignConfig?.store?.primaryColor || '#667eea';
  const secondary = campaignConfig?.store?.secondaryColor || '#764ba2';
  const storeName = campaignConfig?.store?.name || 'Gratta & Vinci';
  const campaignName = campaignConfig?.name || 'Gioco promozionale';
  const expiresAt = new Date(gameData.expiresAt).toLocaleDateString('it-IT');

  ctx.clearRect(0, 0, voucherCanvas.width, voucherCanvas.height);
  const gradient = ctx.createLinearGradient(0, 0, voucherCanvas.width, voucherCanvas.height);
  gradient.addColorStop(0, primary);
  gradient.addColorStop(1, secondary);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, voucherCanvas.width, voucherCanvas.height);

  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  roundedRect(ctx, 70, 70, voucherCanvas.width - 140, voucherCanvas.height - 140, 54);
  ctx.fill();

  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  roundedRect(ctx, 130, 130, 150, 150, 36);
  ctx.fill();
  ctx.strokeStyle = primary;
  ctx.lineWidth = 8;
  ctx.stroke();
  ctx.fillStyle = primary;
  ctx.font = '900 58px Arial';
  ctx.fillText(storeInitials(storeName), 205, 225);

  ctx.fillStyle = primary;
  ctx.font = '900 42px Arial';
  ctx.fillText(storeName, voucherCanvas.width / 2, 330);

  ctx.fillStyle = '#111827';
  ctx.font = '900 74px Arial';
  ctx.fillText('CARD PREMIO', voucherCanvas.width / 2, 430);

  ctx.fillStyle = '#4b5563';
  ctx.font = '900 30px Arial';
  ctx.fillText('PREMIO VINTO', voucherCanvas.width / 2, 505);

  ctx.fillStyle = secondary;
  ctx.font = '900 58px Arial';
  drawCenteredText(
    ctx,
    `${gameData.prize.emoji || ''} ${gameData.prize.name}`.trim(),
    voucherCanvas.width / 2,
    555,
    voucherCanvas.width - 220,
    68,
    2
  );

  ctx.fillStyle = '#4b5563';
  ctx.font = '700 32px Arial';
  drawCenteredText(ctx, campaignName, voucherCanvas.width / 2, 720, voucherCanvas.width - 220, 40, 2);

  ctx.fillStyle = '#f8fafc';
  roundedRect(ctx, 150, 815, voucherCanvas.width - 300, 150, 34);
  ctx.fill();
  ctx.strokeStyle = '#d1d5db';
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.fillStyle = '#111827';
  ctx.font = '900 38px Arial';
  ctx.fillText('CODICE VOUCHER', voucherCanvas.width / 2, 865);
  ctx.font = '900 48px Arial';
  ctx.fillText(gameData.voucherCode, voucherCanvas.width / 2, 930);

  try {
    const redeemUrl = `${window.location.origin}/redeem.html?code=${encodeURIComponent(gameData.voucherCode)}`;
    const qrImage = await loadImage(`/api/public/qr?text=${encodeURIComponent(redeemUrl)}`);
    ctx.fillStyle = '#ffffff';
    roundedRect(ctx, voucherCanvas.width / 2 - 145, 1000, 290, 290, 30);
    ctx.fill();
    ctx.drawImage(qrImage, voucherCanvas.width / 2 - 125, 1020, 250, 250);
  } catch {
    ctx.fillStyle = '#6b7280';
    ctx.font = '700 28px Arial';
    ctx.fillText('QR non disponibile', voucherCanvas.width / 2, 1135);
  }

  ctx.fillStyle = '#4b5563';
  ctx.font = '800 30px Arial';
  ctx.fillText(`Valido fino al ${expiresAt}`, voucherCanvas.width / 2, 1330);
}

function downloadVoucherCard() {
  if (!gameData?.won) return;
  const link = document.createElement('a');
  link.href = voucherCanvas.toDataURL('image/png');
  link.download = `card-premio-${gameData.voucherCode}.png`;
  link.click();
}

playBtn.addEventListener('click', startPlay);
downloadVoucherBtn.addEventListener('click', downloadVoucherCard);

validateSetup();
