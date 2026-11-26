#!/usr/bin/env python3
"""What's new: the app's changelog, made from the repo's history when the app (or the website) is built.

Same file in both repos: tools/build_changelog.py (public MRT Spotter) and android/tools/build_changelog.py (MRT Dev).

Where the changes come from
  Every change is a commit, and its first line already says what changed in plain words (AGENTS.md), so that line,
  tidied up, is the change's line. A commit can say it differently for the changelog with a line in its message:
      Changelog: Trains at unusual hours show on every line
  or leave itself out with "Changelog: skip". Commits that only touch other files (tests, data) are left out, and so
  are lines about tests, checks and builds. --public also leaves out anything about MRT Dev or its features.

Which version each change shipped in
  After publishing, each build records its version on the commit it built, as a git note in refs/notes/versions
  (one line per build; nothing in the code or the tags changes). The changes between two built commits are the later
  one's. --backfill fills in the notes for builds made before this existed, from the repo's own Actions history.

  python3 build_changelog.py --paths web tools .github/workflows/build-android.yml --public \
      --version 2026.11.25-1600 --out changelog.js --notes release-notes.md

  --version  this build's version (its commit isn't recorded yet). Without it (the website), changes since the
             newest build are listed as "Latest".
"""
import argparse, json, os, re, subprocess, sys
from datetime import datetime, timedelta, timezone

SGT = timezone(timedelta(hours=8))
NOTES = "refs/notes/versions"
NEWEST_TT = "Newest LTA train timetable"
FIXES = "Small fixes and improvements"

# whole commits that aren't changes anyone using the app would notice
SKIP = re.compile(r"^(merge\b|revert\b|update lta (train )?timetable|add files via upload|delete |create |initial commit"
                  r"|update [\w./-]+$|manual (re)?build|trigger|rebuild\b|bump\b|wip\b)", re.I)
# parts of a line (split at ";") about how the app is built and checked, not what it does
TECH = re.compile(r"\b(tests?(?! (trains?|mode|movements?|runs?))|testing|regression|ci|workflows?|checks?|deploys?|re-?runs?|(re)?builds?|lint|ya?ml|syntax"
                  r"|refactor|agents\.md|readme|claude\.md|artifacts?|release assets?|draft|safety job|gradle|signing|keystore"
                  r"|token|secrets?|debug|logging|assert|fixture|mocks?)\b", re.I)
# public app: nothing about MRT Dev or the features still being tried there (AGENTS.md)
DEV = re.compile(r"\b(dev|devs|developer\w*|future (rail|lines?|stations?|mrt|routes?)|skytrain|ops lab|operations lab|test mode"
                 r"|drive mode|game|gtfs lab|gtfs analysis|diagnostics?|simulat\w*|experiment\w*|ura coverage|hidden|dormant"
                 r"|production|parity|feature flags?|gat(ed|ing))\b", re.I)
NAMES = re.compile(r"\s*[\[(](claude|chatgpt|grok|cursor|codex|gemini|copilot|mrt dev( only)?|from mrt dev|skip ci|#\d+)[\])]\s*", re.I)
PREFIX = re.compile(r"^(fix|feat|refactor|style|chore|perf|docs|build|ci|test|ui|ux)(\([^)]*\))?!?:\s*", re.I)


# notes are small commits of their own; on the build machine nobody has set a git name
ENV = dict(os.environ)
for k, v in (("GIT_AUTHOR_NAME", "MRT changelog"), ("GIT_COMMITTER_NAME", "MRT changelog"),
             ("GIT_AUTHOR_EMAIL", "changelog@users.noreply.github.com"), ("GIT_COMMITTER_EMAIL", "changelog@users.noreply.github.com")):
    ENV.setdefault(k, v)


def git(*a, check=True):
    return subprocess.run(["git", *a], capture_output=True, text=True, check=check, env=ENV).stdout


def tidy(subject, public):
    s = NAMES.sub(" ", subject).strip()
    s = PREFIX.sub("", s).strip()
    parts = [p.strip() for p in re.split(r";\s+", s) if p.strip()]
    parts = [p for p in parts if not TECH.search(p) and not (public and DEV.search(p))]
    s = "; ".join(parts)
    s = re.sub(r"\s+", " ", s).strip(" .;:,-–—")
    return s[:1].upper() + s[1:] if s else ""


