/**
 * La bibliotheque de programmes, et leurs editeurs.
 *
 * Trois niveaux, du general au particulier : les programmes ranges par famille,
 * un programme et ses seances, une seance et ses exercices. Ecran volontairement
 * sobre — on l'ouvre quelques fois par mois, pas pendant l'effort. L'edition se
 * fait sur un brouillon, enregistre explicitement.
 *
 * La bibliotheque est commune a tous les joueurs ; le programme en cours, non.
 */
import { Fragment, useEffect, useState } from 'react';
import { useHold } from '../fx/hold';
import { navigate } from '../router';
import { activeProgram, exerciseName } from '../store/selectors';
import { GOALS, GOAL_ORDER, blankItem, blankProgram, duplicateProgram, nextCode, slug } from '../store/programs';
import { dispatch, useStore } from '../store/state';
import type { Program as ProgramType, ProgramGoal, ProgramItem, ProgramSession } from '../types';

export function Program() {
  const { state } = useStore();
  const [programId, setProgramId] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);

  const program = state.programs.find((p) => p.id === programId) ?? null;
  const session = program?.sessions.find((s) => s.id === sessionId) ?? null;

  const saveProgram = (next: ProgramType) => dispatch('program.save', { program: next });

  if (program && session) {
    const saveSession = (next: ProgramSession) => {
      const sessions = program.sessions.some((s) => s.id === next.id)
        ? program.sessions.map((s) => (s.id === next.id ? next : s))
        : [...program.sessions, next];
      saveProgram({ ...program, sessions });
    };

    return (
      <Frame onBack={() => setSessionId(null)} back={program.name} title={`séance ${session.code}`}>
        <SessionEditor
          key={session.id}
          session={session}
          goal={program.goal}
          names={state.exercises.map((e) => e.name)}
          resolveName={(id) => exerciseName(state, id)}
          onSave={(next, names) => {
            // Les exercices inedits entrent au catalogue en meme temps que la seance.
            for (const [id, name] of Object.entries(names)) {
              if (!state.exercises.some((e) => e.id === id)) {
                dispatch('exercise.upsert', { exercise: { id, name } });
              }
            }
            saveSession(next);
            setSessionId(null);
          }}
          onDelete={() => {
            saveProgram({ ...program, sessions: program.sessions.filter((s) => s.id !== session.id) });
            setSessionId(null);
          }}
        />
      </Frame>
    );
  }

  if (program) {
    return (
      <Frame onBack={() => setProgramId(null)} back="programmes" title={program.name}>
        <ProgramEditor
          key={program.id}
          program={program}
          current={program.id === state.user.activeProgramId}
          onSave={saveProgram}
          onChoose={() =>
            dispatch('user.upsert', { user: { id: state.user.id, activeProgramId: program.id } })
          }
          onDuplicate={() => {
            const copy = duplicateProgram(program, nextCode(state.programs));
            saveProgram(copy);
            setProgramId(copy.id);
          }}
          onOpenSession={setSessionId}
        />
      </Frame>
    );
  }

  return (
    <Frame title="programmes">
      <Library
        programs={state.programs}
        activeId={activeProgram(state)?.id ?? null}
        onOpen={setProgramId}
        onChoose={(id) => dispatch('user.upsert', { user: { id: state.user.id, activeProgramId: id } })}
        onCreate={(goal) => {
          const created = blankProgram(goal, nextCode(state.programs));
          saveProgram(created);
          setProgramId(created.id);
        }}
      />
    </Frame>
  );
}

/* ------------------------------------------------------------ la bibliotheque */

