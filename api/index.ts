// src/index.ts - Backend Multi-Tenant Completo
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

interface Env {
  DB: D1Database;
  JWT_SECRET: string;
  KV: KVNamespace;
}

// ========== VALIDATION SCHEMAS ==========
const StoreSchema = z.object({
  name: z.string().min(1).max(100),
  slug: z.string().regex(/^[a-z0-9-]+$/),
  email: z.string().email(),
  phone: z.string().optional(),
  address: z.string().optional(),
  logo: z.string().optional(),
  active: z.boolean().default(true)
});

const StoreUserSchema = z.object({
  storeId: z.string(),
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string(),
  role: z.enum(['owner', 'manager', 'staff']).default('staff')
});

const CampaignSchema = z.object({
  storeId: z.string(),
  name: z.string().min(1).max(100),
  slug: z.string().regex(/^[a-z0-9-]+$/),
  description: z.string().optional(),
  requiredFields: z.array(z.enum(['name', 'phone', 'age'])),
  prizes: z.array(z.object({
    name: z.string(),
    emoji: z.string(),
    probability: z.number().min(0).max(100),
    description: z.string(),
    quantity: z.number().optional()
  })),
  active: z.boolean().default(true),
  startDate: z.string(),
  endDate: z.string(),
  maxPlaysPerDay: z.number().optional(),
  maxTotalPlays: z.number().optional()
});

const app = new Hono<{ Bindings: Env }>();

app.use('*', cors({
  origin: '*',
  credentials: true,
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization']
}));

// ========== AUTH HELPERS ==========
function signToken(payload: any, secret: string): string {
  return jwt.sign(payload, secret, { algorithm: 'HS256', expiresIn: '7d' });
}

function verifyToken(token: string, secret: string): any {
  return jwt.verify(token, secret, { algorithms: ['HS256'] });
}

async function authMiddleware(c: any, next: any) {
  try {
    const token = c.req.header('Authorization')?.replace('Bearer ', '');
    if (!token) return c.json({ error: 'No token' }, 401);

    const decoded = verifyToken(token, c.env.JWT_SECRET);
    c.set('user', decoded);
    await next();
  } catch (error) {
    return c.json({ error: 'Invalid token' }, 401);
  }
}

