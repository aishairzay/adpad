type BrandLockupProps = {
  compact?: boolean;
  className?: string;
};

export function PoweredByOpenApps({ inverse = false }: { inverse?: boolean }) {
  return <span className={`powered-by-openapps${inverse ? ' powered-by-openapps-inverse' : ''}`} aria-hidden="true">
    <span>Powered by</span>
    <img src="/brand/openapps-wordmark.svg" width="5432" height="1065" alt="" />
  </span>;
}

export function BrandLockup({ compact = false, className = '' }: BrandLockupProps) {
  return <span className={`brand-lockup${compact ? ' brand-lockup-compact' : ''}${className ? ` ${className}` : ''}`}>
    <img className="brand-wordmark" width="704" height="183" src="/brand/adpad-symbol-and-wordmark.webp" alt="" />
    <PoweredByOpenApps />
  </span>;
}

export function EventNavMarks() {
  return <span className="event-nav-marks" aria-hidden="true">
    <img className="event-nav-hacker" src="/events/hacker-house-london-mark.png" width="768" height="768" alt="" />
    <img className="event-nav-breakpoint" src="/events/breakpoint-2026-mark.webp" width="244" height="90" alt="" />
  </span>;
}
