# syntax=docker/dockerfile:1.7
FROM eclipse-temurin:21-jdk-jammy AS build
WORKDIR /workspace
COPY .mvn .mvn
COPY mvnw pom.xml ./
RUN --mount=type=cache,target=/root/.m2 ./mvnw -q -DskipTests dependency:go-offline
COPY src src
COPY config config
RUN --mount=type=cache,target=/root/.m2 ./mvnw -q -DskipTests package

FROM eclipse-temurin:21-jre-jammy
ARG APP_VERSION=dev
LABEL org.opencontainers.image.title="G-Manager backend" \
      org.opencontainers.image.version="${APP_VERSION}" \
      org.opencontainers.image.source="https://github.com/g-manager/g-manager"
RUN apt-get update && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --system --gid 10001 gmanager \
    && useradd --system --uid 10001 --gid gmanager --home-dir /app --shell /usr/sbin/nologin gmanager
WORKDIR /app
COPY --from=build /workspace/target/gm-*.jar app.jar
COPY ops/container-entrypoint.sh /app/container-entrypoint.sh
RUN chmod 0555 /app/container-entrypoint.sh \
    && mkdir -p /data/uploads /tmp/gmanager \
    && chown -R gmanager:gmanager /app /data /tmp/gmanager
USER 10001:10001
ENV JAVA_TOOL_OPTIONS="-XX:MaxRAMPercentage=75 -Djava.io.tmpdir=/tmp/gmanager" \
    SPRING_PROFILES_ACTIVE=prod \
    APP_RELEASE=${APP_VERSION}
EXPOSE 8080 9091
HEALTHCHECK --interval=15s --timeout=3s --start-period=45s --retries=5 \
  CMD curl --fail --silent http://127.0.0.1:9091/actuator/health/readiness || exit 1
ENTRYPOINT ["/app/container-entrypoint.sh"]
