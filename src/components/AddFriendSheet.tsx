import { useState } from 'react';
import { Search, X, UserPlus, Check } from 'lucide-react';
import Overlay from './Overlay';
import { searchProfileByUsername, sendFriendRequest, type Profile } from '../lib/profiles';
import { useAuth } from '../contexts/AuthContext';

interface Props {
  open: boolean;
  onClose: () => void;
  onOpenProfile: (userId: string) => void;
}

export default function AddFriendSheet({ open, onClose, onOpenProfile }: Props) {
  const { user } = useAuth();
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [result, setResult] = useState<Profile | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [requestSent, setRequestSent] = useState(false);

  if (!open) return null;

  const handleSearch = async () => {
    if (!query.trim()) return;
    setSearching(true);
    setResult(null);
    setErrorMsg('');
    setRequestSent(false);
    
    const profile = await searchProfileByUsername(query.trim());
    if (profile) {
      setResult(profile);
    } else {
      setErrorMsg('User not found.');
    }
    setSearching(false);
  };

  const handleSendRequest = async () => {
    if (!user || !result) return;
    const res = await sendFriendRequest(user.id, result.id);
    if (res.ok) {
      setRequestSent(true);
    } else {
      setErrorMsg(res.error || 'Failed to send request.');
    }
  };

  return (
    <Overlay open={open} onClose={onClose}>
      <div className="bg-[var(--bg-surface)] w-full max-w-md mx-auto rounded-[24px] flex flex-col max-h-[85vh] sm:my-auto mb-4">
        {/* Header */}
        <div className="flex justify-between items-center p-4 pb-2 border-b border-subtle">
          <div className="w-10" />
          <h2 className="text-[14px] font-bold text-content-primary">Add Friend</h2>
          <button onClick={onClose} className="p-2 -mr-2 text-content-secondary hover:text-content-primary rounded-full hover:bg-elevated transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="p-5 flex flex-col gap-4">
          <p className="text-[12px] text-content-secondary text-center">
            Search for a companion by their unique @username
          </p>

          <form onSubmit={(e) => { e.preventDefault(); handleSearch(); }} className="relative flex items-center">
            <Search size={16} className="absolute left-3 text-content-muted" />
            <input
              type="text"
              placeholder="e.g. @alex_study"
              value={query}
              onChange={e => setQuery(e.target.value)}
              className="w-full bg-elevated border border-subtle rounded-xl pl-9 pr-3 py-2.5 text-sm text-content-primary focus:outline-none focus:border-primary"
            />
          </form>

          {searching && <p className="text-center text-[12px] text-content-muted mt-4">Searching...</p>}
          
          {errorMsg && !result && (
            <p className="text-center text-[12px] text-red-500 mt-4">{errorMsg}</p>
          )}

          {result && (
            <div className="mt-4 bg-elevated border border-subtle rounded-2xl p-4 flex flex-col gap-4">
              <div 
                className="flex items-center gap-3 cursor-pointer"
                onClick={() => {
                  onClose();
                  onOpenProfile(result.id);
                }}
              >
                <div className="w-12 h-12 shrink-0 rounded-full bg-primary-soft text-primary text-xl font-bold flex items-center justify-center border border-primary/20">
                  {result.avatar_url || '🎓'}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-[14px] font-bold text-content-primary truncate">{result.display_name}</h3>
                  <p className="text-[11px] font-medium text-primary truncate">@{result.username}</p>
                </div>
              </div>

              {errorMsg && <p className="text-[11px] text-red-500 text-center">{errorMsg}</p>}

              
            </div>
          )}
        </div>
      </div>
    </Overlay>
  );
}