function Library({
  programs,
  activeId,
  onOpen,
  onChoose,
  onCreate,
}: {
  programs: ProgramType[];
  activeId: string | null;
  onOpen: (id: string) => void;
  onChoose: (id: string) => void;
  onCreate: (goal: ProgramGoal) => void;
}) {
  return (
    <div className="grid gap-4">
      {GOAL_ORDER.map((goal) => {
        const group = programs.filter((p) => p.goal === goal);
        if (!group.length) return null;

        return (
          <section key={goal}>
            <p className="fight-text mb-1.5 text-p1 tracking-[0.2em] text-cyan">{GOALS[goal].label}</p>
            <div className="grid gap-2">
              {group.map((program) => (
                <ProgramCard
                  key={program.id}
                  program={program}
                  current={program.id === activeId}
                  onOpen={() => onOpen(program.id)}
                  onChoose={() => onChoose(program.id)}
                />
              ))}
            </div>
          </section>
        );
      })}

      {!programs.length && (
        <p className="text-p2 text-ash">
          La bibliothèque est vide. Créez un programme dans la famille qui vous convient.
        </p>
      )}

      <section>
        <p className="label-text mb-1.5 text-p2 text-ash">créer un programme</p>
        <div className="grid grid-cols-3 gap-1.5">
          {GOAL_ORDER.map((goal) => (
            <button
              key={goal}
              type="button"
              onClick={() => onCreate(goal)}
              className="bevel-sm keycap label-text bg-ink-2 px-1 py-3 text-p2 text-ash"
            >
              + {GOALS[goal].label}
            </button>
          ))}
        </div>
      </section>

      {programs.length > 0 && (
        <p className="text-center text-p2 text-ash/70">
          appui long sur un programme pour le supprimer
        </p>
      )}
    </div>
  );
}

function ProgramCard({
  program,
  current,
  onOpen,
  onChoose,
}: {
  program: ProgramType;
  current: boolean;
  onOpen: () => void;
  onChoose: () => void;
}) {
  const hold = useHold(() => {
    if (confirm(`Supprimer le programme ${program.name} ?`)) {
      dispatch('program.remove', { programId: program.id });
    }
  });
  const sets = program.sessions.reduce((n, s) => n + s.items.length, 0);

  return (
    <div className="bevel-sm relative overflow-hidden bg-ink-2">
      <button
        type="button"
        onClick={() => !hold.consumed() && onOpen()}
        {...hold.props}
        className="flex w-full touch-manipulation select-none items-center gap-3 p-3 text-left
                   [-webkit-touch-callout:none]"
      >
        <span className="fight-text fight-shadow text-p3 text-impact">{program.code}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-p2 font-bold uppercase text-bone">{program.name}</span>
          <span className="block text-p2 text-ash">
            {program.sessions.length} séance{program.sessions.length > 1 ? 's' : ''} · {sets} exercices
          </span>
        </span>
        {current ? (
          <span className="bevel-sm label-text shrink-0 bg-impact px-1.5 text-p2 leading-6 text-line">
            en cours
          </span>
        ) : (
          <span className="text-ash">›</span>
        )}
      </button>

      {!current && (
        <button
          type="button"
          onClick={onChoose}
          className="keycap label-text w-full border-t-2 border-line py-2 text-p2 text-cyan"
        >
          choisir ce programme
        </button>
      )}

      <div aria-hidden {...hold.gauge} />
    </div>
  );
}

/* ------------------------------------------------------- l'editeur de programme */

