import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'reference', 'node_modules', 'test-results', 'playwright-report'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.ts'],
    languageOptions: { globals: globals.browser },
    rules: {
      // Colours live in src/styles/tokens.css. scripts/check-tokens.mjs covers CSS and HTML.
      'no-restricted-syntax': [
        'error',
        { selector: 'Literal[value=/#[0-9a-fA-F]{3,8}\\b/]', message: 'No hex colours outside src/styles/tokens.css. Read a token with token() instead.' },
        { selector: 'TemplateElement[value.raw=/#[0-9a-fA-F]{3,8}\\b/]', message: 'No hex colours outside src/styles/tokens.css. Read a token with token() instead.' },
      ],
      // A module reaches another module only through its index.ts or the shared contract.
      'no-restricted-imports': [
        'error',
        { patterns: [{ regex: '^\\.\\./(data|engine|site|modes|comforts|styles|lib)/.+', message: "Import another module through its index.ts, for example '../engine'." }] },
      ],
    },
  },
  {
    files: ['scripts/**', '*.config.*'],
    languageOptions: { globals: globals.node },
  },
);
