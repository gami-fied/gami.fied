export interface Schema {
  $ref?: string;
  type?: string | string[];
  format?: string;
  description?: string;
  properties?: Record<string, Schema>;
  required?: string[];
  items?: Schema;
  allOf?: Schema[];
  enum?: unknown[];
  default?: unknown;
  example?: unknown;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  minItems?: number;
  maxItems?: number;
}

export interface Parameter {
  name: string;
  in: 'path' | 'query' | 'header';
  required?: boolean;
  description?: string;
  schema?: Schema;
}

interface Media {
  schema: Schema;
  example?: unknown;
}

export interface Operation {
  operationId?: string;
  summary?: string;
  description?: string;
  tags?: string[];
  parameters?: Parameter[];
  security?: Record<string, unknown>[];
  'x-required-scope'?: string;
  requestBody?: { required?: boolean; content: Record<string, Media> };
  responses: Record<string, { description?: string; content?: Record<string, Media> }>;
}

export interface OpenApiSpec {
  info: { title: string; version: string; description?: string };
  tags?: { name: string }[];
  paths: Record<string, Record<string, Operation>>;
  components?: { schemas?: Record<string, Schema> };
}

export interface Endpoint {
  id: string;
  method: string;
  path: string;
  operation: Operation;
}

export interface EndpointGroup {
  name: string;
  endpoints: Endpoint[];
}

export interface FieldRow {
  name: string;
  depth: number;
  type: string;
  required: boolean;
  description?: string;
  /** Limits, defaults and allowed values, in words. */
  notes: string[];
}

const MAX_DEPTH = 4;
const JSON_TYPE = 'application/json';

export function resolveSchema(spec: OpenApiSpec, schema: Schema): Schema {
  const base = schema.$ref
    ? { ...spec.components?.schemas?.[schema.$ref.split('/').pop() as string], ...schema }
    : schema;
  const parts = (base.allOf ?? []).map((part) => resolveSchema(spec, part));
  if (parts.length === 0) return base;
  return {
    ...base,
    properties: Object.assign({}, ...parts.map((part) => part.properties), base.properties),
    required: [...parts.flatMap((part) => part.required ?? []), ...(base.required ?? [])],
  };
}

const typesOf = (schema: Schema) => [schema.type ?? []].flat();

export function typeLabel(spec: OpenApiSpec, input: Schema): string {
  const schema = resolveSchema(spec, input);
  const label = typesOf(schema)
    .map((type) => {
      if (type === 'array' && schema.items) return `array of ${typeLabel(spec, schema.items)}`;
      if (type === 'string' && schema.format) return `string (${schema.format})`;
      return type;
    })
    .join(' or ');
  return label || 'any';
}

function notesFor(schema: Schema): string[] {
  const notes: string[] = [];
  if (schema.enum) notes.push(`One of: ${schema.enum.map((value) => `\`${value}\``).join(', ')}`);
  if (schema.default !== undefined) notes.push(`Default: \`${JSON.stringify(schema.default)}\``);

  const range = (min?: number, max?: number, unit = '') => {
    if (min !== undefined && max !== undefined) notes.push(`${min} to ${max}${unit}`);
    else if (max !== undefined) notes.push(`Up to ${max}${unit}`);
    else if (min !== undefined) notes.push(`At least ${min}${unit}`);
  };
  range(schema.minimum, schema.maximum);
  range(schema.minLength, schema.maxLength, ' characters');
  range(schema.minItems, schema.maxItems, ' items');
  return notes;
}

/** Flattens a schema into rows, with nested fields written as `parent.child`. */
export function fieldRows(spec: OpenApiSpec, input: Schema, parent = '', depth = 0): FieldRow[] {
  const schema = resolveSchema(spec, input);
  const target = schema.items ? resolveSchema(spec, schema.items) : schema;
  const required = target.required ?? [];

  return Object.entries(target.properties ?? {}).flatMap(([key, raw]) => {
    const field = resolveSchema(spec, raw);
    const name = parent ? `${parent}.${key}` : key;
    const row: FieldRow = {
      name,
      depth,
      type: typeLabel(spec, raw),
      required: required.includes(key),
      description: field.description,
      notes: notesFor(field),
    };
    return depth < MAX_DEPTH ? [row, ...fieldRows(spec, raw, name, depth + 1)] : [row];
  });
}

/** Builds a sample value from the examples on each field. */
export function exampleFor(spec: OpenApiSpec, input: Schema, depth = 0): unknown {
  const schema = resolveSchema(spec, input);
  if (schema.example !== undefined) return schema.example;
  if (depth > MAX_DEPTH) return null;

  const types = typesOf(schema);
  if (types.includes('array')) return schema.items ? [exampleFor(spec, schema.items, depth + 1)] : [];
  if (schema.properties) {
    return Object.fromEntries(
      Object.entries(schema.properties).map(([key, field]) => [
        key,
        exampleFor(spec, field, depth + 1),
      ])
    );
  }
  if (schema.default !== undefined) return schema.default;
  if (types.includes('null')) return null;
  if (types.includes('integer') || types.includes('number')) return 0;
  if (types.includes('boolean')) return false;
  if (types.includes('object')) return {};
  return 'string';
}

