#!/usr/bin/env bash

set -euo pipefail

cd /app
bun run --cwd apps/web db:migrate:apply
exec bun run --cwd apps/web start
