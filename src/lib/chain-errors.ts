// Plain-language handling for Solana errors raised while the SDK submits a
// wallet-signed write (publishing, editing or closing a listing).

const textOf = (error: unknown) => (error instanceof Error ? error.message : String(error ?? ''));

/**
 * The paying wallet holds no SOL. "Attempt to debit an account but found no
 * record of a prior credit" is Solana's answer when the fee payer account has
 * never received SOL; the others are the same shortfall in other words.
 */
export function needsSol(error: unknown): boolean {
  return /no record of a prior credit|insufficient lamports|insufficient funds for (fee|rent)|AccountNotFound/i.test(textOf(error));
}

/**
 * The transaction failed its pre-send simulation, so it was never broadcast and
 * nothing can land later. Safe to retry with the same id.
 */
export function neverSubmitted(error: unknown): boolean {
  return needsSol(error) || /transaction simulation failed/i.test(textOf(error));
}

/** A definitive refusal (HTTP rejection or failed simulation): retrying the same id is safe. */
export function definitivelyRejected(error: unknown): boolean {
  return /\b(400|401|403|422)\b/.test(textOf(error)) || neverSubmitted(error);
}

export function needsSolMessage(address?: string | null): string {
  const wallet = address ? `your AdPad wallet ${address}` : 'the wallet you signed in with';
  return `AdPad usually pays the Solana network fee, but it could not cover this one (its daily fee allowance may be used up), and your wallet has no SOL to pay it instead. Nothing was saved and nothing was charged. Try again later, or send a little SOL (0.01 SOL is plenty) to ${wallet}.`;
}