function ProgramEditor({
  program,
  current,
  onSave,
  onChoose,
  onDuplicate,
  onOpenSession,
}: {
  program: ProgramType;
  current: boolean;
  onSave: (program: ProgramType) => void;
  onChoose: () => void;
  onDuplicate: () => void;
  onOpenSession: (id: string) => void;
}) {
  return (
    <div className="grid gap-3">
      <Field label="nom du programme">
        <input
          value={program.name}
          onChange={(e) => onSave({ ...program, name: e.target.value })}
          className="w-full min-w-0 bg-transparent text-bone outline-none"
        />
      </Field>

      <Field label="code">
        <input
          value={program.code}
          maxLength={4}
          onChange={(e) => onSave({ ...program, code: e.target.value.toUpperCase() })}
          className="numeric w-full min-w-0 bg-transparent font-bold text-bone outline-none"
        />
      </Field>

      {/* La famille pose les fourchettes des exercices a venir — et par elles, la
          transposition des charges depuis les cycles deja joues. */}
      <div>
        <p className="label-text mb-1.5 text-p2 text-ash">famille</p>
        <div className="grid grid-cols-3 gap-1.5">
          {GOAL_ORDER.map((goal) => (
            <button
              key={goal}
              type="button"
              onClick={() => onSave({ ...program, goal })}
              className={`bevel-sm keycap label-text px-1 py-3 text-p2 ${
                program.goal === goal ? 'bg-impact text-line' : 'bg-ink-2 text-ash'
              }`}
            >
              {GOALS[goal].label}
            </button>
          ))}
        </div>
        <p className="label-text mt-1 text-p2 text-ash/70">
          {GOALS[program.goal].repMin}–{GOALS[program.goal].repMax} reps · repos{' '}
          {GOALS[program.goal].restSec} s · rir {GOALS[program.goal].rir}
        </p>
      </div>

      <div className="grid gap-2">
        {program.sessions.map((session) => (
          <button
            key={session.id}
            type="button"
            onClick={() => onOpenSession(session.id)}
            className="bevel-sm keycap flex items-center gap-3 bg-ink-2 p-3 text-left"
          >
            <span className="fight-text fight-shadow text-p3 text-impact">{session.code}</span>
            <span className="min-w-0 flex-1">
              <span className="block text-p2 font-bold uppercase text-bone">{session.name}</span>
              <span className="block text-p2 text-ash">{session.items.length} exercices</span>
            </span>
            <span className="text-ash">›</span>
          </button>
        ))}

        <button
          type="button"
          onClick={() => {
            const code = String.fromCharCode(65 + program.sessions.length);
            const session: ProgramSession = {
              id: `ses-${Date.now().toString(36)}`,
              code,
              name: `Séance ${code}`,
              items: [blankItem(program.goal)],
            };
            onSave({ ...program, sessions: [...program.sessions, session] });
            onOpenSession(session.id);
          }}
          className="bevel-sm keycap label-text bg-ink-2 py-3 text-p2 text-ash"
        >
          + ajouter une séance
        </button>
      </div>

      {!current && (
        <button
          type="button"
          onClick={onChoose}
          className="bevel keycap fight-text bg-blood py-4 text-p2 text-bone"
        >
          choisir ce programme
        </button>
      )}

      <button
        type="button"
        onClick={onDuplicate}
        className="py-2 text-p2 text-ash underline"
      >
        dupliquer ce programme
      </button>
    </div>
  );
}

/* ---------------------------------------------------------- l'editeur de seance */

/** Ou chaque ligne s'enchaine a la precedente : le lien tel qu'il se lit dans les items. */
const linksOf = (items: ProgramItem[]) =>
  items.map(
    (it, i) => i > 0 && !!it.supersetGroup && it.supersetGroup === items[i - 1].supersetGroup,
  );

/**
 * Renumerote les groupes de haut en bas — A, B, C — a partir des liens poses.
 *
 * La lettre ne se saisit jamais : elle se deduit, ce qui evite les groupes en
 * double et les lettres a trous quand on deplace ou supprime une ligne. Le repos
 * suit le lien : zero pour qui enchaine — c'est ce que « superset » veut dire ici,
 * et l'arene s'en sert pour ne pas afficher de pause —, et celui de la famille
 * rendu a qui sort d'une paire, sans quoi delier laisserait un exercice sans repos.
 */
function regroup(items: ProgramItem[], links: boolean[], restSec: number): ProgramItem[] {
  const groups: (string | null)[] = items.map(() => null);
  let rank = 0;

  for (let i = 1; i < items.length; i += 1) {
    if (!links[i]) continue;
    if (groups[i - 1] === null) {
      groups[i - 1] = String.fromCharCode(65 + rank);
      rank += 1;
    }
    groups[i] = groups[i - 1];
  }

  return items.map((it, i) => {
    const group = groups[i];
    const chained = group !== null && groups[i + 1] === group;
    if (chained) return { ...it, supersetGroup: group, restSec: 0 };
    return { ...it, supersetGroup: group, restSec: it.restSec === 0 ? restSec : it.restSec };
  });
}


