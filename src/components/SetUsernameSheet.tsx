import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { fetchProfile, upsertProfile } from '../lib/profiles';
import { ArrowRight, Loader2 } from 'lucide-react';
import Overlay from './Overlay';

export default function SetUsernameSheet({
  onUsernameSet,
}: {
  onUsernameSet: () => void;
}) {
  const { user } = useAuth();
  const [username, setUsername] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (!user) return;
    const checkProfile = async () => {
      const p = await fetchProfile(user.id);
      if (!p?.username) {
        setIsOpen(true);
      } else {
        onUsernameSet();
      }
    };
    void checkProfile();
  }, [user, onUsernameSet]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !user) return;
    
    // Quick regex validation to match backend constraint
    if (!/^[a-z0-9_]+$/.test(username.toLowerCase())) {
      setError('Username can only contain letters, numbers, and underscores.');
      return;
    }

    setSaving(true);
    setError('');

    const { ok, error: saveError } = await upsertProfile({
      id: user.id,
      username: username.toLowerCase().trim(),
      display_name: username.trim(),
    });

    if (ok) {
      setIsOpen(false);
      onUsernameSet();
    } else {
      setError(saveError || 'Failed to save username. It might be taken!');
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <Overlay open={true} align="full" scrim={true}>
      <div className="bg-base w-full h-full flex flex-col justify-center px-6">
        <div className="max-w-md w-full mx-auto">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-content-primary mb-2">Claim your username</h1>
            <p className="text-content-secondary">
              Before you continue, you need a unique username so friends can find you.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-content-tertiary text-lg font-bold">@</span>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="username"
                  maxLength={20}
                  autoFocus
                  className="w-full bg-surface border-2 border-subtle rounded-2xl py-4 pl-10 pr-4 text-lg font-bold text-content-primary focus:border-primary focus:outline-none transition-colors"
                />
              </div>
              {error && <p className="text-error text-sm mt-2 ml-2 font-medium">{error}</p>}
            </div>

            <button
              type="submit"
              disabled={saving || !username.trim()}
              className="w-full bg-primary text-on-primary py-4 rounded-2xl font-bold text-lg flex items-center justify-center gap-2 active:scale-[0.98] transition-transform disabled:opacity-50"
            >
              {saving ? (
                <Loader2 className="animate-spin" size={24} />
              ) : (
                <>
                  Continue <ArrowRight size={20} />
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </Overlay>
  );
}
