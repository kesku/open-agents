#!/usr/bin/env bash

set -euo pipefail

usage() {
  cat <<'EOF'
Ensure the homelab platform host has the required container runtime tools.

Usage:
  scripts/ensure-homelab-tools.sh

Environment overrides:
  OPEN_AGENTS_HOMELAB_SSH_TARGET    SSH target for the platform host (default: open-agents-platform)
EOF
}

if (($# > 0)); then
  case "$1" in
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
fi

ssh_target="${OPEN_AGENTS_HOMELAB_SSH_TARGET:-open-agents-platform}"

echo "Checking Docker tooling on ${ssh_target}..."

ssh "${ssh_target}" "bash -s" <<'EOF'
set -euo pipefail

docker --version >/dev/null
docker compose version >/dev/null
EOF

echo "Container runtime checks passed."
