# IndexTTS sidecar — local, free, no API key. CPU works (slow); NVIDIA GPU
# (CUDA 12.8+) is dramatically faster. Models download into a named volume
# on first start (~2-4 GB — grab a coffee).
FROM python:3.11-slim-bookworm

RUN apt-get update \
    && apt-get install -y --no-install-recommends git ca-certificates \
    && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir uv

# IndexTTS upstream (Apache-2.0 code; model weights under their model license).
RUN git clone --depth 1 https://github.com/index-tts/index-tts.git /opt/index-tts

WORKDIR /opt/index-tts
RUN uv sync --no-dev

# Our HTTP wrapper speaks the contract the Express provider expects.
COPY index_tts_api.py /app/index_tts_api.py

ENV INDEX_TTS_MODEL_DIR=/models/checkpoints \
    INDEX_TTS_REFS_DIR=/models/refs \
    INDEX_TTS_HOST=0.0.0.0 \
    INDEX_TTS_PORT=7861 \
    HF_HOME=/models/hf

VOLUME ["/models"]
EXPOSE 7861

# Download weights on first boot (cached in the volume), then serve.
# NOTE: uv-created venvs ship WITHOUT pip, so `python -m pip` can never work
# here. huggingface_hub is already in the venv (via transformers); the uv-pip
# fallback covers exotic builds. If the download fails, exit non-zero — the
# restart policy retries with resume, and we never serve a weightless API.
CMD ["sh", "-c", "\
  if [ ! -f /models/checkpoints/config.yaml ]; then \
    echo '[sidecar] downloading IndexTTS-2.5 weights (~2-4 GB, first boot only)…'; \
    uv run --no-sync python -c 'import huggingface_hub' 2>/dev/null || \
      uv pip install --python /opt/index-tts/.venv/bin/python huggingface-hub; \
    uv run --no-sync python -c 'from huggingface_hub import snapshot_download; snapshot_download(\"IndexTeam/IndexTTS-2.5\", local_dir=\"/models/checkpoints\")' || exit 1; \
    echo '[sidecar] weights ready.'; \
  fi; \
  exec uv run --no-sync python /app/index_tts_api.py"]
