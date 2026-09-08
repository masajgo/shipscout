#!/usr/bin/env python3
"""ShipScout local system health monitor.
Checks launchd jobs, Next.js process, and system logs.
Sends a Resend alert email if any issues are found.
"""

import datetime
import json
import os
import re
import subprocess
import urllib.request

SCRIPT_DIR  = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(SCRIPT_DIR)
ENV_FILE    = os.path.join(PROJECT_DIR, ".env.local")

# ── Load .env.local ───────────────────────────────────────────────────────────
env: dict[str, str] = {}
if os.path.exists(ENV_FILE):
    with open(ENV_FILE) as fh:
        for line in fh:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, val = line.partition("=")
            env[key.strip()] = val.strip().strip('"').strip("'")

RESEND_KEY   = env.get("RESEND_API_KEY", "")
ALERT_FROM   = "info@turqomarine.com"
ALERT_TO     = "ardavcioglu@gmail.com"
LAUNCHD_JOBS = ["com.shipscout.ownerscan", "com.shipscout.weeklyrefresh"]

issues:     list[str] = []
actions:    list[str] = []
healthy:    list[str] = []
log_errors: list[str] = []

# ── Check launchd jobs ────────────────────────────────────────────────────────
for job in LAUNCHD_JOBS:
    r = subprocess.run(["launchctl", "list", job], capture_output=True, text=True)
    if r.returncode != 0 or not r.stdout.strip():
        issues.append(f"{job} is not loaded")
        restart = subprocess.run(["launchctl", "start", job], capture_output=True, text=True)
        if restart.returncode == 0:
            actions.append(f"Restarted {job}")
        else:
            err = restart.stderr.strip() or "unknown error"
            actions.append(f"Could not restart {job}: {err}")
    else:
        try:
            info   = json.loads(r.stdout)
            status = info.get("LastExitStatus", 0)
        except (json.JSONDecodeError, ValueError):
            match  = re.search(r'"LastExitStatus"\s*=\s*(-?\d+)', r.stdout)
            status = int(match.group(1)) if match else 0
        if status == 0:
            healthy.append(f"{job} running (OK)")
        else:
            issues.append(f"{job} last exit status: {status}")

# ── Check Next.js :3000 ───────────────────────────────────────────────────────
lsof = subprocess.run(["lsof", "-i", ":3000"], capture_output=True, text=True)
if "LISTEN" in lsof.stdout:
    healthy.append("Next.js listening on :3000")
else:
    issues.append("Next.js not listening on :3000")

# ── Check recent ownerscan log errors ─────────────────────────────────────────
try:
    log_r = subprocess.run(
        ["log", "show", "--predicate", 'process == "ownerscan"', "--last", "1h"],
        capture_output=True, text=True, timeout=20,
    )
    log_errors = [
        ln for ln in log_r.stdout.splitlines()
        if re.search(r"\b(error|crash|SIGABRT|SIGSEGV|exception|fault)\b", ln, re.I)
        and not ln.startswith("Filtering")
    ]
    if log_errors:
        issues.append(f"ownerscan: {len(log_errors)} error line(s) in last hour")
except subprocess.TimeoutExpired:
    pass

# ── Send alert email via Resend ───────────────────────────────────────────────
now = datetime.datetime.now().strftime("%Y-%m-%d %H:%M")

if issues and RESEND_KEY:
    lines = [f"ShipScout Health Monitor — {now}", ""]
    lines += [f"ISSUES ({len(issues)}):"] + [f"  • {i}" for i in issues]
    if actions:
        lines += ["", "ACTIONS TAKEN:"] + [f"  • {a}" for a in actions]
    if healthy:
        lines += ["", "HEALTHY:"] + [f"  • {h}" for h in healthy]
    if log_errors:
        lines += ["", "LOG ERRORS (last 5):"] + [f"  {ln}" for ln in log_errors[-5:]]

    payload = json.dumps({
        "from":    f"ShipScout Monitor <{ALERT_FROM}>",
        "to":      [ALERT_TO],
        "subject": f"[ShipScout] {len(issues)} issue(s) detected — {now}",
        "text":    "\n".join(lines),
    }).encode()

    try:
        req = urllib.request.Request(
            "https://api.resend.com/emails",
            data=payload,
            headers={
                "Authorization": f"Bearer {RESEND_KEY}",
                "Content-Type":  "application/json",
            },
            method="POST",
        )
        urllib.request.urlopen(req, timeout=10)
    except Exception as exc:
        print(f"Alert send failed: {exc}")

# ── Report heartbeat to /api/health ──────────────────────────────────────────
CRON_SECRET = env.get("CRON_SECRET", "")
if CRON_SECRET:
    hb_payload = json.dumps({
        "agent_name": "local-healthmonitor",
        "status":     "ok" if not issues else "degraded",
        "message":    "; ".join(issues[:3]) + ("…" if len(issues) > 3 else "") if issues else "all clear",
    }).encode()
    try:
        hb_req = urllib.request.Request(
            "https://shipscout.io/api/health",
            data=hb_payload,
            headers={"x-cron-secret": CRON_SECRET, "Content-Type": "application/json"},
            method="POST",
        )
        urllib.request.urlopen(hb_req, timeout=10)
    except Exception as exc:
        print(f"Heartbeat failed: {exc}")

# ── Console summary ───────────────────────────────────────────────────────────
status = "ISSUES" if issues else "OK"
print(f"{now} [{status}] issues={len(issues)} fixed={len(actions)} healthy={len(healthy)}")
for msg in issues:
    print(f"  ISSUE: {msg}")

raise SystemExit(1 if issues else 0)
