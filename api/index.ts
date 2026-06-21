import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from 'crypto';
import QRCode from 'qrcode';
import { prisma } from '../lib/db';

// ==========================================
// SCHEMAS
// ==========================================

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6)
});

const RegisterStoreSchema = z.object({
  storeName: z.string().min(2),
  storeSlug: z.string().regex(/^[a-z0-9-]+$/),
  businessType: z.enum(['bar', 'restaurant', 'retail', 'beauty', 'fitness', 'generic']).default('generic'),
  ownerName: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6),
  phone: z.string().optional(),
  address: z.string().optional(),
  logoUrl: z.string().url().optional().or(z.literal('')),
  primaryColor: z.string().default('#667eea'),
  secondaryColor: z.string().default('#764ba2'),
  termsAccepted: z.boolean()
});

const StoreSchema = z.object({
  partnerId: z.string().optional().or(z.literal('')),
  name: z.string().min(1),
  slug: z.string().regex(/^[a-z0-9-]+$/),
  email: z.string().email(),
  businessType: z.enum(['bar', 'restaurant', 'retail', 'beauty', 'fitness', 'generic']).default('generic'),
  phone: z.string().optional(),
  address: z.string().optional(),
  logoUrl: z.string().url().optional().or(z.literal('')),
  primaryColor: z.string().default('#667eea'),
  secondaryColor: z.string().default('#764ba2'),
  subscriptionExpiresAt: z.string().optional(),
  active: z.boolean().default(true)
});

const StoreUpdateSchema = StoreSchema.partial();

const StoreProfileSchema = z.object({
  name: z.string().min(1),
  businessType: z.enum(['bar', 'restaurant', 'retail', 'beauty', 'fitness', 'generic']).default('generic'),
  phone: z.string().optional(),
  address: z.string().optional(),
  logoUrl: z.string().url().optional().or(z.literal('')),
  primaryColor: z.string().default('#667eea'),
  secondaryColor: z.string().default('#764ba2')
});

const UserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().min(1),
  role: z.enum(['store_owner', 'staff', 'partner_owner']),
  storeId: z.string().optional().or(z.literal('')),
  partnerId: z.string().optional().or(z.literal('')),
  active: z.boolean().default(true)
});

const UserUpdateSchema = UserSchema.partial();

const PartnerSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional(),
  logoUrl: z.string().url().optional().or(z.literal('')),
  active: z.boolean().default(true)
});

const PartnerUpdateSchema = PartnerSchema.partial();

const CampaignSchema = z.object({
  storeId: z.string(),
  name: z.string().min(1),
  slug: z.string().regex(/^[a-z0-9-]+$/),
  description: z.string().optional(),
  prizes: z.array(z.object({
    name: z.string(),
    emoji: z.string(),
    probability: z.number().min(0).max(100),
    description: z.string()
  })),
  active: z.boolean().default(true),
  startDate: z.string(),
  endDate: z.string(),
  maxPlaysPerUser: z.number().default(1)
});

const PlaySchema = z.object({
  storeSlug: z.string(),
  campaignSlug: z.string(),
  email: z.string().email().optional(),
  customerData: z.record(z.any()).default({}),
  privacyConsent: z.boolean(),
  deviceKey: z.string().optional()
});

const CustomerFieldSchema = z.object({
  key: z.enum(['name', 'surname', 'email', 'phone', 'birthDate', 'marketingConsent']),
  label: z.string(),
  required: z.boolean().default(false),
  enabled: z.boolean().default(true)
});

const StoreCampaignSchema = z.object({
  name: z.string().min(1),
  slug: z.string().regex(/^[a-z0-9-]+$/),
  description: z.string().optional(),
  gameType: z.enum(['scratch_card', 'wheel', 'instant_reveal']).default('scratch_card'),
  customerFields: z.array(CustomerFieldSchema).default([]),
  playLimitMode: z.enum(['per_campaign', 'per_day']).default('per_campaign'),
  loseMessage: z.string().min(1).default('Nessun premio questa volta.'),
  guaranteedWin: z.boolean().default(false),
  voucherValidityDays: z.number().int().min(1).max(365).default(15),
  active: z.boolean().default(true),
  startDate: z.string(),
  endDate: z.string()
});

const PrizeSchema = z.object({
  name: z.string().min(1),
  emoji: z.string().optional(),
  description: z.string().optional(),
  winProbability: z.number().min(0).max(100),
  totalQuantity: z.number().int().min(0),
  remainingQuantity: z.number().int().min(0).optional(),
  active: z.boolean().default(true)
});

const RedeemVoucherSchema = z.object({
  code: z.string().min(3),
  notes: z.string().optional()
});

const SubscriptionRequestSchema = z.object({
  planId: z.enum(['basic', 'pro'])
});

const ComposerSchema = z.object({
  businessType: z.enum(['bar', 'restaurant', 'retail', 'beauty', 'fitness', 'generic']).default('generic'),
  goal: z.enum(['weekend_promo', 'bring_customers', 'collect_contacts', 'reward_purchase']).default('bring_customers'),
  rewardStyle: z.enum(['single_prize', 'guaranteed_multi_prize', 'discounts_only']).default('guaranteed_multi_prize'),
  gamePreference: z.enum(['auto', 'scratch_card', 'wheel', 'instant_reveal']).default('auto'),
  campaignName: z.string().optional(),
  mainPrize: z.string().optional(),
  durationDays: z.number().int().min(1).max(60).default(7),
  discountHigh: z.number().int().min(1).max(90).default(30),
  discountLow: z.number().int().min(1).max(90).default(10),
  collectPhone: z.boolean().default(false),
  startDate: z.string().optional()
});

const SUBSCRIPTION_PLANS = [
  {
    id: 'trial',
    name: 'Trial',
    priceLabel: 'Gratis',
    periodLabel: '14 giorni',
    description: 'Prova completa della piattaforma con un negozio e campagne attive.',
    features: ['1 negozio', 'Campagne illimitate', 'QR e voucher', 'Materiali promo']
  },
  {
    id: 'basic',
    name: 'Basic',
    priceLabel: '€29/mese',
    periodLabel: 'Mensile',
    description: 'Per attività singole che vogliono giocare in autonomia.',
    features: ['1 negozio', 'Supporto email', 'Statistiche campagne', 'Validazione voucher']
  },
  {
    id: 'pro',
    name: 'Pro',
    priceLabel: '€59/mese',
    periodLabel: 'Mensile',
    description: 'Per negozi con più campagne e materiali promozionali frequenti.',
    features: ['Tutto del Basic', 'Priorità assistenza', 'Brand avanzato', 'Alert operativi']
  }
] as const;

type Prize = {
  name: string;
  emoji: string;
  probability: number;
  description: string;
};

type CustomerField = z.infer<typeof CustomerFieldSchema>;

// ==========================================
// UTILITIES
// ==========================================

function base64UrlEncode(value: Buffer | string): string {
  return (typeof value === 'string' ? Buffer.from(value) : value).toString('base64url');
}

function base64UrlDecode(value: string): Buffer {
  return Buffer.from(value, 'base64url');
}

