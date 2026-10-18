export type PublicErrorBody = {
  success: false;
  error: string;
  code: string;
};

const DATABASE_CODES = new Set([
  'DB_UNAVAILABLE',
  'P1000',
  'P1001',
  'P1002',
  'P1017',
  'P2024'
]);

function errorText(error: unknown): string {
  if (error instanceof Error) return `${error.name} ${error.message}`;
  return typeof error === 'string' ? error : '';
}

export function isDatabaseFailure(error: unknown): boolean {
  const code = typeof (error as { code?: unknown })?.code === 'string'
    ? (error as { code: string }).code
    : '';
  if (DATABASE_CODES.has(code)) return true;

  const name = error instanceof Error ? error.name : '';
  if (name === 'DatabaseUnavailableError' || name === 'PrismaClientInitializationError') {
    return true;
  }

  return /can't reach database server|server has closed the connection|connection refused|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|Environment variable not found|database is not available|timeout exceeded/i.test(errorText(error));
}

/**
 * Log the real failure server-side and return a stable public body.
 * The body never includes exception text, stack traces, Prisma codes or env details.
 */
export function toPublicError(error: unknown): { status: number; body: PublicErrorBody } {
  console.error('[api] request failed', error);

  if (isDatabaseFailure(error)) {
    return {
      status: 503,
      body: {
        success: false,
        error: 'Servizio temporaneamente non disponibile.',
        code: 'DB_UNAVAILABLE'
      }
    };
  }

  return {
    status: 500,
    body: {
      success: false,
      error: 'Si è verificato un errore. Riprova tra poco.',
      code: 'INTERNAL_ERROR'
    }
  };
}
