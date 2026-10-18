import { createHash, randomBytes } from 'node:crypto';
import type { OutboundEmail } from './mailer';

const DEFAULT_TTL_HOURS = 24;

export function verificationTtlMs(env: NodeJS.ProcessEnv = process.env): number {
  const parsed = Number(env.EMAIL_VERIFICATION_TTL_HOURS);
  const hours = Number.isFinite(parsed) && parsed > 0 && parsed <= 168 ? parsed : DEFAULT_TTL_HOURS;
  return hours * 60 * 60 * 1000;
}

export function verificationExpiry(now = Date.now(), env?: NodeJS.ProcessEnv): Date {
  return new Date(now + verificationTtlMs(env));
}

export function newVerificationToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashVerificationToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function isVerificationRecordUsable(
  record: { usedAt: Date | null; expiresAt: Date },
  now = new Date()
): boolean {
  return !record.usedAt && record.expiresAt.getTime() > now.getTime();
}

export function buildVerificationEmail(params: { to: string; verifyUrl: string }): OutboundEmail {
  return {
    to: params.to,
    subject: 'Conferma il tuo account',
    text: [
      'Ciao,',
      '',
      'conferma l’email del negozio per attivare l’accesso:',
      params.verifyUrl,
      '',
      'Il link scade dopo alcune ore. Se non hai creato tu l’account, ignora questo messaggio.'
    ].join('\n')
  };
}
