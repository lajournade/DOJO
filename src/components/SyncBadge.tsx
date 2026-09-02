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
        className="bevel-sm keycap bg-ink-2 px-2 py-2"
      >
        <Speaker muted={muted} />
      </button>

      {status !== 'idle' && (
        <button
          type="button"
          onClick={() => void flush()}
          className={`bevel-sm keycap fight-text px-2 py-2 text-p1 ${
            status === 'offline' ? 'bg-blood/30 text-impact' : 'bg-ink-2 text-ash'
          }`}
        >
          {status === 'offline' ? `hors ligne ${pending}` : 'sync'}
        </button>
      )}
    </div>
  );
}

/** Haut-parleur dessine sur une grille de 12 pixels, comme le reste de l'interface. */
function Speaker({ muted }: { muted: boolean }) {
  const fill = muted ? 'var(--color-ash)' : 'var(--color-impact)';
  return (
    <svg width="24" height="24" viewBox="0 0 12 12" shapeRendering="crispEdges" aria-hidden>
      <rect x="1" y="4" width="2" height="4" fill={fill} />
      <rect x="3" y="3" width="1" height="6" fill={fill} />
      <rect x="4" y="2" width="1" height="8" fill={fill} />
      <rect x="5" y="1" width="1" height="10" fill={fill} />
      {muted ? (
        <>
          <rect x="7" y="3" width="1" height="1" fill="var(--color-blood-hot)" />
          <rect x="8" y="4" width="1" height="1" fill="var(--color-blood-hot)" />
          <rect x="9" y="5" width="1" height="2" fill="var(--color-blood-hot)" />
          <rect x="8" y="7" width="1" height="1" fill="var(--color-blood-hot)" />
          <rect x="7" y="8" width="1" height="1" fill="var(--color-blood-hot)" />
          <rect x="10" y="3" width="1" height="1" fill="var(--color-blood-hot)" />
          <rect x="9" y="4" width="1" height="1" fill="var(--color-blood-hot)" />
          <rect x="9" y="7" width="1" height="1" fill="var(--color-blood-hot)" />
          <rect x="10" y="8" width="1" height="1" fill="var(--color-blood-hot)" />
        </>
      ) : (
        <>
          <rect x="7" y="4" width="1" height="4" fill={fill} />
          <rect x="9" y="2" width="1" height="8" fill={fill} />
        </>
      )}
    </svg>
  );
}
