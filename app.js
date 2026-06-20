// Gratta & Vinci — integrato con API backend

const params = new URLSearchParams(window.location.search);
const storeSlug = params.get('store');
const campaignSlug = params.get('campaign');

const setupError = document.getElementById('setupError');
const setupForm = document.getElementById('setupForm');
const gameSection = document.getElementById('gameSection');
const campaignInfo = document.getElementById('campaignInfo');
const dynamicFields = document.getElementById('dynamicFields');
const privacyCheckbox = document.getElementById('privacyConsent');
const formError = document.getElementById('formError');
const playBtn = document.getElementById('playBtn');
const canvas = document.getElementById('scratch');
const ctx = canvas.getContext('2d');
const resultDiv = document.getElementById('result');
const resetBtn = document.getElementById('resetBtn');

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
    document.documentElement.style.setProperty('--brand-primary', campaignConfig.store.primaryColor || '#667eea');
    document.documentElement.style.setProperty('--brand-secondary', campaignConfig.store.secondaryColor || '#764ba2');
    campaignInfo.textContent = `${campaignConfig.store.name} · ${campaignConfig.name}`;
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

  ctx.fillStyle = '#FFD700';
  ctx.font = 'bold 22px Arial';
  ctx.textAlign = 'center';
  const hiddenText = gameData.won
    ? `${gameData.prize.emoji || ''} ${gameData.prize.name}`
    : campaignConfig?.loseMessage || gameData.loseMessage;
  ctx.fillText(hiddenText, canvas.width / 2, canvas.height / 2);

  ctx.fillStyle = '#999';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = '#fff';
  ctx.font = 'bold 18px Arial';
  ctx.fillText('Raschia per scoprire', canvas.width / 2, canvas.height / 2);
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
    return;
  }

  resultDiv.textContent = gameData.loseMessage || campaignConfig?.loseMessage || 'Nessun premio questa volta.';
  resultDiv.className = 'result loser';
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

resetBtn.addEventListener('click', () => {
  if (!gameData) return;
  revealed = false;
  initGame();
});

validateSetup();
