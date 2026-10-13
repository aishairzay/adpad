export type Draft = { publisher?: string; xHandle?: string; offers: Record<string, Record<string, string | number | boolean>> };
const limits: Record<string, number> = { title: 80, channel: 100, audience: 250, description: 1000, deliverables: 500, eventId: 120, eventName: 120, clothingDetails: 500, xPostUrl: 250 };
const categories: Record<string, string[]> = { placement: ['Event', 'T-shirts', 'Hats', 'X / Social', 'Other', 'Newsletter', 'Podcast', 'Community', 'Website'], service: ['Photography', 'Video', 'Design', 'Content', 'Hosting', 'Music', 'Community', 'Development', 'Other'] };
export function cleanDraft(value: unknown): Draft {
  const result: Draft = { offers: {} };
  if (!value || typeof value !== 'object') return result;
  const source = value as Record<string, any>;
  for (const key of ['publisher', 'xHandle'] as const) if (typeof source[key] === 'string') result[key] = source[key].slice(0, key === 'publisher' ? 80 : 250);
  for (const kind of ['placement', 'service']) {
    const offer = source.offers?.[kind];
    if (!offer || typeof offer !== 'object') continue;
    const fields: Record<string, string | number | boolean> = {};
    for (const [key, limit] of Object.entries(limits)) if (typeof offer[key] === 'string') fields[key] = offer[key].slice(0, limit);
    if (categories[kind].includes(offer.category)) fields.category = offer.category;
    for (const [key, max] of [['priceMicro', 1000000000000], ['turnaroundDays', 90], ['capacity', 100], ['startsAt', 4102444800], ['endsAt', 4102444800], ['supplyBy', 4102444800]] as const) if (Number.isSafeInteger(offer[key]) && offer[key] > 0 && offer[key] <= max) fields[key] = offer[key];
    if (kind === 'placement' && ['sponsor', 'creator', 'existing'].includes(offer.clothingSource)) fields.clothingSource = offer.clothingSource;
    // Event attendance and Sponsor me are always explicit choices in the review form.
    result.offers[kind] = fields;
  }
  return result;
}

export function readMessages(value: unknown): { role: 'user' | 'assistant'; content: string }[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 30) throw new Error('Please review your draft in the form to continue.');
  let total = 0;
  const messages = value.map(item => {
    if (!item || !['user', 'assistant'].includes(item.role) || typeof item.content !== 'string' || !item.content.trim() || item.content.length > 2000) throw new Error('Please keep each answer under 2,000 characters.');
    total += item.content.length;
    return { role: item.role as 'user' | 'assistant', content: item.content };
  });
  if (total > 24000 || messages.at(-1)?.role !== 'user') throw new Error('Please review your draft in the form to continue.');
  return messages;
}
