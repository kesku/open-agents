FROM docker:28-cli AS docker-cli

FROM node:24-bookworm-slim AS base

ENV PNPM_HOME=/pnpm
ENV PATH=/pnpm:$PATH

RUN apt-get update \
  && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    bash \
    ca-certificates \
    git \
    openssh-client \
    procps \
    tini \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable \
  && corepack prepare pnpm@11.5.1 --activate

COPY --from=docker-cli /usr/local/bin/docker /usr/local/bin/docker

FROM base AS build

WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile

ENV SKIP_DB_MIGRATE=true
RUN pnpm --dir apps/web build

FROM base AS runtime

ENV NODE_ENV=production
WORKDIR /app

COPY --from=build --chown=node:node /app /app
RUN chmod +x /app/docker/web/entrypoint.sh

USER node
EXPOSE 3000
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["/app/docker/web/entrypoint.sh"]
