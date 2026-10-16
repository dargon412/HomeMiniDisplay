#!/usr/bin/env bash
#
# Back up the shared events + weights to Google Drive with rclone.
#
# Runs daily from deploy/home-dashboard-backup.timer, or by hand.
# One-time rclone setup: see docs/BACKUP-GOOGLE-DRIVE.md
#
# Env overrides (e.g. in the systemd unit):
#   HD_DRIVE_REMOTE     rclone remote name    (default: gdrive)
#   HD_DRIVE_FOLDER     folder in the remote  (default: HomeDashboard/backups)
#   HD_DRIVE_KEEP_DAYS  days of history       (default: 30)
#
set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
STATE="$REPO/server/data/state.json"
REMOTE="${HD_DRIVE_REMOTE:-gdrive}"
FOLDER="${HD_DRIVE_FOLDER:-HomeDashboard/backups}"
KEEP_DAYS="${HD_DRIVE_KEEP_DAYS:-30}"

log() { echo "[$(date '+%F %T')] $*"; }

if [ ! -f "$STATE" ]; then
  log "no state file at $STATE - nothing to back up yet"
  exit 0
fi

if ! command -v rclone >/dev/null 2>&1; then
  log "rclone is not installed - see docs/BACKUP-GOOGLE-DRIVE.md"
  exit 1
fi

if ! rclone listremotes | grep -qx "${REMOTE}:"; then
  log "rclone remote '${REMOTE}:' is not configured - see docs/BACKUP-GOOGLE-DRIVE.md"
  exit 1
fi

DEST="${REMOTE}:${FOLDER}"
STAMP="$(date '+%F_%H%M')"

log "uploading state.json -> ${DEST}/state-${STAMP}.json"
rclone copyto "$STATE" "${DEST}/state-${STAMP}.json" --no-traverse
rclone copyto "$STATE" "${DEST}/latest.json" --no-traverse

log "pruning backups older than ${KEEP_DAYS} days"
rclone delete "${DEST}" --min-age "${KEEP_DAYS}d" --include "state-*.json"

log "done"
