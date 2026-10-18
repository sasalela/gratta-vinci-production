export type StaffDenial = {
  status: 403;
  code: 'FORBIDDEN';
  error: string;
};

/**
 * Staff may only validate or redeem prize codes.
 * Store owners are not restricted here. Admin and partner routes keep their own role checks.
 */
export function staffAccessDecision(role: string, method: string, path: string): StaffDenial | null {
  if (role !== 'staff') return null;

  const normalized = path.split('?')[0].replace(/\/+$/, '') || '/';
  const allowed =
    (method === 'POST' && normalized === '/api/store/vouchers/validate') ||
    (method === 'POST' && normalized === '/api/store/vouchers/redeem');

  if (allowed) return null;

  return {
    status: 403,
    code: 'FORBIDDEN',
    error: 'Puoi solo controllare e riscattare i codici premio.'
  };
}
