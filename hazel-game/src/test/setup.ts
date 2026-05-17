// Vitest setup — runs once before the test suite.
import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// Unmount React trees and reset the DOM between tests.
afterEach(() => {
  cleanup();
});
