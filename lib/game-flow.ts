/**
 * Percorso di gioco: logica estratta da api/index.ts senza cambiare comportamento.
 * Consente test con Prisma mockato in memoria.
 */

export type GamePrizeRow = {
  id: string;
  name: string;
  emoji: string | null;
  description: string | null;
  winProbability: number;
  remainingQuantity: number;
  totalQuantity: number;
  active: boolean;
  campaignId: string;
  createdAt: Date;
};

export type GameStoreRow = {
  id: string;
  slug: string;
  active: boolean;
  subscriptionExpiresAt: Date | null;
};

export type GameCampaignRow = {
  id: string;
  slug: string;
  name: string;
  active: boolean;
  startDate: Date;
  endDate: Date;
  playLimitMode: string;
  voucherValidityDays: number;
  guaranteedWin: boolean;
  loseMessage: string;
  store: GameStoreRow;
};

export type GameParticipationRow = {
  id: string;
  sessionKey: string;
  campaignId: string;
  email: string;
  outcome: string;
  prizeId: string | null;
  voucher?: GameVoucherRow | null;
  campaign?: { loseMessage: string };
};

export type GameVoucherRow = {
  id: string;
  code: string;
  campaignId: string;
  storeId: string;
  email: string;
  prize: { id: string; name: string; emoji: string | null; description: string | null };
  redeemed: boolean;
  redeemedAt: Date | null;
  redeemedByUserId: string | null;
  expiresAt: Date;
  participationId: string;
};

/** Subset Prisma usato dal percorso di gioco (tx o client). */
export type GamePrisma = {
  prize: {
    findFirst: (args: any) => Promise<GamePrizeRow | null>;
    findMany: (args: any) => Promise<GamePrizeRow[]>;
    updateMany: (args: any) => Promise<{ count: number }>;
  };
  participation: {
    findFirst: (args: any) => Promise<GameParticipationRow | null>;
    findUnique: (args: any) => Promise<GameParticipationRow | null>;
    create: (args: any) => Promise<GameParticipationRow>;
  };
  voucher: {
    findFirst: (args: any) => Promise<GameVoucherRow | null>;
    update: (args: any) => Promise<GameVoucherRow>;
  };
  campaign: {
    findFirst: (args: any) => Promise<GameCampaignRow | null>;
  };
  alert?: {
    findFirst: (args: any) => Promise<any>;
    create: (args: any) => Promise<any>;
    count?: (args: any) => Promise<number>;
  };
  $transaction: <T>(fn: (tx: GamePrisma) => Promise<T>) => Promise<T>;
};

export function generateVoucherCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `${code}-${Date.now().toString(36).toUpperCase()}`;
}

export function buildSessionKey(params: {
  campaignId: string;
  playLimitMode: string;
  email: string;
  clientIp: string;
  deviceKey?: string;
}) {
  const day = new Date().toISOString().slice(0, 10);
  const identity = [params.email, params.clientIp, params.deviceKey || 'no-device'].join('_');

  if (params.playLimitMode === 'per_day') {
    return `${params.campaignId}_${day}_${identity}`;
  }

  return `${params.campaignId}_${identity}`;
}

export function isCampaignInPlayWindow(now: Date, startDate: Date, endDate: Date): boolean {
  return !(now < startDate || now > endDate);
}

export async function tryClaimPrize(prizeId: string, tx: GamePrisma) {
  const prize = await tx.prize.findFirst({ where: { id: prizeId } });
  if (!prize) return null;

  const updated = await tx.prize.updateMany({
    where: {
      id: prizeId,
      remainingQuantity: { gt: 0 }
    },
    data: {
      remainingQuantity: { decrement: 1 }
    }
  });

  if (updated.count === 1) {
    return prize;
  }

  return null;
}

export async function pickInventoryPrize(
  campaignId: string,
  guaranteedWin = false,
  tx: GamePrisma,
  rng: () => number = Math.random
) {
  const prizes = await tx.prize.findMany({
    where: {
      campaignId,
      active: true,
      remainingQuantity: { gt: 0 },
      winProbability: { gt: 0 }
    },
    orderBy: { createdAt: 'asc' }
  });

  if (!prizes.length) {
    return null;
  }

  if (guaranteedWin) {
    const totalWeight = prizes.reduce((sum, prize) => sum + prize.winProbability, 0);
    const pickFromPool = async (pool: typeof prizes) => {
      if (!pool.length) return null;

      if (totalWeight <= 0) {
        const randomIndex = Math.floor(rng() * pool.length);
        return tryClaimPrize(pool[randomIndex].id, tx);
      }

      let random = rng() * totalWeight;
      for (const prize of pool) {
        random -= prize.winProbability;
        if (random <= 0) {
          const claimed = await tryClaimPrize(prize.id, tx);
          if (claimed) return claimed;
          break;
        }
      }

      for (const prize of pool) {
        const claimed = await tryClaimPrize(prize.id, tx);
        if (claimed) return claimed;
      }

      return null;
    };

    return pickFromPool(prizes);
  }

  const random = rng() * 100;
  let cumulative = 0;

  for (const prize of prizes) {
    cumulative += prize.winProbability;
    if (random <= cumulative) {
      const claimed = await tryClaimPrize(prize.id, tx);
      if (claimed) return claimed;
    }
  }

  return null;
}

export type PlayFailure =
  | { kind: 'campaign_not_found' }
  | { kind: 'subscription_expired' }
  | { kind: 'campaign_not_active' }
  | { kind: 'duplicate' }
  | { kind: 'prizes_exhausted' };

