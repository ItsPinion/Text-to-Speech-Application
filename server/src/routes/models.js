import { Router } from 'express';
import express from 'express';
import { writeFile, unlink, mkdir, stat } from 'node:fs/promises';
import { join as joinPath } from 'node:path';
import { requireAuth } from '../auth.js';
import {
  mmsDir,
  mmsModelPresent,
  mmsStatus,
  MMS_LANGS,
} from '../services/providers/piper.js';

/**
 * Neural voice model import (the "browser bridge").
 *
 * Meta's MMS models for Telugu/Tamil — like most model weights — live on
 * CDNs (Hugging Face) that locked-down deployments often cannot reach,
 * even though the same deployment's USERS have normal browsers. So the
 * web app offers a one-time "enable neural voice" flow: the browser
 * downloads the model files and POSTs them here; from then on synthesis
 * is 100% server-side and offline like every other voice.
 *
 *   GET  /api/models                 → which optional models are present
 *   POST /api/models/mms/:lang/:file → import one file (auth required)
 *        lang ∈ te|ta · file ∈ onnx|vocab · raw body (octet-stream)
 *
 * Hardening: authentication, strict allow-list of (lang, file), ONNX
 * magic + size window, vocab shape validation, and a load-verification
 * pass — if onnxruntime cannot open the uploaded .onnx it is deleted
 * and the client gets a clear 400 rather than a broken voice later.
 */
const router = Router();

const ONNX_MAX_BYTES = 400 * 1024 * 1024; // MMS VITS fp32 ≈ 145 MB
const ONNX_MIN_BYTES = 1024 * 1024;

function isPlausibleOnnx(buf) {
  // ONNX is protobuf: field 1 (ir_version, varint) → first byte 0x08.
  // Every pytorch export we ship starts this way; garbage/HTML error
  // pages from a proxy do not.
  return buf.length >= 2 && buf[0] === 0x08;
}

function parseVocab(buf) {
  let vocab;
  try {
    vocab = JSON.parse(buf.toString('utf8'));
  } catch {
    return null;
  }
  if (!vocab || typeof vocab !== 'object' || Array.isArray(vocab)) return null;
  let count = 0;
  for (const [k, v] of Object.entries(vocab)) {
    if (typeof k !== 'string' || k.length === 0) return null;
    if (!Number.isInteger(v) || v < 0 || v > 100000) return null;
    count++;
  }
  return count >= 20 ? vocab : null;
}

router.get('/', (req, res) => {
  res.json({ mms: mmsStatus() });
});

router.post(
  '/mms/:lang/:file',
  requireAuth,
  express.raw({ type: () => true, limit: ONNX_MAX_BYTES + 1024 * 1024 }),
  async (req, res) => {
    const { lang, file } = req.params;
    if (!MMS_LANGS.includes(lang)) {
      return res
        .status(404)
        .json({ success: false, error: `No importable model for "${lang}"` });
    }
    if (!['onnx', 'vocab'].includes(file)) {
      return res
        .status(404)
        .json({ success: false, error: `Unknown model file type "${file}"` });
    }
    const body = req.body;
    if (!Buffer.isBuffer(body) || body.length === 0) {
      return res
        .status(400)
        .json({ success: false, error: 'Empty or non-binary request body' });
    }

    const dir = mmsDir();
    await mkdir(dir, { recursive: true });
    const dest = joinPath(dir, file === 'onnx' ? `${lang}.onnx` : `${lang}.vocab.json`);

    if (file === 'vocab') {
      if (!parseVocab(body)) {
        return res
          .status(400)
          .json({ success: false, error: 'vocab is not a valid {character: id} JSON object' });
      }
      await writeFile(dest, body);
      return res.json({ success: true, stored: `${lang}.vocab.json`, mms: mmsStatus() });
    }

    // .onnx import: validate magic + size window, store, then VERIFY by
    // actually creating an inference session; delete on failure.
    if (!isPlausibleOnnx(body)) {
      return res
        .status(400)
        .json({ success: false, error: 'File does not look like an ONNX model (bad header)' });
    }
    if (body.length < ONNX_MIN_BYTES || body.length > ONNX_MAX_BYTES) {
      return res.status(413).json({
        success: false,
        error: `Model size out of range (expected 1–400 MB, got ${(body.length / 1048576).toFixed(1)} MB)`,
      });
    }
    await writeFile(dest, body);
    try {
      const ort = await import('onnxruntime-node');
      await ort.InferenceSession.create(dest);
    } catch (err) {
      await unlink(dest).catch(() => {});
      return res.status(400).json({
        success: false,
        error: `ONNX model failed verification: ${err?.message ?? err}`,
      });
    }
    res.json({ success: true, stored: `${lang}.onnx`, verified: true, mms: mmsStatus() });
  },
);

/** File sizes for the client UI (progress display), public. */
router.get('/sizes', async (req, res) => {
  const sizes = {};
  for (const lang of MMS_LANGS) {
    try {
      sizes[lang] = {
        onnx: (await stat(joinPath(mmsDir(), `${lang}.onnx`))).size,
      };
    } catch {
      sizes[lang] = null;
    }
  }
  res.json({ sizes });
});

export default router;
