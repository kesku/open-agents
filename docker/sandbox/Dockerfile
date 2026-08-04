FROM oven/bun:1.3.12 AS bun-runtime

FROM node:24-bookworm-slim

ENV PNPM_HOME=/home/node/.local/share/pnpm
ENV PATH=/home/node/.local/bin:/home/node/.local/share/pnpm:$PATH
ENV BROWSER=/usr/bin/chromium
ENV PIP_DISABLE_PIP_VERSION_CHECK=1

RUN apt-get update \
  && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    bash \
    build-essential \
    ca-certificates \
    chromium \
    cmake \
    curl \
    fd-find \
    file \
    git \
    jq \
    less \
    openssh-client \
    pkg-config \
    procps \
    python-is-python3 \
    python3 \
    python3-dev \
    python3-pip \
    python3-venv \
    ripgrep \
    rsync \
    sqlite3 \
    tini \
  && rm -rf /var/lib/apt/lists/* \
  && ln -s /usr/bin/fdfind /usr/local/bin/fd

COPY --from=bun-runtime /usr/local/bin/bun /usr/local/bin/bun
RUN ln -s /usr/local/bin/bun /usr/local/bin/bunx \
  && corepack enable \
  && corepack prepare pnpm@11.5.1 --activate \
  && npm install --global agent-browser@0.33.2 code-server@4.117.0 \
  && mkdir -p \
    /vercel/sandbox \
    /home/node/.cache \
    /home/node/.local/bin \
    /home/node/.local/share/pnpm \
    /home/node/.npm \
  && chown -R node:node /vercel /home/node

ENV HOME=/home/node
WORKDIR /vercel/sandbox
USER node

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["sleep", "infinity"]
