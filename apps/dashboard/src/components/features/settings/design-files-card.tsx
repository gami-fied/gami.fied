'use client';

/**
 * Design files: download this project's design, or import one, such as the file the live demo's
 * "Keep this setup" button saves. Importing adds and updates; it never deletes anything.
 */
import { apiFetch } from '@/lib/api-client';
import React, { useRef, useState } from 'react';
import { Download, FileUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useConfirm } from '@/components/ui/confirm';
import { useToast } from '@/components/ui/toast';

interface Preview {
  project: string | null;
  summary: { new: number; changed: number; same: number; onlyInProject: number };
  warnings: string[];
}

export function DesignFilesCard({ projectId, projectName }: { projectId: string; projectName: string }) {
  const toast = useToast();
  const confirm = useConfirm();
  const input = useRef<HTMLInputElement>(null);
  const [design, setDesign] = useState<unknown>(null);
  const [fileName, setFileName] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setDesign(null);
    setPreview(null);
    setErrors([]);
    setFileName('');
    if (input.current) input.current.value = '';
  };

  const choose = async (file: File | undefined) => {
    if (!file) return;
    reset();
    setFileName(file.name);
    let parsed: unknown;
    try {
      parsed = JSON.parse(await file.text());
    } catch {
      setErrors(['This file is not JSON. Choose a design file saved from Gami.Fied.']);
      return;
    }
    setBusy(true);
    try {
      const res = await apiFetch(`/api/projects/${projectId}/design/preview`, { method: 'POST', body: JSON.stringify({ design: parsed }) });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setErrors(body?.errors ?? [body?.message ?? 'The file could not be checked.']);
        return;
      }
      setDesign(parsed);
      setPreview(body);
    } finally {
      setBusy(false);
    }
  };

  const importDesign = async () => {
    if (!preview || !design) return;
    const count = preview.summary.new + preview.summary.changed;
    const ok = await confirm({
      title: `Import ${count} ${count === 1 ? 'item' : 'items'} into ${projectName}?`,
      message: 'New items are added and changed ones are updated, for live players straight away. Nothing is deleted, and rules keep their history.',
      confirmText: 'Import',
    });
    if (!ok) return;
    setBusy(true);
    try {
      const res = await apiFetch(`/api/projects/${projectId}/design`, { method: 'POST', body: JSON.stringify({ design }) });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.message ?? 'The import failed. Nothing was changed.');
      toast.success(`Imported: ${body.created} added, ${body.updated} updated.`);
      reset();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'The import failed.');
    } finally {
      setBusy(false);
    }
  };

  const pending = preview ? preview.summary.new + preview.summary.changed : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-bold">Design files</CardTitle>
        <CardDescription>
          Save this project&apos;s rules, achievements, levels, streaks, store and the rest as a file, or import one from another project or the live demo. Player data is never included.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <a
            href={`/api/projects/${projectId}/design`}
            download
            className="inline-flex items-center gap-2 border border-zinc-700 px-3 py-1.5 text-xs font-semibold text-zinc-100 transition-colors hover:border-zinc-500"
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            Download this design
          </a>
          <Button type="button" variant="secondary" size="sm" onClick={() => input.current?.click()} isLoading={busy && !preview}>
            <FileUp className="h-3.5 w-3.5" aria-hidden="true" />
            Import a design file
          </Button>
          <input ref={input} type="file" accept="application/json,.json" className="sr-only" aria-label="Design file to import" onChange={(e) => void choose(e.target.files?.[0])} />
        </div>

        {errors.length > 0 && (
          <div className="border border-danger-800/50 bg-danger-950/30 p-3 text-xs text-danger-200" role="alert">
            <p className="font-semibold">{fileName ? `${fileName} cannot be imported:` : 'This file cannot be imported:'}</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-4">
              {errors.slice(0, 8).map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          </div>
        )}

        {preview && (
          <div className="space-y-3 border border-zinc-800 bg-zinc-900/50 p-3 text-xs text-zinc-300">
            <p>
              <span className="font-semibold text-zinc-100">{fileName}</span>
              {preview.project ? ` (from ${preview.project})` : ''}: {preview.summary.new} new, {preview.summary.changed} changed, {preview.summary.same} already the same, and{' '}
              {preview.summary.onlyInProject} only here, which stay as they are.
            </p>
            {preview.warnings.map((warning) => (
              <p key={warning} className="text-warning-300">
                {warning}
              </p>
            ))}
            <div className="flex gap-2">
              <Button type="button" size="sm" onClick={() => void importDesign()} isLoading={busy} disabled={pending === 0}>
                {pending === 0 ? 'Nothing to import' : `Import ${pending}`}
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={reset}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
