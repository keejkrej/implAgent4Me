#!/usr/bin/env bash
# Report which reference repos are present as sibling clones.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
IMPL_ROOT="$(cd "$SCRIPT_DIR/../../../.." && pwd)"
MANIFEST="${IMPLAGENT4_REFS_MANIFEST:-$SCRIPT_DIR/../repos.manifest.json}"
REFS_PARENT="$(cd "$IMPL_ROOT/.." && pwd)"

if ! command -v jq >/dev/null 2>&1; then
  echo "error: jq required" >&2
  exit 1
fi

missing=0
while IFS= read -r row; do
  id=$(jq -r '.id' <<<"$row")
  dir=$(jq -r '.clone_dir' <<<"$row")
  snippets=$(jq -r '.snippet_dir | if type == "array" then join(",") else . end' <<<"$row")
  target="$REFS_PARENT/$dir"
  snippet_path="$IMPL_ROOT/snippets"

  if [[ -d "$target/.git" ]]; then
    rev=$(git -C "$target" rev-parse --short HEAD 2>/dev/null || echo "?")
    remote=$(git -C "$target" remote get-url origin 2>/dev/null || echo "?")
    state="ok"
  elif [[ -d "$target" ]]; then
    state="present (not git)"
    rev="-"
    remote="-"
  else
    state="MISSING"
    rev="-"
    remote="-"
    missing=$((missing + 1))
  fi

  # Count snippet files for this impl
  count=0
  IFS=',' read -ra dirs <<<"$snippets"
  for sdir in "${dirs[@]}"; do
    if [[ -d "$snippet_path/$sdir" ]]; then
      n=$(find "$snippet_path/$sdir" -type f \( -name '*.ts' -o -name '*.py' \) 2>/dev/null | wc -l | tr -d ' ')
      count=$((count + n))
    fi
  done

  printf "%-14s %-8s  snippets=%-3s  %s\n" "$id" "$state" "$count" "$target"
  [[ "$state" == "ok" ]] && printf "               %s @ %s\n" "$remote" "$rev"
done < <(jq -c '.repos[]' "$MANIFEST")

echo
if [[ $missing -gt 0 ]]; then
  echo "$missing repo(s) missing — clone manually (sibling of implAgent4):"
  while IFS= read -r row; do
    id=$(jq -r '.id' <<<"$row")
    dir=$(jq -r '.clone_dir' <<<"$row")
    url=$(jq -r '.url' <<<"$row")
    target="$REFS_PARENT/$dir"
    [[ -d "$target/.git" || -d "$target" ]] && continue
    echo "  git clone $url $target"
  done < <(jq -c '.repos[]' "$MANIFEST")
  exit 1
fi
