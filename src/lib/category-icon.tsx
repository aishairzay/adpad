import { AudioLines, CalendarDays, Globe2, Mail, MessageCircle, Shirt, Sparkles, Users } from 'lucide-react';

/** One icon per listing category, shared by every listing card (home, Sponsor someone, Buy attention). */
export function CategoryIcon({ category, size = 18 }: { category: string; size?: number }) {
  const Icon = category === 'Event' ? CalendarDays
    : category === 'T-shirts' || category === 'Hats' ? Shirt
    : category === 'Other' ? Sparkles
    : category === 'Newsletter' ? Mail
    : category === 'X / Social' ? MessageCircle
    : category === 'Podcast' ? AudioLines
    : category === 'Community' ? Users
    : Globe2;
  return <Icon size={size} strokeWidth={1.7} aria-hidden="true" />;
}

/** "1 day", "7 days". */
export const dayCount = (days: number) => `${days} ${days === 1 ? 'day' : 'days'}`;
