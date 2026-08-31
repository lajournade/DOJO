/** Secousse d'ecran, dosee sur la puissance du coup (0 a 1). */
import { useCallback, useRef, useState } from 'react';

export function useShake() {
  const [state, setState] = useState({ key: 0, intensity: 0 });
  const timer = useRef<number | undefined>(undefined);

  const shake = useCallback((power: number) => {
    setState((s) => ({ key: s.key + 1, intensity: 3 + Math.min(1, Math.max(0, power)) * 11 }));
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setState((s) => ({ ...s, intensity: 0 })), 440) as unknown as number;
  }, []);

  const props = {
    className: state.intensity ? 'shaking' : undefined,
    style: { '--shake': state.intensity } as React.CSSProperties,
    key: state.key,
  };

  return { shake, props };
}
