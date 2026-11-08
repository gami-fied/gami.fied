import { Gami, type LiveNotification } from '@gami.fied/sdk';
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

export interface GamiProviderProps {
  /** A client built with an `endUserToken`. Never one built with an API key. */
  client?: Gami;
  /** Or let the provider build one. Create the token on your server with `POST /v1/end-user-tokens`. */
  endUserToken?: string;
  /** Where Gami.Fied runs. Only needed with `endUserToken`. */
  baseUrl?: string;
  /** Listen for live updates, so toasts and numbers change as things happen. Defaults to on. */
  live?: boolean;
  /** How many recent notifications to remember for feeds and toasts. */
  maxNotifications?: number;
  children: ReactNode;
}

export interface GamiContextValue {
  client: Gami;
  /** Goes up whenever the player's data may have changed, so hooks know to fetch again. */
  version: number;
  /** Whether the live stream is connected. */
  connected: boolean;
  /** Notifications received live, newest first. */
  notifications: LiveNotification[];
  /** Forget a notification that has been shown, such as a toast that timed out. */
  dismiss: (id: string) => void;
  /** Ask every hook to fetch again. */
  refresh: () => void;
}

const GamiContext = createContext<GamiContextValue | null>(null);

/** Gives the components below it one connection to Gami.Fied. Put it once near the top of your app. */
export function GamiProvider({ client, endUserToken, baseUrl, live = true, maxNotifications = 20, children }: GamiProviderProps) {
  const resolved = useMemo(() => {
    if (client) return client;
    if (!endUserToken) throw new Error('GamiProvider needs a `client` or an `endUserToken`.');
    return new Gami({ endUserToken, baseUrl });
  }, [client, endUserToken, baseUrl]);

  const [version, setVersion] = useState(0);
  const [connected, setConnected] = useState(false);
  const [notifications, setNotifications] = useState<LiveNotification[]>([]);
  const limit = useRef(maxNotifications);
  limit.current = maxNotifications;

  useEffect(() => {
    if (!live || typeof window === 'undefined') return;
    const connection = resolved.me.subscribe({
      onOpen: () => {
        setConnected(true);
        // Anything that happened while disconnected is caught by fetching again.
        setVersion((value) => value + 1);
      },
      onDisconnect: () => setConnected(false),
      onNotification: (notification) => {
        setNotifications((current) => [notification, ...current.filter((item) => item.id !== notification.id)].slice(0, limit.current));
        setVersion((value) => value + 1);
      },
      onXp: () => setVersion((value) => value + 1),
    });
    return () => {
      connection.close();
      setConnected(false);
    };
  }, [resolved, live]);

  const value = useMemo<GamiContextValue>(
    () => ({
      client: resolved,
      version,
      connected,
      notifications,
      dismiss: (id) => setNotifications((current) => current.filter((item) => item.id !== id)),
      refresh: () => setVersion((current) => current + 1),
    }),
    [resolved, version, connected, notifications]
  );

  return <GamiContext.Provider value={value}>{children}</GamiContext.Provider>;
}

export function useGami(): GamiContextValue {
  const value = useContext(GamiContext);
  if (!value) throw new Error('Gami.Fied components must be used inside <GamiProvider>.');
  return value;
}
