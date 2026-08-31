import { useEffect } from 'react';
import { useRoute } from './router';
import { Arena } from './screens/Arena';
import { History } from './screens/History';
import { Program } from './screens/Program';
import { Results } from './screens/Results';
import { Roster } from './screens/Roster';
import { useStore } from './store/state';
import { boot, startSyncDaemon } from './store/sync';

export function App() {
  const route = useRoute();
  const { loaded } = useStore();

  useEffect(() => {
    void boot();
    startSyncDaemon();
  }, []);

  if (!loaded) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-ink">
        <span className="fight-text pulsing text-3xl text-blood">dojo</span>
      </div>
    );
  }

  switch (route) {
    case '/arena':
      return <Arena />;
    case '/results':
      return <Results />;
    case '/history':
      return <History />;
    case '/program':
      return <Program />;
    default:
      return <Roster />;
  }
}
