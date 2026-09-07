import { useEffect } from 'react';
import { MotionConfig } from 'motion/react';
import { useRoute } from './router';
import { Arena } from './screens/Arena';
import { History } from './screens/History';
import { Players } from './screens/Players';
import { Program } from './screens/Program';
import { Results } from './screens/Results';
import { Roster } from './screens/Roster';
import { useStore } from './store/state';
import { boot, startSyncDaemon } from './store/sync';

export function App() {
  const route = useRoute();
  const { loaded, userId, users } = useStore();
  // Tant qu'aucun profil n'est choisi sur cet appareil — ou que celui qui l'etait a
  // disparu —, la selection passe avant tout le reste : chaque ecran parle d'un joueur.
  const known = userId !== null && users.some((u) => u.id === userId);

  useEffect(() => {
    void boot();
    startSyncDaemon();
  }, []);

  return (
    // `reducedMotion="user"` etend le reglage systeme a toutes les animations de
    // motion : les entrees et les ressorts se posent net, l'information reste.
    <MotionConfig reducedMotion="user">
      {!loaded ? <Boot /> : known ? screen(route) : <Players />}
      <Crt />
    </MotionConfig>
  );
}

function screen(route: string) {
  switch (route) {
    case '/arena':
      return <Arena />;
    case '/results':
      return <Results />;
    case '/history':
      return <History />;
    case '/program':
      return <Program />;
    case '/players':
      return <Players />;
    default:
      return <Roster />;
  }
}

function Boot() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-ink">
      <span className="fight-text arcade-title text-p4">dojo</span>
      <span className="fight-text blinking text-p1 tracking-[0.3em] text-ash">chargement</span>
    </div>
  );
}

/**
 * Le verre de la borne : lignes de balayage et coins assombris, posés par-dessus
 * toute l'application. Purement decoratif, donc jamais dans le flux des clics.
 */
function Crt() {
  return (
    <>
      <div aria-hidden className="scanlines pointer-events-none fixed inset-0 z-[60]" />
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-[60]"
        style={{
          background:
            'radial-gradient(ellipse at center, transparent 62%, rgb(0 0 0 / 0.32) 100%)',
        }}
      />
    </>
  );
}
