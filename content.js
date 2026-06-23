// ─── Format registry ──────────────────────────────────────────────────────────

const FORMAT_SIZES = {
  // Print
  a4:       { width: 1240, height: 1754, label: 'A4 Volantino',         family: 'print'    },
  // Social
  facebook: { width: 1200, height: 630,  label: 'Facebook Feed',        family: 'facebook' },
  square:   { width: 1080, height: 1080, label: 'Quadrato Feed',         family: 'social'   },
  vertical: { width: 1080, height: 1920, label: '9:16 Story post',       family: 'social'   },
  story:    { width: 1080, height: 1920, label: 'Story sequenza',        family: 'story'    },
  // LED
  led_h:    { width: 1920, height: 576,  label: 'LED orizzontale',       family: 'led'      },
  led_v:    { width: 576,  height: 1024, label: 'LED verticale',         family: 'led'      },
  led_sq:   { width: 800,  height: 800,  label: 'LED quadrato',          family: 'led'      },
  // LCD
  '16x9':   { width: 1920, height: 1080, label: 'LCD 16:9 orizzontale',  family: 'lcd'      },
  '4x3':    { width: 1600, height: 1200, label: 'LCD 4:3 orizzontale',   family: 'lcd'      },
  lcd_v:    { width: 1080, height: 1920, label: 'LCD verticale',         family: 'lcd'      },
};

const STORY_FRAMES = [
  { key: 'hook',   label: '1 — Hook · Apertura'       },
  { key: 'premio', label: '2 — Premio · Il vantaggio'  },
  { key: 'come',   label: '3 — Come funziona'          },
  { key: 'cta',    label: '4 — CTA forte'              },
  { key: 'qr',     label: '5 — QR · Finale'            },
];

const FONT = "'Helvetica Neue', Helvetica, Arial, sans-serif";

// ─── DOM refs ─────────────────────────────────────────────────────────────────

const contentApp          = document.getElementById('contentApp');
const loginHint           = document.getElementById('loginHint');
const errorBox            = document.getElementById('errorBox');
const successBox          = document.getElementById('successBox');
const storeLabel          = document.getElementById('storeLabel');
const campaignSelect      = document.getElementById('campaignSelect');
const formatPreviewSelect = document.getElementById('formatPreviewSelect');
const headlineInput       = document.getElementById('headlineInput');
const subtitleInput       = document.getElementById('subtitleInput');
const ctaInput            = document.getElementById('ctaInput');
const renderBtn           = document.getElementById('renderBtn');
const promoCanvas         = document.getElementById('promoCanvas');
const playUrlLabel        = document.getElementById('playUrlLabel');
const storyNav            = document.getElementById('storyNav');
const storyFrameLabel     = document.getElementById('storyFrameLabel');

const state = {
  store: null,
  campaigns: [],
  storyFrame: 0,
  lastRenderedFormat: 'a4'
};

// ─── UI helpers ───────────────────────────────────────────────────────────────

function show(el) { el.classList.remove('hidden'); }
function hide(el) { el.classList.add('hidden'); }

function setError(msg) {
  errorBox.textContent = msg;
  show(errorBox);
}

function clearMessages() {
  errorBox.textContent = '';
  successBox.textContent = '';
  hide(errorBox);
  hide(successBox);
}

function showSuccess(msg) {
  successBox.textContent = msg;
  show(successBox);
  setTimeout(() => hide(successBox), 3500);
}

function updateStoryNav(fmt) {
  if (fmt === 'story') {
    show(storyNav);
    storyFrameLabel.textContent = STORY_FRAMES[state.storyFrame].label;
  } else {
    hide(storyNav);
  }
}

// ─── API ──────────────────────────────────────────────────────────────────────

async function api(path) {
  const res = await fetch(path);
  const payload = await res.json().catch(() => ({}));
  if (!res.ok || !payload.success) {
    throw new Error(payload.error || payload.message || `Errore API (${res.status})`);
  }
  return payload.data;
}

// ─── Data helpers ─────────────────────────────────────────────────────────────

function getSelectedCampaign() {
  return state.campaigns.find((c) => c.id === campaignSelect.value);
}

function getPlayUrl(campaign) {
  return `${window.location.origin}/?store=${state.store.slug}&campaign=${campaign.slug}`;
}

function getMainPrize(campaign) {
  const prizes = campaign.prizeItems || [];
  const valid = prizes.filter(
    (p) => p.active === true && p.totalQuantity > 0 && p.winProbability > 0
  );
  if (!valid.length) return null;
  return valid.sort((a, b) => {
    if (a.winProbability !== b.winProbability) return a.winProbability - b.winProbability;
    return a.totalQuantity - b.totalQuantity;
  })[0];
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

function getSelectedFormatKeys() {
  return Array.from(
    document.querySelectorAll('.channel-formats input[type="checkbox"]:checked[data-format]')
  ).map((el) => el.dataset.format);
}

// ─── Canvas text helpers ──────────────────────────────────────────────────────

function wrapTextLines(ctx, text, maxWidth, maxLines) {
  const words = String(text || '').trim().split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
      if (maxLines && lines.length === maxLines) break;
    } else {
      line = test;
    }
  }
  if (line && (!maxLines || lines.length < maxLines)) lines.push(line);
  return lines;
}

function drawTextBlock(ctx, options) {
  const {
    text, x, y, maxWidth, maxHeight, startSize, minSize,
    weight, color, maxLines, lineRatio = 1.18, align = 'center'
  } = options;
  let size = startSize;
  let lines = [];
  let lineHeight = 0;
  do {
    ctx.font = `${weight} ${size}px ${FONT}`;
    lines = wrapTextLines(ctx, text, maxWidth, maxLines);
    lineHeight = Math.round(size * lineRatio);
    if (lines.length * lineHeight <= maxHeight) break;
    size -= 2;
  } while (size > minSize);
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'top';
  lineHeight = Math.round(size * lineRatio);
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], x, y + i * lineHeight);
  }
  ctx.textBaseline = 'alphabetic';
  return y + lines.length * lineHeight;
}

function roundedRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function storeInitials(name) {
  return String(name || 'GV')
    .split(/\s+/).filter(Boolean).slice(0, 2)
    .map((p) => p[0].toUpperCase()).join('');
}

// ─── Drawing primitives ───────────────────────────────────────────────────────

function hexToRgba(hex, alpha) {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function drawInitialLogo(ctx, x, y, size, color) {
  roundedRect(ctx, x, y, size, size, 22);
  ctx.fillStyle = '#fff';
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(4, size * 0.06);
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.font = `900 ${Math.round(size * 0.38)}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(storeInitials(state.store.name), x + size / 2, y + size / 2);
  ctx.textBaseline = 'alphabetic';
}

function drawLogo(ctx, logoImage, x, y, size, primary, radius = 16) {
  if (logoImage) {
    roundedRect(ctx, x, y, size, size, radius);
    ctx.save();
    ctx.clip();
    ctx.drawImage(logoImage, x, y, size, size);
    ctx.restore();
  } else {
    drawInitialLogo(ctx, x, y, size, primary);
  }
}

function drawCtaButton(ctx, text, cx, y, maxWidth, btnH, primary, secondary) {
  ctx.font = `900 ${Math.round(btnH * 0.44)}px ${FONT}`;
  const btnW = Math.min(ctx.measureText(text).width + Math.round(btnH * 1.8), maxWidth);
  const bx = cx - btnW / 2;
  roundedRect(ctx, bx, y, btnW, btnH, btnH / 2);
  const g = ctx.createLinearGradient(bx, y, bx + btnW, y);
  g.addColorStop(0, primary);
  g.addColorStop(1, secondary);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, cx, y + btnH / 2);
  ctx.textBaseline = 'alphabetic';
  return y + btnH;
}

function drawQrBlock(ctx, qrImage, cx, y, qrSize, pad, radius = 14, bgColor = '#f8fafc') {
  const bx = cx - qrSize / 2 - pad;
  roundedRect(ctx, bx, y - pad, qrSize + pad * 2, qrSize + pad * 2, radius);
  ctx.fillStyle = bgColor;
  ctx.fill();
  if (bgColor !== '#ffffff') {
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  ctx.drawImage(qrImage, cx - qrSize / 2, y, qrSize, qrSize);
  return y + qrSize + pad;
}

function drawPrizePill(ctx, text, cx, y, maxWidth, primary, secondary) {
  const pSz = Math.round(maxWidth * 0.044);
  ctx.font = `800 ${pSz}px ${FONT}`;
  const pillW = Math.min(ctx.measureText(text).width + pSz * 1.6, maxWidth);
  const pillH = Math.round(pSz * 1.75);
  const px = cx - pillW / 2;
  roundedRect(ctx, px, y, pillW, pillH, pillH / 2);
  const g = ctx.createLinearGradient(px, y, px + pillW, y);
  g.addColorStop(0, primary);
  g.addColorStop(1, secondary);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, cx, y + pillH / 2);
  ctx.textBaseline = 'alphabetic';
  return y + pillH;
}

// Small step circle for "come funziona" frame
function drawStepCircle(ctx, cx, cy, r, num, primary) {
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  const g = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, 0, cx, cy, r);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(1, primary);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.fillStyle = primary;
  ctx.font = `900 ${Math.round(r * 1.1)}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(num), cx, cy + 1);
  ctx.textBaseline = 'alphabetic';
}

// ─── PRINT renderer — Volantino A4 (1240×1754) ────────────────────────────────
// Zone layout: header band → hero headline → prize band → QR section → footer

