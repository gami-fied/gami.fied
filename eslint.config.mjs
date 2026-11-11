import eslint from '@eslint/js';
import nextPlugin from '@next/eslint-plugin-next';
import astro from 'eslint-plugin-astro';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/.next/**', '**/node_modules/**', '**/.turbo/**', '**/next-env.d.ts', '**/.astro/**'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  // The website's .astro components.
  ...astro.configs.recommended,
  {
    // Config files and scripts run in Node.
    files: ['**/*.config.{js,mjs,cjs}', 'scripts/**/*.{js,mjs}'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['apps/dashboard/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks, '@next/next': nextPlugin },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      '@next/next/no-img-element': 'warn',
    },
  },
  {
    // Pages use the app's own Dropdown and Checkbox so every control looks and behaves the same.
    files: ['apps/dashboard/src/**/*.tsx'],
    ignores: ['apps/dashboard/src/components/ui/**'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "JSXOpeningElement[name.name='select']",
          message: 'Use the Dropdown from components/ui/dropdown instead of a native select.',
        },
        {
          selector: "JSXOpeningElement[name.name='input'] > JSXAttribute[name.name='type'][value.value=/^(checkbox|radio)$/]",
          message: 'Use Checkbox, Radio or Switch from components/ui/checkbox instead of a native input.',
        },
      ],
    },
  },
  {
    // Tests build partial mocks and read untyped JSON responses.
    files: ['**/__tests__/**'],
    rules: { '@typescript-eslint/no-explicit-any': 'off' },
  }
);
