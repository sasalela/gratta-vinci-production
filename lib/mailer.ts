export type OutboundEmail = {
  to: string;
  subject: string;
  text: string;
};

export type Mailer = {
  readonly name: 'resend' | 'webhook' | 'console';
  send(message: OutboundEmail): Promise<void>;
};

type MailEnv = NodeJS.ProcessEnv;

function trim(value: string | undefined): string {
  return typeof value === 'string' ? value.trim() : '';
}

async function assertOk(response: Response): Promise<void> {
  if (response.ok) return;
  const failure = new Error('Mail provider rejected the message');
  (failure as { code?: string }).code = 'MAIL_FAILED';
  throw failure;
}

export function createMailer(env: MailEnv = process.env): Mailer {
  const from = trim(env.MAIL_FROM);
  const resendKey = trim(env.RESEND_API_KEY);
  const webhook = trim(env.MAIL_WEBHOOK_URL);

  if (resendKey && from) {
    return {
      name: 'resend',
      async send(message) {
        const response = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${resendKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            from,
            to: [message.to],
            subject: message.subject,
            text: message.text
          })
        });
        await assertOk(response);
      }
    };
  }

  if (webhook) {
    return {
      name: 'webhook',
      async send(message) {
        const response = await fetch(webhook, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: from || undefined,
            to: message.to,
            subject: message.subject,
            text: message.text
          })
        });
        await assertOk(response);
      }
    };
  }

  return {
    name: 'console',
    async send(message) {
      console.info(`[mailer:console] to=${message.to} subject=${message.subject}\n${message.text}`);
    }
  };
}
