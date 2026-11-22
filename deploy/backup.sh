#!/bin/sh
# pg_dump of the whole database, compressed and encrypted with BACKUP_PASSPHRASE (AES-256, PBKDF2).
# Restore: openssl enc -d -aes-256-cbc -pbkdf2 -iter 600000 -pass env:BACKUP_PASSPHRASE -in FILE | gunzip | psql "$DATABASE_URL"
set -eu
stamp=$(date -u +%Y-%m-%dT%H%M)
pg_dump -h db -U portal -d portal --no-owner | gzip \
  | openssl enc -aes-256-cbc -pbkdf2 -iter 600000 -salt -pass env:BACKUP_PASSPHRASE -out "/backups/portal-$stamp.sql.gz.enc"
find /backups -name 'portal-*.sql.gz.enc' -mtime +30 -delete
echo "backup portal-$stamp done"
