import { useState, useEffect } from 'react';
import { Lock, UsersRound } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import Toggle from './Toggle';
import type { Squad } from '../lib/squads';

interface Props {
  personalPace: number;
  onOpenRoom: (squadId: string) => void;
}

export default function RoomsView({ personalPace, onOpenRoom }: Props) {
  const { user } = useAuth();
  const [compatibleOnly, setCompatibleOnly] = useState(true);
  const [rooms, setRooms] = useState<Squad[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchRooms() {
      setLoading(true);
      // Fetch all public rooms (allow_join_requests = true)
      const { data, error } = await supabase
        .from('squads')
        .select('*')
        .eq('allow_join_requests', true)
        .order('created_at', { ascending: false });

      if (data) {
        setRooms(data);
      }
      setLoading(false);
    }
    fetchRooms();
  }, []);

  const filteredRooms = compatibleOnly 
    ? rooms.filter(r => r.bar_hours === personalPace)
    : rooms;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between px-1">
        <h3 className="text-[12px] font-bold text-content-primary uppercase tracking-wider">Discover Squads</h3>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-content-muted font-medium">Compatible Pace Only</span>
          <Toggle checked={compatibleOnly} onChange={setCompatibleOnly} />
        </div>
      </div>

      {loading ? (
        <p className="text-center text-[12px] text-content-muted py-6">Finding squads...</p>
      ) : filteredRooms.length === 0 ? (
        <div className="py-8 flex flex-col items-center justify-center text-center text-content-muted border border-dashed border-subtle rounded-2xl bg-elevated/30">
          <UsersRound size={24} className="mb-3 opacity-50" />
          <p className="text-[13px] font-medium text-content-primary">No squads found</p>
          <p className="text-[11px] mt-1 max-w-[200px] mx-auto">
            {compatibleOnly 
              ? `No public squads with a ${personalPace}h/day pace.`
              : 'There are no public squads yet.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredRooms.map(room => (
            <div
              key={room.id}
              onClick={() => onOpenRoom(room.id)}
              className={`bg-elevated border rounded-[18px] p-4 cursor-pointer transition-all group ${
                room.bar_hours === personalPace 
                  ? 'border-subtle hover:border-primary/40 active:scale-[0.99]' 
                  : 'border-error/20 opacity-70 hover:opacity-100 bg-error-soft/10'
              }`}
            >
              <div className="flex items-start justify-between gap-2 mb-2.5">
                <div className="flex items-center gap-3">
                  <div className="text-2xl">{room.description || '🔥'}</div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <Lock size={13} className="text-content-muted" />
                      <h3 className="text-[14px] font-bold text-content-primary group-hover:text-primary transition-colors">
                        {room.name}
                      </h3>
                    </div>
                  </div>
                </div>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 border ${
                  room.bar_hours === personalPace
                    ? 'bg-primary-soft text-primary border-primary/20'
                    : 'bg-error-soft text-error border-error/20'
                }`}>
                  🎯 {room.bar_hours}h/day
                </span>
              </div>

              {room.bar_hours !== personalPace && (
                <div className="mt-3 pt-3 border-t border-error/10">
                  <p className="text-[11px] text-error font-semibold text-center">
                    Incompatible pace. You cannot join this squad.
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
