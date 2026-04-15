#!/usr/bin/env bash

set -euo pipefail

usage() {
  cat <<'EOF'
Ensure required CLI tools are installed on the homelab containers.

Usage:
  scripts/ensure-homelab-tools.sh

Environment overrides:
  OPEN_AGENTS_HOMELAB_SSH_TARGET    SSH target for the Proxmox host (default: homelab)
  OPEN_AGENTS_HOMELAB_TOOL_CTS      Space-separated CT IDs to check (default: "131 132 133 134 141")
  OPEN_AGENTS_HOMELAB_TOOL_PACKAGES Space-separated packages to ensure (default: "git gh")
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

ssh_target="${OPEN_AGENTS_HOMELAB_SSH_TARGET:-homelab}"
ct_ids="${OPEN_AGENTS_HOMELAB_TOOL_CTS:-131 132 133 134 141}"
packages="${OPEN_AGENTS_HOMELAB_TOOL_PACKAGES:-git gh}"

echo "Ensuring packages [${packages}] on CTs [${ct_ids}] via ${ssh_target}..."

ssh "${ssh_target}" "CT_IDS='${ct_ids}' PACKAGES='${packages}' bash -s" <<'EOF'
set -euo pipefail

for ct in ${CT_IDS}; do
  status="$(pct status "${ct}" 2>/dev/null || true)"
  if [[ -z "${status}" ]]; then
    echo "Skipping CT ${ct}: not found."
    continue
  fi

  if [[ "${status}" != "status: running" ]]; then
    echo "Skipping CT ${ct}: ${status}."
    continue
  fi

  echo "Checking CT ${ct}..."

  missing_packages=()
  for package in ${PACKAGES}; do
    if ! pct exec "${ct}" -- bash -lc "dpkg -s ${package} >/dev/null 2>&1"; then
      missing_packages+=("${package}")
    fi
  done

  if ((${#missing_packages[@]} == 0)); then
    echo "CT ${ct}: all tools already installed."
    continue
  fi

  echo "CT ${ct}: installing ${missing_packages[*]}..."
  pct exec "${ct}" -- bash -lc \
    "DEBIAN_FRONTEND=noninteractive apt-get update >/dev/null && DEBIAN_FRONTEND=noninteractive apt-get install -y ${missing_packages[*]} >/dev/null"
  echo "CT ${ct}: install complete."
done
EOF

echo "Homelab tool bootstrap finished successfully."
