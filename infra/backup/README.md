# ChurnVision Enterprise - Backup & Restore

This directory contains scripts for backing up and restoring the PostgreSQL database.

## Quick Start

### Backup (Docker deployment)

```bash
# Make scripts executable
chmod +x infra/backup/*.sh

# Create a backup
./infra/backup/backup-docker.sh ./backups

# Or with custom retention (days)
BACKUP_RETENTION=7 ./infra/backup/backup-docker.sh ./backups
```

### Restore

```bash
# Restore from a backup file
POSTGRES_PASSWORD=your_password ./infra/backup/restore.sh ./backups/churnvision_20240101_120000.sql.gz
```

## Scripts

| Script | Description |
|--------|-------------|
| `backup.sh` | Direct PostgreSQL backup (requires pg_dump on host) |
| `backup-docker.sh` | Backup from Docker container (recommended) |
| `restore.sh` | Restore database from backup |

## Automated Backups

### Using Cron (Linux/macOS)

Add to crontab (`crontab -e`):

```cron
# Daily backup at 2 AM
0 2 * * * cd /path/to/churnvision && ./infra/backup/backup-docker.sh ./backups >> /var/log/churnvision-backup.log 2>&1

# Weekly full backup on Sunday at 3 AM (keep for 90 days)
0 3 * * 0 cd /path/to/churnvision && BACKUP_RETENTION=90 ./infra/backup/backup-docker.sh ./backups/weekly >> /var/log/churnvision-backup.log 2>&1
```

### Using systemd Timer (Linux)

Create `/etc/systemd/system/churnvision-backup.service`:

```ini
[Unit]
Description=ChurnVision Database Backup

[Service]
Type=oneshot
WorkingDirectory=/opt/churnvision
ExecStart=/opt/churnvision/infra/backup/backup-docker.sh /opt/churnvision/backups
```

Create `/etc/systemd/system/churnvision-backup.timer`:

```ini
[Unit]
Description=Daily ChurnVision backup

[Timer]
OnCalendar=*-*-* 02:00:00
Persistent=true

[Install]
WantedBy=timers.target
```

Enable:

```bash
sudo systemctl enable --now churnvision-backup.timer
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `POSTGRES_USER` | `churnvision` | Database username |
| `POSTGRES_PASSWORD` | (required) | Database password |
| `POSTGRES_DB` | `churnvision` | Database name |
| `POSTGRES_HOST` | `localhost` | Database host (for direct backup) |
| `POSTGRES_PORT` | `5432` | Database port |
| `DB_CONTAINER_NAME` | `churnvision-db` | Docker container name |
| `BACKUP_RETENTION` | `30` | Days to keep backups |

## Backup Storage Recommendations

1. **Local backups**: Store in `./backups/` (gitignored)
2. **Remote backups**: Copy to external storage (NAS, S3-compatible, etc.)
3. **Encryption**: For sensitive data, encrypt backups:
   ```bash
   # Encrypt
   gpg --symmetric --cipher-algo AES256 backup.sql.gz

   # Decrypt
   gpg --decrypt backup.sql.gz.gpg > backup.sql.gz
   ```

## Disaster Recovery

### Complete Recovery Steps

1. **Stop the application**
   ```bash
   docker compose -f docker-compose.prod.yml down
   ```

2. **Start only the database**
   ```bash
   docker compose -f docker-compose.prod.yml up -d db
   ```

3. **Wait for DB to be healthy**
   ```bash
   docker compose -f docker-compose.prod.yml exec db pg_isready
   ```

4. **Restore from backup**
   ```bash
   ./infra/backup/restore.sh ./backups/churnvision_YYYYMMDD_HHMMSS.sql.gz
   ```

5. **Run migrations** (if needed)
   ```bash
   docker compose -f docker-compose.prod.yml exec backend alembic upgrade head
   ```

6. **Start all services**
   ```bash
   docker compose -f docker-compose.prod.yml up -d
   ```

7. **Verify health**
   ```bash
   curl http://localhost:8000/health
   ```
