/** Emoji or single-char avatars from profiles; HTTPS URLs render as images. */
function isProfileImageUrl(value?: string | null): boolean {
  return Boolean(value && /^https?:\/\//i.test(value));
}

function profileAvatarGlyph(value?: string | null, displayName?: string): string {
  if (value && !isProfileImageUrl(value)) return value;
  const initial = displayName?.trim().charAt(0);
  return initial ? initial.toUpperCase() : '?';
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
