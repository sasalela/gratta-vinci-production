import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { describe, it } from 'node:test';

const require = createRequire(import.meta.url);
const wheel = require('../wheel-visual.js') as {
  WHEEL_SEGMENT_COUNT: number;
  buildWheelSegments: (
    prizes: Array<Record<string, unknown>>,
    options?: { guaranteedWin?: boolean }
  ) => {
    ok: boolean;
    reason: string | null;
    segments: Array<{ kind: string; prizeId: string | null; label: string }>;
    counts?: Array<{ prizeId: string | null; kind: string; count: number }>;
  };
  computeStopAngleFromReveal: (
    segments: Array<{ kind: string; prizeId?: string | null }>,
    reveal: { won?: boolean; prize?: { id?: string } | null },
    rng?: () => number
  ) => {
    ok: boolean;
    reason: string | null;
    targetAngle: number | null;
    segmentIndex?: number;
    prizeId: string | null;
    segmentPrizeIds: Array<string | null>;
  };
  segmentIndexAtPointer: (rotation: number, segmentCount: number) => number;
  isPointerStrictlyInsideSegment: (
    rotation: number,
    segmentIndex: number,
    segmentCount: number
  ) => boolean;
};

const DEMO_PRIZES = [
  { id: 'rare', name: 'Gran premio', emoji: '🎁', winProbability: 5, available: true },
  { id: 'mid', name: 'Sconto 20%', emoji: '🏷️', winProbability: 20, available: true },
  { id: 'common', name: 'Sconto 5%', emoji: '💸', winProbability: 75, available: true }
];

function countByPrize(segments: Array<{ prizeId: string | null; kind: string }>) {
  const map = new Map<string, number>();
  for (const segment of segments) {
    const key = segment.kind === 'lose' ? '__lose__' : String(segment.prizeId);
    map.set(key, (map.get(key) || 0) + 1);
  }
  return map;
}

function adjacentCount(
  segments: Array<{ prizeId: string | null; kind: string }>,
  prizeId: string | null
) {
  const n = segments.length;
  let count = 0;
  for (let i = 0; i < n; i += 1) {
    const a = segments[i];
    const b = segments[(i + 1) % n];
    const aId = a.kind === 'lose' ? null : a.prizeId;
    const bId = b.kind === 'lose' ? null : b.prizeId;
    if (aId === prizeId && bId === prizeId) count += 1;
  }
  return count;
}

function fixedRng(values: number[]) {
  let i = 0;
  return () => values[i++ % values.length];
}

describe('ruota visiva', () => {
  it('angolo finale cade nello spicchio del premio (1 spicchio, più spicchi, nessun premio)', () => {
    const built = wheel.buildWheelSegments(DEMO_PRIZES, { guaranteedWin: true });
    assert.equal(built.ok, true);
    const segments = built.segments;

    const samples = [0.01, 0.2, 0.49, 0.7, 0.99];
    for (const a of samples) {
      for (const b of samples) {
        const rng = fixedRng([a, b]);

        const oneSlice = wheel.computeStopAngleFromReveal(
          segments,
          { won: true, prize: { id: 'rare' } },
          rng
        );
        assert.equal(oneSlice.ok, true);
        assert.ok(oneSlice.targetAngle != null);
        const rareIndex = segments.findIndex((segment) => segment.prizeId === 'rare');
        assert.equal(
          wheel.segmentIndexAtPointer(oneSlice.targetAngle as number, segments.length),
          rareIndex
        );
        assert.equal(
          wheel.isPointerStrictlyInsideSegment(
            oneSlice.targetAngle as number,
            rareIndex,
            segments.length
          ),
          true
        );

        const many = wheel.computeStopAngleFromReveal(
          segments,
          { won: true, prize: { id: 'common' } },
          rng
        );
        assert.equal(many.ok, true);
        const landed = wheel.segmentIndexAtPointer(many.targetAngle as number, segments.length);
        assert.equal(segments[landed].prizeId, 'common');
        assert.equal(
          wheel.isPointerStrictlyInsideSegment(many.targetAngle as number, landed, segments.length),
          true
        );
      }
    }

    const loseSegments = wheel.buildWheelSegments(
      [{ id: 'solo', name: 'Premio', winProbability: 10, available: true }],
      { guaranteedWin: false }
    ).segments;
    const lose = wheel.computeStopAngleFromReveal(
      loseSegments,
      { won: false, prize: null },
      () => 0.33
    );
    assert.equal(lose.ok, true);
    const loseIndex = wheel.segmentIndexAtPointer(lose.targetAngle as number, loseSegments.length);
    assert.equal(loseSegments[loseIndex].kind, 'lose');
    assert.equal(
      wheel.isPointerStrictlyInsideSegment(
        lose.targetAngle as number,
        loseIndex,
        loseSegments.length
      ),
      true
    );
  });

  it('premio assente dagli spicchi: nessun angolo, non uno spicchio altrui', () => {
    const built = wheel.buildWheelSegments(DEMO_PRIZES, { guaranteedWin: true });
    const result = wheel.computeStopAngleFromReveal(
      built.segments,
      { won: true, prize: { id: 'inesistente' } },
      () => 0.5
    );
    assert.equal(result.ok, false);
    assert.equal(result.targetAngle, null);
    assert.equal(result.reason, 'prize_not_on_wheel');
    assert.equal(result.prizeId, 'inesistente');
    assert.ok(result.segmentPrizeIds.includes('rare'));
    assert.equal(result.segmentPrizeIds.includes('inesistente'), false);
  });

  it('75/20/5 vincita garantita: 8 spicchi 5/2/1 Hamilton+min1, ogni premio ≥1, non adiacenti se possibile', () => {
    const built = wheel.buildWheelSegments(DEMO_PRIZES, { guaranteedWin: true });
    assert.equal(built.ok, true);
    assert.equal(built.segments.length, wheel.WHEEL_SEGMENT_COUNT);

    const counts = countByPrize(built.segments);
    // Hamilton su 8: 6 / 1.6 / 0.4 → 6,2,0 poi minimo 1: si toglie 1 al 75% → 5,2,1
    assert.equal(counts.get('common'), 5);
    assert.equal(counts.get('mid'), 2);
    assert.equal(counts.get('rare'), 1);
    assert.equal(built.segments.every((segment) => segment.kind === 'win'), true);

    assert.equal(adjacentCount(built.segments, 'mid'), 0);
    assert.equal(adjacentCount(built.segments, 'rare'), 0);
    // 5 copie su 8 (ruota circolare) forzano almeno una coppia adiacente del 75%
    assert.ok(adjacentCount(built.segments, 'common') >= 1);
  });

  it('1 premio al 10% senza vincita garantita: 1 spicchio premio + 7 Riprova', () => {
    const built = wheel.buildWheelSegments(
      [{ id: 'p10', name: 'Premio', winProbability: 10, available: true }],
      { guaranteedWin: false }
    );
    assert.equal(built.ok, true);
    assert.equal(built.segments.length, 8);
    const counts = countByPrize(built.segments);
    assert.equal(counts.get('p10'), 1);
    assert.equal(counts.get('__lose__'), 7);
  });

  it('più di 8 premi disponibili: blocco, nessun escluso', () => {
    const prizes = Array.from({ length: 9 }, (_, index) => ({
      id: `p${index}`,
      name: `Premio ${index}`,
      winProbability: 10,
      available: true
    }));
    const built = wheel.buildWheelSegments(prizes, { guaranteedWin: true });
    assert.equal(built.ok, false);
    assert.equal(built.reason, 'too_many_prizes');
    assert.equal(built.segments.length, 0);
  });
});
