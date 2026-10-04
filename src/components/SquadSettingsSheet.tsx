import { useState, useEffect } from 'react';
import { X, Search, UserPlus, LogOut } from 'lucide-react';
import Overlay from './Overlay';
import { useAuth } from '../contexts/AuthContext';
import { kickMember, inviteUserToSquad, type Squad } from '../lib/squads';
import { searchProfileByUsername, type Profile } from '../lib/profiles';

interface Props {
  open: boolean;
  onClose: () => void;
  squad: Squad;
  members: any[];
  onMembersChanged: () => void;
}

export default function SquadSettingsSheet({ open, onClose, squad, members, onMembersChanged }: Props) {
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState<Profile[]>([]);
  const [searching, setSearching] = useState(false);
  
  const isOwner = squad.created_by === user?.id;

  if (!open) return null;

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!search.trim()) return;
    setSearching(true);
    const results = await searchProfileByUsername(search.trim());
    setSearchResults(results);
    setSearching(false);
  };

  const handleInvite = async (userId: string) => {
    await inviteUserToSquad(squad.id, userId);
    setSearch('');
    setSearchResults([]);
    onMembersChanged();
    alert('Invite sent!');
  };

  const handleKick = async (userId: string) => {
    if (confirm('Are you sure you want to kick this member?')) {
      await kickMember(squad.id, userId);
      onMembersChanged();
    }
  };

  const acceptedMembers = members.filter(m => m.status === 'accepted');
  const invitedMembers = members.filter(m => m.status === 'invited');

  return (
    <Overlay open={open} onClose={onClose}>
      <div className="bg-[var(--bg-surface)] w-full max-w-md mx-auto rounded-[24px] flex flex-col max-h-[85vh] sm:my-auto mb-4">
        {/* Header */}
        <div className="flex justify-between items-center p-4 pb-2 border-b border-subtle">
          <div className="w-10" />
          <h2 className="text-[14px] font-bold text-content-primary">Manage Squad</h2>
          <button onClick={onClose} className="p-2 -mr-2 text-content-secondary hover:text-content-primary rounded-full hover:bg-elevated transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {/* Invite Section */}
          {isOwner && (
            <div className="mb-6">
              <h3 className="text-[11px] font-semibold uppercase tracking-widest text-content-muted mb-3">
                Invite Members
              </h3>
              <form onSubmit={handleSearch} className="relative">
                <input
                  type="text"
                  placeholder="Search by username..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full h-11 bg-elevated border border-subtle rounded-xl pl-10 pr-4 text-sm outline-none focus:border-primary transition-colors"
                />
                <Search size={16} className="absolute left-3.5 top-3.5 text-content-muted" />
              </form>

              {searching && <p className="text-center text-[12px] text-content-muted mt-3">Searching...</p>}
              
              {!searching && searchResults.length > 0 && (
                <div className="mt-3 space-y-2">
                  {searchResults.map(p => {
                    const isAlreadyMember = members.some(m => m.user_id === p.id);
                    return (
                      <div key={p.id} className="flex items-center justify-between p-3 bg-elevated border border-subtle rounded-xl">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-primary-soft text-primary font-bold flex items-center justify-center">
                            {p.avatar_url || '🎓'}
                          </div>
                          <div>
                            <p className="text-[13px] font-bold text-content-primary">{p.display_name}</p>
                            <p className="text-[11px] text-primary">@{p.username}</p>
                          </div>
                        </div>
                        <button
                          disabled={isAlreadyMember}
                          onClick={() => handleInvite(p.id)}
                          className="h-8 px-3 rounded-lg bg-primary text-on-primary text-[12px] font-bold disabled:opacity-50"
                        >
                          {isAlreadyMember ? 'Joined' : 'Invite'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Members List */}
          <div>
            <h3 className="text-[11px] font-semibold uppercase tracking-widest text-content-muted mb-3">
              Members ({acceptedMembers.length}/4)
            </h3>
            <div className="space-y-2">
              {acceptedMembers.map(m => (
                <div key={m.user_id} className="flex items-center justify-between p-3 bg-elevated border border-subtle rounded-xl">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-primary-soft text-primary font-bold flex items-center justify-center text-sm">
                      {m.profiles?.avatar_url || '🎓'}
                    </div>
                    <div>
                      <p className="text-[13px] font-bold text-content-primary">
                        {m.profiles?.display_name}
                        {m.role === 'admin' && <span className="ml-2 text-[10px] text-primary bg-primary-soft px-1.5 py-0.5 rounded-md">Admin</span>}
                      </p>
                      <p className="text-[11px] text-content-secondary">@{m.profiles?.username}</p>
                    </div>
                  </div>
                  
                  {isOwner && m.user_id !== user?.id && (
                    <button
                      onClick={() => handleKick(m.user_id)}
                      className="text-error hover:bg-error-soft p-1.5 rounded-md transition-colors"
                      title="Kick member"
                    >
                      <LogOut size={16} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
          
          {/* Invited List */}
          {invitedMembers.length > 0 && (
            <div className="mt-6">
              <h3 className="text-[11px] font-semibold uppercase tracking-widest text-content-muted mb-3">
                Pending Invites
              </h3>
              <div className="space-y-2 opacity-75">
                {invitedMembers.map(m => (
                  <div key={m.user_id} className="flex items-center justify-between p-3 bg-surface border border-dashed border-subtle rounded-xl">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-base text-content-muted font-bold flex items-center justify-center text-sm">
                        {m.profiles?.avatar_url || '🎓'}
                      </div>
                      <div>
                        <p className="text-[13px] font-bold text-content-primary">
                          {m.profiles?.display_name}
                        </p>
                        <p className="text-[11px] text-content-secondary">@{m.profiles?.username}</p>
                      </div>
                    </div>
                    <span className="text-[11px] font-semibold text-content-muted">Invited</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </Overlay>
  );
}
