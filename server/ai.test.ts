import { describe, expect, it } from 'vitest';
import { pickProvider } from './ai';

describe('pickProvider', () => {
  it('is free (null) without a key', () => expect(pickProvider({ AI_PROVIDER: 'gemini' })).toBeNull());
  it('honours AI_PROVIDER when its key is set', () =>
    expect(pickProvider({ AI_PROVIDER: 'gemini', ANTHROPIC_API_KEY: 'a', GEMINI_API_KEY: 'g' })).toBe('gemini'));
  it('falls back to whichever key exists', () => {
    expect(pickProvider({ AI_PROVIDER: 'anthropic', GEMINI_API_KEY: 'g' })).toBe('gemini');
    expect(pickProvider({ ANTHROPIC_API_KEY: 'a', GEMINI_API_KEY: 'g' })).toBe('anthropic');
  });
});
