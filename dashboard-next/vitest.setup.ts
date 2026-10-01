import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// Testing Library's automatic per-test cleanup relies on detecting a global
// `afterEach` hook; this project's vitest.config.ts does not set
// `test.globals: true`, so cleanup must be registered explicitly here or
// each component test leaks its rendered DOM into the next test in the
// same file.
afterEach(() => {
  cleanup();
});
