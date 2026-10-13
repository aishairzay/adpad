import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { ArrowRight, ImagePlus, LoaderCircle, Upload } from 'lucide-react';
import type { AdPadModel, ProfileInput } from './types';
import { validateListingImage } from './lib/listing-images';
import { XLinkStatus } from './XLink';
import { safePublicUrl } from './lib/sponsorship';
import './profile-editor.css';

export default function ProfileEditor({ model, onSuccess }: { model: AdPadModel; onSuccess: () => void }) {
  const existing = model.profiles.find(profile => profile.owner === model.user?.id);
  const [image, setImage] = useState<File>();
  const [objectUrl, setObjectUrl] = useState<string>();
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!image) { setObjectUrl(undefined); return; }
    const url = URL.createObjectURL(image);
    setObjectUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [image]);
  const savedImage = safePublicUrl(existing?.imageUrl);
  const preview = objectUrl || savedImage;
  const choosePhoto = (file: File | undefined | null, input?: HTMLInputElement) => {
    if (!file) return;
    try {
      validateListingImage(file);
      setImage(file);
      setError(null);
    } catch (caught) {
      if (input) input.value = '';
      setImage(undefined);
      setError(caught instanceof Error ? caught.message : 'Choose a valid photo.');
    }
  };
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError(null);
    const form = new FormData(event.currentTarget);
    const value = (key: string) => String(form.get(key) || '').trim();
    const input: ProfileInput = { name: value('name'), bio: value('bio'), location: value('location'), website: value('website'), socialUrl: value('socialUrl'), profileType: value('profileType') as ProfileInput['profileType'] };
    if (await model.saveProfile(input, image)) onSuccess();
  };
  return <form className="dialog-content" onSubmit={submit}>
    <p className="form-intro">One public profile for your sponsorships, skills, and completed collaborations. People can share your page directly.</p>
    <label className="field"><span>Display name</span><input name="name" required maxLength={80} defaultValue={existing?.name || ''} placeholder="Your name, crew, or company" /></label>
    <div className="form-row"><label className="field"><span>Profile type</span><select name="profileType" defaultValue={existing?.profileType || 'person'}><option value="person">Person / creator / studio</option><option value="brand">Sponsor / advertiser / brand</option></select><small>Sponsor profiles appear in the brand directory.</small></label><label className="field"><span>Location</span><input name="location" maxLength={100} defaultValue={existing?.location || ''} placeholder="London / remote" /></label></div>
    <label className="field"><span>Your story</span><textarea name="bio" rows={4} maxLength={500} defaultValue={existing?.bio || ''} placeholder="What do you do, where are you headed, and what makes working with you interesting?" /></label>
    <div className="field profile-x-field"><span>Your X account — public contact</span><XLinkStatus model={model} unlink />{existing?.xHandle && !existing.verifiedXId && <small>@{existing.xHandle} was typed in, not verified, so it is no longer shown. Link that X account to show it as verified.</small>}<small>The X account you linked is featured on your creator or sponsor profile. It is verified through X, so nobody can claim a handle they don’t own.</small></div>
    <label className="field"><span>Website (optional)</span><input name="website" type="url" maxLength={250} defaultValue={existing?.website || ''} placeholder="https://…" /></label>
    <label className="field"><span>Other social profile (optional)</span><input name="socialUrl" type="url" maxLength={250} defaultValue={existing?.socialUrl || ''} placeholder="https://…" /></label>
    <div className="field profile-photo-field">
      <span>{existing?.imageUrl ? 'Replace profile photo (optional)' : 'Profile photo (optional)'}</span>
      <div className={`image-uploader profile-image-uploader ${preview ? 'has-image' : ''}`} onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); choosePhoto(event.dataTransfer.files?.[0]); }}>
        <input id="profile-photo-input" type="file" accept="image/jpeg,image/png,image/webp,image/avif" className="sr-only" onChange={event => choosePhoto(event.target.files?.[0], event.target)} />
        <label htmlFor="profile-photo-input">{preview ? <><img src={preview} alt="Profile photo preview" /><span className="image-replace"><Upload size={18} />Replace photo</span></> : <><ImagePlus size={32} strokeWidth={1.4} aria-hidden="true" /><strong>Show who you are.</strong><span>Choose a photo of you, your crew or your brand</span><small>JPG, PNG, WebP or AVIF · Up to 5 MB</small></>}</label>
      </div>
      <small>{image?.name || 'JPG, PNG, WebP or AVIF · Up to 5 MB. Your offer photo is used when no profile photo is set.'}</small>
    </div>
    <p className="fine-print">Profile details are public. Your X account is verified through X; everything else is self-reported. Ad Pad records funding and completed work separately. Don’t include your home address or private contact details.</p>
    {(error || model.error) && <div className="form-error" role="alert">{error || model.error}</div>}
    {!model.user ? <button type="button" className="button primary" onClick={() => void model.signIn()}>Sign in to save your profile <ArrowRight size={17} /></button> : <button className="button primary" disabled={model.busy || Boolean(error) || !model.xAccount}>{model.busy && <LoaderCircle className="spin" size={17} />}Save public profile <ArrowRight size={17} /></button>}
  </form>;
}