function generateId(): string {
  return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// ========== DATABASE INIT ==========
async function initDatabase(db: D1Database) {
  const tables = [
    `CREATE TABLE IF NOT EXISTS stores (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL,
      phone TEXT,
      address TEXT,
      logo TEXT,
      active INTEGER DEFAULT 1,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    )`,

    `CREATE TABLE IF NOT EXISTS store_users (
      id TEXT PRIMARY KEY,
      storeId TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      passwordHash TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      active INTEGER DEFAULT 1,
      createdAt TEXT NOT NULL,
      lastLogin TEXT,
      FOREIGN KEY (storeId) REFERENCES stores(id)
    )`,

    `CREATE TABLE IF NOT EXISTS campaigns (
      id TEXT PRIMARY KEY,
      storeId TEXT NOT NULL,
      name TEXT NOT NULL,
      slug TEXT NOT NULL,
      description TEXT,
      requiredFields TEXT NOT NULL,
      prizes TEXT NOT NULL,
      qrCode TEXT,
      active INTEGER DEFAULT 1,
      startDate TEXT NOT NULL,
      endDate TEXT NOT NULL,
      maxPlaysPerDay INTEGER,
      maxTotalPlays INTEGER,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      UNIQUE(storeId, slug),
      FOREIGN KEY (storeId) REFERENCES stores(id)
    )`,

    `CREATE TABLE IF NOT EXISTS game_sessions (
      id TEXT PRIMARY KEY,
      campaignId TEXT NOT NULL,
      storeId TEXT NOT NULL,
      ipAddress TEXT NOT NULL,
      userEmail TEXT NOT NULL,
      userData TEXT NOT NULL,
      prizeWon TEXT,
      voucherCode TEXT UNIQUE,
      playedAt TEXT NOT NULL,
      voucherRedeemed INTEGER DEFAULT 0,
      FOREIGN KEY (campaignId) REFERENCES campaigns(id),
      FOREIGN KEY (storeId) REFERENCES stores(id),
      UNIQUE(ipAddress, campaignId)
    )`,

    `CREATE TABLE IF NOT EXISTS ip_restrictions (
      id TEXT PRIMARY KEY,
      ipAddress TEXT NOT NULL,
      campaignId TEXT NOT NULL,
      storeId TEXT NOT NULL,
      sessionId TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      UNIQUE(ipAddress, campaignId),
      FOREIGN KEY (campaignId) REFERENCES campaigns(id),
      FOREIGN KEY (storeId) REFERENCES stores(id)
    )`,

    `CREATE TABLE IF NOT EXISTS vouchers (
      code TEXT PRIMARY KEY,
      campaignId TEXT NOT NULL,
      storeId TEXT NOT NULL,
      sessionId TEXT NOT NULL,
      prizeDescription TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      expiresAt TEXT NOT NULL,
      redeemed INTEGER DEFAULT 0,
      redeemedAt TEXT,
      redeemedBy TEXT,
      FOREIGN KEY (campaignId) REFERENCES campaigns(id),
      FOREIGN KEY (storeId) REFERENCES stores(id)
    )`,

    `CREATE TABLE IF NOT EXISTS admin_users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      passwordHash TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT DEFAULT 'admin',
      active INTEGER DEFAULT 1,
      createdAt TEXT NOT NULL
    )`,

    `CREATE INDEX IF NOT EXISTS idx_stores_slug ON stores(slug)`,
    `CREATE INDEX IF NOT EXISTS idx_campaigns_store ON campaigns(storeId)`,
    `CREATE INDEX IF NOT EXISTS idx_sessions_store ON game_sessions(storeId)`,
    `CREATE INDEX IF NOT EXISTS idx_sessions_campaign ON game_sessions(campaignId)`,
    `CREATE INDEX IF NOT EXISTS idx_vouchers_store ON vouchers(storeId)`
  ];

  for (const sql of tables) {
    await db.prepare(sql).run();
  }
}

// ========== SUPER ADMIN AUTH ==========
app.post('/api/admin/login', async (c) => {
  try {
    const { email, password } = await c.req.json();

    const admin = await c.env.DB.prepare(
      'SELECT * FROM admin_users WHERE email = ? AND active = 1'
    ).bind(email).first();

    if (!admin || !await bcrypt.compare(password, admin.passwordHash)) {
      return c.json({ success: false, error: 'Invalid credentials' }, 401);
    }

    const token = signToken({
      id: admin.id,
      email: admin.email,
      role: 'superadmin'
    }, c.env.JWT_SECRET);

    return c.json({
      success: true,
      token,
      user: { id: admin.id, email: admin.email, name: admin.name, role: 'superadmin' }
    });
  } catch (error) {
    return c.json({ success: false, error: 'Login failed' }, 500);
  }
});

// ========== STORE MANAGEMENT (SUPER ADMIN ONLY) ==========
app.get('/api/admin/stores', authMiddleware, async (c) => {
  try {
    const user = c.get('user');
    if (user.role !== 'superadmin') {
      return c.json({ error: 'Unauthorized' }, 403);
    }

    const stores = await c.env.DB.prepare(
      'SELECT * FROM stores ORDER BY createdAt DESC'
    ).all();

    return c.json({ success: true, data: stores.results });
  } catch (error) {
    return c.json({ success: false, error: 'Failed to fetch stores' }, 500);
  }
});

app.post('/api/admin/stores', authMiddleware, async (c) => {
  try {
    const user = c.get('user');
    if (user.role !== 'superadmin') {
      return c.json({ error: 'Unauthorized' }, 403);
    }

    const body = await c.req.json();
    const validation = StoreSchema.safeParse(body);

    if (!validation.success) {
      return c.json({ success: false, errors: validation.error.errors }, 400);
    }

    const { data } = validation;
    const id = generateId();
    const now = new Date().toISOString();

    await c.env.DB.prepare(
      `INSERT INTO stores (id, name, slug, email, phone, address, logo, active, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      id, data.name, data.slug, data.email,
      data.phone || null, data.address || null, data.logo || null,
      data.active ? 1 : 0, now, now
    ).run();

    return c.json({ success: true, data: { id, ...data } }, 201);
  } catch (error) {
    return c.json({ success: false, error: 'Failed to create store' }, 500);
  }
});

export default app;
