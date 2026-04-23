#!/usr/bin/env bash

set -euo pipefail

usage() {
  cat <<'EOF'
Deploy the current working tree to the homelab platform host.

Usage:
  scripts/deploy-homelab.sh [--skip-checks] [--skip-build] [--skip-tools]

Options:
  --skip-checks  Skip local `bun run ci` before deploying.
  --skip-build   Sync files only; skip remote build/restart.
  --skip-tools   Skip homelab container-runtime validation before syncing.
  -h, --help     Show this help text.

Environment overrides:
  OPEN_AGENTS_HOMELAB_SSH_TARGET   SSH target for the platform host (default: open-agents-platform)
  OPEN_AGENTS_HOMELAB_REPO_DIR     Repo path on the host (default: /opt/open-agents)
  OPEN_AGENTS_HOMELAB_ENV_FILE     Runtime env file on the host (default: /etc/open-agents/platform.env)
  OPEN_AGENTS_HOMELAB_HEALTH_URL   Health probe URL after restart (default: http://127.0.0.1/sessions)
  OPEN_AGENTS_HOMELAB_HEALTH_HOST  Host header for the health probe (default: openagents.kesku.me)
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

ssh_target="${OPEN_AGENTS_HOMELAB_SSH_TARGET:-open-agents-platform}"
remote_repo_dir="${OPEN_AGENTS_HOMELAB_REPO_DIR:-/opt/open-agents}"
remote_env_file="${OPEN_AGENTS_HOMELAB_ENV_FILE:-/etc/open-agents/platform.env}"
remote_health_url="${OPEN_AGENTS_HOMELAB_HEALTH_URL:-http://127.0.0.1/sessions}"
remote_health_host="${OPEN_AGENTS_HOMELAB_HEALTH_HOST:-openagents.kesku.me}"

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
  echo "Checking homelab container runtime..."
  "${script_dir}/ensure-homelab-tools.sh"
fi

echo "Syncing repository to ${ssh_target}..."

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
  "bash -lc '
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

echo "Building sandbox image and restarting the platform..."

ssh "${ssh_target}" \
  "bash -lc '
    set -euo pipefail
    test -f \"${remote_env_file}\"
    cd \"${remote_repo_dir}\"
    set -a
    source \"${remote_env_file}\"
    set +a
    export OPEN_AGENTS_ENV_FILE=\"${remote_env_file}\"
    docker build -f docker/sandbox/Dockerfile -t \"\${SANDBOX_IMAGE:-open-agents-sandbox:local}\" .
    docker compose --env-file \"${remote_env_file}\" up -d --build --remove-orphans
    for attempt in \$(seq 1 30); do
      if curl -fsS -H \"Host: ${remote_health_host}\" \"${remote_health_url}\" >/dev/null 2>&1; then
        exit 0
      fi
      sleep 1
    done
    echo \"Timed out waiting for platform health check.\" >&2
    exit 1
  '"

echo "Homelab deploy finished successfully."
