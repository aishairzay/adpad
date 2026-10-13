// AdPad's own escrow (policy: dealEscrows). The sponsor's wallet locks USDC into an account of
// its own per escrow, at a public Solana address. Until the creator accepts, the sponsor can take
// it back; the sponsor can pay the creator at any time and the creator can return it at any time.
// After the creator accepts either side can dispute, and only AdPad's agent decides a dispute.
// Undisputed money goes back to the sponsor after the expiry date, and an undecided dispute does
// DISPUTE_FALLBACK_SECONDS later. Every change is a single-use action the wallet signs.
import { get, runQuery, serverTimestamp, set } from '@bounded-sh/client';
import { receiptState } from './money';
import { definitivelyRejected } from './chain-errors';

/** Stamped on sponsorDeals.rootAppId when the escrow is saved on a booking (the booking rule pins it). */
export const ADPAD_ROOT_APP_ID = '68652cfd2a7212f59461a789';
export const ADPAD_AGENT_ADDRESS = 'B9bQJmvkY6mL9HcRkqkP3eMahbgzgentzhpXC7MoDXrx';

export const MIN_AMOUNT_USDC = 1_000_000; // 1 USDC, 6 decimals
export const MAX_AMOUNT_USDC = 1_000_000_000; // 1,000 USDC
export const MIN_EXPIRY_SECONDS = 3_600;
export const MAX_EXPIRY_SECONDS = 7_776_000; // 90 days
export const DISPUTE_FALLBACK_SECONDS = 2_592_000; // 30 days after expiry
export const MIN_DISPUTE_REASON = 10;
export const MAX_DISPUTE_REASON = 400;

export type EscrowStatus = 'unfunded' | 'locked' | 'accepted' | 'disputed' | 'released' | 'refunded';
export type EscrowAction = 'fund' | 'assign' | 'accept' | 'withdraw' | 'release' | 'refund' | 'dispute' | 'resolve' | 'expire' | 'fallback';

export interface Escrow {
  escrowId: string;
  funder: string;
  payee: string | null;
  amountUsdc: number;
  expiresAt: number;
  ref: string;
  createdAt: number;
  status: EscrowStatus;
  version: number;
  fundedAt: number | null;
  acceptedAt: number | null;
  disputedAt: number | null;
  disputedBy: string | null;
  disputeReason: string | null;
  settledAt: number | null;
  /** The action that settled it: release, withdraw, refund, resolve, expire or fallback. */
  settledKind: EscrowAction | null;
}

/** What the sponsor locks. payee is null for a posted call, until the sponsor picks a creator. */
export interface EscrowTerms { payee: string | null; amountUsdc: number; expiresAt: number; ref: string }

export const ESCROW_STATUS_LABEL: Record<EscrowStatus, string> = {
  unfunded: 'Escrow created, USDC not locked yet', locked: 'USDC locked in escrow', accepted: 'Locked, and the creator accepted',
  disputed: 'Disputed and frozen', released: 'Paid to the creator', refunded: 'Returned to the sponsor',
};

const STATUSES: readonly string[] = ['unfunded', 'locked', 'accepted', 'disputed', 'released', 'refunded'];

export function newEscrowId(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join('');
}

export function isEscrowId(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{32}$/.test(value);
}

/** Check terms against the escrow's rules before the sponsor's wallet is asked to sign. */
export function validateEscrowTerms(terms: EscrowTerms, funder: string | null | undefined, nowSeconds: number): string[] {
  const problems: string[] = [];
  if (!funder) problems.push('Sign in with the wallet that pays.');
  if (terms.payee && terms.payee === funder) problems.push('You cannot fund an escrow that pays yourself.');
  if (terms.payee === ADPAD_AGENT_ADDRESS) problems.push('The AdPad agent cannot be paid from an escrow.');
  const amount = terms.amountUsdc;
  if (!Number.isInteger(amount) || amount < MIN_AMOUNT_USDC || amount > MAX_AMOUNT_USDC) problems.push('Escrow amounts run from 1 to 1,000 USDC.');
  const life = terms.expiresAt - nowSeconds;
  if (!Number.isInteger(terms.expiresAt) || life < MIN_EXPIRY_SECONDS) problems.push('This booking is too close to its end date to lock USDC now. Cancel it and book again with a later deadline.');
  else if (life > MAX_EXPIRY_SECONDS) problems.push('The escrow must end within 90 days.');
  if (typeof terms.ref !== 'string' || terms.ref.length < 1 || terms.ref.length > 128) problems.push('Missing booking reference.');
  return problems;
}

