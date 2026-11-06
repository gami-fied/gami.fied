'use client';

import React, { useState } from 'react';
import { Check, Copy } from 'lucide-react';

interface CodeBlockProps {
  code: string;
  label?: React.ReactNode;
}

export function CodeBlock({ code, label }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="border border-zinc-800 bg-zinc-950 min-w-0">
      <div className="flex items-center justify-between gap-2 border-b border-zinc-800 px-3 py-1.5">
        <div className="min-w-0 text-[11px] font-semibold text-zinc-400">{label}</div>
        <button
          onClick={copy}
          aria-label="Copy code"
          title="Copy"
          className="p-1 text-zinc-400 hover:text-zinc-100 transition-colors"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-success-400" /> : <Copy className="w-3.5 h-3.5" />}
        </button>
      </div>
      <pre className="overflow-x-auto p-3 text-xs leading-relaxed text-zinc-200">
        <code>{code}</code>
      </pre>
    </div>
  );
}

/** Text from the spec, with `backticks` shown as code. */
export function InlineCode({ text }: { text?: string }) {
  if (!text) return null;
  return (
    <>
      {text.split(/(`[^`]+`)/).map((part, index) =>
        part.startsWith('`') ? (
          <code key={index} className="bg-zinc-800/70 px-1 text-[0.92em] text-zinc-100">
            {part.slice(1, -1)}
          </code>
        ) : (
          part
        )
      )}
    </>
  );
}
