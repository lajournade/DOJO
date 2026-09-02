/**
 * Rendu d'un sprite : un <rect> par suite horizontale de pixels, en SVG plutot
 * qu'en canvas. Pas de boucle de dessin a piloter, la permutation de palette
 * n'est qu'un rendu de plus, et l'echelle reste entiere donc la grille tient.
 */
import { useEffect, useState } from 'react';
import { useReducedMotion } from 'motion/react';
import type { Palette, Sprite as SpriteData } from '../fx/sprites';

interface Props {
  sprite: SpriteData;
  palette: Palette;
  /** Index de frame ; au-dela du nombre de frames, la derniere est conservee. */
  frame?: number;
  /** Silhouette blanche : l'eclair d'encaissement, une poignee de millisecondes. */
  flash?: boolean;
  flip?: boolean;
  /** Facteur entier : un pixel du dessin vaut exactement `scale` pixels a l'ecran. */
  scale?: number;
  /** Cadrage vertical, en pixels du dessin — pour ne montrer que le buste. */
  cropY?: number;
  cropH?: number;
  className?: string;
}

export function Sprite({
  sprite,
  palette,
  frame = 0,
  flash = false,
  flip = false,
  scale = 3,
  cropY = 0,
  cropH,
  className,
}: Props) {
  const runs = sprite.frames[Math.min(frame, sprite.frames.length - 1)];
  const h = cropH ?? sprite.h;

  return (
    <svg
      aria-hidden
      className={className}
      width={sprite.w * scale}
      height={h * scale}
      viewBox={`0 ${cropY} ${sprite.w} ${h}`}
      shapeRendering="crispEdges"
      style={flip ? { transform: 'scaleX(-1)' } : undefined}
    >
      {runs.map((run, i) => (
        <rect
          key={i}
          x={run.x}
          y={run.y}
          width={run.w}
          height={1}
          fill={flash ? '#ffffff' : palette[run.key]}
        />
      ))}
    </svg>
  );
}

/**
 * Alternance de frames a cadence fixe. Sous « animations reduites », le sprite
 * se fige sur la premiere frame : l'information reste, le mouvement part.
 */
export function useFrame(count: number, fps: number): number {
  const reduced = useReducedMotion();
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (reduced || count < 2) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % count), 1000 / fps);
    return () => clearInterval(id);
  }, [count, fps, reduced]);

  return reduced ? 0 : index;
}
