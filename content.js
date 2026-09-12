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
const printConceptRow     = document.getElementById('printConceptRow');
const printConceptSelect  = document.getElementById('printConceptSelect');

const state = {
  store: null,
  campaigns: [],
  storyFrame: 0,
  lastRenderedFormat: 'a4',
  printConcept: 'D'   // D=festa/sagra (default) · A=vincita · B=fortuna · C=scarsità
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
  // Concept selector only relevant for the A4 print poster
  if (printConceptRow) {
    if (fmt === 'a4') show(printConceptRow);
    else hide(printConceptRow);
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

// ─── M3A: Dynamic print layout engine ────────────────────────────────────────

/**
 * Compute A4 zone boundaries dynamically based on real content.
 * Returns: { headerEnd, heroEnd, prizeEnd, qrEnd, qrH, qrSz, prizeMaxLines, footerH }
 *
 * Strategy (priority order):
 *   1. headerH  — fixed 10.5%
 *   2. footerH  — 7.5% if expiresText, 4.5% otherwise
 *   3. prizeH   — content-aware by prize text length
 *   4. heroH    — content-aware by headline length, min 20%
 *   5. qrH      — all remaining space
 *   6. qrSz     — max(W×0.28, min(W×0.36, qrH×0.55))
 */
function computePrintLayout(data, W, H) {
  const headline     = (data.headline     || '').trim();
  const subtitle     = (data.subtitle     || '').trim();
  const campaignName = (data.campaignName || '').trim();
  const prizeText    = (data.prizeText    || '').trim();
  const expiresText  = (data.expiresText  || '').trim();

  // 1. Header — always fixed: logo + store name
  const headerH = Math.round(H * 0.105);

  // 2. Footer — compact when no expiry to free space for QR
  const footerH = expiresText ? Math.round(H * 0.075) : Math.round(H * 0.045);

  // 3. Prize band — grows with text length to prevent font shrinking
  let prizeH = Math.round(H * 0.10);    // no prize
  if (prizeText) {
    const pLen = prizeText.length;
    if      (pLen <= 20) prizeH = Math.round(H * 0.15);   // 1 line at full size
    else if (pLen <= 40) prizeH = Math.round(H * 0.19);   // 2 lines at full size
    else                 prizeH = Math.round(H * 0.22);   // 3 lines (maxLines: 3)
  }

  // 4. Hero — content-aware, min 20%, max 38%
  const headlineSz   = Math.round(W * 0.088);
  const avgCharW     = headlineSz * 0.52;
  const charsPerLine = Math.max(1, Math.floor((W * 0.84) / avgCharW));
  const hlLines      = Math.min(2, Math.ceil(headline.length / charsPerLine) || 1);
  const lineH        = Math.round(headlineSz * 1.08);
  const badgeH       = campaignName ? Math.round(W * 0.032) + 24 : 0;
  const subH         = subtitle ? Math.round(W * 0.024 * 1.5 * 2) + 12 : 0;
  const contentH     = badgeH + hlLines * lineH + subH;
  const heroH        = Math.max(
    Math.round(H * 0.20),              // min: 20% for visual breathing room
    Math.min(Math.round(H * 0.38), contentH + 110)  // max: 38%
  );

  // 5. QR zone — everything remaining
  const qrH = H - headerH - heroH - prizeH - footerH;

  // 6. QR image size — 28–36% of width, bounded by available height
  const qrSz = Math.round(Math.max(W * 0.28, Math.min(W * 0.36, qrH * 0.55)));

  // 7. Prize maxLines — allow 3 lines for longer texts to avoid truncation
  const prizeMaxLines = prizeText.length > 40 ? 3 : 2;

  return {
    headerEnd:  headerH,
    heroEnd:    headerH + heroH,
    prizeEnd:   headerH + heroH + prizeH,
    qrEnd:      H - footerH,
    qrH,
    qrSz,
    prizeMaxLines,
    heroH,
    prizeH,
    footerH,
  };
}

// ─── Game-psychology copy helpers ────────────────────────────────────────────
//
// These functions generate headlines and labels that trigger the game mindset:
// curiosity, "I might have won", desire to scan NOW — not promotional language.
//
// Rule: the person glancing for 2 seconds should think "Voglio provare"
// NOT "Interessante promozione".

/**
 * Build a question-format headline that creates immediate curiosity.
 * "🍺 HAI VINTO BIRRA?" beats "VINCI BIRRA GRATIS" every time —
 * the question implies the win has ALREADY happened, triggering desire to find out.
 */
function buildGameHeadline(prizeText) {
  if (!prizeText?.trim()) return '🎯 SCOPRI IL TUO PREMIO';

  const stripped   = prizeText.replace(/\p{Emoji_Presentation}\s*/gu, '').trim();
  // Strip common Italian stop words to isolate the key prize noun(s)
  const STOP       = new Set(['di','del','della','dello','per','una','uno','il','la','lo',
                               'le','gli','un','con','su','da','tra','fra','al','ai','agli',
                               'alle','e','o','ma','in','a','se']);
  const words      = stripped.split(/\s+/).filter(Boolean);
  const keyWords   = words.filter(w => w.length >= 2 && !STOP.has(w.toLowerCase()));
  const hook       = (keyWords.slice(0, 2).join(' ') || words.slice(0, 2).join(' ')).toUpperCase();
  const firstEmoji = (prizeText.match(/\p{Emoji_Presentation}/gu) ?? [])[0] ?? '🎁';

  return `${firstEmoji} HAI VINTO ${hook}?`;
}

/**
 * Build a game-style label for the area above the QR code.
 * Replaces generic "Scansiona il QR code e partecipa" —
 * the QR is the BUTTON to enter the game, not just a technical element.
 */
function buildGameQrLabel(prizeText) {
  return prizeText?.trim() ? 'SCOPRI SE HAI VINTO' : 'TENTA LA FORTUNA';
}

function renderPrint(ctx, canvas, qrImage, data) {
  const W = canvas.width, H = canvas.height;
  const { primary, secondary, headline, subtitle, cta, prizeText,
    storeName, campaignName, expiresText, logoImage } = data;
  const cx = W / 2;

  // M3A: dynamic zones — replaces fixed 5-zone proportions
  const layout = computePrintLayout(data, W, H);
  const z = {
    headerEnd: layout.headerEnd,
    heroEnd:   layout.heroEnd,
    prizeEnd:  layout.prizeEnd,
    qrEnd:     layout.qrEnd,
  };

  // ── ZONE 1: HEADER BAND (brand gradient) ──────────────────────────────────
  const hg = ctx.createLinearGradient(0, 0, W, z.headerEnd);
  hg.addColorStop(0, primary);
  hg.addColorStop(1, secondary);
  ctx.fillStyle = hg;
  ctx.fillRect(0, 0, W, z.headerEnd);

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

  // ── ZONE 2: HERO SECTION (white, headline only — no brochure decoration) ──
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, z.headerEnd, W, z.heroEnd - z.headerEnd);

  // Game-psychology headline — creates curiosity and desire to win ("Voglio provare")
  // NOT "Vinci Birra Gratis" (promotional) but "🍺 HAI VINTO BIRRA?" (game).
  // Campaign-name eyebrow removed: it added zero scan-rate value and competed
  // with the headline. The headline is the single curiosity hook.
  const printHeadline = prizeText ? buildGameHeadline(prizeText) : headline;

  // Headline — vertically centered in hero, very large, maximum curiosity
  const heroBandH = z.heroEnd - z.headerEnd;
  let hy = z.headerEnd + Math.round(heroBandH * (subtitle ? 0.16 : 0.24));
  hy = drawTextBlock(ctx, {
    text: printHeadline, x: cx, y: hy,
    maxWidth: W * 0.86,
    maxHeight: Math.round(heroBandH * 0.62),
    startSize: Math.round(W * 0.092), minSize: 42,
    weight: 900, color: '#0f172a', maxLines: 2, lineRatio: 1.08
  });
  hy += 18;

  // Subtitle — only if it carries urgency/desire (user-controlled). Otherwise skipped.
  if (subtitle) {
    drawTextBlock(ctx, {
      text: subtitle, x: cx, y: hy,
      maxWidth: W * 0.7,
      maxHeight: Math.round(heroBandH * 0.15),
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

  // Prize band eyebrow — game-style, not promotional
  const pBandH = z.prizeEnd - z.heroEnd;
  ctx.font = `800 ${Math.round(W * 0.026)}px ${FONT}`;
  ctx.fillStyle = 'rgba(255,255,255,0.72)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText('🎯 PREMIO ISTANTANEO', cx, z.heroEnd + Math.round(pBandH * 0.08));

  // Prize text — HUGE white
  if (prizeText) {
    drawTextBlock(ctx, {
      text: prizeText, x: cx, y: z.heroEnd + Math.round(pBandH * 0.22),
      maxWidth: W * 0.88,
      maxHeight: Math.round(pBandH * 0.6),
      startSize: Math.round(W * 0.072), minSize: 34,
      weight: 900, color: '#ffffff', maxLines: layout.prizeMaxLines, lineRatio: 1.1
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

  const qrSecH   = z.qrEnd - z.prizeEnd;
  const qrSz     = layout.qrSz;   // M3A: from computePrintLayout
  const qrPad    = Math.round(qrSz * 0.065);
  const ctaBtnH  = Math.round(W * 0.052);
  const qrLabelH = Math.round(W * 0.026);
  // M3A fix: prevent qrCard (white box) from overlapping qrTitle text.
  const qrGap    = Math.max(16, qrPad + 4);
  const totalQrH = qrLabelH + qrGap + qrSz + qrPad * 2 + 16 + ctaBtnH;
  const qrStartY = z.prizeEnd + (qrSecH - totalQrH) / 2;

  // Gamification urgency tag — drawn in the breathing room above the QR block.
  // Uses existing empty space, no structural layout change.
  // Urgency = "PREMI LIMITATI", expiry date, or default "TENTATIVO GRATUITO".
  const urgencyLine = expiresText
    ? `⏰ Scade: ${expiresText.replace(/valido fino al\s*/i, '').trim().toUpperCase()}`
    : '⚡ TENTATIVO GRATUITO  ·  PREMI IMMEDIATI';
  const urgSz = Math.round(W * 0.017);
  const urgY  = z.prizeEnd + Math.round(qrSecH * 0.07);
  ctx.font = `700 ${urgSz}px ${FONT}`;
  ctx.fillStyle = hexToRgba(primary, 0.85);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(urgencyLine, cx, urgY);
  ctx.textBaseline = 'alphabetic';

  // QR label — game-style: the QR is the BUTTON to enter the game
  ctx.font = `700 ${qrLabelH}px ${FONT}`;
  ctx.fillStyle = '#1e293b';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(buildGameQrLabel(prizeText), cx, qrStartY);

  drawQrBlock(ctx, qrImage, cx, qrStartY + qrLabelH + qrGap, qrSz, qrPad, Math.round(W * 0.02));
  drawCtaButton(ctx, cta, cx, qrStartY + qrLabelH + qrGap + qrSz + qrPad * 2 + 18, W * 0.58, ctaBtnH, primary, secondary);

  // ── ZONE 5: FOOTER (dark) ─────────────────────────────────────────────────
  // Scan-rate optimised: the lowest-attention zone is converted into a friction
  // reducer ("è veloce e gratis" → lowers the perceived cost of scanning), not a
  // duplicate of the expiry (already shown as urgency near the QR) or the store
  // name (already in the header). Store name kept tiny only to satisfy branding.
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, z.qrEnd, W, H - z.qrEnd);

  const footerCy = z.qrEnd + (H - z.qrEnd) / 2;

  // Friction reducer — main footer line: makes scanning feel effortless
  ctx.font = `800 ${Math.round(W * 0.02)}px ${FONT}`;
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('Bastano 10 secondi · Scopri subito se hai vinto', cx, footerCy - 13);

  // Store name — minimal brand presence only
  ctx.font = `600 ${Math.round(W * 0.015)}px ${FONT}`;
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.fillText(storeName, cx, footerCy + 16);
  ctx.textBaseline = 'alphabetic';
}

// ─── A4 GAME CONCEPTS — built from scratch, optimised for 3-second scan ───────
//
// KPI: probability that a passer-by at a shop window scans the QR within 3s.
// These do NOT look like flyers/ads — they look like instant-win games.
// Three distinct psychological drivers:
//   A · Vincita immediata  — "you already won, reveal it"
//   B · Fortuna            — "try your luck, spin to win"
//   C · Scarsità           — "few prizes left, grab yours now"
//
// Shared rule: only elements that raise scan probability survive.

function seededRandom(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
}

// Festive confetti scattered over a background (stable across renders)
function drawConfetti(ctx, W, H, colors, count = 80) {
  const rnd = seededRandom(20260623);
  for (let i = 0; i < count; i++) {
    const x = rnd() * W, y = rnd() * H;
    const s = 8 + rnd() * 18;
    const rot = rnd() * Math.PI;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.globalAlpha = 0.12 + rnd() * 0.22;
    ctx.fillStyle = colors[i % colors.length];
    ctx.fillRect(-s / 2, -s / 4, s, s / 2);
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

// Wheel-of-fortune motif (segmented circle) used by Concept B
function drawWheel(ctx, cx, cy, r, colA, colB) {
  const segs = 10;
  for (let i = 0; i < segs; i++) {
    const a0 = (i / segs) * Math.PI * 2 - Math.PI / 2;
    const a1 = ((i + 1) / segs) * Math.PI * 2 - Math.PI / 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, a0, a1);
    ctx.closePath();
    ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.95)' : hexToRgba(colB, 0.92);
    ctx.fill();
  }
  // rim
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.lineWidth = Math.max(6, r * 0.06); ctx.strokeStyle = '#ffffff'; ctx.stroke();
  // hub
  ctx.beginPath(); ctx.arc(cx, cy, r * 0.14, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff'; ctx.fill();
  // pointer at top
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.1, cy - r - 6);
  ctx.lineTo(cx + r * 0.1, cy - r - 6);
  ctx.lineTo(cx, cy - r + r * 0.18);
  ctx.closePath();
  ctx.fillStyle = colA; ctx.fill();
}

// Depletion / scarcity bar used by Concept C (nearly empty = urgency)
function drawDepletionBar(ctx, x, y, w, h, ratioLeft, accent) {
  roundedRect(ctx, x, y, w, h, h / 2);
  ctx.fillStyle = 'rgba(255,255,255,0.14)'; ctx.fill();
  const fillW = Math.max(h, w * ratioLeft);
  roundedRect(ctx, x, y, fillW, h, h / 2);
  ctx.fillStyle = accent; ctx.fill();
}

// Remove pictographic emoji from text that is rendered very large — at poster
// sizes color-emoji glyph metrics are unreliable and can overlap adjacent letters.
function stripEmoji(s) {
  return String(s || '').replace(/\p{Extended_Pictographic}/gu, '').replace(/\s+/g, ' ').trim();
}

// ── Conversion-driven visual hierarchy for A4 concepts ───────────────────────
//
// Font sizes are sized for ONE goal: QR scans. Strict, enforced ordering:
//   Premio > CTA > Nome Negozio > QR Label > Scadenza
//
// Hard rules:
//   • No important text (premio/CTA/negozio) under 45px on A4.
//   • Store name never under 60% of the CTA size.
//   • Prize always strictly larger than the CTA, even for long prize names.
//   • Spare space goes to premio → CTA → negozio first, QR last.
function computeA4Hierarchy(data, W) {
  const prizeLen = (stripEmoji(data.prizeText) || 'UN PREMIO').length;

  // CTA — the second most visible element (the action verb near the QR)
  const ctaSize = Math.round(W * 0.056);                       // ~69px @1240

  // Store name — always clearly legible: ≥45px AND ≥60% of CTA
  const storeSize = Math.max(45, Math.round(W * 0.042), Math.round(ctaSize * 0.62)); // ~52px

  // QR label — helper caption, below the store name
  const qrLabelSize = Math.round(W * 0.032);                   // ~40px

  // Expiry / urgency footnote — smallest
  const expirySize = Math.round(W * 0.024);                    // ~30px

  // Prize — dominant. Shrinks with length but never reaches the CTA size.
  let prizeSize =
      prizeLen <= 14 ? Math.round(W * 0.125)   // ~155
    : prizeLen <= 24 ? Math.round(W * 0.103)   // ~128
    : prizeLen <= 40 ? Math.round(W * 0.086)   // ~107
    :                  Math.round(W * 0.072);  // ~89
  prizeSize = Math.max(prizeSize, ctaSize + 14);

  return { prizeSize, ctaSize, storeSize, qrLabelSize, expirySize };
}

// Log + verify the numeric hierarchy before drawing (localhost only).
function logA4Hierarchy(h, concept) {
  const order = [
    ['Premio',       h.prizeSize],
    ['CTA',          h.ctaSize],
    ['Nome Negozio', h.storeSize],
    ['QR Label',     h.qrLabelSize],
    ['Scadenza',     h.expirySize],
  ];
  let ok = true;
  for (let i = 1; i < order.length; i++) if (order[i][1] >= order[i - 1][1]) ok = false;
  const ruleStore = h.storeSize >= 45 && h.storeSize >= h.ctaSize * 0.6;
  const ruleMin   = h.prizeSize >= 45 && h.ctaSize >= 45 && h.storeSize >= 45;

  console.group(`[A4 Hierarchy] Concept ${concept}  ${ok && ruleStore && ruleMin ? '✅' : '❌'}`);
  order.forEach(([k, v]) => console.log(`  ${k.padEnd(13)} ${v}px`));
  console.log(`  Ordine Premio>CTA>Negozio>QRLabel>Scadenza: ${ok ? 'PASS' : 'FAIL'}`);
  console.log(`  Negozio ≥45px e ≥60% CTA: ${ruleStore ? 'PASS' : 'FAIL'}`);
  console.log(`  Testi importanti ≥45px:   ${ruleMin ? 'PASS' : 'FAIL'}`);
  console.groupEnd();
  return ok && ruleStore && ruleMin;
}

// ── Concept A — VINCITA IMMEDIATA ─────────────────────────────────────────────
// Looks like an already-scratched winning ticket. Dark + gold = "jackpot".
function renderPrintWinA(ctx, canvas, qrImage, data) {
  const W = canvas.width, H = canvas.height, cx = W / 2;
  const { prizeText, storeName, expiresText, logoImage } = data;
  const GOLD = '#f6c945', DARK = '#0b1020';
  const prize = stripEmoji(prizeText) || 'UN PREMIO';
  const h = computeA4Hierarchy(data, W);

  // Background + warm spotlight behind the prize
  ctx.fillStyle = DARK; ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(cx, H * 0.38, 30, cx, H * 0.38, W * 0.9);
  glow.addColorStop(0, hexToRgba(GOLD, 0.30));
  glow.addColorStop(1, 'rgba(11,16,32,0)');
  ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);

  // ── Store name — prominent, never a footnote ──
  let y = Math.round(H * 0.05);
  if (logoImage) {
    const ls = Math.round(W * 0.08);
    drawLogo(ctx, logoImage, cx - ls / 2, y, ls, GOLD, 12);
    y += ls + 14;
  }
  ctx.font = `800 ${h.storeSize}px ${FONT}`;
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.fillText((storeName || '').toUpperCase(), cx, y);
  y += Math.round(h.storeSize * 1.25);

  // "HAI VINTO" eyebrow — frames the win as already happened (sized as CTA)
  ctx.font = `900 ${h.ctaSize}px ${FONT}`;
  ctx.fillStyle = GOLD;
  ctx.fillText('HAI VINTO', cx, y);
  y += Math.round(h.ctaSize * 1.12);
  ctx.textBaseline = 'alphabetic';

  // ── PRIZE — the single most visible element ──
  y = drawTextBlock(ctx, {
    text: prize, x: cx, y,
    maxWidth: W * 0.9, maxHeight: H * 0.26,
    startSize: h.prizeSize, minSize: h.ctaSize + 8,
    weight: 900, color: '#ffffff', maxLines: 3, lineRatio: 1.02
  });
  y += Math.round(H * 0.012);

  // Curiosity twist
  ctx.font = `600 ${h.expirySize}px ${FONT}`;
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.fillText('…o forse no. Scoprilo adesso.', cx, y);
  y += Math.round(h.expirySize * 1.6);
  ctx.textBaseline = 'alphabetic';

  // ── Winning-ticket panel with the QR (large but below the prize) ──
  const qrSz   = Math.round(W * 0.38);
  const pad    = Math.round(qrSz * 0.08);
  const cardW  = Math.round(W * 0.66);
  const cardH  = pad + h.ctaSize + pad * 0.6 + qrSz + pad * 2 + pad;
  const cardX  = cx - cardW / 2;
  const cardY  = Math.round(H * 0.45);

  // Guiding chevron between prize and card — fills space AND drives eye to QR
  const chevY = y + Math.round((cardY - y) * 0.34);
  ctx.strokeStyle = hexToRgba(GOLD, 0.85);
  ctx.lineWidth = Math.round(W * 0.012);
  ctx.lineCap = 'round';
  const chW = Math.round(W * 0.05);
  ctx.beginPath();
  ctx.moveTo(cx - chW, chevY); ctx.lineTo(cx, chevY + chW * 0.7); ctx.lineTo(cx + chW, chevY);
  ctx.stroke();
  ctx.lineCap = 'butt';
  roundedRect(ctx, cardX, cardY, cardW, cardH, 28);
  ctx.fillStyle = '#ffffff'; ctx.fill();
  ctx.setLineDash([18, 12]);
  ctx.strokeStyle = GOLD; ctx.lineWidth = 5;
  roundedRect(ctx, cardX + 13, cardY + 13, cardW - 26, cardH - 26, 20); ctx.stroke();
  ctx.setLineDash([]);

  // ── CTA — second most visible element ──
  ctx.font = `900 ${h.ctaSize}px ${FONT}`;
  ctx.fillStyle = DARK; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.fillText('SCANSIONA E GIOCA', cx, cardY + pad);
  ctx.textBaseline = 'alphabetic';
  const qrTop = cardY + pad + h.ctaSize + Math.round(pad * 0.6);
  drawQrBlock(ctx, qrImage, cx, qrTop, qrSz, pad, 16, '#ffffff');

  // QR label — helper caption under the card
  const labelY = cardY + cardH + Math.round(H * 0.022);
  ctx.font = `700 ${h.qrLabelSize}px ${FONT}`;
  ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.fillText('Scopri se il premio è tuo', cx, labelY);
  ctx.textBaseline = 'alphabetic';

  // Expiry / urgency — smallest
  const urg = expiresText ? expiresText.toUpperCase() : 'PREMIO DA RITIRARE SUBITO';
  ctx.font = `800 ${h.expirySize}px ${FONT}`;
  ctx.fillStyle = GOLD; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.fillText(urg, cx, labelY + Math.round(h.qrLabelSize * 1.4));
  ctx.textBaseline = 'alphabetic';
}

// ── Concept B — FORTUNA ───────────────────────────────────────────────────────
// Wheel-of-fortune energy. The QR sits at the centre of the wheel = "spin to win".
function renderPrintLuckB(ctx, canvas, qrImage, data) {
  const W = canvas.width, H = canvas.height, cx = W / 2;
  const { primary, secondary, prizeText, storeName, expiresText, logoImage } = data;
  const P = primary || '#7c3aed', S = secondary || '#ec4899';
  const prize = stripEmoji(prizeText) || 'UN PREMIO';
  const h = computeA4Hierarchy(data, W);

  // Vibrant diagonal gradient + confetti
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, P); bg.addColorStop(1, S);
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  drawConfetti(ctx, W, H, ['#ffffff', '#ffe98a', '#9ae6b4']);

  // ── Store name — prominent ──
  let y = Math.round(H * 0.04);
  if (logoImage) {
    const ls = Math.round(W * 0.07);
    drawLogo(ctx, logoImage, cx - ls / 2, y, ls, '#ffffff', 12);
    y += ls + 12;
  }
  ctx.font = `800 ${h.storeSize}px ${FONT}`;
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.fillText((storeName || '').toUpperCase(), cx, y);
  y += Math.round(h.storeSize * 1.2);
  ctx.textBaseline = 'alphabetic';

  // Eyebrow "IN PALIO" + PRIZE — dominant
  ctx.font = `800 ${Math.round(h.expirySize * 1.05)}px ${FONT}`;
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.fillText('IN PALIO', cx, y);
  y += Math.round(h.expirySize * 1.4);
  ctx.textBaseline = 'alphabetic';

  y = drawTextBlock(ctx, {
    text: prize, x: cx, y,
    maxWidth: W * 0.9, maxHeight: H * 0.2,
    startSize: h.prizeSize, minSize: h.ctaSize + 8,
    weight: 900, color: '#ffe98a', maxLines: 3, lineRatio: 1.02
  });
  y += Math.round(H * 0.012);

  // Fortune wheel with the QR at its centre — large but secondary to the prize
  const cyW   = Math.round(H * 0.66);
  const R     = Math.round(W * 0.30);
  drawWheel(ctx, cx, cyW, R, '#ffe98a', S);
  const rIn = Math.round(R * 0.66);
  ctx.beginPath(); ctx.arc(cx, cyW, rIn, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff'; ctx.fill();
  const qrSz = Math.round(rIn * 1.32);
  ctx.drawImage(qrImage, cx - qrSz / 2, cyW - qrSz / 2, qrSz, qrSz);

  // ── CTA under the wheel — second most visible ──
  const ctaY = cyW + R + Math.round(H * 0.028);
  ctx.font = `900 ${h.ctaSize}px ${FONT}`;
  ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.fillText('GIRA E VINCI', cx, ctaY);
  ctx.textBaseline = 'alphabetic';

  // QR label — helper caption
  const labelY = ctaY + Math.round(h.ctaSize * 1.12);
  ctx.font = `700 ${h.qrLabelSize}px ${FONT}`;
  ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.fillText('Inquadra e scopri se hai vinto', cx, labelY);
  ctx.textBaseline = 'alphabetic';

  // Expiry / free-try reducer — smallest, very bottom
  const urg = expiresText ? expiresText : 'Un tentativo gratis · Premi immediati';
  ctx.font = `600 ${h.expirySize}px ${FONT}`;
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.fillText(urg, cx, labelY + Math.round(h.qrLabelSize * 1.3));
  ctx.textBaseline = 'alphabetic';
}

// ── Concept C — SCARSITÀ / PREMI LIMITATI ─────────────────────────────────────
// FOMO. Dark stage + red alert. Depletion bar screams "almost gone".
function renderPrintScarcityC(ctx, canvas, qrImage, data) {
  const W = canvas.width, H = canvas.height, cx = W / 2;
  const { prizeText, storeName, expiresText, logoImage } = data;
  const RED = '#ef2d56', DARK = '#0f1115';
  const prize = stripEmoji(prizeText) || 'UN PREMIO';
  const h = computeA4Hierarchy(data, W);

  ctx.fillStyle = DARK; ctx.fillRect(0, 0, W, H);

  // Top alert bar — full width red
  const barH = Math.round(H * 0.065);
  ctx.fillStyle = RED; ctx.fillRect(0, 0, W, barH);
  ctx.font = `900 ${Math.round(W * 0.026)}px ${FONT}`;
  ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('PREMI LIMITATI · AFFRETTATI', cx, barH / 2);
  ctx.textBaseline = 'alphabetic';

  // ── Store name — prominent ──
  let y = barH + Math.round(H * 0.025);
  if (logoImage) {
    const ls = Math.round(W * 0.07);
    drawLogo(ctx, logoImage, cx - ls / 2, y, ls, RED, 12);
    y += ls + 10;
  }
  ctx.font = `800 ${h.storeSize}px ${FONT}`;
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.fillText((storeName || '').toUpperCase(), cx, y);
  y += Math.round(h.storeSize * 1.2);

  // Scarcity eyebrow
  ctx.font = `800 ${Math.round(h.expirySize * 1.05)}px ${FONT}`;
  ctx.fillStyle = RED;
  ctx.fillText('ULTIMI PREMI DISPONIBILI', cx, y);
  y += Math.round(h.expirySize * 1.5);
  ctx.textBaseline = 'alphabetic';

  // ── PRIZE inside a red-bordered "stock" box — dominant ──
  const boxW = Math.round(W * 0.86);
  const boxX = cx - boxW / 2;
  const boxH = Math.round(H * 0.17);
  roundedRect(ctx, boxX, y, boxW, boxH, 24);
  ctx.fillStyle = 'rgba(239,45,86,0.10)'; ctx.fill();
  ctx.strokeStyle = RED; ctx.lineWidth = 4;
  roundedRect(ctx, boxX, y, boxW, boxH, 24); ctx.stroke();
  drawTextBlock(ctx, {
    text: prize, x: cx, y: y + Math.round(boxH * 0.16),
    maxWidth: boxW * 0.9, maxHeight: boxH * 0.68,
    startSize: h.prizeSize, minSize: h.ctaSize + 8,
    weight: 900, color: '#ffffff', maxLines: 3, lineRatio: 1.02
  });
  y += boxH + Math.round(H * 0.022);

  // Depletion bar — "quasi esauriti"
  const barW = Math.round(W * 0.78);
  drawDepletionBar(ctx, cx - barW / 2, y, barW, Math.round(H * 0.02), 0.18, RED);
  y += Math.round(H * 0.02) + 10;
  ctx.font = `800 ${h.expirySize}px ${FONT}`;
  ctx.fillStyle = RED; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.fillText('QUASI ESAURITI', cx, y);
  ctx.textBaseline = 'alphabetic';

  // ── QR card with CTA ── (placed right after the depletion bar, no dead space)
  const qrSz   = Math.round(W * 0.36);
  const pad    = Math.round(qrSz * 0.08);
  const cardW  = Math.round(W * 0.64);
  const cardH  = pad + h.ctaSize + Math.round(pad * 0.6) + qrSz + pad * 2 + pad;
  const cardX  = cx - cardW / 2;
  const cardY  = y + Math.round(H * 0.04);
  roundedRect(ctx, cardX, cardY, cardW, cardH, 24);
  ctx.fillStyle = '#ffffff'; ctx.fill();

  // CTA — second most visible
  ctx.font = `900 ${h.ctaSize}px ${FONT}`;
  ctx.fillStyle = RED; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.fillText('PRENDI IL TUO', cx, cardY + pad);
  ctx.textBaseline = 'alphabetic';
  const qrTop = cardY + pad + h.ctaSize + Math.round(pad * 0.6);
  drawQrBlock(ctx, qrImage, cx, qrTop, qrSz, pad, 16, '#ffffff');

  // QR label helper
  const labelY = cardY + cardH + Math.round(H * 0.02);
  ctx.font = `700 ${h.qrLabelSize}px ${FONT}`;
  ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.fillText('Scansiona e prendi il tuo premio', cx, labelY);
  ctx.textBaseline = 'alphabetic';

  // Expiry — smallest
  const urg = expiresText ? expiresText.toUpperCase() : 'PRIMA CHE FINISCANO';
  ctx.font = `800 ${h.expirySize}px ${FONT}`;
  ctx.fillStyle = RED; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.fillText(urg, cx, labelY + Math.round(h.qrLabelSize * 1.35));
  ctx.textBaseline = 'alphabetic';
}

// ── Concept D — FESTA / SAGRA ─────────────────────────────────────────────────
// White poster, Italian "sagra" energy: brushstroke prize bands (red/yellow/navy),
// store name banner, chevron CTA, central QR flanked by trophy + gift icons,
// dark bottom bar with stopwatch + expiry. Built to look like a prize game.

const FESTA = { red: '#e1251b', yellow: '#f5c518', navy: '#16203a', white: '#ffffff' };

// Split prize into punchy UPPERCASE lines for the festa bands.
// Strips Italian filler words, prefers ONE word per band (max 4 bands);
// if more remain, the surplus is merged into the last band (auto-shrunk to fit).
function festaPrizeLines(prize) {
  const FILLER = new Set(['per','di','del','della','dello','dei','degli','delle','e','ed',
    'il','la','lo','i','gli','le','un','una','uno','con','da','a','al','in','su','o']);
  const words = stripEmoji(prize).toUpperCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return ['PREMIO'];
  const meaningful = words.filter(w => !FILLER.has(w.toLowerCase()));
  const use = meaningful.length ? meaningful : words;
  if (use.length <= 4) return use;
  return [...use.slice(0, 3), use.slice(3).join(' ')];
}

// Draw one centered band line, shrinking on WIDTH so words are never dropped.
function drawFestaLine(ctx, text, cx, midY, maxWidth, maxSize, color) {
  let size = maxSize;
  do {
    ctx.font = `900 ${size}px ${FONT}`;
    if (ctx.measureText(text).width <= maxWidth) break;
    size -= 4;
  } while (size > 34);
  ctx.font = `900 ${size}px ${FONT}`;
  ctx.fillStyle = color;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, cx, midY);
  ctx.textBaseline = 'alphabetic';
}

// Brushstroke band: rounded rectangle with slightly rough top/bottom edges
function drawBrushBand(ctx, x, y, w, h, color) {
  ctx.save();
  ctx.fillStyle = color;
  const segs = 7, amp = h * 0.05, r = h * 0.14;
  ctx.beginPath();
  ctx.moveTo(x + r, y + amp);
  for (let i = 1; i <= segs; i++) ctx.lineTo(x + (w / segs) * i, y + (i % 2 ? 0 : amp));
  ctx.lineTo(x + w, y + h - amp);
  for (let i = segs - 1; i >= 0; i--) ctx.lineTo(x + (w / segs) * i, y + h - (i % 2 ? amp : 0));
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

// Radiating spark burst (sagra "pop")
function drawBurst(ctx, x, y, len, color) {
  ctx.save();
  ctx.strokeStyle = color; ctx.lineCap = 'round';
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI * 0.55 + (i / 4) * Math.PI * 1.1;
    ctx.lineWidth = len * 0.16;
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(a) * len * 0.45, y + Math.sin(a) * len * 0.45);
    ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
    ctx.stroke();
  }
  ctx.restore();
}

function drawIconCircle(ctx, cx, cy, r, bg) {
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = bg; ctx.fill();
}

function drawTrophyIcon(ctx, cx, cy, s) {
  ctx.save();
  ctx.fillStyle = '#fff'; ctx.strokeStyle = '#fff'; ctx.lineWidth = s * 0.09;
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.30, cy - s * 0.38);
  ctx.lineTo(cx + s * 0.30, cy - s * 0.38);
  ctx.lineTo(cx + s * 0.22, cy + s * 0.02);
  ctx.quadraticCurveTo(cx, cy + s * 0.22, cx - s * 0.22, cy + s * 0.02);
  ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.arc(cx - s * 0.34, cy - s * 0.20, s * 0.14, Math.PI * 0.45, Math.PI * 1.55); ctx.stroke();
  ctx.beginPath(); ctx.arc(cx + s * 0.34, cy - s * 0.20, s * 0.14, -Math.PI * 0.55, Math.PI * 0.55); ctx.stroke();
  ctx.fillRect(cx - s * 0.06, cy + s * 0.16, s * 0.12, s * 0.18);
  ctx.fillRect(cx - s * 0.22, cy + s * 0.34, s * 0.44, s * 0.09);
  // star on cup
  ctx.fillStyle = FESTA.red;
  drawStar(ctx, cx, cy - s * 0.16, s * 0.13, s * 0.06, 5);
  ctx.restore();
}

function drawStar(ctx, cx, cy, outer, inner, points) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2;
    ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  }
  ctx.closePath(); ctx.fill();
}

