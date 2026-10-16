# Deploy on a Raspberry Pi (shared data + remote access)

This turns a Raspberry Pi at home into the dashboard host, so your tablet, your
phone and your wife's phone all see **the same** calendar events and parrot
weights — and you can reach it from outside the house, **without installing any
app on the phones** and **without paying for anything**.

**Settings are per-device.** Bus stops, roster, layout, fonts and colours stay
on each device; only events and weights are shared.

> **After a reboot you normally do nothing** — everything auto-starts. If
> something is not responding, run `~/HomeMiniDisplay/deploy/pi-up.sh`. See the
> one-page [`PI-CHEATSHEET.md`](PI-CHEATSHEET.md).
>
> **Daily Google Drive backup** of events + weights:
> [`BACKUP-GOOGLE-DRIVE.md`](BACKUP-GOOGLE-DRIVE.md).

The Pi is behind a **fake IP (CGNAT)**, so a normal port-forward will not work.
Instead we use **Tailscale Funnel**, which makes the Pi open an *outbound*
connection and gives it a public HTTPS address. No app is needed on the phones.

```
phone / tablet  ──https──►  Tailscale Funnel  ──►  Raspberry Pi
 (browser only)              (public relay)         ├─ server.py
                                                     └─ server/data/state.json
```

> The dashboard is still the same static site. The Pi only adds a tiny server
> that (a) serves the files, (b) stores one shared copy of the data, and
> (c) asks for a password once. On GitHub Pages the same files keep working
> with local-only storage.

---

## What you need

- A Raspberry Pi with **Raspberry Pi OS** (Desktop or Lite both fine) and
  internet. A Pi 3/4/5/Zero 2 W all work — it is very light.
- A **Tailscale account** (free): <https://tailscale.com> — sign in with Google
  or GitHub. Only the *Pi* joins the network; the phones do not.
- Your phone/tablet on the same Wi-Fi for the first test.

---

## Step 1 — Get the Pi ready

Flash Raspberry Pi OS with Raspberry Pi Imager, boot it, and either use the
desktop or connect over SSH. Then:

```bash
sudo apt update && sudo apt full-upgrade -y
sudo apt install -y git python3
```

(`python3` is already present on Raspberry Pi OS; the command is harmless.)

---

## Step 2 — Download the dashboard

```bash
cd ~
git clone https://github.com/dargon412/HomeMiniDisplay.git
cd HomeMiniDisplay
```

---

## Step 3 — Set a password

The public Funnel address means **anyone who finds the URL sees a login page**,
so pick a decent password. It is stored only as a hash in `server/data/`
(which is git-ignored and never committed):

```bash
python3 server/server.py --set-password
```

You will be asked to type it twice.

---

## Step 4 — Test on the home network

Start it by hand first:

```bash
python3 server/server.py
```

It prints something like `serving ... on http://127.0.0.1:8080`. Now find the
Pi's LAN address:

```bash
hostname -I
```

On your tablet/phone, open `http://<that-ip>:8080/` — but first allow LAN access
by starting it bound to all interfaces:

```bash
HD_BIND=0.0.0.0 python3 server/server.py
```

You should get the login page, then the dashboard. Enter your password once and
it will remember you.

> On plain `http://` LAN the browser's GPS will not work (that needs HTTPS).
> Pick the weather district manually in ⚙️ → 基本. Over Funnel (Step 6) GPS
> works because it is HTTPS.

Press `Ctrl-C` to stop it.

---

## Step 5 — Run it automatically (systemd)

```bash
sudo cp deploy/home-dashboard.service /etc/systemd/system/home-dashboard.service
sudo nano /etc/systemd/system/home-dashboard.service   # check User= and paths
sudo systemctl daemon-reload
sudo systemctl enable --now home-dashboard
sudo systemctl status home-dashboard        # should say active (running)
```

