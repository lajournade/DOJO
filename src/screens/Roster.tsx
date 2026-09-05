/**
 * Ecran d'accueil : la selection du personnage, en grille de portraits.
 * Une tuile par seance du programme actif, avec son adversaire, sa couleur et ce
 * qui a ete fait la derniere fois. Le curseur clignotant designe la seance la
 * moins recemment jouee — c'est la suggestion du jour, pas une contrainte.
 */
import { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { sfx } from '../fx/audio';
import { FOE, foePalette } from '../fx/sprites';
import { navigate } from '../router';
import { activeProgram, doneEntries, lastRun, sinceLabel, tonnage } from '../store/selectors';
import { startSession } from '../store/session';
import { useStore } from '../store/state';
import type { Program, ProgramSession } from '../types';
import { FightIntro } from '../components/FightIntro';
import { PreFight } from '../components/PreFight';
import { Sprite, useFrame } from '../components/Sprite';
import { SyncBadge } from '../components/SyncBadge';

/** La seance choisie, en attente du premier coup. */
interface Pending {
  program: Program;
  session: ProgramSession;
  /** Rang dans le programme : il fixe la couleur de l'adversaire, du roster a l'arene. */
  index: number;
}

export function Roster() {
  const { state } = useStore();
  const program = activeProgram(state);
  // Le combat se joue en deux temps : on lit d'abord la carte, on frappe ensuite.
  const [brief, setBrief] = useState<Pending | null>(null);
  const [intro, setIntro] = useState<Pending | null>(null);
  const frame = useFrame(2, 2.5);

  const resume = state.liveSession;

  /** La seance la moins recemment jouee : celle que le curseur propose. */
  const suggested = useMemo(() => {
    if (!program) return null;
    let best: { id: string; date: string } | null = null;
    for (const session of program.sessions) {
      const date = lastRun(state, session.id)?.date ?? '';
      if (!best || date < best.date) best = { id: session.id, date };
    }
    return best?.id ?? null;
  }, [program, state]);

  const launch = (session: ProgramSession, index: number) => {
    if (!program) return;
    sfx.select();
    setBrief({ program, session, index });
  };

  return (
    <div className="min-h-dvh bg-ink">
      {brief && (
        <PreFight
          session={brief.session}
          index={brief.index}
          onBack={() => setBrief(null)}
          onFight={() => {
            setIntro(brief);
            setBrief(null);
          }}
        />
      )}

      {/* Le face-a-face a eu lieu sur le briefing : il ne reste que l'annonce du round. */}
      {intro && (
        <FightIntro
          code={intro.session.code}
          name={intro.session.name}
          index={intro.index}
          withVs={false}
          onDone={() => {
            startSession(intro.program, intro.session);
            navigate('/arena');
          }}
        />
      )}

      <header className="pad-top pad-x pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h1 className="fight-text arcade-title text-p4">dojo</h1>
            <p className="mt-1 truncate text-p2 text-ash">
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
            className="bevel-sm keycap w-full bg-impact/15 p-3 text-left"
          >
            <p className="fight-text pulsing text-p2 text-impact">continue ?</p>
            <p className="mt-1 text-p2 text-bone">
              {resume.programCode} · {resume.entries.length} série
              {resume.entries.length > 1 ? 's' : ''} en cours
            </p>
          </button>
        </section>
      )}

      <p className="pad-x fight-text mb-2 text-p1 tracking-[0.2em] text-cyan">
        choisis ton adversaire
      </p>

      <main className="pad-x grid grid-cols-2 gap-2">
        {program?.sessions.map((session, i) => {
          const previous = lastRun(state, session.id);
          const load = previous ? tonnage(doneEntries(previous.entries)) : 0;
          const sets = session.items.reduce((n, it) => n + it.sets, 0);

          return (
            <motion.button
              key={session.id}
              type="button"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06, duration: 0.25 }}
              onClick={() => launch(session, i)}
              className="bevel-sm keycap relative bg-ink-2 p-1.5 text-left"
            >
              {/* Le portrait, dans son cadre creux, avec sa plaque de code. */}
              <div className="bevel-in halftone relative flex justify-center overflow-hidden bg-ink">
                <Sprite
                  sprite={FOE}
                  palette={foePalette(i)}
                  frame={frame}
                  scale={5}
                  cropY={2}
                  cropH={16}
                />
                <span className="fight-text absolute bottom-0 right-0 bg-line px-1.5 py-0.5 text-p3 text-impact">
                  {session.code}
                </span>
              </div>

              {/* Deux lignes au plus : le nom compte, mais la tuile ne doit pas s'etirer. */}
              <p className="mt-1.5 line-clamp-2 h-12 text-p2 leading-6 text-bone">{session.name}</p>

              <p className="numeric text-p2 text-ash">
                {session.items.length} ex · {sets} sér
              </p>
              <p className="numeric truncate text-p2 text-ash/80">
                {previous ? sinceLabel(previous.date) : 'jamais joué'}
              </p>
              <p className="numeric h-6 text-p2 text-impact">
                {load > 0 ? `${Math.round(load).toLocaleString('fr-FR')} kg` : ''}
              </p>

              {/* Curseur de selection : le cadre clignotant des bornes. */}
              {session.id === suggested && (
                <span className="blinking pointer-events-none absolute inset-0 border-4 border-cyan" />
              )}
            </motion.button>
          );
        })}
      </main>

      {!program && (
        <p className="pad-x text-p2 text-ash">
          Aucun programme. Créez-en un depuis l'écran Programme.
        </p>
      )}

      <nav className="pad-x pad-bottom mt-4 grid grid-cols-2 gap-2">
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
      className="bevel-sm keycap fight-text bg-ink-2 py-4 text-p2 text-ash"
    >
      {children}
    </button>
  );
}
