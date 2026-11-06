FROM restic/restic:0.18.1@sha256:39d9072fb5651c80d75c7a811612eb60b4c06b32ffe87c2e9f3c7222e1797e76 AS restic
FROM mysql:8.4@sha256:a81d043930e51745522bd5c430961cf8286f0a23f0a9a2a6e0108f7ea71b0902
# Use the native MySQL 8 client: the former Alpine MariaDB client lacked caching_sha2_password.
# This image already supplies bash, gzip, openssl, tar and checksum tools.
RUN microdnf install -y python3 util-linux && microdnf clean all && groupadd -g 10001 gmanagerbackup && useradd -u 10001 -g gmanagerbackup -M -s /sbin/nologin gmanagerbackup
COPY --from=restic /usr/bin/restic /usr/local/bin/restic
WORKDIR /backup
COPY backup.sh restore-drill.sh backup-loop.sh backup-set.sh scheduled-backup.sh ledger-check.sql time-ledger-check.sql ./
RUN chmod 0555 backup.sh restore-drill.sh backup-loop.sh backup-set.sh scheduled-backup.sh && mkdir -p /backup/output /documents && chown gmanagerbackup:gmanagerbackup /backup/output /documents
USER 10001:10001
ENTRYPOINT []
CMD ["/backup/backup.sh"]
