import next from '@next/eslint-plugin-next';
import tseslint from 'typescript-eslint';

/**
 * The architecture of this project is enforced here rather than described in a
 * document, so that it cannot drift. Two invariants matter:
 *
 *   1. `src/core` is PURE — no I/O, no framework, no SDK. Every legal decision the
 *      product makes lives there, which is why it must be reachable by a unit test
 *      with no network, no API key and no mocking library.
 *
 *   2. `src/core` is DETERMINISTIC — no ambient clock, no randomness. A risk report
 *      generated from the same document must be byte-identical, because the files
 *      committed under `golden/` are asserted against it.
 *
 * Both are checked by CI. See docs/adr/0001-pure-core-boundary.md.
 *
 * Note: this consumes `@next/eslint-plugin-next`'s flat config directly rather than
 * `eslint-config-next`, whose transitive plugins cap at ESLint 9 and crash the
 * eslintrc compatibility layer under ESLint 10. See docs/adr/0002-eslint-flat-config.md.
 */
export default tseslint.config(
  {
    ignores: ['.next/**', 'node_modules/**', 'coverage/**', 'next-env.d.ts', '*.tsbuildinfo'],
  },

  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,

  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/explicit-module-boundary-types': 'error',
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      'no-console': 'error',
      eqeqeq: ['error', 'always'],
    },
  },

  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: { '@next/next': next },
    rules: {
      ...next.configs.recommended.rules,
      ...next.configs['core-web-vitals'].rules,
      // This project uses the App Router exclusively; there is no `pages/` directory
      // for the rule to scan, and it warns on every run when it cannot find one.
      '@next/next/no-html-link-for-pages': 'off',
    },
  },

  // ---------------------------------------------------------------------------
  // The pure-core boundary. This block is the architecture.
  // ---------------------------------------------------------------------------
  {
    files: ['src/core/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                'node:*',
                'fs',
                'path',
                'crypto',
                'react',
                'react-dom',
                'next',
                'next/*',
                '@google/genai',
                'yaml',
                'unpdf',
                'mammoth',
                'pino',
                'server-only',
                '@/server/*',
                '@/app/*',
                '@/components/*',
                '@/lib/*',
              ],
              message:
                'src/core is pure: no I/O, no framework, no SDK. Move this to src/server and pass the result in as a parameter.',
            },
          ],
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "NewExpression[callee.name='Date'][arguments.length=0]",
          message:
            'src/core must be deterministic: accept `today: Date` as a parameter instead of reading the ambient clock.',
        },
        {
          selector: "MemberExpression[object.name='Date'][property.name='now']",
          message: 'src/core must be deterministic: inject the clock as a parameter.',
        },
        {
          selector: "MemberExpression[object.name='Math'][property.name='random']",
          message: 'src/core must be deterministic: inject randomness as a parameter.',
        },
      ],
    },
  },

  // Scripts and tests are ordinary Node programs; the core restrictions do not apply.
  {
    files: ['scripts/**/*.{ts,mjs}', 'tests/**/*.ts', '*.config.{ts,mjs}'],
    rules: {
      'no-console': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
    },
  },
);
