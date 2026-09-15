window.PromoGames = (() => {
  const META = {
    scratch_card: {
      title: 'Raschia la card',
      help: 'Passa il dito sulla card',
      playLabel: 'Inizia e gratta'
    },
    wheel: {
      title: 'Ruota della fortuna',
      help: 'Premi per far girare la ruota',
      playLabel: 'Gira la ruota'
    },
    instant_reveal: {
      title: 'Scatole misteriose',
      help: 'Scegli una scatola',
      playLabel: 'Scegli una scatola'
    }
  };

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function storeInitials(name) {
    return String(name || 'GV')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0].toUpperCase())
      .join('');
  }

  function getTicketMeta(campaignConfig) {
    const store = campaignConfig?.store || {};
    return {
      storeName: store.name || 'Gratta & Vinci',
      campaignName: campaignConfig?.name || 'Gioco promozionale',
      logoUrl: store.logoUrl || '',
      primary: store.primaryColor || '#667eea',
      secondary: store.secondaryColor || '#764ba2'
    };
  }

  /** Cornice tagliando condivisa: testata + eventuale istruzione + corpo gioco + micro-testo. */
  function renderPaperTicket(middleHtml, campaignConfig, reducedMotion, cueText) {
    const { storeName, campaignName, logoUrl } = getTicketMeta(campaignConfig);
    const initials = storeInitials(storeName);
    const logoHtml = logoUrl
      ? `<img src="${escapeHtml(logoUrl)}" alt="${escapeHtml(storeName)}">`
      : `<span class="paper-ticket-initials" aria-hidden="true">${escapeHtml(initials)}</span>`;
    const cueHtml = cueText
      ? `<p class="paper-ticket-cue">${escapeHtml(cueText)}</p>`
      : '';

    return `
      <article class="paper-ticket${reducedMotion ? ' paper-ticket--static' : ''}" id="paperTicket">
        <header class="paper-ticket-header">
          <div class="paper-ticket-logo">${logoHtml}</div>
          <div class="paper-ticket-titles">
            <p class="paper-ticket-store">${escapeHtml(storeName)}</p>
            <p class="paper-ticket-campaign">${escapeHtml(campaignName)}</p>
          </div>
        </header>
        ${cueHtml}
        ${middleHtml}
        <footer class="paper-ticket-footer">
          <span>Gioco promozionale</span>
        </footer>
      </article>
    `;
  }

  function parseHexColor(value) {
    const raw = String(value || '').replace('#', '').trim();
    const hex = raw.length === 3
      ? raw.split('').map((ch) => ch + ch).join('')
      : raw;
    if (!/^[0-9a-fA-F]{6}$/.test(hex)) return null;
    return {
      r: parseInt(hex.slice(0, 2), 16),
      g: parseInt(hex.slice(2, 4), 16),
      b: parseInt(hex.slice(4, 6), 16)
    };
  }

  function mixHex(a, b, t) {
    const A = parseHexColor(a);
    const B = parseHexColor(b);
    if (!A || !B) return a || '#667eea';
    const mix = (from, to) => Math.round(from + (to - from) * t);
    const toHex = (n) => n.toString(16).padStart(2, '0');
    return `#${toHex(mix(A.r, B.r))}${toHex(mix(A.g, B.g))}${toHex(mix(A.b, B.b))}`;
  }

  function brandWheelPalette(primary, secondary) {
    return [
      primary,
      secondary,
      mixHex(primary, '#ffffff', 0.28),
      mixHex(secondary, '#111827', 0.18),
      mixHex(primary, secondary, 0.5),
      mixHex(secondary, '#ffffff', 0.32),
      mixHex(primary, '#111827', 0.22),
      mixHex(secondary, primary, 0.4)
    ];
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

  function drawCenteredText(ctx, text, x, y, maxWidth, lineHeight, maxLines) {
    const words = String(text || '').split(/\s+/).filter(Boolean);
    const lines = [];
    let line = '';

    for (const word of words) {
      const testLine = line ? `${line} ${word}` : word;
      if (ctx.measureText(testLine).width > maxWidth && line) {
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
      ctx.fillText(textLine, x, y + index * lineHeight);
    });
  }

  class ScratchGame {
    constructor(container, context) {
      this.container = container;
      this.context = context;
      this.threshold = 50;
      this.revealed = false;
      this.playStarted = false;
      this.scratching = false;
      this.initialCoverPixels = 0;
      this.lastScratch = null;
      this.dpr = 1;
      this.brushRadius = 26;
      this.shimmerPhase = 0;
      this.shimmerRaf = null;
      this.reducedMotion = false;
      this.resultLayer = document.createElement('canvas');
      this.coverLayer = document.createElement('canvas');
      this.resultLayerCtx = this.resultLayer.getContext('2d', { willReadFrequently: true });
      this.coverLayerCtx = this.coverLayer.getContext('2d', { willReadFrequently: true });
      this.handlers = {};
      this.particleLayer = null;
    }

    start() {
      this.reducedMotion = Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
      const middleHtml = `
          <div class="paper-ticket-lamina">
            <canvas id="scratchCanvas" width="420" height="236" aria-label="Area da grattare"></canvas>
            <div class="scratch-particles" id="scratchParticles" aria-hidden="true"></div>
          </div>
          <div class="scratch-progress"><div id="scratchProgressBar"></div></div>
          <p id="scratchProgressText" class="scratch-progress-text">Continua a grattare</p>
      `;
      this.container.innerHTML = renderPaperTicket(
        middleHtml,
        this.context.campaignConfig,
        this.reducedMotion,
        META.scratch_card.help
      );

      this.ticket = this.container.querySelector('#paperTicket');
      this.canvas = this.container.querySelector('#scratchCanvas');
      this.ctx = this.canvas.getContext('2d');
      this.progressBar = this.container.querySelector('#scratchProgressBar');
      this.progressText = this.container.querySelector('#scratchProgressText');
      this.particleLayer = this.container.querySelector('#scratchParticles');

      this.syncCanvasSize();
      this.drawWaitingLayer();
      this.drawCoverLayer();
      this.initialCoverPixels = this.countCoveredPixels();
      this.composeScratchCanvas(0);
      this.bindEvents();
      if (!this.reducedMotion) this.startShimmer();
    }

    syncCanvasSize() {
      const host = this.container.querySelector('.paper-ticket-lamina') || this.container;
      const cssWidth = Math.max(260, Math.min(host.clientWidth || 420, 440));
      const cssHeight = Math.round(cssWidth * (236 / 420));
      this.dpr = Math.min(window.devicePixelRatio || 1, 2.5);
      this.brushRadius = Math.max(20, Math.round(24 * this.dpr));
      this.canvas.style.width = `${cssWidth}px`;
      this.canvas.style.height = `${cssHeight}px`;
      this.canvas.width = Math.round(cssWidth * this.dpr);
      this.canvas.height = Math.round(cssHeight * this.dpr);
      this.resultLayer.width = this.canvas.width;
      this.resultLayer.height = this.canvas.height;
      this.coverLayer.width = this.canvas.width;
      this.coverLayer.height = this.canvas.height;
    }

    font(weight, sizePx) {
      return `${weight} ${Math.round(sizePx * this.dpr)}px Arial, Helvetica, sans-serif`;
    }

    bindEvents() {
      this.handlers.mousedown = (event) => {
        this.scratching = true;
        this.lastScratch = null;
        this.handleScratch(event);
      };
      this.handlers.mouseup = () => {
        this.scratching = false;
        this.lastScratch = null;
      };
      this.handlers.mouseleave = () => {
        this.scratching = false;
        this.lastScratch = null;
      };
      this.handlers.mousemove = (event) => {
        if (this.scratching) this.handleScratch(event);
      };
      this.handlers.touchstart = (event) => {
        this.scratching = true;
        this.lastScratch = null;
        this.handleScratch(event);
      };
      this.handlers.touchmove = (event) => {
        if (this.scratching) this.handleScratch(event);
      };
      this.handlers.touchend = () => {
        this.scratching = false;
        this.lastScratch = null;
      };

      this.canvas.addEventListener('mousedown', this.handlers.mousedown);
      this.canvas.addEventListener('mouseup', this.handlers.mouseup);
      this.canvas.addEventListener('mouseleave', this.handlers.mouseleave);
      this.canvas.addEventListener('mousemove', this.handlers.mousemove);
      this.canvas.addEventListener('touchstart', this.handlers.touchstart, { passive: false });
      this.canvas.addEventListener('touchmove', this.handlers.touchmove, { passive: false });
      this.canvas.addEventListener('touchend', this.handlers.touchend);
    }

    getCanvasPosition(event) {
      const rect = this.canvas.getBoundingClientRect();
      const scaleX = this.canvas.width / rect.width;
      const scaleY = this.canvas.height / rect.height;
      const clientX = event.clientX ?? event.touches?.[0]?.clientX;
      const clientY = event.clientY ?? event.touches?.[0]?.clientY;
      return {
        x: (clientX - rect.left) * scaleX,
        y: (clientY - rect.top) * scaleY
      };
    }

    handleScratch(event) {
      if (this.revealed) return;
      event.preventDefault();
      if (!this.playStarted) {
        this.playStarted = true;
        this.stopShimmer();
        this.ticket?.classList.add('is-scratching');
        this.context.onPlayStart?.();
      }
      const { x, y } = this.getCanvasPosition(event);
      this.scratchAt(x, y);
    }

    countCoveredPixels() {
      const imageData = this.coverLayerCtx.getImageData(0, 0, this.coverLayer.width, this.coverLayer.height);
      let covered = 0;
      for (let i = 3; i < imageData.data.length; i += 4) {
        if (imageData.data[i] > 0) covered += 1;
      }
      return covered;
    }

    updateScratchProgress(percentage) {
      const safePercentage = Math.max(0, Math.min(100, Math.round(percentage)));
      this.progressBar.style.width = `${safePercentage}%`;
      this.progressText.textContent = safePercentage >= this.threshold
        ? ''
        : 'Continua a grattare';
    }

    startShimmer() {
      const tick = () => {
        if (this.revealed || this.playStarted) return;
        this.shimmerPhase = (this.shimmerPhase + 0.008) % 1;
        this.composeScratchCanvas(this.shimmerPhase);
        this.shimmerRaf = requestAnimationFrame(tick);
      };
      this.shimmerRaf = requestAnimationFrame(tick);
    }

    stopShimmer() {
      if (this.shimmerRaf) {
        cancelAnimationFrame(this.shimmerRaf);
        this.shimmerRaf = null;
      }
    }

    drawPaperBase(ctx) {
      const { width, height } = ctx.canvas;
      const radius = Math.round(14 * this.dpr);
      const primary = this.context.campaignConfig?.store?.primaryColor || '#667eea';
      const secondary = this.context.campaignConfig?.store?.secondaryColor || '#764ba2';

      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = '#f7f3ea';
      roundedRect(ctx, 0, 0, width, height, radius);
      ctx.fill();

      ctx.save();
      roundedRect(ctx, 0, 0, width, height, radius);
      ctx.clip();
      const noise = ctx.getImageData(0, 0, width, height);
      for (let i = 0; i < noise.data.length; i += 4) {
        const n = (Math.random() - 0.5) * 10;
        noise.data[i] = Math.max(0, Math.min(255, noise.data[i] + n));
        noise.data[i + 1] = Math.max(0, Math.min(255, noise.data[i + 1] + n * 0.9));
        noise.data[i + 2] = Math.max(0, Math.min(255, noise.data[i + 2] + n * 0.7));
      }
      ctx.putImageData(noise, 0, 0);
      ctx.restore();

      ctx.strokeStyle = primary;
      ctx.lineWidth = Math.max(3, Math.round(3.5 * this.dpr));
      roundedRect(
        ctx,
        Math.round(5 * this.dpr),
        Math.round(5 * this.dpr),
        width - Math.round(10 * this.dpr),
        height - Math.round(10 * this.dpr),
        Math.round(10 * this.dpr)
      );
      ctx.stroke();

      ctx.strokeStyle = secondary;
      ctx.globalAlpha = 0.55;
      ctx.lineWidth = Math.max(1, Math.round(1.5 * this.dpr));
      roundedRect(
        ctx,
        Math.round(10 * this.dpr),
        Math.round(10 * this.dpr),
        width - Math.round(20 * this.dpr),
        height - Math.round(20 * this.dpr),
        Math.round(8 * this.dpr)
      );
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    drawWaitingLayer() {
      const primary = this.context.campaignConfig?.store?.primaryColor || '#667eea';
      const secondary = this.context.campaignConfig?.store?.secondaryColor || '#764ba2';
      this.drawPaperBase(this.resultLayerCtx);
      this.resultLayerCtx.textAlign = 'center';
      this.resultLayerCtx.textBaseline = 'middle';
      this.resultLayerCtx.fillStyle = primary;
      this.resultLayerCtx.font = this.font(800, 15);
      this.resultLayerCtx.fillText(
        'Ancora un po’ e scoprirai l’esito',
        this.resultLayer.width / 2,
        this.resultLayer.height / 2
      );
      this.resultLayerCtx.fillStyle = secondary;
      this.resultLayerCtx.globalAlpha = 0.2;
      this.resultLayerCtx.font = this.font(700, 12);
      this.resultLayerCtx.fillText('…', this.resultLayer.width / 2, this.resultLayer.height / 2 + Math.round(22 * this.dpr));
      this.resultLayerCtx.globalAlpha = 1;
    }

    drawResultLayer() {
      this.drawPaperBase(this.resultLayerCtx);
      this.resultLayerCtx.textAlign = 'center';
      this.resultLayerCtx.textBaseline = 'middle';
      this.resultLayerCtx.fillStyle = '#6b7280';
      this.resultLayerCtx.font = this.font(700, 22);
      this.resultLayerCtx.fillText('…', this.resultLayer.width / 2, this.resultLayer.height / 2);
    }

    drawCoverLayer() {
      const { width, height } = this.coverLayer;
      const radius = Math.round(14 * this.dpr);
      this.coverLayerCtx.clearRect(0, 0, width, height);

      const metal = this.coverLayerCtx.createLinearGradient(0, 0, width, height);
      metal.addColorStop(0, '#7a828c');
      metal.addColorStop(0.2, '#cfd5dc');
      metal.addColorStop(0.38, '#9aa3ad');
      metal.addColorStop(0.55, '#e8ecf0');
      metal.addColorStop(0.72, '#a8b1bb');
      metal.addColorStop(1, '#6a7380');
      this.coverLayerCtx.fillStyle = metal;
      roundedRect(this.coverLayerCtx, 0, 0, width, height, radius);
      this.coverLayerCtx.fill();

      this.coverLayerCtx.save();
      roundedRect(this.coverLayerCtx, 0, 0, width, height, radius);
      this.coverLayerCtx.clip();

      this.coverLayerCtx.strokeStyle = 'rgba(255,255,255,0.16)';
      this.coverLayerCtx.lineWidth = Math.max(1, Math.round(this.dpr));
      for (let i = -height; i < width + height; i += Math.round(8 * this.dpr)) {
        this.coverLayerCtx.beginPath();
        this.coverLayerCtx.moveTo(i, 0);
        this.coverLayerCtx.lineTo(i + height, height);
        this.coverLayerCtx.stroke();
      }

      const grain = this.coverLayerCtx.getImageData(0, 0, width, height);
      for (let i = 0; i < grain.data.length; i += 16) {
        const n = (Math.random() - 0.5) * 18;
        grain.data[i] = Math.max(0, Math.min(255, grain.data[i] + n));
        grain.data[i + 1] = Math.max(0, Math.min(255, grain.data[i + 1] + n));
        grain.data[i + 2] = Math.max(0, Math.min(255, grain.data[i + 2] + n));
      }
      this.coverLayerCtx.putImageData(grain, 0, 0);

      this.coverLayerCtx.textAlign = 'center';
      this.coverLayerCtx.textBaseline = 'middle';
      this.coverLayerCtx.fillStyle = 'rgba(255,255,255,0.88)';
      this.coverLayerCtx.font = this.font(800, 13);
      this.coverLayerCtx.fillText('GRATTA QUI', width / 2, height / 2 - Math.round(28 * this.dpr));
      this.coverLayerCtx.fillStyle = 'rgba(255,255,255,0.96)';
      this.coverLayerCtx.font = this.font(900, 20);
      this.coverLayerCtx.fillText('CONTINUA A GRATTARE', width / 2, height / 2);
      this.coverLayerCtx.font = this.font(700, 12);
      this.coverLayerCtx.fillStyle = 'rgba(255,255,255,0.8)';
      this.coverLayerCtx.fillText('Scopri se hai vinto il premio', width / 2, height / 2 + Math.round(24 * this.dpr));
      this.coverLayerCtx.restore();
    }

    drawSheenOverlay(phase) {
      if (this.playStarted || this.revealed) return;
      const { width, height } = this.canvas;
      const radius = Math.round(14 * this.dpr);
      const sheenX = ((phase * 1.35) % 1.35) * width - width * 0.25;
      this.ctx.save();
      roundedRect(this.ctx, 0, 0, width, height, radius);
      this.ctx.clip();
      const sheen = this.ctx.createLinearGradient(sheenX, 0, sheenX + width * 0.38, height);
      sheen.addColorStop(0, 'rgba(255,255,255,0)');
      sheen.addColorStop(0.48, 'rgba(255,255,255,0.26)');
      sheen.addColorStop(0.58, 'rgba(255,255,255,0.06)');
      sheen.addColorStop(1, 'rgba(255,255,255,0)');
      this.ctx.fillStyle = sheen;
      this.ctx.fillRect(0, 0, width, height);
      this.ctx.restore();
    }

    composeScratchCanvas(phase = null) {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      this.ctx.drawImage(this.resultLayer, 0, 0);
      this.ctx.drawImage(this.coverLayer, 0, 0);
      if (phase !== null && !this.playStarted && !this.revealed) {
        this.drawSheenOverlay(phase);
      }
    }

    spawnParticles(x, y) {
      if (this.reducedMotion || !this.particleLayer) return;
      const rect = this.canvas.getBoundingClientRect();
      const scaleX = rect.width / this.canvas.width;
      const scaleY = rect.height / this.canvas.height;
      const count = 2 + Math.floor(Math.random() * 2);
      for (let i = 0; i < count; i += 1) {
        const speck = document.createElement('span');
        speck.className = 'scratch-speck';
        const ox = (Math.random() - 0.5) * 10;
        speck.style.left = `${x * scaleX + ox}px`;
        speck.style.top = `${y * scaleY}px`;
        speck.style.setProperty('--speck-x', `${(Math.random() - 0.5) * 18}px`);
        speck.style.setProperty('--speck-y', `${12 + Math.random() * 22}px`);
        this.particleLayer.appendChild(speck);
        setTimeout(() => speck.remove(), 420);
      }
    }

    scratchBrush(x, y) {
      const ctx = this.coverLayerCtx;
      ctx.save();
      ctx.globalCompositeOperation = 'destination-out';
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#000';
      ctx.fillStyle = '#000';

      const stamp = (px, py, radius) => {
        ctx.beginPath();
        const lobes = 5;
        for (let i = 0; i < lobes; i += 1) {
          const angle = (Math.PI * 2 * i) / lobes + Math.random();
          const r = radius * (0.55 + Math.random() * 0.55);
          ctx.moveTo(px + Math.cos(angle) * r, py + Math.sin(angle) * r);
          ctx.arc(px + Math.cos(angle) * r * 0.35, py + Math.sin(angle) * r * 0.35, r * 0.7, 0, Math.PI * 2);
        }
        ctx.fill();
      };

      if (this.lastScratch) {
        const dx = x - this.lastScratch.x;
        const dy = y - this.lastScratch.y;
        const dist = Math.hypot(dx, dy);
        const steps = Math.max(1, Math.ceil(dist / (this.brushRadius * 0.35)));
        for (let i = 0; i <= steps; i += 1) {
          const t = i / steps;
          const px = this.lastScratch.x + dx * t + (Math.random() - 0.5) * this.dpr * 2;
          const py = this.lastScratch.y + dy * t + (Math.random() - 0.5) * this.dpr * 2;
          stamp(px, py, this.brushRadius * (0.85 + Math.random() * 0.35));
        }
      } else {
        stamp(x, y, this.brushRadius);
      }

      ctx.restore();
    }

    scratchAt(x, y) {
      this.scratchBrush(x, y);
      this.lastScratch = { x, y };
      this.spawnParticles(x, y);
      this.composeScratchCanvas();

      const remainingCoverPixels = this.countCoveredPixels();
      const clearedCoverPixels = Math.max(0, this.initialCoverPixels - remainingCoverPixels);
      const percentage = this.initialCoverPixels ? (clearedCoverPixels / this.initialCoverPixels) * 100 : 0;
      this.updateScratchProgress(percentage);

      if (percentage >= this.threshold) {
        this.reveal();
      }
    }

    reveal() {
      if (this.revealed) return;
      this.revealed = true;
      this.stopShimmer();
      if (!this.playStarted) {
        this.playStarted = true;
        this.context.onPlayStart?.();
      }
      this.drawResultLayer();
      this.coverLayerCtx.clearRect(0, 0, this.coverLayer.width, this.coverLayer.height);
      this.composeScratchCanvas();
      this.updateScratchProgress(100);
      this.ticket?.classList.add('is-revealed');
      this.context.onReveal();
    }

    destroy() {
      this.stopShimmer();
      if (!this.canvas) {
        this.container.innerHTML = '';
        return;
      }
      Object.entries(this.handlers).forEach(([event, handler]) => {
        this.canvas.removeEventListener(event, handler);
      });
      this.container.innerHTML = '';
    }
  }

  class WheelGame {
    constructor(container, context) {
      this.container = container;
      this.context = context;
      this.spinning = false;
      this.stopping = false;
      this.finished = false;
      this.rotation = 0;
      this.spinSpeed = 0.28;
      this.rafId = null;
      this.spinTimeoutId = null;
      this.handlers = {};
    }

    cancelAnimation() {
      if (this.rafId) {
        cancelAnimationFrame(this.rafId);
        this.rafId = null;
      }
      if (this.spinTimeoutId) {
        clearTimeout(this.spinTimeoutId);
        this.spinTimeoutId = null;
      }
    }

    start() {
      const reducedMotion = Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
      const middleHtml = `
          <div class="paper-ticket-lamina paper-ticket-play">
            <div class="wheel-shell">
              <canvas id="wheelCanvas" width="320" height="320" aria-label="Ruota della fortuna"></canvas>
              <p id="wheelStatus" class="wheel-status">Premi per far girare la ruota.</p>
              <button id="spinWheelBtn" type="button" class="primary wheel-spin-btn">Gira la ruota</button>
            </div>
          </div>
      `;
      this.container.innerHTML = renderPaperTicket(
        middleHtml,
        this.context.campaignConfig,
        reducedMotion,
        META.wheel.help
      );
      this.ticket = this.container.querySelector('#paperTicket');
      this.canvas = this.container.querySelector('#wheelCanvas');
      this.ctx = this.canvas.getContext('2d');
      this.canvas.style.touchAction = 'manipulation';
      this.spinBtn = this.container.querySelector('#spinWheelBtn');
      this.statusEl = this.container.querySelector('#wheelStatus');
      this.segments = this.buildSegments();
      if (!this.segments.length) {
        this.statusEl.textContent = 'Nessun premio disponibile al momento.';
        this.spinBtn.disabled = true;
        return;
      }
      this.targetRotation = this.getTargetRotation();
      this.drawWheel(this.rotation);
      this.handlers.spinClick = () => this.handleSpinButton();
      this.spinBtn.addEventListener('click', this.handlers.spinClick);
    }

    getWheelPrizes() {
      const seen = new Set();
      return (this.context.campaignConfig?.prizes || [])
        .filter((prize) => prize.available !== false)
        .filter((prize) => {
          if (!prize.id || seen.has(prize.id)) return false;
          seen.add(prize.id);
          return true;
        })
        .slice(0, 8);
    }

    buildSegments() {
      const guaranteedWin = Boolean(this.context.campaignConfig?.guaranteedWin);
      const availablePrizes = this.getWheelPrizes();
      const { primary, secondary } = getTicketMeta(this.context.campaignConfig);
      const palette = brandWheelPalette(primary, secondary);
      const loseLabel = 'Riprova';

      const formatLabel = (prize) => {
        const raw = `${prize.emoji || ''} ${prize.name}`.trim();
        return raw.length > 14 ? `${raw.slice(0, 13)}…` : raw;
      };

      if (guaranteedWin && availablePrizes.length > 0) {
        return availablePrizes.map((prize, index) => ({
          label: formatLabel(prize),
          kind: 'win',
          prizeId: prize.id,
          prizeName: prize.name,
          color: palette[index % palette.length]
        }));
      }

      const prizes = availablePrizes.slice(0, 5);
      const segments = [{ label: loseLabel, kind: 'lose' }];
      prizes.forEach((prize) => {
        segments.push({
          label: formatLabel(prize),
          kind: 'win',
          prizeId: prize.id,
          prizeName: prize.name
        });
      });

      while (segments.length < 6) {
        segments.push({ label: loseLabel, kind: 'lose' });
      }

      return segments.slice(0, 8).map((segment, index) => ({
        ...segment,
        color: palette[index % palette.length]
      }));
    }

    getTargetRotation() {
      if (!this.segments.length) return 0;
      const slice = (Math.PI * 2) / this.segments.length;
      const targetIndex = Math.floor(Math.random() * this.segments.length);
      const segmentCenter = targetIndex * slice + slice / 2;
      return Math.PI * 1.5 - segmentCenter;
    }

    drawWheel(rotation) {
      if (!this.ctx || !this.segments.length) return;

      const ctx = this.ctx;
      const center = this.canvas.width / 2;
      const radius = center - 14;
      const slice = (Math.PI * 2) / this.segments.length;
      const safeRotation = Number.isFinite(rotation) ? rotation : 0;
      const { primary } = getTicketMeta(this.context.campaignConfig);

      ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      ctx.save();
      ctx.translate(center, center);
      ctx.rotate(safeRotation);

      this.segments.forEach((segment, index) => {
        const start = index * slice;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.fillStyle = segment.color;
        ctx.arc(0, 0, radius, start, start + slice);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.92)';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.save();
        ctx.rotate(start + slice / 2);
        ctx.textAlign = 'center';
        ctx.fillStyle = '#ffffff';
        ctx.font = `700 ${this.segments.length > 6 ? 10 : 12}px Arial, Helvetica, sans-serif`;
        ctx.fillText(segment.label, radius * 0.62, 4);
        ctx.restore();
      });

      ctx.restore();

      ctx.fillStyle = '#111827';
      ctx.beginPath();
      ctx.moveTo(center, 8);
      ctx.lineTo(center - 12, 30);
      ctx.lineTo(center + 12, 30);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(center, center, 30, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = mixHex(primary, '#cbd5e1', 0.35);
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.fillStyle = primary;
      ctx.font = '900 14px Arial, Helvetica, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('GIRA', center, center + 5);
    }

    handleSpinButton() {
      if (this.finished || !this.segments.length) return;
      if (!this.spinning) {
        this.startSpinning();
        return;
      }
      if (!this.stopping) {
        this.stopSpinning();
      }
    }

    startSpinning() {
      this.cancelAnimation();
      this.spinning = true;
      this.stopping = false;
      this.context.onPlayStart?.();
      this.spinBtn.textContent = 'STOP!';
      this.spinBtn.classList.add('wheel-stop-btn');
      this.statusEl.textContent = 'La ruota gira… premi STOP quando vuoi!';
      this.lastFrame = performance.now();

      const tick = (now) => {
        if (!this.spinning || this.stopping) return;
        const delta = Math.min(32, Math.max(0, now - this.lastFrame));
        this.lastFrame = now;
        this.rotation += this.spinSpeed * (delta / 16);
        this.drawWheel(this.rotation);
        this.rafId = requestAnimationFrame(tick);
      };

      this.rafId = requestAnimationFrame(tick);
      this.spinTimeoutId = setTimeout(() => {
        if (this.spinning && !this.stopping && !this.finished) {
          this.statusEl.textContent = 'Tempo scaduto: la ruota si ferma da sola.';
          this.stopSpinning();
        }
      }, 9000);
    }

    computeStopRotation(current, target, minTurns = 2.5) {
      const twoPi = Math.PI * 2;
      const normalize = (value) => ((value % twoPi) + twoPi) % twoPi;
      const minFinal = current + minTurns * twoPi;
      let final = minFinal;
      const offset = (normalize(target) - normalize(final) + twoPi) % twoPi;
      final += offset;
      if (final < minFinal) final += twoPi;
      return final;
    }

    stopSpinning() {
      if (this.stopping || this.finished) return;
      this.stopping = true;
      this.cancelAnimation();
      this.spinBtn.disabled = true;
      this.spinBtn.classList.remove('wheel-stop-btn');
      this.spinBtn.textContent = 'Si ferma…';
      this.statusEl.textContent = 'Stai fermando la ruota…';

      const startRotation = this.rotation;
      const finalRotation = this.computeStopRotation(startRotation, this.targetRotation);
      const duration = 2200;
      const start = performance.now();

      const animate = (now) => {
        const progress = Math.min((now - start) / duration, 1);
        // Decelerazione naturale (ease-out quint), non lineare
        const eased = 1 - Math.pow(1 - progress, 5);
        this.rotation = startRotation + (finalRotation - startRotation) * eased;
        this.drawWheel(this.rotation);

        if (progress < 1) {
          this.rafId = requestAnimationFrame(animate);
          return;
        }

        this.finished = true;
        this.spinning = false;
        this.stopping = false;
        this.statusEl.textContent = 'La ruota si è fermata sul tuo esito.';
        this.spinBtn.textContent = 'Esito sbloccato';
        this.ticket?.classList.add('is-revealed');
        this.context.onReveal();
      };

      this.rafId = requestAnimationFrame(animate);
    }

    destroy() {
      this.cancelAnimation();
      if (this.spinBtn && this.handlers.spinClick) {
        this.spinBtn.removeEventListener('click', this.handlers.spinClick);
      }
      this.container.innerHTML = '';
    }
  }

  class InstantRevealGame {
    constructor(container, context) {
      this.container = container;
      this.context = context;
      this.opened = false;
      this.boxCount = 3;
    }

    start() {
      const { primary, secondary } = getTicketMeta(this.context.campaignConfig);
      const guaranteedWin = Boolean(this.context.campaignConfig?.guaranteedWin);
      const prompt = guaranteedWin
        ? 'Scegli una scatola: ogni partecipante vince uno dei premi disponibili.'
        : 'Solo una scatola contiene il tuo esito. Quale scegli?';
      const reducedMotion = Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);

      const middleHtml = `
          <div class="paper-ticket-lamina paper-ticket-play">
            <div class="mystery-shell" style="--gift-primary:${primary};--gift-secondary:${secondary}">
              <p class="mystery-prompt">${prompt}</p>
              <div class="mystery-grid" id="mysteryGrid">
                ${Array.from({ length: this.boxCount }, (_, index) => `
                  <button type="button" class="mystery-box" data-box-index="${index}" aria-label="Scatola ${index + 1}">
                    <span class="mystery-box-top">?</span>
                    <span class="mystery-box-label">Scatola ${index + 1}</span>
                  </button>
                `).join('')}
              </div>
              <div id="mysteryConfetti" class="mystery-confetti" aria-hidden="true"></div>
            </div>
          </div>
      `;
      this.container.innerHTML = renderPaperTicket(
        middleHtml,
        this.context.campaignConfig,
        reducedMotion,
        META.instant_reveal.help
      );

      this.ticket = this.container.querySelector('#paperTicket');
      this.grid = this.container.querySelector('#mysteryGrid');
      this.confettiEl = this.container.querySelector('#mysteryConfetti');
      this.boxButtons = [...this.container.querySelectorAll('.mystery-box')];
      this.handlers = {};
      this.boxButtons.forEach((button, index) => {
        const handler = () => this.openBox(index);
        this.handlers[`box${index}`] = handler;
        button.addEventListener('click', handler);
      });
    }

    spawnConfetti() {
      const { primary, secondary } = getTicketMeta(this.context.campaignConfig);
      const colors = [primary, secondary, mixHex(primary, '#ffffff', 0.35), mixHex(secondary, '#f59e0b', 0.4), '#ffffff'];
      for (let i = 0; i < 28; i += 1) {
        const piece = document.createElement('span');
        piece.className = 'mystery-confetti-piece';
        piece.style.left = `${Math.random() * 100}%`;
        piece.style.background = colors[i % colors.length];
        piece.style.animationDelay = `${Math.random() * 0.35}s`;
        piece.style.setProperty('--drift', `${-40 + Math.random() * 80}px`);
        this.confettiEl.appendChild(piece);
      }
    }

    openBox(selectedIndex) {
      if (this.opened) return;
      this.opened = true;
      this.context.onPlayStart?.();

      const { campaignConfig } = this.context;
      const guaranteedWin = Boolean(campaignConfig?.guaranteedWin);
      const decoyPrizes = (campaignConfig?.prizes || []).map((prize) => prize.name);
      const boxes = [...this.grid.querySelectorAll('.mystery-box')];

      boxes.forEach((box, index) => {
        box.disabled = true;
        if (index === selectedIndex) {
          box.classList.add('selected', 'opening');
        } else {
          box.classList.add('dimmed');
        }
      });

      setTimeout(() => {
        boxes.forEach((box, index) => {
          if (index === selectedIndex) {
            box.classList.add('opened');
            box.innerHTML = `
              <span class="mystery-box-top">✨</span>
              <span class="mystery-box-label">...</span>
            `;
          } else {
            box.classList.add('opened', 'empty');
            const decoy = decoyPrizes[(index + selectedIndex) % Math.max(decoyPrizes.length, 1)] || 'Vuota';
            box.innerHTML = `
              <span class="mystery-box-top">${guaranteedWin && decoyPrizes.length ? '✨' : '📦'}</span>
              <span class="mystery-box-label">${guaranteedWin && decoyPrizes.length ? decoy : 'Vuota'}</span>
            `;
          }
        });

        this.ticket?.classList.add('is-revealed');
        setTimeout(() => this.context.onReveal(), 800);
      }, 650);
    }

    destroy() {
      if (this.boxButtons) {
        this.boxButtons.forEach((button, index) => {
          const handler = this.handlers?.[`box${index}`];
          if (handler) button.removeEventListener('click', handler);
        });
      }
      this.container.innerHTML = '';
    }
  }

  const FACTORIES = {
    scratch_card: ScratchGame,
    wheel: WheelGame,
    instant_reveal: InstantRevealGame
  };

  return {
    getMeta(gameType) {
      return META[gameType] || META.scratch_card;
    },
    list() {
      return Object.entries(META).map(([id, meta]) => ({ id, ...meta }));
    },
    create(gameType, container, context) {
      const GameClass = FACTORIES[gameType] || ScratchGame;
      return new GameClass(container, context);
    }
  };
})();
