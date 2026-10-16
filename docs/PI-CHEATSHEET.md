# Pi cheat sheet

Everything you might need after a reboot, in one page. The full setup is in
[`DEPLOY-PI.md`](DEPLOY-PI.md).

## After a reboot: normally nothing to do

These all start by themselves:

| Thing | Why it comes back |
|---|---|
| The dashboard server | `home-dashboard.service` is **enabled** |
| Tailscale | the `tailscaled` service starts on boot |
| The public Funnel | the Funnel config is stored by Tailscale and restored |

Just open your `https://<pi>.<tailnet>.ts.net/` URL. If it works, you are done.

## If it is not responding: one command

```bash
~/HomeMiniDisplay/deploy/pi-up.sh
```

That starts + restarts the server, brings Tailscale up, re-enables the Funnel,
and prints the URL. It is safe to run any time.

## Check what is going on

```bash
systemctl status home-dashboard          # is the server running?
tailscale status                         # is Tailscale connected?
tailscale funnel status                  # what is the public URL?
journalctl -u home-dashboard -n 50       # last 50 server log lines
```

## Update to the latest version

```bash
cd ~/HomeMiniDisplay
git pull
sudo systemctl restart home-dashboard
```

Then reload the page (the version shows bottom-left).

## Google Drive backup

Backs up the shared **events + weights** (`server/data/state.json`) daily.

```bash
systemctl list-timers home-dashboard-backup.timer   # when is the next run?
sudo systemctl start home-dashboard-backup.service  # run a backup right now
journalctl -u home-dashboard-backup -n 30           # did it work?
rclone lsf gdrive:HomeDashboard/backups             # list the files on Drive
```

One-time setup: [`BACKUP-GOOGLE-DRIVE.md`](BACKUP-GOOGLE-DRIVE.md).

### Restore a backup

```bash
cd ~/HomeMiniDisplay
rclone copy gdrive:HomeDashboard/backups/state-2026-10-16_0330.json server/data/
sudo systemctl restart home-dashboard
```

## Common fixes

| Symptom | Do this |
|---|---|
| Nothing loads at all | `~/HomeMiniDisplay/deploy/pi-up.sh` |
| Funnel URL is dead | `sudo tailscale funnel --bg 8080` |
| Server is stopped | `sudo systemctl restart home-dashboard` |
| "No password set yet" in the log | `cd ~/HomeMiniDisplay && python3 server/server.py --set-password` |
| Backup says "rclone remote not configured" | redo [`BACKUP-GOOGLE-DRIVE.md`](BACKUP-GOOGLE-DRIVE.md) |
| Changed the unit files | `sudo systemctl daemon-reload` then restart |

## Handy paths

```
~/HomeMiniDisplay/                       the code (git clone)
~/HomeMiniDisplay/server/data/           your real data + secrets (NOT in git)
~/HomeMiniDisplay/server/data/state.json events + weights (the shared data)
~/.config/rclone/rclone.conf             Google Drive credentials (NOT in git)
```