function getAuthSecret(): string {
  const secret = process.env.JWT_SECRET || process.env.AUTH_SECRET || process.env.ADMIN_PASSWORD;
  if (!secret || secret.length < 16) {
    throw new Error('JWT_SECRET or AUTH_SECRET must be configured with at least 16 characters.');
  }
  return secret;
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }
  return timingSafeEqual(
    leftBuffer as unknown as Uint8Array,
    rightBuffer as unknown as Uint8Array
  );
}

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const derived = scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${derived}`;
}

function legacyHashPassword(password: string): string {
  return createHash('sha256').update(password).digest('hex');
}

function verifyPassword(password: string, storedHash: string): boolean {
  if (storedHash.startsWith('scrypt$')) {
    const [, salt, expectedHash] = storedHash.split('$');
    if (!salt || !expectedHash) return false;
    const actualHash = scryptSync(password, salt, 64).toString('hex');
    return safeEqual(actualHash, expectedHash);
  }

  return safeEqual(legacyHashPassword(password), storedHash);
}

function shouldUpgradePasswordHash(storedHash: string): boolean {
  return !storedHash.startsWith('scrypt$');
}

type AuthTokenPayload = {
  sub: string;
  role: string;
  storeId?: string | null;
  partnerId?: string | null;
  exp: number;
};

function signToken(payload: Omit<AuthTokenPayload, 'exp'>, ttlSeconds = 60 * 60 * 8): string {
  const header = { alg: 'HS256', typ: 'JWT' };
  const body: AuthTokenPayload = {
    ...payload,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds
  };
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedBody = base64UrlEncode(JSON.stringify(body));
  const signature = createHmac('sha256', getAuthSecret())
    .update(`${encodedHeader}.${encodedBody}`)
    .digest('base64url');
  return `${encodedHeader}.${encodedBody}.${signature}`;
}

function verifyToken(token: string | null): AuthTokenPayload | null {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [encodedHeader, encodedBody, signature] = parts;
  const expectedSignature = createHmac('sha256', getAuthSecret())
    .update(`${encodedHeader}.${encodedBody}`)
    .digest('base64url');

  if (!safeEqual(signature, expectedSignature)) {
    return null;
  }

  try {
    const payload = JSON.parse(base64UrlDecode(encodedBody).toString('utf8')) as AuthTokenPayload;
    if (!payload.sub || !payload.role || !payload.exp || payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

function generateVoucherCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `${code}-${Date.now().toString(36).toUpperCase()}`;
}

function selectPrize(prizes: Prize[]): Prize {
  const random = Math.random() * 100;
  let cumulative = 0;

  for (const prize of prizes) {
    cumulative += prize.probability;
    if (random <= cumulative) {
      return prize;
    }
  }

  return prizes[prizes.length - 1];
}

function getAuthToken(req: VercelRequest): string | null {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  return authHeader.substring(7);
}

function parsePrizes(value: unknown): Prize[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value as Prize[];
}

function getClientIp(req: VercelRequest): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim();
  }
  if (Array.isArray(forwarded) && forwarded.length > 0) {
    return forwarded[0];
  }
  const realIp = req.headers['x-real-ip'];
  if (typeof realIp === 'string') {
    return realIp;
  }
  return 'unknown';
}

async function getCurrentUser(payload: AuthTokenPayload | null) {
  if (!payload || payload.role === 'super_admin') {
    return null;
  }

  return prisma.user.findFirst({
    where: { id: payload.sub, active: true }
  });
}

function getCustomerFields(value: unknown): CustomerField[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value as CustomerField[];
}

function validateCustomerData(fields: CustomerField[], customerData: Record<string, unknown>) {
  const errors: string[] = [];

  for (const field of fields) {
    if (!field.enabled || !field.required) {
      continue;
    }

    const value = customerData[field.key];
    if (value === undefined || value === null || String(value).trim() === '') {
      errors.push(`${field.label} is required`);
    }
  }

  return errors;
}

function buildSessionKey(params: {
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

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 70) || 'campagna';
}

async function buildUniqueCampaignSlug(storeId: string, baseSlug: string): Promise<string> {
  const cleanBase = slugify(baseSlug);
  let slug = cleanBase;
  let suffix = 2;

  while (await prisma.campaign.findFirst({ where: { storeId, slug } })) {
    slug = `${cleanBase}-${suffix}`;
    suffix += 1;
  }

  return slug;
}

function formatDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function getBusinessDefaults(businessType: z.infer<typeof ComposerSchema>['businessType']) {
  const defaults = {
    bar: {
      label: 'Bar',
      topPrize: 'Birra gratis',
      emoji: '🍺',
      description: 'Perfetta per aumentare passaggi e consumazioni nel weekend.'
    },
    restaurant: {
      label: 'Ristorante',
      topPrize: 'Dessert omaggio',
      emoji: '🍰',
      description: 'Ideale per riportare clienti a pranzo o cena.'
    },
    retail: {
      label: 'Negozio',
      topPrize: 'Buono acquisto',
      emoji: '🎁',
      description: 'Pensata per aumentare ingressi e acquisti in negozio.'
    },
    beauty: {
      label: 'Beauty',
      topPrize: 'Trattamento omaggio',
      emoji: '✨',
      description: 'Utile per raccogliere contatti e prenotazioni.'
    },
    fitness: {
      label: 'Fitness',
      topPrize: 'Ingresso gratuito',
      emoji: '💪',
      description: 'Adatta a generare prove e nuovi iscritti.'
    },
    generic: {
      label: 'Attività',
      topPrize: 'Premio speciale',
      emoji: '🎁',
      description: 'Campagna pronta per coinvolgere i clienti.'
    }
  };

  return defaults[businessType] || defaults.generic;
}

function buildComposerProposal(
  input: z.infer<typeof ComposerSchema>,
  store: { name: string; slug: string },
  slug: string
) {
  const defaults = getBusinessDefaults(input.businessType);
  const start = input.startDate ? new Date(input.startDate) : new Date();
  const end = new Date(start);
  end.setDate(start.getDate() + input.durationDays);

  const mainPrize = (input.mainPrize || defaults.topPrize).trim();
  const campaignName = (input.campaignName || `${store.name} - Promo ${input.durationDays} giorni`).trim();
  const customerFields: CustomerField[] = [
    { key: 'name', label: 'Nome', required: true, enabled: true },
    { key: 'email', label: 'Email', required: true, enabled: true },
    ...(input.collectPhone ? [{ key: 'phone' as const, label: 'Telefono', required: false, enabled: true }] : [])
  ];

  let gameType: 'scratch_card' | 'wheel' | 'instant_reveal' = 'wheel';
  let guaranteedWin = true;
  let prizes: Array<z.infer<typeof PrizeSchema>> = [];
  const loseMessage = 'Nessun premio questa volta. Riprova domani!';

  if (input.rewardStyle === 'single_prize') {
    guaranteedWin = false;
    gameType = 'scratch_card';
    prizes = [
      {
        name: mainPrize,
        emoji: defaults.emoji,
        description: mainPrize,
        winProbability: 10,
        totalQuantity: 25,
        remainingQuantity: 25,
        active: true
      }
    ];
  } else if (input.rewardStyle === 'discounts_only') {
    guaranteedWin = true;
    gameType = 'wheel';
    prizes = [
      {
        name: `Sconto ${input.discountHigh}%`,
        emoji: '🏷️',
        description: `Sconto ${input.discountHigh}% in negozio`,
        winProbability: 25,
        totalQuantity: 100,
        remainingQuantity: 100,
        active: true
      },
      {
        name: `Sconto ${input.discountLow}%`,
        emoji: '💸',
        description: `Sconto ${input.discountLow}% in negozio`,
        winProbability: 75,
        totalQuantity: 300,
        remainingQuantity: 300,
        active: true
      }
    ];
  } else {
    guaranteedWin = true;
    gameType = 'wheel';
    prizes = [
      {
        name: mainPrize,
        emoji: defaults.emoji,
        description: mainPrize,
        winProbability: 5,
        totalQuantity: 20,
        remainingQuantity: 20,
        active: true
      },
      {
        name: `Sconto ${input.discountHigh}%`,
        emoji: '🏷️',
        description: `Sconto ${input.discountHigh}% in negozio`,
        winProbability: 20,
        totalQuantity: 100,
        remainingQuantity: 100,
        active: true
      },
      {
        name: `Sconto ${input.discountLow}%`,
        emoji: '💸',
        description: `Sconto ${input.discountLow}% in negozio`,
        winProbability: 75,
        totalQuantity: 300,
        remainingQuantity: 300,
        active: true
      }
    ];
  }

  if (input.gamePreference !== 'auto') {
    gameType = input.gamePreference;
  }

  const campaign = {
    name: campaignName,
    slug,
    description: `${defaults.description} Gioca e scopri subito cosa hai vinto da ${store.name}.`,
    gameType,
    customerFields,
    playLimitMode: 'per_day',
    loseMessage,
    guaranteedWin,
    voucherValidityDays: 15,
    active: true,
    startDate: formatDateOnly(start),
    endDate: formatDateOnly(end)
  };

  return {
    campaign,
    prizes,
    recommendation: {
      businessLabel: defaults.label,
      summary: guaranteedWin
        ? 'Configurazione multipremio con vincita garantita: ideale per far partecipare più clienti senza frizioni.'
        : 'Configurazione premio unico: più semplice, con premio raro e costo promozionale controllato.',
      gameReason: gameType === 'wheel'
        ? 'La ruota rende visibili i premi multipli ed è la scelta più chiara per sconti e premi diversi.'
        : gameType === 'scratch_card'
          ? 'Il gratta e vinci è il formato più classico per un premio singolo.'
          : 'Le scatole misteriose sono rapide su mobile e adatte a una promo immediata.'
    }
  };
}

function getStoreSubscriptionStatus(store: { active: boolean; subscriptionExpiresAt: Date | null }) {
  if (!store.active) {
    return {
      operational: false,
      status: 'inactive' as const,
      currentPlan: 'trial' as const,
      daysLeft: null as number | null,
      message: 'Negozio disattivato. Contatta l\'amministratore della piattaforma.'
    };
  }

  if (!store.subscriptionExpiresAt) {
    return {
      operational: true,
      status: 'active' as const,
      currentPlan: 'pro' as const,
      daysLeft: null as number | null,
      message: 'Abbonamento attivo senza scadenza.'
    };
  }

  const daysLeft = Math.ceil((store.subscriptionExpiresAt.getTime() - Date.now()) / 86400000);
  if (daysLeft < 0) {
    return {
      operational: false,
      status: 'expired' as const,
      currentPlan: 'trial' as const,
      daysLeft,
      message: 'Abbonamento scaduto. Attiva un piano per creare o modificare campagne.'
    };
  }

  if (daysLeft <= 7) {
    return {
      operational: true,
      status: 'expiring' as const,
      currentPlan: 'trial' as const,
      daysLeft,
      message: `Trial in scadenza tra ${daysLeft} giorni.`
    };
  }

  return {
    operational: true,
    status: 'trial' as const,
    currentPlan: 'trial' as const,
    daysLeft,
    message: 'Trial attivo. Puoi creare campagne e materiali promozionali.'
  };
}

async function assertStoreCanManageCampaigns(storeId: string, res: VercelResponse) {
  const store = await prisma.store.findUnique({ where: { id: storeId } });
  if (!store) {
    res.status(404).json({ success: false, error: 'Negozio non trovato.' });
    return null;
  }

  const subscription = getStoreSubscriptionStatus(store);
  if (!subscription.operational) {
    res.status(403).json({
      success: false,
      error: subscription.message,
      subscription
    });
    return null;
  }

  return store;
}

async function createPrizesExhaustedAlert(storeId: string, campaignId: string, campaignName: string) {
  const activeRemaining = await prisma.prize.count({
    where: {
      campaignId,
      active: true,
      remainingQuantity: { gt: 0 }
    }
  });

  if (activeRemaining > 0) {
    return;
  }

  const existing = await prisma.alert.findFirst({
    where: {
      storeId,
      campaignId,
      type: 'prizes_exhausted',
      readByStore: false
    }
  });

  if (existing) {
    return;
  }

  await prisma.alert.create({
    data: {
      storeId,
      campaignId,
      type: 'prizes_exhausted',
      message: `I premi disponibili per la campagna "${campaignName}" sono terminati.`
    }
  });
}

async function tryClaimPrize(prizeId: string) {
  const prize = await prisma.prize.findFirst({ where: { id: prizeId } });
  if (!prize) return null;

  const updated = await prisma.prize.updateMany({
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

async function getCampaignPrizeProbabilitySummary(campaignId: string) {
  const prizes = await prisma.prize.findMany({
    where: { campaignId, active: true, winProbability: { gt: 0 } },
    orderBy: { createdAt: 'asc' }
  });

  const totalProbability = prizes.reduce((sum, prize) => sum + prize.winProbability, 0);
  return { prizes, totalProbability };
}

async function validateCampaignPrizeProbabilities(campaignId: string, guaranteedWin: boolean) {
  const { prizes, totalProbability } = await getCampaignPrizeProbabilitySummary(campaignId);

  if (guaranteedWin) {
    const stockedPrizes = prizes.filter((prize) => prize.totalQuantity > 0);
    if (!stockedPrizes.length) {
      return 'Con vincita garantita serve almeno un premio attivo con probabilità maggiore di 0.';
    }
    if (totalProbability <= 0) {
      return 'Con vincita garantita imposta una probabilità maggiore di 0 su almeno un premio.';
    }
    return null;
  }

  if (totalProbability > 100) {
    return `La somma delle probabilità dei premi attivi (${totalProbability}%) supera il 100%.`;
  }

  return null;
}

async function pickInventoryPrize(campaignId: string, guaranteedWin = false) {
  const prizes = await prisma.prize.findMany({
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
        const randomIndex = Math.floor(Math.random() * pool.length);
        return tryClaimPrize(pool[randomIndex].id);
      }

      let random = Math.random() * totalWeight;
      for (const prize of pool) {
        random -= prize.winProbability;
        if (random <= 0) {
          const claimed = await tryClaimPrize(prize.id);
          if (claimed) return claimed;
          break;
        }
      }

      for (const prize of pool) {
        const claimed = await tryClaimPrize(prize.id);
        if (claimed) return claimed;
      }

      return null;
    };

    return pickFromPool(prizes);
  }

  const random = Math.random() * 100;
  let cumulative = 0;

  for (const prize of prizes) {
    cumulative += prize.winProbability;
    if (random <= cumulative) {
      const claimed = await tryClaimPrize(prize.id);
      if (claimed) return claimed;
    }
  }

  return null;
}

// ==========================================
// MAIN HANDLER
// ==========================================

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const url = new URL(req.url!, `http://${req.headers.host}`);
  const path = url.pathname;
  const method = req.method;

  try {
    console.log(`[${method}] ${path}`);

    if (path === '/api/health') {
      await prisma.$queryRaw`SELECT 1`;
      return res.json({
        status: 'ok',
        version: '2.1.0',
        database: 'connected',
        timestamp: new Date().toISOString()
      });
    }

    if (path === '/api/public/qr' && method === 'GET') {
      const text = url.searchParams.get('text');
      if (!text) {
        return res.status(400).json({ success: false, error: 'Text is required' });
      }

      const svg = await QRCode.toString(text, {
        type: 'svg',
        errorCorrectionLevel: 'H',
        margin: 1,
        width: 512,
        color: {
          dark: '#172033',
          light: '#ffffff'
        }
      });

      res.setHeader('Content-Type', 'image/svg+xml');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      return res.status(200).send(svg);
    }

    if (path === '/api/auth/login' && method === 'POST') {
      const validation = LoginSchema.safeParse(req.body);

      if (!validation.success) {
        return res.status(400).json({
          success: false,
          errors: validation.error.errors
        });
      }

      const { email, password } = validation.data;
      const normalizedEmail = email.toLowerCase().trim();
      const adminEmail = process.env.ADMIN_EMAIL?.toLowerCase().trim();
      const adminPassword = process.env.ADMIN_PASSWORD;

      if (
        adminEmail &&
        adminPassword &&
        normalizedEmail === adminEmail &&
        safeEqual(password, adminPassword)
      ) {
        return res.json({
          success: true,
          data: {
            token: signToken({ sub: 'super_admin', role: 'super_admin' }),
            user: { email: adminEmail, role: 'super_admin' }
          }
        });
      }

      const user = await prisma.user.findFirst({
        where: { email: normalizedEmail, active: true }
      });

      if (!user || !verifyPassword(password, user.passwordHash)) {
        return res.status(401).json({
          success: false,
          error: 'Invalid credentials'
        });
      }

      if (shouldUpgradePasswordHash(user.passwordHash)) {
        await prisma.user.update({
          where: { id: user.id },
          data: { passwordHash: hashPassword(password) }
        });
      }

      return res.json({
        success: true,
        data: {
          token: signToken({
            sub: user.id,
            role: user.role,
            storeId: user.storeId,
            partnerId: user.partnerId
          }),
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
            storeId: user.storeId,
            partnerId: user.partnerId
          }
        }
      });
    }

    if (path === '/api/auth/register-store' && method === 'POST') {
      const validation = RegisterStoreSchema.safeParse(req.body);

      if (!validation.success) {
        return res.status(400).json({
          success: false,
          errors: validation.error.errors
        });
      }

      const data = validation.data;
      if (!data.termsAccepted) {
        return res.status(400).json({
          success: false,
          error: 'Devi accettare termini e condizioni per registrarti.'
        });
      }

      const email = data.email.toLowerCase().trim();
      const [existingStore, existingUser] = await Promise.all([
        prisma.store.findUnique({ where: { slug: data.storeSlug } }),
        prisma.user.findUnique({ where: { email } })
      ]);

      if (existingStore) {
        return res.status(409).json({
          success: false,
          error: 'Esiste già un negozio con questo slug. Scegli un nome link diverso.'
        });
      }

      if (existingUser) {
        return res.status(409).json({
          success: false,
          error: 'Esiste già un account con questa email. Accedi o usa un’altra email.'
        });
      }

      const trialDays = Number(process.env.TRIAL_DAYS || 14);
      const subscriptionExpiresAt = new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000);
      const created = await prisma.$transaction(async (tx) => {
        const store = await tx.store.create({
          data: {
            name: data.storeName,
            slug: data.storeSlug,
            email,
            businessType: data.businessType,
            phone: data.phone || null,
            address: data.address || null,
            logoUrl: data.logoUrl || null,
            primaryColor: data.primaryColor,
            secondaryColor: data.secondaryColor,
            subscriptionExpiresAt,
            active: true
          } as any
        });

        const user = await tx.user.create({
          data: {
            email,
            passwordHash: hashPassword(data.password),
            name: data.ownerName,
            role: 'store_owner',
            storeId: store.id,
            active: true
          }
        });

        return { store, user };
      });

      return res.status(201).json({
        success: true,
        data: {
          token: signToken({
            sub: created.user.id,
            role: created.user.role,
            storeId: created.user.storeId,
            partnerId: created.user.partnerId
          }),
          trialDays,
          store: created.store,
          user: {
            id: created.user.id,
            email: created.user.email,
            name: created.user.name,
            role: created.user.role,
            storeId: created.user.storeId
          }
        }
      });
    }

    if (path === '/api/public/games' && method === 'GET') {
      return res.json({
        success: true,
        data: [
          {
            id: 'scratch_card',
            name: 'Gratta e vinci',
            description: 'Il giocatore raschia la card per scoprire l’esito.',
            playLabel: 'Inizia e gratta'
          },
          {
            id: 'wheel',
            name: 'Ruota della fortuna',
            description: 'Il giocatore fa girare la ruota e la ferma con un click sul momento che preferisce.',
            playLabel: 'Gira la ruota'
          },
          {
            id: 'instant_reveal',
            name: 'Scatole misteriose',
            description: 'Il giocatore sceglie una tra tre scatole e scopre l’esito con animazione.',
            playLabel: 'Scegli una scatola'
          }
        ]
      });
    }

    if (path === '/api/public/campaign' && method === 'GET') {
      const storeSlug = url.searchParams.get('store');
      const campaignSlug = url.searchParams.get('campaign');

      if (!storeSlug || !campaignSlug) {
        return res.status(400).json({
          success: false,
          error: 'Store and campaign are required'
        });
      }

      const campaign = await prisma.campaign.findFirst({
        where: {
          slug: campaignSlug,
          active: true,
          store: {
            slug: storeSlug,
            active: true
          }
        },
        include: {
          store: true,
          prizeItems: {
            where: { active: true },
            select: {
              id: true,
              name: true,
              emoji: true,
              description: true,
              winProbability: true,
              remainingQuantity: true
            }
          }
        }
      });

      if (!campaign) {
        return res.status(404).json({
          success: false,
          error: 'Campaign not found'
        });
      }

      const now = new Date();
      if (campaign.store.subscriptionExpiresAt && now > campaign.store.subscriptionExpiresAt) {
        return res.status(403).json({
          success: false,
          error: 'Store subscription expired'
        });
      }

      return res.json({
        success: true,
        data: {
          id: campaign.id,
          name: campaign.name,
          slug: campaign.slug,
          description: campaign.description,
          gameType: campaign.gameType,
          guaranteedWin: campaign.guaranteedWin,
          customerFields: getCustomerFields(campaign.customerFields),
          loseMessage: campaign.loseMessage,
          startDate: campaign.startDate,
          endDate: campaign.endDate,
          store: {
            name: campaign.store.name,
            slug: campaign.store.slug,
            logoUrl: campaign.store.logoUrl,
            primaryColor: campaign.store.primaryColor,
            secondaryColor: campaign.store.secondaryColor
          },
          prizes: campaign.prizeItems.map((prize) => ({
            id: prize.id,
            name: prize.name,
            emoji: prize.emoji,
            description: prize.description,
            winProbability: prize.winProbability,
            available: prize.remainingQuantity > 0
          }))
        }
      });
    }

    if (path === '/api/public/play' && method === 'POST') {
      const validation = PlaySchema.safeParse(req.body);

      if (!validation.success) {
        return res.status(400).json({
          success: false,
          errors: validation.error.errors
        });
      }

      const { storeSlug, campaignSlug, privacyConsent, deviceKey } = validation.data;
      const customerData = validation.data.customerData || {};
      const email = validation.data.email || String(customerData.email || '');

      if (!privacyConsent) {
        return res.status(400).json({
          success: false,
          error: 'Privacy consent required'
        });
      }

      const clientIp = getClientIp(req);
      const userAgent = req.headers['user-agent'];

      const campaign = await prisma.campaign.findFirst({
        where: {
          slug: campaignSlug,
          active: true,
          store: {
            slug: storeSlug,
            active: true
          }
        },
        include: { store: true }
      });

      if (!campaign) {
        return res.status(404).json({
          success: false,
          error: 'Campaign not found'
        });
      }

      if (campaign.store.subscriptionExpiresAt && new Date() > campaign.store.subscriptionExpiresAt) {
        return res.status(403).json({
          success: false,
          error: 'Store subscription expired'
        });
      }

      const now = new Date();
      const startDate = new Date(campaign.startDate);
      const endDate = new Date(campaign.endDate);

      if (now < startDate || now > endDate) {
        return res.status(400).json({
          success: false,
          error: 'Campaign not active'
        });
      }

      const customerFields = getCustomerFields(campaign.customerFields);
      const fieldErrors = validateCustomerData(customerFields, customerData);

      if (!email) {
        fieldErrors.push('Email is required');
      }

      if (fieldErrors.length > 0) {
        return res.status(400).json({
          success: false,
          error: 'Missing required customer data',
          errors: fieldErrors
        });
      }

      const sessionKey = buildSessionKey({
        campaignId: campaign.id,
        playLimitMode: campaign.playLimitMode,
        email,
        clientIp,
        deviceKey
      });
      const previousPlays = await prisma.participation.count({
        where: { sessionKey, campaignId: campaign.id }
      });

      if (previousPlays >= 1) {
        return res.status(429).json({
          success: false,
          error: 'Maximum plays reached'
        });
      }

      const selectedPrize = await pickInventoryPrize(campaign.id, campaign.guaranteedWin);

      if (campaign.guaranteedWin && !selectedPrize) {
        return res.status(410).json({
          success: false,
          error: 'Tutti i premi sono esauriti. Riprova più tardi o contatta il negozio.'
        });
      }

      const expiresAt = new Date(
        now.getTime() + campaign.voucherValidityDays * 24 * 60 * 60 * 1000
      );

      const participation = await prisma.participation.create({
        data: {
          sessionKey,
          campaignId: campaign.id,
          email,
          clientIp,
          userAgent: typeof userAgent === 'string' ? userAgent : undefined,
          deviceKey,
          customerData,
          outcome: selectedPrize ? 'won' : 'lost',
          prizeId: selectedPrize?.id,
          voucher: selectedPrize
            ? {
                create: {
                  code: generateVoucherCode(),
                  campaignId: campaign.id,
                  storeId: campaign.store.id,
                  prize: {
                    id: selectedPrize.id,
                    name: selectedPrize.name,
                    emoji: selectedPrize.emoji,
                    description: selectedPrize.description
                  },
                  email,
                  expiresAt
                }
              }
            : undefined
        },
        include: { voucher: true }
      });

      if (selectedPrize) {
        await createPrizesExhaustedAlert(campaign.store.id, campaign.id, campaign.name);
      }

      return res.json({
        success: true,
        data: {
          sessionId: participation.id,
          won: Boolean(selectedPrize),
          prize: selectedPrize
            ? {
                id: selectedPrize.id,
                name: selectedPrize.name,
                emoji: selectedPrize.emoji,
                description: selectedPrize.description
              }
            : null,
          voucherCode: participation.voucher?.code || null,
          expiresAt: participation.voucher?.expiresAt.toISOString() || null,
          loseMessage: campaign.loseMessage
        }
      });
    }

    const token = getAuthToken(req);
    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized'
      });
    }

    const authPayload = verifyToken(token);
    const isAdmin = authPayload?.role === 'super_admin';
    const currentUser = await getCurrentUser(authPayload);
    const ADMIN_LIST_LIMIT = 100;

    if (path.startsWith('/api/store/')) {
      if (!currentUser || !currentUser.storeId) {
        return res.status(403).json({ success: false, error: 'Forbidden' });
      }

      const storeId = currentUser.storeId;

      if (path === '/api/store/me' && method === 'GET') {
        const store = await prisma.store.findUnique({
          where: { id: storeId }
        });

        if (!store) {
          return res.status(404).json({ success: false, error: 'Negozio non trovato.' });
        }

        const subscription = getStoreSubscriptionStatus(store);

        return res.json({
          success: true,
          data: {
            user: {
              id: currentUser.id,
              email: currentUser.email,
              name: currentUser.name,
              role: currentUser.role
            },
            store,
            subscription
          }
        });
      }

      if (path === '/api/store/subscription' && method === 'GET') {
        const store = await prisma.store.findUnique({ where: { id: storeId } });
        if (!store) {
          return res.status(404).json({ success: false, error: 'Negozio non trovato.' });
        }

        const subscription = getStoreSubscriptionStatus(store);
        return res.json({
          success: true,
          data: {
            ...subscription,
            subscriptionExpiresAt: store.subscriptionExpiresAt,
            plans: SUBSCRIPTION_PLANS,
            paymentEnabled: false
          }
        });
      }

      if (path === '/api/store/subscription/request' && method === 'POST') {
        const validation = SubscriptionRequestSchema.safeParse(req.body);
        if (!validation.success) {
          return res.status(400).json({
            success: false,
            errors: validation.error.errors
          });
        }

        const store = await prisma.store.findUnique({ where: { id: storeId } });
        if (!store) {
          return res.status(404).json({ success: false, error: 'Negozio non trovato.' });
        }

        const plan = SUBSCRIPTION_PLANS.find((item) => item.id === validation.data.planId);
        if (!plan) {
          return res.status(400).json({ success: false, error: 'Piano non valido.' });
        }

        await prisma.alert.create({
          data: {
            storeId,
            type: 'upgrade_request',
            message: `${store.name} ha richiesto attivazione piano ${plan.name} (${plan.priceLabel}).`
          }
        });

        return res.json({
          success: true,
          data: {
            message: `Richiesta inviata per il piano ${plan.name}. Ti contatteremo per l'attivazione.`
          }
        });
      }

      if (path === '/api/store/me' && method === 'PUT') {
        const validation = StoreProfileSchema.safeParse(req.body);
        if (!validation.success) {
          return res.status(400).json({
            success: false,
            errors: validation.error.errors
          });
        }

        const { phone, address, logoUrl, ...profileData } = validation.data;
        const store = await prisma.store.update({
          where: { id: storeId },
          data: {
            ...profileData,
            phone: phone || null,
            address: address || null,
            logoUrl: logoUrl || null
          } as any
        });

        return res.json({ success: true, data: store });
      }

      if (path === '/api/store/composer/preview' && method === 'POST') {
        if (!(await assertStoreCanManageCampaigns(storeId, res))) {
          return;
        }

        const validation = ComposerSchema.safeParse(req.body);
        if (!validation.success) {
          return res.status(400).json({ success: false, errors: validation.error.errors });
        }

        const store = await prisma.store.findUnique({ where: { id: storeId } });
        if (!store) {
          return res.status(404).json({ success: false, error: 'Negozio non trovato.' });
        }

        const baseName = validation.data.campaignName || `${store.name} promo`;
        const slug = await buildUniqueCampaignSlug(storeId, baseName);
        const proposal = buildComposerProposal(validation.data, store, slug);
        const playUrl = `/?store=${store.slug}&campaign=${proposal.campaign.slug}`;

        return res.json({
          success: true,
          data: {
            ...proposal,
            playUrl
          }
        });
      }

      if (path === '/api/store/composer/apply' && method === 'POST') {
        if (!(await assertStoreCanManageCampaigns(storeId, res))) {
          return;
        }

        const validation = ComposerSchema.safeParse(req.body);
        if (!validation.success) {
          return res.status(400).json({ success: false, errors: validation.error.errors });
        }

        const store = await prisma.store.findUnique({ where: { id: storeId } });
        if (!store) {
          return res.status(404).json({ success: false, error: 'Negozio non trovato.' });
        }

        const baseName = validation.data.campaignName || `${store.name} promo`;
        const slug = await buildUniqueCampaignSlug(storeId, baseName);
        const proposal = buildComposerProposal(validation.data, store, slug);
        const created = await prisma.$transaction(async (tx) => {
          const campaign = await tx.campaign.create({
            data: {
              ...proposal.campaign,
              storeId,
              prizes: [],
              startDate: new Date(proposal.campaign.startDate),
              endDate: new Date(proposal.campaign.endDate)
            } as any
          });

          const prizes = await Promise.all(proposal.prizes.map((prize) => (
            tx.prize.create({
              data: {
                ...prize,
                campaignId: campaign.id,
                remainingQuantity: prize.remainingQuantity ?? prize.totalQuantity
              } as any
            })
          )));

          return { campaign, prizes };
        });

        const playUrl = `/?store=${store.slug}&campaign=${created.campaign.slug}`;

        return res.json({
          success: true,
          data: {
            campaign: created.campaign,
            prizes: created.prizes,
            playUrl,
            recommendation: proposal.recommendation
          }
        });
      }

      if (path === '/api/store/campaigns' && method === 'GET') {
        const campaigns = await prisma.campaign.findMany({
          where: { storeId },
          orderBy: { createdAt: 'desc' },
          include: {
            prizeItems: { orderBy: { createdAt: 'asc' } },
            participations: { select: { outcome: true } },
            vouchers: { select: { redeemed: true } },
            _count: {
              select: {
                participations: true,
                vouchers: true
              }
            }
          }
        });

        const data = campaigns.map((campaign) => {
          const totalPlays = campaign._count.participations;
          const wins = campaign.participations.filter((participation) => participation.outcome === 'won').length;
          const vouchersIssued = campaign._count.vouchers;
          const vouchersRedeemed = campaign.vouchers.filter((voucher) => voucher.redeemed).length;
          const prizesTotal = campaign.prizeItems.reduce((sum, prize) => sum + prize.totalQuantity, 0);
          const prizesRemaining = campaign.prizeItems.reduce((sum, prize) => sum + prize.remainingQuantity, 0);

          return {
            ...campaign,
            participations: undefined,
            vouchers: undefined,
            stats: {
              totalPlays,
              wins,
              losses: Math.max(totalPlays - wins, 0),
              realWinRate: totalPlays ? Math.round((wins / totalPlays) * 1000) / 10 : 0,
              vouchersIssued,
              vouchersRedeemed,
              vouchersOpen: Math.max(vouchersIssued - vouchersRedeemed, 0),
              prizesTotal,
              prizesRemaining,
              prizesAssigned: Math.max(prizesTotal - prizesRemaining, 0)
            }
          };
        });

        return res.json({ success: true, data });
      }

      if (path === '/api/store/campaigns' && method === 'POST') {
        if (!(await assertStoreCanManageCampaigns(storeId, res))) {
          return;
        }

        const validation = StoreCampaignSchema.safeParse(req.body);
        if (!validation.success) {
          return res.status(400).json({ success: false, errors: validation.error.errors });
        }

        const { startDate, endDate, ...data } = validation.data;
        const existingCampaign = await prisma.campaign.findFirst({
          where: { storeId, slug: data.slug }
        });

        if (existingCampaign) {
          return res.status(409).json({
            success: false,
            error: 'Esiste già una campagna con questo slug. Cambia il nome o lo slug link.'
          });
        }

        const campaign = await prisma.campaign.create({
          data: {
            ...data,
            storeId,
            prizes: [],
            startDate: new Date(startDate),
            endDate: new Date(endDate)
          } as any
        });

        return res.json({ success: true, data: campaign });
      }

      if (path.startsWith('/api/store/campaigns/') && method === 'PUT') {
        const parts = path.split('/');
        const campaignId = parts[4];

        if (parts.length === 5) {
          if (!(await assertStoreCanManageCampaigns(storeId, res))) {
            return;
          }

          const validation = StoreCampaignSchema.safeParse(req.body);
          if (!validation.success) {
            return res.status(400).json({ success: false, errors: validation.error.errors });
          }

          const { startDate, endDate, ...data } = validation.data;
          const existingCampaign = await prisma.campaign.findFirst({
            where: {
              storeId,
              slug: data.slug,
              NOT: { id: campaignId }
            }
          });

          if (existingCampaign) {
            return res.status(409).json({
              success: false,
              error: 'Esiste già un’altra campagna con questo slug. Scegli uno slug diverso.'
            });
          }

          await prisma.campaign.updateMany({
            where: { id: campaignId, storeId },
            data: {
              ...data,
              startDate: new Date(startDate),
              endDate: new Date(endDate)
            }
          });

          const probabilityError = await validateCampaignPrizeProbabilities(
            campaignId,
            Boolean(data.guaranteedWin)
          );
          if (probabilityError) {
            return res.status(400).json({ success: false, error: probabilityError });
          }

          const campaign = await prisma.campaign.findFirst({
            where: { id: campaignId, storeId }
          });

          return res.json({ success: true, data: campaign });
        }
      }

      if (path.match(/^\/api\/store\/campaigns\/[^/]+\/prizes$/) && method === 'POST') {
        if (!(await assertStoreCanManageCampaigns(storeId, res))) {
          return;
        }

        const campaignId = path.split('/')[4];
        const validation = PrizeSchema.safeParse(req.body);
        if (!validation.success) {
          return res.status(400).json({ success: false, errors: validation.error.errors });
        }

        const campaign = await prisma.campaign.findFirst({ where: { id: campaignId, storeId } });
        if (!campaign) {
          return res.status(404).json({ success: false, error: 'Campaign not found' });
        }

        const prize = await prisma.prize.create({
          data: {
            ...validation.data,
            campaignId,
            remainingQuantity: validation.data.remainingQuantity ?? validation.data.totalQuantity
          } as any
        });

        const probabilityError = await validateCampaignPrizeProbabilities(
          campaignId,
          campaign.guaranteedWin
        );
        if (probabilityError) {
          await prisma.prize.delete({ where: { id: prize.id } });
          return res.status(400).json({ success: false, error: probabilityError });
        }

        return res.json({ success: true, data: prize });
      }

      if (path.match(/^\/api\/store\/campaigns\/[^/]+\/prizes\/[^/]+$/) && method === 'PUT') {
        if (!(await assertStoreCanManageCampaigns(storeId, res))) {
          return;
        }

        const parts = path.split('/');
        const campaignId = parts[4];
        const prizeId = parts[6];
        const validation = PrizeSchema.safeParse(req.body);
        if (!validation.success) {
          return res.status(400).json({ success: false, errors: validation.error.errors });
        }

        const campaign = await prisma.campaign.findFirst({ where: { id: campaignId, storeId } });
        if (!campaign) {
          return res.status(404).json({ success: false, error: 'Campaign not found' });
        }

        await prisma.prize.updateMany({
          where: { id: prizeId, campaignId },
          data: {
            ...validation.data,
            remainingQuantity: validation.data.remainingQuantity ?? validation.data.totalQuantity
          }
        });
        const prize = await prisma.prize.findFirst({
          where: { id: prizeId, campaignId }
        });

        const probabilityError = await validateCampaignPrizeProbabilities(
          campaignId,
          campaign.guaranteedWin
        );
        if (probabilityError) {
          return res.status(400).json({ success: false, error: probabilityError });
        }

        return res.json({ success: true, data: prize });
      }

      if (path === '/api/store/participations' && method === 'GET') {
        const participations = await prisma.participation.findMany({
          take: ADMIN_LIST_LIMIT,
          where: { campaign: { storeId } },
          orderBy: { createdAt: 'desc' },
          include: {
            campaign: { select: { name: true } },
            prize: { select: { name: true, emoji: true } },
            voucher: { select: { code: true, redeemed: true, expiresAt: true } }
          }
        });

        return res.json({ success: true, data: participations });
      }

      if (path === '/api/store/vouchers' && method === 'GET') {
        const vouchers = await prisma.voucher.findMany({
          take: ADMIN_LIST_LIMIT,
          where: { storeId },
          orderBy: { createdAt: 'desc' },
          include: {
            campaign: { select: { name: true } },
            participation: { select: { customerData: true } }
          }
        });

        return res.json({ success: true, data: vouchers });
      }

      if (path === '/api/store/vouchers/validate' && method === 'POST') {
        const validation = RedeemVoucherSchema.safeParse(req.body);
        if (!validation.success) {
          return res.status(400).json({ success: false, errors: validation.error.errors });
        }

        const voucher = await prisma.voucher.findFirst({
          where: { code: validation.data.code, storeId },
          include: {
            campaign: { select: { name: true } },
            participation: { select: { customerData: true } }
          }
        });

        if (!voucher) {
          return res.status(404).json({ success: false, error: 'Voucher not found' });
        }

        const now = new Date();
        return res.json({
          success: true,
          data: {
            ...voucher,
            status: voucher.redeemed ? 'redeemed' : now > voucher.expiresAt ? 'expired' : 'valid'
          }
        });
      }

      if (path === '/api/store/vouchers/redeem' && method === 'POST') {
        const validation = RedeemVoucherSchema.safeParse(req.body);
        if (!validation.success) {
          return res.status(400).json({ success: false, errors: validation.error.errors });
        }

        const voucher = await prisma.voucher.findFirst({
          where: { code: validation.data.code, storeId }
        });

        if (!voucher) {
          return res.status(404).json({ success: false, error: 'Voucher not found' });
        }

        if (voucher.redeemed) {
          return res.status(400).json({ success: false, error: 'Voucher already redeemed' });
        }

        if (new Date() > voucher.expiresAt) {
          return res.status(400).json({ success: false, error: 'Voucher expired' });
        }

        const redeemed = await prisma.voucher.update({
          where: { id: voucher.id },
          data: {
            redeemed: true,
            redeemedAt: new Date(),
            redeemedByUserId: currentUser.id,
            redemptions: {
              create: {
                userId: currentUser.id,
                notes: validation.data.notes
              }
            }
          }
        });

        return res.json({ success: true, data: redeemed });
      }

      if (path === '/api/store/alerts' && method === 'GET') {
        const alerts = await prisma.alert.findMany({
          where: { storeId },
          orderBy: { createdAt: 'desc' },
          take: ADMIN_LIST_LIMIT
        });
        return res.json({ success: true, data: alerts });
      }

      if (path.startsWith('/api/store/alerts/') && path.endsWith('/read') && method === 'POST') {
        const alertId = path.split('/')[4];
        await prisma.alert.updateMany({
          where: { id: alertId, storeId },
          data: { readByStore: true }
        });
        return res.json({ success: true });
      }

      return res.status(404).json({ success: false, error: 'Not found' });
    }

    if (path.startsWith('/api/partner/')) {
      if (!currentUser || currentUser.role !== 'partner_owner' || !currentUser.partnerId) {
        return res.status(403).json({ success: false, error: 'Forbidden' });
      }

      const partner = await prisma.partner.findFirst({
        where: { id: currentUser.partnerId, active: true }
      });
      if (!partner) {
        return res.status(403).json({ success: false, error: 'Gestore non attivo.' });
      }

      if (path === '/api/partner/me' && method === 'GET') {
        return res.json({
          success: true,
          data: {
            user: {
              id: currentUser.id,
              email: currentUser.email,
              name: currentUser.name,
              role: currentUser.role,
              partnerId: currentUser.partnerId
            },
            partner
          }
        });
      }

      if (path === '/api/partner/stores' && method === 'GET') {
        const stores = await prisma.store.findMany({
          where: { partnerId: partner.id },
          take: ADMIN_LIST_LIMIT,
          orderBy: { createdAt: 'desc' },
          include: {
            _count: {
              select: {
                users: true,
                campaigns: true,
                vouchers: true
              }
            }
          }
        });

        return res.json({ success: true, data: stores });
      }

      if (path === '/api/partner/stores' && method === 'POST') {
        const validation = StoreSchema.omit({ partnerId: true }).safeParse(req.body);
        if (!validation.success) {
          return res.status(400).json({
            success: false,
            errors: validation.error.errors
          });
        }

        const { subscriptionExpiresAt, logoUrl, phone, address, ...storeData } = validation.data;
        const existingStore = await prisma.store.findUnique({ where: { slug: storeData.slug } });
        if (existingStore) {
          return res.status(409).json({ success: false, error: 'Esiste già un negozio con questo slug.' });
        }

        const store = await prisma.store.create({
          data: {
            ...storeData,
            partnerId: partner.id,
            phone: phone || null,
            address: address || null,
            logoUrl: logoUrl || null,
            subscriptionExpiresAt: subscriptionExpiresAt ? new Date(subscriptionExpiresAt) : null
          } as any
        });

        return res.json({ success: true, data: store });
      }

      if (path.startsWith('/api/partner/stores/') && method === 'PUT') {
        const storeId = path.split('/')[4];
        const validation = StoreUpdateSchema.omit({ partnerId: true }).safeParse(req.body);
        if (!validation.success) {
          return res.status(400).json({
            success: false,
            errors: validation.error.errors
          });
        }

        const existingOwnedStore = await prisma.store.findFirst({
          where: { id: storeId, partnerId: partner.id }
        });
        if (!existingOwnedStore) {
          return res.status(404).json({ success: false, error: 'Negozio non trovato.' });
        }

        const { subscriptionExpiresAt, logoUrl, phone, address, ...storeData } = validation.data;
        if (storeData.slug) {
          const existingStore = await prisma.store.findFirst({
            where: {
              slug: storeData.slug,
              id: { not: storeId }
            }
          });
          if (existingStore) {
            return res.status(409).json({ success: false, error: 'Esiste già un altro negozio con questo slug.' });
          }
        }

        const updateData: Record<string, unknown> = { ...storeData };
        if ('phone' in validation.data) updateData.phone = phone === '' ? null : phone;
        if ('address' in validation.data) updateData.address = address === '' ? null : address;
        if ('logoUrl' in validation.data) updateData.logoUrl = logoUrl === '' ? null : logoUrl;
        if ('subscriptionExpiresAt' in validation.data) {
          updateData.subscriptionExpiresAt = subscriptionExpiresAt ? new Date(subscriptionExpiresAt) : null;
        }

        const store = await prisma.store.update({
          where: { id: storeId },
          data: updateData as any
        });

        return res.json({ success: true, data: store });
      }

      if (path === '/api/partner/users' && method === 'GET') {
        const users = await prisma.user.findMany({
          where: {
            store: { partnerId: partner.id },
            role: { in: ['store_owner', 'staff'] }
          },
          take: ADMIN_LIST_LIMIT,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
            storeId: true,
            active: true,
            createdAt: true,
            store: { select: { name: true, slug: true } }
          }
        });

        return res.json({ success: true, data: users });
      }

      if (path === '/api/partner/users' && method === 'POST') {
        const validation = UserSchema.omit({ partnerId: true }).safeParse(req.body);
        if (!validation.success) {
          return res.status(400).json({
            success: false,
            errors: validation.error.errors
          });
        }

        const { password, storeId, ...userData } = validation.data;
        if (userData.role === 'partner_owner') {
          return res.status(400).json({ success: false, error: 'Il gestore non può creare altri gestori.' });
        }
        if (!storeId) {
          return res.status(400).json({ success: false, error: 'Seleziona un negozio.' });
        }
        const store = await prisma.store.findFirst({ where: { id: storeId, partnerId: partner.id } });
        if (!store) {
          return res.status(400).json({ success: false, error: 'Negozio non trovato.' });
        }

        const existingUser = await prisma.user.findUnique({ where: { email: userData.email } });
        if (existingUser) {
          return res.status(409).json({ success: false, error: 'Esiste già un utente con questa email.' });
        }

        const user = await prisma.user.create({
          data: {
            ...userData,
            email: userData.email.toLowerCase().trim(),
            storeId,
            partnerId: null,
            passwordHash: hashPassword(password)
          } as any,
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
            storeId: true,
            active: true,
            createdAt: true,
            store: { select: { name: true, slug: true } }
          }
        });

        return res.json({ success: true, data: user });
      }

      return res.status(404).json({ success: false, error: 'Not found' });
    }

    if (path.startsWith('/api/admin/')) {
      if (!isAdmin) {
        return res.status(403).json({ success: false, error: 'Forbidden' });
      }

      if (path === '/api/admin/stores' && method === 'GET') {
        const stores = await prisma.store.findMany({
          take: ADMIN_LIST_LIMIT,
          orderBy: { createdAt: 'desc' },
          include: {
            partner: { select: { id: true, name: true, email: true } },
            _count: {
              select: {
                users: true,
                campaigns: true,
                vouchers: true,
                alerts: true
              }
            }
          }
        });

        return res.json({ success: true, data: stores });
      }

      if (path === '/api/admin/partners' && method === 'GET') {
        const partners = await prisma.partner.findMany({
          take: ADMIN_LIST_LIMIT,
          orderBy: { createdAt: 'desc' },
          include: {
            _count: {
              select: {
                stores: true,
                users: true
              }
            }
          }
        });

        return res.json({ success: true, data: partners });
      }

      if (path === '/api/admin/partners' && method === 'POST') {
        const validation = PartnerSchema.safeParse(req.body);
        if (!validation.success) {
          return res.status(400).json({
            success: false,
            errors: validation.error.errors
          });
        }

        const { phone, logoUrl, ...partnerData } = validation.data;
        const email = partnerData.email.toLowerCase().trim();
        const existingPartner = await prisma.partner.findUnique({ where: { email } });
        if (existingPartner) {
          return res.status(409).json({ success: false, error: 'Esiste già un gestore con questa email.' });
        }

        const partner = await prisma.partner.create({
          data: {
            name: partnerData.name,
            email,
            active: partnerData.active,
            phone: phone || null,
            logoUrl: logoUrl || null
          }
        });

        return res.json({ success: true, data: partner });
      }

      if (path.startsWith('/api/admin/partners/') && method === 'PUT') {
        const partnerId = path.split('/')[4];
        const validation = PartnerUpdateSchema.safeParse(req.body);
        if (!validation.success) {
          return res.status(400).json({
            success: false,
            errors: validation.error.errors
          });
        }

        const { phone, logoUrl, ...partnerData } = validation.data;
        if (partnerData.email) {
          partnerData.email = partnerData.email.toLowerCase().trim();
          const existingPartner = await prisma.partner.findFirst({
            where: {
              email: partnerData.email,
              id: { not: partnerId }
            }
          });
          if (existingPartner) {
            return res.status(409).json({ success: false, error: 'Esiste già un altro gestore con questa email.' });
          }
        }

        const updateData: Record<string, unknown> = { ...partnerData };
        if ('phone' in validation.data) {
          updateData.phone = phone === '' ? null : phone;
        }
        if ('logoUrl' in validation.data) {
          updateData.logoUrl = logoUrl === '' ? null : logoUrl;
        }

        const partner = await prisma.partner.update({
          where: { id: partnerId },
          data: updateData as any
        });

        return res.json({ success: true, data: partner });
      }

      if (path === '/api/admin/stores' && method === 'POST') {
        const validation = StoreSchema.safeParse(req.body);
        if (!validation.success) {
          return res.status(400).json({
            success: false,
            errors: validation.error.errors
          });
        }

        const { subscriptionExpiresAt, logoUrl, phone, address, partnerId, ...storeData } = validation.data;
        const existingStore = await prisma.store.findUnique({
          where: { slug: storeData.slug }
        });

        if (existingStore) {
          return res.status(409).json({
            success: false,
            error: 'Esiste già un negozio con questo slug.'
          });
        }

        if (partnerId) {
          const partner = await prisma.partner.findUnique({ where: { id: partnerId } });
          if (!partner) {
            return res.status(400).json({ success: false, error: 'Gestore non trovato.' });
          }
        }

        const store = await prisma.store.create({
          data: {
            ...storeData,
            partnerId: partnerId || undefined,
            phone: phone || undefined,
            address: address || undefined,
            logoUrl: logoUrl || undefined,
            subscriptionExpiresAt: subscriptionExpiresAt ? new Date(subscriptionExpiresAt) : undefined
          } as any
        });

        return res.json({ success: true, data: store });
      }

      if (path.startsWith('/api/admin/stores/') && method === 'PUT') {
        const storeId = path.split('/')[4];
        const validation = StoreUpdateSchema.safeParse(req.body);
        if (!validation.success) {
          return res.status(400).json({
            success: false,
            errors: validation.error.errors
          });
        }

        const { subscriptionExpiresAt, logoUrl, phone, address, partnerId, ...storeData } = validation.data;
        if (storeData.slug) {
          const existingStore = await prisma.store.findFirst({
            where: {
              slug: storeData.slug,
              id: { not: storeId }
            }
          });

          if (existingStore) {
            return res.status(409).json({
              success: false,
              error: 'Esiste già un altro negozio con questo slug.'
            });
          }
        }

        if (partnerId) {
          const partner = await prisma.partner.findUnique({ where: { id: partnerId } });
          if (!partner) {
            return res.status(400).json({ success: false, error: 'Gestore non trovato.' });
          }
        }

        const updateData: Record<string, unknown> = { ...storeData };
        if ('partnerId' in validation.data) {
          updateData.partnerId = partnerId || null;
        }
        if ('phone' in validation.data) {
          updateData.phone = phone === '' ? null : phone;
        }
        if ('address' in validation.data) {
          updateData.address = address === '' ? null : address;
        }
        if ('logoUrl' in validation.data) {
          updateData.logoUrl = logoUrl === '' ? null : logoUrl;
        }
        if ('subscriptionExpiresAt' in validation.data) {
          updateData.subscriptionExpiresAt = subscriptionExpiresAt ? new Date(subscriptionExpiresAt) : null;
        }

        const store = await prisma.store.update({
          where: { id: storeId },
          data: updateData as any
        });

        return res.json({ success: true, data: store });
      }

      if (path === '/api/admin/users' && method === 'GET') {
        const users = await prisma.user.findMany({
          take: ADMIN_LIST_LIMIT,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
            storeId: true,
            partnerId: true,
            active: true,
            createdAt: true,
            store: { select: { name: true, slug: true } },
            partner: { select: { name: true, email: true } }
          }
        });

        return res.json({ success: true, data: users });
      }

      if (path === '/api/admin/users' && method === 'POST') {
        const validation = UserSchema.safeParse(req.body);
        if (!validation.success) {
          return res.status(400).json({
            success: false,
            errors: validation.error.errors
          });
        }

        const { password, storeId, partnerId, ...userData } = validation.data;
        if (userData.role === 'partner_owner') {
          if (!partnerId) {
            return res.status(400).json({ success: false, error: 'Seleziona un gestore per questo utente.' });
          }
          const partner = await prisma.partner.findUnique({ where: { id: partnerId } });
          if (!partner) {
            return res.status(400).json({ success: false, error: 'Gestore non trovato.' });
          }
        } else {
          if (!storeId) {
            return res.status(400).json({ success: false, error: 'Seleziona un negozio per questo utente.' });
          }
          const store = await prisma.store.findUnique({ where: { id: storeId } });
          if (!store) {
            return res.status(400).json({ success: false, error: 'Negozio non trovato.' });
          }
        }

        const existingUser = await prisma.user.findUnique({ where: { email: userData.email } });
        if (existingUser) {
          return res.status(409).json({
            success: false,
            error: 'Esiste già un utente con questa email.'
          });
        }

        const user = await prisma.user.create({
          data: {
            ...userData,
            email: userData.email.toLowerCase().trim(),
            storeId: userData.role === 'partner_owner' ? null : storeId,
            partnerId: userData.role === 'partner_owner' ? partnerId : null,
            passwordHash: hashPassword(password)
          } as any,
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
            storeId: true,
            partnerId: true,
            active: true,
            createdAt: true,
            store: { select: { name: true, slug: true } },
            partner: { select: { name: true, email: true } }
          }
        });

        return res.json({ success: true, data: user });
      }

      if (path.startsWith('/api/admin/users/') && method === 'PUT') {
        const userId = path.split('/')[4];
        const validation = UserUpdateSchema.safeParse(req.body);
        if (!validation.success) {
          return res.status(400).json({
            success: false,
            errors: validation.error.errors
          });
        }

        const { password, storeId, partnerId, ...userData } = validation.data;
        if (userData.email) {
          userData.email = userData.email.toLowerCase().trim();
          const existingUser = await prisma.user.findFirst({
            where: {
              email: userData.email,
              id: { not: userId }
            }
          });

          if (existingUser) {
            return res.status(409).json({
              success: false,
              error: 'Esiste già un altro utente con questa email.'
            });
          }
        }

        if (userData.role === 'partner_owner' || partnerId) {
          const nextPartnerId = partnerId || undefined;
          if (!nextPartnerId) {
            return res.status(400).json({ success: false, error: 'Seleziona un gestore per questo utente.' });
          }
          const partner = await prisma.partner.findUnique({ where: { id: nextPartnerId } });
          if (!partner) {
            return res.status(400).json({ success: false, error: 'Gestore non trovato.' });
          }
        }

        if ((userData.role === 'store_owner' || userData.role === 'staff' || storeId) && userData.role !== 'partner_owner') {
          const nextStoreId = storeId || undefined;
          if (!nextStoreId) {
            return res.status(400).json({ success: false, error: 'Seleziona un negozio per questo utente.' });
          }
          const store = await prisma.store.findUnique({ where: { id: nextStoreId } });
          if (!store) {
            return res.status(400).json({ success: false, error: 'Negozio non trovato.' });
          }
        }

        const relationData: Record<string, unknown> = {};
        if ('role' in validation.data || 'storeId' in validation.data || 'partnerId' in validation.data) {
          const isPartnerUser = userData.role === 'partner_owner' || Boolean(partnerId);
          relationData.storeId = isPartnerUser ? null : storeId || null;
          relationData.partnerId = isPartnerUser ? partnerId || null : null;
        }

        const user = await prisma.user.update({
          where: { id: userId },
          data: {
            ...userData,
            ...relationData,
            ...(password ? { passwordHash: hashPassword(password) } : {})
          } as any,
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
            storeId: true,
            partnerId: true,
            active: true,
            createdAt: true,
            store: { select: { name: true, slug: true } },
            partner: { select: { name: true, email: true } }
          }
        });

        return res.json({ success: true, data: user });
      }

      if (path === '/api/admin/campaigns' && method === 'GET') {
        const campaigns = await prisma.campaign.findMany({
          take: ADMIN_LIST_LIMIT,
          orderBy: { createdAt: 'desc' },
          include: {
            store: { select: { name: true, slug: true } }
          }
        });

        return res.json({
          success: true,
          data: campaigns.map((campaign) => ({
            id: campaign.id,
            name: campaign.name,
            slug: campaign.slug,
            storeName: campaign.store.name,
            storeSlug: campaign.store.slug,
            active: campaign.active,
            startDate: campaign.startDate,
            endDate: campaign.endDate,
            maxPlaysPerUser: campaign.maxPlaysPerUser,
            createdAt: campaign.createdAt
          }))
        });
      }

      if (path === '/api/admin/participations' && method === 'GET') {
        const participations = await prisma.participation.findMany({
          take: ADMIN_LIST_LIMIT,
          orderBy: { createdAt: 'desc' },
          include: {
            campaign: { select: { name: true } }
          }
        });

        return res.json({
          success: true,
          data: participations.map((participation) => ({
            id: participation.id,
            email: participation.email,
            clientIp: participation.clientIp,
            sessionKey: participation.sessionKey,
            campaignId: participation.campaignId,
            campaignName: participation.campaign.name,
            createdAt: participation.createdAt
          }))
        });
      }

      if (path === '/api/admin/vouchers' && method === 'GET') {
        const vouchers = await prisma.voucher.findMany({
          take: ADMIN_LIST_LIMIT,
          orderBy: { createdAt: 'desc' },
          include: {
            campaign: { select: { name: true } }
          }
        });

        return res.json({
          success: true,
          data: vouchers.map((voucher) => {
            const prize = voucher.prize as Prize;
            return {
              id: voucher.id,
              code: voucher.code,
              email: voucher.email,
              prizeName: prize?.name ?? '—',
              prizeEmoji: prize?.emoji ?? '',
              redeemed: voucher.redeemed,
              expiresAt: voucher.expiresAt,
              campaignName: voucher.campaign.name,
              createdAt: voucher.createdAt
            };
          })
        });
      }

      if (path === '/api/admin/alerts' && method === 'GET') {
        const alerts = await prisma.alert.findMany({
          take: ADMIN_LIST_LIMIT,
          orderBy: { createdAt: 'desc' },
          include: {
            store: { select: { name: true, slug: true } },
            campaign: { select: { name: true, slug: true } }
          }
        });

        return res.json({ success: true, data: alerts });
      }

      if (path.startsWith('/api/admin/alerts/') && path.endsWith('/read') && method === 'POST') {
        const alertId = path.split('/')[4];
        await prisma.alert.updateMany({
          where: { id: alertId },
          data: { readByAdmin: true }
        });
        return res.json({ success: true });
      }

      return res.status(404).json({ success: false, error: 'Not found' });
    }

    if (path === '/api/stores' && method === 'GET') {
      if (!isAdmin) {
        return res.status(403).json({ success: false, error: 'Forbidden' });
      }
      const stores = await prisma.store.findMany({ orderBy: { createdAt: 'desc' } });
      return res.json({ success: true, data: stores });
    }

    if (path === '/api/stores' && method === 'POST') {
      if (!isAdmin) {
        return res.status(403).json({ success: false, error: 'Forbidden' });
      }

      const validation = StoreSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({
          success: false,
          errors: validation.error.errors
        });
      }

      const { subscriptionExpiresAt, ...storeData } = validation.data;
      const store = await prisma.store.create({
        data: {
          ...storeData,
          logoUrl: storeData.logoUrl || undefined,
          subscriptionExpiresAt: subscriptionExpiresAt ? new Date(subscriptionExpiresAt) : undefined
        } as any
      });
      return res.json({ success: true, data: store });
    }

    if (path.startsWith('/api/stores/') && method === 'DELETE') {
      if (!isAdmin) {
        return res.status(403).json({ success: false, error: 'Forbidden' });
      }

      const id = path.split('/').pop();
      if (id) {
        await prisma.store.deleteMany({ where: { id } });
      }
      return res.json({ success: true });
    }

    if (path === '/api/users' && method === 'GET') {
      if (!isAdmin) {
        return res.status(403).json({ success: false, error: 'Forbidden' });
      }
      const users = await prisma.user.findMany({
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          storeId: true,
          createdAt: true
        },
        orderBy: { createdAt: 'desc' }
      });
      return res.json({ success: true, data: users });
    }

    if (path === '/api/users' && method === 'POST') {
      if (!isAdmin) {
        return res.status(403).json({ success: false, error: 'Forbidden' });
      }
      const validation = UserSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({
          success: false,
          errors: validation.error.errors
        });
      }

      const { password, ...userData } = validation.data;
      const user = await prisma.user.create({
        data: {
          ...userData,
          passwordHash: hashPassword(password)
        } as any,
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          storeId: true,
          createdAt: true
        }
      });

      return res.json({ success: true, data: user });
    }

    if (path === '/api/campaigns' && method === 'GET') {
      if (!isAdmin) {
        return res.status(403).json({ success: false, error: 'Forbidden' });
      }
      const storeId = url.searchParams.get('storeId');
      const campaigns = await prisma.campaign.findMany({
        where: storeId ? { storeId } : undefined,
        orderBy: { createdAt: 'desc' }
      });
      return res.json({ success: true, data: campaigns });
    }

    if (path === '/api/campaigns' && method === 'POST') {
      if (!isAdmin) {
        return res.status(403).json({ success: false, error: 'Forbidden' });
      }
      const validation = CampaignSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({
          success: false,
          errors: validation.error.errors
        });
      }

      const { startDate, endDate, ...rest } = validation.data;
      const campaign = await prisma.campaign.create({
        data: {
          ...rest,
          startDate: new Date(startDate),
          endDate: new Date(endDate)
        } as any
      });
      return res.json({ success: true, data: campaign });
    }

    if (path.startsWith('/api/campaigns/') && method === 'DELETE') {
      if (!isAdmin) {
        return res.status(403).json({ success: false, error: 'Forbidden' });
      }
      const id = path.split('/').pop();
      if (id) {
        await prisma.campaign.deleteMany({ where: { id } });
      }
      return res.json({ success: true });
    }

    if (path.startsWith('/api/stats/')) {
      if (!isAdmin) {
        return res.status(403).json({ success: false, error: 'Forbidden' });
      }
      const storeId = path.split('/').pop();
      if (!storeId) {
        return res.status(400).json({ success: false, error: 'Store id required' });
      }

      const storeCampaigns = await prisma.campaign.findMany({
        where: { storeId },
        select: { id: true }
      });
      const campaignIds = storeCampaigns.map((c) => c.id);

      const [totalPlays, totalVouchers, redeemedVouchers] = await Promise.all([
        prisma.participation.count({ where: { campaignId: { in: campaignIds } } }),
        prisma.voucher.count({ where: { storeId } }),
        prisma.voucher.count({ where: { storeId, redeemed: true } })
      ]);

      return res.json({
        success: true,
        data: {
          totalPlays,
          totalVouchers,
          redeemedVouchers,
          pendingVouchers: totalVouchers - redeemedVouchers
        }
      });
    }

    return res.status(404).json({
      success: false,
      error: 'Not found'
    });
  } catch (error: unknown) {
    console.error('API Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      message
    });
  }
}
