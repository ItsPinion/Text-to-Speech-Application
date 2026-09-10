import { useEffect, useRef, useState } from 'react';

/**
 * ModelImportPanel (neural voice import — the "browser bridge").
 *
 * Telugu and Tamil have no Piper voices; their neural MMS models live on
 * Hugging Face, which the SERVER may not be able to reach from a locked-
 * down network — but the USER'S BROWSER can. This panel streams the two
 * model files (vocab.json + model.onnx ≈ 150 MB) through the browser and
 * uploads them to the server once. After that, synthesis for those
 * languages is 100% server-side, offline and human-sounding.
 *
 * Requires a signed-in account (the import endpoint is authenticated).
 */

/** Where the browser fetches the models from (HF sets permissive CORS). */
const MMS_SOURCES = {
  te: {
    label: 'Telugu',
    repo: 'naklitechie/mms-tts-te-ONNX',
  },
  ta: {
    label: 'Tamil',
    repo: 'naklitechie/mms-tts-ta-ONNX',
  },
};

const HF_BASE = 'https://huggingface.co';

/** fetch() with read-progress for large files (response streaming). */
async function fetchWithProgress(url, onProgress) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed (HTTP ${res.status})`);
  const total = Number(res.headers.get('content-length')) || 0;
  if (!res.body) return res.arrayBuffer(); // no streaming support
  const reader = res.body.getReader();
  const parts = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value);
    received += value.length;
    onProgress?.(received, total);
  }
  const out = new Uint8Array(received);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out.buffer;
}

function mb(bytes) {
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

export default function ModelImportPanel({ token, provider, onImported }) {
  const [status, setStatus] = useState(null); // { te: bool, ta: bool }
  const [error, setError] = useState(null);
  const [progress, setProgress] = useState(null); // { lang, phase, received, total }
  const busyLang = useRef(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/models')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d) => !cancelled && setStatus(d.mms))
      .catch(() => !cancelled && setStatus({ te: false, ta: false }));
    return () => {
      cancelled = true;
    };
  }, []);

  // Only meaningful when the neural provider is active.
  if (provider !== 'piper') return null;
  if (!status) return null;

  const missing = Object.entries(status).filter(([, present]) => !present);
  if (missing.length === 0) {
    return (
      <div className="model-import panel" aria-label="Neural voice models">
        <div className="panel-head">
          <h2>Neural voice models</h2>
        </div>
        <p className="muted small">
          ⚡ All optional neural voices are imported — Telugu and Tamil speak with
          human-sounding MMS models, fully offline.
        </p>
      </div>
    );
  }

  const importLanguage = async (lang) => {
    if (busyLang.current) return;
    busyLang.current = lang;
    setError(null);
    const src = MMS_SOURCES[lang];
    try {
      // 1. vocab.json (tiny)
      setProgress({ lang, phase: 'Downloading tokenizer', received: 0, total: 0 });
      const vocab = await fetchWithProgress(`${HF_BASE}/${src.repo}/resolve/main/vocab.json`);
      setProgress({ lang, phase: 'Uploading tokenizer', received: vocab.byteLength, total: vocab.byteLength });
      let res = await fetch(`/api/models/mms/${lang}/vocab`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream', Authorization: `Bearer ${token}` },
        body: vocab,
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Upload failed (HTTP ${res.status})`);

      // 2. model.onnx (~150 MB) — download with progress, then upload
      setProgress({ lang, phase: 'Downloading neural model', received: 0, total: 0 });
      const model = await fetchWithProgress(`${HF_BASE}/${src.repo}/resolve/main/model.onnx`, (received, total) =>
        setProgress({ lang, phase: 'Downloading neural model', received, total }),
      );
      setProgress({ lang, phase: 'Uploading neural model', received: 0, total: model.byteLength });
      res = await fetch(`/api/models/mms/${lang}/onnx`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream', Authorization: `Bearer ${token}` },
        body: model,
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Upload failed (HTTP ${res.status})`);

      setProgress(null);
      setStatus((s) => ({ ...s, [lang]: true }));
      onImported?.(); // refresh the voice catalog (badges flip to ⚡)
    } catch (err) {
      setError({ message: err.message, lang });
      setProgress(null);
    } finally {
      busyLang.current = null;
    }
  };

  return (
    <div className="model-import panel" aria-label="Neural voice models">
      <div className="panel-head">
        <h2>Neural voice models</h2>
      </div>
      <p className="muted small">
        Telugu &amp; Tamil have no Piper voices — their neural models (Meta MMS) are
        imported once through your browser, then synthesis is fully offline. Sign in
        to import.
      </p>
      <div className="model-import-actions">
        {missing.map(([lang]) => (
          <button
            key={lang}
            type="button"
            className="generate-btn"
            disabled={!token || Boolean(progress)}
            onClick={() => importLanguage(lang)}
          >
            ⚡ Enable neural {MMS_SOURCES[lang].label}
            {progress?.lang === lang ? ` — ${progress.phase}${progress.total ? ` (${mb(progress.received)} / ${mb(progress.total)})` : progress.received ? ` (${mb(progress.received)})` : ''}` : ''}
          </button>
        ))}
      </div>
      {!token && (
        <p className="muted small">Sign in above first — model imports are an account action.</p>
      )}
      {error && (
        <p className="field-error" role="alert">
          {MMS_SOURCES[error.lang]?.label ?? 'Import'} failed: {error.message}
        </p>
      )}
    </div>
  );
}
