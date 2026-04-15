#!/usr/bin/env bash

set -euo pipefail

usage() {
  cat <<'EOF'
Deploy the current working tree to the homelab web container.

Usage:
  scripts/deploy-homelab.sh [--skip-checks] [--skip-build] [--skip-tools]

Options:
  --skip-checks  Skip local `bun run ci` before deploying.
  --skip-build   Sync files only; skip remote install/build/restart.
  --skip-tools   Skip homelab tool bootstrap before syncing.
  -h, --help     Show this help text.

Environment overrides:
  OPEN_AGENTS_HOMELAB_SSH_TARGET   SSH target for the Proxmox host (default: homelab)
  OPEN_AGENTS_HOMELAB_CT_ID        Web app container ID (default: 141)
  OPEN_AGENTS_HOMELAB_REPO_DIR     Repo path inside the container (default: /opt/open-agents)
  OPEN_AGENTS_HOMELAB_ENV_SCRIPT   Runtime env script inside the container (default: /root/open-agents-env.sh)
  OPEN_AGENTS_HOMELAB_SERVICE      Systemd service name (default: open-agents.service)
  OPEN_AGENTS_HOMELAB_BUN          Bun binary inside the container (default: /usr/local/bin/bun)
  OPEN_AGENTS_HOMELAB_HEALTH_PATH  Health probe path after restart (default: /sessions)
EOF
}

run_checks=1
run_build=1
run_tools=1

while (($# > 0)); do
  case "$1" in
    --skip-checks)
      run_checks=0
      ;;
    --skip-build)
      run_build=0
      ;;
    --skip-tools)
      run_tools=0
      ;;
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
  shift
done

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "${script_dir}/.." && pwd)"
lock_dir="${repo_root}/.git/open-agents-homelab-deploy.lock"

ssh_target="${OPEN_AGENTS_HOMELAB_SSH_TARGET:-homelab}"
ct_id="${OPEN_AGENTS_HOMELAB_CT_ID:-141}"
remote_repo_dir="${OPEN_AGENTS_HOMELAB_REPO_DIR:-/opt/open-agents}"
remote_env_script="${OPEN_AGENTS_HOMELAB_ENV_SCRIPT:-/root/open-agents-env.sh}"
remote_service="${OPEN_AGENTS_HOMELAB_SERVICE:-open-agents.service}"
remote_bun="${OPEN_AGENTS_HOMELAB_BUN:-/usr/local/bin/bun}"
remote_health_path="${OPEN_AGENTS_HOMELAB_HEALTH_PATH:-/sessions}"

cleanup() {
  rmdir "${lock_dir}" 2>/dev/null || true
}

if ! mkdir "${lock_dir}" 2>/dev/null; then
  echo "Another homelab deploy is already running." >&2
  exit 1
fi

trap cleanup EXIT

cd "${repo_root}"

if [[ "${run_checks}" -eq 1 ]]; then
  echo "Running local checks..."
  bun run ci
fi

if [[ "${run_tools}" -eq 1 ]]; then
  echo "Ensuring homelab tools are installed..."
  "${script_dir}/ensure-homelab-tools.sh"
fi

echo "Syncing repository to ${ssh_target} (CT ${ct_id})..."

tar_args=(
  --exclude=".git"
  --exclude="node_modules"
  --exclude=".next"
  --exclude=".turbo"
  --exclude="apps/web/node_modules"
  --exclude="apps/web/.next"
  --exclude=".DS_Store"
  --exclude="._*"
  -cf
  -
  .
)

if tar --help 2>&1 | grep -q -- "--disable-copyfile"; then
  tar_args=(--disable-copyfile "${tar_args[@]}")
elif tar --help 2>&1 | grep -q -- "--no-mac-metadata"; then
  tar_args=(--no-mac-metadata "${tar_args[@]}")
fi

COPYFILE_DISABLE=1 COPY_EXTENDED_ATTRIBUTES_DISABLE=1 tar "${tar_args[@]}" | ssh "${ssh_target}" \
  "pct exec ${ct_id} -- bash -lc '
    set -euo pipefail
    tmp_dir=\$(mktemp -d /tmp/open-agents-deploy.XXXXXX)
    trap \"rm -rf \\\"\${tmp_dir}\\\"\" EXIT
    mkdir -p \"\${tmp_dir}/src\" \"${remote_repo_dir}\"
    tar -xf - -C \"\${tmp_dir}/src\" 2>/dev/null
    rsync -a --delete \
      --exclude node_modules \
      --exclude .next \
      --exclude apps/web/node_modules \
      --exclude apps/web/.next \
      \"\${tmp_dir}/src/\" \"${remote_repo_dir}/\"
  '"

if [[ "${run_build}" -ne 1 ]]; then
  echo "Sync complete. Remote build/restart skipped."
  exit 0
fi

echo "Installing dependencies, building, and restarting the app..."

ssh "${ssh_target}" \
  "pct exec ${ct_id} -- bash -lc '
    set -euo pipefail
    cd \"${remote_repo_dir}\"
    ${remote_bun} install --frozen-lockfile
    source \"${remote_env_script}\"
    cd \"${remote_repo_dir}/apps/web\"
    NODE_OPTIONS=--max-old-space-size=2048 ${remote_bun} run build
    systemctl restart \"${remote_service}\"
    systemctl is-active \"${remote_service}\" >/dev/null
    for attempt in \$(seq 1 30); do
      if curl -fsS \"http://127.0.0.1:3000${remote_health_path}\" >/dev/null 2>&1; then
        exit 0
      fi
      sleep 1
    done
    echo \"Timed out waiting for ${remote_service} health check.\" >&2
    exit 1
  '"

echo "Homelab deploy finished successfully."
