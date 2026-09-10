import {
  apiError,
  apiSuccess,
  AUDIO_FORMAT,
  DEFAULT_LANGUAGE,
  MAX_TEXT_LENGTH,
  RATE_LIMIT,
  SUPPORTED_LANGUAGES,
} from '@tts/shared';
import { describe, expect, it } from 'vitest';

/**
 * Phase 0 guard — the frozen contract, asserted as code.
 * If anyone drifts a limit or changes an envelope shape, the suite fails
 * before frontend and backend can disagree about the API.
 */
describe('Phase 0 frozen contract (@tts/shared)', () => {
  it('locks the numeric limits exactly as decided in Phase 0', () => {
    expect(MAX_TEXT_LENGTH).toBe(4000); // "4 000 characters"
    expect(DEFAULT_LANGUAGE).toBe('en-US');
    expect(AUDIO_FORMAT).toBe('audio/mpeg');
    expect(RATE_LIMIT).toEqual({ windowMs: 15 * 60 * 1000, max: 10 });
  });

  it('exposes a seed language allow-list with the default first', () => {
    expect(SUPPORTED_LANGUAGES.length).toBeGreaterThan(0);
    expect(SUPPORTED_LANGUAGES).toContain(DEFAULT_LANGUAGE);
  });

  it('builds the standard error envelope { success: false, error }', () => {
    expect(apiError('Text is required')).toEqual({
      success: false,
      error: 'Text is required',
    });
  });

  it('builds the standard success envelope { success: true, ...payload }', () => {
    expect(apiSuccess()).toEqual({ success: true });
    expect(apiSuccess({ audioUrl: '/audio/xxx.mp3' })).toEqual({
      success: true,
      audioUrl: '/audio/xxx.mp3',
    });
  });
});
