const form = document.getElementById('registerForm');
const registerBtn = document.getElementById('registerBtn');
const errorBox = document.getElementById('errorBox');
const successBox = document.getElementById('successBox');
const storeName = document.getElementById('storeName');
const storeSlug = document.getElementById('storeSlug');
const businessType = document.getElementById('businessType');
const ownerName = document.getElementById('ownerName');
const email = document.getElementById('email');
const password = document.getElementById('password');
const phone = document.getElementById('phone');
const address = document.getElementById('address');
const logoUrl = document.getElementById('logoUrl');
const logoFile = document.getElementById('logoFile');
const primaryColor = document.getElementById('primaryColor');
const secondaryColor = document.getElementById('secondaryColor');
const termsAccepted = document.getElementById('termsAccepted');
const resendBtn = document.getElementById('resendBtn');

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
  canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  let quality = 0.88;
  let dataUrl = canvas.toDataURL('image/jpeg', quality);
  while (dataUrl.length > maxBytes * 1.37 && quality > 0.4) {
    quality -= 0.08;
    dataUrl = canvas.toDataURL('image/jpeg', quality);
  }
  if (dataUrl.length > maxBytes * 1.37) {
    throw new Error('Il logo resta troppo grande anche dopo la compressione.');
  }
  return dataUrl;
}

if (logoFile) {
  logoFile.addEventListener('change', async () => {
    const file = logoFile.files?.[0];
    if (!file) return;
    try {
      logoUrl.value = await resizeLogoFile(file);
    } catch (error) {
      showError(error.message);
    }
  });
}

function show(el) {
  el.classList.remove('hidden');
}

function hide(el) {
  el.classList.add('hidden');
}

function slugify(value) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function showError(message) {
  errorBox.textContent = message;
  show(errorBox);
  hide(successBox);
}

function showSuccess(message) {
  successBox.textContent = message;
  show(successBox);
  hide(errorBox);
}

async function registerStore(event) {
  event.preventDefault();
  hide(errorBox);
  hide(successBox);

  if (!termsAccepted.checked) {
    showError('Accetta termini e privacy per continuare.');
    return;
  }

  registerBtn.disabled = true;
  registerBtn.textContent = 'Creo account...';

  try {
    const response = await fetch('/api/auth/register-store', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        storeName: storeName.value.trim(),
        storeSlug: storeSlug.value.trim(),
        businessType: businessType.value,
        ownerName: ownerName.value.trim(),
        email: email.value.trim(),
        password: password.value,
        phone: phone.value.trim(),
        address: address.value.trim(),
        logoUrl: logoUrl.value.trim(),
        primaryColor: primaryColor.value,
        secondaryColor: secondaryColor.value,
        termsAccepted: termsAccepted.checked
      })
    });
    const payload = await response.json().catch(() => ({}));

    if (!response.ok || !payload.success) {
      const validation = Array.isArray(payload.errors)
        ? payload.errors.map((error) => error.message || error).join(', ')
        : '';
      throw new Error(validation || payload.error || 'Registrazione non riuscita.');
    }

    showSuccess(payload.data.message || 'Controlla la email per confermare l’account.');
    if (resendBtn) show(resendBtn);
  } catch (error) {
    showError(error.message);
  } finally {
    registerBtn.disabled = false;
    registerBtn.textContent = 'Crea account negozio';
  }
}

async function resendVerification() {
  hide(errorBox);
  resendBtn.disabled = true;
  try {
    const response = await fetch('/api/auth/resend-verification', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.value.trim() })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.success) {
      throw new Error(payload.error || 'Invio non riuscito. Riprova tra poco.');
    }
    showSuccess(payload.data?.message || 'Se l’account non è ancora confermato, controlla la posta.');
  } catch (error) {
    showError(error.message);
  } finally {
    resendBtn.disabled = false;
  }
}

async function confirmEmail(token) {
  hide(errorBox);
  registerBtn.disabled = true;
  try {
    const response = await fetch('/api/auth/verify-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.success) {
      throw new Error(payload.error || 'Link di conferma non valido o scaduto.');
    }
    showSuccess(payload.data?.message || 'Email confermata. Ora puoi accedere.');
    window.history.replaceState({}, '', '/register.html');
  } catch (error) {
    showError(error.message);
  } finally {
    registerBtn.disabled = false;
  }
}

storeName.addEventListener('input', () => {
  storeSlug.value = slugify(storeName.value);
});

form.addEventListener('submit', registerStore);
if (resendBtn) resendBtn.addEventListener('click', resendVerification);

const verifyToken = new URLSearchParams(window.location.search).get('verify');
if (verifyToken) {
  confirmEmail(verifyToken);
}
