#!/usr/bin/env python3
"""
IndexTTS sidecar — a tiny dependency-free HTTP wrapper around the IndexTTS
(https://github.com/index-tts/index-tts) Python API, speaking the contract
our Express server's `indextts` provider expects:

    GET  /health      → 200 {"status": "ok", "model": …, "device": …}
    POST /synthesize  {"text": str, "lang"?: "EN|ZH|JA|ES|AR", "reference"?: str}
                      → 200 audio/wav (16-bit PCM)   |   4xx/5xx JSON

Run it INSIDE the index-tts uv environment (models downloaded separately):

    git clone https://github.com/index-tts/index-tts.git && cd index-tts
    uv sync
    uv tool install "huggingface-hub" && hf download IndexTeam/IndexTTS-2.5 --local-dir=checkpoints
    INDEX_TTS_MODEL_DIR=checkpoints uv run python /path/to/index_tts_api.py

Or simply: `docker compose up indextts` from the TTS platform root.

Environment:
    INDEX_TTS_MODEL_DIR  (default ./checkpoints)   downloaded model weights
    INDEX_TTS_REFS_DIR   (default ./refs)          your own <voiceId>.wav clips
    INDEX_TTS_HOST       (default 127.0.0.1)
    INDEX_TTS_PORT       (default 7861)

Reference resolution for `reference` (first match wins):
    1. $INDEX_TTS_REFS_DIR/<reference>.wav      ← your cloned voice presets
    2. bundled examples/<reference>.wav         ← repo demo voices (auto-fetched)
    3. first bundled voice_*.wav                ← fallback
"""

import json
import os
import tempfile
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

HOST = os.environ.get("INDEX_TTS_HOST", "127.0.0.1")
PORT = int(os.environ.get("INDEX_TTS_PORT", "7861"))
MODEL_DIR = Path(os.environ.get("INDEX_TTS_MODEL_DIR", "checkpoints"))
REFS_DIR = Path(os.environ.get("INDEX_TTS_REFS_DIR", "refs"))
MAX_BODY_BYTES = 1 << 20  # 1 MiB — text is at most 4 000 chars

_state = {"tts": None, "device": "cpu", "lock": threading.Lock()}


def log(message: str) -> None:
    print(f"[index-tts-api] {message}", flush=True)


def resolve_reference(name: str) -> Path:
    """refs dir → bundled examples → first bundled voice clip."""
    candidate = REFS_DIR / f"{name}.wav"
    if candidate.is_file():
        return candidate

    try:
        # Populates examples/ on first call (downloads demo voices from HF).
        from indextts.utils.examples_downloader import ensure_examples_available

        ensure_examples_available()
    except Exception as error:  # noqa: BLE001 — offline machines still work via refs/
        log(f"example download skipped: {error}")

    examples_dir = Path("examples")
    candidate = examples_dir / f"{name}.wav"
    if candidate.is_file():
        return candidate

    bundled = sorted(examples_dir.glob("voice_*.wav"))
    if bundled:
        return bundled[0]

    raise FileNotFoundError(
        f"no reference clip found for '{name}' — put a WAV in {REFS_DIR}/"
    )


def load_model():
    """Lazy, locked model load. Uses IndexTTS-2.5, falls back to IndexTTS-2."""
    if _state["tts"] is not None:
        return _state["tts"]
    with _state["lock"]:
        if _state["tts"] is not None:
            return _state["tts"]

        import torch

        device = "cuda" if torch.cuda.is_available() else "cpu"
        cfg_path = MODEL_DIR / "config.yaml"
        if not cfg_path.is_file():
            raise FileNotFoundError(
                f"{cfg_path} missing — download the weights first (see module docstring)"
            )

        try:
            from indextts.infer_v2_5 import IndexTTS2  # IndexTTS-2.5

            tts = IndexTTS2(
                cfg_path=str(cfg_path), model_dir=str(MODEL_DIR), use_bf16=device == "cuda"
            )
            version = "2.5"
        except ImportError:
            from indextts.infer_v2 import IndexTTS2  # IndexTTS-2

            tts = IndexTTS2(
                cfg_path=str(cfg_path),
                model_dir=str(MODEL_DIR),
                use_fp16=False,
                use_cuda_kernel=False,
                use_deepspeed=False,
            )
            version = "2"

        _state["tts"] = tts
        _state["device"] = device
        log(f"IndexTTS-{version} loaded from {MODEL_DIR} on {device}")
        return tts


