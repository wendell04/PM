import Echo from 'laravel-echo';
import Pusher from 'pusher-js';

let echoInstance = null;
let echoToken    = null;

export function getEcho(token) {
  if (typeof window === 'undefined') return null;

  // If token changed, tear down stale instance
  if (echoInstance && token && token !== echoToken) {
    echoInstance.disconnect();
    echoInstance = null;
    echoToken    = null;
  }

  if (echoInstance) return echoInstance;
  if (!token) return null;

  window.Pusher = Pusher;

  echoInstance = new Echo({
    broadcaster:       'reverb',
    key:               process.env.NEXT_PUBLIC_REVERB_APP_KEY,
    wsHost:            process.env.NEXT_PUBLIC_REVERB_HOST || '127.0.0.1',
    wsPort:            Number(process.env.NEXT_PUBLIC_REVERB_PORT) || 8080,
    wssPort:           Number(process.env.NEXT_PUBLIC_REVERB_PORT) || 8080,
    forceTLS:          (process.env.NEXT_PUBLIC_REVERB_SCHEME || 'http') === 'https',
    enabledTransports: ['ws', 'wss'],
    authEndpoint:      `${process.env.NEXT_PUBLIC_API_URL}/broadcasting/auth`,
    auth: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  });

  echoToken = token;
  return echoInstance;
}

export function disconnectEcho() {
  if (echoInstance) {
    echoInstance.disconnect();
    echoInstance = null;
    echoToken    = null;
  }
}
