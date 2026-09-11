#!/usr/bin/env python3
"""
Stop hook: enforces the "deploy action + breaking-change verdict" rule from
memory/feedback_deployment_actions.md and feedback_backend_breaking_changes.md.

That rule has been missed 5+ times across sessions despite being documented
in memory — memory is advisory, not enforced. This hook makes it mechanical:
if server/, moby/, or frontend/ have uncommitted changes when a turn tries to
stop, the final assistant message must mention the matching deploy action
(and, for server/, a breaking-change verdict) or the stop is blocked.

Heuristic, deliberately biased toward firing: checks `git status` for
uncommitted changes under each directory (not "changed this turn" — that's
not cheaply knowable from a Stop hook), and does a keyword scan of the last
assistant text block, not real semantic understanding. A false-positive nudge
is far cheaper than a 6th silent miss.
"""
import json
import re
import subprocess
import sys

REPO = "/Users/apoorvjin/markets-with-monysa"

def read_stdin_json():
    try:
        return json.load(sys.stdin)
    except Exception:
        return {}

def last_assistant_text(transcript_path):
    if not transcript_path:
        return None
    text = None
    try:
        with open(transcript_path, "r") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    d = json.loads(line)
                except Exception:
                    continue
                if d.get("type") != "assistant":
                    continue
                content = (d.get("message") or {}).get("content", [])
                if not isinstance(content, list):
                    continue
                for c in content:
                    if isinstance(c, dict) and c.get("type") == "text":
                        text = c.get("text")
    except Exception:
        return None
    return text

def changed_dirs():
    try:
        out = subprocess.run(
            ["git", "-C", REPO, "status", "--porcelain", "--", "server", "moby", "frontend"],
            capture_output=True, text=True, timeout=10,
        ).stdout
    except Exception:
        return set()
    dirs = set()
    for line in out.splitlines():
        path = line[3:].strip()
        if path.startswith("server/"):
            dirs.add("server")
        elif path.startswith("moby/"):
            dirs.add("moby")
        elif path.startswith("frontend/"):
            dirs.add("frontend")
    return dirs

def main():
    payload = read_stdin_json()
    dirs = changed_dirs()
    if not dirs:
        sys.exit(0)  # nothing relevant uncommitted — no opinion

    text = last_assistant_text(payload.get("transcript_path"))
    if text is None:
        sys.exit(0)  # can't read the transcript — fail open, don't block blind

    low = text.lower()
    missing = []

    if "server" in dirs:
        has_deploy = any(k in low for k in ("fly deploy", "no deploy", "already deployed", "no backend deploy"))
        has_breaking = "breaking" in low and "**" in text
        if not has_deploy:
            missing.append('server/ changed — no deploy action stated (expected "fly deploy" or an explicit "no deploy needed")')
        if not has_breaking:
            missing.append('server/ changed — no BOLDED breaking-change verdict found (expected "**Breaking**"/"**Non-breaking**" or similar, stated in bold)')

    if "frontend" in dirs:
        has_deploy = any(k in low for k in ("deploy_web.sh", "deploy_site.sh", "vercel", "no deploy needed", "no frontend deploy"))
        if not has_deploy:
            missing.append('frontend/ changed — no deploy action stated (expected "./deploy_web.sh", "./deploy_site.sh", or an explicit "no deploy needed")')

    if "moby" in dirs:
        mobile_keywords = (
            "flutter run", "hot restart", "build_dev_release", "build_release.sh",
            "build_testflight", "flutter pub get", "pod install", "no rebuild needed",
            "no action needed",
        )
        has_deploy = any(k in low for k in mobile_keywords)
        if not has_deploy:
            missing.append('moby/ changed — no mobile rebuild/action stated (expected e.g. "hot restart", "./build_dev_release.sh", "./build_testflight.sh", or an explicit "no rebuild needed")')

    if missing:
        reason = (
            "Blocking stop: server/moby/frontend files have uncommitted changes but the last "
            "message is missing required deploy-scope info (feedback_deployment_actions.md / "
            "feedback_backend_breaking_changes.md — missed 5+ times already). Add to your response:\n"
            + "\n".join(f"- {m}" for m in missing)
        )
        print(json.dumps({"decision": "block", "reason": reason}))
        sys.exit(0)

    sys.exit(0)

if __name__ == "__main__":
    main()
