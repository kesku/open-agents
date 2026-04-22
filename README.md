# Open Agents (But it's Docker Based)

Open Agents but as a single-user platform on one host with persistent services running under Docker Compose, where each active session gets
its own ephemeral sandbox container with an isolated `/workspace`.

## Runtime Model

Sandboxes are managed by the in-process `SandboxSupervisor`:

- create/remove session containers
- mount the session workspace
- attach Traefik labels and the shared Docker network
- enforce CPU and memory admission policy
- reconcile missing containers and orphaned workspaces
- preserve a recoverable workspace when a container disappears unexpectedly

Each sandbox container:

- runs as a non-root `agent` user
- gets CPU, memory, and PID limits
- uses `no-new-privileges`
- drops Linux capabilities with `cap-drop=ALL`
- keeps `/workspace` writable
- gets `/tmp` as tmpfs
- uses `tini` as PID 1

## Running The Platform

Build and start the full stack on the platform host:

```bash
docker build -f docker/sandbox/Dockerfile -t open-agents-sandbox:local .
docker compose --env-file /etc/open-agents/platform.env up -d --build
```

The main app is routed through Traefik at:

```text
https://openagents.kesku.me/sessions
```

Sandbox editor and preview URLs are derived from a stable opaque session slug:

```text
https://oa-<slug>-3000.kesku.me
https://oa-<slug>-5173.kesku.me
```

## Deploying From This Repo

I have a homelab I keep this running on

```bash
bun run deploy:homelab
```

The deploy script:

- syncs the repo to the platform host
- validates Docker and Compose availability
- builds the sandbox image
- runs `docker compose up -d --build --remove-orphans`
- waits for the app health check to come back

Useful overrides:

- `OPEN_AGENTS_HOMELAB_SSH_TARGET`
- `OPEN_AGENTS_HOMELAB_REPO_DIR`
- `OPEN_AGENTS_HOMELAB_ENV_FILE`
- `OPEN_AGENTS_HOMELAB_HEALTH_URL`

## Local GitHub Mode

```bash
export LOCAL_GITHUB_ACCESS_TOKEN=...
```

That token is used for:

- repo discovery
- clone and push auth
- pull request creation
- `gh` inside sandbox containers via `GH_TOKEN` and `GITHUB_TOKEN`

## Domain Notes

- Keep the main app at `openagents.kesku.me` behind Cloudflare Access.
- Use sandbox/editor/dev hosts under `*.kesku.me`, not `*.openagents.kesku.me`.
- This wildcard move matters because Cloudflare's default TLS coverage works for first-level wildcard hosts like `*.kesku.me`, but not for deeper wildcard hosts like `*.openagents.kesku.me`.
- Exact tunnel routes for other services still take precedence over the wildcard sandbox route.

## Operations

On the platform host:

```bash
docker compose ps
docker compose logs -f web
docker compose logs -f traefik
docker ps --filter label=open-agents.managed=true
```

To inspect sandbox lifecycle state from the app:

```bash
curl "http://127.0.0.1/api/sandbox/status?sessionId=SESSION_ID"
```
