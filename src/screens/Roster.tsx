/**
 * Ecran d'accueil : le choix de l'adversaire du jour.
 * Une carte par seance du programme actif, avec ce qui a ete fait la derniere fois.
 */
import { useState } from 'react';
import { motion } from 'motion/react';
import { sfx } from '../fx/audio';
import { navigate } from '../router';
import { activeProgram, doneEntries, lastRun, sinceLabel, tonnage } from '../store/selectors';
import { startSession } from '../store/session';
import { useStore } from '../store/state';
import type { Program, ProgramSession } from '../types';
import { FightIntro } from '../components/FightIntro';
import { SyncBadge } from '../components/SyncBadge';

export function Roster() {
  const { state } = useStore();
  const program = activeProgram(state);
  const [intro, setIntro] = useState<{ program: Program; session: ProgramSession } | null>(null);

  const resume = state.liveSession;

  const launch = (session: ProgramSession) => {
    if (!program) return;
    sfx.select();
    setIntro({ program, session });
  };

  return (
    <div className="min-h-dvh bg-ink">
      {intro && (
        <FightIntro
          label={`${intro.program.code}-${intro.session.code}`}
          onDone={() => {
            startSession(intro.program, intro.session);
            navigate('/arena');
          }}
        />
      )}

      <header className="pad-top pad-x pb-3">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="fight-text fight-shadow text-[2.6rem] leading-none text-blood">dojo</h1>
            <p className="fight-text text-[0.7rem] tracking-[0.3em] text-ash">
              {program ? program.name : 'aucun programme'}
            </p>
          </div>
          <SyncBadge />
        </div>
      </header>

      {resume && (
        <section className="pad-x mb-3">
          <button
            type="button"
            onClick={() => navigate('/arena')}
            className="bevel w-full border border-impact/40 bg-impact/10 p-3 text-left active:bg-impact/20"
          >
            <p className="fight-text text-sm text-impact">combat en cours — {resume.programCode}</p>
            <p className="text-[0.75rem] text-ash">
              {resume.entries.length} série{resume.entries.length > 1 ? 's' : ''} enregistrée
              {resume.entries.length > 1 ? 's' : ''} · reprendre
            </p>
          </button>
        </section>
      )}

      <main className="pad-x grid gap-3">
        {program?.sessions.map((session, i) => {
          const previous = lastRun(state, session.id);
          const load = previous ? tonnage(doneEntries(previous.entries)) : 0;
          return (
            <motion.button
              key={session.id}
              type="button"
              initial={{ opacity: 0, y: 22 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.07, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              onClick={() => launch(session)}
              className="bevel halftone relative overflow-hidden border border-white/10 bg-ink-2
                         p-4 text-left transition-transform duration-100 active:scale-[0.98]"
            >
              <span className="absolute inset-y-0 left-0 w-1.5 bg-blood" />
              <div className="flex items-start justify-between gap-3">
                <span className="fight-text fight-shadow text-[3.4rem] leading-[0.8] text-blood">
                  {session.code}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="fight-text text-[1.05rem] leading-tight text-bone">{session.name}</p>
                  <p className="mt-1 text-[0.75rem] text-ash">
                    {session.items.length} exercices ·{' '}
                    {session.items.reduce((n, it) => n + it.sets, 0)} séries
                  </p>
                </div>
              </div>

              <div className="mt-3 flex items-center justify-between border-t border-white/5 pt-2">
                <span className="text-[0.72rem] text-ash">
                  {previous ? `dernier combat ${sinceLabel(previous.date)}` : 'jamais joué'}
                </span>
                {load > 0 && (
                  <span className="numeric text-[0.72rem] text-impact">
                    {Math.round(load).toLocaleString('fr-FR')} kg soulevés
                  </span>
                )}
              </div>
            </motion.button>
          );
        })}

        {!program && (
          <p className="text-sm text-ash">
            Aucun programme. Créez-en un depuis l'écran Programme.
          </p>
        )}
      </main>

      <nav className="pad-x pad-bottom mt-5 grid grid-cols-2 gap-2">
        <NavButton onClick={() => navigate('/history')}>historique</NavButton>
        <NavButton onClick={() => navigate('/program')}>programme</NavButton>
      </nav>
    </div>
  );
}

function NavButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="bevel-sm fight-text bg-ink-2 py-3.5 text-sm tracking-[0.15em] text-ash active:bg-ink-3"
    >
      {children}
    </button>
  );
}