export function successResponse(operation: Operation) {
  const [status, response] =
    Object.entries(operation.responses).find(([code]) => code.startsWith('2')) ?? [];
  return status && response ? { status, ...response } : null;
}

export function errorResponses(operation: Operation) {
  return Object.entries(operation.responses)
    .filter(([code]) => !code.startsWith('2'))
    .map(([status, response]) => ({ status, description: response.description ?? '' }));
}

export const responseSchema = (operation: Operation) =>
  successResponse(operation)?.content?.[JSON_TYPE]?.schema;
export const bodySchema = (operation: Operation) =>
  operation.requestBody?.content[JSON_TYPE]?.schema;
export const bodyExample = (operation: Operation) =>
  operation.requestBody?.content[JSON_TYPE]?.example;

export const usesEndUserToken = (operation: Operation) =>
  Boolean(operation.security?.some((entry) => 'endUserToken' in entry));

export function groupEndpoints(spec: OpenApiSpec): EndpointGroup[] {
  const endpoints = Object.entries(spec.paths).flatMap(([path, methods]) =>
    Object.entries(methods).map(([method, operation]) => ({
      id: operation.operationId ?? `${method}-${path}`,
      method,
      path,
      operation,
    }))
  );

  const names = spec.tags?.map((tag) => tag.name) ?? [];
  const inGroup = (name: string) =>
    endpoints.filter((endpoint) => (endpoint.operation.tags?.[0] ?? 'Other') === name);
  return [...names, 'Other']
    .map((name) => ({ name, endpoints: inGroup(name) }))
    .filter((group) => group.endpoints.length > 0);
}

export function filterGroups(groups: EndpointGroup[], search: string): EndpointGroup[] {
  const words = search.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return groups;

  const matches = ({ method, path, operation }: Endpoint) => {
    const text = `${method} ${path} ${operation.summary} ${operation.description}`.toLowerCase();
    return words.every((word) => text.includes(word));
  };
  return groups
    .map((group) => ({ ...group, endpoints: group.endpoints.filter(matches) }))
    .filter((group) => group.endpoints.length > 0);
}

const PATH_EXAMPLES: Record<string, string> = {
  userId: 'user_123',
  externalId: 'user_123',
  achievementId: 'ach_1762421400000_q1w2e',
  challengeId: 'chl_1762421400000_p0o9i',
  levelId: 'lvl_1762421400000_x7y8z',
};

export type SampleLanguage = 'curl' | 'javascript' | 'python';

export const SAMPLE_LANGUAGES: { id: SampleLanguage; label: string }[] = [
  { id: 'curl', label: 'cURL' },
  { id: 'javascript', label: 'JavaScript' },
  { id: 'python', label: 'Python' },
];

const pythonLiteral = (json: string) =>
  json.replace(/\btrue\b/g, 'True').replace(/\bfalse\b/g, 'False').replace(/\bnull\b/g, 'None');

export function codeSample(endpoint: Endpoint, baseUrl: string, language: SampleLanguage): string {
  const { method, path, operation } = endpoint;
  const url = `${baseUrl}${path.replace(/\{(\w+)\}/g, (_, name: string) => PATH_EXAMPLES[name] ?? name)}`;
  const verb = method.toUpperCase();
  const body = bodyExample(operation);
  const json = body === undefined ? null : JSON.stringify(body, null, 2);
  const [header, value] = usesEndUserToken(operation)
    ? ['Authorization', 'Bearer YOUR_END_USER_TOKEN']
    : ['x-api-key', 'YOUR_API_KEY'];

  if (language === 'curl') {
    return [
      `curl -X ${verb} '${url}'`,
      `-H '${header}: ${value}'`,
      ...(json ? [`-H 'Content-Type: application/json'`, `-d '${json.replace(/'/g, `'\\''`)}'`] : []),
    ].join(' \\\n  ');
  }

  if (language === 'javascript') {
    const headers = [`'${header}': '${value}'`, ...(json ? [`'Content-Type': 'application/json'`] : [])];
    const options = [
      `  method: '${verb}',`,
      `  headers: { ${headers.join(', ')} },`,
      ...(json ? [`  body: JSON.stringify(${json.replace(/\n/g, '\n  ')}),`] : []),
    ];
    return [
      `const response = await fetch('${url}', {`,
      ...options,
      `});`,
      ``,
      `if (!response.ok) throw new Error((await response.json()).error.message);`,
      `const data = await response.json();`,
    ].join('\n');
  }

  return [
    `import requests`,
    ``,
    `response = requests.${method}(`,
    `    "${url}",`,
    `    headers={"${header}": "${value}"},`,
    ...(json ? [`    json=${pythonLiteral(json).replace(/\n/g, '\n    ')},`] : []),
    `)`,
    `response.raise_for_status()`,
    `data = response.json()`,
  ].join('\n');
}
