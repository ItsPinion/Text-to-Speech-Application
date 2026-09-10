import lamejs from '@breezystack/lamejs';

/**
 * WAV (PCM 16-bit) → MP3 conversion in pure JS (plan contract: audio/mpeg).
 * Used by the IndexTTS provider — the sidecar model outputs 22.05 kHz PCM
 * WAV, and the API contract promises MP3 bytes. No ffmpeg required.
 *
 * Supports standard RIFF WAVE with format code 1 (PCM), 8 000–48 000 Hz,
 * mono or stereo. Anything else throws so the provider can return a
 * provider-classified error instead of shipping garbage audio.
 */

/** Minimal, strict RIFF walker: returns { sampleRate, channels, samples }. */
export function decodeWav(buffer) {
  if (buffer.length < 44 || buffer.toString('ascii', 0, 4) !== 'RIFF') {
    throw new Error('Not a RIFF/WAVE file');
  }
  if (buffer.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('Not a WAVE file');
  }

  let offset = 12;
  let format = null;
  let data = null;

  while (offset + 8 <= buffer.length) {
    const chunkId = buffer.toString('ascii', offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    const body = offset + 8;

    if (chunkId === 'fmt ') {
      format = {
        audioFormat: buffer.readUInt16LE(body),
        channels: buffer.readUInt16LE(body + 2),
        sampleRate: buffer.readUInt32LE(body + 4),
        bitsPerSample: buffer.readUInt16LE(body + 14),
      };
    } else if (chunkId === 'data') {
      data = buffer.subarray(body, Math.min(body + chunkSize, buffer.length));
    }
    offset = body + chunkSize + (chunkSize % 2); // chunks are word-aligned
  }

  if (!format || !data) throw new Error('WAVE is missing fmt/data chunks');
  if (format.audioFormat !== 1) throw new Error(`Unsupported WAVE format ${format.audioFormat} (PCM only)`);
  if (format.bitsPerSample !== 16) throw new Error(`Unsupported bit depth ${format.bitsPerSample} (16-bit only)`);
  if (format.channels < 1 || format.channels > 2) throw new Error(`Unsupported channel count ${format.channels}`);
  if (format.sampleRate < 8000 || format.sampleRate > 48000) {
    throw new Error(`Unsupported sample rate ${format.sampleRate}`);
  }

  const sampleCount = Math.floor(data.length / 2);
  const samples = new Int16Array(sampleCount);
  for (let i = 0; i < sampleCount; i += 1) samples[i] = data.readInt16LE(i * 2);

  return { sampleRate: format.sampleRate, channels: format.channels, samples };
}

/** Encode interleaved PCM samples to an MP3 buffer at the given bitrate. */
export function encodeMp3({ sampleRate, channels, samples }, kbps = 128) {
  const encoder = new lamejs.Mp3Encoder(channels, sampleRate, kbps);
  const blockSize = 1152; // MPEG-1 Layer III samples per frame
  const chunks = [];

  if (channels === 2) {
    const left = new Int16Array(samples.length / 2);
    const right = new Int16Array(samples.length / 2);
    for (let i = 0; i < left.length; i += 1) {
      left[i] = samples[i * 2];
      right[i] = samples[i * 2 + 1];
    }
    for (let i = 0; i < left.length; i += blockSize) {
      const encoded = encoder.encodeBuffer(left.subarray(i, i + blockSize), right.subarray(i, i + blockSize));
      if (encoded.length > 0) chunks.push(Buffer.from(encoded));
    }
  } else {
    for (let i = 0; i < samples.length; i += blockSize) {
      const encoded = encoder.encodeBuffer(samples.subarray(i, i + blockSize));
      if (encoded.length > 0) chunks.push(Buffer.from(encoded));
    }
  }

  const tail = encoder.flush();
  if (tail.length > 0) chunks.push(Buffer.from(tail));

  const mp3 = Buffer.concat(chunks);
  if (mp3.length === 0) throw new Error('MP3 encoder produced no output');
  return mp3;
}

/** WAV buffer → MP3 buffer (throws with a descriptive message on bad input). */
export function wavToMp3(wavBuffer, kbps = 128) {
  return encodeMp3(decodeWav(wavBuffer), kbps);
}
