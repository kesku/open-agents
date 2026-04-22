FROM oven/bun:1.2.14 AS base

RUN apt-get update && \
  DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    bash \
    ca-certificates \
    curl \
    git \
    openssh-client \
    procps && \
  rm -rf /var/lib/apt/lists/*

FROM docker:28-cli AS docker-cli

FROM base AS build
WORKDIR /app
COPY --from=docker-cli /usr/local/bin/docker /usr/local/bin/docker
COPY . .
RUN bun install --frozen-lockfile
ENV SKIP_DB_MIGRATE=true
RUN bun run --cwd apps/web build

FROM base AS runtime
WORKDIR /app
COPY --from=docker-cli /usr/local/bin/docker /usr/local/bin/docker
COPY --from=build /app /app
RUN chmod +x /app/docker/web/entrypoint.sh
ENV NODE_ENV=production
EXPOSE 3000
CMD ["/app/docker/web/entrypoint.sh"]
