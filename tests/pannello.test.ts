import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const StoreLogic = require(join(root, 'store-logic.js'));
const ContentLogic = require(join(root, 'content-logic.js'));

const demoCampaign = {
  name: 'Non usare come titolo',
  guaranteedWin: false,
  endDate: '2026-12-31',
  prizeItems: [
    { name: 'Birra 50cl', emoji: '🍺', active: true, totalQuantity: 20, winProbability: 5 },
    { name: 'Caffè', emoji: '☕', active: true, totalQuantity: 100, winProbability: 40 },
    { name: 'Spento', emoji: '❌', active: false, totalQuantity: 10, winProbability: 1 }
  ]
};

const demoGuaranteed = {
  ...demoCampaign,
  guaranteedWin: true
};

describe('pannello — premio principale', () => {
  it('sceglie il premio attivo con probabilità più bassa', () => {
    const main = ContentLogic.getMainPrize(demoCampaign);
    assert.equal(main?.name, 'Birra 50cl');
  });

  it('rosso: premio disattivo o probabilità 0 non vince', () => {
    const bad = ContentLogic.getMainPrize({
      prizeItems: [
        { name: 'Zero', active: true, totalQuantity: 10, winProbability: 0 },
        { name: 'Off', active: false, totalQuantity: 10, winProbability: 1 }
      ]
    });
    assert.equal(bad, null);
  });
});

describe('pannello — frase anteprima passo 1', () => {
  it('vincita non garantita: frase con circa N vincono', () => {
    const phrase = StoreLogic.buildPrizePreviewPhrase(
      [
        { name: 'Birra', winProbability: 20, active: true },
        { name: 'Caffè', winProbability: 10, active: true }
      ],
      false,
      'Niente oggi'
    );
    assert.equal(phrase.ok, true);
    assert.equal(phrase.error, false);
    assert.match(phrase.text, /30/);
    assert.match(phrase.text, /Birra|Caffè/);
  });

  it('vincita garantita: ogni giocatore vince qualcosa', () => {
    const phrase = StoreLogic.buildPrizePreviewPhrase(
      [
        { name: 'Birra', winProbability: 20, active: true },
        { name: 'Caffè', winProbability: 80, active: true }
      ],
      true
    );
    assert.equal(phrase.ok, true);
    assert.match(phrase.text, /Ogni giocatore vince/);
  });

  it('rosso: somma > 100 senza vincita garantita', () => {
    const phrase = StoreLogic.buildPrizePreviewPhrase(
      [
        { name: 'A', winProbability: 60, active: true },
        { name: 'B', winProbability: 50, active: true }
      ],
      false
    );
    assert.equal(phrase.ok, false);
    assert.equal(phrase.error, true);
    assert.match(phrase.text, /100/);
    assert.equal(StoreLogic.canProceedStep1(
      [{ name: 'A', winProbability: 60, active: true }, { name: 'B', winProbability: 50, active: true }],
      false
    ), false);
  });

  it('somma > 100 con vincita garantita: ok', () => {
    assert.equal(StoreLogic.canProceedStep1(
      [{ name: 'A', winProbability: 60, active: true }, { name: 'B', winProbability: 50, active: true }],
      true
    ), true);
  });
});

describe('pannello — date default +30', () => {
  it('fine = inizio + 30 giorni e mai uguale', () => {
    const now = new Date('2026-09-15T12:00:00');
    const dates = StoreLogic.getDefaultCampaignDates(now);
    assert.equal(dates.startDate, '2026-09-15');
    assert.equal(dates.endDate, '2026-10-15');
    assert.notEqual(dates.startDate, dates.endDate);
  });

  it('rosso: ensureEndAfterStart corregge fine <= inizio', () => {
    const fixed = StoreLogic.ensureEndAfterStart('2026-09-15', '2026-09-15');
    assert.ok(fixed.endDate > fixed.startDate);
  });

  it('nome default Promo <mese>', () => {
    assert.equal(StoreLogic.defaultPromoName(new Date('2026-09-15')), 'Promo Settembre');
  });
});

describe('materiali — quattro elementi ogni formato', () => {
  const store = { name: 'Bar Demo' };
  const formats = ['a4', 'facebook', 'square', 'led_h', 'led_v', 'led_sq', 'led_43', '16x9', '4x3', 'lcd_v'];

  it('Demo non garantita: VINCI + premio principale, mai nome campagna', () => {
    const els = ContentLogic.materialFourElements(demoCampaign, store, {
      headline: 'Vinci Birra 50cl',
      subtitle: 'Inquadra il codice e scopri subito se hai vinto',
      cta: 'Gioca ora',
      expiresText: 'Valido fino al 31/12/2026'
    });
    ContentLogic.assertMaterialFourElements(els);
    assert.match(els.vinci, /VINCI/);
    assert.match(els.vinci, /Birra/);
    assert.doesNotMatch(els.vinci, /Non usare come titolo/);
    assert.equal(els.qr, 'Inquadra e gioca');
    assert.match(els.brand, /Bar Demo/);
  });

  it('Demo garantita: VINCI SEMPRE + lista', () => {
    const heading = ContentLogic.getVinciHeading(demoGuaranteed);
    assert.equal(heading.title, 'VINCI SEMPRE');
    assert.match(heading.prizeLine, /Birra|Caffè/);
  });

  it('defaults Titolo/Sottotitolo/Invito', () => {
    const d = ContentLogic.getMaterialDefaults(demoCampaign);
    assert.equal(d.headline, 'Vinci Birra 50cl');
    assert.equal(d.subtitle, 'Inquadra il codice e scopri subito se hai vinto');
    assert.equal(d.cta, 'Gioca ora');
  });

  it('ogni formato espone i quattro elementi (lista)', () => {
    for (const format of formats) {
      const list = ContentLogic.listFormatElements(format, {}, demoCampaign);
      assert.equal(list.length, 4, format);
    }
  });

  it('rosso: assert fallisce senza brand', () => {
    assert.throws(() => ContentLogic.assertMaterialFourElements({
      brand: '',
      vinci: 'VINCI x',
      qr: 'Inquadra e gioca',
      validity: 'Valido'
    }));
  });

  it('LED 4:3 presente in FORMAT_SIZES', () => {
    assert.equal(ContentLogic.FORMAT_SIZES?.led_43?.width, 1024);
    assert.equal(ContentLogic.FORMAT_SIZES?.led_43?.height, 768);
  });

  it('nessun Potresti aver vinto nel sorgente materiali', () => {
    const src = readFileSync(join(root, 'content.js'), 'utf8');
    assert.equal(src.includes('POTRESTI AVER VINTO'), false);
  });
});
