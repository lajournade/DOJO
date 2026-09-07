/**
 * L'appui maintenu : le geste qui supprime.
 *
 * Une jauge se remplit sous le doigt, relacher avant la fin annule. Le pouce
 * n'efface donc rien par megarde, et aucune croix ne vient encombrer les cartes.
 */
import { useEffect, useRef, useState } from 'react';

/** Duree d'appui avant que la suppression soit proposee. */
export const HOLD_MS = 650;

export function useHold(onFire: () => void) {
  const [holding, setHolding] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  // L'appui a abouti : le clic du relachement ne doit pas jouer l'action normale.
  const fired = useRef(false);

  const cancel = () => {
    clearTimeout(timer.current);
    timer.current = undefined;
    setHolding(false);
  };

  useEffect(() => cancel, []);

  const props = {
    onPointerDown: () => {
      fired.current = false;
      setHolding(true);
      timer.current = setTimeout(() => {
        fired.current = true;
        setHolding(false);
        onFire();
      }, HOLD_MS) as unknown as number;
    },
    onPointerUp: cancel,
    onPointerLeave: cancel,
    onPointerCancel: cancel,
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  };

  /** Vrai quand le clic qui arrive vient de clore un appui long : a ignorer. */
  const consumed = () => {
    if (!fired.current) return false;
    fired.current = false;
    return true;
  };

  /** La jauge, a poser dans un parent en `relative overflow-hidden`. */
  const gauge = {
    className: 'pointer-events-none absolute bottom-0 left-0 h-1 bg-impact',
    style: {
      width: holding ? '100%' : '0%',
      transition: holding ? `width ${HOLD_MS}ms linear` : 'none',
    } as React.CSSProperties,
  };

  return { holding, consumed, props, gauge };
}
