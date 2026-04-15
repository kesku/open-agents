#!/usr/bin/env bash

set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "${script_dir}/.." && pwd)"

cd "${repo_root}"

git config core.hooksPath .githooks

if [[ "${1:-}" == "--enable-auto-deploy" ]]; then
  git config openagents.autoDeployHomelab true
fi

cat <<'EOF'
Configured git to use repo hooks from .githooks.

Optional auto-deploy toggle:
  git config openagents.autoDeployHomelab true
  git config --unset openagents.autoDeployHomelab

When enabled, each commit triggers scripts/deploy-homelab.sh in the background
with --skip-checks, and logs to .git/open-agents-homelab-deploy.log.
EOF
