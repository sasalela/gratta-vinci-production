type HeaderValue = string | string[] | undefined;

function firstHeader(value: HeaderValue): string {
  if (Array.isArray(value)) return value[0] || '';
  return value || '';
}

export function resolveAppBaseUrl(req: { headers: Record<string, HeaderValue> }): string {
  const configured = process.env.APP_BASE_URL?.trim();
  if (configured) return configured.replace(/\/$/, '');

  const host = firstHeader(req.headers['x-forwarded-host']) || firstHeader(req.headers.host) || 'localhost';
  const proto = firstHeader(req.headers['x-forwarded-proto']).split(',')[0].trim() || 'https';
  return `${proto}://${host}`;
}
