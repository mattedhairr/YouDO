/** Emoji or single-char avatars from profiles; HTTPS URLs render as images. */
function isProfileImageUrl(value?: string | null): boolean {
  return Boolean(value && /^https?:\/\//i.test(value));
}

function profileAvatarGlyph(value?: string | null, displayName?: string): string {
  if (value && !isProfileImageUrl(value)) return value;
  const initial = displayName?.trim().charAt(0);
  return initial ? initial.toUpperCase() : '?';
}

/** 'photo', 'emoji' (anything set that isn't a link) or 'initial' (nothing set). */
export function avatarKind(value?: string | null): 'photo' | 'emoji' | 'initial' {
  if (isProfileImageUrl(value)) return 'photo';
  return value && value.trim() ? 'emoji' : 'initial';
}

/** The Founding Backer's heart seal, for big pictures; the parent must be positioned. */
export function BackerSeal() {
  return (
    <span className="yd-backer-seal" aria-hidden="true">
      <svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 21s-7.5-4.6-9.5-9.2C1.2 8.7 3.2 5 6.7 5c2 0 3.5 1.1 4.3 2.5C11.8 6.1 13.3 5 15.3 5c3.5 0 5.5 3.7 4.2 6.8C19.5 16.4 12 21 12 21z" /></svg>
    </span>
  );
}

export function ProfileAvatarVisual({
  avatarUrl,
  displayName,
  className = '',
  imgClassName = 'w-full h-full object-cover',
}: {
  avatarUrl?: string | null;
  displayName?: string;
  className?: string;
  imgClassName?: string;
}) {
  if (isProfileImageUrl(avatarUrl)) {
    return <img src={avatarUrl!} alt="" className={imgClassName} />;
  }
  return (
    <span className={className} aria-hidden="true">
      {profileAvatarGlyph(avatarUrl, displayName)}
    </span>
  );
}
