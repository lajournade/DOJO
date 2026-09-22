/**
 * Le « select player » : une grille de portraits, un par joueur.
 *
 * Sans compte ni mot de passe — l'application vit sur un reseau prive, et le
 * telephone se souvient du profil choisi. Chacun garde son journal, sa seance en
 * cours et son programme ; la bibliotheque de programmes, elle, est commune.
 */
import { useState } from 'react';
import { motion } from 'motion/react';
import { useHold } from '../fx/hold';
import { sfx } from '../fx/audio';
import { costume, fighter } from '../fx/sprites';
import { navigate } from '../router';
import { dispatch, setCurrentUser, useStore } from '../store/state';
import type { User } from '../types';
import { Sprite, useFrame } from '../components/Sprite';

export function Players() {
  const { users, userId } = useStore();
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');
  const frame = useFrame(2, 2.5);

  const choose = (user: User) => {
    sfx.select();
    setCurrentUser(user.id);
    navigate('/', { replace: true });
  };

  const create = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const user: User = {
      id: `u-${Date.now().toString(36)}`,
      name: trimmed,
      activeProgramId: null,
      palette: users.length,
    };
    // L'operation nomme son joueur explicitement : il n'existait pas encore.
    dispatch('user.upsert', { user, userId: user.id });
    setName('');
    setNaming(false);
    choose(user);
  };

  const remove = (user: User) => {
    if (!confirm(`Supprimer ${user.name} et tout son journal ?`)) return;
    dispatch('user.remove', { userId: user.id });
    if (user.id === userId) setCurrentUser(null);
  };

  return (
    <div className="min-h-dvh bg-ink">
      <header className="pad-top pad-x pb-3">
        <h1 className="fight-text arcade-title text-p4">dojo</h1>
        <p className="fight-text mt-2 text-p1 tracking-[0.2em] text-cyan">select player</p>
      </header>

      <main className="pad-x grid grid-cols-2 gap-2">
        {users.map((user, i) => (
          <PlayerCard
            key={user.id}
            user={user}
            current={user.id === userId}
            frame={frame}
            delay={i * 0.06}
            onChoose={() => choose(user)}
            onRemove={() => remove(user)}
          />
        ))}

        {naming ? (
          <div className="bevel-sm col-span-2 bg-ink-2 p-3">
            <label className="label-text block text-p2 text-ash" htmlFor="player-name">
              nom du joueur
            </label>
            <input
              id="player-name"
              autoFocus
              value={name}
              maxLength={16}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && create()}
              className="bevel-in mt-1 w-full min-w-0 bg-ink-3 p-2 font-bold text-bone outline-none"
            />
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setNaming(false);
                  setName('');
                }}
                className="bevel-sm keycap label-text bg-ink-3 py-3 text-p2 text-ash"
              >
                annuler
              </button>
              <button
                type="button"
                onClick={create}
                className="bevel keycap fight-text bg-blood py-3 text-p2 text-bone"
              >
                entrer
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setNaming(true)}
            className="bevel-sm keycap label-text col-span-2 bg-ink-2 py-4 text-p2 text-ash"
          >
            + nouveau joueur
          </button>
        )}
      </main>

      {users.length > 0 && (
        <p className="pad-x pad-bottom mt-3 text-center text-p2 text-ash/70">
          appui long sur un joueur pour le supprimer
        </p>
      )}
    </div>
  );
}

function PlayerCard({
  user,
  current,
  frame,
  delay,
  onChoose,
  onRemove,
}: {
  user: User;
  current: boolean;
  frame: number;
  delay: number;
  onChoose: () => void;
  onRemove: () => void;
}) {
  const hold = useHold(onRemove);
  const { sprite, bust } = fighter(user.palette);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.25 }}
      className="bevel-sm relative overflow-hidden bg-ink-2 p-1.5"
    >
      <button
        type="button"
        onClick={() => !hold.consumed() && onChoose()}
        {...hold.props}
        className="block w-full touch-manipulation select-none text-left [-webkit-touch-callout:none]"
      >
        <div className="bevel-in halftone relative flex justify-center overflow-hidden bg-ink">
          <Sprite
            sprite={sprite}
            palette={costume(user.palette)}
            frame={frame}
            scale={3}
            cropX={bust.x}
            cropY={bust.y}
            cropW={bust.w}
            cropH={bust.h}
          />
        </div>
        <p className="mt-1.5 truncate text-p2 font-bold uppercase text-bone">{user.name}</p>
        <p className="text-p2 text-ash">{current ? 'en jeu' : 'appuyer pour entrer'}</p>
      </button>

      {current && (
        <span className="blinking pointer-events-none absolute inset-0 border-4 border-cyan" />
      )}
      <div aria-hidden {...hold.gauge} />
    </motion.div>
  );
}