def synthesize(text: str, lang: str | None, reference: str) -> bytes:
    tts = load_model()
    prompt_wav = resolve_reference(reference or "voice_01")

    kwargs = {
        "spk_audio_prompt": str(prompt_wav),
        "text": text,
        "output_path": (output := tempfile.NamedTemporaryFile(suffix=".wav", delete=False)).name,
        "verbose": False,
    }
    if lang:
        kwargs["lang"] = lang

    with _state["lock"]:  # the model is not thread-safe
        tts.infer(**kwargs)

    wav = Path(output.name).read_bytes()
    Path(output.name).unlink(missing_ok=True)
    if not wav:
        raise RuntimeError("model produced empty audio")
    return wav


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def _json(self, status: int, payload: dict) -> None:
        body = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):  # noqa: N802 — stdlib naming
        if self.path == "/health":
            ready = _state["tts"] is not None
            self._json(
                200,
                {"status": "ok", "model": "indextts", "loaded": ready, "device": _state["device"]},
            )
        else:
            self._json(404, {"success": False, "error": "Not found"})

    def do_POST(self):  # noqa: N802
        if self.path != "/synthesize":
            self._json(404, {"success": False, "error": "Not found"})
            return

        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0 or length > MAX_BODY_BYTES:
            self._json(413, {"success": False, "error": "Invalid body size"})
            return

        try:
            payload = json.loads(self.rfile.read(length))
            text = str(payload.get("text") or "").strip()
            if not text:
                self._json(400, {"success": False, "error": "text is required"})
                return
            lang = payload.get("lang")
            reference = payload.get("reference")

            audio = synthesize(text, lang, reference)
            self.send_response(200)
            self.send_header("Content-Type", "audio/wav")
            self.send_header("Content-Length", str(len(audio)))
            self.end_headers()
            self.wfile.write(audio)
        except FileNotFoundError as error:
            self._json(400, {"success": False, "error": str(error)})
        except Exception as error:  # noqa: BLE001 — surface as provider failure
            log(f"synthesis failed: {error}")
            self._json(503, {"success": False, "error": "synthesis failed"})

    def log_message(self, fmt, *args):  # silence per-request noise; we log meaningful events
        pass


def _mem_available_gib():
    """GiB of RAM the container can actually use (None where /proc is absent)."""
    try:
        for line in Path("/proc/meminfo").read_text().splitlines():
            if line.startswith("MemAvailable:"):
                return int(line.split()[1]) / (1024 * 1024)
    except OSError:
        pass
    return None


def warmup() -> None:
    """Pre-load reference voices + model in a background thread so the first
    real request pays only inference — not a multi-GB cold model load that
    used to blow the server's request timeout and surface to the UI as a
    mysterious "nothing generates". Load errors also show up HERE, in the
    logs, before anyone clicks anything."""
    try:
        available = _mem_available_gib()
        if available is not None:
            log(f"warm-up: {available:.1f} GiB RAM available")
            if available < 10:
                log(
                    "warm-up: ⚠ LOW MEMORY — the fp32 model needs ~8-12 GiB peak on CPU. "
                    "If this container dies with exit 137 (OOM-killed), give Docker more "
                    "RAM: Docker Desktop → Settings → Resources → Memory, or on WSL2 put "
                    "[wsl2] memory=12GB / swap=16GB in %USERPROFILE%\\.wslconfig and run "
                    "`wsl --shutdown`, then start Docker again."
                )
        prompt = resolve_reference("voice_01")
        log(f"warm-up: reference voice {prompt.name} ready")
        started = time.time()
        load_model()
        log(f"warm-up: model ready in {time.time() - started:.0f}s — ready to synthesize")
    except Exception as error:  # noqa: BLE001 — first real request will retry the load
        log(f"warm-up failed (will retry on first request): {error}")


class QuietThreadingHTTPServer(ThreadingHTTPServer):
    """ThreadingHTTPServer that doesn't scream when a health-check client
    hangs up mid-response (BrokenPipeError under memory pressure)."""

    def handle_error(self, request, client_address):
        import sys

        if isinstance(sys.exc_info()[1], (BrokenPipeError, ConnectionResetError)):
            return
        super().handle_error(request, client_address)


if __name__ == "__main__":
    log(f"sidecar listening on http://{HOST}:{PORT} (model dir: {MODEL_DIR})")
    threading.Thread(target=warmup, name="model-warmup", daemon=True).start()
    QuietThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
