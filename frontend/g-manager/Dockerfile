# syntax=docker/dockerfile:1.7
FROM node:22.13.0-alpine3.21 AS build
WORKDIR /workspace
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci
COPY . .
ARG APP_VERSION=dev
ENV VITE_RELEASE=${APP_VERSION} VITE_API_URL=/api/v1
RUN npm run build

FROM nginxinc/nginx-unprivileged:1.27.4-alpine3.21
ARG APP_VERSION=dev
LABEL org.opencontainers.image.title="G-Manager frontend" \
      org.opencontainers.image.version="${APP_VERSION}"
COPY --from=build /workspace/dist /usr/share/nginx/html
COPY ops/nginx.conf /etc/nginx/conf.d/default.conf
COPY ops/maintenance.html /usr/share/nginx/html/maintenance.html
USER 101:101
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=5 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1
