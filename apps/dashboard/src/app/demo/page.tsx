'use client';

/**
 * Starts a live demo without an account, on a demo instance. The visitor passes a Cloudflare
 * Turnstile check, the API creates a seeded workspace and signs them in, and they land on the
 * dashboard. On an instance without demos this page says so and points to installing instead.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ArrowRight, Check, Loader2 } from 'lucide-react';
import { LogoMark } from '@gami/ui';
import { apiFetch } from '@/lib/api-client';

interface DemoConfig {
  enabled: boolean;
  ttlHours: number | null;
  turnstileSiteKey: string | null;
}

declare global {
  interface Window {
    turnstile?: {
      render: (element: HTMLElement, options: Record<string, unknown>) => string;
      reset: (id?: string) => void;
    };
  }
}

const STEPS = ['Creating your project', 'Adding 36 players', 'Sending a month of events', 'Signing you in'];
/** Long enough to read each step; the real work usually finishes first. */
const STEP_MS = 650;
/** After this, a calm note replaces waiting in silence. */
const SLOW_MS = 12_000;

function useTurnstile(siteKey: string | null, onToken: (token: string | null) => void) {
  const container = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);

  useEffect(() => {
    if (!siteKey || !container.current) return;
    const render = () => {
      if (!window.turnstile || !container.current || widget.current) return;
      widget.current = window.turnstile.render(container.current, {
        sitekey: siteKey,
        theme: 'dark',
        callback: (token: string) => onToken(token),
        'expired-callback': () => onToken(null),
        'error-callback': () => onToken(null),
      });
    };
    if (window.turnstile) return render();
    // Loaded only on this page, and only when the instance uses Turnstile.
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.onload = render;
    document.head.appendChild(script);
  }, [siteKey, onToken]);

  const reset = () => {
    onToken(null);
    if (widget.current) window.turnstile?.reset(widget.current);
  };
  return { container, reset };
}

export default function DemoPage() {
  const reduce = useReducedMotion();
  const [config, setConfig] = useState<DemoConfig | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [phase, setPhase] = useState<'ready' | 'starting' | 'done' | 'error'>('ready');
  const [step, setStep] = useState(0);
  const [slow, setSlow] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const onToken = useCallback((value: string | null) => setToken(value), []);
  const { container, reset } = useTurnstile(config?.turnstileSiteKey ?? null, onToken);

  useEffect(() => {
    apiFetch('/api/demo')
      .then((res) => (res.ok ? res.json() : { enabled: false, ttlHours: null, turnstileSiteKey: null }))
      .then(setConfig)
      .catch(() => setConfig({ enabled: false, ttlHours: null, turnstileSiteKey: null }));
  }, []);

  // Ticks the checklist while the request runs.
  useEffect(() => {
    if (phase !== 'starting') return;
    const ticker = window.setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), STEP_MS);
    const slowTimer = window.setTimeout(() => setSlow(true), SLOW_MS);
    return () => {
      window.clearInterval(ticker);
      window.clearTimeout(slowTimer);
    };
  }, [phase]);

  const start = async () => {
    setPhase('starting');
    setStep(0);
    setSlow(false);
    setMessage(null);
    try {
      const res = await apiFetch('/api/demo/start', { method: 'POST', body: JSON.stringify({ turnstileToken: token ?? undefined }) });
      const body = (await res.json().catch(() => ({}))) as { message?: string };
      if (!res.ok) {
        setPhase('error');
        setMessage(body.message ?? 'The demo could not be started. Try again.');
        reset();
        return;
      }
      setStep(STEPS.length);
      setPhase('done');
      // A full load, so the dashboard starts with the new session.
      window.setTimeout(() => window.location.assign('/dashboard'), reduce ? 200 : 900);
    } catch {
      setPhase('error');
      setMessage('The demo could not be started. Check your connection and try again.');
      reset();
    }
  };

  const needsToken = Boolean(config?.turnstileSiteKey);
  const canStart = config?.enabled && (!needsToken || token) && phase !== 'starting' && phase !== 'done';

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 p-4 text-zinc-100">
      <div className="w-full max-w-md space-y-6">
        <div className="space-y-3 text-center">
          <LogoMark size={48} className="mx-auto block border border-zinc-800" />
          <h1 className="text-2xl font-bold tracking-tight">Try the Gami.Fied dashboard</h1>
          <p className="text-sm text-zinc-400">
            A real dashboard with a made-up language app, 36 players and a month of activity. No account, no email.
          </p>
        </div>

        <div className="space-y-5 border border-zinc-800 bg-zinc-900/80 p-6">
          {!config ? (
            <p className="flex items-center gap-2 text-sm text-zinc-400">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Checking this server…
            </p>
          ) : !config.enabled ? (
            <div className="space-y-3 text-sm text-zinc-300">
              <p>This server does not offer live demos.</p>
              <a className="inline-flex items-center gap-1.5 font-semibold text-brand-300 hover:text-brand-200" href="/login">
                Sign in instead <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </a>
            </div>
          ) : (
            <>
              <ul className="space-y-2.5" aria-live="polite">
                {STEPS.map((label, index) => {
                  const done = phase === 'done' || (phase === 'starting' && index < step);
                  const active = phase === 'starting' && index === step;
                  return (
                    <li key={label} className={`flex items-center gap-3 text-sm transition-colors ${done ? 'text-zinc-100' : active ? 'text-zinc-200' : 'text-zinc-500'}`}>
                      <span className={`flex h-5 w-5 shrink-0 items-center justify-center border ${done ? 'border-success-600 bg-success-600/20' : 'border-zinc-700'}`}>
                        <AnimatePresence initial={false}>
                          {done ? (
                            <motion.span key="done" initial={reduce ? false : { scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 500, damping: 28 }}>
                              <Check className="h-3.5 w-3.5 text-success-400" aria-hidden="true" />
                            </motion.span>
                          ) : active ? (
                            <Loader2 className="h-3 w-3 animate-spin text-zinc-400 motion-reduce:animate-none" aria-hidden="true" />
                          ) : null}
                        </AnimatePresence>
                      </span>
                      {label}
                      {done && <span className="sr-only">, done</span>}
                    </li>
                  );
                })}
              </ul>

              {slow && phase === 'starting' && <p className="text-xs text-zinc-400">This is taking a little longer than usual. It is still going.</p>}
              {message && (
                <p className="border border-danger-800/50 bg-danger-950/30 px-3 py-2 text-xs text-danger-300" role="alert">
                  {message}
                </p>
              )}

              {needsToken && phase !== 'done' && <div ref={container} className="min-h-[65px]" />}

              <motion.button
                type="button"
                onClick={() => void start()}
                disabled={!canStart}
                layout={!reduce}
                className="flex w-full items-center justify-center gap-2 bg-brand-500 px-4 py-2.5 text-sm font-semibold text-on-accent transition-colors hover:bg-brand-400 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {phase === 'done' ? (
                  <>
                    Open the dashboard <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </>
                ) : phase === 'starting' ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Setting it up
                  </>
                ) : (
                  'Start the demo'
                )}
              </motion.button>

              <p className="text-xs leading-relaxed text-zinc-500">
                The demo and everything in it are deleted after {config.ttlHours ?? 24} hours. Email, webhooks and integrations are turned off.
                {needsToken ? ' The check above is Cloudflare Turnstile, which keeps automated sign-ups out.' : ''}
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