function renderPrint(ctx, canvas, qrImage, data) {
  const W = canvas.width, H = canvas.height;
  const { primary, secondary, headline, subtitle, cta, prizeText,
    storeName, campaignName, expiresText, logoImage } = data;
  const cx = W / 2;

  const z = {
    headerEnd:  Math.round(H * 0.115),   // 202px
    heroEnd:    Math.round(H * 0.43),    // 754px
    prizeEnd:   Math.round(H * 0.61),    // 1070px
    qrEnd:      Math.round(H * 0.915),   // 1605px
    // footer: qrEnd → H
  };

  // ── ZONE 1: HEADER BAND (brand gradient) ──────────────────────────────────
  const hg = ctx.createLinearGradient(0, 0, W, z.headerEnd);
  hg.addColorStop(0, primary);
  hg.addColorStop(1, secondary);
  ctx.fillStyle = hg;
  ctx.fillRect(0, 0, W, z.headerEnd);

  // decorative circles in header
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  [[0.88, 0.5, 120], [0.06, 0.5, 90]].forEach(([rx, ry, r]) => {
    ctx.beginPath();
    ctx.arc(W * rx, z.headerEnd * ry, r, 0, Math.PI * 2);
    ctx.fill();
  });

  // Logo in header (left-ish, vertically centered)
  const hLSz = Math.round(z.headerEnd * 0.6);
  const hLY  = (z.headerEnd - hLSz) / 2;
  const hLX  = Math.round(W * 0.07);
  drawLogo(ctx, logoImage, hLX, hLY, hLSz, '#ffffff', 12);

  // Store name next to logo
  ctx.font = `700 ${Math.round(z.headerEnd * 0.19)}px ${FONT}`;
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const snMaxW = W - hLX - hLSz - 20 - Math.round(W * 0.07);
  const snTxt = storeName.length > 28 ? storeName.slice(0, 27) + '…' : storeName;
  ctx.fillText(snTxt, hLX + hLSz + 20, z.headerEnd / 2);
  ctx.textBaseline = 'alphabetic';

  // ── ZONE 2: HERO SECTION (white, headline + campaign badge) ───────────────
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, z.headerEnd, W, z.heroEnd - z.headerEnd);

  // Subtle diagonal decoration lines
  ctx.strokeStyle = hexToRgba(primary, 0.05);
  ctx.lineWidth = 40;
  for (let i = -2; i < 5; i++) {
    ctx.beginPath();
    ctx.moveTo(W * i * 0.22, z.headerEnd);
    ctx.lineTo(W * i * 0.22 + W * 0.18, z.heroEnd);
    ctx.stroke();
  }

  let hy = z.headerEnd + Math.round((z.heroEnd - z.headerEnd) * 0.1);

  // Campaign badge
  if (campaignName) {
    ctx.font = `700 ${Math.round(W * 0.022)}px ${FONT}`;
    const cBadgeText = campaignName.length > 38 ? campaignName.slice(0, 37) + '…' : campaignName;
    const cbW = Math.min(ctx.measureText(cBadgeText).width + 52, W * 0.72);
    const cbH = Math.round(W * 0.032);
    roundedRect(ctx, cx - cbW / 2, hy, cbW, cbH, cbH / 2);
    ctx.fillStyle = hexToRgba(secondary, 0.12);
    ctx.fill();
    ctx.strokeStyle = hexToRgba(secondary, 0.28);
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = secondary;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(cBadgeText, cx, hy + cbH / 2);
    hy += cbH + Math.round((z.heroEnd - z.headerEnd) * 0.06);
    ctx.textBaseline = 'top';
  }

  // Headline — very large
  hy = drawTextBlock(ctx, {
    text: headline, x: cx, y: hy,
    maxWidth: W * 0.84,
    maxHeight: Math.round((z.heroEnd - z.headerEnd) * 0.55),
    startSize: Math.round(W * 0.088), minSize: 42,
    weight: 900, color: '#0f172a', maxLines: 2, lineRatio: 1.08
  });
  hy += 18;

  // Subtitle if present
  if (subtitle) {
    drawTextBlock(ctx, {
      text: subtitle, x: cx, y: hy,
      maxWidth: W * 0.7,
      maxHeight: Math.round((z.heroEnd - z.headerEnd) * 0.15),
      startSize: Math.round(W * 0.024), minSize: 18,
      weight: 400, color: '#64748b', maxLines: 2, lineRatio: 1.5
    });
  }

  // ── ZONE 3: PRIZE BAND (brand primary, prize name big) ────────────────────
  // Background
  const pg = ctx.createLinearGradient(0, z.heroEnd, W, z.prizeEnd);
  pg.addColorStop(0, primary);
  pg.addColorStop(1, secondary);
  ctx.fillStyle = pg;
  ctx.fillRect(0, z.heroEnd, W, z.prizeEnd - z.heroEnd);

  // Texture dots
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  for (let i = 0; i < 6; i++) {
    ctx.beginPath();
    ctx.arc(W * (0.12 + i * 0.16), z.heroEnd + (z.prizeEnd - z.heroEnd) / 2, 55, 0, Math.PI * 2);
    ctx.fill();
  }

  // "VINCI SUBITO" label
  const pBandH = z.prizeEnd - z.heroEnd;
  ctx.font = `800 ${Math.round(W * 0.026)}px ${FONT}`;
  ctx.fillStyle = 'rgba(255,255,255,0.72)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText('VINCI SUBITO', cx, z.heroEnd + Math.round(pBandH * 0.08));

  // Prize text — HUGE white
  if (prizeText) {
    drawTextBlock(ctx, {
      text: prizeText, x: cx, y: z.heroEnd + Math.round(pBandH * 0.22),
      maxWidth: W * 0.88,
      maxHeight: Math.round(pBandH * 0.6),
      startSize: Math.round(W * 0.072), minSize: 38,
      weight: 900, color: '#ffffff', maxLines: 2, lineRatio: 1.1
    });
  } else {
    ctx.font = `900 ${Math.round(W * 0.054)}px ${FONT}`;
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Partecipa al gioco', cx, z.heroEnd + pBandH / 2);
    ctx.textBaseline = 'alphabetic';
  }

  // Stars decoration ★
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.font = `${Math.round(W * 0.028)}px ${FONT}`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillText('★', W * 0.05, z.heroEnd + pBandH / 2);
  ctx.textAlign = 'right';
  ctx.fillText('★', W * 0.95, z.heroEnd + pBandH / 2);
  ctx.textBaseline = 'alphabetic';

  // ── ZONE 4: QR SECTION (white) ────────────────────────────────────────────
  ctx.fillStyle = '#fafbff';
  ctx.fillRect(0, z.prizeEnd, W, z.qrEnd - z.prizeEnd);

  // Thin brand top accent line
  ctx.fillStyle = primary;
  ctx.fillRect(W * 0.06, z.prizeEnd, W * 0.88, 3);

  const qrSecH   = z.qrEnd - z.prizeEnd;
  const qrSz     = Math.round(Math.min(W * 0.36, qrSecH * 0.52));
  const qrPad    = Math.round(qrSz * 0.065);
  const ctaBtnH  = Math.round(W * 0.052);
  const qrLabelH = Math.round(W * 0.026);
  const totalQrH = qrLabelH + 16 + qrSz + qrPad * 2 + 16 + ctaBtnH;
  const qrStartY = z.prizeEnd + (qrSecH - totalQrH) / 2;

  // "Scansiona il codice QR e gioca" label
  ctx.font = `700 ${qrLabelH}px ${FONT}`;
  ctx.fillStyle = '#475569';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText('Scansiona il QR code e partecipa', cx, qrStartY);

  drawQrBlock(ctx, qrImage, cx, qrStartY + qrLabelH + 16, qrSz, qrPad, Math.round(W * 0.02));
  drawCtaButton(ctx, cta, cx, qrStartY + qrLabelH + 16 + qrSz + qrPad * 2 + 18, W * 0.58, ctaBtnH, primary, secondary);

  // ── ZONE 5: FOOTER (dark) ─────────────────────────────────────────────────
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, z.qrEnd, W, H - z.qrEnd);

  const footerCy = z.qrEnd + (H - z.qrEnd) / 2;
  if (expiresText) {
    ctx.font = `500 ${Math.round(W * 0.018)}px ${FONT}`;
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(expiresText, cx, footerCy - 12);
  }
  ctx.font = `700 ${Math.round(W * 0.018)}px ${FONT}`;
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(storeName, cx, footerCy + (expiresText ? 12 : 0));
  ctx.textBaseline = 'alphabetic';
}

// ─── FACEBOOK FEED renderer (1200×630) ────────────────────────────────────────
// Horizontal two-zone: left gradient content / right white QR+CTA

