/**
 * Progression d'un exercice : charge maximale par seance, dans l'ordre du temps.
 *
 * Tout est trace sur la grille : coordonnees entieres, `crispEdges` pour couper
 * l'anti-crenelage, points carres, aire remplie d'un tramage plutot que d'un
 * aplat transparent. La largeur est fixe pour que le dessin reste au 1:1 —
 * l'etirer a la largeur du conteneur flouterait la police bitmap.
 */
import { useState } from 'react';

export interface Point {
  date: string;
  label: string;
  value: number;
}

const W = 320;
const H = 140;
const PAD = { top: 16, right: 12, bottom: 24, left: 32 };

const INK = '#101830';
const BONE = '#f5f0e6';
const ASH = '#8fa0c8';
const IMPACT = '#ffd400';
const BLOOD = '#e01b24';

export function ProgressChart({ points, unit = 'kg' }: { points: Point[]; unit?: string }) {
  const [active, setActive] = useState<number | null>(null);

  if (points.length < 2) {
    return (
      <p className="py-6 text-center text-p2 text-ash">
        Pas encore assez de séances pour tracer une progression.
      </p>
    );
  }

  const values = points.map((p) => p.value);
  const max = Math.max(...values);
  const min = Math.min(...values);
  // Une echelle un peu plus large que les donnees : la ligne ne colle jamais aux bords.
  const top = max + Math.max(1, (max - min) * 0.25);
  const bottom = Math.max(0, min - Math.max(1, (max - min) * 0.25));
  const span = top - bottom || 1;

  const x = (i: number) => Math.round(PAD.left + (i * (W - PAD.left - PAD.right)) / (points.length - 1));
  const y = (v: number) => Math.round(PAD.top + (1 - (v - bottom) / span) * (H - PAD.top - PAD.bottom));

  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i)} ${y(p.value)}`).join(' ');
  const area = `${line} L${x(points.length - 1)} ${H - PAD.bottom} L${x(0)} ${H - PAD.bottom} Z`;

  const lastIndex = points.length - 1;
  const recordIndex = values.indexOf(max);
  // Valeurs annoncees : le dernier point, et le record s'il est ailleurs.
  const labelled = new Set([lastIndex, recordIndex]);
  const shown = active ?? -1;

  return (
    <figure className="m-0">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width={W}
        className="mx-auto block max-w-full"
        shapeRendering="crispEdges"
        role="img"
        aria-label={`Charge maximale par séance, de ${points[0].label} à ${points[lastIndex].label}`}
      >
        <defs>
          {/* Tramage : un pixel sur quatre, la trame des jeux 16 bits. */}
          <pattern id="dojo-dither" width="4" height="4" patternUnits="userSpaceOnUse">
            <rect x="0" y="0" width="1" height="1" fill={IMPACT} />
            <rect x="2" y="2" width="1" height="1" fill={IMPACT} />
          </pattern>
        </defs>

        {/* Grille : trois reperes horizontaux, volontairement effaces. */}
        {[0, 0.5, 1].map((t) => {
          const value = bottom + span * t;
          return (
            <g key={t}>
              <line
                x1={PAD.left}
                x2={W - PAD.right}
                y1={y(value)}
                y2={y(value)}
                stroke={BONE}
                strokeOpacity="0.12"
                strokeWidth="1"
              />
              <text x={PAD.left - 6} y={y(value) + 3} textAnchor="end" fill={ASH} fontSize="8">
                {Math.round(value)}
              </text>
            </g>
          );
        })}

        <path d={area} fill="url(#dojo-dither)" />
        <path d={line} fill="none" stroke={IMPACT} strokeWidth="2" />

        {points.map((p, i) => {
          const big = i === lastIndex || i === shown;
          const size = big ? 6 : 4;
          return (
            <g key={p.date}>
              {/* Cible tactile large : le point visible reste petit. */}
              <rect
                x={x(i) - 14}
                y={y(p.value) - 14}
                width="28"
                height="28"
                fill="transparent"
                onPointerDown={() => setActive(active === i ? null : i)}
              />
              <rect
                x={x(i) - size / 2 - 1}
                y={y(p.value) - size / 2 - 1}
                width={size + 2}
                height={size + 2}
                fill={INK}
              />
              <rect
                x={x(i) - size / 2}
                y={y(p.value) - size / 2}
                width={size}
                height={size}
                fill={i === shown ? BLOOD : IMPACT}
              />
              {(labelled.has(i) || i === shown) && (
                <text
                  x={Math.min(W - PAD.right, Math.max(PAD.left, x(i)))}
                  y={y(p.value) - 10}
                  textAnchor={i === lastIndex ? 'end' : 'middle'}
                  fill={BONE}
                  fontSize="8"
                >
                  {p.value}
                  {unit}
                </text>
              )}
            </g>
          );
        })}

        {/* Reperes de temps : les extremites suffisent a situer la serie. */}
        <text x={PAD.left} y={H - 6} fill={ASH} fontSize="8">
          {points[0].label}
        </text>
        <text x={W - PAD.right} y={H - 6} textAnchor="end" fill={ASH} fontSize="8">
          {points[lastIndex].label}
        </text>
      </svg>

      <figcaption className="mt-1 text-center text-p2 text-ash">
        {shown >= 0
          ? `${points[shown].label} · ${points[shown].value} ${unit}`
          : `charge maximale par séance · ${points.length} séances`}
      </figcaption>
    </figure>
  );
}
