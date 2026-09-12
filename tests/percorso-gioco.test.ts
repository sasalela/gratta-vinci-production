import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildRevealPayload,
  executePlay,
  executeRedeem
} from '../lib/game-flow';
import { createMemoryGameDb, makeCampaign, makePrize } from './helpers/memory-db';

const FIXED_NOW = new Date('2026-06-23T12:00:00.000Z');

function playBase(db: ReturnType<typeof createMemoryGameDb>, campaign = makeCampaign(), extra: Record<string, unknown> = {}) {
  return executePlay({
    db,
    campaign,
    email: 'giocatore@test.it',
    clientIp: '1.2.3.4',
    deviceKey: 'device-a',
    customerData: { name: 'Test', email: 'giocatore@test.it' },
    now: FIXED_NOW,
    signRevealToken: (id) => `reveal-token-for-${id}`,
    generateCode: () => 'TESTCODE-FIXED1',
    ...extra
  });
}

describe('percorso gioco', () => {
  it('1. giocata vincente: partecipazione, voucher, scadenza coerente', async () => {
    const prize = makePrize({ winProbability: 100, remainingQuantity: 5 });
    const campaign = makeCampaign({ voucherValidityDays: 15 });
    const db = createMemoryGameDb({ prizes: [prize] });

    const result = await playBase(db, campaign, { rng: () => 0.01 });

    assert.equal(result.kind, 'ok');
    if (result.kind !== 'ok') return;

    assert.equal(result.participation.outcome, 'won');
    assert.ok(result.participation.voucher, 'voucher emesso');
    assert.equal(result.participation.voucher!.code, 'TESTCODE-FIXED1');
    const expectedExpiry = new Date(
      FIXED_NOW.getTime() + 15 * 24 * 60 * 60 * 1000
    ).toISOString();
    assert.equal(result.participation.voucher!.expiresAt.toISOString(), expectedExpiry);
    assert.equal(db._state.prizes[0].remainingQuantity, 4);
    assert.equal(db._state.participations.length, 1);
    assert.equal(db._state.vouchers.length, 1);
  });

  it('2. giocata perdente: nessun voucher, messaggio di non vincita al reveal', async () => {
    const prize = makePrize({ winProbability: 10, remainingQuantity: 5 });
    const campaign = makeCampaign({
      loseMessage: 'Nessun premio questa volta.'
    });
    const db = createMemoryGameDb({ prizes: [prize] });

    const result = await playBase(db, campaign, { rng: () => 0.99 });

    assert.equal(result.kind, 'ok');
    if (result.kind !== 'ok') return;

    assert.equal(result.participation.outcome, 'lost');
    assert.equal(result.participation.voucher, null);
    assert.equal(db._state.vouchers.length, 0);
    assert.equal(db._state.prizes[0].remainingQuantity, 5);

    const reveal = buildRevealPayload({
      ...result.participation,
      campaign: { loseMessage: campaign.loseMessage }
    });
    assert.equal(reveal.won, false);
    assert.equal(reveal.voucherCode, null);
    assert.equal(reveal.prize, null);
    assert.equal(reveal.loseMessage, 'Nessun premio questa volta.');
  });

  it('3. limite partecipazione: seconda giocata stessa sessione rifiutata', async () => {
    const prize = makePrize({ winProbability: 100 });
    const campaign = makeCampaign();
    const db = createMemoryGameDb({ prizes: [prize] });

    const first = await playBase(db, campaign, { rng: () => 0.01 });
    assert.equal(first.kind, 'ok');

    const second = await playBase(db, campaign, { rng: () => 0.01 });
    assert.equal(second.kind, 'duplicate');
    assert.equal(db._state.participations.length, 1);
  });

  it('4. premio esaurito: remaining a zero → nessun voucher, nessuno scalo sotto zero', async () => {
    const prize = makePrize({ winProbability: 100, remainingQuantity: 0, totalQuantity: 10 });
    const campaign = makeCampaign({ guaranteedWin: true });
    const db = createMemoryGameDb({ prizes: [prize] });

    const result = await playBase(db, campaign, { rng: () => 0.01 });

    assert.equal(result.kind, 'prizes_exhausted');
    assert.equal(db._state.vouchers.length, 0);
    assert.equal(db._state.participations.length, 0);
    assert.equal(db._state.prizes[0].remainingQuantity, 0);
  });

  it('5. vincita garantita: esito sempre un premio disponibile', async () => {
    const prizeA = makePrize({
      id: 'prize_a',
      name: 'Premio A',
      winProbability: 1,
      remainingQuantity: 2
    });
    const prizeB = makePrize({
      id: 'prize_b',
      name: 'Premio B',
      winProbability: 1,
      remainingQuantity: 2,
      createdAt: new Date('2024-01-02T00:00:00.000Z')
    });
    const campaign = makeCampaign({ guaranteedWin: true });
    const availableIds = new Set(['prize_a', 'prize_b']);

    for (const rngValue of [0.01, 0.49, 0.99]) {
      const db = createMemoryGameDb({
        prizes: [
          { ...prizeA, remainingQuantity: 2 },
          { ...prizeB, remainingQuantity: 2 }
        ]
      });
      const result = await playBase(db, campaign, { rng: () => rngValue });
      assert.equal(result.kind, 'ok', `rng=${rngValue}`);
      if (result.kind !== 'ok') continue;
      assert.equal(result.participation.outcome, 'won');
      assert.ok(result.claimedPrize);
      assert.ok(availableIds.has(result.claimedPrize!.id));
      assert.ok(result.participation.voucher);
    }
  });

  it('6. riscatto: primo ok, secondo dello stesso codice rifiutato', async () => {
    const expiresAt = new Date(FIXED_NOW.getTime() + 7 * 24 * 60 * 60 * 1000);
    const db = createMemoryGameDb({
      vouchers: [
        {
          id: 'voucher_1',
          code: 'REDEEM-ME-01',
          campaignId: 'camp_1',
          storeId: 'store_1',
          email: 'giocatore@test.it',
          prize: {
            id: 'prize_1',
            name: 'Birra Gratis',
            emoji: '🍺',
            description: 'Una birra omaggio'
          },
          redeemed: false,
          redeemedAt: null,
          redeemedByUserId: null,
          expiresAt,
          participationId: 'part_x'
        }
      ]
    });

    const first = await executeRedeem({
      db,
      code: 'REDEEM-ME-01',
      storeId: 'store_1',
      userId: 'user_staff',
      now: FIXED_NOW
    });
    assert.equal(first.kind, 'ok');
    if (first.kind === 'ok') {
      assert.equal(first.voucher.redeemed, true);
    }

    const second = await executeRedeem({
      db,
      code: 'REDEEM-ME-01',
      storeId: 'store_1',
      userId: 'user_staff',
      now: FIXED_NOW
    });
    assert.equal(second.kind, 'already_redeemed');
  });

  it('7. due-fasi: play NON contiene premio né codice voucher', async () => {
    const prize = makePrize({ winProbability: 100 });
    const db = createMemoryGameDb({ prizes: [prize] });
    const result = await playBase(db, makeCampaign(), { rng: () => 0.01 });

    assert.equal(result.kind, 'ok');
    if (result.kind !== 'ok') return;

    const keys = Object.keys(result.responseData).sort();
    assert.deepEqual(keys, ['revealToken', 'sessionId']);
    assert.equal('prize' in result.responseData, false);
    assert.equal('voucherCode' in result.responseData, false);
    assert.equal('won' in result.responseData, false);
    const serialized = JSON.stringify(result.responseData);
    assert.equal(serialized.includes('TESTCODE'), false);
    assert.equal(serialized.includes('Birra'), false);
  });

  it('8. campagna fuori periodo: giocata rifiutata', async () => {
    const prize = makePrize({ winProbability: 100 });
    const db = createMemoryGameDb({ prizes: [prize] });
    const expired = makeCampaign({
      startDate: new Date('2020-01-01T00:00:00.000Z'),
      endDate: new Date('2020-12-31T00:00:00.000Z')
    });

    const result = await playBase(db, expired, { rng: () => 0.01 });
    assert.equal(result.kind, 'campaign_not_active');
    assert.equal(db._state.participations.length, 0);
  });

  it('8b. campagna non trovata (non attiva / assente): rifiutata', async () => {
    const db = createMemoryGameDb({ prizes: [makePrize()] });
    const result = await playBase(db, null as any, { rng: () => 0.01 });
    assert.equal(result.kind, 'campaign_not_found');
  });
});