def ver_time(v):
    """2026.11.25-1600(-dev) → a sortable key."""
    m = re.match(r"(\d{4})\.(\d\d)\.(\d\d)-(\d\d)(\d\d)", v or "")
    return "".join(m.groups()) if m else ""


def ver_date(v):
    k = ver_time(v)
    return f"{k[:4]}-{k[4:6]}-{k[6:8]}" if k else ""


def read_notes():
    """{commit: [versions]} from refs/notes/versions."""
    out = {}
    for line in git("notes", f"--ref={NOTES}", "list", check=False).splitlines():
        blob, commit = line.split()
        vs = [x.strip() for x in git("cat-file", "-p", blob).splitlines() if ver_time(x.strip())]
        if vs:
            out[commit] = vs
    return out


def backfill(workflow, step, suffix):
    """Notes for builds made before builds recorded their version: from this repo's successful Actions runs on main.
    A build's version is the Singapore time its build step started, as the build itself works it out."""
    repo = os.environ.get("GH_REPO") or os.environ.get("GITHUB_REPOSITORY")
    if not repo:
        print("backfill: no GH_REPO", file=sys.stderr); return 0
    have = read_notes()
    def api(path):
        r = subprocess.run(["gh", "api", "--paginate", path], capture_output=True, text=True)
        if r.returncode:
            raise RuntimeError(r.stderr.strip()[:300])
        # --paginate joins pages of JSON objects; read them one after another
        dec, i, objs, t = json.JSONDecoder(), 0, [], r.stdout
        while i < len(t):
            while i < len(t) and t[i].isspace(): i += 1
            if i >= len(t): break
            o, i = dec.raw_decode(t, i); objs.append(o)
        return objs
    runs = [r for page in api(f"repos/{repo}/actions/workflows/{workflow}/runs?status=success&branch=main&per_page=100")
            for r in page.get("workflow_runs", [])]
    added = 0
    pat = re.compile(step)
    for run in runs:
        sha = run["head_sha"]
        if git("cat-file", "-t", sha, check=False).strip() != "commit":
            continue
        started = None
        for page in api(f"repos/{repo}/actions/runs/{run['id']}/jobs?per_page=100"):
            for job in page.get("jobs", []):
                if job.get("conclusion") != "success":
                    continue
                for st in job.get("steps") or []:
                    if pat.search(st.get("name") or "") and st.get("conclusion") == "success" and st.get("started_at"):
                        started = st["started_at"]
        if not started:
            continue
        t = datetime.strptime(started, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc).astimezone(SGT)
        v = t.strftime("%Y.%m.%d-%H%M") + suffix
        if v in have.get(sha, []):
            continue
        git("notes", f"--ref={NOTES}", "append", "-m", v, sha)
        have.setdefault(sha, []).append(v)
        added += 1
    print(f"backfill: {len(runs)} successful runs, {added} versions added", file=sys.stderr)
    return added


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--paths", nargs="+", required=True, help="what counts as a change to the app")
    ap.add_argument("--version", default="", help="this build's version")
    ap.add_argument("--out", help="changelog.js for the page")
    ap.add_argument("--notes", help="release notes (Markdown)")
    ap.add_argument("--public", action="store_true", help="leave out MRT Dev and its features")
    ap.add_argument("--overrides", help="JSON {commit prefix: line, or \"\" to leave it out}, for history")
    ap.add_argument("--backfill", metavar="WORKFLOW", help="fill in past builds' versions from this workflow's runs")
    ap.add_argument("--step", default=r"^Build the app$", help="the build step that works out the version")
    ap.add_argument("--suffix", default="", help="added to backfilled versions (-dev)")
    ap.add_argument("--record", action="store_true", help="record --version on HEAD (after publishing) and stop")
    ap.add_argument("--max-items", type=int, default=30)
    o = ap.parse_args()

    if o.record:
        if o.version not in read_notes().get(git("rev-parse", "HEAD").strip(), []):
            git("notes", f"--ref={NOTES}", "append", "-m", o.version, "HEAD")
        return
    if o.backfill:
        try:
            backfill(o.backfill, o.step, o.suffix)
        except Exception as e:                    # the changelog still works, by day, without it
            print(f"backfill skipped: {e}", file=sys.stderr)

    over = {}
    if o.overrides and os.path.exists(o.overrides):
        over = json.load(open(o.overrides, encoding="utf-8"))

    notes = read_notes()
    head = git("rev-parse", "HEAD").strip()
    builds = [(v, c) for c, vs in notes.items() for v in vs]
    if o.version and o.version not in notes.get(head, []):
        builds.append((o.version, head))
    builds.sort(key=lambda b: ver_time(b[0]))

    # which build each commit first shipped in
    shipped, seen = {}, set()
    for v, c in builds:
        if c in seen:
            continue                              # built again with no new changes
        for x in git("rev-list", c, *[f"^{s}" for s in seen]).split():
            shipped.setdefault(x, v)
        seen.add(c)

    entries = {}
    def entry(key, v, date):
        if key not in entries:
            entries[key] = {"v": v, "date": date, "items": [], "more": 0}
        return entries[key]
    for v, c in builds:                           # every version, even one with nothing new but the timetable
        entry(v, v, ver_date(v))

    log = git("log", "--no-merges", "--format=%H%x1f%ct%x1f%s%x1f%b%x1e", "--", *o.paths)
    for rec in log.split("\x1e"):
        if not rec.strip():
            continue
        sha, ts, subject, body = (rec.strip("\n").split("\x1f") + ["", "", "", ""])[:4]
        m = re.search(r"^changelog:\s*(.+)$", body, re.I | re.M)
        text = None
        for k, val in over.items():
            if sha.startswith(k):
                text = val
        if text is None and m:
            text = "" if m.group(1).strip().lower() in ("skip", "none", "-") else m.group(1).strip()
        if text is None:
            text = "" if SKIP.match(subject.strip()) else tidy(subject, o.public)
        day = datetime.fromtimestamp(int(ts), SGT).strftime("%Y-%m-%d")
        v = shipped.get(sha)
        e = entry(v, v, ver_date(v)) if v else entry("latest", None, day)
        if not text:
            e["fixes"] = True
            continue
        if text in e["items"]:
            continue
        if len(e["items"]) < o.max_items:
            e["items"].append(text)
        else:
            e["more"] += 1
    for e in entries.values():
        if not e["items"]:                        # nothing to say: small fixes, or only the newest timetable
            e["items"] = [FIXES if e.get("fixes") else NEWEST_TT]
        e.pop("fixes", None)
        if e["more"]:
            e["items"].append(f"…and {e['more']} more change{'s' if e['more'] > 1 else ''}")
        del e["more"]
    out = sorted(entries.values(), key=lambda e: (e["v"] is None, ver_time(e["v"]) or e["date"]), reverse=True)
    if "latest" in entries:                       # the website's changes since the newest app build go first
        out.remove(entries["latest"]); out.insert(0, entries["latest"])

    if o.out:
        with open(o.out, "w", encoding="utf-8") as f:
            f.write("/* What's new: made from the repo's history by build_changelog.py when this was built. Don't edit. */\n")
            f.write("window.MRT_CHANGELOG = " + json.dumps(out, ensure_ascii=False, separators=(",", ":")) + ";\n")
            # the newest app version: the website, which is built from the same page, shows it as its own
            newest = o.version or (builds[-1][0] if builds else "")
            f.write("window.MRT_APP_VERSION = " + json.dumps(newest) + ";\n")
    if o.notes:
        def label(e):
            d = datetime.strptime(e["date"], "%Y-%m-%d").strftime("%-d %b %Y")
            return f"{e['v']} · {d}" if e["v"] else f"Latest · {d}"
        md, size = [], 0
        for i, e in enumerate(out):
            block = ([f"### What's new in {label(e)}", ""] if i == 0 else [f"**{label(e)}**", ""]) + \
                    [f"- {x}" for x in e["items"]] + [""]
            if i == 1:
                block = ["### Every version", ""] + block
            size += sum(len(x) + 1 for x in block)
            if size > 110000:                     # GitHub's release notes limit is 125,000 characters
                md += [f"…and {len(out) - i} older versions: the app lists them all (Settings → What's new).", ""]
                break
            md += block
        with open(o.notes, "w", encoding="utf-8") as f:
            f.write("\n".join(md))
    print(f"changelog: {len(out)} versions, {sum(len(e['items']) for e in out)} lines", file=sys.stderr)


if __name__ == "__main__":
    main()