function drawGiftIcon(ctx, cx, cy, s) {
  ctx.save();
  ctx.fillStyle = '#fff';
  ctx.fillRect(cx - s * 0.32, cy - s * 0.12, s * 0.64, s * 0.46);   // box
  ctx.fillRect(cx - s * 0.36, cy - s * 0.22, s * 0.72, s * 0.14);   // lid
  ctx.fillStyle = FESTA.navy;
  ctx.fillRect(cx - s * 0.05, cy - s * 0.22, s * 0.10, s * 0.56);   // vertical ribbon
  // bow
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.ellipse(cx - s * 0.16, cy - s * 0.30, s * 0.14, s * 0.10, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(cx + s * 0.16, cy - s * 0.30, s * 0.14, s * 0.10, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function drawStopwatchIcon(ctx, cx, cy, s, color) {
  ctx.save();
  ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = s * 0.09;
  ctx.fillRect(cx - s * 0.10, cy - s * 0.52, s * 0.20, s * 0.12);   // top button
  ctx.beginPath(); ctx.arc(cx, cy + s * 0.02, s * 0.40, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx, cy + s * 0.02); ctx.lineTo(cx, cy - s * 0.22);
  ctx.moveTo(cx, cy + s * 0.02); ctx.lineTo(cx + s * 0.18, cy + s * 0.06);
  ctx.lineCap = 'round'; ctx.stroke();
  ctx.restore();
}

function renderPrintFestaD(ctx, canvas, qrImage, data) {
  const W = canvas.width, H = canvas.height, cx = W / 2;
  const { prizeText, storeName, expiresText, logoImage } = data;
  const prize = stripEmoji(prizeText) || 'UN PREMIO';
  const side = Math.round(W * 0.05);

  // White background
  ctx.fillStyle = FESTA.white; ctx.fillRect(0, 0, W, H);

  // ── Store name banner ──
  let y = Math.round(H * 0.03);
  if (logoImage) {
    const ls = Math.round(W * 0.085);
    drawLogo(ctx, logoImage, cx - ls / 2, y, ls, FESTA.red, 14);
    y += ls + 10;
  }
  const storeText = (storeName || '').toUpperCase();
  let stSize = Math.round(W * 0.088);
  do {
    ctx.font = `900 ${stSize}px ${FONT}`;
    if (ctx.measureText(storeText).width <= W * 0.9) break;
    stSize -= 4;
  } while (stSize > 36);
  ctx.font = `900 ${stSize}px ${FONT}`;
  ctx.fillStyle = FESTA.navy; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.fillText(storeText, cx, y);
  ctx.textBaseline = 'alphabetic';
  y = y + stSize + Math.round(H * 0.006);

  // Flourish: red line · star · red line
  const fy = y + Math.round(H * 0.012);
  ctx.strokeStyle = FESTA.red; ctx.lineWidth = Math.round(H * 0.005); ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(cx - W * 0.18, fy); ctx.lineTo(cx - W * 0.05, fy); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx + W * 0.05, fy); ctx.lineTo(cx + W * 0.18, fy); ctx.stroke();
  ctx.lineCap = 'butt';
  ctx.fillStyle = FESTA.yellow; drawStar(ctx, cx, fy, W * 0.022, W * 0.01, 5);
  y = fy + Math.round(H * 0.02);

  // ── Prize bands — the dominant element ──
  const lines = festaPrizeLines(prize);
  const bandsTop = y;
  const bandsBot = Math.round(H * 0.575);
  const gap = Math.round(H * 0.006);
  const bandH = Math.floor((bandsBot - bandsTop - gap * (lines.length - 1)) / lines.length);
  const bandW = Math.round(W * 0.9);

  lines.forEach((line, i) => {
    const by = bandsTop + i * (bandH + gap);
    const style = i === 0 ? 'redText' : (i % 2 === 1 ? 'yellowBand' : 'redBand');

    if (style === 'yellowBand') drawBrushBand(ctx, cx - bandW / 2, by, bandW, bandH, FESTA.yellow);
    if (style === 'redBand')    drawBrushBand(ctx, cx - bandW / 2, by, bandW, bandH, FESTA.red);
    if (style === 'redText') {
      drawBurst(ctx, cx - bandW * 0.42, by + bandH * 0.5, bandH * 0.42, FESTA.yellow);
      drawBurst(ctx, cx + bandW * 0.42, by + bandH * 0.5, bandH * 0.42, FESTA.yellow);
    }
    const color = style === 'redText' ? FESTA.red : style === 'yellowBand' ? FESTA.navy : FESTA.white;
    drawFestaLine(ctx, line, cx, by + bandH / 2, bandW * 0.82, Math.round(bandH * 0.74), color);
  });

  // ── CTA with chevrons ──
  const ctaY = bandsBot + Math.round(H * 0.022);
  const ctaSize = Math.round(W * 0.046);
  ctx.font = `900 ${ctaSize}px ${FONT}`;
  const ctaText = 'SCANSIONA E GIOCA ORA!';
  const ctaW = ctx.measureText(ctaText).width;
  ctx.fillStyle = FESTA.navy; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(ctaText, cx, ctaY);
  ctx.fillStyle = FESTA.red;
  ctx.textAlign = 'left';  ctx.fillText('»', cx - ctaW / 2 - W * 0.05, ctaY);
  ctx.textAlign = 'right'; ctx.fillText('«', cx + ctaW / 2 + W * 0.05, ctaY);
  ctx.textBaseline = 'alphabetic';

  // ── Central QR flanked by trophy (left) and gift (right) ──
  const qrSz  = Math.round(W * 0.34);
  const qrTop = ctaY + Math.round(H * 0.03);
  const qrPad = Math.round(qrSz * 0.07);
  roundedRect(ctx, cx - qrSz / 2 - qrPad, qrTop - qrPad, qrSz + qrPad * 2, qrSz + qrPad * 2, 18);
  ctx.fillStyle = '#fff'; ctx.fill();
  ctx.strokeStyle = FESTA.navy; ctx.lineWidth = 4;
  roundedRect(ctx, cx - qrSz / 2 - qrPad, qrTop - qrPad, qrSz + qrPad * 2, qrSz + qrPad * 2, 18); ctx.stroke();
  ctx.drawImage(qrImage, cx - qrSz / 2, qrTop, qrSz, qrSz);
  const qrMidY = qrTop + qrSz / 2;

  const iconR = Math.round(W * 0.075);
  const lX = Math.round(W * 0.145), rX = Math.round(W * 0.855);
  const labelSize = Math.round(W * 0.026);

  drawIconCircle(ctx, lX, qrMidY, iconR, FESTA.red);
  drawTrophyIcon(ctx, lX, qrMidY, iconR * 1.15);
  drawIconCircle(ctx, rX, qrMidY, iconR, FESTA.yellow);
  drawGiftIcon(ctx, rX, qrMidY, iconR * 1.15);

  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.font = `800 ${labelSize}px ${FONT}`;
  ctx.fillStyle = FESTA.navy; ctx.fillText('SCOPRI SUBITO', lX, qrMidY + iconR + 14);
  ctx.fillStyle = FESTA.red;  ctx.fillText('SE HAI VINTO', lX, qrMidY + iconR + 14 + labelSize * 1.2);
  ctx.fillStyle = FESTA.navy; ctx.fillText('PREMI', rX, qrMidY + iconR + 14);
  ctx.fillStyle = FESTA.red;  ctx.fillText('IMMEDIATI', rX, qrMidY + iconR + 14 + labelSize * 1.2);
  ctx.textBaseline = 'alphabetic';

  // ── Bottom dark bar: stopwatch + free participation + expiry ──
  const barH = Math.round(H * 0.095);
  const barY = H - barH - Math.round(H * 0.03);
  roundedRect(ctx, side, barY, W - side * 2, barH, 22);
  ctx.fillStyle = FESTA.navy; ctx.fill();
  const barMid = barY + barH / 2;

  drawStopwatchIcon(ctx, side + barH * 0.55, barMid, barH * 0.5, FESTA.yellow);

  const colSize = Math.round(W * 0.028);
  const divX = expiresText ? Math.round(W * 0.56) : null;
  const leftCx = expiresText ? Math.round(W * 0.37) : cx + barH * 0.3;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = `800 ${colSize}px ${FONT}`;
  ctx.fillStyle = '#fff';        ctx.fillText('PARTECIPAZIONE', leftCx, barMid - colSize * 0.6);
  ctx.fillStyle = FESTA.yellow;  ctx.fillText('GRATUITA',      leftCx, barMid + colSize * 0.6);

  if (expiresText) {
    ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(divX, barY + barH * 0.22); ctx.lineTo(divX, barY + barH * 0.78); ctx.stroke();
    const dateOnly = expiresText.replace(/valido fino al\s*/i, '').trim();
    const rightCx = Math.round(W * 0.74);
    ctx.fillStyle = '#fff';       ctx.font = `700 ${Math.round(colSize * 0.82)}px ${FONT}`;
    ctx.fillText('VALIDO FINO AL', rightCx, barMid - colSize * 0.6);
    ctx.fillStyle = FESTA.yellow; ctx.font = `900 ${colSize}px ${FONT}`;
    ctx.fillText(dateOnly, rightCx, barMid + colSize * 0.6);
  }
  ctx.textBaseline = 'alphabetic';
}

// Dispatch A4 print to the selected game concept (default: A)
function renderPrintConcept(ctx, canvas, qrImage, data) {
  const concept = state.printConcept || 'D';
  // Compute + verify the numeric visual hierarchy before drawing (localhost only)
  if (typeof location !== 'undefined' && location.hostname === 'localhost' && concept !== 'D') {
    logA4Hierarchy(computeA4Hierarchy(data, canvas.width), concept);
  }
  switch (concept) {
    case 'A': return renderPrintWinA(ctx, canvas, qrImage, data);
    case 'B': return renderPrintLuckB(ctx, canvas, qrImage, data);
    case 'C': return renderPrintScarcityC(ctx, canvas, qrImage, data);
    case 'D':
    default:  return renderPrintFestaD(ctx, canvas, qrImage, data);
  }
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

// Hand-drawn style curved arrow pointing from (x1,y1) to (x2,y2)
function drawCurvedArrow(ctx, x1, y1, x2, y2, color, lw) {
  ctx.save();
  ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = lw; ctx.lineCap = 'round';
  const cpx = x1 - (y2 - y1) * 0.5, cpy = (y1 + y2) / 2;
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.quadraticCurveTo(cpx, cpy, x2, y2); ctx.stroke();
  const ang = Math.atan2(y2 - cpy, x2 - cpx);
  const ah = lw * 3.4;
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - ah * Math.cos(ang - 0.45), y2 - ah * Math.sin(ang - 0.45));
  ctx.lineTo(x2 - ah * Math.cos(ang + 0.45), y2 - ah * Math.sin(ang + 0.45));
  ctx.closePath(); ctx.fill();
  ctx.restore();
}

// Luminance check for text-on-band contrast
function isLightHex(hex) {
  const h = (hex || '#888').replace('#', '');
  if (h.length < 6) return false;
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 155;
}

// Reference-style dark background with accent glow
function drawSocialBg(ctx, W, H, primary, secondary) {
  const cx = W / 2;
  ctx.fillStyle = '#0a0a0a';
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(cx, H * 0.26, W * 0.04, cx, H * 0.32, W * 0.82);
  glow.addColorStop(0, hexToRgba(secondary, 0.62));
  glow.addColorStop(0.38, hexToRgba(primary, 0.38));
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);
  const edge = ctx.createLinearGradient(0, 0, 0, H);
  edge.addColorStop(0, 'rgba(0,0,0,0.35)'); edge.addColorStop(0.55, 'rgba(0,0,0,0)');
  edge.addColorStop(1, 'rgba(0,0,0,0.42)');
  ctx.fillStyle = edge;
  ctx.fillRect(0, 0, W, H);
}

function socialAccent(secondary) {
  return isLightHex(secondary) ? secondary : FESTA.yellow;
}

function socialBandInk(accent) {
  return isLightHex(accent) ? FESTA.navy : '#ffffff';
}

function socialEyebrow(headline) {
  const h = (headline || '').trim();
  return (h && h.toLowerCase() !== 'inquadra e vinci') ? h.toUpperCase() : 'POTRESTI AVER VINTO';
}
function socialCtaText(cta) {
  const c = (cta || '').trim();
  return (c && c.toLowerCase() !== 'gioca ora') ? c.toUpperCase() : 'SCANSIONA E GIOCA';
}

function renderSocial(ctx, canvas, qrImage, data) {
  const W = canvas.width, H = canvas.height;
  const isSquare = W === H;
  const { primary, secondary, headline, cta, prizeText, storeName, expiresText } = data;
  const cx = W / 2;
  const prize   = (stripEmoji(prizeText) || 'UN PREMIO').toUpperCase();
  const eyebrow = socialEyebrow(headline);
  const ctaText = socialCtaText(cta);
  const accent  = socialAccent(secondary);
  const ink     = socialBandInk(accent);
  const plines  = festaPrizeLines(prize);
  const burstLen = Math.round(W * 0.038);

  drawSocialBg(ctx, W, H, primary, secondary);

  // ── Store name: "— NOME —" ──
  let y = Math.round(H * (isSquare ? 0.042 : 0.038));
  const snLabel = '— ' + storeName.toUpperCase() + ' —';
  let snSz = Math.round(W * (isSquare ? 0.038 : 0.04));
  do { ctx.font = `700 ${snSz}px ${FONT}`; if (ctx.measureText(snLabel).width <= W * 0.92) break; snSz -= 2; } while (snSz > 22);
  ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.fillText(snLabel, cx, y);
  y += Math.round(snSz * (isSquare ? 1.65 : 1.75));

  // ── Eyebrow hook ──
  const ebSz = Math.round(W * (isSquare ? 0.058 : 0.072));
  ctx.font = `900 ${ebSz}px ${FONT}`; ctx.fillStyle = '#ffffff';
  const ebLines = wrapTextLines(ctx, eyebrow, W * 0.9);
  ebLines.slice(0, 2).forEach((line, i) => ctx.fillText(line, cx, y + Math.round(ebSz * 1.08 * i)));
  y += Math.round(ebSz * (ebLines.length > 1 ? 2.2 : 1.15) + H * (isSquare ? 0.018 : 0.024));

  // ── Prize hero — accent brush band + yellow bursts ──
  let lineSz = Math.round(W * (isSquare ? (plines.length >= 3 ? 0.088 : 0.102) : 0.112));
  const lineH = Math.round(lineSz * 1.08);
  const bandPadY = Math.round(H * 0.014);
  const bandH = lineH * plines.length + bandPadY * 2;
  const bandW = Math.round(W * 0.92);
  drawBrushBand(ctx, cx - bandW / 2, y, bandW, bandH, accent);
  drawBurst(ctx, cx - bandW / 2 - W * 0.022, y + bandH / 2, burstLen, FESTA.yellow);
  drawBurst(ctx, cx + bandW / 2 + W * 0.022, y + bandH / 2, burstLen, FESTA.yellow);
  plines.forEach((line, i) => {
    drawFestaLine(ctx, line, cx, y + bandPadY + lineH * i + lineH / 2, bandW * 0.86, lineSz, ink);
  });
  y += bandH + Math.round(H * (isSquare ? 0.022 : 0.028));

  // ── "Scoprilo ora" + yellow arrow (vertical) ──
  if (!isSquare) {
    ctx.font = `800 ${Math.round(W * 0.048)}px ${FONT}`; ctx.fillStyle = '#ffffff';
    ctx.fillText('SCOPRILO ORA', cx + W * 0.04, y);
    drawCurvedArrow(ctx, cx - W * 0.15, y + W * 0.018, cx - W * 0.02, y + W * 0.065,
      FESTA.yellow, Math.round(W * 0.012));
    y += Math.round(H * 0.048);
  }

  // ── Bottom stack: CTA band + esito + expiry ──
  const ctaBandH = Math.round(W * (isSquare ? 0.105 : 0.108));
  const esitoH   = isSquare ? 0 : Math.round(H * 0.048);
  const expH     = expiresText ? Math.round(H * 0.042) : Math.round(H * 0.02);
  const bottomPad = Math.round(H * 0.028);
  const ctaBandY = H - bottomPad - expH - esitoH - ctaBandH;

  // ── QR — large white card + yellow bursts ──
  const qrPad = Math.round(W * 0.034);
  const zoneTop = y;
  const zoneBot = ctaBandY - Math.round(H * 0.02);
  const qrMax  = Math.max(0, zoneBot - zoneTop - qrPad * 2);
  const qrSz   = Math.round(Math.min(W * (isSquare ? 0.44 : 0.48), qrMax));
  const cardWH = qrSz + qrPad * 2;
  const qrCardY = zoneTop + Math.max(0, Math.floor((zoneBot - zoneTop - cardWH) / 2));
  roundedRect(ctx, cx - cardWH / 2, qrCardY, cardWH, cardWH, Math.round(W * 0.028));
  ctx.fillStyle = '#ffffff'; ctx.fill();
  ctx.drawImage(qrImage, cx - qrSz / 2, qrCardY + qrPad, qrSz, qrSz);
  drawBurst(ctx, cx - cardWH / 2 - W * 0.028, qrCardY + cardWH / 2, burstLen, FESTA.yellow);
  drawBurst(ctx, cx + cardWH / 2 + W * 0.028, qrCardY + cardWH / 2, burstLen, FESTA.yellow);

  // ── CTA on accent brush band (reference — not white pill) ──
  const ctaBandW = Math.round(W * 0.88);
  drawBrushBand(ctx, cx - ctaBandW / 2, ctaBandY, ctaBandW, ctaBandH, accent);
  let ctaSz = Math.round(ctaBandH * 0.38);
  do {
    ctx.font = `900 ${ctaSz}px ${FONT}`;
    if (ctx.measureText(ctaText).width <= ctaBandW * 0.88) break;
    ctaSz -= 2;
  } while (ctaSz > Math.round(W * 0.038));
  ctx.fillStyle = ink; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(ctaText, cx, ctaBandY + ctaBandH / 2);
  ctx.textBaseline = 'alphabetic';

  if (!isSquare) {
    ctx.font = `800 ${Math.round(W * 0.034)}px ${FONT}`; ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText('ESITO IMMEDIATO', cx, ctaBandY + ctaBandH + Math.round(H * 0.014));
  }
  if (expiresText) {
    ctx.font = `500 ${Math.round(W * 0.024)}px ${FONT}`; ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.fillText(expiresText, cx, H - Math.round(H * 0.018));
    ctx.textBaseline = 'alphabetic';
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

  const tbG = ctx.createLinearGradient(0, 0, W, 0);
  tbG.addColorStop(0, primary); tbG.addColorStop(1, secondary);
  ctx.fillStyle = tbG; ctx.fillRect(0, 0, W, Math.round(H * 0.008));

  // Bottom-anchored stack: dots → expiry → CTA (never overlaps QR)
  const dotR  = Math.round(W * 0.015);
  const dotsY = H - Math.round(H * 0.028) - dotR;
  const expH  = expiresText ? Math.round(H * 0.034) : 0;
  const btnH  = Math.round(W * 0.09);
  const btnY  = dotsY - dotR * 2 - Math.round(H * 0.014) - expH - btnH;
  const qrPad = Math.round(W * 0.034);
  const gap   = Math.round(H * 0.024);

  // Header — compact so QR stays large
  const lSz = Math.round(W * 0.14);
  let y = Math.round(H * 0.045);
  drawLogo(ctx, logoImage, cx - lSz / 2, y, lSz, primary, lSz / 2);
  y += lSz + 10;

  let snSz = Math.round(W * 0.048);
  do { ctx.font = `700 ${snSz}px ${FONT}`; if (ctx.measureText(storeName).width <= W * 0.88) break; snSz -= 2; } while (snSz > 24);
  ctx.font = `700 ${snSz}px ${FONT}`; ctx.fillStyle = primary;
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.fillText(storeName, cx, y);
  y += Math.round(snSz * 1.35);

  ctx.strokeStyle = hexToRgba(primary, 0.22); ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(W * 0.12, y); ctx.lineTo(W * 0.88, y); ctx.stroke();
  y += Math.round(H * 0.028);

  const labelSz = Math.round(W * 0.062);
  ctx.font = `900 ${labelSz}px ${FONT}`; ctx.fillStyle = '#0f172a';
  ctx.fillText('Scansiona e partecipa', cx, y);
  y += Math.round(labelSz * 1.2) + gap;

  // QR — sized to fit between header and CTA, card top explicit (no y-pad overlap)
  const zoneTop = y;
  const zoneBot = btnY - gap;
  const qrMax = Math.max(0, zoneBot - zoneTop - qrPad * 2);
  const qrSz  = Math.round(Math.min(W * 0.58, qrMax));
  const cardTop = zoneTop + Math.max(0, Math.floor((zoneBot - zoneTop - qrSz - qrPad * 2) / 2));
  roundedRect(ctx, cx - qrSz / 2 - qrPad, cardTop, qrSz + qrPad * 2, qrSz + qrPad * 2, Math.round(W * 0.035));
  ctx.fillStyle = '#f8fafc'; ctx.fill();
  ctx.strokeStyle = hexToRgba(primary, 0.15); ctx.lineWidth = 2; ctx.stroke();
  ctx.drawImage(qrImage, cx - qrSz / 2, cardTop + qrPad, qrSz, qrSz);

  drawCtaButton(ctx, cta, cx, btnY, W * 0.76, btnH, primary, secondary);

  if (expiresText) {
    ctx.font = `400 ${Math.round(W * 0.032)}px ${FONT}`; ctx.fillStyle = '#94a3b8';
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.fillText(expiresText, cx, dotsY - dotR - Math.round(H * 0.018));
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
  const { primary, secondary, headline, cta, prizeText, storeName, expiresText, logoImage } = data;
  const prize = stripEmoji(prizeText);

  const topBarH = Math.round(H * 0.076);
  const botBarH = Math.round(H * 0.06);
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

  // Left brand panel — logo + store name (bigger, full white)
  const leftG = ctx.createLinearGradient(0, topBarH, leftW, topBarH + mainH);
  leftG.addColorStop(0, hexToRgba(primary, 0.24)); leftG.addColorStop(1, hexToRgba(secondary, 0.14));
  ctx.fillStyle = leftG; ctx.fillRect(0, topBarH, leftW, mainH);
  ctx.fillStyle = hexToRgba(primary, 0.5); ctx.fillRect(leftW - 3, topBarH, 3, mainH);

  const lSz = Math.round(mainH * 0.44);
  const snH = Math.round(H * 0.066);
  const lY  = topBarH + (mainH - lSz - snH - 12) / 2;
  drawLogo(ctx, logoImage, (leftW - lSz) / 2, lY, lSz, primary, 12);
  let snSz = snH;
  do { ctx.font = `700 ${snSz}px ${FONT}`; if (ctx.measureText(storeName).width <= leftW * 0.9) break; snSz -= 2; } while (snSz > Math.round(H * 0.04));
  ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.fillText(storeName, leftW / 2, lY + lSz + 12);

  // Center — PRIZE is the hero, headline only a small eyebrow above
  const ctxCx = leftW + centerW / 2;
  const cG = ctx.createLinearGradient(leftW, 0, leftW + centerW, 0);
  cG.addColorStop(0, hexToRgba(secondary, 0.04)); cG.addColorStop(1, hexToRgba(primary, 0.03));
  ctx.fillStyle = cG; ctx.fillRect(leftW, topBarH, centerW, mainH);

  const heroText = (prize || headline).toUpperCase();
  let cy = topBarH + Math.round(mainH * 0.15);
  if (prize && headline) {
    ctx.font = `800 ${Math.round(H * 0.05)}px ${FONT}`; ctx.fillStyle = 'rgba(255,255,255,0.72)';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    const eb = headline.toUpperCase();
    ctx.fillText(eb.length > 34 ? eb.slice(0, 33) + '…' : eb, ctxCx, cy);
    cy += Math.round(H * 0.078);
  }
  drawTextBlock(ctx, {
    text: heroText, x: ctxCx, y: cy,
    maxWidth: centerW * 0.94, maxHeight: topBarH + mainH - cy - Math.round(mainH * 0.06),
    startSize: Math.round(H * 0.25), minSize: Math.round(H * 0.11),
    weight: 900, color: '#ffffff', maxLines: 3, lineRatio: 1.03
  });

  // Right panel — large QR + strong CTA
  const rPanelX = W - rightW;
  ctx.fillStyle = 'rgba(255,255,255,0.034)'; ctx.fillRect(rPanelX, topBarH, rightW, mainH);
  ctx.fillStyle = hexToRgba(primary, 0.3); ctx.fillRect(rPanelX, topBarH, 3, mainH);

  const qrZoneCx  = rPanelX + rightW / 2;
  const ctaFontSz = Math.round(H * 0.092);
  const qrSz      = Math.round(mainH * 0.66);
  const qrPad     = Math.round(H * 0.028);
  const qrX       = qrZoneCx - qrSz / 2;
  const qrY       = topBarH + (mainH - (qrSz + qrPad * 2 + ctaFontSz * 1.3)) / 2;
  roundedRect(ctx, qrX - qrPad, qrY - qrPad, qrSz + qrPad * 2, qrSz + qrPad * 2, 14);
  ctx.fillStyle = '#ffffff'; ctx.fill();
  ctx.drawImage(qrImage, qrX, qrY, qrSz, qrSz);
  let ctaSz = ctaFontSz;
  do { ctx.font = `900 ${ctaSz}px ${FONT}`; if (ctx.measureText(cta).width <= rightW * 0.94) break; ctaSz -= 2; } while (ctaSz > Math.round(H * 0.05));
  ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.fillText(cta, qrZoneCx, qrY + qrSz + qrPad + 6);
  ctx.textBaseline = 'alphabetic';

  // Expiry — minimal priority, in the bottom bar
  if (expiresText) {
    ctx.font = `600 ${Math.round(H * 0.032)}px ${FONT}`; ctx.fillStyle = 'rgba(255,255,255,0.62)';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(expiresText, ctxCx, H - botBarH / 2);
    ctx.textBaseline = 'alphabetic';
  }
}

function renderLedVert(ctx, canvas, qrImage, data) {
  const W = canvas.width, H = canvas.height;
  const { primary, secondary, headline, cta, prizeText, storeName, expiresText, logoImage } = data;
  const cx = W / 2;
  const prize = stripEmoji(prizeText);

  ctx.fillStyle = '#080d18'; ctx.fillRect(0, 0, W, H);
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, hexToRgba(primary, 0.16)); bg.addColorStop(1, hexToRgba(secondary, 0.08));
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = primary; ctx.fillRect(0, 0, 7, H);

  const tBarH = Math.round(H * 0.035);
  const tBarG = ctx.createLinearGradient(0, 0, W, 0);
  tBarG.addColorStop(0, primary); tBarG.addColorStop(1, secondary);
  ctx.fillStyle = tBarG; ctx.fillRect(0, 0, W, tBarH);

  let y = tBarH + Math.round(H * 0.03);
  const lSz = Math.round(W * 0.3);
  drawLogo(ctx, logoImage, cx - lSz / 2, y, lSz, primary, 14);
  y += lSz + 12;

  // Store name — bigger, full white, fit to width (no truncation)
  let vSnSz = Math.round(W * 0.07);
  do { ctx.font = `800 ${vSnSz}px ${FONT}`; if (ctx.measureText(storeName).width <= W * 0.86) break; vSnSz -= 2; } while (vSnSz > Math.round(W * 0.045));
  ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.fillText(storeName, cx, y);
  y += Math.round(vSnSz * 1.35);

  ctx.strokeStyle = primary; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(W * 0.16, y); ctx.lineTo(W * 0.84, y); ctx.stroke();
  y += 16;

  // Eyebrow (headline) small, then PRIZE hero
  if (prize && headline) {
    ctx.font = `700 ${Math.round(W * 0.05)}px ${FONT}`; ctx.fillStyle = 'rgba(255,255,255,0.66)';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    const eb = headline.toUpperCase();
    ctx.fillText(eb.length > 22 ? eb.slice(0, 21) + '…' : eb, cx, y);
    y += Math.round(W * 0.076);
  }

  y = drawTextBlock(ctx, {
    text: (prize || headline).toUpperCase(), x: cx, y, maxWidth: W * 0.88, maxHeight: Math.round(H * 0.28),
    startSize: Math.round(W * 0.14), minSize: Math.round(W * 0.072),
    weight: 900, color: '#ffffff', maxLines: 3, lineRatio: 1.04
  });
  y += 18;

  const qrSz = Math.round(W * 0.46), qrPad = Math.round(W * 0.03);
  roundedRect(ctx, cx - qrSz / 2 - qrPad, y - qrPad, qrSz + qrPad * 2, qrSz + qrPad * 2, 14);
  ctx.fillStyle = '#ffffff'; ctx.fill();
  ctx.drawImage(qrImage, cx - qrSz / 2, y, qrSz, qrSz);
  y += qrSz + qrPad * 2 + 16;

  ctx.font = `900 ${Math.round(W * 0.072)}px ${FONT}`; ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.fillText(cta, cx, y);
  y += Math.round(W * 0.094);

  // Expiry — minimal priority
  if (expiresText) {
    ctx.font = `500 ${Math.round(W * 0.034)}px ${FONT}`; ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText(expiresText, cx, y);
  }
  ctx.textBaseline = 'alphabetic';
}

function renderLedSquare(ctx, canvas, qrImage, data) {
  const W = canvas.width, H = canvas.height;
  const { primary, secondary, headline, cta, prizeText, storeName, expiresText, logoImage } = data;
  const cx = W / 2;
  const prize = stripEmoji(prizeText);

  ctx.fillStyle = '#080d18'; ctx.fillRect(0, 0, W, H);
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, hexToRgba(primary, 0.18)); bg.addColorStop(1, hexToRgba(secondary, 0.1));
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

  // Brand accent bars top + left
  const tbH = Math.round(H * 0.05);
  const tbG = ctx.createLinearGradient(0, 0, W, 0);
  tbG.addColorStop(0, primary); tbG.addColorStop(1, secondary);
  ctx.fillStyle = tbG; ctx.fillRect(0, 0, W, tbH);
  ctx.fillStyle = primary; ctx.fillRect(0, 0, 6, H);

  let y = tbH + Math.round(H * 0.035);

  // Logo compact
  const lSz = Math.round(W * 0.17);
  drawLogo(ctx, logoImage, cx - lSz / 2, y, lSz, primary, 12);
  y += lSz + 10;

  // Store name — bigger, full white, fit to width (no truncation)
  let sqSnSz = Math.round(W * 0.062);
  do { ctx.font = `800 ${sqSnSz}px ${FONT}`; if (ctx.measureText(storeName).width <= W * 0.86) break; sqSnSz -= 2; } while (sqSnSz > Math.round(W * 0.04));
  ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.fillText(storeName, cx, y);
  y += Math.round(sqSnSz * 1.3);

  // PRIZE hero (headline demoted, omitted here to give QR room)
  y = drawTextBlock(ctx, {
    text: (prize || headline).toUpperCase(), x: cx, y, maxWidth: W * 0.88, maxHeight: Math.round(H * 0.24),
    startSize: Math.round(W * 0.125), minSize: Math.round(W * 0.066),
    weight: 900, color: '#ffffff', maxLines: 3, lineRatio: 1.04
  });
  y += 12;

  // QR + CTA — fill remaining space, QR as large as fits
  const reservedBot = expiresText ? Math.round(H * 0.06) : Math.round(H * 0.03);
  const remaining   = H - y - reservedBot;
  const ctaH  = Math.round(W * 0.07);
  const qrPad = Math.round(W * 0.026);
  const qrSz  = Math.round(Math.min(W * 0.46, remaining - ctaH - qrPad * 3));
  const blockH = qrPad * 2 + qrSz + ctaH;
  const qy = y + Math.max(0, (remaining - blockH) / 2);
  roundedRect(ctx, cx - qrSz / 2 - qrPad, qy, qrSz + qrPad * 2, qrSz + qrPad * 2, 12);
  ctx.fillStyle = '#ffffff'; ctx.fill();
  ctx.drawImage(qrImage, cx - qrSz / 2, qy + qrPad, qrSz, qrSz);
  ctx.font = `900 ${Math.round(W * 0.06)}px ${FONT}`; ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.fillText(cta, cx, qy + qrPad * 2 + qrSz + 6);
  ctx.textBaseline = 'alphabetic';

  // Expiry — minimal priority
  if (expiresText) {
    ctx.font = `500 ${Math.round(W * 0.032)}px ${FONT}`; ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.fillText(expiresText, cx, H - Math.round(H * 0.02));
    ctx.textBaseline = 'alphabetic';
  }
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
  const lSz = Math.round(H * 0.11);
  drawLogo(ctx, logoImage, lCx - lSz / 2, y, lSz, primary, 14);
  y += lSz + 12;
  // Store name — bigger, fit to width (no truncation)
  let snSz = Math.round(H * 0.044);
  do { ctx.font = `800 ${snSz}px ${FONT}`; if (ctx.measureText(storeName).width <= split * 0.86) break; snSz -= 2; } while (snSz > Math.round(H * 0.028));
  ctx.fillStyle = primary; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.fillText(storeName, lCx, y);
  y += Math.round(snSz * 1.3);
  ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(split * 0.1, y); ctx.lineTo(split * 0.9, y); ctx.stroke();
  y += Math.round(H * 0.03);
  // Eyebrow (headline) small, then PRIZE hero
  if (prizeText && headline) {
    ctx.font = `800 ${Math.round(H * 0.03)}px ${FONT}`; ctx.fillStyle = hexToRgba(primary, 0.85);
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    const eb = headline.toUpperCase();
    ctx.fillText(eb.length > 30 ? eb.slice(0, 29) + '…' : eb, lCx, y);
    y += Math.round(H * 0.05);
  }
  y = drawTextBlock(ctx, {
    text: (stripEmoji(prizeText) || headline).toUpperCase(), x: lCx, y,
    maxWidth: split * 0.86, maxHeight: Math.round(H * 0.4),
    startSize: Math.round(H * 0.13), minSize: Math.round(H * 0.06),
    weight: 900, color: '#0f172a', maxLines: 3, lineRatio: 1.04
  });
  y += Math.round(H * 0.02);
  if (subtitle) {
    drawTextBlock(ctx, {
      text: subtitle, x: lCx, y, maxWidth: split * 0.76, maxHeight: Math.round(H * 0.09),
      startSize: Math.round(H * 0.026), minSize: Math.round(H * 0.016),
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
  const qrSz = Math.min(Math.round(rH * 0.62), Math.round((W - split) * 0.66));
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
  // Store name — bigger, fit to width (no truncation)
  let snSz = Math.round(H * 0.04);
  do { ctx.font = `800 ${snSz}px ${FONT}`; if (ctx.measureText(storeName).width <= iW * 0.9) break; snSz -= 2; } while (snSz > Math.round(H * 0.026));
  ctx.fillStyle = primary; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.fillText(storeName, cx, y);
  y += Math.round(snSz * 1.3);
  ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(cardX + cardW * 0.12, y); ctx.lineTo(cardX + cardW * 0.88, y); ctx.stroke();
  y += Math.round(H * 0.026);
  // Eyebrow (headline) small, then PRIZE hero
  if (prizeText && headline) {
    ctx.font = `800 ${Math.round(H * 0.028)}px ${FONT}`; ctx.fillStyle = hexToRgba(primary, 0.85);
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    const eb = headline.toUpperCase();
    ctx.fillText(eb.length > 32 ? eb.slice(0, 31) + '…' : eb, cx, y);
    y += Math.round(H * 0.044);
  }
  y = drawTextBlock(ctx, {
    text: (stripEmoji(prizeText) || headline).toUpperCase(), x: cx, y,
    maxWidth: iW * 0.9, maxHeight: Math.round(H * 0.2),
    startSize: Math.round(H * 0.105), minSize: 40, weight: 900, color: '#0f172a', maxLines: 3, lineRatio: 1.05
  });
  y += 14;
  if (subtitle) {
    y = drawTextBlock(ctx, {
      text: subtitle, x: cx, y, maxWidth: iW * 0.74, maxHeight: Math.round(H * 0.07),
      startSize: Math.round(H * 0.024), minSize: 18, weight: 400, color: '#64748b', maxLines: 2, lineRatio: 1.4
    });
    y += 8;
  }
  // QR + CTA — QR follows content flow (fills space, never overlaps prize)
  const footerH = expiresText ? Math.round(cardH * 0.05) : Math.round(cardH * 0.02);
  const ctaBtnH = Math.round(H * 0.058);
  const ctaBtnY = cardY + cardH - footerH - ctaBtnH - 10;
  const qrPad   = Math.round(W * 0.018);
  const zoneTop = y + 10;
  const zoneBot = ctaBtnY - 16;
  const qrSz    = Math.round(Math.min(W * 0.3, zoneBot - zoneTop - qrPad * 2));
  const qrStartY = zoneTop + qrPad + Math.max(0, ((zoneBot - zoneTop) - (qrSz + qrPad * 2)) / 2);
  drawQrBlock(ctx, qrImage, cx, qrStartY, qrSz, qrPad, Math.round(W * 0.012));
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
  drawLogo(ctx, logoImage, cx - lSz / 2, (hBandH - lSz) / 2, lSz, primary, 14);

  // Store name below header (on white) — bigger, fit to width
  let y = hBandH + Math.round(H * 0.036);
  let snSz = Math.round(W * 0.072);
  do { ctx.font = `800 ${snSz}px ${FONT}`; if (ctx.measureText(storeName).width <= W * 0.88) break; snSz -= 2; } while (snSz > Math.round(W * 0.045));
  ctx.fillStyle = primary; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.fillText(storeName, cx, y);
  y += Math.round(snSz * 1.32);

  ctx.strokeStyle = hexToRgba(primary, 0.22); ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(W * 0.1, y); ctx.lineTo(W * 0.9, y); ctx.stroke();
  y += Math.round(H * 0.024);

  // Eyebrow (headline) small, then PRIZE hero
  if (prizeText && headline) {
    ctx.font = `800 ${Math.round(W * 0.044)}px ${FONT}`; ctx.fillStyle = hexToRgba(primary, 0.85);
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    const eb = headline.toUpperCase();
    ctx.fillText(eb.length > 26 ? eb.slice(0, 25) + '…' : eb, cx, y);
    y += Math.round(W * 0.066);
  }

  y = drawTextBlock(ctx, {
    text: (stripEmoji(prizeText) || headline).toUpperCase(), x: cx, y,
    maxWidth: W * 0.86, maxHeight: Math.round(H * 0.24),
    startSize: Math.round(W * 0.135), minSize: Math.round(W * 0.07),
    weight: 900, color: '#0f172a', maxLines: 3, lineRatio: 1.05
  });
  y += Math.round(H * 0.02);

  // Subtitle (optional, low priority)
  if (subtitle) {
    y = drawTextBlock(ctx, {
      text: subtitle, x: cx, y, maxWidth: W * 0.76, maxHeight: Math.round(H * 0.07),
      startSize: Math.round(W * 0.036), minSize: 22,
      weight: 400, color: '#64748b', maxLines: 2, lineRatio: 1.4
    });
    y += Math.round(H * 0.016);
  }

  // QR + CTA — fill the space down to a minimal expiry line (no empty gap)
  const expH      = expiresText ? Math.round(W * 0.046) : 0;
  const ctaBtnH   = Math.round(W * 0.1);
  const bottomPad = Math.round(H * 0.028);
  const ctaY      = H - bottomPad - expH - ctaBtnH;
  const qrPad     = Math.round(W * 0.03);
  const zoneTop   = y + Math.round(H * 0.02);
  const zoneBot   = ctaY - Math.round(H * 0.03);
  const qrSz      = Math.round(Math.min(W * 0.54, zoneBot - zoneTop - qrPad * 2));
  const qrStartY  = zoneTop + qrPad + Math.max(0, ((zoneBot - zoneTop) - (qrSz + qrPad * 2)) / 2);

  drawQrBlock(ctx, qrImage, cx, qrStartY, qrSz, qrPad, Math.round(qrSz * 0.06));
  drawCtaButton(ctx, cta, cx, ctaY, W * 0.72, ctaBtnH, primary, secondary);

  if (expiresText) {
    ctx.font = `400 ${Math.round(W * 0.03)}px ${FONT}`; ctx.fillStyle = '#94a3b8';
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.fillText(expiresText, cx, H - bottomPad);
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
    case 'print':    renderPrintConcept(ctx, canvas, qrImage, data);                break;
    case 'facebook': renderFacebook(ctx, canvas, qrImage, data);                    break;
    case 'social':   renderSocial(ctx, canvas, qrImage, data);                      break;
    case 'story':    renderStoryFrame(ctx, canvas, qrImage, data, state.storyFrame); break;
    case 'led':      renderLed(ctx, canvas, qrImage, data);                         break;
    case 'lcd':      renderLcd(ctx, canvas, qrImage, data);                         break;
  }

  updateStoryNav(formatKey);
  playUrlLabel.textContent = playUrl;

  // M2 + Marketing: post-render validation — localhost only, non-blocking
  if (location.hostname === 'localhost') {
    try {
      const boxes = computeElementBoxes(formatKey, data, canvas.width, canvas.height);
      if (boxes) validateLayout(boxes, data, canvas.width, canvas.height, formatKey);
      validateMarketing(data, boxes, formatKey);
      marketingScore(data, boxes, formatKey);
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
 * M3A: delegates zone calculation to computePrintLayout — always in sync.
 * Includes qrTitle and qrCard boxes so validateLayout can check their overlap.
 */
function computeBoxes_a4(data, W, H) {
  const layout    = computePrintLayout(data, W, H);
  const z         = { headerEnd: layout.headerEnd, heroEnd: layout.heroEnd, prizeEnd: layout.prizeEnd, qrEnd: layout.qrEnd };
  const cx        = W / 2;
  const qrSz      = layout.qrSz;
  const qrSecH    = z.qrEnd - z.prizeEnd;
  const qrPad     = Math.round(qrSz * 0.065);
  const ctaBtnH   = Math.round(W * 0.052);
  const qrLabelH  = Math.round(W * 0.026);
  const qrGap     = Math.max(16, qrPad + 4);           // mirrors renderPrint fix
  const totalQrH  = qrLabelH + qrGap + qrSz + qrPad * 2 + 16 + ctaBtnH;
  const qrStartY  = z.prizeEnd + (qrSecH - totalQrH) / 2;
  const qrActualY = qrStartY + qrLabelH + qrGap;       // QR image top
  const ctaY      = qrActualY + qrSz + qrPad * 2 + 18;
  const ctaBtnW   = W * 0.58;
  return {
    header:    { x: 0,                    y: 0,              w: W,              h: z.headerEnd,             label: 'Header band'       },
    hero:      { x: 0,                    y: z.headerEnd,    w: W,              h: z.heroEnd - z.headerEnd,  label: 'Hero/Headline'     },
    prizeZone: { x: 0,                    y: z.heroEnd,      w: W,              h: z.prizeEnd - z.heroEnd,   label: 'Prize band'        },
    qrZone:    { x: 0,                    y: z.prizeEnd,     w: W,              h: z.qrEnd - z.prizeEnd,     label: 'QR section'        },
    footer:    { x: 0,                    y: z.qrEnd,        w: W,              h: H - z.qrEnd,              label: 'Footer'            },
    qrTitle:   { x: cx - W * 0.42,        y: qrStartY,       w: W * 0.84,       h: qrLabelH,                 label: 'QR title label'    },
    qrCard:    { x: cx - qrSz/2 - qrPad,  y: qrActualY - qrPad, w: qrSz + qrPad*2, h: qrSz + qrPad*2,       label: 'QR card (white)'   },
    qr:        { x: cx - qrSz / 2,        y: qrActualY,      w: qrSz,           h: qrSz,                     label: 'QR code'           },
    cta:       { x: cx - ctaBtnW / 2,     y: ctaY,           w: ctaBtnW,        h: ctaBtnH,                  label: 'CTA button'        },
    headlineFontEst: Math.round(W * 0.092),
    prizeFontEst:    Math.round(W * 0.072),
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

  // 3a. Possibile sovrapposizione QR ↔ CTA
  if (boxes.qr && boxes.cta) {
    const q = boxes.qr, c = boxes.cta;
    if (q.x < c.x + c.w && q.x + q.w > c.x && q.y < c.y + c.h && q.y + q.h > c.y) {
      issues.push(`Sovrapposizione: QR e CTA si sovrappongono`);
    }
  }

  // 3b. qrTitle ↔ qrCard: il testo non deve sconfinare nel rettangolo bianco
  if (boxes.qrTitle && boxes.qrCard) {
    const titleBottom = boxes.qrTitle.y + boxes.qrTitle.h;
    const cardTop     = boxes.qrCard.y;
    if (titleBottom + 4 > cardTop) {
      issues.push(`qrTitle sovrappone qrCard: title bottom=${Math.round(titleBottom)} vs card top=${Math.round(cardTop)} (overlap ${Math.round(titleBottom + 4 - cardTop)}px)`);
    }
  }

  // 3c. qrCard ↔ ctaButton: margine minimo 24px tra box QR e pulsante CTA
  if (boxes.qrCard && boxes.cta) {
    const cardBottom = boxes.qrCard.y + boxes.qrCard.h;
    const ctaTop     = boxes.cta.y;
    if (cardBottom + 24 > ctaTop) {
      issues.push(`qrCard troppo vicino a CTA: gap ${Math.round(ctaTop - cardBottom)}px < 24px (card bottom=${Math.round(cardBottom)} cta top=${Math.round(ctaTop)})`);
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

// ─── Marketing Validator ──────────────────────────────────────────────────────
//
// Evaluates a rendered asset through a marketer's lens, not just a renderer's.
// Goal: does the viewer understand in < 2 seconds what they can win, what to do,
// and where to scan?  Runs only on localhost, never blocks export.
//
// Rules (R1–R8):
//   R1  Premio principale presente                      PASS/FAIL
//   R2  Premio principale visivamente dominante         PASS/FAIL
//   R3  QR tra i primi 3 elementi visivi                PASS/FAIL
//   R4  CTA presente                                    PASS/FAIL
//   R5  Premi secondari non dominanti                   PASS/FAIL
//   R6  Logo meno evidente del premio                   PASS/FAIL
//   R7  Urgenza presente                                PASS/WARN
//   R8  Gerarchia visiva chiara (meta-check)            PASS/FAIL

function validateMarketing(data, boxes, formatKey) {
  const pass   = [];
  const fail   = [];
  const warn   = [];
  const family = FORMAT_SIZES[formatKey]?.family ?? 'print';

  // ── Derived helpers ──────────────────────────────────────────────────────────

  // Effective headline as actually rendered in print (reconstructed from prize)
  const strippedPrize = (data.prizeText ?? '').replace(/\p{Emoji_Presentation}\s*/gu, '').trim();
  const prizeWords    = strippedPrize.split(/\s+/).filter(Boolean);
  const effectiveHL   = data.prizeText
    ? ('VINCI ' + prizeWords.slice(0, 4).join(' ')).toUpperCase()
    : (data.headline ?? '');

  // Game-style signals: question, curiosity, "you might have won" framing
  const GAME_SIGNALS = ['?', 'hai vinto', 'scopri se', 'potresti', 'fortuna', 'tenta la', 'premi immediat', 'premio istantaneo'];
  const PROMO_HLS    = ['inquadra e vinci', 'gioca ora', 'partecipa', 'scopri il tuo premio',
                        'gioca subito', 'vinci subito', 'promo', 'offerta'];
  const hlLower     = effectiveHL.toLowerCase();
  const hlUpper     = effectiveHL.toUpperCase();
  const isGameHL    = GAME_SIGNALS.some(g => hlLower.includes(g));
  const isGenericHL = PROMO_HLS.some(g => hlLower === g || hlLower.startsWith(g));

  const prizeZoneH  = boxes?.prizeZone?.h ?? boxes?.content?.h ?? 0;
  const heroH       = boxes?.hero?.h ?? 0;
  const headerH     = boxes?.header?.h ?? 0;
  const prizeFontEst = boxes?.prizeFontEst ?? 0;
  const qrSz        = boxes?.qrSizePx ?? 0;
  const W           = boxes?.header?.w ?? 0;

  // ── R1: Premio principale presente ───────────────────────────────────────────
  const prizeText = (data.prizeText ?? '').trim();
  if (prizeText.length > 0) {
    pass.push(`R1 Premio principale presente: "${prizeText}"`);
  } else {
    fail.push('R1 Premio principale assente — nessun testo premio disponibile per il layout');
  }

  // ── R2: Headline game-psychology (crea curiosità, non promozione) ────────────
  if (isGameHL && prizeText.length > 0) {
    pass.push(`R2 Headline game-psychology ✅: "${effectiveHL}"`);
  } else if (prizeText.length > 0 && hlUpper.startsWith('VINCI ')) {
    warn.push(`R2 Headline promozionale (non game): "${effectiveHL}" — preferire formato domanda "HAI VINTO X?"`);
  } else if (isGenericHL) {
    fail.push(`R2 Headline generica ❌: "${effectiveHL}" — sostituire con game-psychology es: "🍺 HAI VINTO BIRRA?"`);
  } else if (prizeText.length === 0) {
    fail.push('R2 Nessun premio → nessuna headline efficace');
  } else {
    warn.push(`R2 Headline presente ma non game-style: "${effectiveHL}"`);
  }

  if (boxes) {
    // Prize zone deve essere visualmente più alta del semplice header brand
    if (prizeZoneH > 0 && headerH > 0 && prizeZoneH >= headerH * 1.3) {
      pass.push(`R2b Zona premio dominante sull'header: prizeZone ${Math.round(prizeZoneH)}px vs header ${Math.round(headerH)}px`);
    } else if (prizeZoneH > 0 && prizeFontEst >= 60) {
      pass.push(`R2b Font premio adeguato: ${prizeFontEst}px`);
    } else if (prizeFontEst > 0 && prizeFontEst < 60) {
      fail.push(`R2b Font premio troppo piccolo: ${prizeFontEst}px — deve essere almeno 60px`);
    }
  } else {
    warn.push('R2b Dominanza premio: boxes non disponibili per questo formato, verifica visivamente');
  }

  // ── R3: QR tra i primi 3 elementi visivi ─────────────────────────────────────
  // Min QR: 30% larghezza per print/social, 25% per LED (leggibilità da lontano diversa)
  const minQrRatio  = family === 'led' ? 0.22 : 0.30;
  const minQrAbsPx  = W > 0 ? Math.round(W * minQrRatio) : (family === 'led' ? 200 : 300);
  if (qrSz >= minQrAbsPx) {
    pass.push(`R3 QR visibile e leggibile: ${qrSz}px ≥ min ${minQrAbsPx}px (${(qrSz / (W || 1) * 100).toFixed(0)}% larghezza)`);
  } else if (qrSz > 0) {
    fail.push(`R3 QR troppo piccolo: ${qrSz}px < min ${minQrAbsPx}px — aumentare QR zone`);
  } else {
    warn.push('R3 QR: dimensione non verificabile per questo formato');
  }

  // ── R4: CTA presente ─────────────────────────────────────────────────────────
  const ctaText = (data.cta ?? '').trim();
  if (ctaText.length > 0) {
    pass.push(`R4 CTA presente: "${ctaText}"`);
  } else {
    fail.push('R4 CTA assente — aggiungere testo come "Gioca ora", "Scansiona", "Partecipa subito"');
  }

  // ── R5: Premi secondari non dominanti ────────────────────────────────────────
  // Architetturally guaranteed by getMainPrize() — secondary prizes never enter the main layout.
  pass.push('R5 Premi secondari esclusi dal blocco principale (garantito da getMainPrize)');

  // ── R6: Logo meno evidente del premio ────────────────────────────────────────
  if (!data.logoImage) {
    pass.push('R6 Logo assente: solo nome attività — nessun visual competitor al premio');
  } else if (prizeZoneH > 0 && headerH > 0 && headerH < prizeZoneH) {
    pass.push(`R6 Logo in header (${Math.round(headerH)}px) meno prominente della zona premio (${Math.round(prizeZoneH)}px)`);
  } else {
    warn.push('R6 Logo presente: verificare visivamente che non superi il peso visivo del premio');
  }

  // ── R7: Urgenza ──────────────────────────────────────────────────────────────
  const URGENCY_SIGNALS = ['scad', 'limit', 'esaurim', 'ultim', 'oggi', 'solo per', 'fino a', 'entro il', 'premi rimasti'];
  const urgencyCorpus   = ((data.expiresText ?? '') + ' ' + (data.subtitle ?? '')).toLowerCase();
  const urgencyFound    = URGENCY_SIGNALS.find(k => urgencyCorpus.includes(k));
  if (urgencyFound) {
    pass.push(`R7 Urgenza presente (segnale: "${urgencyFound}")`);
  } else if ((data.expiresText ?? '').trim().length > 0) {
    warn.push(`R7 Scadenza presente ma segnale urgenza debole: "${data.expiresText}" — valutare "ultimi posti", "solo oggi" per +conversione`);
  } else {
    warn.push('R7 Nessuna urgenza — aggiungere scadenza o "premi limitati" per aumentare scansioni QR');
  }

  // ── R8: Gerarchia visiva chiara (meta-check) ─────────────────────────────────
  if (fail.length === 0) {
    pass.push(`R8 Gerarchia visiva: PASS — layout orientato alla conversione (${warn.length} warning)`);
  } else {
    fail.push(`R8 Gerarchia visiva compromessa da ${fail.length - 1} regola/e fallita/e (vedi sopra)`);
  }

  // ── Report ────────────────────────────────────────────────────────────────────
  const score = `${pass.length}/${pass.length + fail.length}`;
  const label = FORMAT_SIZES[formatKey]?.label ?? formatKey;
  const tag   = `[Marketing Validator] ${label}`;

  if (fail.length === 0) {
    console.group(`${tag} ✅  ${score} regole ok — layout orientato alla conversione`);
  } else {
    console.group(`${tag} ❌  ${score} — ${fail.length} regola/e di marketing fallita/e`);
  }
  pass.forEach(p => console.log('  ✅', p));
  warn.forEach(w => console.warn('  ⚠️ ', w));
  fail.forEach(f => console.error('  ❌', f));
  if (fail.length > 0) {
    console.error(`  → Correggere i punti sopra per massimizzare scansioni QR e partecipazioni`);
  }
  console.groupEnd();

  return { pass, fail, warn, score };
}

// ─── Marketing Score ──────────────────────────────────────────────────────────
//
// 0-100 — quantifies how "game" vs "promotional" an asset is.
// Dimensions: curiosità, premio dominante, urgenza, gamification, CTA, QR, pulizia.
// Below 80 → warn. Below 60 → error (asset da rigenerare).

function marketingScore(data, boxes, formatKey) {
  let score = 0;
  const details = [];

  // Shared derived values
  const prizeText    = (data.prizeText ?? '').trim();
  const effectiveHL  = prizeText ? buildGameHeadline(prizeText) : (data.headline ?? '');
  const hlUpper      = effectiveHL.toUpperCase();
  const ctaLower     = ((data.cta ?? '') + ' ' + (data.subtitle ?? '')).toLowerCase();
  const urgCorpus    = ((data.expiresText ?? '') + ' ' + (data.subtitle ?? '')).toLowerCase();
  const prizeFontEst = boxes?.prizeFontEst ?? 0;
  const prizeZoneH   = boxes?.prizeZone?.h ?? 0;
  const qrSz         = boxes?.qrSizePx ?? 0;
  const W            = boxes?.header?.w ?? 0;

  // ── 1. Curiosità (20 pt) ─────────────────────────────────────────────────────
  // Game headlines use "?", "HAI VINTO", "SCOPRI SE", "POTRESTI", "FORTUNA"
  const GAME_HL = ['?', 'HAI VINTO', 'SCOPRI SE', 'POTRESTI', 'FORTUNA', 'TENTA LA', 'PREMI IMMEDIAT'];
  const isGameHL = GAME_HL.some(s => hlUpper.includes(s));
  const curiScore = isGameHL ? 20 : hlUpper.length > 0 ? 8 : 0;
  score += curiScore;
  details.push(`Curiosità           ${String(curiScore).padStart(3)}/20  ${isGameHL ? '✅ headline game-psychology' : '⚠️  headline non game-style'}`);

  // ── 2. Premio dominante (20 pt) ──────────────────────────────────────────────
  const prizeScore = !prizeText ? 0
    : prizeFontEst >= 80 ? 20
    : prizeFontEst >= 60 ? 16
    : prizeFontEst >= 40 ? 10
    : prizeZoneH > 100   ? 8 : 5;
  score += prizeScore;
  details.push(`Premio dominante    ${String(prizeScore).padStart(3)}/20  ${prizeText ? `(font ~${prizeFontEst}px, zona ~${Math.round(prizeZoneH)}px)` : '❌ nessun premio'}`);

  // ── 3. Urgenza (15 pt) ───────────────────────────────────────────────────────
  const URGENCY_STRONG  = ['ultim', 'limit', 'esaurim', 'oggi', 'solo per', 'premi rimasti', 'scad'];
  const URGENCY_PARTIAL = ['fino a', 'entro', 'immediat', 'istantane', 'temporane'];
  const urgStrong  = URGENCY_STRONG.find(k => urgCorpus.includes(k));
  const urgPartial = URGENCY_PARTIAL.find(k => urgCorpus.includes(k));
  const urgScore   = urgStrong ? 15 : urgPartial ? 9 : (data.expiresText ?? '').trim() ? 5 : 0;
  score += urgScore;
  details.push(`Urgenza             ${String(urgScore).padStart(3)}/15  ${urgStrong ? `✅ "${urgStrong}"` : urgPartial ? `partial "${urgPartial}"` : data.expiresText ? '⚠️  solo scadenza' : '❌ assente'}`);

  // ── 4. Gamification (20 pt) ──────────────────────────────────────────────────
  // Checks game language across all copy fields + what renderPrint now injects
  const GAME_LANG = ['istantaneo', 'immediat', 'gratis', 'tentativo', 'gioca', 'scopri se', 'hai vinto', 'fortuna', 'premi immediati', 'tenta'];
  // renderPrint always injects "SCOPRI SE HAI VINTO" as QR label → count it
  const gameCorpus = ctaLower + ' scopri se hai vinto tentativo gratuito premi immediati';
  const gameFound  = GAME_LANG.filter(k => gameCorpus.includes(k));
  const gameScore  = gameFound.length >= 3 ? 20 : gameFound.length === 2 ? 15 : gameFound.length === 1 ? 10 : 0;
  score += gameScore;
  details.push(`Gamification        ${String(gameScore).padStart(3)}/20  ${gameFound.length ? `✅ (${gameFound.slice(0,3).join(', ')})` : '❌ assente'}`);

  // ── 5. CTA (10 pt) ───────────────────────────────────────────────────────────
  const ctaScore = (data.cta ?? '').trim().length > 0 ? 10 : 0;
  score += ctaScore;
  details.push(`CTA                 ${String(ctaScore).padStart(3)}/10  ${data.cta ? `"${data.cta}"` : '❌ assente'}`);

  // ── 6. QR prominence (10 pt) ─────────────────────────────────────────────────
  const qrScore = W > 0 && qrSz >= W * 0.30 ? 10 : qrSz > 0 ? 5 : (boxes ? 0 : 5);
  score += qrScore;
  details.push(`QR prominence       ${String(qrScore).padStart(3)}/10  ${qrSz ? `${qrSz}px (${W ? Math.round(qrSz/W*100) : '?'}% larghezza)` : 'non calcolabile'}`);

  // ── 7. Pulizia visiva (5 pt) ─────────────────────────────────────────────────
  const elems = [prizeText, data.headline, data.cta, data.storeName, data.expiresText, data.subtitle]
    .filter(v => v?.trim()).length;
  const cleanScore = elems <= 4 ? 5 : elems <= 6 ? 3 : 1;
  score += cleanScore;
  details.push(`Pulizia visiva      ${String(cleanScore).padStart(3)}/5   (${elems} elementi)`);

  // ── Report ────────────────────────────────────────────────────────────────────
  const grade = score >= 80 ? '✅ APPROVA — sembra un gioco'
              : score >= 60 ? '⚠️  DA MIGLIORARE — ancora troppo pubblicitario'
              :               '❌ RIGENERA — aspetto promozionale domina';
  const label = FORMAT_SIZES[formatKey]?.label ?? formatKey;
  const tag   = `[Marketing Score] ${label}`;

  console.group(`${tag}  ${score}/100  ${grade}`);
  details.forEach(d => console.log('  ' + d));
  if (score < 80) {
    const gaps = [];
    if (curiScore  < 20) gaps.push(`+${20  - curiScore}  curiosità (headline game-style)`);
    if (urgScore   < 15) gaps.push(`+${15  - urgScore}  urgenza (scadenza, "premi limitati")`);
    if (gameScore  < 20) gaps.push(`+${20  - gameScore}  gamification`);
    if (prizeScore < 20) gaps.push(`+${20  - prizeScore}  premio dominante`);
    console.warn(`  → Punti mancanti: ${100 - score}  |  Migliorare: ${gaps.slice(0,2).join('  ·  ')}`);
    if (score < 60) console.error('  ❌ Asset da RIGENERARE — domanda: "Sembra un gioco o una pubblicità?" → PUBBLICITÀ');
  } else {
    console.log('  → Domanda finale: "Sembra un gioco o una pubblicità?" → GIOCO ✅');
  }
  console.groupEnd();

  return { score, grade, details };
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

if (printConceptSelect) {
  printConceptSelect.addEventListener('change', () => {
    state.printConcept = printConceptSelect.value;
    renderCanvas('a4');
  });
}

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

  // ── M3A: computePrintLayout ───────────────────────────────────────────────
  const W3A = FORMAT_SIZES.a4.width, H3A = FORMAT_SIZES.a4.height;
  let m3Passed = 0, m3Failed = 0;
  function assert3(name, condition) {
    if (condition) { console.log(`  ✅ PASS — ${name}`); m3Passed++; }
    else           { console.warn(`  ❌ FAIL — ${name}`); m3Failed++; }
  }

  function zoneSum(l) {
    return l.headerEnd
      + (l.heroEnd    - l.headerEnd)
      + (l.prizeEnd   - l.heroEnd)
      + (l.qrEnd      - l.prizeEnd)
      + (H3A          - l.qrEnd);
  }

  console.group('[M3A] computePrintLayout — A4 (1240×1754)');

  // ── Caso 1: Bar del Porto — Birra 50cl gratis (≤20 chars)
  const lBirra = computePrintLayout({
    headline: 'Inquadra e vinci', prizeText: '🍺 Birra 50cl gratis',
    subtitle: '', campaignName: 'Birra Gratis', expiresText: '',
  }, W3A, H3A);
  assert3('Bar del Porto: zone sum = H',           zoneSum(lBirra) === H3A);
  assert3('Bar del Porto: QR >= W×0.28 = 347px',  lBirra.qrSz >= Math.round(W3A * 0.28));
  assert3('Bar del Porto: QR <= W×0.36 = 446px',  lBirra.qrSz <= Math.round(W3A * 0.36));
  assert3('Bar del Porto: QR > attuale 278px',     lBirra.qrSz > 278);
  assert3('Bar del Porto: prizeMaxLines = 2',      lBirra.prizeMaxLines === 2);
  assert3('Bar del Porto: prizeH = round(H×0.15)', lBirra.prizeEnd - lBirra.heroEnd === Math.round(H3A * 0.15));
  console.log(`  ℹ️  Birra: headerH=${lBirra.headerEnd} heroH=${lBirra.heroH} prizeH=${lBirra.prizeH} qrH=${lBirra.qrH} footerH=${lBirra.footerH} qrSz=${lBirra.qrSz}px`);

  // ── Caso 2: Cena per Due Persone (20 chars)
  const lCena = computePrintLayout({
    headline: 'Inquadra e vinci', prizeText: 'Cena per Due Persone',
    subtitle: '', campaignName: 'Cena Romantica', expiresText: '',
  }, W3A, H3A);
  assert3('Cena (20c): zone sum = H',          zoneSum(lCena) === H3A);
  assert3('Cena (20c): QR > 278px',             lCena.qrSz > 278);
  assert3('Cena (20c): prizeMaxLines = 2',      lCena.prizeMaxLines === 2);
  console.log(`  ℹ️  Cena: headerH=${lCena.headerEnd} heroH=${lCena.heroH} prizeH=${lCena.prizeH} qrH=${lCena.qrH} footerH=${lCena.footerH} qrSz=${lCena.qrSz}px`);

  // ── Caso 3: Trattamento Viso Completo del Valore di 150 Euro (48 chars)
  const lTratt = computePrintLayout({
    headline: 'Inquadra e vinci', prizeText: 'Trattamento Viso Completo del Valore di 150 Euro',
    subtitle: '', campaignName: 'Beauty Week', expiresText: '',
  }, W3A, H3A);
  assert3('Trattamento (48c): zone sum = H',           zoneSum(lTratt) === H3A);
  assert3('Trattamento (48c): QR > 278px',              lTratt.qrSz > 278);
  assert3('Trattamento (48c): prizeMaxLines = 3',       lTratt.prizeMaxLines === 3);
  assert3('Trattamento (48c): prizeH = round(H×0.22)', lTratt.prizeEnd - lTratt.heroEnd === Math.round(H3A * 0.22));
  console.log(`  ℹ️  Trattamento: headerH=${lTratt.headerEnd} heroH=${lTratt.heroH} prizeH=${lTratt.prizeH} qrH=${lTratt.qrH} footerH=${lTratt.footerH} qrSz=${lTratt.qrSz}px`);

  // ── Caso 4: Voucher Viaggio Weekend per Due Persone (39 chars)
  const lViaggio = computePrintLayout({
    headline: 'Scopri il tuo premio', prizeText: 'Voucher Viaggio Weekend per Due Persone',
    subtitle: '', campaignName: 'Viaggia con Noi', expiresText: '',
  }, W3A, H3A);
  assert3('Viaggio (39c): zone sum = H',           zoneSum(lViaggio) === H3A);
  assert3('Viaggio (39c): QR > 278px',              lViaggio.qrSz > 278);
  assert3('Viaggio (39c): prizeMaxLines = 2',       lViaggio.prizeMaxLines === 2);
  assert3('Viaggio (39c): prizeH = round(H×0.19)', lViaggio.prizeEnd - lViaggio.heroEnd === Math.round(H3A * 0.19));
  console.log(`  ℹ️  Viaggio: headerH=${lViaggio.headerEnd} heroH=${lViaggio.heroH} prizeH=${lViaggio.prizeH} qrH=${lViaggio.qrH} footerH=${lViaggio.footerH} qrSz=${lViaggio.qrSz}px`);

  // ── Caso 5: Premio 100+ caratteri
  const lLungo = computePrintLayout({
    headline: 'Partecipa ora', prizeText: 'Buono Acquisto del Valore di Cento Euro Spendibile in Tutti i Nostri Punti Vendita',
    subtitle: '', campaignName: 'Maxi Premio', expiresText: '',
  }, W3A, H3A);
  assert3('100+ chars: zone sum = H',         zoneSum(lLungo) === H3A);
  assert3('100+ chars: QR > 278px',            lLungo.qrSz > 278);
  assert3('100+ chars: prizeMaxLines = 3',     lLungo.prizeMaxLines === 3);
  assert3('100+ chars: prizeH = round(H×0.22)', lLungo.prizeEnd - lLungo.heroEnd === Math.round(H3A * 0.22));
  console.log(`  ℹ️  100+ chars: headerH=${lLungo.headerEnd} heroH=${lLungo.heroH} prizeH=${lLungo.prizeH} qrH=${lLungo.qrH} footerH=${lLungo.footerH} qrSz=${lLungo.qrSz}px`);

  // ── Caso extra: con scadenza
  const lScad = computePrintLayout({
    headline: 'Gioca ora', prizeText: '🍺 Birra gratis',
    subtitle: '', campaignName: '', expiresText: 'Valido fino al 31/12/2026',
  }, W3A, H3A);
  assert3('Con scadenza: footerH >= round(H×0.07)', H3A - lScad.qrEnd >= Math.round(H3A * 0.07));
  assert3('Con scadenza: zone sum = H',              zoneSum(lScad) === H3A);
  assert3('Con scadenza: QR > 278px',                lScad.qrSz > 278);
  console.log(`  ℹ️  Scadenza: footerH=${lScad.footerH} qrSz=${lScad.qrSz}px`);

  // ── Caso extra: no prize
  const lNoPrize = computePrintLayout({
    headline: 'Partecipa al gioco', prizeText: '',
    subtitle: '', campaignName: '', expiresText: '',
  }, W3A, H3A);
  assert3('No prize: zone sum = H',   zoneSum(lNoPrize) === H3A);
  assert3('No prize: QR > 278px',      lNoPrize.qrSz > 278);
  assert3('No prize: prizeH <= round(H×0.12)', lNoPrize.prizeH <= Math.round(H3A * 0.12));
  console.log(`  ℹ️  No prize: prizeH=${lNoPrize.prizeH} qrSz=${lNoPrize.qrSz}px`);

  // ── Tutti i casi superano 278px (QR attuale)
  assert3('Tutti i casi M3A: QR > 278px (attuale)', [lBirra, lCena, lTratt, lViaggio, lLungo, lScad, lNoPrize].every(l => l.qrSz > 278));

  console.log(`\n  Risultato M3A: ${m3Passed}/${m3Passed + m3Failed} test superati`);
  if (m3Failed > 0) console.warn(`  ⚠️  ${m3Failed} test falliti — verificare computePrintLayout`);
  console.groupEnd();

  // ── Marketing Validator tests ─────────────────────────────────────────────────
  console.group('  ▶ Marketing Validator — validateMarketing()');
  let mkPassed = 0, mkFailed = 0;

  function assertMk(label, condition) {
    if (condition) { mkPassed++; console.log('    ✅', label); }
    else           { mkFailed++; console.error('    ❌', label); }
  }

  const W_a4 = 1240, H_a4 = 1754;
  const boxesA4 = computeBoxes_a4({ prizeText: '🍺 Birra 50cl gratis', headline: 'Inquadra e vinci', storeName: 'Bar del Porto' }, W_a4, H_a4);

  // Bar del Porto: premio presente → R1 PASS
  const mkBarPorto = validateMarketing(
    { prizeText: '🍺 Birra 50cl gratis', headline: 'Inquadra e vinci', cta: 'Gioca ora', storeName: 'Bar del Porto', logoImage: null, expiresText: '' },
    boxesA4, 'a4'
  );
  assertMk('MK-01 Bar del Porto: R1 premio presente',         mkBarPorto.fail.filter(f => f.startsWith('R1')).length === 0);
  assertMk('MK-02 Bar del Porto: R2 headline prize-driven',   mkBarPorto.fail.filter(f => f.startsWith('R2 Headline generi')).length === 0);
  assertMk('MK-03 Bar del Porto: R3 QR ≥ 30% larghezza',     mkBarPorto.fail.filter(f => f.startsWith('R3')).length === 0);
  assertMk('MK-04 Bar del Porto: R4 CTA presente',            mkBarPorto.fail.filter(f => f.startsWith('R4')).length === 0);
  assertMk('MK-05 Bar del Porto: R7 urgenza warn (no date)',  mkBarPorto.warn.filter(w => w.startsWith('R7')).length > 0);

  // Nessun premio → R1 FAIL + R8 FAIL
  const mkNoPrize = validateMarketing(
    { prizeText: '', headline: '', cta: 'Gioca ora', storeName: 'Bar', logoImage: null, expiresText: '' },
    null, 'a4'
  );
  assertMk('MK-06 Nessun premio: R1 deve fallire',            mkNoPrize.fail.filter(f => f.startsWith('R1')).length > 0);
  assertMk('MK-07 Nessun premio: R8 (meta) deve fallire',     mkNoPrize.fail.filter(f => f.startsWith('R8')).length > 0);

  // Headline generica con premio presente → R2 FAIL
  const mkGeneric = validateMarketing(
    { prizeText: '', headline: 'Inquadra e vinci', cta: 'Gioca', storeName: 'Bar', logoImage: null, expiresText: '' },
    null, 'a4'
  );
  assertMk('MK-08 Headline generica senza premio: R2 fallisce', mkGeneric.fail.filter(f => f.startsWith('R2 Headline')).length > 0);

  // Con scadenza → R7 warn o pass (debole ma presente)
  const mkWithDate = validateMarketing(
    { prizeText: '🍺 Birra gratis', headline: '', cta: 'Gioca', storeName: 'Bar', logoImage: null, expiresText: 'Valido fino al 31/12/2026' },
    boxesA4, 'a4'
  );
  assertMk('MK-09 Con scadenza: R7 non produce FAIL',          mkWithDate.fail.filter(f => f.startsWith('R7')).length === 0);

  // Con urgenza forte → R7 PASS
  const mkUrgent = validateMarketing(
    { prizeText: '🍺 Birra gratis', headline: '', cta: 'Gioca', storeName: 'Bar', logoImage: null, expiresText: 'Solo oggi — ultimi premi disponibili' },
    boxesA4, 'a4'
  );
  assertMk('MK-10 Urgenza forte: R7 PASS',                     mkUrgent.pass.filter(p => p.startsWith('R7')).length > 0);

  console.log(`\n  Risultato Marketing Validator: ${mkPassed}/${mkPassed + mkFailed} test superati`);
  if (mkFailed > 0) console.warn(`  ⚠️  ${mkFailed} test falliti — verificare validateMarketing`);
  console.groupEnd();

  return { passed: passed + m2Passed + m3Passed + mkPassed, failed: failed + m2Failed + m3Failed + mkFailed };
}

initChannelCheckboxes();
init().catch((error) => setError(error.message));

if (location.hostname === 'localhost') runTests();