function renderFacebook(ctx, canvas, qrImage, data) {
  const W = canvas.width, H = canvas.height;
  const { primary, secondary, headline, subtitle, cta, prizeText,
    storeName, campaignName, expiresText, logoImage } = data;

  const split = Math.round(W * 0.58);   // content | QR split
  const pad   = Math.round(H * 0.1);

  // ── LEFT PANEL: brand gradient ────────────────────────────────────────────
  const lg = ctx.createLinearGradient(0, 0, split, H);
  lg.addColorStop(0, primary);
  lg.addColorStop(1, secondary);
  ctx.fillStyle = lg;
  ctx.fillRect(0, 0, split, H);

  // Decorative orb
  ctx.fillStyle = 'rgba(255,255,255,0.07)';
  ctx.beginPath();
  ctx.arc(split * 0.1, H * 0.85, 200, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(split * 0.85, H * 0.12, 150, 0, Math.PI * 2);
  ctx.fill();

  const lCx = split / 2;

  // Logo + store name in top-left
  const lSz = Math.round(H * 0.18);
  const lY  = pad;
  drawLogo(ctx, logoImage, pad, lY, lSz, '#ffffff', 10);

  ctx.font = `700 ${Math.round(H * 0.065)}px ${FONT}`;
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const snTxt = storeName.length > 20 ? storeName.slice(0, 19) + '…' : storeName;
  ctx.fillText(snTxt, pad + lSz + 14, lY + lSz / 2);
  ctx.textBaseline = 'alphabetic';

  // Divider
  ctx.strokeStyle = 'rgba(255,255,255,0.2)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(pad, lY + lSz + 16); ctx.lineTo(split - pad, lY + lSz + 16);
  ctx.stroke();

  // Campaign eyebrow
  const eyebrowY = lY + lSz + 28;
  if (campaignName) {
    ctx.font = `600 ${Math.round(H * 0.044)}px ${FONT}`;
    ctx.fillStyle = 'rgba(255,255,255,0.72)';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    const eTxt = campaignName.length > 30 ? campaignName.slice(0, 29) + '…' : campaignName;
    ctx.fillText(eTxt, pad, eyebrowY);
  }

  // Headline — BIG
  const hlY = eyebrowY + (campaignName ? Math.round(H * 0.07) : 0);
  drawTextBlock(ctx, {
    text: headline, x: pad, y: hlY,
    maxWidth: split - pad * 2,
    maxHeight: Math.round(H * 0.32),
    startSize: Math.round(H * 0.14), minSize: Math.round(H * 0.08),
    weight: 900, color: '#ffffff', maxLines: 2, lineRatio: 1.08, align: 'left'
  });

  // Prize pill at bottom of left panel
  if (prizeText) {
    ctx.font = `800 ${Math.round(H * 0.056)}px ${FONT}`;
    const pW = Math.min(ctx.measureText(prizeText).width + 50, split - pad * 2);
    const pH = Math.round(H * 0.1);
    roundedRect(ctx, pad, H - pad - pH, pW, pH, pH / 2);
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(prizeText, pad + 20, H - pad - pH / 2);
    ctx.textBaseline = 'alphabetic';
  }

  // ── RIGHT PANEL: white, QR + CTA ─────────────────────────────────────────
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(split, 0, W - split, H);

  // Accent left border
  ctx.fillStyle = primary;
  ctx.fillRect(split, 0, 4, H);

  const rCx    = split + (W - split) / 2;
  const rH     = H - pad * 2;
  const ctaH   = Math.round(H * 0.13);
  const qrSz   = Math.min(Math.round(rH * 0.54), Math.round((W - split) * 0.68));
  const qrPad  = Math.round(qrSz * 0.07);
  const totalH = qrSz + qrPad * 2 + 20 + ctaH;
  const qrY    = pad + (rH - totalH) / 2;

  drawQrBlock(ctx, qrImage, rCx, qrY, qrSz, qrPad, Math.round(qrSz * 0.07));
  drawCtaButton(ctx, cta, rCx, qrY + qrSz + qrPad * 2 + 20, (W - split) * 0.76, ctaH, primary, secondary);

  if (expiresText) {
    ctx.font = `400 ${Math.round(H * 0.038)}px ${FONT}`;
    ctx.fillStyle = '#94a3b8';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(expiresText, rCx, H - Math.round(pad * 0.5));
    ctx.textBaseline = 'alphabetic';
  }
}

// ─── SOCIAL renderer (9:16 + square) ─────────────────────────────────────────

function renderSocial(ctx, canvas, qrImage, data) {
  const W = canvas.width, H = canvas.height;
  const isSquare = W === H;
  const { primary, secondary, headline, cta, prizeText,
    storeName, campaignName, expiresText, logoImage } = data;
  const cx = W / 2;

  // Full-bleed diagonal gradient
  const bg = ctx.createLinearGradient(0, 0, W * 0.4, H);
  bg.addColorStop(0, primary);
  bg.addColorStop(0.6, secondary);
  bg.addColorStop(1, primary);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  [[0.88, 0.06, 210], [0.06, 0.44, 250], [0.9, 0.65, 180], [0.1, 0.96, 210]].forEach(([rx, ry, r]) => {
    ctx.beginPath(); ctx.arc(W * rx, H * ry, r, 0, Math.PI * 2); ctx.fill();
  });
  ctx.fillStyle = 'rgba(255,255,255,0.028)';
  ctx.beginPath(); ctx.arc(cx, H * 0.5, W * 0.6, 0, Math.PI * 2); ctx.fill();

  if (isSquare) {
    const lSz = Math.round(W * 0.13);
    let y = Math.round(H * 0.06);
    ctx.beginPath(); ctx.arc(cx, y + lSz / 2, lSz / 2 + 14, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.fill();
    drawLogo(ctx, logoImage, cx - lSz / 2, y, lSz, primary, lSz / 2);
    y += lSz + 12;
    ctx.font = `600 22px ${FONT}`; ctx.fillStyle = 'rgba(255,255,255,0.88)';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText(storeName.length > 20 ? storeName.slice(0, 19) + '…' : storeName, cx, y);
    y += 34;
    ctx.strokeStyle = 'rgba(255,255,255,0.2)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(W * 0.2, y); ctx.lineTo(W * 0.8, y); ctx.stroke();
    y += Math.round(H * 0.038);

    if (campaignName) {
      const ewText = campaignName.length > 22 ? campaignName.slice(0, 21) + '…' : campaignName;
      ctx.font = `700 ${Math.round(W * 0.032)}px ${FONT}`;
      const ewW = Math.min(ctx.measureText(ewText).width + 36, W * 0.76);
      const ewH = Math.round(W * 0.042);
      roundedRect(ctx, cx - ewW / 2, y, ewW, ewH, ewH / 2);
      ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(ewText, cx, y + ewH / 2);
      y += ewH + Math.round(H * 0.025); ctx.textBaseline = 'top';
    }

    y = drawTextBlock(ctx, {
      text: headline, x: cx, y, maxWidth: W * 0.84, maxHeight: Math.round(H * 0.24),
      startSize: Math.round(W * 0.1), minSize: 48, weight: 900, color: '#ffffff', maxLines: 2, lineRatio: 1.08
    });
    y += Math.round(H * 0.022);

    if (prizeText) {
      ctx.font = `800 ${Math.round(W * 0.042)}px ${FONT}`; ctx.fillStyle = 'rgba(255,255,255,0.94)';
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillText(prizeText.length > 22 ? prizeText.slice(0, 21) + '…' : prizeText, cx, y);
      y += Math.round(W * 0.058);
    }

    const qrSz = Math.round(W * 0.24), qrPad = Math.round(W * 0.038), ctaH = Math.round(W * 0.05);
    const qrCardH = qrPad + qrSz + qrPad * 0.55 + ctaH + qrPad * 0.7;
    const qrCardW = qrSz + qrPad * 3.4;
    const qrCardY = H - Math.round(H * 0.066) - qrCardH;
    roundedRect(ctx, cx - qrCardW / 2, qrCardY, qrCardW, qrCardH, Math.round(W * 0.04));
    ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.fill();
    ctx.drawImage(qrImage, cx - qrSz / 2, qrCardY + qrPad, qrSz, qrSz);
    ctx.font = `900 ${Math.round(W * 0.034)}px ${FONT}`; ctx.fillStyle = primary;
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText(cta, cx, qrCardY + qrPad + qrSz + Math.round(qrPad * 0.46));
    ctx.textBaseline = 'alphabetic';

  } else {
    // VERTICAL 9:16
    let y = Math.round(H * 0.062);
    const lSz = Math.round(W * 0.14);
    ctx.beginPath(); ctx.arc(cx, y + lSz / 2, lSz / 2 + 12, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fill();
    drawLogo(ctx, logoImage, cx - lSz / 2, y, lSz, primary, lSz / 2);
    y += lSz + 14;
    ctx.font = `600 24px ${FONT}`; ctx.fillStyle = 'rgba(255,255,255,0.88)';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText(storeName.length > 22 ? storeName.slice(0, 21) + '…' : storeName, cx, y);
    y += 36;
    ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(W * 0.22, y); ctx.lineTo(W * 0.78, y); ctx.stroke();
    y += Math.round(H * 0.038);

    if (campaignName) {
      const ewText = campaignName.length > 26 ? campaignName.slice(0, 25) + '…' : campaignName;
      ctx.font = `700 ${Math.round(W * 0.034)}px ${FONT}`;
      const ewW = Math.min(ctx.measureText(ewText).width + 40, W * 0.78);
      const ewH = Math.round(W * 0.048);
      roundedRect(ctx, cx - ewW / 2, y, ewW, ewH, ewH / 2);
      ctx.fillStyle = 'rgba(255,255,255,0.16)'; ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.32)'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(ewText, cx, y + ewH / 2);
      y += ewH + Math.round(H * 0.024); ctx.textBaseline = 'top';
    }

    y = drawTextBlock(ctx, {
      text: headline, x: cx, y, maxWidth: W * 0.84, maxHeight: Math.round(H * 0.22),
      startSize: Math.round(W * 0.113), minSize: 52, weight: 900, color: '#ffffff', maxLines: 3, lineRatio: 1.08
    });
    y += Math.round(H * 0.024);

    if (prizeText) {
      ctx.font = `800 ${Math.round(W * 0.042)}px ${FONT}`;
      const pW = Math.min(ctx.measureText(prizeText).width + 58, W * 0.84);
      const pH = Math.round(W * 0.078);
      roundedRect(ctx, cx - pW / 2, y, pW, pH, pH / 2);
      ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.44)'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(prizeText, cx, y + pH / 2);
      ctx.textBaseline = 'alphabetic';
      y += pH + 10;
    }

    const qrSz = Math.round(W * 0.28), qrPad = Math.round(W * 0.05), ctaH = Math.round(W * 0.05);
    const qrCardW = W * 0.72;
    const qrCardH = qrPad + qrSz + Math.round(qrPad * 0.48) + ctaH + qrPad;
    const qrCardY = H - Math.round(H * 0.052) - qrCardH;
    roundedRect(ctx, cx - qrCardW / 2, qrCardY, qrCardW, qrCardH, Math.round(W * 0.04));
    ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.fill();
    ctx.drawImage(qrImage, cx - qrSz / 2, qrCardY + qrPad, qrSz, qrSz);
    ctx.font = `900 ${Math.round(W * 0.038)}px ${FONT}`; ctx.fillStyle = primary;
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText(cta, cx, qrCardY + qrPad + qrSz + Math.round(qrPad * 0.42));
    ctx.textBaseline = 'alphabetic';

    if (expiresText) {
      ctx.font = `400 ${Math.round(W * 0.018)}px ${FONT}`; ctx.fillStyle = 'rgba(255,255,255,0.52)';
      ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.fillText(expiresText, cx, H - Math.round(H * 0.018));
      ctx.textBaseline = 'alphabetic';
    }
  }
}

// ─── STORY SEQUENCE renderer (5 frames, 1080×1920) ────────────────────────────
// Frame 0: Hook  |  1: Premio  |  2: Come funziona  |  3: CTA forte  |  4: QR

function renderStoryHook(ctx, canvas, qrImage, data) {
  const W = canvas.width, H = canvas.height;
  const { primary, secondary, headline, storeName, campaignName, logoImage } = data;
  const cx = W / 2;

  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, primary); bg.addColorStop(0.65, secondary); bg.addColorStop(1, primary);
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = 'rgba(255,255,255,0.055)';
  [[0.85, 0.1, 240], [0.08, 0.5, 280], [0.9, 0.72, 200]].forEach(([rx, ry, r]) => {
    ctx.beginPath(); ctx.arc(W * rx, H * ry, r, 0, Math.PI * 2); ctx.fill();
  });
  ctx.fillStyle = 'rgba(255,255,255,0.03)';
  ctx.beginPath(); ctx.arc(cx, H * 0.45, W * 0.62, 0, Math.PI * 2); ctx.fill();

  // Logo — centered, large halo
  const lSz = Math.round(W * 0.32);
  let y = Math.round(H * 0.1);
  ctx.beginPath(); ctx.arc(cx, y + lSz / 2, lSz / 2 + 28, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.14)'; ctx.fill();
  ctx.beginPath(); ctx.arc(cx, y + lSz / 2, lSz / 2 + 10, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.22)'; ctx.fill();
  drawLogo(ctx, logoImage, cx - lSz / 2, y, lSz, '#ffffff', lSz / 2);
  y += lSz + 18;

  ctx.font = `700 ${Math.round(W * 0.052)}px ${FONT}`; ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.fillText(storeName.length > 20 ? storeName.slice(0, 19) + '…' : storeName, cx, y);
  y += Math.round(W * 0.072);

  ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(W * 0.2, y); ctx.lineTo(W * 0.8, y); ctx.stroke();
  y += Math.round(H * 0.045);

  if (campaignName) {
    ctx.font = `700 ${Math.round(W * 0.036)}px ${FONT}`; ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText(campaignName.length > 28 ? campaignName.slice(0, 27) + '…' : campaignName, cx, y);
    y += Math.round(W * 0.054);
  }

  y = drawTextBlock(ctx, {
    text: headline, x: cx, y, maxWidth: W * 0.84, maxHeight: Math.round(H * 0.26),
    startSize: Math.round(W * 0.12), minSize: 52, weight: 900, color: '#ffffff', maxLines: 3, lineRatio: 1.08
  });

  // "Scopri →" hint at bottom
  ctx.font = `600 ${Math.round(W * 0.038)}px ${FONT}`; ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
  ctx.fillText('Scopri di più  ↓', cx, H - Math.round(H * 0.055));
  ctx.textBaseline = 'alphabetic';

  // Frame dots
  drawStoryDots(ctx, W, H, 0, 5, primary);
}

function renderStoryPrize(ctx, canvas, _qrImage, data) {
  const W = canvas.width, H = canvas.height;
  const { primary, secondary, prizeText, storeName, logoImage } = data;
  const cx = W / 2;

  ctx.fillStyle = '#080d18'; ctx.fillRect(0, 0, W, H);
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, hexToRgba(primary, 0.18)); bg.addColorStop(1, hexToRgba(secondary, 0.08));
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

  // Top accent bar
  const tbH = Math.round(H * 0.007);
  const tbG = ctx.createLinearGradient(0, 0, W, 0);
  tbG.addColorStop(0, primary); tbG.addColorStop(1, secondary);
  ctx.fillStyle = tbG; ctx.fillRect(0, 0, W, tbH);

  let y = Math.round(H * 0.08);

  ctx.font = `700 ${Math.round(W * 0.038)}px ${FONT}`; ctx.fillStyle = hexToRgba(primary, 0.85);
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.fillText('IL TUO PREMIO', cx, y);
  y += Math.round(W * 0.06);

  ctx.strokeStyle = hexToRgba(primary, 0.4); ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(W * 0.18, y); ctx.lineTo(W * 0.82, y); ctx.stroke();
  y += Math.round(H * 0.05);

  // Prize text — ENORMOUS
  if (prizeText) {
    y = drawTextBlock(ctx, {
      text: prizeText, x: cx, y, maxWidth: W * 0.88, maxHeight: Math.round(H * 0.32),
      startSize: Math.round(W * 0.15), minSize: Math.round(W * 0.09),
      weight: 900, color: '#ffffff', maxLines: 2, lineRatio: 1.1
    });
  } else {
    ctx.font = `900 ${Math.round(W * 0.1)}px ${FONT}`; ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText('Partecipa', cx, y);
    y += Math.round(H * 0.16);
  }
  y += Math.round(H * 0.04);

  // Stars decoration
  const starSz = Math.round(W * 0.22);
  ctx.font = `${starSz}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.fillStyle = hexToRgba(secondary, 0.6);
  ctx.fillText('★', cx, y);
  y += starSz + Math.round(H * 0.04);

  // Small logo + store name at bottom
  const bLSz = Math.round(W * 0.14);
  drawLogo(ctx, logoImage, cx - bLSz / 2, y, bLSz, primary, bLSz / 2);
  ctx.font = `600 ${Math.round(W * 0.04)}px ${FONT}`; ctx.fillStyle = 'rgba(255,255,255,0.65)';
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.fillText(storeName.length > 22 ? storeName.slice(0, 21) + '…' : storeName, cx, y + bLSz + 10);

  drawStoryDots(ctx, W, H, 1, 5, primary);
}

function renderStoryCome(ctx, canvas, _qrImage, data) {
  const W = canvas.width, H = canvas.height;
  const { primary, secondary, storeName, logoImage } = data;
  const cx = W / 2;

  ctx.fillStyle = '#f0f4ff'; ctx.fillRect(0, 0, W, H);
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, hexToRgba(primary, 0.06)); bg.addColorStop(1, hexToRgba(secondary, 0.03));
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

  const tbH = Math.round(H * 0.007);
  const tbG = ctx.createLinearGradient(0, 0, W, 0);
  tbG.addColorStop(0, primary); tbG.addColorStop(1, secondary);
  ctx.fillStyle = tbG; ctx.fillRect(0, 0, W, tbH);

  ctx.font = `900 ${Math.round(W * 0.064)}px ${FONT}`; ctx.fillStyle = '#0f172a';
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.fillText('COME FUNZIONA', cx, Math.round(H * 0.065));

  ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx, Math.round(H * 0.14)); ctx.lineTo(cx, Math.round(H * 0.84));
  ctx.stroke();

  const steps = [
    { emoji: '📱', title: 'Scansiona il QR code', desc: 'Apri la fotocamera e inquadra il codice' },
    { emoji: '🎮', title: 'Gioca',                desc: 'Gratta, gira o scopri la tua cartella' },
    { emoji: '🏆', title: 'Vinci il premio',      desc: 'Ritira subito il tuo premio in negozio' },
  ];

  const stepH = Math.round(H * 0.22);
  const startY = Math.round(H * 0.13);

  steps.forEach((step, i) => {
    const y = startY + i * stepH;
    const circR = Math.round(W * 0.055);
    drawStepCircle(ctx, cx, y + circR, circR, i + 1, primary);

    const emojiSz = Math.round(W * 0.1);
    ctx.font = `${emojiSz}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillStyle = '#0f172a';
    ctx.fillText(step.emoji, cx, y + circR * 2 + 10);

    ctx.font = `800 ${Math.round(W * 0.054)}px ${FONT}`; ctx.fillStyle = '#0f172a';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText(step.title, cx, y + circR * 2 + emojiSz + 16);

    ctx.font = `400 ${Math.round(W * 0.038)}px ${FONT}`; ctx.fillStyle = '#64748b';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText(step.desc, cx, y + circR * 2 + emojiSz + Math.round(W * 0.068) + 18);
  });

  // Footer
  const lSz = Math.round(W * 0.1);
  drawLogo(ctx, logoImage, cx - lSz / 2, H - Math.round(H * 0.1) - lSz, lSz, primary, lSz / 2);

  drawStoryDots(ctx, W, H, 2, 5, primary);
}

