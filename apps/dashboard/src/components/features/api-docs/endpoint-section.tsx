'use client';

import React from 'react';
import { CodeBlock, InlineCode } from './code-block';
import {
  bodySchema,
  codeSample,
  errorResponses,
  exampleFor,
  fieldRows,
  responseSchema,
  SAMPLE_LANGUAGES,
  successResponse,
  typeLabel,
  usesEndUserToken,
  type Endpoint,
  type FieldRow,
  type OpenApiSpec,
  type Parameter,
  type SampleLanguage,
} from '@/lib/openapi-docs';

const METHOD_STYLES: Record<string, string> = {
  get: 'text-info-400 border-info-500/30 bg-info-500/10',
  post: 'text-success-400 border-success-500/30 bg-success-500/10',
  patch: 'text-warning-400 border-warning-500/30 bg-warning-500/10',
  delete: 'text-danger-400 border-danger-500/30 bg-danger-500/10',
};

export function MethodBadge({ method }: { method: string }) {
  return (
    <span
      className={`inline-block w-12 shrink-0 border py-0.5 text-center text-[10px] font-bold uppercase ${METHOD_STYLES[method] ?? ''}`}
    >
      {method === 'delete' ? 'DEL' : method}
    </span>
  );
}

function FieldTable({ title, rows, showRequired = true }: { title: string; rows: FieldRow[]; showRequired?: boolean }) {
  if (rows.length === 0) return null;
  return (
    <div className="space-y-2">
      <h4 className="text-xs font-bold text-zinc-200">{title}</h4>
      <dl className="border-t border-zinc-800 divide-y divide-zinc-800/70">
        {rows.map((row) => (
          <div key={row.name} className="py-2" style={{ paddingLeft: row.depth * 16 }}>
            <dt className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <code className="text-xs font-bold text-zinc-100">{row.name.split('.').pop()}</code>
              <span className="text-[11px] text-zinc-400">{row.type}</span>
              {showRequired && (
                <span
                  className={`text-[11px] font-semibold ${row.required ? 'text-danger-400' : 'text-zinc-400'}`}
                >
                  {row.required ? 'Required' : 'Optional'}
                </span>
              )}
            </dt>
            {(row.description || row.notes.length > 0) && (
              <dd className="mt-0.5 text-xs leading-relaxed text-zinc-400">
                <InlineCode text={row.description} />
                {row.notes.map((note) => (
                  <span key={note} className="block">
                    <InlineCode text={note} />
                  </span>
                ))}
              </dd>
            )}
          </div>
        ))}
      </dl>
    </div>
  );
}

function parameterRows(spec: OpenApiSpec, parameters: Parameter[]): FieldRow[] {
  return parameters.map((parameter) => ({
    name: parameter.name,
    depth: 0,
    type: parameter.schema ? typeLabel(spec, parameter.schema) : 'string',
    required: Boolean(parameter.required),
    description: parameter.description,
    notes: fieldRows(spec, {
      type: 'object',
      properties: { value: parameter.schema ?? {} },
    })[0]?.notes ?? [],
  }));
}

interface EndpointSectionProps {
  spec: OpenApiSpec;
  endpoint: Endpoint;
  baseUrl: string;
  language: SampleLanguage;
  onLanguageChange: (language: SampleLanguage) => void;
}

export function EndpointSection({ spec, endpoint, baseUrl, language, onLanguageChange }: EndpointSectionProps) {
  const { id, method, path, operation } = endpoint;
  const parameters = operation.parameters ?? [];
  const ofKind = (kind: Parameter['in']) =>
    parameterRows(spec, parameters.filter((parameter) => parameter.in === kind));

  const body = bodySchema(operation);
  const response = responseSchema(operation);
  const success = successResponse(operation);
  const scope = operation['x-required-scope'];

  return (
    <section id={id} className="scroll-mt-20 border-t border-zinc-800 py-8">
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 xl:gap-8">
        <div className="min-w-0 space-y-5">
          <div className="space-y-2">
            <h3 className="text-base font-bold text-zinc-100">
              <a href={`#${id}`} className="hover:text-brand-400 transition-colors">
                {operation.summary}
              </a>
            </h3>
            <div className="flex items-center gap-2 min-w-0">
              <MethodBadge method={method} />
              <code className="text-xs text-zinc-200 break-all">{path}</code>
            </div>
            <p className="text-sm leading-relaxed text-zinc-300">
              <InlineCode text={operation.description} />
            </p>
            <p className="text-xs text-zinc-400">
              {usesEndUserToken(operation) ? (
                'Needs an end-user token.'
              ) : (
                <>
                  Needs an API key with the <InlineCode text={`\`${scope}\``} /> scope.
                </>
              )}
            </p>
          </div>

          <FieldTable title="Path parameters" rows={ofKind('path')} />
          <FieldTable title="Query parameters" rows={ofKind('query')} />
          <FieldTable title="Headers" rows={ofKind('header')} />
          {body && <FieldTable title="Request body" rows={fieldRows(spec, body)} />}
          {response && (
            <details className="group">
              <summary className="cursor-pointer text-xs font-bold text-zinc-200 hover:text-brand-400 transition-colors">
                Response fields
              </summary>
              <div className="mt-2">
                <FieldTable title="" rows={fieldRows(spec, response)} showRequired={false} />
              </div>
            </details>
          )}

          <div className="space-y-2">
            <h4 className="text-xs font-bold text-zinc-200">Errors</h4>
            <ul className="space-y-1 text-xs text-zinc-400">
              {errorResponses(operation).map(({ status, description }) => (
                <li key={status} className="flex gap-2">
                  <code className="shrink-0 font-bold text-zinc-200">{status}</code>
                  <span>
                    <InlineCode text={description} />
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="min-w-0 space-y-3 xl:sticky xl:top-20 xl:self-start">
          <CodeBlock
            code={codeSample(endpoint, baseUrl, language)}
            label={
              <div role="tablist" aria-label="Code language" className="flex gap-3">
                {SAMPLE_LANGUAGES.map((option) => (
                  <button
                    key={option.id}
                    role="tab"
                    aria-selected={language === option.id}
                    onClick={() => onLanguageChange(option.id)}
                    className={`transition-colors ${
                      language === option.id ? 'text-brand-400' : 'hover:text-zinc-100'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            }
          />
          {response && success && (
            <CodeBlock
              code={JSON.stringify(exampleFor(spec, response), null, 2)}
              label={`Response ${success.status}`}
            />
          )}
        </div>
      </div>
    </section>
  );
}
