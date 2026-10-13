// Balance check and top-up help shown where a sponsor locks USDC.
// Self-contained: it never closes or navigates anything, so it can also sit
// inside the booking dialog.
import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { readWalletBalance } from './lib/wallet-balance';
import { formatUsdc } from './lib/money';
import './deal-card.css';

const usdcText = (whole: number) => whole.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Shows the signed-in wallet's USDC balance next to the amount a deal needs,
 * with an Add USDC panel (address, copy, QR, one line of instructions) when
 * the balance is short or cannot be read. Renders null without an address.
 */
export function UsdcBalanceCheck({ address, neededUsdc }: { address: string | null | undefined; neededUsdc: number }) {
  const [balance, setBalance] = useState<number | null | 'loading'>('loading');
  const [qr, setQr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setBalance('loading');
    if (!address) return;
    readWalletBalance(address).then(result => {
      if (!cancelled) setBalance(result ? result.usdc : null);
    });
    return () => { cancelled = true; };
  }, [address]);

  useEffect(() => {
    let cancelled = false;
    setQr(null);
    if (!address) return;
    QRCode.toDataURL(address, { margin: 1, width: 180 }).then(url => {
      if (!cancelled) setQr(url);
    }).catch(() => { /* no QR, the text address is still there */ });
    return () => { cancelled = true; };
  }, [address]);

  if (!address) return null;

  const refresh = () => {
    setBalance('loading');
    readWalletBalance(address).then(result => setBalance(result ? result.usdc : null));
  };

  const known = typeof balance === 'number';
  const short = known && balance * 1_000_000 < neededUsdc;
  const more = short ? (neededUsdc - balance * 1_000_000) / 1_000_000 : null;
  const unavailable = balance === null;
  const showPanel = short || (unavailable && open);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard blocked: the address is selectable text */ }
  };

  return <div className="usdc-check">
    <div className="usdc-check-row">
      {balance === 'loading'
        ? <span className="muted">Checking your USDC balance…</span>
        : known
          ? <span>Your USDC: <strong>{usdcText(balance)}</strong></span>
          : <span className="muted">Balance shows on the live site</span>}
      <button className="text-button" type="button" onClick={refresh}>Refresh balance</button>
    </div>
    {known && !short && <p className="muted usdc-check-note">That covers the {formatUsdc(neededUsdc)} USDC this deal needs.</p>}
    {(short || unavailable) && !showPanel && <button className="button" type="button" onClick={() => setOpen(true)}>Add USDC</button>}
    {showPanel && <div className="add-usdc">
      <p className="add-usdc-line">Send USDC on the Solana network to this address from Phantom or an exchange like Coinbase or Kraken. Other networks will not arrive.</p>
      {more !== null && <p className="add-usdc-more">You need {formatUsdc(Math.round(more * 1_000_000))} more USDC.</p>}
      <div className="add-usdc-body">
        <div className="add-usdc-address">
          <code className="usdc-address-box">{address}</code>
          <button className="button" type="button" onClick={() => void copy()}>{copied ? 'Copied' : 'Copy'}</button>
        </div>
        {qr && <img className="usdc-qr" src={qr} alt="QR code of your wallet address" width={180} height={180} />}
      </div>
    </div>}
  </div>;
}
