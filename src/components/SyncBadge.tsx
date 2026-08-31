/**
 * Etat de la synchronisation. Discret par construction : perdre le reseau en
 * pleine seance ne doit jamais interrompre la saisie.
 */
import { sfx, isMuted, toggleMute } from '../fx/audio';
import { useState } from 'react';
import { useStore } from '../store/state';
import { flush } from '../store/sync';

export function SyncBadge() {
  const { status, pending } = useStore();
  const [muted, setMuted] = useState(isMuted);

  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={() => {
          const next = toggleMute();
          setMuted(next);
          if (!next) sfx.select();
        }}
        aria-label={muted ? 'activer le son' : 'couper le son'}
        className="bevel-sm bg-ink-2 px-2.5 py-2 text-[0.8rem] active:bg-ink-3"
      >
        {muted ? '🔇' : '🔊'}
      </button>

      {status !== 'idle' && (
        <button
          type="button"
          onClick={() => void flush()}
          className={`bevel-sm px-2.5 py-2 text-[0.68rem] font-bold ${
            status === 'offline' ? 'bg-blood/20 text-blood-hot' : 'bg-ink-2 text-ash'
          }`}
        >
          {status === 'offline' ? `hors ligne · ${pending}` : 'sync…'}
        </button>
      )}
    </div>
  );
}
