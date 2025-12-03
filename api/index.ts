import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { createHash } from 'crypto';

// ==========================================
// IN-MEMORY STORAGE (sostituisci con DB in produzione)
// ==========================================

const stores: any[] = [
  {
    id: '1',
    name: 'Bar da Giorgio',
    slug: 'bar-giorgio',
    email: 'bar@giorgio.it',
    active: true,
    createdAt: new Date().toISOString()
  }
];

const users: any[] = [];
const campaigns: any[] = [
  {
    id: '1',
    storeId: '1',
    name: 'Birra Gratis',
    slug: 'birra-gratis',
    description: 'Gratta e vinci una birra gratis!',
    prizes: [
      { name: 'Birra Gratis', emoji: '🍺', probability: 50, description: 'Una birra omaggio' },
      { name: 'Riprova', emoji: '😢', probability: 50, description: 'Riprova la prossima volta' }
    ],
    active: true,
    startDate: '2024-01-01',
    endDate: '2025-12-31',
    maxPlaysPerUser: 1,
    createdAt: new Date().toISOString()
  }
];
const sessions: any[] = [];
const vouchers: any[] = [];

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

// ==========================================
// UTILITIES
// ==========================================

function generateId(): string {
  return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

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

function selectPrize(prizes: any[]): any {
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

// ==========================================
// MAIN HANDLER
// ==========================================

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Content-Type', 'application/json');

  // Handle preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const url = new URL(req.url!, `http://${req.headers.host}`);
  const path = url.pathname;
  const method = req.method;

  try {
    console.log(`[${method}] ${path}`);

    // ==========================================
    // PUBLIC ROUTES
    // ==========================================

    // Health Check
    if (path === '/api/health') {
      return res.json({
        status: 'ok',
        version: '2.0.0',
        timestamp: new Date().toISOString()
      });
    }

    // Login
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
      
      // Check super admin
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
      
      // Check database users
      const user = users.find((u: any) => u.email === email && u.password === hashedPassword);
      
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

    // Play Game
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
      
      // Get client IP
      const clientIp = req.headers['x-forwarded-for'] || 
                       req.headers['x-real-ip'] || 
                       'unknown';
      
      // Find store
      const store = stores.find((s: any) => s.slug === storeSlug);
      if (!store) {
        return res.status(404).json({
          success: false,
          error: 'Store not found'
        });
      }
      
      // Find campaign
      const campaign = campaigns.find((c: any) => 
        c.storeId === store.id && c.slug === campaignSlug && c.active
      );
      
      if (!campaign) {
        return res.status(404).json({
          success: false,
          error: 'Campaign not found'
        });
      }
      
      // Check date range
      const now = new Date();
      const startDate = new Date(campaign.startDate);
      const endDate = new Date(campaign.endDate);
      
      if (now < startDate || now > endDate) {
        return res.status(400).json({
          success: false,
          error: 'Campaign not active'
        });
      }
      
      // Check previous plays
      const sessionKey = `${clientIp}_${campaign.id}`;
      const previousSessions = sessions.filter((s: any) => s.sessionKey === sessionKey);
      
      if (previousSessions.length >= campaign.maxPlaysPerUser) {
        return res.status(429).json({
          success: false,
          error: 'Maximum plays reached'
        });
      }
      
      // Select prize
      const selectedPrize = selectPrize(campaign.prizes);
      
      // Generate voucher
      const voucherCode = generateVoucherCode();
      const sessionId = generateId();
      const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
      
      // Save session
      sessions.push({
        id: sessionId,
        sessionKey,
        campaignId: campaign.id,
        email,
        clientIp: typeof clientIp === 'string' ? clientIp : clientIp[0],
        createdAt: now.toISOString()
      });
      
      // Save voucher
      vouchers.push({
        id: generateId(),
        code: voucherCode,
        sessionId,
        campaignId: campaign.id,
        storeId: store.id,
        prize: selectedPrize,
        email,
        redeemed: false,
        expiresAt,
        createdAt: now.toISOString()
      });
      
      return res.json({
        success: true,
        data: {
          sessionId,
          prize: selectedPrize,
          voucherCode,
          expiresAt
        }
      });
    }

    // ==========================================
    // PROTECTED ROUTES
    // ==========================================

    const token = getAuthToken(req);
    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized'
      });
    }

    // Mock auth - in produzione usa JWT vero
    const isAdmin = token.includes('super-admin');
    const userId = token.replace('mock-token-', '');

    // Stores
    if (path === '/api/stores' && method === 'GET') {
      if (!isAdmin) {
        return res.status(403).json({ success: false, error: 'Forbidden' });
      }
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
      
      const store = {
        id: generateId(),
        ...validation.data,
        createdAt: new Date().toISOString()
      };
      
      stores.push(store);
      return res.json({ success: true, data: store });
    }

    if (path.startsWith('/api/stores/') && method === 'DELETE') {
      if (!isAdmin) {
        return res.status(403).json({ success: false, error: 'Forbidden' });
      }
      
      const id = path.split('/').pop();
      const index = stores.findIndex((s: any) => s.id === id);
      if (index !== -1) {
        stores.splice(index, 1);
      }
      return res.json({ success: true });
    }

    // Users
    if (path === '/api/users' && method === 'GET') {
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
      
      const hashedPassword = hashPassword(validation.data.password);
      const user = {
        id: generateId(),
        ...validation.data,
        password: hashedPassword,
        createdAt: new Date().toISOString()
      };
      
      users.push(user);
      
      const { password, ...userWithoutPassword } = user;
      return res.json({ success: true, data: userWithoutPassword });
    }

    // Campaigns
    if (path === '/api/campaigns' && method === 'GET') {
      const storeId = url.searchParams.get('storeId');
      let filteredCampaigns = campaigns;
      
      if (storeId) {
        filteredCampaigns = campaigns.filter((c: any) => c.storeId === storeId);
      }
      
      return res.json({ success: true, data: filteredCampaigns });
    }

    if (path === '/api/campaigns' && method === 'POST') {
      const validation = CampaignSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({
          success: false,
          errors: validation.error.errors
        });
      }
      
      const campaign = {
        id: generateId(),
        ...validation.data,
        createdAt: new Date().toISOString()
      };
      
      campaigns.push(campaign);
      return res.json({ success: true, data: campaign });
    }

    if (path.startsWith('/api/campaigns/') && method === 'DELETE') {
      const id = path.split('/').pop();
      const index = campaigns.findIndex((c: any) => c.id === id);
      if (index !== -1) {
        campaigns.splice(index, 1);
      }
      return res.json({ success: true });
    }

    // Stats
    if (path.startsWith('/api/stats/')) {
      const storeId = path.split('/').pop();
      const storeSessions = sessions.filter((s: any) => {
        const campaign = campaigns.find((c: any) => c.id === s.campaignId);
        return campaign && campaign.storeId === storeId;
      });
      
      const storeVouchers = vouchers.filter((v: any) => v.storeId === storeId);
      
      return res.json({
        success: true,
        data: {
          totalPlays: storeSessions.length,
          totalVouchers: storeVouchers.length,
          redeemedVouchers: storeVouchers.filter((v: any) => v.redeemed).length,
          pendingVouchers: storeVouchers.filter((v: any) => !v.redeemed).length
        }
      });
    }

    // 404
    return res.status(404).json({
      success: false,
      error: 'Not found'
    });

  } catch (error: any) {
    console.error('API Error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message
    });
  }
}