function SessionEditor({
  session,
  goal,
  names,
  resolveName,
  onSave,
  onDelete,
}: {
  session: ProgramSession;
  goal: ProgramGoal;
  names: string[];
  resolveName: (id: string) => string;
  onSave: (session: ProgramSession, names: Record<string, string>) => void;
  onDelete: () => void;
}) {
  const [draft, setDraft] = useState(session);
  // Les noms d'exercices sont saisis en clair ; l'identifiant est derive a l'enregistrement.
  const [labels, setLabels] = useState<Record<string, string>>(() =>
    Object.fromEntries(session.items.map((it) => [it.id, resolveName(it.exerciseId)])),
  );

  useEffect(() => {
    setDraft(session);
  }, [session]);

  const patch = (id: string, values: Partial<ProgramItem>) =>
    setDraft((d) => ({ ...d, items: d.items.map((it) => (it.id === id ? { ...it, ...values } : it)) }));

  const move = (index: number, direction: -1 | 1) =>
    setDraft((d) => {
      const items = [...d.items];
      const target = index + direction;
      if (target < 0 || target >= items.length) return d;
      [items[index], items[target]] = [items[target], items[index]];
      // Un deplacement peut separer une paire : `regroup` la dissout alors plutot
      // que de laisser une lettre orpheline sur un exercice devenu solitaire.
      return { ...d, items: regroup(items, linksOf(items), GOALS[goal].restSec) };
    });

  /** Enchaine — ou desenchaine — une ligne avec celle du dessus. */
  const toggleLink = (index: number) =>
    setDraft((d) => {
      const links = linksOf(d.items);
      links[index] = !links[index];
      return { ...d, items: regroup(d.items, links, GOALS[goal].restSec) };
    });

  return (
    <div className="flex flex-col gap-3">
      <Field label="nom de la séance">
        <input
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          className="w-full min-w-0 bg-transparent text-bone outline-none"
        />
      </Field>

      <datalist id="exercices">
        {names.map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>

      {draft.items.map((item, index) => (
        <Fragment key={item.id}>
          {/* Le lien se pose entre deux lignes, la ou il agit. */}
          {index > 0 &&
            (() => {
              const linked =
                !!item.supersetGroup && item.supersetGroup === draft.items[index - 1].supersetGroup;
              return (
                <button
                  type="button"
                  onClick={() => toggleLink(index)}
                  className={`bevel-sm keycap label-text py-1.5 text-p2 ${
                    linked ? 'bg-impact text-line' : 'bg-ink-2 text-ash/60'
                  }`}
                >
                  {linked ? `⛓ superset ${item.supersetGroup}` : '⛓ enchaîner sans repos'}
                </button>
              );
            })()}

          <div className="bevel-sm bg-ink-2 p-3">
            <div className="flex items-center gap-2">
              <input
                value={labels[item.id] ?? ''}
                list="exercices"
                placeholder="nom de l'exercice"
                onChange={(e) => setLabels({ ...labels, [item.id]: e.target.value })}
                className="min-w-0 flex-1 bg-transparent font-bold text-bone outline-none placeholder:text-ash/50"
              />
              <IconButton onClick={() => move(index, -1)}>↑</IconButton>
              <IconButton onClick={() => move(index, 1)}>↓</IconButton>
              <IconButton
                onClick={() => setDraft({ ...draft, items: draft.items.filter((i) => i.id !== item.id) })}
              >
                ✕
              </IconButton>
            </div>

            <div className="mt-2 grid grid-cols-3 gap-1.5">
              <Num label="séries" value={item.sets} onChange={(v) => patch(item.id, { sets: v })} />
              <Num label="rep min" value={item.repMin} onChange={(v) => patch(item.id, { repMin: v })} />
              <Num label="rep max" value={item.repMax} onChange={(v) => patch(item.id, { repMax: v })} />
              <Num label="repos s" value={item.restSec} onChange={(v) => patch(item.id, { restSec: v })} />
              <Num
                label="rir min"
                value={item.targetRirMin}
                onChange={(v) => patch(item.id, { targetRirMin: v })}
              />
              <Num
                label="rir max"
                value={item.targetRirMax}
                onChange={(v) => patch(item.id, { targetRirMax: v })}
              />
            </div>

            <textarea
              value={item.notes}
              placeholder="conseil d'exécution"
              rows={2}
              onChange={(e) => patch(item.id, { notes: e.target.value })}
              className="bevel-in mt-2 w-full min-w-0 resize-none bg-ink-3 p-2 text-p2 text-ash outline-none placeholder:text-ash/40"
            />
          </div>
        </Fragment>
      ))}

      <button
        type="button"
        onClick={() => {
          const item = blankItem(goal);
          setDraft({ ...draft, items: [...draft.items, item] });
          setLabels({ ...labels, [item.id]: '' });
        }}
        className="bevel-sm keycap label-text bg-ink-2 py-3 text-p2 text-ash"
      >
        + ajouter un exercice
      </button>

      <button
        type="button"
        onClick={() => {
          const kept = draft.items
            .filter((it) => (labels[it.id] ?? '').trim())
            .map((it) => {
              const label = labels[it.id].trim();
              // Un exercice renomme au catalogue garde son identifiant, donc son
              // historique : on ne re-slugifie que si le nom a vraiment change ici.
              const untouched = it.exerciseId !== '' && resolveName(it.exerciseId) === label;
              return { ...it, exerciseId: untouched ? it.exerciseId : slug(label) };
            });
          // Une ligne supprimee peut laisser un membre de paire tout seul.
          const items = regroup(kept, linksOf(kept), GOALS[goal].restSec);
          const names = Object.fromEntries(
            items.map((it) => [it.exerciseId, labels[it.id].trim()]),
          );
          onSave({ ...draft, items }, names);
        }}
        className="bevel keycap fight-text bg-blood py-4 text-p2 text-bone"
      >
        enregistrer
      </button>

      <button
        type="button"
        onClick={() => confirm('Supprimer cette séance ?') && onDelete()}
        className="py-2 text-p2 text-ash underline"
      >
        supprimer la séance
      </button>
    </div>
  );
}

/* ----------------------------------------------------------------- le decor */

function Frame({
  children,
  title,
  back,
  onBack,
}: {
  children: React.ReactNode;
  title?: string;
  back?: string;
  onBack?: () => void;
}) {
  return (
    <div className="min-h-dvh bg-ink">
      <header className="pad-top pad-x pb-3">
        <button
          type="button"
          onClick={() => (onBack ? onBack() : navigate('/'))}
          className="fight-text text-p1 tracking-[0.2em] text-ash"
        >
          ← {back ?? 'dojo'}
        </button>
        <h1 className="fight-shadow mt-2 truncate text-p3 font-bold uppercase leading-8 text-bone">
          {title ?? 'programmes'}
        </h1>
      </header>
      <main className="pad-x pad-bottom">{children}</main>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="bevel-sm block bg-ink-2 px-3 py-2">
      <span className="label-text block text-p2 text-ash">{label}</span>
      {children}
    </label>
  );
}

function Num({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | null;
  onChange: (v: number) => void;
}) {
  return (
    <label className="bevel-in block min-w-0 bg-ink-3 px-2 py-1.5">
      <span className="label-text block text-p1 text-ash">{label}</span>
      <input
        type="number"
        inputMode="numeric"
        value={value ?? ''}
        onChange={(e) => onChange(Number(e.target.value))}
        className="numeric w-full min-w-0 bg-transparent font-bold text-bone outline-none"
      />
    </label>
  );
}

function IconButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="bevel-sm keycap h-9 w-9 shrink-0 bg-ink-3 text-p2 text-ash active:bg-blood active:text-bone"
    >
      {children}
    </button>
  );
}
