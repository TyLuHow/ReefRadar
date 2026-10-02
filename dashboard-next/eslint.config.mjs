import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';

// Flat ESLint config (ESLint 9, `eslint .`). Replaces .eslintrc.json.
//
// 1. Contract fence (CONTRACT-01): contract artifacts and contract config may
//    only be touched inside src/features/contract. The selectors are written
//    with String.raw so the regex backslashes survive exactly as they were in
//    the legacy JSON config. tests/unit/contract-fence.test.ts plants violations
//    and proves the fence still trips.
// 2. React Compiler rule family (new in eslint-config-next 16): warnings only on
//    the legacy tree, still errors for src/features and tests.
export default defineConfig([
  ...nextVitals,
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/features/contract/**'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: String.raw`Literal[value=/NEXT_PUBLIC_CONTRACT_BASE_URL|cloudfront\.net|contract\/(latest|v\d+)\.json/]`,
          message: 'Contract artifacts may only be fetched from src/features/contract.',
        },
        {
          selector: String.raw`TemplateElement[value.raw=/contract\/(latest|v)|cloudfront\.net/]`,
          message: 'Contract artifacts may only be fetched from src/features/contract.',
        },
        {
          selector:
            "MemberExpression[object.object.name='process'][object.property.name='env'][property.name=/CONTRACT/]",
          message: 'Contract config is read only inside src/features/contract.',
        },
      ],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/features/contract/*', '**/features/contract/*', '**/contracts/fixtures/**'],
              message: "Import from '@/features/contract' only.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/components/**/*.{ts,tsx}', 'src/hooks/**/*.{ts,tsx}', 'src/app/**/*.{ts,tsx}'],
    rules: {
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/immutability': 'warn',
    },
  },
  globalIgnores([
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
    'test-results/**',
    'playwright-report/**',
    'tests/baseline/**',
  ]),
]);
