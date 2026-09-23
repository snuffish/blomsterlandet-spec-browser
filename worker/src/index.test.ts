import { describe, expect, it } from 'vitest';
import { isAllowedCaller } from './index';

describe('isAllowedCaller', () => {
  it('accepts the deployed site', () => {
    expect(isAllowedCaller('https://snuffish.github.io')).toBe(true);
  });

  /**
   * Vite moves to the next free port when 5173 is taken, so an exact dev port is not
   * something the Worker can rely on — this regressed once already.
   */
  it('accepts any loopback port', () => {
    for (const origin of [
      'http://localhost:5173',
      'http://localhost:5174',
      'http://localhost:4321',
      'http://127.0.0.1:8080',
    ]) {
      expect(isAllowedCaller(origin), origin).toBe(true);
    }
  });

  it('rejects everything else, including hosts that merely start with localhost', () => {
    for (const origin of [
      'https://evil.example',
      'http://localhost.evil.com:5174',
      'https://snuffish.github.io.evil.com',
      'http://notlocalhost:5173',
      'https://localhost:5173',
    ]) {
      expect(isAllowedCaller(origin), origin).toBe(false);
    }
  });
});
