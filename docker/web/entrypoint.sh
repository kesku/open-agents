#!/usr/bin/env bash

set -euo pipefail

cd /app

pnpm --dir apps/web db:migrate:apply

if [[ "${OPEN_AGENTS_DEPLOYMENT_MODE:-local}" == "local" ]]; then
  pnpm --dir apps/web workflow:setup
  pnpm --dir apps/web auth:bootstrap
fi

exec pnpm --dir apps/web start