export type PlaySuccess = {
  kind: 'ok';
  participation: GameParticipationRow;
  claimedPrize: GamePrizeRow | null;
  /** Risposta HTTP di play: solo sessionId + revealToken (no premio/voucher). */
  responseData: {
    sessionId: string;
    revealToken: string;
  };
};

export type PlayResult = PlaySuccess | PlayFailure;

export async function executePlay(params: {
  db: GamePrisma;
  campaign: GameCampaignRow | null;
  email: string;
  clientIp: string;
  userAgent?: string;
  deviceKey?: string;
  customerData: Record<string, unknown>;
  now?: Date;
  rng?: () => number;
  generateCode?: () => string;
  signRevealToken: (participationId: string) => string;
}): Promise<PlayResult> {
  const {
    db,
    campaign,
    email,
    clientIp,
    userAgent,
    deviceKey,
    customerData,
    signRevealToken
  } = params;
  const now = params.now ?? new Date();
  const rng = params.rng ?? Math.random;
  const generateCode = params.generateCode ?? generateVoucherCode;

  if (!campaign) {
    return { kind: 'campaign_not_found' };
  }

  if (campaign.store.subscriptionExpiresAt && now > campaign.store.subscriptionExpiresAt) {
    return { kind: 'subscription_expired' };
  }

  const startDate = new Date(campaign.startDate);
  const endDate = new Date(campaign.endDate);

  if (!isCampaignInPlayWindow(now, startDate, endDate)) {
    return { kind: 'campaign_not_active' };
  }

  const sessionKey = buildSessionKey({
    campaignId: campaign.id,
    playLimitMode: campaign.playLimitMode,
    email,
    clientIp,
    deviceKey
  });

  const expiresAt = new Date(
    now.getTime() + campaign.voucherValidityDays * 24 * 60 * 60 * 1000
  );

  try {
    const result = await db.$transaction(async (tx) => {
      const existing = await tx.participation.findFirst({
        where: { sessionKey, campaignId: campaign.id }
      });
      if (existing) {
        const err = new Error('duplicate');
        (err as any).isDuplicate = true;
        throw err;
      }

      const prize = await pickInventoryPrize(campaign.id, campaign.guaranteedWin, tx, rng);

      if (campaign.guaranteedWin && !prize) {
        const err = new Error('prizes_exhausted');
        (err as any).isPrizesExhausted = true;
        throw err;
      }

      const created = await tx.participation.create({
        data: {
          sessionKey,
          campaignId: campaign.id,
          email,
          clientIp,
          userAgent: typeof userAgent === 'string' ? userAgent : undefined,
          deviceKey,
          customerData,
          outcome: prize ? 'won' : 'lost',
          prizeId: prize?.id,
          voucher: prize
            ? {
                create: {
                  code: generateCode(),
                  campaignId: campaign.id,
                  storeId: campaign.store.id,
                  prize: {
                    id: prize.id,
                    name: prize.name,
                    emoji: prize.emoji,
                    description: prize.description
                  },
                  email,
                  expiresAt
                }
              }
            : undefined
        },
        include: { voucher: true }
      });

      return { created, prize };
    });

    return {
      kind: 'ok',
      participation: result.created,
      claimedPrize: result.prize,
      responseData: {
        sessionId: result.created.id,
        revealToken: signRevealToken(result.created.id)
      }
    };
  } catch (err: unknown) {
    if ((err as any)?.isDuplicate || (err as any)?.code === 'P2002') {
      return { kind: 'duplicate' };
    }
    if ((err as any)?.isPrizesExhausted) {
      return { kind: 'prizes_exhausted' };
    }
    throw err;
  }
}

export function buildRevealPayload(participation: GameParticipationRow) {
  const prize =
    (participation.voucher?.prize as {
      id: string;
      name: string;
      emoji: string | null;
      description: string | null;
    } | null) ?? null;

  return {
    won: participation.outcome === 'won',
    prize,
    voucherCode: participation.voucher?.code || null,
    expiresAt: participation.voucher?.expiresAt
      ? participation.voucher.expiresAt.toISOString()
      : null,
    loseMessage: participation.campaign?.loseMessage ?? ''
  };
}

export type RedeemFailure =
  | { kind: 'not_found' }
  | { kind: 'already_redeemed' }
  | { kind: 'expired' };

export type RedeemSuccess = { kind: 'ok'; voucher: GameVoucherRow };

export async function executeRedeem(params: {
  db: GamePrisma;
  code: string;
  storeId: string;
  userId: string;
  notes?: string;
  now?: Date;
}): Promise<RedeemSuccess | RedeemFailure> {
  const now = params.now ?? new Date();

  const voucher = await params.db.voucher.findFirst({
    where: { code: params.code, storeId: params.storeId }
  });

  if (!voucher) {
    return { kind: 'not_found' };
  }

  if (voucher.redeemed) {
    return { kind: 'already_redeemed' };
  }

  if (now > voucher.expiresAt) {
    return { kind: 'expired' };
  }

  const redeemed = await params.db.voucher.update({
    where: { id: voucher.id },
    data: {
      redeemed: true,
      redeemedAt: now,
      redeemedByUserId: params.userId,
      redemptions: {
        create: {
          userId: params.userId,
          notes: params.notes
        }
      }
    }
  });

  return { kind: 'ok', voucher: redeemed };
}
