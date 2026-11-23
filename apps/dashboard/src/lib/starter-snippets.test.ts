import * as react from '@gami.fied/react';
import { describe, expect, it } from 'vitest';
import { DOCS, DOCS_URL, REACT_COMPONENTS, starterSnippets } from './starter-snippets';

// The requests in the other snippets are sent to a running API in
// apps/api/src/__tests__/starter-snippets.test.ts.
describe('starter snippets', () => {
  it('imports only components @gami.fied/react exports', () => {
    for (const name of REACT_COMPONENTS) expect(react).toHaveProperty(name);
    const code = starterSnippets('https://gami.example.com').find((item) => item.id === 'react')!.code;
    for (const name of REACT_COMPONENTS) expect(code).toContain(name);
  });

  it('gives the SDK the install address, which it needs on any server but localhost', () => {
    const code = starterSnippets('https://gami.example.com').find((item) => item.id === 'sdk')!.code;
    expect(code).toContain("baseUrl: 'https://gami.example.com'");
  });

  it('links every snippet to a docs page', () => {
    for (const item of starterSnippets('https://gami.example.com')) expect(item.readMore.startsWith(DOCS_URL)).toBe(true);
    for (const href of Object.values(DOCS)) expect(href.endsWith('/')).toBe(true);
  });
});
