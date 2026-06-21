window.PromoGames = (() => {
  const META = {
    scratch_card: {
      title: 'Raschia la card',
      help: 'Passa il dito sulla card per scoprire l’esito. La giocata vale una sola volta.',
      playLabel: 'Inizia e gratta'
    },
    wheel: {
      title: 'Ruota della fortuna',
      help: 'Premi il pulsante e guarda la ruota fermarsi sul tuo esito.',
      playLabel: 'Gira la ruota'
    },
    instant_reveal: {
      title: 'Apri il regalo',
      help: 'Tocca il regalo per scoprire se hai vinto. Puoi aprirlo una sola volta.',
      playLabel: 'Apri il regalo'
    }
  };

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
      this.scratching = false;
      this.initialCoverPixels = 0;
      this.resultLayer = document.createElement('canvas');
      this.coverLayer = document.createElement('canvas');
      this.resultLayerCtx = this.resultLayer.getContext('2d');
      this.coverLayerCtx = this.coverLayer.getContext('2d');
      this.handlers = {};
    }

    start() {
      this.container.innerHTML = `
        <canvas id="scratchCanvas" width="420" height="250"></canvas>
        <div class="scratch-progress"><div id="scratchProgressBar"></div></div>
        <p id="scratchProgressText" class="scratch-progress-text">Continua a grattare</p>
      `;

      this.canvas = this.container.querySelector('#scratchCanvas');
      this.ctx = this.canvas.getContext('2d');
      this.progressBar = this.container.querySelector('#scratchProgressBar');
      this.progressText = this.container.querySelector('#scratchProgressText');
      this.resultLayer.width = this.canvas.width;
      this.resultLayer.height = this.canvas.height;
      this.coverLayer.width = this.canvas.width;
      this.coverLayer.height = this.canvas.height;

      this.drawWaitingLayer();
      this.drawCoverLayer();
      this.initialCoverPixels = this.countCoveredPixels();
      this.composeScratchCanvas();
      this.bindEvents();
    }

    bindEvents() {
      this.handlers.mousedown = () => { this.scratching = true; };
      this.handlers.mouseup = () => { this.scratching = false; };
      this.handlers.mouseleave = () => { this.scratching = false; };
      this.handlers.mousemove = (event) => {
        if (this.scratching) this.handleScratch(event);
      };
      this.handlers.touchstart = (event) => {
        this.scratching = true;
        this.handleScratch(event);
      };
      this.handlers.touchmove = (event) => {
        if (this.scratching) this.handleScratch(event);
      };
      this.handlers.touchend = () => { this.scratching = false; };

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
        ? 'Risultato sbloccato.'
        : 'Continua a grattare';
    }

    drawWaitingLayer() {
      const primary = this.context.campaignConfig?.store?.primaryColor || '#667eea';
      const secondary = this.context.campaignConfig?.store?.secondaryColor || '#764ba2';
      this.resultLayerCtx.clearRect(0, 0, this.resultLayer.width, this.resultLayer.height);

      const gradient = this.resultLayerCtx.createLinearGradient(0, 0, this.resultLayer.width, this.resultLayer.height);
      gradient.addColorStop(0, '#fffaf0');
      gradient.addColorStop(1, '#eef2ff');
      this.resultLayerCtx.fillStyle = gradient;
      roundedRect(this.resultLayerCtx, 0, 0, this.resultLayer.width, this.resultLayer.height, 28);
      this.resultLayerCtx.fill();

      this.resultLayerCtx.fillStyle = primary;
      roundedRect(this.resultLayerCtx, 18, 18, this.resultLayer.width - 36, this.resultLayer.height - 36, 24);
      this.resultLayerCtx.fill();

      this.resultLayerCtx.fillStyle = '#ffffff';
      roundedRect(this.resultLayerCtx, 28, 28, this.resultLayer.width - 56, this.resultLayer.height - 56, 20);
      this.resultLayerCtx.fill();

      this.resultLayerCtx.textAlign = 'center';
      this.resultLayerCtx.fillStyle = primary;
      this.resultLayerCtx.font = '900 18px Arial';
      this.resultLayerCtx.fillText('CONTINUA A GRATTARE', this.resultLayer.width / 2, 104);
      this.resultLayerCtx.fillStyle = '#111827';
      this.resultLayerCtx.font = '900 28px Arial';
      this.resultLayerCtx.fillText('Il risultato è nascosto', this.resultLayer.width / 2, 145);
      this.resultLayerCtx.fillStyle = secondary;
      this.resultLayerCtx.font = '700 15px Arial';
      this.resultLayerCtx.fillText('Ancora un po’ e scoprirai l’esito', this.resultLayer.width / 2, 176);
    }

    drawResultLayer() {
      const { gameData, campaignConfig } = this.context;
      const primary = campaignConfig?.store?.primaryColor || '#667eea';
      const secondary = campaignConfig?.store?.secondaryColor || '#764ba2';
      this.resultLayerCtx.clearRect(0, 0, this.resultLayer.width, this.resultLayer.height);

      const gradient = this.resultLayerCtx.createLinearGradient(0, 0, this.resultLayer.width, this.resultLayer.height);
      gradient.addColorStop(0, '#fffaf0');
      gradient.addColorStop(1, '#eef2ff');
      this.resultLayerCtx.fillStyle = gradient;
      roundedRect(this.resultLayerCtx, 0, 0, this.resultLayer.width, this.resultLayer.height, 28);
      this.resultLayerCtx.fill();

      this.resultLayerCtx.fillStyle = primary;
      roundedRect(this.resultLayerCtx, 18, 18, this.resultLayer.width - 36, this.resultLayer.height - 36, 24);
      this.resultLayerCtx.fill();

      this.resultLayerCtx.fillStyle = '#ffffff';
      roundedRect(this.resultLayerCtx, 28, 28, this.resultLayer.width - 56, this.resultLayer.height - 56, 20);
      this.resultLayerCtx.fill();

      this.resultLayerCtx.fillStyle = secondary;
      this.resultLayerCtx.globalAlpha = 0.12;
      for (let i = 0; i < 18; i += 1) {
        this.resultLayerCtx.beginPath();
        this.resultLayerCtx.arc(
          35 + Math.random() * (this.resultLayer.width - 70),
          35 + Math.random() * (this.resultLayer.height - 70),
          4 + Math.random() * 9,
          0,
          Math.PI * 2
        );
        this.resultLayerCtx.fill();
      }
      this.resultLayerCtx.globalAlpha = 1;

      const hiddenText = gameData.won
        ? `${gameData.prize.emoji || ''} ${gameData.prize.name}`
        : campaignConfig?.loseMessage || gameData.loseMessage;

      this.resultLayerCtx.textAlign = 'center';
      this.resultLayerCtx.fillStyle = primary;
      this.resultLayerCtx.font = '800 15px Arial';
      this.resultLayerCtx.fillText(gameData.won ? 'HAI VINTO' : 'ESITO GIOCATA', this.resultLayer.width / 2, 72);
      this.resultLayerCtx.fillStyle = '#111827';
      this.resultLayerCtx.font = '900 28px Arial';
      drawCenteredText(this.resultLayerCtx, hiddenText, this.resultLayer.width / 2, 115, this.resultLayer.width - 86, 34, 2);
    }

    drawCoverLayer() {
      this.coverLayerCtx.clearRect(0, 0, this.coverLayer.width, this.coverLayer.height);
      const cover = this.coverLayerCtx.createLinearGradient(0, 0, this.coverLayer.width, this.coverLayer.height);
      cover.addColorStop(0, '#6b7280');
      cover.addColorStop(0.22, '#f8fafc');
      cover.addColorStop(0.5, '#9ca3af');
      cover.addColorStop(0.74, '#e5e7eb');
      cover.addColorStop(1, '#64748b');
      this.coverLayerCtx.fillStyle = cover;
      roundedRect(this.coverLayerCtx, 0, 0, this.coverLayer.width, this.coverLayer.height, 28);
      this.coverLayerCtx.fill();

      this.coverLayerCtx.textAlign = 'center';
      this.coverLayerCtx.fillStyle = '#ffffff';
      this.coverLayerCtx.font = '900 30px Arial';
      this.coverLayerCtx.fillText('GRATTA QUI', this.coverLayer.width / 2, this.coverLayer.height / 2 - 6);
      this.coverLayerCtx.font = '700 15px Arial';
      this.coverLayerCtx.fillText('Scopri se hai vinto il premio', this.coverLayer.width / 2, this.coverLayer.height / 2 + 25);
    }

    composeScratchCanvas() {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      this.ctx.drawImage(this.resultLayer, 0, 0);
      this.ctx.drawImage(this.coverLayer, 0, 0);
    }

    scratchAt(x, y) {
      this.coverLayerCtx.save();
      this.coverLayerCtx.globalCompositeOperation = 'destination-out';
      this.coverLayerCtx.beginPath();
      this.coverLayerCtx.arc(x, y, 24, 0, Math.PI * 2);
      this.coverLayerCtx.fill();
      this.coverLayerCtx.restore();
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
      this.drawResultLayer();
      this.coverLayerCtx.clearRect(0, 0, this.coverLayer.width, this.coverLayer.height);
      this.composeScratchCanvas();
      this.updateScratchProgress(100);
      this.context.onReveal();
    }

    destroy() {
      if (!this.canvas) return;
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
      this.rotation = 0;
    }

    start() {
      this.container.innerHTML = `
        <div class="wheel-shell">
          <canvas id="wheelCanvas" width="360" height="360"></canvas>
          <button id="spinWheelBtn" type="button" class="primary wheel-spin-btn">Gira la ruota</button>
        </div>
      `;
      this.canvas = this.container.querySelector('#wheelCanvas');
      this.ctx = this.canvas.getContext('2d');
      this.spinBtn = this.container.querySelector('#spinWheelBtn');
      this.segments = this.buildSegments();
      this.targetRotation = this.getTargetRotation();
      this.drawWheel(this.rotation);
      this.spinBtn.addEventListener('click', () => this.spin());
    }

    buildSegments() {
      const prizes = (this.context.campaignConfig?.prizes || []).slice(0, 4);
      const loseLabel = 'Riprova';
      const palette = ['#667eea', '#764ba2', '#22c55e', '#f59e0b', '#ef4444', '#06b6d4'];
      const segments = [{ label: loseLabel, kind: 'lose' }];
      prizes.forEach((prize) => {
        segments.push({
          label: `${prize.emoji || ''} ${prize.name}`.trim(),
          kind: 'win',
          prizeName: prize.name
        });
      });
      while (segments.length < 6) {
        segments.push({ label: loseLabel, kind: 'lose' });
      }
      return segments.slice(0, 6).map((segment, index) => ({
        ...segment,
        color: palette[index % palette.length]
      }));
    }

    getTargetRotation() {
      const { gameData } = this.context;
      const slice = (Math.PI * 2) / this.segments.length;
      let targetIndex = this.segments.findIndex((segment) => segment.kind === 'lose');
      if (gameData.won) {
        targetIndex = this.segments.findIndex((segment) => (
          segment.kind === 'win' && segment.prizeName === gameData.prize?.name
        ));
        if (targetIndex < 0) {
          targetIndex = this.segments.findIndex((segment) => segment.kind === 'win');
        }
      }
      if (targetIndex < 0) targetIndex = 0;
      const segmentCenter = targetIndex * slice + slice / 2;
      return Math.PI * 1.5 - segmentCenter;
    }

    drawWheel(rotation) {
      const ctx = this.ctx;
      const center = this.canvas.width / 2;
      const radius = center - 16;
      const slice = (Math.PI * 2) / this.segments.length;

      ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      ctx.save();
      ctx.translate(center, center);
      ctx.rotate(rotation);

      this.segments.forEach((segment, index) => {
        const start = index * slice;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.fillStyle = segment.color;
        ctx.arc(0, 0, radius, start, start + slice);
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 3;
        ctx.stroke();

        ctx.save();
        ctx.rotate(start + slice / 2);
        ctx.textAlign = 'center';
        ctx.fillStyle = '#ffffff';
        ctx.font = '700 13px Arial';
        ctx.fillText(segment.label.slice(0, 14), radius * 0.62, 5);
        ctx.restore();
      });

      ctx.restore();

      ctx.fillStyle = '#111827';
      ctx.beginPath();
      ctx.moveTo(center, 8);
      ctx.lineTo(center - 14, 34);
      ctx.lineTo(center + 14, 34);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(center, center, 34, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 4;
      ctx.stroke();
      ctx.fillStyle = '#667eea';
      ctx.font = '900 16px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('GIRA', center, center + 6);
    }

    spin() {
      if (this.spinning) return;
      this.spinning = true;
      this.spinBtn.disabled = true;
      this.spinBtn.textContent = 'La ruota gira...';

      const startRotation = this.rotation;
      const extraTurns = 6;
      const finalRotation = this.targetRotation + extraTurns * Math.PI * 2;
      const duration = 3200;
      const start = performance.now();

      const animate = (now) => {
        const progress = Math.min((now - start) / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        this.rotation = startRotation + (finalRotation - startRotation) * eased;
        this.drawWheel(this.rotation);
        if (progress < 1) {
          requestAnimationFrame(animate);
          return;
        }
        this.context.onReveal();
      };

      requestAnimationFrame(animate);
    }

    destroy() {
      this.container.innerHTML = '';
    }
  }

  class InstantRevealGame {
    constructor(container, context) {
      this.container = container;
      this.context = context;
      this.opened = false;
    }

    start() {
      const primary = this.context.campaignConfig?.store?.primaryColor || '#667eea';
      const secondary = this.context.campaignConfig?.store?.secondaryColor || '#764ba2';
      this.container.innerHTML = `
        <div class="gift-shell">
          <button id="giftBox" type="button" class="gift-box" style="--gift-primary:${primary};--gift-secondary:${secondary}">
            <span class="gift-lid">🎁</span>
            <span class="gift-body">Tocca per aprire</span>
          </button>
          <div id="giftResult" class="gift-result hidden"></div>
        </div>
      `;
      this.giftBox = this.container.querySelector('#giftBox');
      this.giftResult = this.container.querySelector('#giftResult');
      this.giftBox.addEventListener('click', () => this.openGift());
    }

    openGift() {
      if (this.opened) return;
      this.opened = true;
      this.giftBox.classList.add('opened');
      this.giftBox.disabled = true;

      const { gameData, campaignConfig } = this.context;
      const text = gameData.won
        ? `${gameData.prize.emoji || ''} ${gameData.prize.name}`.trim()
        : campaignConfig?.loseMessage || gameData.loseMessage;

      this.giftResult.innerHTML = `
        <p class="eyebrow">${gameData.won ? 'Hai vinto' : 'Esito giocata'}</p>
        <strong>${text}</strong>
      `;
      this.giftResult.classList.remove('hidden');

      setTimeout(() => this.context.onReveal(), 700);
    }

    destroy() {
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
