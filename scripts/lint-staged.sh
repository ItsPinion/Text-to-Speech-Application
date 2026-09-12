#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# lint-staged (Phase 2 pre-commit gate): eslint --fix on the files passed by
# pre-commit, routed to the OWNING workspace so the right config + eslint
# version applies (web = eslint 8 + next config; api/packages = eslint 9 flat).
#
# Exits non-zero if any unfixable error remains; files fixed in place are
# re-staged so the commit carries the fixed content.
# ─────────────────────────────────────────────────────────────────────────────
set -u

cd "$(git rev-parse --show-toplevel)" || exit 1

# Group staged files by the workspace that owns them, stored relative to it
# (eslint runs with the workspace as cwd, so the paths it receives must be too).
declare -A dirs=() rels=()
for f in "$@"; do
  case "$f" in
    apps/web/*)  d="apps/web" ;;
    apps/api/*)  d="apps/api" ;;
    packages/*)  d="$(dirname "$f" | cut -d/ -f1-2)" ;;
    *)           : ; continue ;; # non-source or root files: nothing to lint here
  esac
  dirs["$d"]=1
  rels["$d"]+="${f#"$d"/} "
done

status=0
for d in "${!dirs[@]}"; do
  files="${rels[$d]}"
  echo "[lint-staged] eslint --fix in ${d}: ${files%% } …"
  # Word splitting is intentional (space-joined workspace-relative file list).
  (cd "$d" && bunx eslint --fix $files) || status=1
done

# Re-stage files that --fix rewrote (only when nothing failed).
if [ "$status" -eq 0 ] && [ "${#@}" -gt 0 ]; then
  git add -- "$@" 2>/dev/null || true
fi

exit "$status"