function renderStoryCta(ctx, canvas, _qrImage, data) {
  const W = canvas.width, H = canvas.height;
  const { primary, secondary, cta, storeName, expiresText, logoImage } = data;
  const cx = W / 2;

  const bg = ctx.createLinearGradient(0, H, W * 0.6, 0);
  bg.addColorStop(0, secondary); bg.addColorStop(1, primary);
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = 'rgba(255,255,255,0.055)';
  [[0.08, 0.08, 200], [0.92, 0.28, 180], [0.06, 0.88, 240], [0.9, 0.76, 160]].forEach(([rx, ry, r]) => {
    ctx.beginPath(); ctx.arc(W * rx, H * ry, r, 0, Math.PI * 2); ctx.fill();
  });

  const lSz = Math.round(W * 0.16);
  let y = Math.round(H * 0.1);
  drawLogo(ctx, logoImage, cx - lSz / 2, y, lSz, '#ffffff', lSz / 2);
  y += lSz + 16;

  ctx.font = `600 ${Math.round(W * 0.046)}px ${FONT}`; ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.fillText(storeName.length > 22 ? storeName.slice(0, 21) + '…' : storeName, cx, y);
  y += Math.round(H * 0.1);

  // Big CTA text
  drawTextBlock(ctx, {
    text: cta.toUpperCase(), x: cx, y, maxWidth: W * 0.9, maxHeight: Math.round(H * 0.28),
    startSize: Math.round(W * 0.165), minSize: Math.round(W * 0.1),
    weight: 900, color: '#ffffff', maxLines: 2, lineRatio: 1.06
  });

  // Arrow
  ctx.font = `${Math.round(W * 0.18)}px ${FONT}`; ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.fillText('↓', cx, Math.round(H * 0.58));

  ctx.font = `700 ${Math.round(W * 0.044)}px ${FONT}`; ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.fillText('Scansiona il codice qui sotto', cx, Math.round(H * 0.72));

  if (expiresText) {
    ctx.font = `500 ${Math.round(W * 0.036)}px ${FONT}`; ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.fillText(expiresText, cx, H - Math.round(H * 0.055));
    ctx.textBaseline = 'alphabetic';
  }

  drawStoryDots(ctx, W, H, 3, 5, primary);
}

function renderStoryQr(ctx, canvas, qrImage, data) {
  const W = canvas.width, H = canvas.height;
  const { primary, secondary, cta, storeName, expiresText, logoImage } = data;
  const cx = W / 2;

  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, hexToRgba(primary, 0.06)); bg.addColorStop(1, hexToRgba(secondary, 0.03));
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

  const tbH = Math.round(H * 0.008);
  const tbG = ctx.createLinearGradient(0, 0, W, 0);
  tbG.addColorStop(0, primary); tbG.addColorStop(1, secondary);
  ctx.fillStyle = tbG; ctx.fillRect(0, 0, W, tbH);

  // Logo + store
  const lSz = Math.round(W * 0.18);
  let y = Math.round(H * 0.06);
  drawLogo(ctx, logoImage, cx - lSz / 2, y, lSz, primary, lSz / 2);
  y += lSz + 14;

  ctx.font = `700 ${Math.round(W * 0.052)}px ${FONT}`; ctx.fillStyle = primary;
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.fillText(storeName.length > 22 ? storeName.slice(0, 21) + '…' : storeName, cx, y);
  y += Math.round(W * 0.072);

  ctx.strokeStyle = hexToRgba(primary, 0.22); ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(W * 0.12, y); ctx.lineTo(W * 0.88, y); ctx.stroke();
  y += Math.round(H * 0.038);

  // Heading
  ctx.font = `900 ${Math.round(W * 0.068)}px ${FONT}`; ctx.fillStyle = '#0f172a';
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.fillText('Scansiona e partecipa', cx, y);
  y += Math.round(W * 0.098);

  // Large QR
  const qrSz  = Math.round(W * 0.65);
  const qrPad = Math.round(W * 0.04);
  roundedRect(ctx, cx - qrSz / 2 - qrPad, y - qrPad, qrSz + qrPad * 2, qrSz + qrPad * 2, Math.round(W * 0.035));
  ctx.fillStyle = '#f8fafc'; ctx.fill();
  ctx.strokeStyle = hexToRgba(primary, 0.15); ctx.lineWidth = 2; ctx.stroke();
  ctx.drawImage(qrImage, cx - qrSz / 2, y, qrSz, qrSz);
  y += qrSz + qrPad * 2 + 18;

  drawCtaButton(ctx, cta, cx, y, W * 0.76, Math.round(W * 0.095), primary, secondary);

  if (expiresText) {
    ctx.font = `400 ${Math.round(W * 0.034)}px ${FONT}`; ctx.fillStyle = '#94a3b8';
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.fillText(expiresText, cx, H - Math.round(H * 0.025));
    ctx.textBaseline = 'alphabetic';
  }

  drawStoryDots(ctx, W, H, 4, 5, primary);
}

function drawStoryDots(ctx, W, H, active, total, primary) {
  const dotR = Math.round(W * 0.015);
  const gap  = Math.round(W * 0.042);
  const totalW = (total - 1) * gap + dotR * 2 * total;
  let dx = (W - totalW) / 2;
  const dy = H - Math.round(H * 0.028) - dotR;
  for (let i = 0; i < total; i++) {
    ctx.beginPath();
    ctx.arc(dx + dotR, dy, dotR, 0, Math.PI * 2);
    ctx.fillStyle = i === active ? '#ffffff' : 'rgba(255,255,255,0.3)';
    ctx.fill();
    dx += dotR * 2 + gap;
  }
}

function renderStoryFrame(ctx, canvas, qrImage, data, frameIndex) {
  switch (frameIndex) {
    case 0: renderStoryHook(ctx, canvas, qrImage, data);  break;
    case 1: renderStoryPrize(ctx, canvas, qrImage, data); break;
    case 2: renderStoryCome(ctx, canvas, qrImage, data);  break;
    case 3: renderStoryCta(ctx, canvas, qrImage, data);   break;
    case 4: renderStoryQr(ctx, canvas, qrImage, data);    break;
  }
}

// ─── LED renderer (horizontal + vertical + square) ────────────────────────────

function renderLed(ctx, canvas, qrImage, data) {
  const W = canvas.width, H = canvas.height;
  const isSquare = W === H;
  if (isSquare) { renderLedSquare(ctx, canvas, qrImage, data); return; }
  const isHorizontal = W > H * 1.4;
  if (isHorizontal) { renderLedHoriz(ctx, canvas, qrImage, data); }
  else              { renderLedVert(ctx, canvas, qrImage, data);  }
}

function renderLedHoriz(ctx, canvas, qrImage, data) {
  const W = canvas.width, H = canvas.height;
  const { primary, secondary, headline, cta, prizeText, storeName, logoImage } = data;

  const topBarH = Math.round(H * 0.076);
  const botBarH = Math.round(H * 0.05);
  const mainH   = H - topBarH - botBarH;
  const leftW   = Math.round(W * 0.218);
  const rightW  = Math.round(W * 0.26);
  const centerW = W - leftW - rightW;

  ctx.fillStyle = '#080d18'; ctx.fillRect(0, 0, W, H);
  const bgOverlay = ctx.createLinearGradient(0, 0, W, H);
  bgOverlay.addColorStop(0, hexToRgba(primary, 0.08)); bgOverlay.addColorStop(1, hexToRgba(secondary, 0.05));
  ctx.fillStyle = bgOverlay; ctx.fillRect(0, 0, W, H);

  const topG = ctx.createLinearGradient(0, 0, W, 0);
  topG.addColorStop(0, primary); topG.addColorStop(0.5, secondary); topG.addColorStop(1, primary);
  ctx.fillStyle = topG; ctx.fillRect(0, 0, W, topBarH);
  ctx.fillStyle = hexToRgba(primary, 0.28); ctx.fillRect(0, H - botBarH, W, botBarH);

  const leftG = ctx.createLinearGradient(0, topBarH, leftW, topBarH + mainH);
  leftG.addColorStop(0, hexToRgba(primary, 0.24)); leftG.addColorStop(1, hexToRgba(secondary, 0.14));
  ctx.fillStyle = leftG; ctx.fillRect(0, topBarH, leftW, mainH);
  ctx.fillStyle = hexToRgba(primary, 0.5); ctx.fillRect(leftW - 3, topBarH, 3, mainH);

  const lSz = Math.round(mainH * 0.46);
  const snH = Math.round(H * 0.056);
  const lY  = topBarH + (mainH - lSz - snH - 10) / 2;
  drawLogo(ctx, logoImage, (leftW - lSz) / 2, lY, lSz, primary, 12);
  ctx.font = `600 ${snH}px ${FONT}`; ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.fillText(storeName.length > 16 ? storeName.slice(0, 15) + '…' : storeName, leftW / 2, lY + lSz + 10);

  const ctxCx = leftW + centerW / 2;
  const cG = ctx.createLinearGradient(leftW, 0, leftW + centerW, 0);
  cG.addColorStop(0, hexToRgba(secondary, 0.04)); cG.addColorStop(1, hexToRgba(primary, 0.03));
  ctx.fillStyle = cG; ctx.fillRect(leftW, topBarH, centerW, mainH);

  drawTextBlock(ctx, {
    text: headline, x: ctxCx, y: topBarH + Math.round(mainH * 0.1),
    maxWidth: centerW * 0.9, maxHeight: Math.round(mainH * (prizeText ? 0.56 : 0.74)),
    startSize: Math.round(H * 0.24), minSize: Math.round(H * 0.14),
    weight: 900, color: '#ffffff', maxLines: 2, lineRatio: 1.06
  });

  if (prizeText) {
    ctx.font = `700 ${Math.round(H * 0.076)}px ${FONT}`; ctx.fillStyle = secondary;
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.fillText(prizeText.length > 30 ? prizeText.slice(0, 29) + '…' : prizeText, ctxCx, H - botBarH - Math.round(H * 0.04));
    ctx.textBaseline = 'alphabetic';
  }

  const rPanelX = W - rightW;
  ctx.fillStyle = 'rgba(255,255,255,0.034)'; ctx.fillRect(rPanelX, topBarH, rightW, mainH);
  ctx.fillStyle = hexToRgba(primary, 0.3); ctx.fillRect(rPanelX, topBarH, 3, mainH);

  const qrZoneCx  = rPanelX + rightW / 2;
  const ctaFontSz = Math.round(H * 0.086);
  const qrSz      = Math.round(mainH * 0.65);
  const qrPad     = Math.round(H * 0.028);
  const qrX       = qrZoneCx - qrSz / 2;
  const qrY       = topBarH + (mainH - (qrSz + qrPad * 2 + ctaFontSz * 1.35)) / 2;
  roundedRect(ctx, qrX - qrPad, qrY - qrPad, qrSz + qrPad * 2, qrSz + qrPad * 2, 14);
  ctx.fillStyle = '#ffffff'; ctx.fill();
  ctx.drawImage(qrImage, qrX, qrY, qrSz, qrSz);
  ctx.font = `900 ${ctaFontSz}px ${FONT}`; ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.fillText(cta, qrZoneCx, qrY + qrSz + qrPad + 6);
  ctx.textBaseline = 'alphabetic';
}

