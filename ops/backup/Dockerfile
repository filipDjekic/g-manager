FROM alpine:3.21.3
RUN apk add --no-cache mysql-client openssl bash
RUN addgroup -g 10001 backup && adduser -D -u 10001 -G backup backup
WORKDIR /backup
COPY backup.sh restore-drill.sh ./
RUN chmod 0555 backup.sh restore-drill.sh && mkdir -p /backup/output && chown backup:backup /backup/output
USER 10001:10001
