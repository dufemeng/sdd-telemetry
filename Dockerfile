# syntax=docker/dockerfile:1.7

ARG NODE_IMAGE=node:22-bookworm-slim
ARG NGINX_IMAGE=nginx:1.27-alpine
ARG PNPM_VERSION=9.12.1

FROM --platform=$BUILDPLATFORM ${NODE_IMAGE} AS base
ARG PNPM_VERSION
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate

FROM base AS manifests
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json .npmrc ./
COPY web/package.json web/package.json
COPY server/package.json server/package.json
COPY worker/package.json worker/package.json
COPY packages/api/package.json packages/api/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/ui/package.json packages/ui/package.json

FROM manifests AS deps
RUN --mount=type=cache,id=sdd-pnpm-build,target=/pnpm/store pnpm install --frozen-lockfile

FROM deps AS source
COPY . .

FROM source AS build
RUN pnpm build

FROM --platform=$TARGETPLATFORM ${NODE_IMAGE} AS prod-base
ARG PNPM_VERSION
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate

FROM prod-base AS prod-deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY web/package.json web/package.json
COPY server/package.json server/package.json
COPY worker/package.json worker/package.json
COPY packages/api/package.json packages/api/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/ui/package.json packages/ui/package.json
RUN --mount=type=cache,id=sdd-pnpm-prod,target=/pnpm/store pnpm install --prod --frozen-lockfile

FROM --platform=$TARGETPLATFORM ${NODE_IMAGE} AS app
ENV NODE_ENV=production
ENV PORT=4318
WORKDIR /app

COPY --from=prod-deps /app/package.json /app/pnpm-workspace.yaml ./
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=prod-deps /app/server/package.json ./server/package.json
COPY --from=prod-deps /app/server/node_modules ./server/node_modules
COPY --from=prod-deps /app/worker/package.json ./worker/package.json
COPY --from=prod-deps /app/worker/node_modules ./worker/node_modules
COPY --from=prod-deps /app/packages/api/package.json ./packages/api/package.json
COPY --from=prod-deps /app/packages/api/node_modules ./packages/api/node_modules

COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/worker/dist ./worker/dist
COPY --from=build /app/packages/api/dist ./packages/api/dist

USER node
WORKDIR /app/server
EXPOSE 4318
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 4318) + '/api/healthz').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["node", "dist/bootstrap.js"]

FROM --platform=$TARGETPLATFORM ${NGINX_IMAGE} AS web
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/web/dist /usr/share/nginx/html
EXPOSE 80