function renderLedVert(ctx, canvas, qrImage, data) {
  const W = canvas.width, H = canvas.height;
  const { primary, secondary, headline, cta, prizeText, storeName, logoImage } = data;
  const cx = W / 2;

  ctx.fillStyle = '#080d18'; ctx.fillRect(0, 0, W, H);
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, hexToRgba(primary, 0.16)); bg.addColorStop(1, hexToRgba(secondary, 0.08));
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = primary; ctx.fillRect(0, 0, 7, H);

  const tBarH = Math.round(H * 0.04);
  const tBarG = ctx.createLinearGradient(0, 0, W, 0);
  tBarG.addColorStop(0, primary); tBarG.addColorStop(1, secondary);
  ctx.fillStyle = tBarG; ctx.fillRect(0, 0, W, tBarH);

  let y = tBarH + Math.round(H * 0.04);
  const lSz = Math.round(W * 0.4);
  drawLogo(ctx, logoImage, cx - lSz / 2, y, lSz, primary, 14);
  y += lSz + 14;

  ctx.font = `600 ${Math.round(W * 0.056)}px ${FONT}`; ctx.fillStyle = hexToRgba(primary, 0.92);
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.fillText(storeName.length > 16 ? storeName.slice(0, 15) + '…' : storeName, cx, y);
  y += Math.round(W * 0.072);

  ctx.strokeStyle = primary; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(W * 0.16, y); ctx.lineTo(W * 0.84, y); ctx.stroke();
  y += 22;

  y = drawTextBlock(ctx, {
    text: headline, x: cx, y, maxWidth: W * 0.86, maxHeight: Math.round(H * 0.22),
    startSize: Math.round(W * 0.118), minSize: Math.round(W * 0.08),
    weight: 900, color: '#ffffff', maxLines: 2, lineRatio: 1.08
  });
  y += 18;

  if (prizeText) {
    ctx.font = `700 ${Math.round(W * 0.066)}px ${FONT}`; ctx.fillStyle = secondary;
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText(prizeText.length > 18 ? prizeText.slice(0, 17) + '…' : prizeText, cx, y);
    y += Math.round(W * 0.09);
  }

  const qrSz = Math.round(W * 0.46), qrPad = Math.round(W * 0.028);
  roundedRect(ctx, cx - qrSz / 2 - qrPad, y - qrPad, qrSz + qrPad * 2, qrSz + qrPad * 2, 14);
  ctx.fillStyle = '#ffffff'; ctx.fill();
  ctx.drawImage(qrImage, cx - qrSz / 2, y, qrSz, qrSz);
  y += qrSz + qrPad * 2 + 14;

  ctx.font = `900 ${Math.round(W * 0.068)}px ${FONT}`; ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.fillText(cta, cx, y);
  ctx.textBaseline = 'alphabetic';
}

function renderLedSquare(ctx, canvas, qrImage, data) {
  const W = canvas.width, H = canvas.height;
  const { primary, secondary, headline, cta, prizeText, storeName, logoImage } = data;
  const cx = W / 2;

  ctx.fillStyle = '#080d18'; ctx.fillRect(0, 0, W, H);
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, hexToRgba(primary, 0.18)); bg.addColorStop(1, hexToRgba(secondary, 0.1));
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

  // Brand accent bars top + left
  const tbH = Math.round(H * 0.055);
  const tbG = ctx.createLinearGradient(0, 0, W, 0);
  tbG.addColorStop(0, primary); tbG.addColorStop(1, secondary);
  ctx.fillStyle = tbG; ctx.fillRect(0, 0, W, tbH);
  ctx.fillStyle = primary; ctx.fillRect(0, 0, 6, H);

  let y = tbH + Math.round(H * 0.045);

  // Logo compact
  const lSz = Math.round(W * 0.24);
  drawLogo(ctx, logoImage, cx - lSz / 2, y, lSz, primary, 12);
  y += lSz + 12;

  ctx.font = `600 ${Math.round(W * 0.052)}px ${FONT}`; ctx.fillStyle = hexToRgba(primary, 0.9);
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.fillText(storeName.length > 16 ? storeName.slice(0, 15) + '…' : storeName, cx, y);
  y += Math.round(W * 0.07);

  ctx.strokeStyle = primary; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(W * 0.18, y); ctx.lineTo(W * 0.82, y); ctx.stroke();
  y += 16;

  // Headline — HUGE
  y = drawTextBlock(ctx, {
    text: headline, x: cx, y, maxWidth: W * 0.86, maxHeight: Math.round(H * 0.24),
    startSize: Math.round(W * 0.12), minSize: Math.round(W * 0.076),
    weight: 900, color: '#ffffff', maxLines: 2, lineRatio: 1.07
  });
  y += 14;

  if (prizeText) {
    ctx.font = `700 ${Math.round(W * 0.06)}px ${FONT}`; ctx.fillStyle = secondary;
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText(prizeText.length > 18 ? prizeText.slice(0, 17) + '…' : prizeText, cx, y);
    y += Math.round(W * 0.085);
  }

  // QR + CTA at bottom
  const remaining = H - y - Math.round(H * 0.05);
  const qrSz = Math.round(Math.min(remaining * 0.6, W * 0.36));
  const qrPad = Math.round(qrSz * 0.06);
  const ctaH  = Math.round(W * 0.076);
  const totalQrBlock = qrPad + qrSz + qrPad + ctaH * 1.3;
  const qrY   = y + (remaining - totalQrBlock) / 2;
  roundedRect(ctx, cx - qrSz / 2 - qrPad, qrY - qrPad, qrSz + qrPad * 2, qrSz + qrPad * 2, 12);
  ctx.fillStyle = '#ffffff'; ctx.fill();
  ctx.drawImage(qrImage, cx - qrSz / 2, qrY, qrSz, qrSz);
  ctx.font = `900 ${Math.round(W * 0.058)}px ${FONT}`; ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.fillText(cta, cx, qrY + qrSz + qrPad + 8);
  ctx.textBaseline = 'alphabetic';
}

// ─── LCD renderer (16:9 + 4:3 + vertical) ────────────────────────────────────

function renderLcd(ctx, canvas, qrImage, data) {
  const W = canvas.width, H = canvas.height;
  if (H > W) { renderLcdVertLayout(ctx, canvas, qrImage, data); return; }
  const is16x9 = W / H > 1.55;
  if (is16x9) { renderLcdHorizSplit(ctx, canvas, qrImage, data); }
  else        { renderLcdCard(ctx, canvas, qrImage, data); }
}

function renderLcdHorizSplit(ctx, canvas, qrImage, data) {
  const W = canvas.width, H = canvas.height;
  const { primary, secondary, headline, subtitle, cta, prizeText,
    storeName, campaignName, expiresText, logoImage } = data;
  const split = Math.round(W * 0.52), pad = Math.round(H * 0.072), lCx = split / 2;

  ctx.fillStyle = '#f0f4ff'; ctx.fillRect(0, 0, W, H);
  const bgG = ctx.createLinearGradient(0, 0, W, H);
  bgG.addColorStop(0, hexToRgba(primary, 0.07)); bgG.addColorStop(1, hexToRgba(secondary, 0.04));
  ctx.fillStyle = bgG; ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, split, H);
  const lpG = ctx.createLinearGradient(0, 0, split, H);
  lpG.addColorStop(0, hexToRgba(primary, 0.055)); lpG.addColorStop(1, hexToRgba(secondary, 0.028));
  ctx.fillStyle = lpG; ctx.fillRect(0, 0, split, H);
  ctx.fillStyle = '#ffffff'; ctx.fillRect(split, 0, W - split, H);
  ctx.fillStyle = primary; ctx.fillRect(split - 4, 0, 4, H);

  const tBar = Math.round(H * 0.007);
  const tG = ctx.createLinearGradient(0, 0, split, 0);
  tG.addColorStop(0, primary); tG.addColorStop(1, secondary);
  ctx.fillStyle = tG; ctx.fillRect(0, 0, split, tBar);

  let y = pad;
  const lSz = Math.round(H * 0.12);
  drawLogo(ctx, logoImage, lCx - lSz / 2, y, lSz, primary, 14);
  y += lSz + 12;
  ctx.font = `700 ${Math.round(H * 0.028)}px ${FONT}`; ctx.fillStyle = primary;
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.fillText(storeName.length > 24 ? storeName.slice(0, 23) + '…' : storeName, lCx, y);
  y += Math.round(H * 0.038);
  ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(split * 0.08, y); ctx.lineTo(split * 0.92, y); ctx.stroke();
  y += Math.round(H * 0.03);
  ctx.font = `500 ${Math.round(H * 0.022)}px ${FONT}`; ctx.fillStyle = '#64748b';
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.fillText(campaignName.length > 34 ? campaignName.slice(0, 33) + '…' : campaignName, lCx, y);
  y += Math.round(H * 0.036);
  y = drawTextBlock(ctx, {
    text: headline, x: lCx, y, maxWidth: split * 0.82, maxHeight: Math.round(H * 0.27),
    startSize: Math.round(H * 0.1), minSize: Math.round(H * 0.054),
    weight: 900, color: '#0f172a', maxLines: 2, lineRatio: 1.1
  });
  y += Math.round(H * 0.024);
  if (prizeText) { y = drawPrizePill(ctx, prizeText, lCx, y, split * 0.82, primary, secondary); y += Math.round(H * 0.02); }
  if (subtitle) {
    drawTextBlock(ctx, {
      text: subtitle, x: lCx, y, maxWidth: split * 0.76, maxHeight: Math.round(H * 0.09),
      startSize: Math.round(H * 0.027), minSize: Math.round(H * 0.018),
      weight: 400, color: '#64748b', maxLines: 2, lineRatio: 1.4
    });
  }
  if (expiresText) {
    ctx.font = `400 ${Math.round(H * 0.02)}px ${FONT}`; ctx.fillStyle = '#94a3b8';
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.fillText(expiresText, lCx, H - pad * 0.5);
    ctx.textBaseline = 'alphabetic';
  }

  const rCx = split + (W - split) / 2, rH = H - pad * 2;
  const ctaBtnH = Math.round(H * 0.072);
  const qrSz = Math.min(Math.round(rH * 0.58), Math.round((W - split) * 0.64));
  const qrPad = Math.round(qrSz * 0.07);
  const qrY = pad + (rH - (qrSz + qrPad * 2 + 24 + ctaBtnH)) / 2;
  drawQrBlock(ctx, qrImage, rCx, qrY, qrSz, qrPad, Math.round(qrSz * 0.06));
  drawCtaButton(ctx, cta, rCx, qrY + qrSz + qrPad * 2 + 24, (W - split) * 0.72, ctaBtnH, primary, secondary);
}

