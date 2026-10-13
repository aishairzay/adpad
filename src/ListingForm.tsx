import { useEffect, useId, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { ArrowRight, Check, Globe2, ImagePlus, LoaderCircle, Plus, Save, ShieldCheck, Shirt, Sparkles, Upload, Users, X } from 'lucide-react';
import { APP_ID } from './config';
import { OfferFields, readOfferTerms } from './OfferFields';
import { parseUsdc } from './lib/money';
import { safeListingImageUrl, validateListingImage } from './lib/listing-images';
import { readPendingEditInput } from './lib/listing-management';
import { readPendingReplacementInput } from './lib/listing-replacement';
import { validateListingInput } from './lib/listing-input';
import { reviewSections } from './lib/review-summary';
import { normalizeXPostUrl } from './lib/x-profile';
import { CATEGORIES, SERVICE_CATEGORIES } from './types';
import type { AdPadModel, Category, Listing, ListingInput, ListingKind } from './types';
import './publish.css';
import CreatorOnboarding from './CreatorOnboarding';
import { XLinkPrompt, XLinkStatus } from './XLink';
import type { Draft } from '../functions/onboarding-schema';

const KINDS: ListingKind[] = ['placement', 'service'];
const draftKey = `adpad:creator-draft:${APP_ID}`;
interface PendingPublication { owner: string; token: string; inputs: ListingInput[]; completed: ListingKind[] }
function pendingPublication(): PendingPublication | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(draftKey) || 'null');
    return value && typeof value.owner === 'string' && typeof value.token === 'string' && Array.isArray(value.inputs) && value.inputs.length > 0 && value.inputs.length <= 2 && value.inputs.every((input: ListingInput) => KINDS.includes(input.kind as ListingKind)) && Array.isArray(value.completed) ? value : null;
  } catch { return null; }
}
function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return <label className="field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>;
}

