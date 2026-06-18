#!/usr/bin/env bash
# Clone reference repos as siblings of implAgent4 (../<clone_dir>).
# Safe to re-run: skips existing directories.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
IMPL_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
MANIFEST="${IMPLAGENT4_REFS_MANIFEST:-$SCRIPT_DIR/../repos.manifest.json}"
REFS_PARENT="$(cd "$IMPL_ROOT/.." && pwd)"

if ! command -v jq >/dev/null 2>&1; then
  echo "error: jq required (brew install jq)" >&2
  exit 1
fi

if [[ ! -f "$MANIFEST" ]]; then
  echo "error: manifest not found: $MANIFEST" >&2
  exit 1
fi

echo "implAgent4 root: $IMPL_ROOT"
echo "refs parent:     $REFS_PARENT"
echo "manifest:        $MANIFEST"
echo

cloned=0
skipped=0
failed=0

while IFS= read -r row; do
  dir=$(jq -r '.clone_dir' <<<"$row")
  url=$(jq -r '.url' <<<"$row")
  id=$(jq -r '.id' <<<"$row")
  target="$REFS_PARENT/$dir"

  if [[ -d "$target/.git" ]]; then
    echo "skip  $id → $target (already cloned)"
    skipped=$((skipped + 1))
    continue
  fi

  if [[ -e "$target" ]]; then
    echo "warn  $id → $target exists but is not a git repo; skipping" >&2
    skipped=$((skipped + 1))
    continue
  fi

  echo "clone $id → $target"
  if git clone --depth 1 "$url" "$target"; then
    cloned=$((cloned + 1))
  else
    echo "error: failed to clone $url" >&2
    failed=$((failed + 1))
  fi
done < <(jq -c '.repos[]' "$MANIFEST")

echo
echo "done: cloned=$cloned skipped=$skipped failed=$failed"
[[ $failed -eq 0 ]]
