import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { createHash } from 'crypto';
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
  active: z.boolean().default(true)
});

const UserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().min(1),
  role: z.enum(['store_owner', 'staff']),
  storeId: z.string()
});

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
  email: z.string().email(),
  privacyConsent: z.boolean()
});

type Prize = {
  name: string;
  emoji: string;
  probability: number;
  description: string;
};

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
        where: { email, passwordHash: hashedPassword }
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

    if (path === '/api/public/play' && method === 'POST') {
      const validation = PlaySchema.safeParse(req.body);

      if (!validation.success) {
        return res.status(400).json({
          success: false,
          errors: validation.error.errors
        });
      }

      const { storeSlug, campaignSlug, email, privacyConsent } = validation.data;

      if (!privacyConsent) {
        return res.status(400).json({
          success: false,
          error: 'Privacy consent required'
        });
      }

      const clientIp = getClientIp(req);

      const store = await prisma.store.findFirst({
        where: { slug: storeSlug, active: true }
      });

      if (!store) {
        return res.status(404).json({
          success: false,
          error: 'Store not found'
        });
      }

      const campaign = await prisma.campaign.findFirst({
        where: {
          storeId: store.id,
          slug: campaignSlug,
          active: true
        }
      });

      if (!campaign) {
        return res.status(404).json({
          success: false,
          error: 'Campaign not found'
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

      const sessionKey = `${clientIp}_${campaign.id}`;
      const previousPlays = await prisma.participation.count({
        where: { sessionKey, campaignId: campaign.id }
      });

      if (previousPlays >= campaign.maxPlaysPerUser) {
        return res.status(429).json({
          success: false,
          error: 'Maximum plays reached'
        });
      }

      const prizes = parsePrizes(campaign.prizes);
      const selectedPrize = selectPrize(prizes);
      const voucherCode = generateVoucherCode();
      const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

      const participation = await prisma.participation.create({
        data: {
          sessionKey,
          campaignId: campaign.id,
          email,
          clientIp,
          voucher: {
            create: {
              code: voucherCode,
              campaignId: campaign.id,
              storeId: store.id,
              prize: selectedPrize,
              email,
              expiresAt
            }
          }
        },
        include: { voucher: true }
      });

      return res.json({
        success: true,
        data: {
          sessionId: participation.id,
          prize: selectedPrize,
          voucherCode: participation.voucher!.code,
          expiresAt: participation.voucher!.expiresAt.toISOString()
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

      const store = await prisma.store.create({ data: validation.data });
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
      const validation = UserSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({
          success: false,
          errors: validation.error.errors
        });
      }

      const user = await prisma.user.create({
        data: {
          ...validation.data,
          passwordHash: hashPassword(validation.data.password)
        },
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
      const storeId = url.searchParams.get('storeId');
      const campaigns = await prisma.campaign.findMany({
        where: storeId ? { storeId } : undefined,
        orderBy: { createdAt: 'desc' }
      });
      return res.json({ success: true, data: campaigns });
    }

    if (path === '/api/campaigns' && method === 'POST') {
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
        }
      });
      return res.json({ success: true, data: campaign });
    }

    if (path.startsWith('/api/campaigns/') && method === 'DELETE') {
      const id = path.split('/').pop();
      if (id) {
        await prisma.campaign.deleteMany({ where: { id } });
      }
      return res.json({ success: true });
    }

    if (path.startsWith('/api/stats/')) {
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