If your username is not `pi`, edit `User=` and the two `WorkingDirectory=` /
`ExecStart=` paths in the unit file first. To make the server reachable on the
LAN as well, add `Environment=HD_BIND=0.0.0.0` to the unit and restart.

---

## Step 6 — Tailscale + Funnel (remote access, no phone app)

Install Tailscale on the Pi and join your tailnet:

```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up
```

It prints a URL — open it once to authorise the Pi.

Now expose the server to the internet with **Funnel**:

```bash
sudo tailscale funnel --bg 8080
```

- The first time, Tailscale asks you to enable **Funnel** for the tailnet.
  Open the link it prints (or the admin console → **Access controls** / node
  settings) and turn it on. HTTPS certificates are enabled automatically.
- `--bg` keeps it running after you log out.

Check it:

```bash
tailscale funnel status
```

It shows your public URL, something like:

```
https://raspberrypi.tail1234.ts.net/
```

Open that on your phone **using mobile data** (Wi-Fi off) to confirm remote
access works. Log in once; the cookie keeps you logged in for a year.

Useful commands:

```bash
sudo tailscale funnel status          # show the current URL
sudo tailscale funnel --bg off        # stop sharing publicly
sudo tailscale funnel --bg 8080       # (re)enable
sudo tailscale serve --bg 8080        # private only (tailnet members), no public
```

> **Private alternative:** if you later decide you are happy to install the
> Tailscale app on the phones, use `tailscale serve` instead of `funnel`. Then
> only devices on your tailnet can reach it and the password is just a bonus.

---

## Step 7 — Point the devices at it

- **At home**, any of these work: the Funnel URL, or `http://<pi-ip>:8080/`.
- **Outside**, use the Funnel URL.

Each device logs in once. After that it is automatic.

> Tip: keep using **one** address (the Funnel HTTPS one) on every device. Then
> GPS and “add to home screen” work everywhere, and there is a single login.

---

## Updating the dashboard

```bash
cd ~/HomeMiniDisplay
git pull
sudo systemctl restart home-dashboard
```

Then reload the page (the header shows the version bottom-left).

Public holidays come from the official 1823 calendar. The server refreshes them
at most once a week and caches them in `server/data/holidays.json`. The bundled
`holidays.json` in the repo is the fallback for GitHub Pages; refresh it when a
new year is gazetted:

```bash
python3 tools/update-holidays.py
git add holidays.json && git commit -m "Update public holidays" && git push
```

---

## Backup

The shared data is a single file:

```
~/HomeMiniDisplay/server/data/state.json
```

Copy it somewhere safe now and then. You can also use **⚙️ → 備份 → 匯出備份**
from any device, which produces the same combined `home-dashboard-backup.json`.

To restore onto a fresh Pi, just put `state.json` back in `server/data/`.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `No password set yet` | run `python3 server/server.py --set-password` |
| Login page loads but password rejected | re-run `--set-password` |
| `tailscale funnel` says Funnel is disabled | enable it in the admin console (link it prints) |
| Funnel URL loads but dashboard is stale | `git pull` + `sudo systemctl restart home-dashboard` |
| Other devices do not see changes | make sure they are on the **same** URL and logged in; sync polls every 15 s |
| “未啟用” in ⚙️ → 同步 | that device is on GitHub Pages or not logged in — it is local-only |
| Port already in use | change `Environment=HD_PORT=` in the unit file |

---

## Security notes (please read)

- The Funnel URL is **public**. The password is the only gate — keep it strong.
- Failed logins are rate-limited (8 tries / 5 minutes / IP).
- Real data, the password hash and the cookie secret live only in
  `server/data/`, which **`.gitignore` excludes** — they are never committed to
  the public repo.
- Sessions last a year. Use **⚙️ → 同步** or clear cookies to log out.
- Prefer `tailscale serve` over `funnel` if you are willing to install the
  Tailscale app on your devices — it is private and does not need a password.
