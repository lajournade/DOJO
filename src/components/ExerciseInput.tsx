/**
 * Une cellule pour nommer un exercice : le nom se tape, le catalogue le complete, Entree
 * valide. Un nom vide ne fait rien — c'est la meme chose qu'annuler. Sert au remplacement
 * dans l'arene (le titre devient la cellule) et a l'ajout depuis la carte.
 */

interface Props {
  value: string;
  /** Les noms du catalogue, proposes en completion. */
  names: string[];
  /** Identifiant du `<datalist>` : a distinguer si deux cellules cohabitent a l'ecran. */
  listId?: string;
  onChange: (v: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
}

export function ExerciseInput({ value, names, listId = 'exercices', onChange, onCancel, onSubmit }: Props) {
  const submit = () => (value.trim() ? onSubmit() : onCancel());
  return (
    <div className="bevel-sm flex min-w-0 flex-1 items-center gap-2 bg-ink-2 p-2">
      <input
        autoFocus
        list={listId}
        value={value}
        placeholder="nom de l'exercice"
        enterKeyHint="done"
        autoComplete="off"
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit();
          if (e.key === 'Escape') onCancel();
        }}
        className="min-w-0 flex-1 bg-transparent text-p2 font-bold uppercase text-bone outline-none placeholder:text-ash/50"
      />
      <datalist id={listId}>
        {names.map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>
      <button
        type="button"
        onClick={submit}
        className="bevel-sm keycap h-9 w-9 shrink-0 bg-impact text-p2 text-line"
      >
        ✓
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="bevel-sm keycap h-9 w-9 shrink-0 bg-ink-3 text-p2 text-ash"
      >
        ✕
      </button>
    </div>
  );
}
