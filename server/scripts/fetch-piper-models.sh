#!/usr/bin/env bash
#
# fetch-piper-models.sh — download the Piper neural voice models used by
# the `piper` TTS provider into server/.cache/piper-models/ (~560 MB for
# all 9 models; each is a ~60 MB .onnx + small .onnx.json config).
#
# 100% free, no API key, no account. Models are by the Piper project
# (OHF-Voice, MIT-licensed voices from the LibriVox/LibriTTS/M-AILABS
# speech corpora).
#
# Why git instead of the official Hugging Face / GitHub-release hosting?
# Both live on CDNs that some locked-down networks block. The same model
# files are mirrored as plain git blobs in public repositories, and the
# git protocol (github.com) is reachable almost everywhere npm is. The
# sparse-clone below only pulls the model files themselves.
#
# Usage:  bash server/scripts/fetch-piper-models.sh [models-dir]
#
set -euo pipefail

DEST="${1:-$(cd "$(dirname "$0")/.." && pwd)/.cache/piper-models}"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

mkdir -p "$DEST"

# model basename → "owner/repo" "subdirectory"
MODELS=(
  "en_US-amy-medium|foxdude2012/TextVoiceReader|Voices/models"
  "en_US-joe-medium|NoeRGuerra/PiperReadAloudGUI|models/en_US-joe"
  "en_GB-jenny_dioco-medium|psikoma/GankMeDaddy|bin/piper"
  "en_GB-northern_english_male-medium|foxdude2012/TextVoiceReader|Voices/models"
  "hi_IN-priyamvada-medium|stitipatra/VoxBridge|models"
  "hi_IN-rohan-medium|stitipatra/VoxBridge|models"
  "es_ES-sharvard-medium|SourisCG/SourisTTSPlayer|piper"
  "fr_FR-siwis-medium|arkdevuk/Webpiper|voices"
  "fr_FR-tom-medium|arkdevuk/Webpiper|voices"
)

fetch_repo() { # $1=repo $2=dir
  local d="$WORK/$(echo "$1" | tr '/' '_')"
  git clone --filter=blob:none --no-checkout --depth 1 \
    "https://github.com/$1" "$d" >/dev/null 2>&1
  ( cd "$d" && git sparse-checkout set "$2" >/dev/null 2>&1 && git checkout >/dev/null 2>&1 )
}

for spec in "${MODELS[@]}"; do
  IFS='|' read -r name repo dir <<<"$spec"
  if [ -s "$DEST/$name.onnx" ] && [ -s "$DEST/$name.onnx.json" ]; then
    echo "✓ $name (already present)"
    continue
  fi
  echo "↓ $name  ($repo)"
  if ! fetch_repo "$repo" "$dir"; then
    echo "  ERROR: clone failed for $repo — check network access to github.com" >&2
    exit 1
  fi
  # copy only the files for THIS model (repos may contain several)
  found=0
  while IFS= read -r -d '' f; do
    cp "$f" "$DEST/"
    found=1
  done < <(find "$WORK" -name "$name.onnx*" -print0)
  if [ "$found" = 1 ] && [ -s "$DEST/$name.onnx" ]; then
    echo "  ok ($(du -h "$DEST/$name.onnx" | cut -f1))"
  else
    echo "  ERROR: $name.onnx not found in $repo after clone" >&2
    exit 1
  fi
done

echo
echo "All Piper models ready in: $DEST"
echo "Start the server with TTS_PROVIDER=piper for neural voices."
