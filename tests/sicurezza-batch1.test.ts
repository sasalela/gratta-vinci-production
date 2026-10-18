import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import handler from '../api/index';
import { staffAccessDecision } from '../lib/access';
import { toPublicError } from '../lib/errors';
import { executeRedeem, generateVoucherCode } from '../lib/game-flow';
import { checkDatabaseHealth } from '../lib/health';
import { createMailer } from '../lib/mailer';
import { adjustedRemainingQuantity, initialRemainingQuantity } from '../lib/prize-stock';
import { AUTH_LIMITS, createRateLimiter, resetAuthRateLimits } from '../lib/rate-limit';
import { SECURITY_HEADERS } from '../lib/security-headers';
import {
  buildVerificationEmail,
  hashVerificationToken,
  isVerificationRecordUsable,
  verificationExpiry
} from '../lib/verification';
import { createMemoryGameDb } from './helpers/memory-db';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

let envLock: Promise<void> = Promise.resolve();

function exclusive<T>(fn: () => Promise<T>): Promise<T> {
  const run = envLock.then(fn, fn);
  envLock = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

const SENSITIVE = /database_url|direct_url|jwt_secret|auth_secret|prisma|p1001|postgresql:\/\/|postgres:\/\/|environment variable|stack trace|node_modules|invocation|scrypt\$|\n\s+at\s+/i;

function voucher(overrides: Record<string, unknown> = {}) {
  return {
    id: 'voucher_1',
    code: 'RACECODE1',
    campaignId: 'camp_1',
    storeId: 'store_1',
    email: 'giocatore@test.it',
    prize: { id: 'prize_1', name: 'Birra', emoji: '🍺', description: null },
    redeemed: false,
    redeemedAt: null,
    redeemedByUserId: null,
    expiresAt: new Date('2026-12-31T00:00:00.000Z'),
    participationId: 'part_1',
    ...overrides
  };
}

type MockResult = {
  statusCode: number;
  payload: any;
  headers: Record<string, string>;
};

async function invoke(
  method: string,
  path: string,
  body?: unknown,
  headers: Record<string, string> = {}
): Promise<MockResult> {
  const req: any = {
    method,
    url: path,
    headers: { host: 'localhost', ...headers },
    body,
    cookies: {}
  };
  const stored: Record<string, string> = {};
  let statusCode = 200;
  let payload: any = null;
  const res: any = {
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(data: any) {
      payload = data;
      return this;
    },
    send(data: any) {
      payload = data;
      return this;
    },
    end() {
      return this;
    },
    setHeader(name: string, value: string) {
      stored[name] = value;
      return this;
    },
    getHeader(name: string) {
      return stored[name];
    }
  };
  await handler(req, res);
  return { statusCode, payload, headers: stored };
}

describe('rate limit', () => {
  it('blocca dopo il limite e si riapre a finestra scaduta', () => {
    const limiter = createRateLimiter({ limit: 2, windowMs: 1000 });
    assert.equal(limiter.check('login:1', 0).allowed, true);
    assert.equal(limiter.check('login:1', 10).allowed, true);
    const blocked = limiter.check('login:1', 20);
    assert.equal(blocked.allowed, false);
    assert.ok(blocked.retryAfterSeconds >= 1);
    assert.equal(limiter.check('login:1', 1001).allowed, true);
  });

  it('login, registrazione, conferma e reinvio rispondono 429 senza dettagli interni', async () => exclusive(async () => {
    resetAuthRateLimits();
    const previousUrl = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    try {
      const loginIp = '203.0.113.10';
      for (let i = 0; i < AUTH_LIMITS.login.limit; i += 1) {
        const response = await invoke(
          'POST',
          '/api/auth/login',
          { email: 'rate-limit@example.com', password: 'secret12' },
          { 'x-forwarded-for': loginIp }
        );
        assert.notEqual(response.statusCode, 429);
        assert.equal(SENSITIVE.test(JSON.stringify(response.payload)), false);
      }
      const loginBlocked = await invoke(
        'POST',
        '/api/auth/login',
        { email: 'rate-limit@example.com', password: 'secret12' },
        { 'x-forwarded-for': loginIp }
      );
      assert.equal(loginBlocked.statusCode, 429);
      assert.equal(loginBlocked.payload.code, 'RATE_LIMITED');
      assert.ok(Number(loginBlocked.headers['Retry-After']) >= 1);
      assert.equal(SENSITIVE.test(JSON.stringify(loginBlocked.payload)), false);

      const registerIp = '203.0.113.20';
      for (let i = 0; i < AUTH_LIMITS.register.limit; i += 1) {
        const response = await invoke('POST', '/api/auth/register-store', {}, { 'x-forwarded-for': registerIp });
        assert.equal(response.statusCode, 400);
      }
      const registerBlocked = await invoke('POST', '/api/auth/register-store', {}, { 'x-forwarded-for': registerIp });
      assert.equal(registerBlocked.statusCode, 429);
      assert.equal(registerBlocked.payload.code, 'RATE_LIMITED');

      const verifyIp = '203.0.113.30';
      for (let i = 0; i < AUTH_LIMITS.verify.limit; i += 1) {
        const response = await invoke(
          'POST',
          '/api/auth/verify-email',
          { token: 'short' },
          { 'x-forwarded-for': verifyIp }
        );
        assert.equal(response.statusCode, 400);
        assert.equal(response.payload.code, 'VERIFICATION_INVALID');
      }
      const verifyBlocked = await invoke(
        'POST',
        '/api/auth/verify-email',
        { token: 'short' },
        { 'x-forwarded-for': verifyIp }
      );
      assert.equal(verifyBlocked.statusCode, 429);
      assert.equal(verifyBlocked.payload.code, 'RATE_LIMITED');

      const resendIp = '203.0.113.40';
      for (let i = 0; i < AUTH_LIMITS.resend.limit; i += 1) {
        const response = await invoke('POST', '/api/auth/resend-verification', {}, { 'x-forwarded-for': resendIp });
        assert.equal(response.statusCode, 400);
      }
      const resendBlocked = await invoke('POST', '/api/auth/resend-verification', {}, { 'x-forwarded-for': resendIp });
      assert.equal(resendBlocked.statusCode, 429);
      assert.equal(resendBlocked.payload.code, 'RATE_LIMITED');
      assert.equal(SENSITIVE.test(JSON.stringify(resendBlocked.payload)), false);
    } finally {
      if (previousUrl === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = previousUrl;
      resetAuthRateLimits();
    }
  }));
});

describe('riscatto atomico', () => {
  it('due riscatto concorrenti: uno solo va a buon fine', async () => {
    const db = createMemoryGameDb({ vouchers: [voucher()] });
    let reads = 0;
    const waiting: Array<() => void> = [];
    const realFind = db.voucher.findFirst.bind(db.voucher);
    db.voucher.findFirst = async (args: any) => {
      const row = await realFind(args);
      const snapshot = row ? { ...row } : null;
      reads += 1;
      if (reads < 2) {
        await new Promise<void>((resolve) => waiting.push(resolve));
      } else {
        waiting.splice(0).forEach((release) => release());
      }
      return snapshot;
    };

    const [first, second] = await Promise.all([
      executeRedeem({
        db,
        code: 'RACECODE1',
        storeId: 'store_1',
        userId: 'user_a',
        now: new Date('2026-06-23T12:00:00.000Z')
      }),
      executeRedeem({
        db,
        code: 'RACECODE1',
        storeId: 'store_1',
        userId: 'user_b',
        now: new Date('2026-06-23T12:00:00.000Z')
      })
    ]);

    const kinds = [first.kind, second.kind].sort();
    assert.deepEqual(kinds, ['already_redeemed', 'ok']);
    assert.equal(db._state.vouchers[0].redeemed, true);
    assert.equal(db._state.redemptions.length, 1);
  });

  it('il codice voucher non usa Math.random', () => {
    const original = Math.random;
    Math.random = () => {
      throw new Error('Math.random used');
    };
    try {
      const codes = new Set<string>();
      for (let i = 0; i < 20; i += 1) {
        const code = generateVoucherCode();
        assert.match(code, /^[A-Z0-9]{8}-[A-F0-9]{8}$/);
        codes.add(code);
      }
      assert.equal(codes.size, 20);
    } finally {
      Math.random = original;
    }
  });
});

describe('permessi staff', () => {
  const denied = [
    ['PUT', '/api/store/me'],
    ['POST', '/api/store/campaigns'],
    ['PUT', '/api/store/campaigns/camp_1'],
    ['POST', '/api/store/campaigns/camp_1/prizes'],
    ['PUT', '/api/store/campaigns/camp_1/prizes/prize_1'],
    ['POST', '/api/store/composer/apply'],
    ['POST', '/api/store/subscription/request'],
    ['GET', '/api/store/campaigns'],
    ['GET', '/api/store/vouchers'],
    ['POST', '/api/partner/users'],
    ['POST', '/api/admin/users']
  ] as const;

  for (const [method, path] of denied) {
    it(`staff non può ${method} ${path}`, () => {
      const decision = staffAccessDecision('staff', method, path);
      assert.ok(decision);
      assert.equal(decision?.status, 403);
      assert.equal(decision?.code, 'FORBIDDEN');
      assert.equal(SENSITIVE.test(decision?.error || ''), false);
    });
  }

  it('staff può validare e riscattare; il titolare non è bloccato da questa guardia', () => {
    assert.equal(staffAccessDecision('staff', 'POST', '/api/store/vouchers/validate'), null);
    assert.equal(staffAccessDecision('staff', 'POST', '/api/store/vouchers/redeem'), null);
    assert.equal(staffAccessDecision('store_owner', 'POST', '/api/store/campaigns'), null);
    assert.equal(staffAccessDecision('store_owner', 'PUT', '/api/store/me'), null);
  });

  it('la guardia è applicata sulle route del negozio', () => {
    const source = readFileSync(join(root, 'api/index.ts'), 'utf8');
    assert.match(source, /staffAccessDecision\(currentUser\.role/);
  });
});

describe('errori e health', () => {
  it('sanitizza errori Prisma e di configurazione', () => {
    const nasty = new Error(
      "Invalid `prisma.user.findFirst()` invocation. Environment variable not found: DATABASE_URL. postgresql://user:secret@db.internal:5432/app"
    );
    nasty.name = 'PrismaClientInitializationError';
    (nasty as { code?: string }).code = 'P1001';
    (nasty as { stack?: string }).stack = 'PrismaClientInitializationError\n    at Object.query (/app/node_modules/prisma/runtime.js:1:1)';

    const result = toPublicError(nasty);
    const serialized = JSON.stringify(result.body);
    assert.equal(result.status, 503);
    assert.equal(result.body.code, 'DB_UNAVAILABLE');
    assert.equal(result.body.success, false);
    assert.equal(SENSITIVE.test(serialized), false);
    assert.equal(serialized.includes('secret'), false);
    assert.equal(serialized.includes('db.internal'), false);
    assert.equal('message' in result.body, false);
    assert.equal('stack' in result.body, false);

    const generic = toPublicError(new Error('JWT_SECRET or AUTH_SECRET must be configured'));
    assert.equal(generic.status, 500);
    assert.equal(generic.body.code, 'INTERNAL_ERROR');
    assert.equal(JSON.stringify(generic.body).includes('JWT_SECRET'), false);
  });

  it('health senza database non rivela dettagli', async () => exclusive(async () => {
    const previousUrl = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    try {
      const health = await checkDatabaseHealth(async () => {
        throw new Error('probe should not run');
      });
      assert.equal(health.httpStatus, 503);
      assert.equal(health.body.database, 'unavailable');
      assert.equal(health.body.code, 'DB_UNAVAILABLE');
      assert.equal(SENSITIVE.test(JSON.stringify(health.body)), false);

      const response = await invoke('GET', '/api/health');
      assert.equal(response.statusCode, 503);
      assert.deepEqual(response.payload, {
        status: 'degraded',
        database: 'unavailable',
        code: 'DB_UNAVAILABLE'
      });
      for (const header of SECURITY_HEADERS) {
        assert.equal(response.headers[header.key], header.value);
      }
    } finally {
      if (previousUrl === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = previousUrl;
    }
  }));

  it('health con probe fallita non inoltra host o errori Prisma', async () => exclusive(async () => {
    const previousUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = 'postgresql://ci:ci@127.0.0.1:1/ci';
    try {
      const health = await checkDatabaseHealth(async () => {
        const error = new Error("Can't reach database server at `db.internal.example:5432`");
        error.name = 'PrismaClientInitializationError';
        (error as { code?: string }).code = 'P1001';
        throw error;
      });
      const serialized = JSON.stringify(health.body);
      assert.equal(health.httpStatus, 503);
      assert.equal(health.body.database, 'unavailable');
      assert.equal(serialized.includes('db.internal'), false);
      assert.equal(serialized.includes('P1001'), false);
      assert.equal(serialized.includes('postgresql'), false);
    } finally {
      if (previousUrl === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = previousUrl;
    }
  }));

  it('il login senza database non restituisce l’errore interno', async () => exclusive(async () => {
    resetAuthRateLimits();
    const previousUrl = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    try {
      const response = await invoke(
        'POST',
        '/api/auth/login',
        { email: 'owner@example.com', password: 'secret12' },
        { 'x-forwarded-for': '203.0.113.77' }
      );
      assert.equal(response.statusCode, 503);
      assert.equal(response.payload.code, 'DB_UNAVAILABLE');
      assert.deepEqual(Object.keys(response.payload).sort(), ['code', 'error', 'success']);
      assert.equal(JSON.stringify(response.payload).includes('secret12'), false);
      assert.equal(SENSITIVE.test(JSON.stringify(response.payload)), false);
    } finally {
      if (previousUrl === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = previousUrl;
      resetAuthRateLimits();
    }
  }));
});

describe('stock e conferme', () => {
  it('la quantità residua è calcolata dal server, non dal client', () => {
    assert.equal(initialRemainingQuantity(12), 12);
    assert.equal(initialRemainingQuantity(-3), 0);
    assert.equal(
      adjustedRemainingQuantity({ totalQuantity: 10, remainingQuantity: 7 }, 20),
      17
    );
    assert.equal(
      adjustedRemainingQuantity({ totalQuantity: 10, remainingQuantity: 7 }, 2),
      0
    );
    const source = readFileSync(join(root, 'api/index.ts'), 'utf8');
    assert.equal(/remainingQuantity:\s*z\./.test(source), false);
    assert.match(source, /initialRemainingQuantity\(validation\.data\.totalQuantity\)/);
    assert.match(source, /adjustedRemainingQuantity\(existingPrize, validation\.data\.totalQuantity\)/);
  });

  it('il token di conferma scade ed è solo un hash; il mailer di default è la console', async () => {
    const expires = verificationExpiry(1_000, { EMAIL_VERIFICATION_TTL_HOURS: '24' });
    assert.equal(expires.getTime(), 1_000 + 24 * 60 * 60 * 1000);
    assert.equal(isVerificationRecordUsable({ usedAt: null, expiresAt: expires }, new Date(expires.getTime() - 1)), true);
    assert.equal(isVerificationRecordUsable({ usedAt: null, expiresAt: expires }, expires), false);
    assert.equal(isVerificationRecordUsable({ usedAt: new Date(), expiresAt: expires }, new Date(0)), false);

    const hash = hashVerificationToken('token-segreto');
    assert.notEqual(hash, 'token-segreto');
    assert.equal(hashVerificationToken('token-segreto'), hash);

    const message = buildVerificationEmail({
      to: 'negozio@example.com',
      verifyUrl: 'https://example.test/register.html?verify=abc'
    });
    assert.match(message.text, /register\.html\?verify=abc/);
    assert.equal(SENSITIVE.test(JSON.stringify(message)), false);

    const logs: string[] = [];
    const original = console.info;
    console.info = (...args: unknown[]) => {
      logs.push(args.map(String).join(' '));
    };
    try {
      const mailer = createMailer({});
      assert.equal(mailer.name, 'console');
      await mailer.send(message);
    } finally {
      console.info = original;
    }
    assert.match(logs.join('\n'), /\[mailer:console\].*negozio@example.com/);
  });
});

describe('header e PDF locale', () => {
  it('vercel.json replica gli header di sicurezza e non carica jsPDF da CDN', () => {
    const config = JSON.parse(readFileSync(join(root, 'vercel.json'), 'utf8'));
    assert.deepEqual(config.headers[0].headers, SECURITY_HEADERS);
    const csp = SECURITY_HEADERS.find((header) => header.key === 'Content-Security-Policy')?.value || '';
    assert.match(csp, /script-src 'self'/);
    assert.match(csp, /frame-ancestors 'none'/);
    assert.equal(csp.includes('unsafe-eval'), false);
    assert.equal(csp.includes('cdn.jsdelivr.net'), false);

    const html = readFileSync(join(root, 'content.html'), 'utf8');
    assert.match(html, /vendor\/jspdf\.umd\.min\.js/);
    assert.equal(html.includes('cdn.jsdelivr.net'), false);
    assert.equal(readFileSync(join(root, 'vendor/jspdf.umd.min.js'), 'utf8').includes('jsPDF'), true);
  });
});