export default function ListingForm({ model, onSuccess, initialKind = 'placement', initialSponsorship = false, initialEventId, initialAgentOpen = false, listing }: { model: AdPadModel; onSuccess: () => void; initialKind?: ListingKind; initialSponsorship?: boolean; initialEventId?: string; initialAgentOpen?: boolean; listing?: Listing }) {
  const legacyReplacement = Boolean(listing && (listing.editVersion !== 1 || listing.everFunded == null));
  const replacementDraftKey = `adpad:replacement-draft:${APP_ID}:${listing?.id}`;
  const restoreReplacement = (): { input: ListingInput; imageUrl: string; publicationId: string } | null => {
    if (!listing || !legacyReplacement) return null;
    try {
      const identity = { owner: listing.owner, seller: listing.seller };
      const saved = readPendingReplacementInput(localStorage.getItem(`adpad:replace:${APP_ID}:${listing.id}`), identity);
      if (saved) return saved;
      const draft = JSON.parse(sessionStorage.getItem(replacementDraftKey) || 'null');
      return draft?.owner === listing.owner && draft?.seller === listing.seller && typeof draft.publicationId === 'string' && draft.input ? draft : null;
    } catch { return null; }
  };
  const [pendingReplacement, setPendingReplacement] = useState(restoreReplacement);
  const [pending, setPending] = useState<PendingPublication | null>(() => listing ? null : pendingPublication());
  const restoreEdit = () => {
    if (!listing || legacyReplacement) return null;
    try { return readPendingEditInput(localStorage.getItem(`adpad:edit:${APP_ID}:${listing.id}`), { owner: listing.owner, seller: listing.seller }); } catch { return null; }
  };
  const [pendingEdit, setPendingEdit] = useState(restoreEdit);
  const [aiValues, setAiValues] = useState<Record<string, Partial<ListingInput>>>({});
  const [aiRevision, setAiRevision] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);
  const chatKey = `adpad:onboarding:${APP_ID}:${model.user?.id || 'guest'}`;
  const [selected, setSelected] = useState<ListingKind[]>(() => listing ? [listing.kind === 'service' ? 'service' : 'placement'] : pending?.inputs.map(input => input.kind as ListingKind) || [initialKind]);
  const [sponsorship, setSponsorship] = useState(Boolean(pendingReplacement?.input.sponsorship ?? pendingEdit?.input.sponsorship ?? listing?.sponsorship ?? pending?.inputs.find(input => input.kind === 'placement')?.sponsorship ?? initialSponsorship));
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  const imageId = useId();
  const publishing = useRef(false);
  const busy = model.busy || submitting;
  const locked = Boolean(pending || pendingEdit || pendingReplacement);
  // The Listing Agent chat is the primary path for a fresh publish opened through its entry; the form is always one tap away.
  const [mode, setMode] = useState<'chat' | 'form'>(initialAgentOpen && !listing && !locked ? 'chat' : 'form');
  const oldImage = safeListingImageUrl(pendingReplacement?.imageUrl || pendingEdit?.imageUrl || listing?.imageUrl);
  const preview = imagePreview || oldImage;
  const initial = (kind: ListingKind): Partial<ListingInput> => pendingReplacement?.input || pendingEdit?.input || listing || pending?.inputs.find(input => input.kind === kind) || aiValues[kind] || {};
  const captureDraft = (): Draft => {
    const form = formRef.current;
    if (!form) return { offers: {} };
    const data = new FormData(form);
    const draft: Draft = { publisher: String(data.get('publisher') || ''), xHandle: model.xAccount?.handle || '', offers: {} };
    for (const kind of selected) {
      const offer: Record<string, string | number | boolean> = {};
      for (const field of ['title', 'category', 'channel', 'audience', 'description', 'deliverables', 'xPostUrl']) offer[field] = String(data.get(`${kind}.${field}`) || '');
      try { offer.priceMicro = parseUsdc(String(data.get(`${kind}.price`) || '')); } catch { /* Ask for a price rather than guessing. */ }
      const days = Number(data.get(`${kind}.turnaround`));
      if (days) offer.turnaroundDays = days;
      Object.assign(offer, readOfferTerms(data, kind, sponsorship, `${kind}.`));
      draft.offers[kind] = offer;
    }
    return draft;
  };
  const applyDraft = (draft: Draft) => {
    const current = captureDraft();
    const kinds = KINDS.filter(kind => draft.offers[kind]);
    const next: Record<string, Partial<ListingInput>> = {};
    for (const kind of KINDS) next[kind] = { ...current.offers[kind], ...draft.offers[kind], publisher: draft.publisher || current.publisher } as Partial<ListingInput>;
    setAiValues(next); if (kinds.length) setSelected(kinds);
    setAiRevision(value => value + 1); setMode('form');
    setTimeout(() => formRef.current?.querySelector<HTMLInputElement>('[name="publisher"]')?.focus(), 0);
  };
  // The review summary reads the form back live, so it always shows what the publish button will send.
  const [reviewDraft, setReviewDraft] = useState<Draft>(() => captureDraft());
  const syncReview = () => setReviewDraft(current => {
    const next = captureDraft();
    return JSON.stringify(current) === JSON.stringify(next) ? current : next;
  });
  // Re-reading after render catches values React only writes once a change event settles (event name, dates).
  useEffect(() => { if (mode === 'form') syncReview(); });
  useEffect(() => {
    if (!selectedImage) { setImagePreview(null); return; }
    const url = URL.createObjectURL(selectedImage); setImagePreview(url);
    return () => URL.revokeObjectURL(url);
  }, [selectedImage]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (publishing.current) return;
    setError(null);
    try {
      if (!model.user?.address) throw new Error('Sign in and finish wallet setup before publishing.');
      if (!selected.length) throw new Error('Choose ad space, creator service, or both.');
      if (pending && pending.owner !== model.user.id) throw new Error('Sign in with the account that started this draft to finish publishing it.');
      if (!selectedImage && !listing) throw new Error(pending ? 'Choose the same photo again to finish publishing your saved offers.' : 'Add a photo of yourself, your space, or your work.');
      if (selectedImage) validateListingImage(selectedImage);
      const form = new FormData(event.currentTarget);
      const inputs = pending?.inputs || (pendingReplacement ? [pendingReplacement.input] : pendingEdit ? [pendingEdit.input] : selected.map(kind => {
        const text = (name: string) => String(form.get(`${kind}.${name}`) || '').trim();
        const rawPost = text('xPostUrl');
        const xPostUrl = normalizeXPostUrl(rawPost);
        if (rawPost && !xPostUrl) throw new Error('Enter a public X post link such as https://x.com/yourname/status/123.');
        const input: ListingInput = { kind, publisher: String(form.get('publisher') || '').trim(), xPostUrl, title: text('title'), category: text('category') as Category, channel: text('channel'), audience: text('audience'), description: text('description'), deliverables: text('deliverables'), priceMicro: parseUsdc(text('price')), turnaroundDays: Number(text('turnaround')), ...readOfferTerms(form, kind, sponsorship, `${kind}.`) };
        validateListingInput(input);
        return input;
      }));
      publishing.current = true; setSubmitting(true);
      if (listing && legacyReplacement) {
        const progress = pendingReplacement || { input: inputs[0], imageUrl: listing.imageUrl || '', publicationId: crypto.randomUUID() };
        sessionStorage.setItem(replacementDraftKey, JSON.stringify({ ...progress, owner: listing.owner, seller: listing.seller }));
        setPendingReplacement(progress);
        if (await model.replaceLegacyListing(listing, progress.input, selectedImage || undefined, progress.publicationId)) {
          sessionStorage.removeItem(replacementDraftKey); onSuccess();
        } else if (localStorage.getItem(`adpad:replace:${APP_ID}:${listing.id}`)) setPendingReplacement(restoreReplacement());
        else { sessionStorage.removeItem(replacementDraftKey); setPendingReplacement(null); }
        return;
      }
      if (listing) {
        if (await model.updateListing(listing, inputs[0], selectedImage || undefined)) onSuccess();
        else setPendingEdit(restoreEdit());
        return;
      }
      let progress: PendingPublication = pending || { owner: model.user.id, token: crypto.randomUUID(), inputs, completed: [] };
      sessionStorage.setItem(draftKey, JSON.stringify(progress)); setPending(progress);
      for (const input of progress.inputs) {
        const kind = input.kind as ListingKind;
        if (progress.completed.includes(kind)) continue;
        if (!await model.publishListing(input, selectedImage!, `${progress.token}:${kind}`)) return;
        progress = { ...progress, completed: [...progress.completed, kind] };
        sessionStorage.setItem(draftKey, JSON.stringify(progress)); setPending(progress);
      }
      sessionStorage.removeItem(draftKey); sessionStorage.removeItem(chatKey); onSuccess();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Please check your offer details.'); }
    finally { publishing.current = false; setSubmitting(false); }
  };

  if (model.isAdmin && !listing) return <div className="dialog-content"><div className="subtle-notice"><ShieldCheck size={20} /><span>This account is Ad Pad’s dispute admin. Use a separate trading account to publish or book placements so the admin can review disputes independently.</span></div></div>;
  if (mode === 'chat' && !listing && !locked) return <div className="dialog-content creator-form chat-mode">
    {model.user && !model.xAccount ? <XLinkPrompt model={model} action="chat with the Listing Agent and publish" /> : model.user ? <CreatorOnboarding key={chatKey} storageKey={chatKey} initialDraft={captureDraft()} onApply={applyDraft} onClose={() => setMode('form')} /> : <div className="creator-ai-signin"><strong>LISTING AGENT</strong><p>Sign in to chat with the Listing Agent and shape your first offer. Your draft stays saved in this tab.</p><button type="button" className="button" disabled={busy || !model.ready || !model.configured} onClick={() => void model.signIn()}>Sign in to continue <ArrowRight size={17} /></button><button type="button" className="text-button" onClick={() => setMode('form')}>Explore the form instead</button></div>}
    <div className="subtle-notice"><Globe2 size={20} /><span>Your photo and offer details are public. Sponsors pay in USDC into escrow. You’re paid 24 hours after your proof is approved.</span></div>
  </div>;
  return <form ref={formRef} className="dialog-content creator-form" onSubmit={submit} onChangeCapture={syncReview} onInvalidCapture={event => { const details = (event.target as HTMLElement).closest('details'); if (details) details.open = true; }}>
    {!listing && !locked && initialAgentOpen && <button type="button" className="chat-return" onClick={() => setMode('chat')}><Sparkles size={15} aria-hidden="true" />Back to the Listing Agent</button>}
    <p className="form-intro">{legacyReplacement ? 'Update this older listing by publishing a new version. The original closes to new bookings and is retired once the update is live. Existing agreements keep their original terms.' : listing ? 'Update your photo, details, and price. Your offer will pause while the changes save.' : 'Show the space, name the price, and say what proof you’ll submit. Wearing sponsor merch counts.'}</p>
    {!listing && <fieldset className="listing-kind-picker" disabled={busy || locked}><legend>What are you offering?</legend><p className="field-guidance">Choose one or both.</p><div>{KINDS.map(kind => <label key={kind} className={`kind-choice ${selected.includes(kind) ? 'selected' : ''}`}><input type="checkbox" checked={selected.includes(kind)} onChange={event => setSelected(current => event.target.checked ? KINDS.filter(item => current.includes(item) || item === kind) : current.filter(item => item !== kind))} />{kind === 'placement' ? <Shirt size={24} /> : <Users size={24} />}<span><strong>{kind === 'placement' ? 'Ad space' : 'Creator service'}</strong><small>{kind === 'placement' ? 'Your presence, gear, or audience.' : 'Your skills, craft, or expertise.'}</small></span><Check className="choice-check" size={20} aria-hidden="true" /></label>)}</div></fieldset>}
    {selected.length === 2 && <p className="dual-offer-note">One profile, two offers. Set a price and deliverables for each so sponsors can book either one.</p>}
    {pending && <div className="publication-progress" role="status"><strong>{pending.completed.length ? `${pending.completed.length} of ${pending.inputs.length} offers published` : 'Your offers are saved for publishing'}</strong><p>{busy ? 'Publishing your offers…' : 'Finish publishing below. Your original details are kept for a safe retry; offers already published won’t be duplicated.'}</p>{!selectedImage && <p>Reselect the same photo to continue.</p>}</div>}
    {pendingEdit && <div className="publication-progress" role="status"><strong>Finish saving your update</strong><p>Your original changes have been restored. Confirm them below before making any further edits.</p></div>}
    {pendingReplacement && <div className="publication-progress" role="status"><strong>Finish your updated version</strong><p>Your changes are saved. Continue below to confirm the new offer and retire the original.</p></div>}
    <fieldset key={`shared-${aiRevision}`} className="creator-shared" disabled={busy || locked}><Field label="Your name / crew"><input name="publisher" defaultValue={pendingReplacement?.input.publisher || pendingEdit?.input.publisher || listing?.publisher || pending?.inputs[0]?.publisher || aiValues.placement?.publisher || aiValues.service?.publisher || ''} placeholder="Your name, crew, or studio" required maxLength={80} /></Field><div className="field"><span>Your X account</span><XLinkStatus model={model} /><small>Your verified X account links from every published offer.</small></div></fieldset>
    <div className={`image-uploader ${preview ? 'has-image' : ''}`}><input ref={imageInput} id={imageId} type="file" accept="image/jpeg,image/png,image/webp,image/avif" className="sr-only" required={!listing && !selectedImage} disabled={busy || Boolean(pendingEdit || pendingReplacement) || (locked && Boolean(selectedImage))} onChange={event => { const file = event.target.files?.[0]; if (!file) return; try { validateListingImage(file); setSelectedImage(file); setError(null); } catch (cause) { event.target.value = ''; setError(cause instanceof Error ? cause.message : 'Choose a valid photo.'); } }} /><label htmlFor={imageId}>{preview ? <><img src={preview} alt="Your offer photo" /><span className="image-replace"><Upload size={18} />{locked ? 'Selected photo' : 'Replace photo'}</span></> : <><ImagePlus size={32} strokeWidth={1.4} /><strong>Show what you bring.</strong><span>Choose a photo of you, your space, or your work</span><small>JPG, PNG, WebP or AVIF · Up to 5 MB</small></>}</label>{selectedImage && <div className="selected-file"><span>{selectedImage.name}</span>{!locked && <button type="button" disabled={busy} onClick={() => { setSelectedImage(null); if (imageInput.current) imageInput.current.value = ''; }} aria-label="Remove selected photo"><X size={16} />Remove</button>}</div>}</div>
    {KINDS.map(kind => { const values = initial(kind); const service = kind === 'service'; const prefix = `${kind}.`; return <fieldset key={`${kind}-${aiRevision}`} className="creator-offer-section" hidden={!selected.includes(kind)} disabled={!selected.includes(kind) || busy || locked}>
      <legend>{service ? 'Creator service' : 'Ad space'}{pending?.completed.includes(kind) && <span className="offer-published"><Check size={18} />Published</span>}</legend>
      {!service && <label className="sponsorship-toggle"><input type="checkbox" checked={sponsorship} onChange={event => setSponsorship(event.target.checked)} /><span><strong>List it on Find creators</strong><small>Sponsors browsing Find creators can book you directly: your presence, your gear or your audience. Wearing their merch counts, no big following needed.</small></span></label>}
      <Field label={service ? 'Service title' : 'Placement title'}><input name={`${prefix}title`} defaultValue={values.title || ''} placeholder={service ? 'Event photography with same-week delivery' : 'I’ll wear your merch at Breakpoint'} required minLength={3} maxLength={80} /></Field>
      <div className="form-row"><Field label={service ? 'Your skill' : 'Placement category'}><select name={`${prefix}category`} defaultValue={values.category || (service ? 'Photography' : 'Event')}>{(service ? SERVICE_CATEGORIES.slice(1) : CATEGORIES.slice(1)).map(category => <option key={category}>{category}</option>)}</select></Field><Field label="Location, event or profile"><input name={`${prefix}channel`} defaultValue={values.channel || ''} placeholder="London / conference week / @yourhandle" required maxLength={100} /></Field></div>
      <div className="form-row"><Field label="Price in USDC" hint="Your price for this offer."><div className="input-affix"><input name={`${prefix}price`} defaultValue={values.priceMicro ? String(values.priceMicro / 1000000) : ''} placeholder="250" inputMode="decimal" required /><span>USDC</span></div></Field><Field label="Delivery window" hint="Between 1 and 90 days."><div className="input-affix"><input name={`${prefix}turnaround`} type="number" defaultValue={values.turnaroundDays || 7} min={1} max={90} step={1} required /><span>days</span></div></Field></div>
      <Field label={service ? 'Who is this service for?' : 'Who will see it?'}><input name={`${prefix}audience`} defaultValue={values.audience || ''} placeholder={service ? 'Event organizers, communities, and teams' : 'Founders, builders, and conference attendees'} required maxLength={250} /></Field>
      <Field label={service ? 'About your service' : 'About the placement'}><textarea name={`${prefix}description`} defaultValue={values.description || ''} rows={3} placeholder={service ? 'What will you create or do? Describe your approach and what is included.' : 'Tell sponsors about yourself, your audience, and the activation.'} required maxLength={1000} /></Field>
      <Field label="Deliverables & proof" hint="Be specific about what’s included, when it happens, and the public proof you’ll share."><textarea name={`${prefix}deliverables`} defaultValue={values.deliverables || ''} rows={3} placeholder={service ? 'Two hours of event photography and 20 edited images. Include usage rights and a link to public delivery proof.' : 'Wear the sponsor’s approved hoodie for 4 agreed hours in London. Proof: dated public photos showing the garment and location.'} required maxLength={500} /></Field>
      <Field label="Related X post (optional)" hint="Link a public post about this offer. It appears on the listing and in the Find creators X feed."><input name={`${prefix}xPostUrl`} type="url" defaultValue={values.xPostUrl || ''} placeholder="https://x.com/yourname/status/…" maxLength={250} /></Field>
      <div className="offer-extra-details offer-inline-details"><h4 className="offer-inline-heading">{service ? 'Event, dates & spots' : 'Event, dates, spots & merch'}</h4><OfferFields sponsorship={sponsorship && !service} kind={kind} initialEventId={initialEventId} initialValues={values} prefix={prefix} /></div>
    </fieldset>; })}
    {!listing && <section className="publish-review" aria-label="Review your offer before publishing">
      <h3>Review before publishing</h3>
      {reviewSections(reviewDraft, selected).map(section => <div className="publish-review-section" key={section.heading}><h4>{section.heading}</h4><dl>{section.rows.map(row => <div className="publish-review-row" key={row.label}><dt>{row.label}</dt><dd>{row.value}</dd></div>)}</dl></div>)}
      <p className="fine-print">USDC on Solana · Nothing publishes until you choose the button below. AdPad pays the Solana network fee for publishing, so you don’t need SOL.</p>
    </section>}
    <div className="subtle-notice"><Globe2 size={20} /><span>Your photo and offer details are public. Sponsors pay in USDC into escrow. You’re paid 24 hours after your proof is approved.</span></div>
    {(error || model.error) && <div className="form-error" role="alert">{error || model.error}</div>}
    {!model.user ? <button className="button primary full-width" type="button" disabled={!model.ready || !model.configured || busy} onClick={() => void model.signIn()}>Sign in to publish <ArrowRight size={18} /></button> : <button className="button primary full-width" disabled={busy || !model.configured || !selected.length || !model.xAccount} type="submit">{busy ? <LoaderCircle size={19} className="spin" /> : listing ? <Save size={19} /> : <Plus size={19} />}{busy ? listing ? 'Saving changes…' : 'Publishing…' : legacyReplacement ? pendingReplacement ? 'Finish updated version' : 'Publish updated version' : listing ? pendingEdit ? 'Finish saving changes' : 'Save changes' : pending ? 'Finish publishing' : selected.length === 2 ? 'Publish both offers' : selected[0] === 'service' ? 'Publish creator service' : 'Publish ad space'}</button>}
  </form>;
}
