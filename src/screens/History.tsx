/**
 * L'equivalent de l'onglet Suivit 2, en deux lectures :
 *  — Journal : les seances dans l'ordre, dépliables jusqu'au detail des series ;
 *  — Exercice : la progression d'un mouvement dans le temps.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { ProgressChart, type Point } from '../components/ProgressChart';
import { navigate } from '../router';
import {
  doneEntries,
  formatDate,
  historyOf,
  recentLogs,
  sinceLabel,
  tonnage,
} from '../store/selectors';
import { dispatch, useStore } from '../store/state';
import type { SessionLog, SetEntry } from '../types';

type Tab = 'journal' | 'exercice';

export function History() {
  const { state } = useStore();
  const [tab, setTab] = useState<Tab>('journal');
  const logs = useMemo(() => recentLogs(state), [state]);

  return (
    <div className="min-h-dvh bg-ink">
      <header className="pad-top pad-x pb-3">
        <button
          type="button"
          onClick={() => navigate('/')}
          className="fight-text text-[0.7rem] tracking-[0.2em] text-ash"
        >
          ← dojo
        </button>
        <h1 className="fight-text fight-shadow mt-1 text-[2.2rem] leading-none text-bone">
          historique
        </h1>

        <div className="mt-3 flex gap-1.5">
          <TabButton active={tab === 'journal'} onClick={() => setTab('journal')}>
            journal
          </TabButton>
          <TabButton active={tab === 'exercice'} onClick={() => setTab('exercice')}>
            par exercice
          </TabButton>
        </div>
      </header>

      <main className="pad-x pad-bottom">
        {tab === 'journal' ? <Journal logs={logs} /> : <ByExercise />}

        <a
          href="/api/export.csv"
          className="bevel-sm fight-text mt-4 block bg-ink-2 py-3.5 text-center text-sm
                     tracking-[0.15em] text-ash active:bg-ink-3"
        >
          exporter en csv
        </a>
      </main>
    </div>
  );
}

/** Duree d'appui avant que la suppression d'une seance soit proposee. */
const HOLD_MS = 650;

function Journal({ logs }: { logs: SessionLog[] }) {
  const [open, setOpen] = useState<string | null>(logs[0]?.id ?? null);

  if (!logs.length) {
    return <p className="py-8 text-center text-sm text-ash">Aucune séance enregistrée.</p>;
  }

  return (
    <div className="grid gap-2">
      {logs.map((log) => (
        <LogCard
          key={log.id}
          log={log}
          expanded={open === log.id}
          onToggle={() => setOpen(open === log.id ? null : log.id)}
        />
      ))}
      <p className="pt-1 text-center text-[0.7rem] text-ash/70">
        appui long sur une séance pour la supprimer
      </p>
    </div>
  );
}

/**
 * Une seance du journal. L'appui maintenu propose de la supprimer : une jauge se
 * remplit sous le doigt, relacher avant la fin annule. Le pouce n'efface donc rien
 * par megarde, et aucune croix ne vient encombrer la carte.
 */
function LogCard({
  log,
  expanded,
  onToggle,
}: {
  log: SessionLog;
  expanded: boolean;
  onToggle: () => void;
}) {
  const [holding, setHolding] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  // L'appui long a abouti : le clic du relachement ne doit pas replier la carte.
  const fired = useRef(false);
  const entries = doneEntries(log.entries);

  const cancelHold = () => {
    clearTimeout(timer.current);
    timer.current = undefined;
    setHolding(false);
  };

  useEffect(() => cancelHold, []);

  const startHold = () => {
    fired.current = false;
    setHolding(true);
    timer.current = setTimeout(() => {
      fired.current = true;
      setHolding(false);
      if (confirm(`Supprimer la séance ${log.programCode} du ${formatDate(log.date)} ?`)) {
        dispatch('log.remove', { logId: log.id });
      }
    }, HOLD_MS) as unknown as number;
  };

  return (
    <section className="bevel-sm border border-white/8 bg-ink-2">
      <div className="relative overflow-hidden">
        <button
          type="button"
          onClick={() => {
            if (fired.current) {
              fired.current = false;
              return;
            }
            onToggle();
          }}
          onPointerDown={startHold}
          onPointerUp={cancelHold}
          onPointerLeave={cancelHold}
          onPointerCancel={cancelHold}
          onContextMenu={(e) => e.preventDefault()}
          className="flex w-full touch-manipulation select-none items-center justify-between gap-3
                     p-3 text-left [-webkit-touch-callout:none]"
        >
          <div className="min-w-0">
            <p className="fight-text text-base text-blood-hot">{log.programCode}</p>
            <p className="text-[0.75rem] text-ash">
              {formatDate(log.date)} · {sinceLabel(log.date)}
            </p>
          </div>
          <div className="text-right">
            <p className="numeric text-sm font-black text-bone">
              {Math.round(tonnage(entries)).toLocaleString('fr-FR')} kg
            </p>
            <p className="text-[0.7rem] text-ash">{entries.length} séries</p>
          </div>
        </button>

        {/* La jauge d'appui : pleine, la suppression est proposee. */}
        <div
          aria-hidden
          className="pointer-events-none absolute bottom-0 left-0 h-[3px] bg-blood-hot"
          style={{
            width: holding ? '100%' : '0%',
            transition: holding ? `width ${HOLD_MS}ms linear` : 'none',
          }}
        />
      </div>

      {expanded && <LogDetail entries={log.entries} />}
    </section>
  );
}

