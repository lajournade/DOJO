/**
 * Garde l'ecran allume pendant une seance.
 *
 * `navigator.wakeLock` exige un contexte securise : derriere le VPN en http://,
 * Safari le refuse. On retombe alors sur la video muette en boucle, qui, elle,
 * fonctionne partout (technique NoSleep).
 */
let sentinel: WakeLockSentinel | null = null;
let video: HTMLVideoElement | null = null;

/** Une video d'une frame, transparente, encodee en base64 — rien a telecharger. */
const TINY_WEBM =
  'data:video/webm;base64,GkXfo59ChoEBQveBAULygQRC84EIQoKEd2VibUKHgQRChYECGFOAZwEAAAAAAAHTEU2bdLpNu4tTq4QVSalmU6yBoU27i1OrhBZUrmtTrIHGTbuMU6uEElTDZ1OsggEXTbuMU6uEHFO7a1OsggG97AEAAAAAAABZAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAHFO7a5G7j7OBALeK94EB8YIBfw==';

function ensureVideo(): HTMLVideoElement {
  if (video) return video;
  video = document.createElement('video');
  video.setAttribute('playsinline', '');
  video.muted = true;
  video.loop = true;
  video.src = TINY_WEBM;
  Object.assign(video.style, {
    position: 'fixed',
    width: '1px',
    height: '1px',
    opacity: '0',
    pointerEvents: 'none',
  });
  document.body.append(video);
  return video;
}

export async function keepAwake() {
  try {
    if ('wakeLock' in navigator) {
      sentinel = await navigator.wakeLock.request('screen');
      sentinel.addEventListener('release', () => {
        sentinel = null;
      });
      return;
    }
  } catch {
    // Contexte non securise ou refus systeme : on passe au repli.
  }
  try {
    await ensureVideo().play();
  } catch {
    // Lecture refusee avant tout geste : le prochain appui sur IMPACT relancera.
  }
}

export function releaseAwake() {
  void sentinel?.release().catch(() => {});
  sentinel = null;
  video?.pause();
}

/** iOS relache le verrou quand l'application repasse en arriere-plan. */
export function rearmOnVisible() {
  const handler = () => {
    if (document.visibilityState === 'visible') void keepAwake();
  };
  document.addEventListener('visibilitychange', handler);
  return () => document.removeEventListener('visibilitychange', handler);
}
