/**
 * Le portrait du joueur courant, et le relais d'un joueur a l'autre sur un meme
 * telephone.
 *
 * Deux personnes qui s'entrainent ensemble n'ont qu'un appareil : un appui sur le
 * buste passe au joueur suivant, sans ecran intermediaire, et mene la ou il en est —
 * son arene s'il a une seance en cours, le choix de la seance sinon. Rien ne bouge
 * dans les donnees, seul le regard change (`setCurrentUser`) ; chaque seance reste
 * dans le sous-arbre de son joueur. Seul dans le dojo, le portrait n'est qu'un dessin.
 */
import { sfx } from '../fx/audio';
import { HERO, HERO_BUST, costume } from '../fx/sprites';
import { navigate } from '../router';
import { getCurrentUserId, getState, setCurrentUser, useStore } from '../store/state';
import type { User } from '../types';
import { Sprite } from './Sprite';

/** Le joueur d'apres, dans l'ordre de la liste, en boucle ; `null` s'il n'y a personne d'autre. */
export function nextUserId(users: User[], current: string | null): string | null {
  if (users.length < 2) return null;
  const index = users.findIndex((u) => u.id === current);
  return users[(index + 1) % users.length].id;
}

export function switchToNextUser() {
  const state = getState();
  const id = nextUserId(state.users, getCurrentUserId());
  if (!id) return;
  sfx.select();
  setCurrentUser(id);
  navigate(state.liveSessions[id] ? '/arena' : '/', { replace: true });
}

interface Props {
  scale: number;
  frame: number;
  flash?: boolean;
}

export function QuickSwitch({ scale, frame, flash = false }: Props) {
  const { state, users } = useStore();
  const portrait = (
    <Sprite
      sprite={HERO}
      palette={costume(state.user.palette)}
      frame={frame}
      flash={flash}
      scale={scale}
      cropX={HERO_BUST.x}
      cropY={HERO_BUST.y}
      cropW={HERO_BUST.w}
      cropH={HERO_BUST.h}
    />
  );
  const frameClass = 'bevel-in flex shrink-0 overflow-hidden bg-ink';

  if (users.length < 2) return <div className={frameClass}>{portrait}</div>;
  return (
    <button
      type="button"
      aria-label="changer de joueur"
      onClick={switchToNextUser}
      className={`${frameClass} touch-manipulation`}
    >
      {portrait}
    </button>
  );
}