/** Le detail d'une seance, regroupe par exercice — la lecture de l'onglet d'origine. */
function LogDetail({ entries }: { entries: SetEntry[] }) {
  const groups: { name: string; sets: SetEntry[] }[] = [];
  for (const entry of entries) {
    const last = groups[groups.length - 1];
    if (last && last.name === entry.exerciseName) last.sets.push(entry);
    else groups.push({ name: entry.exerciseName, sets: [entry] });
  }

  return (
    <div className="border-t border-white/8 p-3 pt-2">
      {groups.map((group, i) => (
        <div key={`${group.name}-${i}`} className="mb-3 last:mb-0">
          <p className="fight-text text-[0.78rem] text-bone">{group.name}</p>
          <table className="mt-1 w-full border-collapse">
            <thead>
              <tr className="text-[0.62rem] uppercase tracking-wider text-ash">
                <th className="w-10 py-0.5 text-left font-semibold">sér.</th>
                <th className="py-0.5 text-right font-semibold">reps</th>
                <th className="py-0.5 text-right font-semibold">charge</th>
                <th className="w-12 py-0.5 text-right font-semibold">rir</th>
              </tr>
            </thead>
            <tbody className="numeric text-[0.8rem]">
              {group.sets.map((s, j) => (
                <tr key={j} className="border-t border-white/5">
                  <td className="py-1 text-ash">{s.setIndex}</td>
                  <td className="py-1 text-right text-bone">{s.reps ?? '—'}</td>
                  <td className="py-1 text-right text-bone">
                    {s.weight === null || s.weight === undefined ? '—' : `${s.weight} kg`}
                  </td>
                  <td className="py-1 text-right text-impact">{s.rir ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

function ByExercise() {
  const { state } = useStore();
  // Les exercices deja pratiques, du plus recemment vu au plus ancien.
  const seen = useMemo(() => {
    const ids: string[] = [];
    for (const log of recentLogs(state)) {
      for (const e of log.entries) if (!ids.includes(e.exerciseId)) ids.push(e.exerciseId);
    }
    return ids.map((id) => ({
      id,
      name:
        state.exercises.find((e) => e.id === id)?.name ??
        state.logs.flatMap((l) => l.entries).find((e) => e.exerciseId === id)?.exerciseName ??
        id,
    }));
  }, [state]);

  const [selected, setSelected] = useState(seen[0]?.id ?? '');
  const rows = useMemo(() => (selected ? historyOf(state, selected) : []), [state, selected]);

  const points: Point[] = useMemo(
    () =>
      [...rows]
        .reverse()
        .map(({ log, entries }) => ({
          date: log.date,
          label: formatDate(log.date).replace(/\.$/, ''),
          value: Math.max(0, ...entries.map((e) => e.weight ?? 0)),
        }))
        .filter((p) => p.value > 0),
    [rows],
  );

  if (!seen.length) {
    return <p className="py-8 text-center text-sm text-ash">Aucune série enregistrée.</p>;
  }

  return (
    <div>
      <label className="fight-text text-[0.7rem] tracking-[0.2em] text-ash" htmlFor="exo">
        exercice
      </label>
      <select
        id="exo"
        value={selected}
        onChange={(e) => setSelected(e.target.value)}
        className="bevel-sm mt-1 w-full appearance-none border border-white/10 bg-ink-2 px-3 py-3 text-bone"
      >
        {seen.map((e) => (
          <option key={e.id} value={e.id}>
            {e.name}
          </option>
        ))}
      </select>

      <div className="bevel-sm mt-3 border border-white/8 bg-ink-2 p-2 pt-3">
        <ProgressChart points={points} />
      </div>

      <div className="mt-3 grid gap-2">
        {rows.map(({ log, entries }) => (
          <div key={log.id} className="bevel-sm border border-white/8 bg-ink-2 p-3">
            <div className="flex items-baseline justify-between">
              <p className="fight-text text-[0.8rem] text-bone">{formatDate(log.date)}</p>
              <p className="text-[0.7rem] text-ash">{log.programCode}</p>
            </div>
            <p className="numeric mt-1 text-[0.8rem] text-ash">
              {entries
                .map((e) => `${e.reps ?? '—'}×${e.weight ?? '—'}kg${e.rir !== null ? ` (rir ${e.rir})` : ''}`)
                .join('  ·  ')}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`bevel-sm fight-text flex-1 py-2.5 text-[0.75rem] tracking-[0.15em] ${
        active ? 'bg-blood text-bone' : 'bg-ink-2 text-ash'
      }`}
    >
      {children}
    </button>
  );
}
