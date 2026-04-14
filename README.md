# Open Agents Web (Local Proxmox Runtime)

This app is deployed locally as a single-user Next.js service backed by a fixed
Proxmox LXC sandbox pool.

## Live Topology

The web app is part of a 6-container local setup:

- `open-agents-web` at `192.168.1.141` (this app, port `3000`)
- `open-agents-db` at `192.168.1.140` (PostgreSQL)
- `open-agents-1` at `192.168.1.130` (sandbox pool node)
- `open-agents-2` at `192.168.1.131` (sandbox pool node)
- `open-agents-3` at `192.168.1.132` (sandbox pool node)
- `open-agents-4` at `192.168.1.133` (sandbox pool node)

Pool behavior is intentionally simple:

- exactly 4 sandbox nodes
- one lease per active sandbox session
- no snapshot resume
- hard reset on release

## Access

Use the running app at:

```text
http://192.168.1.141:3000/sessions
```

Current auth mode is local-only:

- no Vercel OAuth
- no GitHub auth
- one fixed local user auto-signs in

## Runtime Environment

Runtime env is stored outside the git checkout.

Canonical env file on `open-agents-web`:

```text
/root/open-agents-env.sh
```

This env script provides values for:

- `POSTGRES_URL` and related DB config
- local auth config
- OpenAI provider config
- Proxmox pool configuration
- SSH key path for sandbox node access

Do not rely on repo-local `.env.local` in the server checkout. Sync flows using
`rsync --delete` can remove local files in the repo directory.

## Important Paths

On `open-agents-web`:

- app checkout: `/opt/open-agents`
- runtime env: `/root/open-agents-env.sh`
- sandbox pool SSH key: `/root/.ssh/open-agents-proxmox`
- service unit: `/etc/systemd/system/open-agents.service`

On each sandbox node:

- workspace: `/workspace`
- reset script: `/usr/local/bin/open-agents-reset`

## How Sandbox Leasing Works

When a user starts working in chat:

1. The app creates a session record in Postgres.
2. First sandbox creation reserves one Proxmox pool node.
3. The app connects to that node over SSH.
4. The sandbox runs using `/workspace`.
5. On stop/release, `/usr/local/bin/open-agents-reset` runs and hard-resets
   `/workspace` before the node returns to the pool.

Operational expectations:

- sandbox state is isolated for active leases
- finished sessions do not keep filesystem state
- a 5th concurrent sandbox request fails with capacity exhaustion

## Usage

1. Open `http://192.168.1.141:3000/sessions`
2. Create a session
3. Open the chat
4. Let the app lease a Proxmox sandbox as needed
5. Stop/end the sandbox when finished

## Service Operations

Check app status:

```bash
pct exec 141 -- systemctl status open-agents.service --no-pager -l
```

Restart app service:

```bash
pct exec 141 -- systemctl restart open-agents.service
```

Rebuild and restart after code changes:

```bash
pct exec 141 -- bash -lc "source /root/open-agents-env.sh && cd /opt/open-agents/apps/web && NODE_OPTIONS=--max-old-space-size=2048 bun run build && systemctl restart open-agents.service"
```

Check sandbox status for a session:

```bash
curl "http://192.168.1.141:3000/api/sandbox/status?sessionId=SESSION_ID"
```

Currently I got working:

- single-user local auth
- direct OpenAI model provider
- fixed 4-node Proxmox LXC pool
- hard reset on sandbox release

Soon:

- GitHub integration (later, this is MVP, should just need tokens tho)
- OAuth-based multi-user auth (this is running locally for me, myself, and I)
- snapshot/resume support for local Proxmox sandboxes