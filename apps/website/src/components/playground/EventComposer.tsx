/** Builds one event to send through the engine: a preset or a type, a payload and a time. */
import { useState } from 'react';
import { Send } from 'lucide-react';
import { Button, Dropdown, Input, Textarea } from '@gami/ui';
import type { EventPreset } from '../../lib/playground/scenarios';

export type When = 'now' | 'next_day' | 'next_week' | 'same_time';

const WHEN_OPTIONS: { value: When; label: string; sublabel: string }[] = [
  { value: 'next_day', label: 'A day after the last event', sublabel: 'Grows a daily streak' },
  { value: 'same_time', label: 'Right after the last event', sublabel: 'Same day, same week' },
  { value: 'next_week', label: 'A week after the last event', sublabel: 'Grows a weekly streak, or breaks a daily one' },
  { value: 'now', label: 'Now', sublabel: 'The time on your computer' },
];

interface Props {
  presets: EventPreset[];
  onSend: (event: { type: string; payload: Record<string, unknown>; when: When }) => void;
}

export function EventComposer({ presets, onSend }: Props) {
  const first = presets[0];
  const [type, setType] = useState(first?.type ?? 'lesson_completed');
  const [payload, setPayload] = useState(JSON.stringify(first?.payload ?? {}, null, 2));
  const [when, setWhen] = useState<When>('next_day');
  const [error, setError] = useState<string | null>(null);

  const usePreset = (preset: EventPreset) => {
    setType(preset.type);
    setPayload(JSON.stringify(preset.payload, null, 2));
    setError(null);
  };

  const send = () => {
    if (!type.trim()) return setError('Give the event a type, such as lesson_completed.');
    let parsed: unknown;
    try {
      parsed = payload.trim() ? JSON.parse(payload) : {};
    } catch {
      return setError('The payload is not valid JSON.');
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return setError('The payload must be a JSON object, such as { "score": 90 }.');
    setError(null);
    onSend({ type: type.trim(), payload: parsed as Record<string, unknown>, when });
  };

  return (
    <div className="space-y-4">
      {presets.length > 0 && (
        <div className="flex flex-wrap gap-2" aria-label="Presets">
          {presets.map((preset) => (
            <button
              key={preset.label}
              type="button"
              onClick={() => usePreset(preset)}
              aria-pressed={preset.type === type && JSON.stringify(preset.payload, null, 2) === payload}
              className="border border-zinc-800 bg-zinc-900/60 px-2.5 py-1.5 text-xs text-zinc-300 transition-colors hover:border-zinc-600 hover:text-zinc-50 aria-pressed:border-brand-500/70 aria-pressed:text-brand-200"
            >
              {preset.label}
            </button>
          ))}
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <Input label="Event type" value={type} onChange={(e) => setType(e.target.value)} spellCheck={false} />
        <div>
          <span className="mb-1.5 block text-[13px] font-medium tracking-tight text-zinc-300">When it happened</span>
          <Dropdown options={WHEN_OPTIONS} value={when} onChange={(value) => setWhen(value as When)} align="right" />
        </div>
      </div>
      <Textarea label="Payload" value={payload} onChange={(e) => setPayload(e.target.value)} rows={4} spellCheck={false} className="font-mono text-xs" />
      {error && (
        <p className="text-xs text-danger-300" role="alert">
          {error}
        </p>
      )}
      <Button type="button" onClick={send} className="w-full gap-2">
        <Send className="h-4 w-4" aria-hidden="true" />
        Send event
      </Button>
    </div>
  );
}
