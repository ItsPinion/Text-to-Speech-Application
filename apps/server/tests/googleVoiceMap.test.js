import { describe, expect, it } from 'vitest';

import { mapVoiceToVendor } from '../src/services/providers/googleTts.js';

/**
 * The app-voice → vendor-voice mapping (plan Phase 5) is contract-adjacent:
 * every catalog voice must map, and each mapping must carry a languageCode
 * that matches the catalog language (the route already rejects mismatches —
 * this guarantees the mapping can never introduce one).
 */
describe('Google voice mapping', () => {
  it('maps every catalog voice id to a Google voice', async () => {
    const { VOICES } = await import('../src/services/voiceCatalog.js');

    for (const voice of VOICES) {
      const mapped = mapVoiceToVendor(voice.id);
      expect(mapped, `missing mapping for ${voice.id}`).not.toBeNull();
      expect(mapped.languageCode).toBe(voice.language);
    }
  });

  it('returns null for unknown voice ids', () => {
    expect(mapVoiceToVendor('en-US-robot-99')).toBeNull();
  });

  it('uses distinct Google voices per app voice (audible variety)', async () => {
    const { VOICES } = await import('../src/services/voiceCatalog.js');
    const names = VOICES.map((voice) => mapVoiceToVendor(voice.id)?.name);
    expect(new Set(names).size).toBe(names.length);
  });
});
