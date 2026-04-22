FROM oven/bun:1.2.14

RUN apt-get update && \
  DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    gnupg && \
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && \
  DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    bash \
    chromium \
    git \
    gh \
    jq \
    nodejs \
    procps \
    python3 \
    tini && \
  curl -fsSL https://code-server.dev/install.sh | sh && \
  rm -rf /var/lib/apt/lists/*

RUN mkdir -p /workspace && \
  chown -R bun:bun /workspace /home/bun

ENV HOME=/home/bun
ENV BROWSER=/usr/bin/chromium
WORKDIR /workspace
USER bun
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["sleep", "infinity"]
