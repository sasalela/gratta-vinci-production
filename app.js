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

const threshold = 40;
let gameData = null;
let campaignConfig = null;
let revealed = false;
let scratching = false;

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

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  resultDiv.textContent = '';
  resultDiv.className = 'result';
  hide(finalNotice);

  const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  gradient.addColorStop(0, '#fff7d6');
  gradient.addColorStop(1, '#ffd166');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = '#172033';
  ctx.font = 'bold 24px Arial';
  ctx.textAlign = 'center';
  const hiddenText = gameData.won
    ? `${gameData.prize.emoji || ''} ${gameData.prize.name}`
    : campaignConfig?.loseMessage || gameData.loseMessage;
  ctx.fillText(hiddenText, canvas.width / 2, canvas.height / 2 + 8);

  const cover = ctx.createLinearGradient(0, 0, canvas.width, 0);
  cover.addColorStop(0, '#8b95a7');
  cover.addColorStop(0.5, '#c5ccd8');
  cover.addColorStop(1, '#7b8495');
  ctx.fillStyle = cover;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = '#fff';
  ctx.font = 'bold 22px Arial';
  ctx.fillText('GRATTA QUI', canvas.width / 2, canvas.height / 2 - 4);
  ctx.font = '15px Arial';
  ctx.fillText('Scopri subito il risultato', canvas.width / 2, canvas.height / 2 + 24);
}

function scratchAt(x, y) {
  ctx.clearRect(x - 15, y - 15, 30, 30);

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const pixels = imageData.data.length / 4;
  let cleared = 0;

  for (let i = 3; i < imageData.data.length; i += 4) {
    if (imageData.data[i] === 0) {
      cleared++;
    }
  }

  const percentage = (cleared / pixels) * 100;
  if (percentage > threshold) {
    showResult();
  }
}

function showResult() {
  if (revealed || !gameData) return;
  revealed = true;

  if (gameData.won) {
    const expiresAt = new Date(gameData.expiresAt).toLocaleDateString('it-IT');
    resultDiv.innerHTML =
      `<strong>${gameData.prize.emoji || ''} ${gameData.prize.name}</strong><br>` +
      `Codice voucher: <code>${gameData.voucherCode}</code><br>` +
      `Scade il: ${expiresAt}`;
    resultDiv.className = 'result winner';
    show(finalNotice);
    return;
  }

  resultDiv.textContent = gameData.loseMessage || campaignConfig?.loseMessage || 'Nessun premio questa volta.';
  resultDiv.className = 'result loser';
  show(finalNotice);
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

validateSetup();
