/**
 * Logica visiva della ruota (spicchi e angolo di arresto).
 * Non decide il premio: legge solo la risposta di reveal e la geometria degli spicchi.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.WheelVisual = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const WHEEL_SEGMENT_COUNT = 8;
  const POINTER_ANGLE = Math.PI * 1.5;
  const TWO_PI = Math.PI * 2;
  const INNER_EDGE = 0.08;

  function normalizeAngle(value) {
    return ((value % TWO_PI) + TWO_PI) % TWO_PI;
  }

  function pointerLocalAngle(rotation) {
    return normalizeAngle(POINTER_ANGLE - rotation);
  }

  function segmentIndexAtPointer(rotation, segmentCount) {
    if (!segmentCount) return -1;
    const slice = TWO_PI / segmentCount;
    const local = pointerLocalAngle(rotation);
    const index = Math.floor(local / slice);
    return ((index % segmentCount) + segmentCount) % segmentCount;
  }

  function isPointerStrictlyInsideSegment(rotation, segmentIndex, segmentCount) {
    if (!segmentCount || segmentIndex < 0 || segmentIndex >= segmentCount) return false;
    const slice = TWO_PI / segmentCount;
    const local = pointerLocalAngle(rotation);
    const start = segmentIndex * slice;
    const end = start + slice;
    const eps = 1e-10;
    return local > start + eps && local < end - eps;
  }

  function listAvailablePrizes(prizes) {
    const seen = new Set();
    const list = [];
    for (const prize of prizes || []) {
      if (prize.available === false) continue;
      if (!prize.id || seen.has(prize.id)) continue;
      seen.add(prize.id);
      list.push(prize);
    }
    return list;
  }

  function formatLabel(entity) {
    if (entity.kind === 'lose') return 'Riprova';
    const name = String(entity.prizeName || '').trim();
    const emoji = String(entity.emoji || '').trim();
    if (emoji && name) return `${emoji} ${name}`;
    return emoji || name || '';
  }

  function channelToLinear(channel) {
    const c = channel / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }

  function relativeLuminance(hex) {
    const raw = String(hex || '').replace('#', '').trim();
    const full = raw.length === 3
      ? raw.split('').map((ch) => ch + ch).join('')
      : raw;
    if (!/^[0-9a-fA-F]{6}$/.test(full)) return 0;
    const r = channelToLinear(parseInt(full.slice(0, 2), 16));
    const g = channelToLinear(parseInt(full.slice(2, 4), 16));
    const b = channelToLinear(parseInt(full.slice(4, 6), 16));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }

  function contrastRatio(hexA, hexB) {
    const l1 = relativeLuminance(hexA);
    const l2 = relativeLuminance(hexB);
    const lighter = Math.max(l1, l2);
    const darker = Math.min(l1, l2);
    return (lighter + 0.05) / (darker + 0.05);
  }

  /** Testo scuro su fondi chiari, chiaro su scuri — contrasto WCAG ≥ 4.5:1. */
  function contrastingTextColor(backgroundHex) {
    const dark = '#111827';
    const light = '#ffffff';
    const darkRatio = contrastRatio(dark, backgroundHex);
    const lightRatio = contrastRatio(light, backgroundHex);
    if (lightRatio >= darkRatio && lightRatio >= 4.5) {
      return { color: light, ratio: lightRatio };
    }
    if (darkRatio >= 4.5) {
      return { color: dark, ratio: darkRatio };
    }
    return lightRatio >= darkRatio
      ? { color: light, ratio: lightRatio }
      : { color: dark, ratio: darkRatio };
  }

  function wrapWheelLabelLines(ctx, label, maxWidth, maxLines) {
    const text = String(label || '').trim();
    if (!text) return [''];
    const words = text.split(/\s+/).filter(Boolean);
    const lines = [];
    let current = '';

    const flushLongWord = (word) => {
      let chunk = '';
      for (const ch of Array.from(word)) {
        const next = chunk + ch;
        if (chunk && ctx.measureText(next).width > maxWidth) {
          lines.push(chunk);
          chunk = ch;
          if (lines.length >= maxLines) return true;
        } else {
          chunk = next;
        }
      }
      if (chunk) {
        if (lines.length >= maxLines) return true;
        lines.push(chunk);
      }
      return lines.length >= maxLines;
    };

    for (const word of words) {
      if (lines.length >= maxLines) break;
      const test = current ? `${current} ${word}` : word;
      if (ctx.measureText(test).width <= maxWidth) {
        current = test;
        continue;
      }
      if (current) {
        lines.push(current);
        current = '';
        if (lines.length >= maxLines) break;
      }
      if (ctx.measureText(word).width <= maxWidth) {
        current = word;
      } else if (flushLongWord(word)) {
        current = '';
        break;
      }
    }
    if (current && lines.length < maxLines) lines.push(current);
    return lines.length ? lines.slice(0, maxLines) : [''];
  }

  function ellipsizeWheelLine(ctx, text, maxWidth) {
    const full = String(text || '');
    if (ctx.measureText(full).width <= maxWidth) return full;
    const chars = Array.from(full);
    for (let len = chars.length - 1; len >= 1; len -= 1) {
      const candidate = `${chars.slice(0, len).join('').trimEnd()}…`;
      if (ctx.measureText(candidate).width <= maxWidth) return candidate;
    }
    return '…';
  }

  function linesCoverLabel(label, lines) {
    const source = String(label || '').replace(/\s+/g, ' ').trim();
    const joined = lines.join(' ').replace(/\s+/g, ' ').trim();
    return joined === source;
  }

  function linesFitWidth(ctx, lines, maxWidth) {
    return lines.every((line) => ctx.measureText(line).width <= maxWidth + 0.5);
  }

  /**
   * Una riga se ci sta; altrimenti due; poi riduce il font fino al minimo;
   * solo in ultima istanza tronca con "…".
   */
  function fitWheelSegmentLabel(ctx, label, maxWidth, maxHeight, baseSize, minSize) {
    const fontFamily = 'Arial, Helvetica, sans-serif';
    const source = String(label || '').trim();

    for (let fontSize = baseSize; fontSize >= minSize - 0.001; fontSize -= 0.5) {
      ctx.font = `700 ${fontSize}px ${fontFamily}`;
      const lineHeight = fontSize * 1.12;

      if (lineHeight <= maxHeight && ctx.measureText(source).width <= maxWidth) {
        return { lines: [source], fontSize, truncated: false };
      }

      if (lineHeight * 2 <= maxHeight + 0.01) {
        const two = wrapWheelLabelLines(ctx, source, maxWidth, 2);
        if (linesCoverLabel(source, two) && linesFitWidth(ctx, two, maxWidth)) {
          return { lines: two, fontSize, truncated: false };
        }
      }
    }

    const fontSize = minSize;
    ctx.font = `700 ${fontSize}px ${fontFamily}`;
    const lineHeight = fontSize * 1.12;

    if (lineHeight * 2 <= maxHeight + 0.01) {
      const two = wrapWheelLabelLines(ctx, source, maxWidth, 2);
      if (linesCoverLabel(source, two) && linesFitWidth(ctx, two, maxWidth)) {
        return { lines: two, fontSize, truncated: false };
      }
      if (!linesCoverLabel(source, two)) {
        return {
          lines: [ellipsizeWheelLine(ctx, source, maxWidth)],
          fontSize,
          truncated: true
        };
      }
      const trimmed = two.map((line) => ellipsizeWheelLine(ctx, line, maxWidth));
      return {
        lines: trimmed,
        fontSize,
        truncated: trimmed.some((line, i) => line !== two[i])
      };
    }

    return {
      lines: [ellipsizeWheelLine(ctx, source, maxWidth)],
      fontSize,
      truncated: true
    };
  }

  /** Minimo carattere canvas per avere ≥12px CSS a una data larghezza di visualizzazione. */
  function wheelLabelMinFont(canvasCssWidth, canvasInternalWidth) {
    const css = Math.max(1, Number(canvasCssWidth) || 280);
    const internal = Math.max(1, Number(canvasInternalWidth) || 320);
    return 12 * (internal / css);
  }

  function segmentLabelMetrics(radius, segmentCount, baseFont) {
    const slice = (Math.PI * 2) / Math.max(1, segmentCount);
    const innerR = Math.max(38, radius * 0.28);
    const outerR = radius - 8;
    const maxWidth = Math.max(24, outerR - innerR);
    const textR = (innerR + outerR) / 2;
    const maxHeight = Math.max(baseFont, 2 * textR * Math.sin(slice / 2) * 0.78);
    return { slice, innerR, outerR, maxWidth, textR, maxHeight };
  }

  function largestRemainderCounts(weights, total) {
    const sum = weights.reduce((acc, weight) => acc + weight, 0);
    const safe = sum > 0 ? weights : weights.map(() => 1);
    const safeSum = safe.reduce((acc, weight) => acc + weight, 0);
    const quotas = safe.map((weight) => (weight / safeSum) * total);
    const counts = quotas.map((quota) => Math.floor(quota));
    let leftover = total - counts.reduce((acc, count) => acc + count, 0);
    const order = quotas
      .map((quota, index) => ({ index, rem: quota - Math.floor(quota) }))
      .sort((a, b) => b.rem - a.rem || a.index - b.index);
    for (let i = 0; i < leftover; i += 1) {
      counts[order[i].index] += 1;
    }
    return counts;
  }

  function enforceMins(counts, mins) {
    const next = counts.slice();
    let need = 0;
    for (let i = 0; i < next.length; i += 1) {
      if (next[i] < mins[i]) {
        need += mins[i] - next[i];
        next[i] = mins[i];
      }
    }
    while (need > 0) {
      let best = -1;
      let bestSurplus = 0;
      for (let i = 0; i < next.length; i += 1) {
        const surplus = next[i] - mins[i];
        if (surplus > bestSurplus) {
          bestSurplus = surplus;
          best = i;
        }
      }
      if (best < 0) break;
      next[best] -= 1;
      need -= 1;
    }
    return next;
  }

  function entityKey(entity) {
    return entity.kind === 'lose' ? '__lose__' : String(entity.prizeId);
  }

  function arrangeAlternating(entities, counts) {
    const remaining = entities.map((entity, index) => ({
      ...entity,
      left: counts[index]
    }));
    const total = counts.reduce((acc, count) => acc + count, 0);
    const result = [];

    while (result.length < total) {
      const lastKey = result.length ? entityKey(result[result.length - 1]) : null;
      const notLast = remaining.filter((item) => item.left > 0 && entityKey(item) !== lastKey);
      const pool = notLast.length ? notLast : remaining.filter((item) => item.left > 0);
      pool.sort((a, b) => b.left - a.left || entityKey(a).localeCompare(entityKey(b)));
      const pick = pool[0];
      pick.left -= 1;
      result.push({
        kind: pick.kind,
        prizeId: pick.prizeId,
        prizeName: pick.prizeName,
        emoji: pick.emoji,
        label: formatLabel(pick)
      });
    }

    return result;
  }

  /**
   * Spicchi tutti uguali, totale fisso 8.
   * Quote con resto più grande (Hamilton) sulla probabilità, poi minimo 1 a testa.
   * Senza vincita garantita: "Riprova" prende il resto sotto 100% e ha sempre almeno 1 spicchio.
   * Se i premi disponibili sono più di 8 non si esclude nessuno: ok=false.
   */
  function buildWheelSegments(prizes, options) {
    const guaranteedWin = Boolean(options && options.guaranteedWin);
    const available = listAvailablePrizes(prizes);

    if (!available.length) {
      return { ok: false, reason: 'no_prizes', segments: [] };
    }
    if (available.length > WHEEL_SEGMENT_COUNT) {
      return {
        ok: false,
        reason: 'too_many_prizes',
        count: available.length,
        segments: []
      };
    }

    const sumProbability = available.reduce(
      (acc, prize) => acc + Number(prize.winProbability || 0),
      0
    );
    const entities = available.map((prize) => ({
      kind: 'win',
      prizeId: prize.id,
      prizeName: prize.name,
      emoji: prize.emoji,
      probability: Math.max(0, Number(prize.winProbability || 0))
    }));

    if (!guaranteedWin) {
      entities.push({
        kind: 'lose',
        prizeId: null,
        prizeName: 'Riprova',
        emoji: '',
        probability: Math.max(0, 100 - sumProbability)
      });
    }

    const weights = entities.map((entity) => entity.probability);
    let counts = largestRemainderCounts(weights, WHEEL_SEGMENT_COUNT);
    counts = enforceMins(counts, entities.map(() => 1));
    const segments = arrangeAlternating(entities, counts);

    return {
      ok: true,
      reason: null,
      segments,
      counts: entities.map((entity, index) => ({
        prizeId: entity.prizeId,
        kind: entity.kind,
        count: counts[index]
      }))
    };
  }

  function matchingSegmentIndices(segments, reveal) {
    const prizeId = reveal && reveal.prize && reveal.prize.id ? reveal.prize.id : null;
    const won = Boolean(reveal && reveal.won && prizeId);
    const indices = [];
    segments.forEach((segment, index) => {
      if (won) {
        if (segment.prizeId === prizeId) indices.push(index);
        return;
      }
      if (segment.kind === 'lose' || !segment.prizeId) indices.push(index);
    });
    return { indices, prizeId: won ? prizeId : null, won };
  }

  /**
   * Angolo di rotazione canvas tale che il puntatore (in alto) cada DENTRO uno spicchio
   * del premio di reveal. Math.random (rng) sceglie quale spicchio se ripetuto e il punto
   * interno, mai quale premio.
   * Se il premio non ha spicchi: ok=false, targetAngle=null.
   */
  function computeStopAngleFromReveal(segments, reveal, rng) {
    const random = typeof rng === 'function' ? rng : Math.random;
    if (!Array.isArray(segments) || segments.length === 0) {
      return { ok: false, reason: 'no_segments', targetAngle: null, prizeId: null, segmentPrizeIds: [] };
    }

    const { indices, prizeId } = matchingSegmentIndices(segments, reveal);
    const segmentPrizeIds = segments.map((segment) => segment.prizeId ?? null);

    if (!indices.length) {
      return {
        ok: false,
        reason: 'prize_not_on_wheel',
        targetAngle: null,
        prizeId,
        segmentPrizeIds
      };
    }

    const pick = indices[Math.floor(random() * indices.length) % indices.length];
    const slice = TWO_PI / segments.length;
    const edge = slice * INNER_EDGE;
    const span = Math.max(slice - 2 * edge, slice * 0.5);
    const offset = edge + random() * span;
    const alpha = pick * slice + offset;
    const targetAngle = POINTER_ANGLE - alpha;

    return {
      ok: true,
      reason: null,
      targetAngle,
      segmentIndex: pick,
      prizeId,
      segmentPrizeIds
    };
  }

  function unmatchedBoundaryAngle(segmentCount, rng) {
    const random = typeof rng === 'function' ? rng : Math.random;
    const n = Math.max(1, segmentCount);
    const slice = TWO_PI / n;
    const index = Math.floor(random() * n) % n;
    return POINTER_ANGLE - index * slice;
  }

  return {
    WHEEL_SEGMENT_COUNT,
    POINTER_ANGLE,
    buildWheelSegments,
    computeStopAngleFromReveal,
    unmatchedBoundaryAngle,
    pointerLocalAngle,
    segmentIndexAtPointer,
    isPointerStrictlyInsideSegment,
    formatLabel,
    contrastRatio,
    contrastingTextColor,
    fitWheelSegmentLabel,
    wheelLabelMinFont,
    segmentLabelMetrics
  };
});
