# Open Agents

Open Agents is an open-source app for running coding agents locally or on Vercel. It includes the web UI, agent runtime, sandbox orchestration, and GitHub integration needed to go from a prompt to code changes.

By default it runs in local mode with Docker Compose: Postgres, Redis, Docker sandboxes, email/password auth for one owner account, a GitHub personal access token for repo access, and optional OpenAI-compatible model providers. Hosted Vercel auth, GitHub App, Sandbox, Workflow, BotID, and Analytics stay available when you set `OPEN_AGENTS_DEPLOYMENT_MODE=vercel`.

## Architecture

```text
Browser -> Next.js app -> Workflow -> agent -> sandbox
                |              |                 |
          Postgres + Redis   Postgres      Docker or Vercel
```

The agent does not run inside the sandbox. It runs in the app process (via Workflow) and uses tools to read files, edit code, run commands, and inspect Git state. GitHub writes go through the app with Octokit. Clone and fetch credentials are injected only for those operations, then cleared.

## Self-host with Docker Compose

Requirements:

- Docker Engine and Docker Compose v2
- a host with at least 4 GB of memory for the first web and sandbox containers
- a GitHub personal access token if you want repository access

Create the deployment configuration:

```bash
cp docker/platform.env.example docker/platform.env
openssl rand -base64 32 # use for BETTER_AUTH_SECRET
openssl rand -hex 32    # use for ENCRYPTION_KEY
```

Edit `docker/platform.env` and set:

- `POSTGRES_PASSWORD`
- `BETTER_AUTH_SECRET`
- `LOCAL_AUTH_EMAIL` and `LOCAL_AUTH_PASSWORD`
- `ENCRYPTION_KEY`
- `LOCAL_GITHUB_ACCESS_TOKEN` when repository access is needed
- `DOCKER_GID` to `stat -c %g /var/run/docker.sock` on Linux

A fine-grained GitHub token should be limited to the repositories Open Agents may use. Grant Metadata read access, Contents read/write access, and Pull requests read/write access when the agent should be able to push branches and open PRs.

Build and start the stack:

```bash
docker compose --env-file docker/platform.env up --build -d
```

Open `http://openagents.localhost` and sign in with the configured owner credentials. On startup the web container applies migrations, sets up Workflow tables, creates the owner account if needed, and starts the app.

The Compose stack contains:

- `web`: Next.js app and Workflow worker
- `postgres`: application data and Workflow tables
- `redis`: rate limiting and shared cache/stream state
- `sandbox-image`: Node 24/Bun image used for agent containers
- `traefik`: app route and per-sandbox preview routes

Application and sandbox data survive container restarts in Postgres, Redis, and Docker named volumes. Archiving a session destroys its sandbox container and workspace volume.

### Docker socket access

The web service needs a Docker Engine API to create agent containers. Mounting the host Docker socket gives that service broad host access; agent containers never receive the socket. For an internet-facing deployment, point `DOCKER_SOCKET_PATH` at a dedicated rootless Docker daemon socket, or otherwise keep the engine away from unrelated host workloads.

Agent containers run as an unprivileged user, with dropped capabilities and CPU, memory, and PID limits. GitHub credentials are not stored in their environment, labels, Git config, remotes, or sandbox state.

### Remote hosts and preview URLs

The defaults use `127.0.0.1.sslip.io` and plain HTTP for machine-local previews. For a remote deployment, set:

```env
SANDBOX_DOMAIN_SUFFIX=sandboxes.example.com
SANDBOX_PUBLIC_PROTOCOL=https
OPEN_AGENTS_APP_HOST=agents.example.com
APP_URL=https://agents.example.com
BETTER_AUTH_URL=https://agents.example.com
```

Configure wildcard DNS and TLS for `*.sandboxes.example.com` at the reverse proxy.

## Local development

Install Node 24, Corepack/pnpm, Bun, Postgres, Redis, and Docker. Then:

```bash
corepack enable
pnpm install
cp apps/web/.env.example apps/web/.env
```