function renderLcdCard(ctx, canvas, qrImage, data) {
  const W = canvas.width, H = canvas.height;
  const { primary, secondary, headline, subtitle, cta, prizeText,
    storeName, campaignName, expiresText, logoImage } = data;
  const cx = W / 2, pad = Math.round(W * 0.05), cr = Math.round(W * 0.022);

  ctx.fillStyle = '#f0f4ff'; ctx.fillRect(0, 0, W, H);
  const bgG = ctx.createLinearGradient(0, 0, W, H);
  bgG.addColorStop(0, hexToRgba(primary, 0.07)); bgG.addColorStop(1, hexToRgba(secondary, 0.04));
  ctx.fillStyle = bgG; ctx.fillRect(0, 0, W, H);

  roundedRect(ctx, pad + 10, pad + 14, W - pad * 2, H - pad * 2, cr);
  ctx.fillStyle = hexToRgba(primary, 0.14); ctx.fill();
  roundedRect(ctx, pad, pad, W - pad * 2, H - pad * 2, cr);
  ctx.fillStyle = '#ffffff'; ctx.fill();

  const tBarH = Math.round(H * 0.008);
  roundedRect(ctx, pad, pad, W - pad * 2, tBarH, cr);
  const tG2 = ctx.createLinearGradient(pad, 0, W - pad, 0);
  tG2.addColorStop(0, primary); tG2.addColorStop(1, secondary);
  ctx.fillStyle = tG2; ctx.fill();

  const cardX = pad, cardY = pad, cardW = W - pad * 2, cardH = H - pad * 2;
  const iW = Math.round(cardW * 0.84);
  let y = cardY + Math.round(cardH * 0.042);
  const lSz = Math.round(H * 0.1);
  drawLogo(ctx, logoImage, cx - lSz / 2, y, lSz, primary, 14);
  y += lSz + 12;
  ctx.font = `700 ${Math.round(H * 0.028)}px ${FONT}`; ctx.fillStyle = primary;
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.fillText(storeName.length > 28 ? storeName.slice(0, 27) + '…' : storeName, cx, y);
  y += Math.round(H * 0.038);
  ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(cardX + cardW * 0.12, y); ctx.lineTo(cardX + cardW * 0.88, y); ctx.stroke();
  y += Math.round(H * 0.026);
  ctx.font = `500 ${Math.round(H * 0.024)}px ${FONT}`; ctx.fillStyle = '#64748b';
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.fillText(campaignName.length > 32 ? campaignName.slice(0, 31) + '…' : campaignName, cx, y);
  y += Math.round(H * 0.036);
  y = drawTextBlock(ctx, {
    text: headline, x: cx, y, maxWidth: iW * 0.88, maxHeight: Math.round(H * 0.23),
    startSize: Math.round(H * 0.088), minSize: 38, weight: 900, color: '#0f172a', maxLines: 2, lineRatio: 1.1
  });
  y += 16;
  if (prizeText) { y = drawPrizePill(ctx, prizeText, cx, y, iW * 0.82, primary, secondary); y += 12; }
  if (subtitle) {
    y = drawTextBlock(ctx, {
      text: subtitle, x: cx, y, maxWidth: iW * 0.74, maxHeight: Math.round(H * 0.08),
      startSize: Math.round(H * 0.026), minSize: 18, weight: 400, color: '#64748b', maxLines: 2, lineRatio: 1.4
    });
    y += 8;
  }
  const qrSz = Math.round(W * 0.22), qrPad = Math.round(W * 0.02);
  const footerH = Math.round(cardH * 0.065), ctaBtnH = Math.round(H * 0.056);
  const ctaBtnY = cardY + cardH - footerH - ctaBtnH - 12;
  drawQrBlock(ctx, qrImage, cx, ctaBtnY - qrSz - qrPad * 2 - 10 + qrPad, qrSz, qrPad, Math.round(W * 0.015));
  drawCtaButton(ctx, cta, cx, ctaBtnY, iW * 0.64, ctaBtnH, primary, secondary);
  if (expiresText) {
    ctx.font = `500 ${Math.round(H * 0.018)}px ${FONT}`; ctx.fillStyle = '#94a3b8';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(expiresText, cx, cardY + cardH - footerH / 2);
    ctx.textBaseline = 'alphabetic';
  }
}

function renderLcdVertLayout(ctx, canvas, qrImage, data) {
  const W = canvas.width, H = canvas.height;
  const { primary, secondary, headline, subtitle, cta, prizeText,
    storeName, campaignName, expiresText, logoImage } = data;
  const cx = W / 2;

  // Clean white base — professional digital signage style
  ctx.fillStyle = '#f8faff'; ctx.fillRect(0, 0, W, H);
  const bgG = ctx.createLinearGradient(0, 0, W, H);
  bgG.addColorStop(0, hexToRgba(primary, 0.05)); bgG.addColorStop(1, hexToRgba(secondary, 0.03));
  ctx.fillStyle = bgG; ctx.fillRect(0, 0, W, H);

  // Top header band
  const hBandH = Math.round(H * 0.18);
  const hg = ctx.createLinearGradient(0, 0, W, hBandH);
  hg.addColorStop(0, primary); hg.addColorStop(1, secondary);
  ctx.fillStyle = hg; ctx.fillRect(0, 0, W, hBandH);

  // Logo in header
  const lSz = Math.round(hBandH * 0.52);
  drawLogo(ctx, logoImage, cx - lSz / 2, (hBandH - lSz) / 2, lSz, '#ffffff', 14);

  // Store name below header (on white)
  let y = hBandH + Math.round(H * 0.036);
  ctx.font = `800 ${Math.round(W * 0.062)}px ${FONT}`; ctx.fillStyle = primary;
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.fillText(storeName.length > 20 ? storeName.slice(0, 19) + '…' : storeName, cx, y);
  y += Math.round(W * 0.088);

  ctx.strokeStyle = hexToRgba(primary, 0.22); ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(W * 0.1, y); ctx.lineTo(W * 0.9, y); ctx.stroke();
  y += Math.round(H * 0.024);

  // Campaign eyebrow
  if (campaignName) {
    ctx.font = `500 ${Math.round(W * 0.04)}px ${FONT}`; ctx.fillStyle = '#64748b';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText(campaignName.length > 30 ? campaignName.slice(0, 29) + '…' : campaignName, cx, y);
    y += Math.round(H * 0.038);
  }

  // Headline
  y = drawTextBlock(ctx, {
    text: headline, x: cx, y, maxWidth: W * 0.84, maxHeight: Math.round(H * 0.2),
    startSize: Math.round(W * 0.1), minSize: Math.round(W * 0.06),
    weight: 900, color: '#0f172a', maxLines: 2, lineRatio: 1.1
  });
  y += Math.round(H * 0.022);

  // Prize pill
  if (prizeText) {
    y = drawPrizePill(ctx, prizeText, cx, y, W * 0.82, primary, secondary);
    y += Math.round(H * 0.02);
  }

  // Subtitle
  if (subtitle) {
    y = drawTextBlock(ctx, {
      text: subtitle, x: cx, y, maxWidth: W * 0.76, maxHeight: Math.round(H * 0.08),
      startSize: Math.round(W * 0.038), minSize: 22,
      weight: 400, color: '#64748b', maxLines: 2, lineRatio: 1.4
    });
    y += Math.round(H * 0.016);
  }

  // QR + CTA — anchored from bottom
  const botSec  = Math.round(H * 0.28);
  const botY    = H - botSec;
  const ctaBtnH = Math.round(W * 0.1);
  const qrSz    = Math.round(Math.min(botSec * 0.54, W * 0.46));
  const qrPad   = Math.round(qrSz * 0.06);
  const totalBot = qrSz + qrPad * 2 + 20 + ctaBtnH;
  const qrStartY = botY + (botSec - totalBot) / 2;

  ctx.strokeStyle = hexToRgba(primary, 0.14); ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(W * 0.08, botY); ctx.lineTo(W * 0.92, botY); ctx.stroke();

  ctx.font = `700 ${Math.round(W * 0.044)}px ${FONT}`; ctx.fillStyle = '#475569';
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.fillText('Scansiona e partecipa', cx, qrStartY - Math.round(H * 0.018));

  drawQrBlock(ctx, qrImage, cx, qrStartY, qrSz, qrPad, Math.round(qrSz * 0.06));
  drawCtaButton(ctx, cta, cx, qrStartY + qrSz + qrPad * 2 + 20, W * 0.72, ctaBtnH, primary, secondary);

  if (expiresText) {
    ctx.font = `400 ${Math.round(W * 0.032)}px ${FONT}`; ctx.fillStyle = '#94a3b8';
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.fillText(expiresText, cx, H - Math.round(H * 0.016));
    ctx.textBaseline = 'alphabetic';
  }
}

// ─── Main dispatcher ──────────────────────────────────────────────────────────

async function renderCanvas(formatKey = formatPreviewSelect.value) {
  clearMessages();
  const campaign = getSelectedCampaign();
  if (!campaign) { setError('Seleziona una campagna.'); return; }

  const format = FORMAT_SIZES[formatKey];
  if (!format) return;
  const canvas = promoCanvas, ctx = canvas.getContext('2d');
  canvas.width  = format.width;
  canvas.height = format.height;
  state.lastRenderedFormat = formatKey;

  const playUrl  = getPlayUrl(campaign);
  const [qrImage] = await Promise.all([
    loadImage(`/api/public/qr?text=${encodeURIComponent(playUrl)}`)
  ]);

  let logoImage = null;
  if (state.store.logoUrl) {
    try { logoImage = await loadImage(state.store.logoUrl); } catch { /* use initials */ }
  }

  const mainPrize = getMainPrize(campaign);
  const primary   = state.store.primaryColor   || '#667eea';
  const secondary = state.store.secondaryColor || '#764ba2';

  const data = {
    headline:     headlineInput.value.trim() || 'Inquadra e vinci',
    subtitle:     subtitleInput.value.trim(),
    cta:          ctaInput.value.trim() || 'Gioca ora',
    prizeText:    mainPrize ? `${mainPrize.emoji || ''} ${mainPrize.name}`.trim() : '',
    campaignName: campaign.name,
    storeName:    state.store.name,
    primary, secondary,
    expiresText:  campaign.endDate ? `Valido fino al ${formatDate(campaign.endDate)}` : '',
    logoImage
  };

  switch (format.family) {
    case 'print':    renderPrint(ctx, canvas, qrImage, data);                       break;
    case 'facebook': renderFacebook(ctx, canvas, qrImage, data);                    break;
    case 'social':   renderSocial(ctx, canvas, qrImage, data);                      break;
    case 'story':    renderStoryFrame(ctx, canvas, qrImage, data, state.storyFrame); break;
    case 'led':      renderLed(ctx, canvas, qrImage, data);                         break;
    case 'lcd':      renderLcd(ctx, canvas, qrImage, data);                         break;
  }

  updateStoryNav(formatKey);
  playUrlLabel.textContent = playUrl;

  // M2: post-render layout validation — localhost only, non-blocking
  if (location.hostname === 'localhost') {
    try {
      const boxes = computeElementBoxes(formatKey, data, canvas.width, canvas.height);
      if (boxes) validateLayout(boxes, data, canvas.width, canvas.height, formatKey);
    } catch (e) {
      console.warn('[validateLayout] errore interno:', e.message);
    }
  }
}

// ─── Download functions ───────────────────────────────────────────────────────

function downloadCanvas(formatKey, type = 'image/png') {
  return renderCanvas(formatKey).then(() => {
    const campaign = getSelectedCampaign();
    const ext  = type === 'image/jpeg' ? 'jpg' : 'png';
    const link = document.createElement('a');
    link.href  = promoCanvas.toDataURL(type, 0.95);
    link.download = `${campaign.slug}-${formatKey}.${ext}`;
    link.click();
  });
}

async function downloadPdf() {
  await renderCanvas('a4');
  const campaign = getSelectedCampaign();
  const image    = promoCanvas.toDataURL('image/jpeg', 0.95);
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  pdf.addImage(image, 'JPEG', 0, 0, 210, 297);
  pdf.save(`${campaign.slug}-print-a4.pdf`);
}

async function downloadStoryFrames() {
  const campaign = getSelectedCampaign();
  if (!campaign) return;
  const prevFrame = state.storyFrame;
  for (let i = 0; i < STORY_FRAMES.length; i++) {
    state.storyFrame = i;
    await renderCanvas('story');
    const link = document.createElement('a');
    link.href = promoCanvas.toDataURL('image/png', 0.95);
    link.download = `${campaign.slug}-story-frame${i + 1}-${STORY_FRAMES[i].key}.png`;
    link.click();
    await new Promise((r) => setTimeout(r, 220));
  }
  state.storyFrame = prevFrame;
  await renderCanvas('story');
}

