import { describe, expect, it } from 'vitest';
import { definitivelyRejected, needsSol, needsSolMessage, neverSubmitted } from '../src/lib/chain-errors';
import { publishListingDocuments } from '../src/lib/listing-publication';

const OWNER_ERROR = 'Simulation failed. Message: Transaction simulation failed: Attempt to debit an account but found no record of a prior credit.. Logs: []. Catch the `SendTransactionError` and call `getLogs()` on it for full details.';

describe('chain errors', () => {
  it('recognises an empty fee wallet', () => {
    expect(needsSol(new Error(OWNER_ERROR))).toBe(true);
    expect(needsSol('Transfer: insufficient lamports 0, need 5000')).toBe(true);
    expect(needsSol('Your wallet does not hold enough USDC')).toBe(false);
  });
  it('treats failed simulations as never sent, and keeps lost responses pending', () => {
    expect(neverSubmitted(new Error(OWNER_ERROR))).toBe(true);
    expect(neverSubmitted('Transaction simulation failed: custom program error')).toBe(true);
    expect(definitivelyRejected(new Error(OWNER_ERROR))).toBe(true);
    expect(definitivelyRejected('HTTP 403 denied')).toBe(true);
    expect(definitivelyRejected('network timeout')).toBe(false);
  });
  it('tells the user what to do with their address', () => {
    const text = needsSolMessage('AyYaN3qECb8SL3Y9eYNVKkFdwiWd91NyWrGskf5Djaeq');
    expect(text).toContain('AyYaN3qECb8SL3Y9eYNVKkFdwiWd91NyWrGskf5Djaeq');
    expect(text).toMatch(/SOL/);
    expect(text).not.toMatch(/simulation|getLogs/i);
    expect(needsSolMessage(null)).toContain('the wallet you signed in with');
  });
});