Fill the required local values in `apps/web/.env`, create the databases, then initialize the services:

```bash
pnpm --dir apps/web db:migrate:apply
pnpm --dir apps/web workflow:setup
pnpm --dir apps/web auth:bootstrap
pnpm web
```

The Next.js instrumentation hook starts the configured Workflow World. `WORKFLOW_TARGET_WORLD=@workflow/world-postgres` needs a long-running process, which both `pnpm web` and the Compose web service provide.

## Configuration

See `apps/web/.env.example` for the full development configuration and `docker/platform.env.example` for the Compose secrets.

Core local values:

```env
OPEN_AGENTS_DEPLOYMENT_MODE=local
NEXT_PUBLIC_OPEN_AGENTS_DEPLOYMENT_MODE=local
POSTGRES_URL=postgresql://...
REDIS_URL=redis://...
BETTER_AUTH_URL=http://localhost:3000
BETTER_AUTH_SECRET=...
LOCAL_AUTH_EMAIL=owner@example.com
LOCAL_AUTH_PASSWORD=...
LOCAL_GITHUB_ACCESS_TOKEN=...
WORKFLOW_TARGET_WORLD=@workflow/world-postgres
WORKFLOW_POSTGRES_URL=postgresql://...
SANDBOX_PROVIDER=docker
NEXT_PUBLIC_SANDBOX_PROVIDER=docker
ENCRYPTION_KEY=...
```

Keep `LOCAL_GITHUB_ACCESS_TOKEN` and model-provider keys server-only. Do not give them a `NEXT_PUBLIC_` prefix.

## Model providers

Add OpenAI-compatible providers in Settings with a provider ID, API base URL, and API key. Keys are encrypted with AES-256-GCM in Postgres, never returned by the settings API, and loaded only inside execution steps so they are not stored as Workflow arguments or results.

Set `AI_GATEWAY_API_KEY` only if you also want the Vercel AI Gateway catalog and fallback. A configured direct provider can run chat, title generation, commit messages, checks fixes, and PR content without Gateway credentials.

## Hosted Vercel mode

Set both deployment-mode variables to `vercel`, choose the Vercel sandbox provider, and configure the Vercel OAuth, GitHub App, AI Gateway, and Vercel Sandbox variables from `apps/web/.env.example`.

[Deploy to Vercel](https://vercel.com/new/clone?project-name=open-agents&repository-name=open-agents&repository-url=https%3A%2F%2Fgithub.com%2Fvercel-labs%2Fopen-agents)

Local owner bootstrap, GitHub PAT wiring, Workflow Postgres setup, and Docker sandbox creation are unused in Vercel mode.

## Runtime behavior

- Chat requests start Workflow runs instead of executing the agent inline.
- Active runs reconnect to the existing Workflow stream and can survive process restarts.
- Sandboxes expose ports `3000`, `5173`, `4321`, and `8000`, and hibernate after inactivity.
- Docker hibernation keeps the workspace volume; archive removes it.
- In hosted mode, repository access follows the signed-in user and GitHub App installation. In local mode, it follows the PAT scope.
- Auto-commit and auto-PR are optional preferences.
- Session sharing and optional ElevenLabs voice input remain available.

## Useful commands

```bash
pnpm web                              # run the web/Workflow process
pnpm --dir apps/web db:migrate:apply  # apply application migrations
pnpm --dir apps/web workflow:setup    # initialize Workflow Postgres tables
pnpm --dir apps/web auth:bootstrap    # create the configured local owner
pnpm check                            # lint and format check
pnpm fix                              # apply lint/format fixes
pnpm typecheck                        # typecheck all packages
pnpm run ci                           # full CI verification
```

## Repository layout

```text
apps/web          Next.js app, workflows, auth, persistence, and UI
packages/agent    agent implementation and tools
packages/sandbox  sandbox interface plus Vercel and Docker implementations
packages/shared   shared hooks and utilities
docker            web/sandbox images and Compose configuration
```
