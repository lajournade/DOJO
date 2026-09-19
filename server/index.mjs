/**
 * Serveur DOJO : sert l'application compilee et expose une petite API JSON.
 * Zero dependance — node:http suffit, et l'application survivra sans maintenance.
 * Les routes sont dans `app.mjs` ; ici, seulement le port, le fichier et les signaux.
 */
import { createServer } from 'node:http';
import { createStore } from './store.mjs';
import { createApp } from './app.mjs';

const PORT = Number(process.env.PORT ?? 5180);
const HOST = process.env.HOST ?? '0.0.0.0';

const store = createStore({ file: process.env.DOJO_DATA });
await store.load();
await store.backup();
// Une sauvegarde datee par jour tant que le serveur tourne.
setInterval(() => store.backup().catch(() => {}), 6 * 60 * 60 * 1000).unref();

const server = createServer(createApp({ store }));
server.listen(PORT, HOST, () => {
  console.log(`[dojo] pret sur http://${HOST}:${PORT}`);
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, async () => {
    await store.save();
    server.close(() => process.exit(0));
  });
}
