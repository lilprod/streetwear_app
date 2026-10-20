import { describe, expect, it } from 'vitest';
import { SHARED_PACKAGE } from './index';

describe('shared', () => {
  it('exports the package marker', () => {
    expect(SHARED_PACKAGE).toBe('@streetwear/shared');
  });
});
