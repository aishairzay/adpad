// "Email me when my deals move": the one switch for deal emails.
// The choice lives in dealMailPrefs/<wallet>; AdPad's deal mailer reads it and
// sends to the signed-in email only (the rules refuse any other address).
import { useEffect, useState } from 'react';
import { BellRing, LoaderCircle, MailX } from 'lucide-react';
import { get, getCurrentUser, serverTimestamp, set } from '@bounded-sh/client';
import './deal-emails.css';

interface Props { user: { id: string; address?: string | null; email?: string | null } | null; xLinked: boolean }

export function DealEmails({ user, xLinked }: Props) {
  const wallet = user?.address || '';
  const [on, setOn] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState('');
  // The rules only accept the verified sign-in email, so read it from the live session.
  const [email, setEmail] = useState<string | null>(user?.email ?? null);

  useEffect(() => {
    let live = true;
    if (!wallet) return;
    (async () => {
      try {
        const current = (() => { try { return getCurrentUser() as { email?: string | null } | null; } catch { return null; } })();
        if (live && current?.email) setEmail(current.email);
        const saved = await get(`dealMailPrefs/${wallet}`, { bypassCache: true }).catch(() => null) as { on?: boolean } | null;
        if (live) setOn(saved?.on === true);
      } catch { if (live) setOn(false); }
    })();
    return () => { live = false; };
  }, [wallet]);

  if (!user || !wallet) return null;

  if (!email) return (
    <div className="deal-emails muted" role="note">
      <MailX size={20} aria-hidden="true" />
      <div><strong>Deal emails need an email sign-in.</strong><p>You signed in with a wallet only, so AdPad has no address to write to. Sign in with email to get an email when a booking, payment or proof on your deals moves.</p></div>
    </div>
  );

  const toggle = async () => {
    if (on === null || saving) return;
    const next = !on;
    if (!xLinked) { setProblem('Link your X account first.'); return; }
    setSaving(true); setProblem('');
    try {
      await set(`dealMailPrefs/${wallet}`, { owner: user.id, email, on: next, updatedAt: serverTimestamp() });
      setOn(next);
    } catch {
      setProblem('That did not save. Sign out and back in with email, then try again.');
    } finally { setSaving(false); }
  };

  return (
    <div className="deal-emails" role="group" aria-label="Deal emails">
      <BellRing size={20} aria-hidden="true" />
      <div>
        <strong>Email me when my deals move</strong>
        <p>{on ? `On. AdPad emails ${email} about new bookings, locked USDC, proof, approvals and payouts on your deals.` : `Get an email at ${email} when there is a new booking, the USDC is locked, proof arrives, or a payout is approved or paid.`}</p>
        {problem && <p className="deal-emails-problem" role="alert">{problem}</p>}
      </div>
      <button type="button" role="switch" aria-checked={on === true} className={on ? 'deal-emails-switch on' : 'deal-emails-switch'} disabled={on === null || saving} onClick={toggle}>
        {on === null || saving ? <LoaderCircle className="spin" size={16} aria-hidden="true" /> : null}
        <span>{on ? 'On' : 'Off'}</span>
      </button>
    </div>
  );
}
