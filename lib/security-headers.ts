/**
 * Headers applied to API responses. The same list is copied into vercel.json
 * so static pages receive them too.
 *
 * style-src keeps 'unsafe-inline' because the game sets style attributes and
 * CSS variables from shop colors. script-src stays on 'self' (PDF library is local).
 */
export const SECURITY_HEADERS: Array<{ key: string; value: string }> = [
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "connect-src 'self'",
      "media-src 'self' blob:",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "frame-src 'none'"
    ].join('; ')
  },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains'
  },
  {
    key: 'X-Content-Type-Options',
    value: 'nosniff'
  },
  {
    key: 'Referrer-Policy',
    value: 'strict-origin-when-cross-origin'
  },
  {
    key: 'X-Frame-Options',
    value: 'DENY'
  },
  {
    key: 'Permissions-Policy',
    value: 'camera=(self), microphone=(), geolocation=(), payment=()'
  }
];

export function applySecurityHeaders(res: { setHeader(name: string, value: string): void }): void {
  for (const header of SECURITY_HEADERS) {
    res.setHeader(header.key, header.value);
  }
}
