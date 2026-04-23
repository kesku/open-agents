FROM oven/bun:1.2.14

RUN apt-get update && \
  DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    gnupg && \
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && \
  DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    bash \
    build-essential \
    chromium \
    cmake \
    file \
    fd-find \
    git \
    gh \
    jq \
    less \
    nodejs \
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
    tini && \
  ln -sf /usr/bin/fdfind /usr/local/bin/fd && \
  python3 -m pip install --no-cache-dir --break-system-packages uv && \
  corepack enable && \
  corepack prepare pnpm@latest --activate && \
  corepack prepare yarn@1.22.22 --activate && \
  curl -fsSL https://code-server.dev/install.sh | sh && \
  rm -rf /var/lib/apt/lists/*

RUN mkdir -p /workspace && \
  mkdir -p \
    /home/bun/.cache/bun \
    /home/bun/.cache/node-gyp \
    /home/bun/.cache/pip \
    /home/bun/.cache/pnpm \
    /home/bun/.cache/uv \
    /home/bun/.cache/yarn \
    /home/bun/.local/bin \
    /home/bun/.local/share/pnpm \
    /home/bun/.npm && \
  chown -R bun:bun /workspace /home/bun

ENV HOME=/home/bun
ENV BROWSER=/usr/bin/chromium
ENV PNPM_HOME=/home/bun/.local/share/pnpm
ENV PATH=/home/bun/.local/bin:/home/bun/.local/share/pnpm:$PATH
ENV PIP_DISABLE_PIP_VERSION_CHECK=1
WORKDIR /workspace
USER bun
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["sleep", "infinity"]
