/**
 * Le decor du combat : un dojo, monte uniquement en aplats a arêtes franches —
 * cloison de panneaux, poutre, lanternes, tatami. Tout tombe sur des multiples
 * entiers de pixels, donc rien n'est reechantillonne quel que soit l'ecran.
 */
interface Props {
  children?: React.ReactNode;
  /** Hauteur du sol, en pixels : les combattants s'y posent. */
  floor?: number;
  /** Un seul combattant : au milieu du tatami plutot qu'aux deux bords. */
  center?: boolean;
  className?: string;
}

export function Stage({ children, floor = 20, center = false, className = '' }: Props) {
  return (
    <div className={`relative overflow-hidden bg-ink-2 ${className}`}>
      {/* Cloison : des panneaux de 48 px, separes par un montant sombre. */}
      <div
        className="absolute inset-0 opacity-70"
        style={{
          backgroundImage:
            'repeating-linear-gradient(90deg, transparent 0 44px, var(--color-dim) 44px 48px)',
        }}
      />
      {/* Poutre haute, et son ombre portee d'un pixel. */}
      <div className="absolute inset-x-0 top-0 h-2 bg-dim" />
      <div className="absolute inset-x-0 top-2 h-px bg-black/40" />

      {/* Deux lanternes, en blocs empiles plutot qu'en cercles. */}
      <Lantern className="left-1/4" />
      <Lantern className="right-1/4" />

      {/* Tatami : un aplat plus clair, tramé, souligné d'un trait franc. */}
      <div
        className="halftone absolute inset-x-0 bottom-0 border-t-2 border-line bg-ink-3"
        style={{ height: floor }}
      />

      {/* Les combattants se posent deux pixels dans le sol. */}
      <div
        className={`absolute inset-x-0 flex items-end px-6 ${center ? 'justify-center' : 'justify-between'}`}
        style={{ bottom: floor - 2 }}
      >
        {children}
      </div>
    </div>
  );
}

function Lantern({ className }: { className: string }) {
  return (
    <div className={`absolute top-2 ${className}`}>
      <div className="mx-auto h-2 w-1 bg-dim" />
      <div className="h-1 w-6 bg-line" />
      <div className="h-5 w-6 bg-blood" />
      <div className="h-1 w-6 bg-line" />
    </div>
  );
}
