FROM mysql:8.4
# Use the native MySQL 8 client: the former Alpine MariaDB client lacked caching_sha2_password.
# This image already supplies bash, gzip, openssl, tar and checksum tools.
RUN groupadd -g 10001 gmanagerbackup && useradd -u 10001 -g gmanagerbackup -M -s /sbin/nologin gmanagerbackup
WORKDIR /backup
COPY backup.sh restore-drill.sh backup-loop.sh backup-set.sh ledger-check.sql ./
RUN chmod 0555 backup.sh restore-drill.sh backup-loop.sh backup-set.sh && mkdir -p /backup/output && chown gmanagerbackup:gmanagerbackup /backup/output
USER 10001:10001
ENTRYPOINT []
CMD ["/backup/backup.sh"]
