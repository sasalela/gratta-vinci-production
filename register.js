const TOKEN_KEY = 'gv_store_token';
const USER_KEY = 'gv_store_user';

const form = document.getElementById('registerForm');
const registerBtn = document.getElementById('registerBtn');
const errorBox = document.getElementById('errorBox');
const successBox = document.getElementById('successBox');
const storeName = document.getElementById('storeName');
const storeSlug = document.getElementById('storeSlug');
const ownerName = document.getElementById('ownerName');
const email = document.getElementById('email');
const password = document.getElementById('password');
const phone = document.getElementById('phone');
const address = document.getElementById('address');
const logoUrl = document.getElementById('logoUrl');
const primaryColor = document.getElementById('primaryColor');
const secondaryColor = document.getElementById('secondaryColor');
const termsAccepted = document.getElementById('termsAccepted');

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

    sessionStorage.setItem(TOKEN_KEY, payload.data.token);
    sessionStorage.setItem(USER_KEY, JSON.stringify(payload.data.user));
    showSuccess(`Account creato. Trial attivo per ${payload.data.trialDays} giorni.`);
    setTimeout(() => {
      window.location.href = '/store.html';
    }, 900);
  } catch (error) {
    showError(error.message);
  } finally {
    registerBtn.disabled = false;
    registerBtn.textContent = 'Crea account negozio';
  }
}

storeName.addEventListener('input', () => {
  storeSlug.value = slugify(storeName.value);
});

form.addEventListener('submit', registerStore);
