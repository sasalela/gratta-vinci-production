/**
 * Prize stock is computed only on the server.
 * Client payloads must not choose remainingQuantity.
 */
export function initialRemainingQuantity(totalQuantity: number): number {
  if (!Number.isFinite(totalQuantity)) return 0;
  return Math.max(0, Math.floor(totalQuantity));
}

export function adjustedRemainingQuantity(
  existing: { totalQuantity: number; remainingQuantity: number },
  nextTotalQuantity: number
): number {
  const nextTotal = initialRemainingQuantity(nextTotalQuantity);
  const issued = Math.max(0, existing.totalQuantity - existing.remainingQuantity);
  return Math.max(0, nextTotal - issued);
}
