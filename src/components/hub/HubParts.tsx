import type { ReactNode } from 'react';
import { ChevronLeft } from 'lucide-react';
import { BackerSeal, ProfileAvatarVisual } from '../../lib/profileAvatar';
import './hub.css';

/** A round avatar: photo, emoji or initial, with an optional status dot. A
 *  Founding Backer gets the gold ring (and the heart seal when large). */
export function HubAvatar({
  url,
  name,
  size = 'md',
  dot,
  backer = false,
}: {
  url?: string | null;
  name?: string;
  size?: 'lg' | 'md' | 'sm' | 'xs';
  dot?: 'unread' | 'live';
  backer?: boolean;
}) {
  return (
    <span className={`hub-avatar ${size === 'md' ? '' : `is-${size}`} ${backer ? 'yd-backer-ring' : ''}`}>
      {/* Only the picture is clipped round, so the dot sits whole on the edge. */}
      <span className="hub-avatar-clip">
        <ProfileAvatarVisual avatarUrl={url} displayName={name} />
      </span>
      {backer && <span className="sr-only">Founding Backer</span>}
      {backer && size === 'lg' && !dot && <BackerSeal />}
      {dot && <span className={`hub-avatar-dot ${dot === 'live' ? 'is-live' : ''}`} aria-hidden />}
    </span>
  );
}

export function HubAvatarStack({ people, max = 4 }: { people: { id: string; avatar_url?: string | null; display_name?: string }[]; max?: number }) {
  if (!people.length) return null;
  return (
    <span className="hub-avatar-stack" aria-hidden>
      {people.slice(0, max).map((p) => (
        <HubAvatar key={p.id} url={p.avatar_url} name={p.display_name} size="xs" />
      ))}
    </span>
  );
}

export function HubSection({
  title,
  aside,
  footer,
  children,
}: {
  title?: string;
  aside?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="hub-section">
      {(title || aside) && (
        <div className="hub-section-header">
          {title && <h3 className="hub-section-title">{title}</h3>}
          {aside != null && <span className="hub-section-aside">{aside}</span>}
        </div>
      )}
      {children}
      {footer && <p className="hub-section-footer">{footer}</p>}
    </section>
  );
}

export function HubEmpty({
  icon,
  title,
  text,
  action,
}: {
  icon: ReactNode;
  title: string;
  text?: string;
  action?: ReactNode;
}) {
  return (
    <div className="hub-empty">
      <span className="hub-empty-icon" aria-hidden>{icon}</span>
      <p className="hub-empty-title">{title}</p>
      {text && <p className="hub-empty-text">{text}</p>}
      {action}
    </div>
  );
}

/** Top bar of a full-screen hub page: back, centred title, trailing actions. */
export function HubNavBar({
  title,
  subtitle,
  onBack,
  backLabel = 'Back',
  actions,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  onBack: () => void;
  backLabel?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="hub-nav">
      <button type="button" className="hub-nav-back" onClick={onBack} aria-label={backLabel}>
        <ChevronLeft size={26} strokeWidth={2.2} />
      </button>
      <div className="hub-nav-title">
        <strong>{title}</strong>
        {subtitle && <span>{subtitle}</span>}
      </div>
      <div className="hub-nav-actions">{actions}</div>
    </header>
  );
}
