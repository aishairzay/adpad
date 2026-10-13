const SCALE = 1_000_000n;

/** Convert a human USDC amount without floating-point rounding. */
export function parseUsdc(input: string): number {
  const value = input.trim();
  if (!/^(0|[1-9]\d*)(\.\d{1,6})?$/.test(value)) {
    throw new Error('Enter a positive USDC amount with at most 6 decimal places.');
  }
  const [whole, fraction = ''] = value.split('.');
  const micro = BigInt(whole) * SCALE + BigInt(fraction.padEnd(6, '0'));
  if (micro <= 0n || micro > 100_000_000_000n) throw new Error('Amount must be between 0.000001 and 100,000 USDC.');
  return Number(micro);
}

export function formatUsdc(micro: number): string {
  if (!Number.isSafeInteger(micro) || micro < 0) return '—';
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 6 }).format(micro / 1_000_000);
}

export function validateProofUrl(input: string): string {
  const url = new URL(input.trim());
  if (url.protocol !== 'https:' || url.username || url.password) {
    throw new Error('Evidence must be a public HTTPS link without embedded credentials.');
  }
  if (url.href.length > 250) throw new Error('Keep the evidence URL under 250 characters.');
  return url.href;
}

export function receiptState(receipt: Record<string, unknown> | null): 'pending' | 'failed' | 'complete' {
  if (!receipt) return 'pending';
  if (receipt._error_message) return 'failed';
  return typeof receipt._transaction_hash === 'string' && receipt._transaction_hash.length > 0 && receipt._hook_completed === receipt._transaction_hash ? 'complete' : 'pending';
}
