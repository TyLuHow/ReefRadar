import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';

// Flat ESLint config (ESLint 9, `eslint .`). Replaces .eslintrc.json.
//
// 1. Contract fence (CONTRACT-01): contract artifacts and contract config may
//    only be touched inside src/features/contract. The selectors are written
//    with String.raw so the regex backslashes survive exactly as they were in
//    the legacy JSON config. tests/unit/contract-fence.test.ts plants violations
//    and proves the fence still trips.
// 2. Feature fence (PLAT-03): src/features/** must not import the legacy
//    component tree (@/components, @/components/**), statically or with a
//    dynamic import(). A later flat-config object for the same rule REPLACES
//    an earlier one (it does not merge), so every src/features block repeats
//    the rule entries it still needs. tests/unit/feature-fence.test.ts proves
//    the allowed and blocked cases; scripts/check-feature-fence.mjs is the CI
//    second line (relative paths into src/components, require()).
// 3. React Compiler rule family (new in eslint-config-next 16): warnings only on
//    the legacy tree, still errors for src/features and tests.

const CONTRACT_SELECTORS = [
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
];

const CONTRACT_DEEP = {
  group: ['@/features/contract/*', '**/features/contract/*', '**/contracts/fixtures/**'],
  message: "Import from '@/features/contract' only.",
};

// Narrow alias pattern on purpose: a broad **/components/** glob would also block
// a feature's own ./components/X.
const LEGACY = {
  group: ['@/components', '@/components/**'],
  message: 'src/features/** must not import legacy @/components/**.',
};

// no-restricted-imports does not see dynamic import(); this selector closes that gap.
const LEGACY_DYNAMIC = {
  selector: String.raw`ImportExpression[source.value=/^@\/components(\/|$)/]`,
  message: 'src/features/** must not import legacy @/components/**.',
};

export default defineConfig([
  ...nextVitals,
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/features/contract/**'],
    rules: {
      'no-restricted-syntax': ['error', ...CONTRACT_SELECTORS],
      'no-restricted-imports': ['error', { patterns: [CONTRACT_DEEP] }],
    },
  },
  {
    // Feature modules other than the contract module: contract fence AND legacy fence.
    files: ['src/features/**/*.{ts,tsx}'],
    ignores: ['src/features/contract/**'],
    rules: {
      'no-restricted-syntax': ['error', ...CONTRACT_SELECTORS, LEGACY_DYNAMIC],
      'no-restricted-imports': ['error', { patterns: [CONTRACT_DEEP, LEGACY] }],
    },
  },
  {
    // The contract module may know contract internals, but not the legacy tree.
    files: ['src/features/contract/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': ['error', LEGACY_DYNAMIC],
      'no-restricted-imports': ['error', { patterns: [LEGACY] }],
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
