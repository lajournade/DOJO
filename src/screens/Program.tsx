/**
 * Editeur de programme : seances et exercices prescrits.
 * Ecran volontairement sobre — on l'ouvre quelques fois par mois, pas pendant l'effort.
 * L'edition se fait sur un brouillon, enregistre explicitement.
 */
import { useEffect, useState } from 'react';
import { navigate } from '../router';
import { activeProgram, exerciseName } from '../store/selectors';
import { dispatch, useStore } from '../store/state';
import type { Program as ProgramType, ProgramItem, ProgramSession } from '../types';

/** Identifiant lisible et stable derive du nom, aligne sur celui de l'import du classeur. */
function slug(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);
}

const blankItem = (): ProgramItem => ({
  id: `it-${Math.random().toString(36).slice(2, 9)}`,
  exerciseId: '',
  sets: 3,
  repMin: 8,
  repMax: 12,
  targetRirMin: 2,
  targetRirMax: 2,
  restSec: 90,
  notes: '',
});

export function Program() {
  const { state } = useStore();
  const program = activeProgram(state);
  const [openId, setOpenId] = useState<string | null>(null);

  if (!program) {
    return (
      <Frame>
        <button
          type="button"
          onClick={() =>
            dispatch('program.save', {
              program: {
                id: `prog-${Date.now().toString(36)}`,
                code: 'P1',
                name: 'Mon programme',
                active: true,
                sessions: [],
              } satisfies ProgramType,
            })
          }
          className="bevel fight-text w-full bg-blood py-4 text-lg text-bone"
        >
          créer un programme
        </button>
      </Frame>
    );
  }

  const open = program.sessions.find((s) => s.id === openId) ?? null;

  const saveSession = (session: ProgramSession) => {
    const sessions = program.sessions.some((s) => s.id === session.id)
      ? program.sessions.map((s) => (s.id === session.id ? session : s))
      : [...program.sessions, session];
    dispatch('program.save', { program: { ...program, sessions } });
  };

  if (open) {
    return (
      <Frame onBack={() => setOpenId(null)} title={`séance ${open.code}`}>
        <SessionEditor
          key={open.id}
          session={open}
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
            setOpenId(null);
          }}
          onDelete={() => {
            dispatch('program.save', {
              program: { ...program, sessions: program.sessions.filter((s) => s.id !== open.id) },
            });
            setOpenId(null);
          }}
        />
      </Frame>
    );
  }

  return (
    <Frame title={program.name}>
      <div className="grid gap-2">
        {program.sessions.map((session) => (
          <button
            key={session.id}
            type="button"
            onClick={() => setOpenId(session.id)}
            className="bevel-sm flex items-center gap-3 border border-white/8 bg-ink-2 p-3 text-left active:bg-ink-3"
          >
            <span className="fight-text text-3xl leading-none text-blood">{session.code}</span>
            <span className="min-w-0 flex-1">
              <span className="fight-text block text-[0.9rem] text-bone">{session.name}</span>
              <span className="block text-[0.72rem] text-ash">{session.items.length} exercices</span>
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
              items: [blankItem()],
            };
            saveSession(session);
            setOpenId(session.id);
          }}
          className="bevel-sm fight-text bg-ink-2 py-3.5 text-sm tracking-[0.15em] text-ash active:bg-ink-3"
        >
          + ajouter une séance
        </button>
      </div>
    </Frame>
  );
}

function SessionEditor({
  session,
  names,
  resolveName,
  onSave,
  onDelete,
}: {
  session: ProgramSession;
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
      return { ...d, items };
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
        <div key={item.id} className="bevel-sm border border-white/8 bg-ink-2 p-3">
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
            className="mt-2 w-full min-w-0 resize-none bg-ink-3 p-2 text-[0.8rem] text-ash outline-none placeholder:text-ash/40"
          />
        </div>
      ))}

      <button
        type="button"
        onClick={() => {
          const item = blankItem();
          setDraft({ ...draft, items: [...draft.items, item] });
          setLabels({ ...labels, [item.id]: '' });
        }}
        className="bevel-sm fight-text bg-ink-2 py-3 text-[0.8rem] tracking-[0.15em] text-ash active:bg-ink-3"
      >
        + ajouter un exercice
      </button>

      <button
        type="button"
        onClick={() => {
          const items = draft.items
            .filter((it) => (labels[it.id] ?? '').trim())
            .map((it) => ({ ...it, exerciseId: slug(labels[it.id]) }));
          const names = Object.fromEntries(
            items.map((it) => [it.exerciseId, labels[it.id].trim()]),
          );
          onSave({ ...draft, items }, names);
        }}
        className="bevel fight-text bg-blood py-4 text-lg text-bone active:bg-blood-hot"
      >
        enregistrer
      </button>

      <button
        type="button"
        onClick={() => confirm('Supprimer cette séance ?') && onDelete()}
        className="py-2 text-[0.75rem] text-ash underline"
      >
        supprimer la séance
      </button>
    </div>
  );
}

function Frame({
  children,
  title,
  onBack,
}: {
  children: React.ReactNode;
  title?: string;
  onBack?: () => void;
}) {
  return (
    <div className="min-h-dvh bg-ink">
      <header className="pad-top pad-x pb-3">
        <button
          type="button"
          onClick={() => (onBack ? onBack() : navigate('/'))}
          className="fight-text text-[0.7rem] tracking-[0.2em] text-ash"
        >
          ← {onBack ? 'programme' : 'dojo'}
        </button>
        <h1 className="fight-text fight-shadow mt-1 text-[2rem] leading-none text-bone">
          {title ?? 'programme'}
        </h1>
      </header>
      <main className="pad-x pad-bottom">{children}</main>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="bevel-sm block border border-white/8 bg-ink-2 px-3 py-2">
      <span className="fight-text block text-[0.65rem] tracking-[0.2em] text-ash">{label}</span>
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
    <label className="block min-w-0 bg-ink-3 px-2 py-1.5">
      <span className="block text-[0.6rem] uppercase tracking-wider text-ash">{label}</span>
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
      className="h-9 w-9 shrink-0 bg-ink-3 text-sm text-ash active:bg-blood active:text-bone"
    >
      {children}
    </button>
  );
}
