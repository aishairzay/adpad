import { useEffect } from 'react';
import { ArrowRight, Ban, CircleDollarSign, Eye, Fuel, ShieldCheck, Snowflake, Undo2, CalendarX, AlertTriangle } from 'lucide-react';
import { PAYMENT_STEPS } from './lib/payment-steps';
import { BRANCHES, EXAMPLE, STEP_COPY } from './lib/how-content';
import './how-it-works.css';

const LANES = [['sponsor', 'Sponsor'], ['creator', 'Creator'], ['agent', 'AdPad agent']] as const;
const BRANCH_ICON = { takeback: Undo2, dispute: Snowflake, expiry: CalendarX, unlocked: Ban };
const FACTS = [
  { icon: CircleDollarSign, title: 'USDC on Solana', text: 'Every payment is USDC on Solana mainnet. The creator receives the full locked amount; the escrow pays out exactly what was locked.' },
  { icon: Fuel, title: 'Network fees', text: 'AdPad covers the fee to publish an offer, within its daily limits. Locking, paying and returning USDC are signed by your own wallet; if a network fee is not covered, AdPad tells you how much SOL to add.' },
  { icon: Eye, title: 'What is public', text: 'The escrow’s amount, wallet addresses, dates and status are public on Solana. Proof is a public link. The brief is private: only the creator and AdPad can read it.' },
  { icon: ShieldCheck, title: 'Payouts are final', text: 'Once the escrow pays out, the USDC is in the receiver’s wallet and cannot be pulled back. Disputes must land before the expiry date.' },
];

export default function HowItWorksPage({ onBrowse, onCreate }: { onBrowse: () => void; onCreate: () => void }) {
  useEffect(() => {
    const previous = document.title;
    document.title = 'How payment works · AdPad';
    const id = window.location.hash.slice(1);
    if (id) requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ block: 'start' }));
    else window.scrollTo(0, 0);
    return () => { document.title = previous; };
  }, []);

  return <div className="hw-page">
    <header className="hw-hero">
      <span className="hw-kicker">HOW PAYMENT WORKS</span>
      <h1>Where the money is. <mark>Every step.</mark></h1>
      <p>A sponsor books and locks USDC in an AdPad escrow at its own public address. The creator accepts and does the work, and the sponsor pays from the escrow. If they disagree, AdPad’s agent decides. The USDC only leaves the escrow for the creator’s wallet or back to the sponsor.</p>
    </header>

    <section className="hw-timeline" aria-label="Payment timeline">
      <div className="hw-lane-labels" aria-hidden="true"><span />{LANES.map(([key, label]) => <span key={key}>{label}</span>)}<span className="hw-usdc-label">Where the USDC is</span></div>
      {PAYMENT_STEPS.map((step, index) => { const copy = STEP_COPY[step.key]; const Icon = step.icon; return <article key={step.key} id={`step-${step.key}`} className={`hw-step hw-where-${copy.where}`}>
        <h2><span className="hw-step-icon"><Icon size={18} aria-hidden="true" /></span><span className="hw-step-number">{index + 1}</span>{step.name}</h2>
        {LANES.map(([key, label]) => <p key={key} className={`hw-lane hw-lane-${key}`} data-lane={label}>{copy[key]}</p>)}
        <p className="hw-usdc" data-lane="Where the USDC is">{copy.usdc}</p>
      </article>; })}
    </section>

    <section className="hw-section" aria-labelledby="hw-what-if">
      <h2 id="hw-what-if" className="hw-section-title">What if…</h2>
      <div className="hw-branches">{BRANCHES.map(branch => { const Icon = BRANCH_ICON[branch.id]; return <article key={branch.id} id={`if-${branch.id}`} className="hw-branch">
        <h3><Icon size={19} aria-hidden="true" />{branch.title}</h3>
        <ol className="hw-flow">{branch.flow.map(node => <li key={node.label} className={`hw-node hw-node-${node.tone}`}>{node.label}</li>)}</ol>
        <p>{branch.text}</p>
      </article>; })}</div>
    </section>

    <section className="hw-section" aria-labelledby="hw-example">
      <h2 id="hw-example" className="hw-section-title">A 250 USDC booking, start to finish</h2>
      <ol className="hw-example">{EXAMPLE.map(row => { const step = PAYMENT_STEPS.find(item => item.key === row.step)!; const Icon = step.icon; return <li key={row.step}>
        <span className="hw-example-step"><Icon size={16} aria-hidden="true" />{step.short}</span><time>{row.when}</time><p>{row.what}</p>
      </li>; })}</ol>
      <p className="hw-note"><AlertTriangle size={16} aria-hidden="true" />Times are an example. Each deal card shows its own dates and expiry.</p>
    </section>

    <section className="hw-section" aria-labelledby="hw-facts">
      <h2 id="hw-facts" className="hw-section-title">Short facts</h2>
      <div className="hw-facts">{FACTS.map(fact => { const Icon = fact.icon; return <article key={fact.title}><Icon size={22} aria-hidden="true" /><h3>{fact.title}</h3><p>{fact.text}</p></article>; })}</div>
    </section>

    <div className="hw-cta"><button type="button" className="button primary" onClick={onBrowse}>Find an ad spot <ArrowRight size={17} /></button><button type="button" className="button secondary" onClick={onCreate}>Become a creator <ArrowRight size={17} /></button></div>
  </div>;
}
