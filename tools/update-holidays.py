#!/usr/bin/env python3
"""
Refresh holidays.json from the official HK public-holiday calendar.

The 1823 iCal endpoint (https://www.1823.gov.hk/common/ical/gc/tc.ics) sends no
CORS header, so the browser cannot fetch it directly. We bundle the parsed
result as `holidays.json`, served same-origin. The optional Pi server can also
refresh it live via /api/holidays.

Run this when a new year's holidays are gazetted:

    python3 tools/update-holidays.py

No dependencies (standard library only).
"""

import json
import os
import re
import urllib.request

URL = "https://www.1823.gov.hk/common/ical/gc/tc.ics"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "holidays.json")


def unfold(text):
    """RFC 5545 line folding: a line starting with space/tab continues the last."""
    return re.sub(r"\r?\n[ \t]", "", text)


def parse(ics):
    out = {}
    for block in re.findall(r"BEGIN:VEVENT(.*?)END:VEVENT", ics, re.S):
        m = re.search(r"DTSTART;VALUE=DATE:(\d{8})", block)
        s = re.search(r"SUMMARY:(.*)", block)
        if not m or not s:
            continue
        d = m.group(1)
        key = "%s-%s-%s" % (d[0:4], d[4:6], d[6:8])
        out[key] = s.group(1).strip()
    return out


def main():
    with urllib.request.urlopen(URL, timeout=30) as r:
        ics = r.read().decode("utf-8")
    data = parse(unfold(ics))
    if not data:
        raise SystemExit("No holidays parsed - did the 1823 format change?")
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(dict(sorted(data.items())), f, ensure_ascii=False, indent=1)
        f.write("\n")
    years = sorted({k[:4] for k in data})
    print("wrote %d holidays (%s) -> %s" % (len(data), ", ".join(years), OUT))


if __name__ == "__main__":
    main()
