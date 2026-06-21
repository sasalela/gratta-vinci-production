import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { createHash } from 'crypto';
import QRCode from 'qrcode';
import { prisma } from '../lib/db';

// ==========================================
// SCHEMAS
// ==========================================

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6)
});

const StoreSchema = z.object({
  name: z.string().min(1),
  slug: z.string().regex(/^[a-z0-9-]+$/),
  email: z.string().email(),
  phone: z.string().optional(),
  address: z.string().optional(),
  logoUrl: z.string().url().optional().or(z.literal('')),
  primaryColor: z.string().default('#667eea'),
  secondaryColor: z.string().default('#764ba2'),
  subscriptionExpiresAt: z.string().optional(),
  active: z.boolean().default(true)
});

const StoreUpdateSchema = StoreSchema.partial();

const UserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().min(1),
  role: z.enum(['store_owner', 'staff']),
  storeId: z.string(),
  active: z.boolean().default(true)
});

const UserUpdateSchema = UserSchema.partial();

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
  gameType: z.string().default('scratch_card'),
  customerFields: z.array(CustomerFieldSchema).default([]),
  playLimitMode: z.enum(['per_campaign', 'per_day']).default('per_campaign'),
  loseMessage: z.string().min(1).default('Nessun premio questa volta.'),
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

function hashPassword(password: string): string {
  return createHash('sha256').update(password).digest('hex');
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

async function getCurrentUser(token: string | null) {
  if (!token || !token.startsWith('mock-token-')) {
    return null;
  }

  const userId = token.replace('mock-token-', '');
  return prisma.user.findFirst({
    where: { id: userId, active: true }
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

async function pickInventoryPrize(campaignId: string) {
  const prizes = await prisma.prize.findMany({
    where: {
      campaignId,
      active: true,
      remainingQuantity: { gt: 0 },
      winProbability: { gt: 0 }
    },
    orderBy: { createdAt: 'asc' }
  });

  const random = Math.random() * 100;
  let cumulative = 0;

  for (const prize of prizes) {
    cumulative += prize.winProbability;
    if (random <= cumulative) {
      const updated = await prisma.prize.updateMany({
        where: {
          id: prize.id,
          remainingQuantity: { gt: 0 }
        },
        data: {
          remainingQuantity: { decrement: 1 }
        }
      });

      if (updated.count === 1) {
        return prize;
      }
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
      const hashedPassword = hashPassword(password);
      const adminEmail = process.env.ADMIN_EMAIL || 'admin@grattavinci.it';
      const adminPassword = hashPassword(process.env.ADMIN_PASSWORD || 'admin123');

      if (email === adminEmail && hashedPassword === adminPassword) {
        return res.json({
          success: true,
          data: {
            token: 'mock-super-admin-token',
            user: { email: adminEmail, role: 'super_admin' }
          }
        });
      }

      const user = await prisma.user.findFirst({
        where: { email, passwordHash: hashedPassword, active: true }
      });

      if (!user) {
        return res.status(401).json({
          success: false,
          error: 'Invalid credentials'
        });
      }

      return res.json({
        success: true,
        data: {
          token: `mock-token-${user.id}`,
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
            storeId: user.storeId
          }
        }
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
              name: true,
              emoji: true,
              description: true,
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
            name: prize.name,
            emoji: prize.emoji,
            description: prize.description,
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

      const selectedPrize = await pickInventoryPrize(campaign.id);
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

    const isAdmin = token.includes('super-admin');
    const currentUser = await getCurrentUser(token);
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

        return res.json({
          success: true,
          data: {
            user: {
              id: currentUser.id,
              email: currentUser.email,
              name: currentUser.name,
              role: currentUser.role
            },
            store
          }
        });
      }

      if (path === '/api/store/campaigns' && method === 'GET') {
        const campaigns = await prisma.campaign.findMany({
          where: { storeId },
          orderBy: { createdAt: 'desc' },
          include: {
            prizeItems: { orderBy: { createdAt: 'asc' } },
            _count: {
              select: {
                participations: true,
                vouchers: true
              }
            }
          }
        });

        return res.json({ success: true, data: campaigns });
      }

      if (path === '/api/store/campaigns' && method === 'POST') {
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
          const campaign = await prisma.campaign.findFirst({
            where: { id: campaignId, storeId }
          });

          return res.json({ success: true, data: campaign });
        }
      }

      if (path.match(/^\/api\/store\/campaigns\/[^/]+\/prizes$/) && method === 'POST') {
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

        return res.json({ success: true, data: prize });
      }

      if (path.match(/^\/api\/store\/campaigns\/[^/]+\/prizes\/[^/]+$/) && method === 'PUT') {
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

    if (path.startsWith('/api/admin/')) {
      if (!isAdmin) {
        return res.status(403).json({ success: false, error: 'Forbidden' });
      }

      if (path === '/api/admin/stores' && method === 'GET') {
        const stores = await prisma.store.findMany({
          take: ADMIN_LIST_LIMIT,
          orderBy: { createdAt: 'desc' },
          include: {
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

      if (path === '/api/admin/stores' && method === 'POST') {
        const validation = StoreSchema.safeParse(req.body);
        if (!validation.success) {
          return res.status(400).json({
            success: false,
            errors: validation.error.errors
          });
        }

        const { subscriptionExpiresAt, logoUrl, phone, address, ...storeData } = validation.data;
        const existingStore = await prisma.store.findUnique({
          where: { slug: storeData.slug }
        });

        if (existingStore) {
          return res.status(409).json({
            success: false,
            error: 'Esiste già un negozio con questo slug.'
          });
        }

        const store = await prisma.store.create({
          data: {
            ...storeData,
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

        const { subscriptionExpiresAt, logoUrl, phone, address, ...storeData } = validation.data;
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

        const updateData: Record<string, unknown> = { ...storeData };
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
            active: true,
            createdAt: true,
            store: { select: { name: true, slug: true } }
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

        const { password, ...userData } = validation.data;
        const store = await prisma.store.findUnique({ where: { id: userData.storeId } });
        if (!store) {
          return res.status(400).json({ success: false, error: 'Negozio non trovato.' });
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

      if (path.startsWith('/api/admin/users/') && method === 'PUT') {
        const userId = path.split('/')[4];
        const validation = UserUpdateSchema.safeParse(req.body);
        if (!validation.success) {
          return res.status(400).json({
            success: false,
            errors: validation.error.errors
          });
        }

        const { password, ...userData } = validation.data;
        if (userData.email) {
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

        const user = await prisma.user.update({
          where: { id: userId },
          data: {
            ...userData,
            ...(password ? { passwordHash: hashPassword(password) } : {})
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
