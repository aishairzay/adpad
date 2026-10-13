// Every buyer and seller links the X account they own, through X's own consent
// screen, before taking any action. The policy refuses writes from an account
// without one, and any handle stored on a profile or listing is the linked one.
import { BadgeCheck, LoaderCircle } from 'lucide-react';
import type { AdPadModel } from './types';
import { xProfileUrl } from './lib/x-profile';
import './x-link.css';

/** Shown wherever an action waits on a linked X account; renders nothing once linked. */
export function XLinkPrompt({ model, action = 'book, list, or act on a deal' }: { model: AdPadModel; action?: string }) {
  if (!model.user || model.xAccount !== null) return null;
  return <div className="x-link-prompt" role="note">
    <span className="x-link-mark" aria-hidden="true">X</span>
    <div><strong>Link your X account to {action}.</strong><p>AdPad verifies every sponsor and creator through X. You sign in on X itself; AdPad never sees your password and cannot post for you.</p></div>
    <button type="button" className="button primary" disabled={model.busy} onClick={() => void model.linkX()}>Link X account</button>
  </div>;
}

/** The linked account as a read-only fact, with the prompt when there is none. */
export function XLinkStatus({ model, unlink = false }: { model: AdPadModel; unlink?: boolean }) {
  if (!model.user) return null;
  if (model.xAccount === undefined) return <p className="x-link-status muted"><LoaderCircle size={15} className="spin" />Checking your X account…</p>;
  if (!model.xAccount) return <XLinkPrompt model={model} />;
  const { handle } = model.xAccount;
  return <div className="x-link-status">
    <BadgeCheck size={18} aria-hidden="true" />
    <span>X account <a href={xProfileUrl(handle)} target="_blank" rel="noopener noreferrer">@{handle}</a> · verified through X</span>
    {unlink && <button type="button" className="text-button" disabled={model.busy} onClick={() => void model.unlinkX()}>Unlink</button>}
  </div>;
}