async function downloadQr() {
  const campaign = getSelectedCampaign();
  if (!campaign) return;
  const playUrl  = getPlayUrl(campaign);
  const response = await fetch(`/api/public/qr?text=${encodeURIComponent(playUrl)}`);
  const blob     = await response.blob();
  const link     = document.createElement('a');
  link.href      = URL.createObjectURL(blob);
  link.download  = `${campaign.slug}-qr.svg`;
  link.click();
  URL.revokeObjectURL(link.href);
}

async function downloadSelected() {
  const formats = getSelectedFormatKeys();
  if (!formats.length) { setError('Seleziona almeno un canale prima di scaricare.'); return; }
  clearMessages();
  for (const fmtKey of formats) {
    if (fmtKey === 'a4') {
      await downloadPdf();
    } else if (fmtKey === 'story') {
      await downloadStoryFrames();
    } else {
      await downloadCanvas(fmtKey);
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  showSuccess(`Download completato — ${formats.length} format${formats.length > 1 ? 'i' : 'o'} scaricati.`);
}

// ─── M2 Layout Validation ─────────────────────────────────────────────────────

// Minimum QR image size (px) below which scanning becomes unreliable
const QR_MIN_PX = { print: 250, social: 200, facebook: 180, led: 140, lcd: 190, story: 200 };

// Safe margin from each canvas edge per format key
const SAFE_MARGIN_PX = {
  a4: 60, vertical: 32, square: 32, facebook: 28, story: 32,
  led_h: 16, led_v: 16, led_sq: 16, '16x9': 28, '4x3': 28, lcd_v: 28,
};

/**
 * Estimate whether `text` fits within `maxLines` lines at `fontSizePx` inside `maxWidthPx`.
 * Uses a 0.52× character-width heuristic, conservative for bold sans-serif.
 */
function estimateTextFit(text, fontSizePx, maxWidthPx, maxLines = 2) {
  if (!text || !fontSizePx || !maxWidthPx) return { fits: true, estimatedLines: 0 };
  const avgCharW      = fontSizePx * 0.52;
  const charsPerLine  = Math.max(1, Math.floor(maxWidthPx / avgCharW));
  const estimatedLines = Math.ceil(text.length / charsPerLine);
  return { fits: estimatedLines <= maxLines, estimatedLines, charsPerLine };
}

/**
 * Analytical bounding boxes for A4 (renderPrint).
 * Mirrors renderPrint geometry exactly — no drawing occurs.
 */
function computeBoxes_a4(data, W, H) {
  const z = {
    headerEnd: Math.round(H * 0.115),
    heroEnd:   Math.round(H * 0.43),
    prizeEnd:  Math.round(H * 0.61),
    qrEnd:     Math.round(H * 0.915),
  };
  const cx       = W / 2;
  const qrSecH   = z.qrEnd - z.prizeEnd;
  const qrSz     = Math.round(Math.min(W * 0.36, qrSecH * 0.52));
  const qrPad    = Math.round(qrSz * 0.065);
  const ctaBtnH  = Math.round(W * 0.052);
  const qrLabelH = Math.round(W * 0.026);
  const totalQrH = qrLabelH + 16 + qrSz + qrPad * 2 + 16 + ctaBtnH;
  const qrStartY = z.prizeEnd + (qrSecH - totalQrH) / 2;
  // drawQrBlock(ctx, img, cx, qrStartY + qrLabelH + 16, ...) → image top = y param
  const qrActualY = qrStartY + qrLabelH + 16;
  const ctaY      = qrActualY + qrSz + qrPad * 2 + 18;
  const ctaBtnW   = W * 0.58;
  return {
    header:    { x: 0,               y: 0,           w: W,        h: z.headerEnd,            label: 'Header band'   },
    hero:      { x: 0,               y: z.headerEnd, w: W,        h: z.heroEnd - z.headerEnd, label: 'Hero/Headline' },
    prizeZone: { x: 0,               y: z.heroEnd,   w: W,        h: z.prizeEnd - z.heroEnd,  label: 'Prize band'    },
    qrZone:    { x: 0,               y: z.prizeEnd,  w: W,        h: z.qrEnd - z.prizeEnd,    label: 'QR section'    },
    footer:    { x: 0,               y: z.qrEnd,     w: W,        h: H - z.qrEnd,             label: 'Footer'        },
    qr:        { x: cx - qrSz / 2,   y: qrActualY,   w: qrSz,    h: qrSz,                    label: 'QR code'       },
    cta:       { x: cx - ctaBtnW / 2, y: ctaY,        w: ctaBtnW, h: ctaBtnH,                 label: 'CTA button'    },
    headlineFontEst: Math.round(W * 0.088),   // startSize from drawTextBlock call
    prizeFontEst:    Math.round(W * 0.072),   // startSize for prizeText in hero
    qrSizePx: qrSz,
  };
}

/**
 * Analytical bounding boxes for LED orizzontale (renderLedHoriz).
 */
function computeBoxes_ledh(data, W, H) {
  const topBarH   = Math.round(H * 0.076);
  const botBarH   = Math.round(H * 0.05);
  const mainH     = H - topBarH - botBarH;
  const leftW     = Math.round(W * 0.218);
  const rightW    = Math.round(W * 0.26);
  const centerW   = W - leftW - rightW;
  const rPanelX   = W - rightW;
  const qrZoneCx  = rPanelX + rightW / 2;
  const ctaFontSz = Math.round(H * 0.086);
  const qrSz      = Math.round(mainH * 0.65);
  const qrPad     = Math.round(H * 0.028);
  const qrX       = qrZoneCx - qrSz / 2;
  const qrY       = topBarH + (mainH - (qrSz + qrPad * 2 + ctaFontSz * 1.35)) / 2;
  return {
    topBar:      { x: 0,        y: 0,         w: W,       h: topBarH, label: 'Top accent bar'   },
    leftPanel:   { x: 0,        y: topBarH,   w: leftW,   h: mainH,   label: 'Left brand panel' },
    centerPanel: { x: leftW,    y: topBarH,   w: centerW, h: mainH,   label: 'Center headline'  },
    rightPanel:  { x: rPanelX,  y: topBarH,   w: rightW,  h: mainH,   label: 'Right QR panel'   },
    botBar:      { x: 0,        y: H-botBarH, w: W,       h: botBarH, label: 'Bottom accent'    },
    qr:          { x: qrX,      y: qrY,       w: qrSz,    h: qrSz,    label: 'QR code'          },
    headlineFontEst: Math.round(H * 0.24),
    prizeFontEst:    Math.round(H * 0.076),
    qrSizePx: qrSz,
  };
}

/**
 * Analytical bounding boxes for LCD verticale (renderLcdVertLayout).
 */
function computeBoxes_lcdv(data, W, H) {
  const hBandH   = Math.round(H * 0.18);
  const botSec   = Math.round(H * 0.28);
  const botY     = H - botSec;
  const ctaBtnH  = Math.round(W * 0.1);
  const qrSz     = Math.round(Math.min(botSec * 0.54, W * 0.46));
  const qrPad    = Math.round(qrSz * 0.06);
  const totalBot = qrSz + qrPad * 2 + 20 + ctaBtnH;
  const qrStartY = botY + (botSec - totalBot) / 2;   // drawQrBlock y param = image top
  const ctaY     = qrStartY + qrSz + qrPad * 2 + 20;
  const cx       = W / 2;
  return {
    header:    { x: 0,           y: 0,        w: W,       h: hBandH,        label: 'Header band'  },
    content:   { x: 0,           y: hBandH,   w: W,       h: botY - hBandH, label: 'Content zone' },
    qrSection: { x: 0,           y: botY,     w: W,       h: botSec,        label: 'QR section'   },
    qr:        { x: cx - qrSz/2, y: qrStartY, w: qrSz,   h: qrSz,          label: 'QR code'      },
    cta:       { x: cx - W*0.36, y: ctaY,     w: W * 0.72, h: ctaBtnH,     label: 'CTA button'   },
    headlineFontEst: Math.round(W * 0.1),
    prizeFontEst:    Math.round(W * 0.82 * 0.044),   // drawPrizePill pSz
    qrSizePx: qrSz,
  };
}

/**
 * Dispatch to the right box-calculator.
 * Returns null for formats not covered in M2 (no error, just skip).
 */
function computeElementBoxes(formatKey, data, W, H) {
  switch (formatKey) {
    case 'a4':    return computeBoxes_a4(data, W, H);
    case 'led_h': return computeBoxes_ledh(data, W, H);
    case 'lcd_v': return computeBoxes_lcdv(data, W, H);
    default:
      console.log(`[M2 validateLayout] ${formatKey} — formato non coperto in M2, skip`);
      return null;
  }
}

/**
 * Validate layout boxes and log warnings to console.
 * Non-blocking: only logs. Never throws, never prevents export.
 *
 * Distinguishes:
 *   layoutCoverage — area teorica coperta dalle zone principali
 *   contentDensity — stima degli elementi realmente visibili
 */
function validateLayout(boxes, data, W, H, formatKey) {
  const issues   = [];
  const warnings = [];
  const family   = FORMAT_SIZES[formatKey]?.family ?? 'print';
  const safeM    = SAFE_MARGIN_PX[formatKey] ?? 20;
  const minQr    = QR_MIN_PX[family]         ?? 200;

  // 1. QR troppo piccolo
  if (boxes.qrSizePx < minQr) {
    issues.push(`QR troppo piccolo: ${boxes.qrSizePx}px < minimo ${minQr}px (famiglia "${family}")`);
  }

  // 2. Safe margins — controlla solo qr e cta (le bande full-width sono intenzionali)
  [boxes.qr, boxes.cta].forEach(b => {
    if (!b) return;
    if (b.x < safeM || b.y < safeM || (b.x + b.w) > W - safeM || (b.y + b.h) > H - safeM) {
      issues.push(`Safe margin insufficiente (min ${safeM}px): "${b.label}" [x:${Math.round(b.x)} y:${Math.round(b.y)} w:${Math.round(b.w)} h:${Math.round(b.h)}]`);
    }
  });

  // 3. Possibile sovrapposizione QR ↔ CTA
  if (boxes.qr && boxes.cta) {
    const q = boxes.qr, c = boxes.cta;
    if (q.x < c.x + c.w && q.x + q.w > c.x && q.y < c.y + c.h && q.y + q.h > c.y) {
      issues.push(`Sovrapposizione: QR e CTA si sovrappongono`);
    }
  }

  // 4. Headline troppo lunga
  if (data.headline && boxes.headlineFontEst) {
    const maxW = formatKey === 'led_h' ? W * 0.9 : W * 0.84;
    const fit  = estimateTextFit(data.headline, boxes.headlineFontEst, maxW, 2);
    if (!fit.fits) {
      warnings.push(`Headline troppo lunga: "${data.headline}" → ~${fit.estimatedLines} righe stimate a ${boxes.headlineFontEst}px (max 2)`);
    }
  }

  // 5. Premio principale non dominante
  if (boxes.prizeFontEst && boxes.headlineFontEst) {
    const ratio = boxes.prizeFontEst / boxes.headlineFontEst;
    if (ratio < 0.55) {
      warnings.push(`Premio poco visibile: ~${boxes.prizeFontEst}px vs headline ~${boxes.headlineFontEst}px (ratio ${ratio.toFixed(2)} < 0.55)`);
    }
  }

  // 6. layoutCoverage e contentDensity
  const zoneCandidates = [
    boxes.header, boxes.hero, boxes.prizeZone, boxes.qrZone,
    boxes.qrSection, boxes.content, boxes.leftPanel, boxes.centerPanel,
  ].filter(Boolean);
  const coveredArea    = zoneCandidates.reduce((s, z) => s + z.w * z.h, 0);
  const layoutCoverage = coveredArea / (W * H);

  const contentScore = [
    (data.headline  ?? '').trim().length > 0,
    (data.prizeText ?? '').trim().length > 0,
    (data.cta       ?? '').trim().length > 0,
    boxes.qrSizePx > 0,
    (data.storeName ?? '').trim().length > 0,
  ].filter(Boolean).length;
  const contentDensity = contentScore / 5;

  if (contentDensity < 0.5) {
    warnings.push(`Possibile layout troppo vuoto: ${contentScore}/5 elementi chiave presenti (contentDensity: ${(contentDensity * 100).toFixed(0)}%)`);
  }
  if (layoutCoverage > 0 && layoutCoverage < 0.70) {
    warnings.push(`Layout coverage: ${(layoutCoverage * 100).toFixed(0)}% — warning indicativo, non bloccante`);
  }

  // ── Report ──
  const tag = `[M2 validateLayout] ${formatKey} (${W}×${H})`;
  if (issues.length === 0 && warnings.length === 0) {
    console.log(`${tag} ✅ Nessun problema rilevato`);
  } else {
    if (issues.length > 0) {
      console.group(`${tag} ⚠️  ${issues.length} problema/i`);
      issues.forEach(i => console.warn('  ⚠️ ', i));
      console.groupEnd();
    }
    if (warnings.length > 0) {
      console.group(`${tag} ℹ️  ${warnings.length} warning`);
      warnings.forEach(w => console.log('  ℹ️ ', w));
      console.groupEnd();
    }
  }

  return { issues, warnings, layoutCoverage, contentDensity };
}

// ─── Channel parent → children check/uncheck ─────────────────────────────────

function initChannelCheckboxes() {
  document.querySelectorAll('.channel-head > input[type="checkbox"]').forEach((parent) => {
    parent.addEventListener('change', () => {
      const group = parent.closest('.channel-group');
      group.querySelectorAll('.channel-formats input[type="checkbox"]').forEach((child) => {
        child.checked = parent.checked;
      });
    });
  });
}

// ─── Populate selects ─────────────────────────────────────────────────────────

function populateCampaigns() {
  campaignSelect.innerHTML = state.campaigns
    .map((c) => `<option value="${c.id}">${c.name}</option>`)
    .join('');
}

// ─── Init ─────────────────────────────────────────────────────────────────────

async function init() {
  if (!sessionStorage.getItem('gv_store_user')) {
    show(loginHint);
    return;
  }
  try {
    const [me, campaigns] = await Promise.all([
      api('/api/store/me'),
      api('/api/store/campaigns')
    ]);
    state.store     = me.store;
    state.campaigns = campaigns;
    storeLabel.textContent = `${me.store.name} · ${campaigns.length} campagne`;
    populateCampaigns();
    show(contentApp);
    await renderCanvas();
  } catch (error) {
    setError(error.message);
    show(loginHint);
  }
}

// ─── Event listeners ──────────────────────────────────────────────────────────

renderBtn.addEventListener('click', () => renderCanvas());
campaignSelect.addEventListener('change', () => renderCanvas());
formatPreviewSelect.addEventListener('change', () => {
  updateStoryNav(formatPreviewSelect.value);
  renderCanvas();
});

document.getElementById('storyPrevBtn').addEventListener('click', () => {
  state.storyFrame = (state.storyFrame - 1 + STORY_FRAMES.length) % STORY_FRAMES.length;
  storyFrameLabel.textContent = STORY_FRAMES[state.storyFrame].label;
  renderCanvas('story');
});
document.getElementById('storyNextBtn').addEventListener('click', () => {
  state.storyFrame = (state.storyFrame + 1) % STORY_FRAMES.length;
  storyFrameLabel.textContent = STORY_FRAMES[state.storyFrame].label;
  renderCanvas('story');
});

document.getElementById('downloadSelectedBtn').addEventListener('click', downloadSelected);
document.getElementById('downloadPdfBtn').addEventListener('click', downloadPdf);
document.getElementById('downloadFacebookBtn').addEventListener('click', () => downloadCanvas('facebook'));
document.getElementById('downloadSquareBtn').addEventListener('click', () => downloadCanvas('square'));
document.getElementById('downloadVerticalBtn').addEventListener('click', () => downloadCanvas('vertical'));
document.getElementById('downloadStoryBtn').addEventListener('click', downloadStoryFrames);
document.getElementById('downloadLedHBtn').addEventListener('click', () => downloadCanvas('led_h'));
document.getElementById('downloadLedVBtn').addEventListener('click', () => downloadCanvas('led_v'));
document.getElementById('downloadLedSqBtn').addEventListener('click', () => downloadCanvas('led_sq'));
document.getElementById('download16x9Btn').addEventListener('click', () => downloadCanvas('16x9'));
document.getElementById('download4x3Btn').addEventListener('click', () => downloadCanvas('4x3'));
document.getElementById('downloadLcdVBtn').addEventListener('click', () => downloadCanvas('lcd_v'));
document.getElementById('downloadQrBtn').addEventListener('click', downloadQr);

// ─── M1 Tests ─────────────────────────────────────────────────────────────────

function runTests() {
  let passed = 0, failed = 0;

  function assert(name, condition) {
    if (condition) { console.log(`  ✅ PASS — ${name}`); passed++; }
    else           { console.warn(`  ❌ FAIL — ${name}`); failed++; }
  }

  console.group('[M1] getMainPrize — Bar del Porto');

  assert('Birra (prob 0.20) vince su Sconto (prob 0.80)', (() => {
    const c = { prizeItems: [
      { name: 'Birra 50cl gratis', winProbability: 0.20, totalQuantity: 50,  active: true },
      { name: 'Sconto 10%',        winProbability: 0.80, totalQuantity: 200, active: true },
    ]};
    return getMainPrize(c)?.name === 'Birra 50cl gratis';
  })());

  assert('Tiebreak qty: 10 pz vince su 100 pz (stessa prob)', (() => {
    const c = { prizeItems: [
      { name: 'Gran premio', winProbability: 0.20, totalQuantity: 10,  active: true },
      { name: 'Premio base', winProbability: 0.20, totalQuantity: 100, active: true },
    ]};
    return getMainPrize(c)?.name === 'Gran premio';
  })());

  assert('Un solo premio valido → restituisce quello', (() => {
    const c = { prizeItems: [
      { name: 'Unico premio', winProbability: 0.50, totalQuantity: 30, active: true },
    ]};
    return getMainPrize(c)?.name === 'Unico premio';
  })());

  assert('Tutti inactive o qty=0 → restituisce null', (() => {
    const c = { prizeItems: [
      { name: 'Premio A', winProbability: 0.30, totalQuantity: 0,  active: true  },
      { name: 'Premio B', winProbability: 0.70, totalQuantity: 50, active: false },
    ]};
    return getMainPrize(c) === null;
  })());

  assert('Premio con prob=0 escluso → restituisce quello con prob>0', (() => {
    const c = { prizeItems: [
      { name: 'Nessun premio', winProbability: 0,    totalQuantity: 0,  active: true },
      { name: 'Birra gratis',  winProbability: 0.25, totalQuantity: 50, active: true },
    ]};
    return getMainPrize(c)?.name === 'Birra gratis';
  })());

  assert('Lista vuota → restituisce null', (() => {
    return getMainPrize({ prizeItems: [] }) === null;
  })());

  assert('prizeItems undefined → restituisce null', (() => {
    return getMainPrize({}) === null;
  })());

  console.log(`\n  Risultato M1: ${passed}/${passed + failed} test superati`);
  if (failed > 0) console.warn(`  ⚠️  ${failed} test falliti — verificare getMainPrize`);
  console.groupEnd();

  // ── M2: validateLayout ────────────────────────────────────────────────────
  const mockData = {
    headline:     'Inquadra e vinci',
    subtitle:     'Partecipa e scopri subito il tuo premio.',
    cta:          'Gioca ora',
    prizeText:    '🍺 Birra 50cl gratis',
    campaignName: 'Birra Gratis — Bar del Porto',
    storeName:    'Bar del Porto',
    primary:      '#667eea',
    secondary:    '#764ba2',
    expiresText:  '',
    logoImage:    null,
  };

  const m2Formats = [
    { key: 'a4',    W: FORMAT_SIZES.a4.width,    H: FORMAT_SIZES.a4.height    },
    { key: 'led_h', W: FORMAT_SIZES.led_h.width, H: FORMAT_SIZES.led_h.height },
    { key: 'lcd_v', W: FORMAT_SIZES.lcd_v.width, H: FORMAT_SIZES.lcd_v.height },
  ];

  let m2Passed = 0, m2Failed = 0;
  function assert2(name, condition) {
    if (condition) { console.log(`  ✅ PASS — ${name}`); m2Passed++; }
    else           { console.warn(`  ❌ FAIL — ${name}`); m2Failed++; }
  }

  console.group('[M2] validateLayout — Bar del Porto (output validator completo sotto)');

  for (const { key, W, H } of m2Formats) {
    let boxes;
    assert2(`computeElementBoxes(${key}) non lancia eccezioni`, (() => {
      try { boxes = computeElementBoxes(key, mockData, W, H); return true; }
      catch (e) { console.error(e); return false; }
    })());
    assert2(`${key}: boxes non null`, !!boxes);
    if (!boxes) continue;
    assert2(`${key}: QR >= minimo ${QR_MIN_PX[FORMAT_SIZES[key].family]}px`,
      boxes.qrSizePx >= QR_MIN_PX[FORMAT_SIZES[key].family]);
    assert2(`${key}: QR dentro canvas`,
      boxes.qr.x >= 0 && boxes.qr.y >= 0 &&
      boxes.qr.x + boxes.qr.w <= W && boxes.qr.y + boxes.qr.h <= H);
    assert2(`${key}: validateLayout non lancia eccezioni`, (() => {
      try { validateLayout(boxes, mockData, W, H, key); return true; }
      catch (e) { console.error(e); return false; }
    })());
  }

  // Specifico: QR ↔ CTA no overlap su A4
  assert2('A4: QR e CTA non si sovrappongono', (() => {
    const b = computeBoxes_a4(mockData, FORMAT_SIZES.a4.width, FORMAT_SIZES.a4.height);
    const q = b.qr, c = b.cta;
    return !(q.x < c.x + c.w && q.x + q.w > c.x && q.y < c.y + c.h && q.y + q.h > c.y);
  })());

  // Specifico: QR ↔ CTA no overlap su LCD verticale
  assert2('lcd_v: QR e CTA non si sovrappongono', (() => {
    const b = computeBoxes_lcdv(mockData, FORMAT_SIZES.lcd_v.width, FORMAT_SIZES.lcd_v.height);
    const q = b.qr, c = b.cta;
    return !(q.x < c.x + c.w && q.x + q.w > c.x && q.y < c.y + c.h && q.y + q.h > c.y);
  })());

  // Headline corta → deve stare in 2 righe su tutti i formati
  for (const { key, W, H } of m2Formats) {
    const b   = computeElementBoxes(key, mockData, W, H);
    const maxW = key === 'led_h' ? W * 0.9 : W * 0.84;
    assert2(`${key}: headline "Inquadra e vinci" entra in 2 righe`,
      estimateTextFit(mockData.headline, b.headlineFontEst, maxW, 2).fits);
  }

  // Headline eccessivamente lunga → deve essere rilevata
  assert2('A4: headline da 120 chars rilevata come troppo lunga', (() => {
    const b   = computeBoxes_a4(mockData, FORMAT_SIZES.a4.width, FORMAT_SIZES.a4.height);
    const longHl = 'Questo è un titolo davvero molto lungo che supera certamente il limite di due righe perché contiene troppe parole';
    return !estimateTextFit(longHl, b.headlineFontEst, FORMAT_SIZES.a4.width * 0.84, 2).fits;
  })());

  console.log(`\n  Risultato M2: ${m2Passed}/${m2Passed + m2Failed} test superati`);
  if (m2Failed > 0) console.warn(`  ⚠️  ${m2Failed} test falliti — verificare validateLayout`);
  console.groupEnd();

  return { passed: passed + m2Passed, failed: failed + m2Failed };
}

initChannelCheckboxes();
init().catch((error) => setError(error.message));

if (location.hostname === 'localhost') runTests();
