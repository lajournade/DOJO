/**
 * L'equivalent de l'onglet Suivit 2, en deux lectures :
 *  — Journal : les seances dans l'ordre, dépliables jusqu'au detail des series ;
 *  — Exercice : la progression d'un mouvement dans le temps.
 */
import { useMemo, useState } from 'react';
import { latestTodayLog } from '../../shared/ops.mjs';
import { resumeSession } from '../store/session';
import { ExerciseHistory } from '../components/ExerciseHistory';
import { useHold } from '../fx/hold';
import { navigate } from '../router';
import {
  doneEntries,
  formatDate,
  recentLogs,
  sinceLabel,
  tonnage,
  todayIso,
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
          className="tap-target fight-text text-p1 tracking-[0.2em] text-ash"
        >
          ← dojo
        </button>
        <h1 className="fight-text fight-shadow text-p3 text-bone">
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
        {tab === 'journal' ? <Journal logs={logs} /> : <ExerciseHistory />}

        <a
          href={`/api/export.csv?user=${encodeURIComponent(state.user.id)}`}
          className="bevel-sm keycap fight-text mt-4 block bg-ink-2 py-4 text-center text-p2 text-ash"
        >
          exporter en csv
        </a>
      </main>
    </div>
  );
}

function Journal({ logs }: { logs: SessionLog[] }) {
  const { state } = useStore();
  const latest = latestTodayLog(logs, state.user.id, todayIso());
  const [open, setOpen] = useState<string | null>(logs[0]?.id ?? null);

  if (!logs.length) {
    return <p className="py-8 text-center text-p2 text-ash">Aucune séance enregistrée.</p>;
  }

  return (
    <div className="grid gap-2">
      {logs.map((log) => (
        <LogCard
          key={log.id}
          log={log}
          resumable={latest?.id === log.id && !!log.plan?.length}
          busy={!!state.liveSession}
          expanded={open === log.id}
          onToggle={() => setOpen(open === log.id ? null : log.id)}
        />
      ))}
      <p className="pt-1 text-center text-p2 text-ash/70">
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
  resumable,
  busy,
  onToggle,
}: {
  log: SessionLog;
  expanded: boolean;
  resumable: boolean;
  busy: boolean;
  onToggle: () => void;
}) {
  const hold = useHold(() => {
    if (confirm(`Supprimer la séance ${log.programCode} du ${formatDate(log.date)} ?`)) {
      dispatch('log.remove', { logId: log.id });
    }
  });
  const entries = doneEntries(log.entries);

  return (
    <section className="bevel-sm bg-ink-2">
      <div className="relative overflow-hidden">
        <button
          type="button"
          onClick={() => !hold.consumed() && onToggle()}
          {...hold.props}
          className="flex w-full touch-manipulation select-none items-center justify-between gap-3
                     p-3 text-left [-webkit-touch-callout:none]"
        >
          <div className="min-w-0">
            <p className="fight-text text-p2 text-impact">{log.programCode}</p>
            <p className="text-p2 text-ash">
              {formatDate(log.date)} · {sinceLabel(log.date)}
            </p>
          </div>
          <div className="shrink-0 whitespace-nowrap text-right">
            <p className="numeric fight-text text-p2 text-bone">
              {Math.round(tonnage(entries)).toLocaleString('fr-FR')} kg
            </p>
            <p className="text-p2 text-ash">{entries.length} séries</p>
          </div>
        </button>

        {/* La jauge d'appui : pleine, la suppression est proposee. */}
        <div aria-hidden {...hold.gauge} />
      </div>

      {resumable && (
        <div className="px-3 pb-3">
          <button type="button" disabled={busy}
            onClick={() => { if (resumeSession(log.id)) navigate('/arena'); }}
            className="bevel-sm keycap fight-text w-full bg-blood py-3 text-p2 text-bone disabled:opacity-50">
            Reprendre la séance
          </button>
          {busy && <p className="mt-2 text-p2 text-ash">Une séance est déjà en cours.</p>}
        </div>
      )}
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
    <div className="border-t-2 border-line p-3 pt-2">
      {groups.map((group, i) => (
        <div key={`${group.name}-${i}`} className="mb-3 last:mb-0">
          <p className="text-p2 font-bold uppercase text-bone">{group.name}</p>
          <table className="mt-1 w-full border-collapse">
            <thead>
              <tr className="label-text text-p2 text-ash">
                <th className="w-10 py-1 text-left">sér.</th>
                <th className="py-1 text-right">reps</th>
                <th className="py-1 text-right">charge</th>
                <th className="w-14 py-1 pl-2 text-right">rir</th>
              </tr>
            </thead>
            <tbody className="numeric text-p2">
              {group.sets.map((s, j) => (
                <tr key={j} className="border-t border-line/60">
                  <td className="py-1 text-ash">{s.setIndex}</td>
                  <td className="py-1 text-right text-bone">{s.reps ?? '—'}</td>
                  <td className="py-1 text-right text-bone">
                    {s.weight === null || s.weight === undefined ? '—' : `${s.weight} kg`}
                  </td>
                  <td className="py-1 pl-2 text-right text-impact">{s.rir ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
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
      className={`bevel-sm keycap fight-text flex-1 py-2.5 text-p1 tracking-[0.15em] ${
        active ? 'bg-blood text-bone' : 'bg-ink-2 text-ash'
      }`}
    >
      {children}
    </button>
  );
}
