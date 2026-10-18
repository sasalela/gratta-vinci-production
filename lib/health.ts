import { isDatabaseConfigured } from './db';

export type HealthBody = {
  status: 'ok' | 'degraded';
  database: 'connected' | 'unavailable';
  code?: 'DB_UNAVAILABLE';
};

export type HealthReport = {
  httpStatus: number;
  body: HealthBody;
};

function unavailable(): HealthReport {
  return {
    httpStatus: 503,
    body: {
      status: 'degraded',
      database: 'unavailable',
      code: 'DB_UNAVAILABLE'
    }
  };
}

export async function checkDatabaseHealth(probe: () => Promise<unknown>): Promise<HealthReport> {
  if (!isDatabaseConfigured()) {
    console.error('[health] DATABASE_URL is not set');
    return unavailable();
  }

  try {
    await probe();
    return {
      httpStatus: 200,
      body: {
        status: 'ok',
        database: 'connected'
      }
    };
  } catch (error) {
    console.error('[health] database probe failed', error);
    return unavailable();
  }
}
