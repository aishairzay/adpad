import { useEffect, useMemo, useState } from 'react';
import { readWalletBalance } from './lib/wallet-balance';
import {
  formatUsdcAmount,
  hasUsdcTokenAccount,
  parseUsdcAmount,
  sendUsdc,
  solFeeError,
  validateSolanaAddress,
} from './lib/usdc-send';
import './send-usdc.css';

function describeError(error: unknown): string {
  const text = String((error as { message?: string } | null)?.message ?? error ?? '');
  if (/reject/i.test(text)) return 'You did not approve the send in your wallet. Nothing was sent.';
  if (/insufficient|0x1\b|custom program error/i.test(text)) return 'The send did not go through. The wallet may not have enough SOL for the network fee.';
  if (/blockhash|block height|expired/i.test(text)) return 'The send took too long to confirm. Nothing was sent. Try again.';
  if (/fetch|network/i.test(text)) return 'Network trouble. Nothing was sent. Check your connection and try again.';
  return 'The send did not go through. Nothing was sent.';
}

export function SendUsdc({ address, onDone }: { address: string | null | undefined; onDone?: () => void }) {
  const [balance, setBalance] = useState<{ usdc: number; sol: number } | null>(null);
  const [to, setTo] = useState('');
  const [amount, setAmount] = useState('');
  const [recipientHasAta, setRecipientHasAta] = useState<boolean | null>(null);
  const [step, setStep] = useState<'form' | 'review' | 'sent'>('form');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signature, setSignature] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setBalance(null);
    if (!address) return;
    readWalletBalance(address).then(result => {
      if (!cancelled) setBalance(result);
    });
    return () => { cancelled = true; };
  }, [address]);

  const trimmedTo = to.trim();
  const addressError = useMemo(() => validateSolanaAddress(to, address ?? ''), [to, address]);
  const parsedAmount = useMemo(() => parseUsdcAmount(amount, balance ? balance.usdc : null), [amount, balance]);
  const amountOk = !('error' in parsedAmount);
  const base = amountOk ? parsedAmount.base : 0n;
  const needsAta = recipientHasAta !== true;
  const feeError = balance ? solFeeError(balance.sol, needsAta) : null;
  const ready = Boolean(address) && addressError === null && amountOk && balance !== null && feeError === null;

  useEffect(() => {
    let cancelled = false;
    setRecipientHasAta(null);
    if (!addressError && trimmedTo) {
      hasUsdcTokenAccount(trimmedTo).then(result => {
        if (!cancelled) setRecipientHasAta(result);
      });
    }
    return () => { cancelled = true; };
  }, [trimmedTo, addressError]);

  const maxAmount = balance ? formatUsdcAmount(balance.usdc) : '';

  async function confirm() {
    if (!address || !ready) return;
    setSending(true);
    setError(null);
    try {
      const sig = await sendUsdc({ from: address, to: trimmedTo, base, recipientHasAta: needsAta });
      setSignature(sig);
      setStep('sent');
    } catch (caught) {
      setError(describeError(caught));
    } finally {
      setSending(false);
    }
  }

  if (!address) {
    return <div className="send-usdc"><p className="send-note">Sign in to send USDC.</p></div>;
  }

  if (step === 'sent' && signature) {
    return (
      <div className="send-usdc">
        <p className="send-success">Sent. {amount.trim()} USDC is on its way.</p>
        <a className="send-link" href={`https://solscan.io/tx/${signature}`} target="_blank" rel="noreferrer">
          View on Solana
        </a>
        {onDone && <button type="button" className="send-button" onClick={onDone}>Done</button>}
      </div>
    );
  }

  if (step === 'review') {
    return (
      <div className="send-usdc">
        <p className="send-label">To (your Solana address)</p>
        <p className="send-address">{trimmedTo}</p>
        <p className="send-label">Amount</p>
        <p className="send-amount">{amount.trim()} USDC</p>
        <p className="send-warning">USDC on Solana only. Sends cannot be undone. Check the address.</p>
        {error && <p className="send-error">{error}</p>}
        <div className="send-actions">
          <button type="button" className="send-button ghost" disabled={sending} onClick={() => { setError(null); setStep('form'); }}>
            Back
          </button>
          <button type="button" className="send-button" disabled={sending} onClick={confirm}>
            {sending ? 'Sending...' : 'Confirm send'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="send-usdc">
      <label className="send-label" htmlFor="send-usdc-to">To (your Solana address)</label>
      <input
        id="send-usdc-to"
        className="send-input"
        value={to}
        onChange={event => setTo(event.target.value)}
        placeholder="Your Solana address"
        autoComplete="off"
        spellCheck={false}
      />
      {to.trim() !== '' && (
        <p className={addressError ? 'send-hint bad' : 'send-hint good'}>
          {addressError ?? 'Address looks good.'}
        </p>
      )}

      <label className="send-label" htmlFor="send-usdc-amount">Amount (USDC)</label>
      <div className="send-amount-row">
        <input
          id="send-usdc-amount"
          className="send-input"
          value={amount}
          onChange={event => setAmount(event.target.value)}
          placeholder="0"
          inputMode="decimal"
          autoComplete="off"
        />
        <button
          type="button"
          className="send-max"
          disabled={!balance}
          onClick={() => setAmount(maxAmount)}
        >
          Max
        </button>
      </div>
      {amount.trim() !== '' && 'error' in parsedAmount && <p className="send-hint bad">{parsedAmount.error}</p>}

      <p className="send-balance">
        {balance
          ? <>Balance: {formatUsdcAmount(balance.usdc)} USDC, {balance.sol < 0.001 ? 'less than 0.001' : formatUsdcAmount(balance.sol)} SOL</>
          : 'Balance unavailable here'}
      </p>
      {balance === null && <p className="send-note">Sending works on the live site.</p>}
      {feeError && <p className="send-error">{feeError}</p>}
      {error && <p className="send-error">{error}</p>}

      <button type="button" className="send-button" disabled={!ready || sending} onClick={() => setStep('review')}>
        Review
      </button>
    </div>
  );
}
