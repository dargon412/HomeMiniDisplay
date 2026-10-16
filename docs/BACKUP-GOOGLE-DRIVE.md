# Auto-backup to Google Drive

Backs up the shared **calendar events + parrot weights** from the Pi to your own
Google Drive every day, keeping 30 days of history. It uses **rclone** (free).

```
Pi: ~/HomeMiniDisplay/server/data/state.json
        │  rclone (daily 03:30)
        ▼
Google Drive:  HomeDashboard/backups/
                 state-2026-10-16_0330.json
                 state-2026-10-17_0330.json
                 latest.json
```

> This backs up the **shared** data only (events + weights). Per-device settings
> are not on the Pi — export those from the app with ⚙️ → 匯出備份.

---

## Step 1 — Install rclone on the Pi

```bash
sudo apt update
sudo apt install -y rclone
rclone version        # should print a version
```

---

## Step 2 — Authorise Google Drive (on your Mac)

rclone needs a one-time browser sign-in. Easiest is to do it on a computer with a
browser (your Mac), then copy the credentials to the Pi.

### 2a. Install rclone on the Mac

```bash
brew install rclone
```

(No Homebrew? Download the macOS zip from <https://rclone.org/downloads/> and
unzip it.)

### 2b. Create the remote

Run on the **Mac**:

```bash
rclone config
```

Answer the prompts:

| Prompt | Answer |
|---|---|
| `n) New remote` | `n` |
| `name>` | `gdrive` |
| `Storage>` | `drive` (Google Drive) |
| `client_id>` | *(leave blank, just Enter)* |
| `client_secret>` | *(leave blank)* |
| `scope>` | `1` (full access) |
| `root_folder_id>` | *(blank)* |
| `service_account_file>` | *(blank)* |
| `Edit advanced config?` | `n` |
| `Use auto config?` | `y` — a browser opens; sign in and **Allow** |
| `Configure this as a Shared Drive?` | `n` |
| `Keep this "gdrive" remote?` | `y` |
| quit | `q` |

### 2c. Copy the credentials to the Pi

The Mac now has the file `~/.config/rclone/rclone.conf`. Copy it over:

```bash
ssh pi@<pi-ip> 'mkdir -p ~/.config/rclone'
scp ~/.config/rclone/rclone.conf pi@<pi-ip>:~/.config/rclone/rclone.conf
ssh pi@<pi-ip> 'chmod 600 ~/.config/rclone/rclone.conf'
```

> **No `scp`?** On the Pi run `rclone config`, make the `gdrive` remote, and at
> `Use auto config?` answer `n`. It prints a command like
> `rclone authorize "drive"` — run that on the Mac, sign in, then paste the token
> it shows back into the Pi.

---

## Step 3 — Test it

On the **Pi**:

```bash
rclone copyto ~/HomeMiniDisplay/server/data/state.json gdrive:HomeDashboard/backups/test.json
rclone lsf gdrive:HomeDashboard/backups
```

You should see `test.json` listed. Delete it if you like:

```bash
rclone delete gdrive:HomeDashboard/backups/test.json
```

---

## Step 4 — Turn on the daily timer

```bash
cd ~/HomeMiniDisplay
sudo cp deploy/home-dashboard-backup.service /etc/systemd/system/
sudo cp deploy/home-dashboard-backup.timer   /etc/systemd/system/
# If your username is not "pi", edit User= in the .service first:
sudo nano /etc/systemd/system/home-dashboard-backup.service
sudo systemctl daemon-reload
sudo systemctl enable --now home-dashboard-backup.timer
```

Run one backup now to be sure:

```bash
sudo systemctl start home-dashboard-backup.service
journalctl -u home-dashboard-backup -n 30
```

---

## Step 5 — Check it any time

```bash
systemctl list-timers home-dashboard-backup.timer   # next run
rclone lsf gdrive:HomeDashboard/backups             # files on Drive
journalctl -u home-dashboard-backup -n 30           # last run's log
```

---

## Restore a backup

```bash
cd ~/HomeMiniDisplay
rclone copy gdrive:HomeDashboard/backups/state-2026-10-16_0330.json server/data/
sudo systemctl restart home-dashboard
```

(Use `latest.json` instead of a dated file to restore the most recent one. After
restoring, every device picks up the change within ~15 seconds.)

---

## Changing the settings

Edit `deploy/home-dashboard-backup.service` and add `Environment=` lines, then
`sudo systemctl daemon-reload`:

| Variable | Default | Meaning |
|---|---|---|
| `HD_DRIVE_REMOTE` | `gdrive` | rclone remote name |
| `HD_DRIVE_FOLDER` | `HomeDashboard/backups` | folder inside the remote |
| `HD_DRIVE_KEEP_DAYS` | `30` | how many days of backups to keep |

To change the time, edit `OnCalendar=` in
`deploy/home-dashboard-backup.timer` (e.g. `*-*-* 21:00:00`) and reload.

---

## Troubleshooting

| Message | Fix |
|---|---|
| `rclone is not installed` | Step 1 |
| `rclone remote 'gdrive:' is not configured` | redo Step 2 |
| Google says "rclone wants access" every run | the token expired; redo Step 2 |
| Timer ran but no file on Drive | `journalctl -u home-dashboard-backup -n 50` for the error |

---

## Security

- The Google credentials live in `~/.config/rclone/rclone.conf` on the Pi and Mac,
  **never in the repo** (it is outside the project folder).
- Backups go to your **private** Google Drive.
- The scripts in `deploy/` contain no secrets and are safe to commit.
