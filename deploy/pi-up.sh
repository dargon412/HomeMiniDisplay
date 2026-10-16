#!/usr/bin/env bash
#
# Bring the Home Dashboard and its Tailscale Funnel back up.
#
# Safe to run any time. Most useful right after a reboot if the dashboard is
# not responding. See docs/PI-CHEATSHEET.md.
#
set -u

say() { printf '\n== %s ==\n' "$*"; }

say "Home Dashboard server"
sudo systemctl enable --now home-dashboard
sudo systemctl restart home-dashboard
systemctl --no-pager --lines=0 status home-dashboard || true

say "Tailscale"
sudo tailscale up
sudo tailscale funnel --bg 8080

say "Funnel status"
tailscale funnel status || true

say "All set"
echo "Open the https://... URL above, or http://<pi-ip>:8080 on the LAN."