export function validateDisputeReason(reason: string): string | null {
  const text = reason.trim();
  if (text.length < MIN_DISPUTE_REASON) return `Say why you are disputing, in at least ${MIN_DISPUTE_REASON} characters.`;
  if (text.length > MAX_DISPUTE_REASON) return `Keep the reason under ${MAX_DISPUTE_REASON} characters.`;
  return null;
}

const num = (value: unknown): number | null => typeof value === 'number' && Number.isFinite(value) ? value : null;
const str = (value: unknown): string | null => typeof value === 'string' && value ? value : null;

export function parseEscrow(raw: Record<string, unknown> | null | undefined, escrowId: string): Escrow | null {
  if (!raw || !isEscrowId(escrowId)) return null;
  const status = str(raw.status);
  const funder = str(raw.funder);
  const amountUsdc = num(raw.amountUsdc);
  const expiresAt = num(raw.expiresAt);
  if (!status || !STATUSES.includes(status) || !funder || amountUsdc === null || expiresAt === null) return null;
  return {
    escrowId, funder, payee: str(raw.payee), amountUsdc, expiresAt, ref: str(raw.ref) || '', createdAt: num(raw.createdAt) || 0,
    status: status as EscrowStatus, version: num(raw.version) || 0,
    fundedAt: num(raw.fundedAt), acceptedAt: num(raw.acceptedAt), disputedAt: num(raw.disputedAt), disputedBy: str(raw.disputedBy), disputeReason: str(raw.disputeReason),
    settledAt: num(raw.settledAt), settledKind: str(raw.settledKind) as EscrowAction | null,
  };
}

export async function readEscrow(escrowId: string): Promise<Escrow | null> {
  return parseEscrow(await get(`dealEscrows/${escrowId}`, { bypassCache: true }) as Record<string, unknown> | null, escrowId);
}

/** The escrow account's public Solana address, for display only. Null when it cannot be read. */
export async function escrowAddress(escrowId: string): Promise<string | null> {
  try { return str(await runQuery(`dealEscrows/${escrowId}`, 'getEscrowAddress', {})); } catch { return null; }
}

/** Create the escrow record. The sponsor's wallet then locks the USDC with the fund action. */
export async function createEscrow(escrowId: string, funder: string, terms: EscrowTerms): Promise<void> {
  await set(`dealEscrows/${escrowId}`, {
    funder, ...(terms.payee ? { payee: terms.payee } : {}), amountUsdc: terms.amountUsdc, expiresAt: terms.expiresAt, ref: terms.ref,
    createdAt: serverTimestamp(), status: 'unfunded', version: 0,
  });
}

async function waitForReceipt(path: string): Promise<void> {
  for (let i = 0; i < 35; i++) {
    const receipt = await get(path, { bypassCache: true }) as Record<string, unknown> | null;
    const state = receiptState(receipt);
    if (state === 'failed') throw new Error(`The escrow action failed: ${String(receipt?._error_message)}`);
    if (state === 'complete' && receipt?.completed === true) return;
    await new Promise(resolve => setTimeout(resolve, 600));
  }
  throw new Error('The escrow action is still processing. Refresh before trying again; a submitted action is not a completed payment.');
}

/**
 * Run one escrow action, signed by the signed-in wallet. Each action counts once: it names the
 * escrow version it expects, and an attempt whose outcome is unclear is checked before another runs.
 */
export async function runEscrowAction(escrowId: string, action: EscrowAction, actor: string, extra: { payee?: string; reason?: string; outcome?: 'release' | 'refund' } = {}): Promise<Escrow> {
  const head = await readEscrow(escrowId);
  if (!head) throw new Error('This escrow could not be found. Refresh and try again.');
  const pendingKey = `adpad:escrow-pending:${escrowId}`;
  const pending = localStorage.getItem(pendingKey);
  if (pending) {
    if (receiptState(await get(pending, { bypassCache: true }) as Record<string, unknown> | null) === 'pending') throw new Error('An earlier escrow action is still confirming. Wait for the escrow to update before trying again.');
    localStorage.removeItem(pendingKey);
  }
  const path = `dealEscrows/${escrowId}/actions/a_${crypto.randomUUID().replaceAll('-', '_')}`;
  localStorage.setItem(pendingKey, path);
  try {
    await set(path, { action, actor, expectedVersion: head.version, at: serverTimestamp(), ...extra });
    await waitForReceipt(path);
    const after = await readEscrow(escrowId);
    if (!after || after.version <= head.version) throw new Error('The action completed, but the escrow has not refreshed yet. Refresh before doing anything else.');
    localStorage.removeItem(pendingKey);
    return after;
  } catch (caught) {
    // Keep the attempt after an unclear outcome so a reload cannot blindly repeat it.
    if (definitivelyRejected(caught)) localStorage.removeItem(pendingKey);
    throw caught;
  }
}
