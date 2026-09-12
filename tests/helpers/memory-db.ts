/**
 * Prisma in-memoria per il percorso di gioco. Nessuna connessione di rete.
 */
import type {
  GameCampaignRow,
  GameParticipationRow,
  GamePrisma,
  GamePrizeRow,
  GameVoucherRow
} from '../lib/game-flow';

function matchesWhere(row: Record<string, any>, where: Record<string, any> | undefined): boolean {
  if (!where) return true;
  for (const [key, expected] of Object.entries(where)) {
    if (expected && typeof expected === 'object' && !Array.isArray(expected) && !(expected instanceof Date)) {
      if ('gt' in expected) {
        if (!(row[key] > (expected as any).gt)) return false;
        continue;
      }
    }
    if (row[key] !== expected) return false;
  }
  return true;
}

export function createMemoryGameDb(seed?: {
  prizes?: GamePrizeRow[];
  participations?: GameParticipationRow[];
  vouchers?: GameVoucherRow[];
  campaigns?: GameCampaignRow[];
}): GamePrisma & {
  _state: {
    prizes: GamePrizeRow[];
    participations: GameParticipationRow[];
    vouchers: GameVoucherRow[];
    campaigns: GameCampaignRow[];
    redemptions: Array<{ voucherId: string; userId: string; notes?: string }>;
  };
} {
  const state = {
    prizes: [...(seed?.prizes ?? [])],
    participations: [...(seed?.participations ?? [])],
    vouchers: [...(seed?.vouchers ?? [])],
    campaigns: [...(seed?.campaigns ?? [])],
    redemptions: [] as Array<{ voucherId: string; userId: string; notes?: string }>
  };

  let idSeq = 1;
  const nextId = (prefix: string) => `${prefix}_${idSeq++}`;

  const api: GamePrisma = {
    prize: {
      async findFirst(args: any) {
        return state.prizes.find((p) => matchesWhere(p as any, args?.where)) ?? null;
      },
      async findMany(args: any) {
        let rows = state.prizes.filter((p) => matchesWhere(p as any, args?.where));
        if (args?.orderBy?.createdAt === 'asc') {
          rows = [...rows].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
        }
        return rows;
      },
      async updateMany(args: any) {
        const targets = state.prizes.filter((p) => matchesWhere(p as any, args?.where));
        for (const prize of targets) {
          if (args?.data?.remainingQuantity?.decrement) {
            prize.remainingQuantity -= args.data.remainingQuantity.decrement;
          }
        }
        return { count: targets.length };
      }
    },
    participation: {
      async findFirst(args: any) {
        return (
          state.participations.find((p) => matchesWhere(p as any, args?.where)) ?? null
        );
      },
      async findUnique(args: any) {
        if (args?.where?.id) {
          const p = state.participations.find((x) => x.id === args.where.id) ?? null;
          if (!p) return null;
          if (args?.include?.voucher) {
            return {
              ...p,
              voucher: state.vouchers.find((v) => v.participationId === p.id) ?? null
            };
          }
          return p;
        }
        return null;
      },
      async create(args: any) {
        const data = args.data;
        const id = nextId('part');
        const participation: GameParticipationRow = {
          id,
          sessionKey: data.sessionKey,
          campaignId: data.campaignId,
          email: data.email,
          outcome: data.outcome,
          prizeId: data.prizeId ?? null,
          voucher: null
        };

        if (data.voucher?.create) {
          const v = data.voucher.create;
          const voucher: GameVoucherRow = {
            id: nextId('voucher'),
            code: v.code,
            campaignId: v.campaignId,
            storeId: v.storeId,
            email: v.email,
            prize: v.prize,
            redeemed: false,
            redeemedAt: null,
            redeemedByUserId: null,
            expiresAt: v.expiresAt,
            participationId: id
          };
          state.vouchers.push(voucher);
          participation.voucher = voucher;
        }

        state.participations.push(participation);
        return participation;
      }
    },
    voucher: {
      async findFirst(args: any) {
        return state.vouchers.find((v) => matchesWhere(v as any, args?.where)) ?? null;
      },
      async update(args: any) {
        const voucher = state.vouchers.find((v) => v.id === args.where.id);
        if (!voucher) throw new Error('voucher not found');
        if (args.data.redeemed !== undefined) voucher.redeemed = args.data.redeemed;
        if (args.data.redeemedAt !== undefined) voucher.redeemedAt = args.data.redeemedAt;
        if (args.data.redeemedByUserId !== undefined) {
          voucher.redeemedByUserId = args.data.redeemedByUserId;
        }
        if (args.data.redemptions?.create) {
          state.redemptions.push({
            voucherId: voucher.id,
            userId: args.data.redemptions.create.userId,
            notes: args.data.redemptions.create.notes
          });
        }
        return { ...voucher };
      }
    },
    campaign: {
      async findFirst(args: any) {
        return state.campaigns.find((c) => matchesWhere(c as any, args?.where)) ?? null;
      }
    },
    async $transaction(fn) {
      return fn(api);
    }
  };

  return Object.assign(api, { _state: state });
}

export function makeCampaign(overrides: Partial<GameCampaignRow> & { store?: Partial<GameCampaignRow['store']> } = {}): GameCampaignRow {
  const now = new Date('2026-06-23T12:00:00.000Z');
  const store = {
    id: 'store_1',
    slug: 'bar-giorgio',
    active: true,
    subscriptionExpiresAt: new Date('2026-12-31T00:00:00.000Z'),
    ...(overrides.store ?? {})
  };
  const { store: _s, ...rest } = overrides;
  return {
    id: 'camp_1',
    slug: 'birra-gratis',
    name: 'Birra Gratis',
    active: true,
    startDate: new Date('2024-01-01T00:00:00.000Z'),
    endDate: new Date('2026-12-31T23:59:59.000Z'),
    playLimitMode: 'per_campaign',
    voucherValidityDays: 15,
    guaranteedWin: false,
    loseMessage: 'Nessun premio questa volta.',
    store,
    ...rest
  };
}

export function makePrize(overrides: Partial<GamePrizeRow> = {}): GamePrizeRow {
  return {
    id: 'prize_1',
    name: 'Birra Gratis',
    emoji: '🍺',
    description: 'Una birra omaggio',
    winProbability: 50,
    remainingQuantity: 10,
    totalQuantity: 10,
    active: true,
    campaignId: 'camp_1',
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    ...overrides
  };
}
