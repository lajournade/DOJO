/**
 * Progression d'un exercice : charge maximale par seance, dans l'ordre du temps.
 *
 * Une seule serie, donc pas de legende — le titre nomme l'exercice. Ligne fine,
 * grille en retrait, et des valeurs annoncees seulement sur les points qui
 * comptent (premier, dernier, record) plutot que sur chacun. Le tableau des
 * series sous le graphique tient lieu de vue texte.
 */
import { useState } from 'react';

export interface Point {
  date: string;
  label: string;
  value: number;
}

const W = 340;
const H = 132;
const PAD = { top: 16, right: 14, bottom: 20, left: 30 };

export function ProgressChart({ points, unit = 'kg' }: { points: Point[]; unit?: string }) {
  const [active, setActive] = useState<number | null>(null);

  if (points.length < 2) {
    return (
      <p className="py-6 text-center text-[0.8rem] text-ash">
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

  const x = (i: number) => PAD.left + (i * (W - PAD.left - PAD.right)) / (points.length - 1);
  const y = (v: number) => PAD.top + (1 - (v - bottom) / span) * (H - PAD.top - PAD.bottom);

  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`).join(' ');
  const area = `${line} L${x(points.length - 1).toFixed(1)} ${H - PAD.bottom} L${x(0).toFixed(1)} ${H - PAD.bottom} Z`;

  const lastIndex = points.length - 1;
  const recordIndex = values.indexOf(max);
  // Valeurs annoncees : le dernier point, et le record s'il est ailleurs.
  const labelled = new Set([lastIndex, recordIndex]);
  const shown = active ?? -1;

  return (
    <figure className="m-0">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label={`Charge maximale par séance, de ${points[0].label} à ${points[lastIndex].label}`}
      >
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
                stroke="#f5f0e6"
                strokeOpacity="0.08"
                strokeWidth="1"
              />
              <text
                x={PAD.left - 6}
                y={y(value) + 3}
                textAnchor="end"
                fill="#8a8794"
                fontSize="8"
                fontWeight="600"
              >
                {Math.round(value)}
              </text>
            </g>
          );
        })}

        <path d={area} fill="#ffd400" fillOpacity="0.09" />
        <path d={line} fill="none" stroke="#ffd400" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />

        {points.map((p, i) => (
          <g key={p.date}>
            {/* Cible tactile large : le point visible reste fin. */}
            <circle
              cx={x(i)}
              cy={y(p.value)}
              r="14"
              fill="transparent"
              onPointerDown={() => setActive(active === i ? null : i)}
            />
            <circle
              cx={x(i)}
              cy={y(p.value)}
              r={i === lastIndex || i === shown ? 5 : 3.5}
              fill={i === shown ? '#e01b24' : '#ffd400'}
              stroke="#14141a"
              strokeWidth="2"
            />
            {(labelled.has(i) || i === shown) && (
              <text
                x={Math.min(W - PAD.right, Math.max(PAD.left, x(i)))}
                y={y(p.value) - 9}
                textAnchor={i === lastIndex ? 'end' : 'middle'}
                fill="#f5f0e6"
                fontSize="10"
                fontWeight="800"
              >
                {p.value}
                {unit}
              </text>
            )}
          </g>
        ))}

        {/* Reperes de temps : les extremites suffisent a situer la serie. */}
        <text x={PAD.left} y={H - 5} fill="#8a8794" fontSize="8" fontWeight="600">
          {points[0].label}
        </text>
        <text x={W - PAD.right} y={H - 5} textAnchor="end" fill="#8a8794" fontSize="8" fontWeight="600">
          {points[lastIndex].label}
        </text>
      </svg>

      <figcaption className="mt-1 text-center text-[0.7rem] text-ash">
        {shown >= 0
          ? `${points[shown].label} · ${points[shown].value} ${unit}`
          : `charge maximale par séance · ${points.length} séances`}
      </figcaption>
    </figure>
  );
}
